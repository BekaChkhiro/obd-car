import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useBleStore } from '@/src/store/ble';
import { useDashboardStore } from '@/src/store/dashboard';
import { connectionMachine } from '@/src/ble/connection';
import { DashboardPoller } from '@/src/ble/dashboard-poller';
import { createMockAdapter } from '@/src/ble/mock-adapter';
import { GaugeCard } from '@/src/components/GaugeCard';
import { PidChart } from '@/src/components/PidChart';
import type { ConnectedAdapter } from '@/src/ble/manager';

function useActiveAdapter(connectionPhase: string): ConnectedAdapter | null {
  // Re-derive on every render — getAdapter() returns the live instance.
  const isConnected = connectionPhase === 'ready' || connectionPhase === 'reading';
  return isConnected ? connectionMachine.getAdapter() : null;
}

export default function DashboardScreen() {
  const connectionPhase = useBleStore((s) => s.connectionPhase);
  const {
    rpm, speed, coolantTemp, fuelLevel, batteryVoltage, reset,
    rpmSeries, speedSeries, coolantTempSeries, fuelLevelSeries, batteryVoltageSeries,
  } = useDashboardStore();

  const realAdapter = useActiveAdapter(connectionPhase);
  const [demoAdapter, setDemoAdapter] = useState<ConnectedAdapter | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const pollerRef = useRef<DashboardPoller | null>(null);

  const adapter = realAdapter ?? demoAdapter;
  const isDemo = adapter !== null && realAdapter === null;

  useEffect(() => {
    if (!adapter) return;

    if (realAdapter) {
      connectionMachine.startReading();
    }

    const poller = new DashboardPoller(adapter.pid);
    pollerRef.current = poller;
    poller.start();

    return () => {
      poller.stop();
      pollerRef.current = null;
      if (realAdapter) {
        connectionMachine.stopReading();
      }
      reset();
    };
  }, [adapter, realAdapter, reset]);

  // Stop demo mode when a real adapter connects.
  useEffect(() => {
    if (realAdapter && demoAdapter) {
      setDemoAdapter(null);
    }
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

  if (!adapter) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-950 px-6">
        <Text className="text-center text-lg font-semibold text-white">No Adapter Connected</Text>
        <Text className="mt-2 text-center text-sm text-gray-500">
          Connect an OBD adapter from the home screen to see live data.
        </Text>
        <Pressable
          onPress={startDemo}
          disabled={demoLoading}
          className="mt-8 rounded-xl bg-blue-600 px-6 py-3"
        >
          {demoLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-sm font-medium text-white">Start Demo Mode</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-950"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {isDemo && (
        <View className="mb-4 flex-row items-center justify-between rounded-xl bg-blue-900/40 px-4 py-2">
          <Text className="text-xs text-blue-300">Demo Mode — simulated data</Text>
          <Pressable onPress={stopDemo}>
            <Text className="text-xs font-semibold text-blue-400">Stop</Text>
          </Pressable>
        </View>
      )}

      {/* Row 1: RPM + Speed */}
      <View className="mb-3 flex-row gap-3">
        <GaugeCard
          label="Engine RPM"
          value={rpm.value}
          unit={rpm.unit || 'rpm'}
          min={0}
          max={8000}
          thresholds={{ warnHigh: 5000, dangerHigh: 7000 }}
          className="flex-1"
        />
        <GaugeCard
          label="Speed"
          value={speed.value}
          unit={speed.unit || 'km/h'}
          min={0}
          max={200}
          thresholds={{ warnHigh: 100, dangerHigh: 150 }}
          className="flex-1"
        />
      </View>

      {/* Row 2: Coolant Temp + Fuel Level */}
      <View className="mb-3 flex-row gap-3">
        <GaugeCard
          label="Coolant Temp"
          value={coolantTemp.value}
          unit={coolantTemp.unit || '°C'}
          min={-40}
          max={150}
          thresholds={{ warnLow: 60, warnHigh: 100, dangerHigh: 110 }}
          className="flex-1"
        />
        <GaugeCard
          label="Fuel Level"
          value={fuelLevel.value}
          unit={fuelLevel.unit || '%'}
          min={0}
          max={100}
          precision={1}
          thresholds={{ warnLow: 20, dangerLow: 10 }}
          className="flex-1"
        />
      </View>

      {/* Row 3: Battery Voltage (full width) */}
      <GaugeCard
        label="Battery Voltage"
        value={batteryVoltage.value}
        unit={batteryVoltage.unit || 'V'}
        min={8}
        max={16}
        precision={2}
        thresholds={{ warnLow: 11.5, dangerLow: 10, warnHigh: 14.8, dangerHigh: 15.5 }}
      />

      {/* Charts section */}
      <Text className="mb-3 mt-6 text-xs font-semibold uppercase tracking-widest text-gray-600">
        History
      </Text>

      <View className="mb-3 flex-row gap-3">
        <PidChart
          label="RPM"
          data={rpmSeries}
          min={0}
          max={8000}
          unit="rpm"
          thresholds={{ warnHigh: 5000, dangerHigh: 7000 }}
          className="flex-1"
        />
        <PidChart
          label="Speed"
          data={speedSeries}
          min={0}
          max={200}
          unit="km/h"
          thresholds={{ warnHigh: 100, dangerHigh: 150 }}
          className="flex-1"
        />
      </View>

      <View className="mb-3 flex-row gap-3">
        <PidChart
          label="Coolant"
          data={coolantTempSeries}
          min={-40}
          max={150}
          unit="°C"
          thresholds={{ warnLow: 60, warnHigh: 100, dangerHigh: 110 }}
          className="flex-1"
        />
        <PidChart
          label="Fuel"
          data={fuelLevelSeries}
          min={0}
          max={100}
          unit="%"
          thresholds={{ warnLow: 20, dangerLow: 10 }}
          className="flex-1"
        />
      </View>

      <PidChart
        label="Battery Voltage"
        data={batteryVoltageSeries}
        min={8}
        max={16}
        unit="V"
        thresholds={{ warnLow: 11.5, dangerLow: 10, warnHigh: 14.8, dangerHigh: 15.5 }}
      />
    </ScrollView>
  );
}
