import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { useBleStore } from '@/src/store/ble';
import { useDashboardStore } from '@/src/store/dashboard';
import { useThresholdsStore } from '@/src/store/thresholds';
import { connectionMachine } from '@/src/ble/connection';
import { DashboardPoller } from '@/src/ble/dashboard-poller';
import { createMockAdapter } from '@/src/ble/mock-adapter';
import { NoAdapterState } from '@/src/components/NoAdapterState';
import { ArcGauge } from '@/src/components/ArcGauge';
import { AreaChart } from '@/src/components/AreaChart';
import { useThresholdAlerts } from '@/src/hooks/useThresholdAlerts';
import { requestNotificationPermissions } from '@/src/lib/notifications';
import type { ConnectedAdapter } from '@/src/ble/manager';

function useActiveAdapter(connectionPhase: string): ConnectedAdapter | null {
  const isConnected = connectionPhase === 'ready' || connectionPhase === 'reading';
  return isConnected ? connectionMachine.getAdapter() : null;
}

function StatusPill({
  tone,
  label,
  value,
}: {
  tone: 'live' | 'demo' | 'offline';
  label: string;
  value?: string;
}) {
  const styles = {
    live: { dot: 'bg-success', text: 'text-success', border: 'border-success/30', bg: 'bg-success-soft' },
    demo: { dot: 'bg-info', text: 'text-info', border: 'border-info/30', bg: 'bg-info-soft' },
    offline: { dot: 'bg-surface-sunken', text: 'text-text-muted', border: 'border-border-strong', bg: 'bg-surface' },
  }[tone];
  return (
    <View className={`flex-row items-center gap-2 rounded-full border px-3 py-1.5 ${styles.border} ${styles.bg}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      <Text className={`text-[10px] font-bold tracking-[2px] ${styles.text}`}>
        {label}
      </Text>
      {value && (
        <Text className={`text-[10px] ${styles.text}`} numberOfLines={1}>
          · {value}
        </Text>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Ask the navigator how tall its bar actually is rather than hard-coding a
  // guess — the floating bar's height moves with the device's safe area.
  const tabBarHeight = useBottomTabBarHeight();
  const { t } = useTranslation();
  const connectionPhase = useBleStore((s) => s.connectionPhase);
  const {
    rpm, speed, coolantTemp, fuelLevel, batteryVoltage, reset,
    rpmHistory, speedHistory, coolantTempHistory, fuelLevelHistory, batteryVoltageHistory,
  } = useDashboardStore();
  const thresholds = useThresholdsStore((s) => s.thresholds);

  const adapter = useActiveAdapter(connectionPhase);
  const [demoLoading, setDemoLoading] = useState(false);
  const pollerRef = useRef<DashboardPoller | null>(null);

  // Read from the store rather than from a local flag: the demo adapter is
  // owned by the connection machine, so every screen agrees about what is
  // connected and the assistant is told the readings are generated.
  const adapterKind = useBleStore((s) => s.adapterKind);
  const isDemo = adapterKind === 'simulated';

  useThresholdAlerts();

  useEffect(() => {
    requestNotificationPermissions().catch(() => {});
  }, []);

  useEffect(() => {
    if (!adapter) return;
    connectionMachine.startReading();
    const poller = new DashboardPoller(adapter.pid);
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
      connectionMachine.stopReading();
      reset();
    };
  }, [adapter, reset]);

  async function startDemo() {
    setDemoLoading(true);
    try {
      const mock = await createMockAdapter();
      // 'simulated' is what keeps this honest downstream: the banner below,
      // the assistant's system prompt, and hasLiveVehicleLink() all key off it.
      connectionMachine.injectAdapter(mock, 'demo-adapter', 'simulated');
    } finally {
      setDemoLoading(false);
    }
  }

  function stopDemo() {
    pollerRef.current?.stop();
    void connectionMachine.disconnect();
    reset();
  }

  const overheat = coolantTemp.value !== null && coolantTemp.value > thresholds.coolantTempMax;
  const lowBattery =
    batteryVoltage.value !== null && batteryVoltage.value < thresholds.batteryVoltageMin;
  const lowFuel = fuelLevel.value !== null && fuelLevel.value < thresholds.fuelLevelMin;
  const hasAlerts = overheat || lowBattery || lowFuel;

  if (!adapter) {
    return (
      <NoAdapterState
        title={t('dashboard.noAdapter')}
        body={t('dashboard.noAdapterHint')}
      >
        <Pressable
          onPress={() => router.push('/pair')}
          accessibilityRole="button"
          className="rounded-full bg-accent px-7 py-3.5 active:bg-accent-strong"
        >
          <Text className="text-[15px] font-bold text-on-accent">
            {t('dashboard.connectAdapter')}
          </Text>
        </Pressable>
        {/* A way to see the app work without a car.
            Kept in shipped builds deliberately: most people meet this screen
            before they own an adapter, and an app that can only be evaluated
            by buying hardware first cannot be evaluated at all — App Review
            included. Nothing here is passed off as real: the adapter enters
            the connection machine as 'simulated', which puts a DEMO pill over
            these gauges instead of the LIVE one and tells the assistant the
            readings are generated. */}
        <Pressable
          onPress={startDemo}
          disabled={demoLoading}
          accessibilityRole="button"
          accessibilityState={{ disabled: demoLoading }}
          className="mt-3 w-full items-center rounded-2xl border border-border bg-surface py-3.5 active:bg-surface-muted"
        >
          {demoLoading ? (
            <ActivityIndicator color={colors.textMuted} size="small" />
          ) : (
            <Text className="text-[15px] font-semibold text-text-secondary">
              {t('dashboard.runDemo')}
            </Text>
          )}
        </Pressable>
      </NoAdapterState>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: insets.top + 12,
        paddingBottom: 32 + tabBarHeight,
      }}
    >
      {/* Title row */}
      <View className="mb-3 flex-row items-end justify-between">
        <View>
          <Text className="text-[10px] font-semibold tracking-[3px] text-text-muted">
            {t('dashboard.brand')}
          </Text>
          <Text className="mt-1 text-2xl font-bold text-text-primary">{t('dashboard.title')}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/threshold-settings')}
          className="rounded-full border border-border bg-surface px-3 py-1.5"
        >
          <Text className="text-[10px] font-bold tracking-[2px] text-text-muted">
            {t('dashboard.thresholds')}
          </Text>
        </Pressable>
      </View>

      {/* Status pill */}
      <View className="mb-4 flex-row">
        {isDemo ? (
          <Pressable onPress={stopDemo}>
            <StatusPill tone="demo" label={t('dashboard.demoMode')} value={t('dashboard.tapToStop')} />
          </Pressable>
        ) : (
          <StatusPill tone="live" label={t('dashboard.live')} value={t('dashboard.ecuStreaming')} />
        )}
      </View>

      {/* Primary dials — the two readings you glance at while driving. */}
      <View className="mb-3 rounded-3xl border border-border bg-surface px-4 py-5">
        <View className="flex-row items-center justify-around">
          <ArcGauge
            label={t('dashboard.rpmLabel')}
            value={rpm.value}
            unit={rpm.unit || 'rpm'}
            min={0}
            max={8000}
            size={152}
            needle
            redlineFrom={6500}
            tone={
              rpm.value !== null && rpm.value > 7000
                ? colors.danger
                : rpm.value !== null && rpm.value > 5000
                  ? colors.warning
                  : colors.accent
            }
            caption="0 – 8000"
          />
          <ArcGauge
            label={t('dashboard.speedLabel')}
            value={speed.value}
            unit={speed.unit || 'km/h'}
            min={0}
            max={200}
            size={152}
            needle
            redlineFrom={160}
            tone={speed.value !== null && speed.value > 150 ? colors.danger : colors.accent}
            caption="0 – 200"
          />
        </View>
      </View>

      {/* Secondary readings. Small dials rather than numbers alone: the arc
          shows where the value sits in its range, which is the part that says
          whether it is normal. */}
      <View className="mb-3 flex-row gap-3">
        <View className="flex-1 items-center rounded-3xl border border-border bg-surface px-2 py-4">
          <ArcGauge
            label={t('dashboard.coolantLabel')}
            value={coolantTemp.value}
            unit={coolantTemp.unit || '°C'}
            min={-40}
            max={150}
            size={88}
            ticks={20}
            tone={overheat ? colors.danger : colors.accent}
          />
        </View>
        <View className="flex-1 items-center rounded-3xl border border-border bg-surface px-2 py-4">
          <ArcGauge
            label={t('dashboard.fuelLabel')}
            value={fuelLevel.value}
            unit={fuelLevel.unit || '%'}
            min={0}
            max={100}
            size={88}
            ticks={20}
            tone={lowFuel ? colors.danger : colors.accent}
          />
        </View>
        <View className="flex-1 items-center rounded-3xl border border-border bg-surface px-2 py-4">
          <ArcGauge
            label={t('dashboard.batteryLabel')}
            value={batteryVoltage.value}
            unit={batteryVoltage.unit || 'V'}
            min={8}
            max={16}
            precision={1}
            size={88}
            ticks={20}
            tone={lowBattery ? colors.danger : colors.accent}
          />
        </View>
      </View>

      {/* Active alerts */}
      {hasAlerts && (
        <View className="mt-2 rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <View className="mb-2 flex-row items-center gap-2">
            <Feather name="alert-triangle" size={12} color={colors.danger} />
            <Text className="text-[10px] font-bold tracking-eyebrow text-danger">{t('dashboard.activeAlerts')}</Text>
          </View>
          {overheat && (
            <Text className="mt-1 text-xs text-danger">
              {t('dashboard.alertCoolant', {
                value: Math.round(coolantTemp.value ?? 0),
                limit: thresholds.coolantTempMax,
              })}
            </Text>
          )}
          {lowBattery && (
            <Text className="mt-1 text-xs text-danger">
              {t('dashboard.alertBattery', {
                value: (batteryVoltage.value ?? 0).toFixed(1),
                min: thresholds.batteryVoltageMin,
              })}
            </Text>
          )}
          {lowFuel && (
            <Text className="mt-1 text-xs text-danger">
              {t('dashboard.alertFuel', {
                value: Math.round(fuelLevel.value ?? 0),
                min: thresholds.fuelLevelMin,
              })}
            </Text>
          )}
        </View>
      )}

      {/* Trends over the rolling live window. */}
      <View className="mt-6">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[10px] font-bold tracking-[3px] text-text-muted">
            {t('dashboard.history5Min')}
          </Text>
          <Text className="text-[10px] text-text-dim">{t('dashboard.live1Hz')}</Text>
        </View>

        <View className="mb-3 rounded-3xl border border-border bg-surface p-4">
          <AreaChart
            label={t('dashboard.rpmLabel')}
            data={rpmHistory}
            min={0}
            max={8000}
            unit={rpm.unit || 'rpm'}
            height={130}
          />
        </View>

        <View className="mb-3 flex-row gap-3">
          <View className="flex-1 rounded-3xl border border-border bg-surface p-4">
            <AreaChart
              label={t('dashboard.speedLabel')}
              data={speedHistory}
              min={0}
              max={200}
              unit={speed.unit || 'km/h'}
              height={84}
            />
          </View>
          <View className="flex-1 rounded-3xl border border-border bg-surface p-4">
            <AreaChart
              label={t('dashboard.coolantLabel')}
              data={coolantTempHistory}
              min={-40}
              max={150}
              unit={coolantTemp.unit || '°C'}
              height={84}
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 rounded-3xl border border-border bg-surface p-4">
            <AreaChart
              label={t('dashboard.fuelLabel')}
              data={fuelLevelHistory}
              min={0}
              max={100}
              unit={fuelLevel.unit || '%'}
              height={84}
            />
          </View>
          <View className="flex-1 rounded-3xl border border-border bg-surface p-4">
            <AreaChart
              label={t('dashboard.batteryLabel')}
              data={batteryVoltageHistory}
              min={8}
              max={16}
              unit={batteryVoltage.unit || 'V'}
              height={84}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
