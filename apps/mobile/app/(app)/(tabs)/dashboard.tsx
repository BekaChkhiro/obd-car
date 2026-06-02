import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { GaugeCard } from '@/src/components/GaugeCard';
import { PidChart } from '@/src/components/PidChart';
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
    live: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
    demo: { dot: 'bg-violet-400', text: 'text-violet-300', border: 'border-violet-500/30', bg: 'bg-violet-500/10' },
    offline: { dot: 'bg-zinc-600', text: 'text-zinc-400', border: 'border-zinc-700', bg: 'bg-zinc-900/40' },
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
  const { t } = useTranslation();
  const connectionPhase = useBleStore((s) => s.connectionPhase);
  const {
    rpm, speed, coolantTemp, fuelLevel, batteryVoltage, reset,
    rpmHistory, speedHistory, coolantTempHistory, fuelLevelHistory, batteryVoltageHistory,
  } = useDashboardStore();
  const thresholds = useThresholdsStore((s) => s.thresholds);

  const realAdapter = useActiveAdapter(connectionPhase);
  const [demoAdapter, setDemoAdapter] = useState<ConnectedAdapter | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const pollerRef = useRef<DashboardPoller | null>(null);

  const adapter = realAdapter ?? demoAdapter;
  const isDemo = adapter !== null && realAdapter === null;

  useThresholdAlerts();

  useEffect(() => {
    requestNotificationPermissions().catch(() => {});
  }, []);

  useEffect(() => {
    if (!adapter) return;
    if (realAdapter) connectionMachine.startReading();
    const poller = new DashboardPoller(adapter.pid);
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
      if (realAdapter) connectionMachine.stopReading();
      reset();
    };
  }, [adapter, realAdapter, reset]);

  useEffect(() => {
    if (realAdapter && demoAdapter) setDemoAdapter(null);
  }, [realAdapter, demoAdapter]);

  async function startDemo() {
    setDemoLoading(true);
    try {
      const mock = await createMockAdapter();
      setDemoAdapter(mock);
    } finally {
      setDemoLoading(false);
    }
  }

  function stopDemo() {
    pollerRef.current?.stop();
    setDemoAdapter(null);
    reset();
  }

  const overheat = coolantTemp.value !== null && coolantTemp.value > thresholds.coolantTempMax;
  const lowBattery =
    batteryVoltage.value !== null && batteryVoltage.value < thresholds.batteryVoltageMin;
  const lowFuel = fuelLevel.value !== null && fuelLevel.value < thresholds.fuelLevelMin;
  const hasAlerts = overheat || lowBattery || lowFuel;

  if (!adapter) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <View className="mb-6 items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-zinc-800">
            <View className="h-2 w-2 rounded-full bg-zinc-700" />
          </View>
          <Text className="text-center text-xl font-bold text-zinc-50">{t('dashboard.noAdapter')}</Text>
          <Text className="mt-2 text-center text-sm text-zinc-500">
            {t('dashboard.noAdapterHint')}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/pair' as never)}
          className="mb-3 w-full items-center rounded-xl bg-cyan-500 py-3 active:bg-cyan-600"
        >
          <Text className="text-sm font-bold tracking-wider text-zinc-950">{t('dashboard.connectAdapter').toUpperCase()}</Text>
        </Pressable>
        <Pressable
          onPress={startDemo}
          disabled={demoLoading}
          className="w-full items-center rounded-xl border border-zinc-800 bg-zinc-900/60 py-3"
        >
          {demoLoading ? (
            <ActivityIndicator color="#a1a1aa" size="small" />
          ) : (
            <Text className="text-sm font-semibold text-zinc-300">{t('dashboard.runDemo')}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: insets.top + 12,
        paddingBottom: 32,
      }}
    >
      {/* Title row */}
      <View className="mb-3 flex-row items-end justify-between">
        <View>
          <Text className="text-[10px] font-semibold tracking-[3px] text-zinc-500">
            {t('dashboard.brand')}
          </Text>
          <Text className="mt-1 text-2xl font-bold text-zinc-50">{t('dashboard.title')}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/threshold-settings')}
          className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5"
        >
          <Text className="text-[10px] font-bold tracking-[2px] text-zinc-400">
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

      {/* Hero — RPM (full width, larger) */}
      <View
        className={`mb-3 overflow-hidden rounded-3xl border bg-zinc-900/60 p-5 ${
          rpm.value !== null && rpm.value > 5000
            ? 'border-amber-500/40'
            : 'border-zinc-800'
        }`}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] font-bold tracking-[3px] text-zinc-500">ENGINE  ·  RPM</Text>
          <Text className="text-[10px] tabular-nums text-zinc-500">0 – 8000</Text>
        </View>
        <View className="mt-4 flex-row items-baseline">
          <Text className="text-6xl font-bold tabular-nums text-zinc-50">
            {rpm.value !== null ? rpm.value.toFixed(0) : '—'}
          </Text>
          <Text className="ml-2 text-base text-zinc-500">{rpm.unit || 'rpm'}</Text>
        </View>
        <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <View
            className={`h-full rounded-full ${
              rpm.value !== null && rpm.value > 7000
                ? 'bg-red-400'
                : rpm.value !== null && rpm.value > 5000
                  ? 'bg-amber-400'
                  : 'bg-cyan-400'
            }`}
            style={{ width: `${Math.min(100, ((rpm.value ?? 0) / 8000) * 100)}%` }}
          />
        </View>
        <View className="mt-1.5 flex-row justify-between">
          <Text className="text-[10px] text-zinc-700">IDLE</Text>
          <Text className="text-[10px] text-zinc-700">REDLINE</Text>
        </View>
      </View>

      {/* Row: Speed + Coolant */}
      <View className="mb-3 flex-row gap-3">
        <GaugeCard
          label="Speed"
          value={speed.value}
          unit={speed.unit || 'km/h'}
          min={0}
          max={200}
          thresholds={{ warnHigh: 100, dangerHigh: 150 }}
          className="flex-1"
        />
        <GaugeCard
          label="Coolant"
          value={coolantTemp.value}
          unit={coolantTemp.unit || '°C'}
          min={-40}
          max={150}
          thresholds={{ warnLow: 60, warnHigh: 100, dangerHigh: 110 }}
          alertActive={overheat}
          className="flex-1"
        />
      </View>

      {/* Row: Fuel + Battery */}
      <View className="mb-3 flex-row gap-3">
        <GaugeCard
          label="Fuel"
          value={fuelLevel.value}
          unit={fuelLevel.unit || '%'}
          min={0}
          max={100}
          precision={1}
          thresholds={{ warnLow: 20, dangerLow: 10 }}
          alertActive={lowFuel}
          className="flex-1"
        />
        <GaugeCard
          label="Battery"
          value={batteryVoltage.value}
          unit={batteryVoltage.unit || 'V'}
          min={8}
          max={16}
          precision={2}
          thresholds={{ warnLow: 11.5, dangerLow: 10, warnHigh: 14.8, dangerHigh: 15.5 }}
          alertActive={lowBattery}
          className="flex-1"
        />
      </View>

      {/* Active alerts */}
      {hasAlerts && (
        <View className="mt-2 rounded-2xl border border-red-500/40 bg-red-950/30 p-4">
          <View className="mb-2 flex-row items-center gap-2">
            <Feather name="alert-triangle" size={12} color={colors.danger} />
            <Text className="text-[10px] font-bold tracking-eyebrow text-red-300">{t('dashboard.activeAlerts')}</Text>
          </View>
          {overheat && (
            <Text className="mt-1 text-xs text-red-200">
              {t('dashboard.alertCoolant', {
                value: Math.round(coolantTemp.value ?? 0),
                limit: thresholds.coolantTempMax,
              })}
            </Text>
          )}
          {lowBattery && (
            <Text className="mt-1 text-xs text-red-200">
              {t('dashboard.alertBattery', {
                value: (batteryVoltage.value ?? 0).toFixed(1),
                min: thresholds.batteryVoltageMin,
              })}
            </Text>
          )}
          {lowFuel && (
            <Text className="mt-1 text-xs text-red-200">
              {t('dashboard.alertFuel', {
                value: Math.round(fuelLevel.value ?? 0),
                min: thresholds.fuelLevelMin,
              })}
            </Text>
          )}
        </View>
      )}

      {/* History */}
      <View className="mt-6">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[10px] font-bold tracking-[3px] text-zinc-500">
            {t('dashboard.history5Min')}
          </Text>
          <Text className="text-[10px] text-zinc-600">{t('dashboard.live1Hz')}</Text>
        </View>

        <View className="mb-3 flex-row gap-3">
          <PidChart label="RPM" data={rpmHistory} min={0} max={8000} unit="rpm" color={colors.accent} className="flex-1" />
          <PidChart label="Speed" data={speedHistory} min={0} max={200} unit={speed.unit || 'km/h'} color={colors.success} className="flex-1" />
        </View>

        <View className="mb-3 flex-row gap-3">
          <PidChart label="Coolant" data={coolantTempHistory} min={-40} max={150} unit={coolantTemp.unit || '°C'} color={colors.warning} className="flex-1" />
          <PidChart label="Fuel" data={fuelLevelHistory} min={0} max={100} unit={fuelLevel.unit || '%'} color={colors.info} className="flex-1" />
        </View>

        <PidChart label="Battery" data={batteryVoltageHistory} min={8} max={16} unit={batteryVoltage.unit || 'V'} color="#22d3ee" />
      </View>
    </ScrollView>
  );
}
