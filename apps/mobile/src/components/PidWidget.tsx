import { View, Text } from 'react-native';
import { useDashboardStore, type GaugeReading } from '@/src/store/dashboard';

// Maps OBD PID hex codes to dashboard store fields and display config.
const PID_CONFIG: Record<
  string,
  { label: string; storeKey: keyof DashboardKeys; min: number; max: number; precision: number }
> = {
  '010C': { label: 'Engine RPM', storeKey: 'rpm', min: 0, max: 8000, precision: 0 },
  '010D': { label: 'Speed', storeKey: 'speed', min: 0, max: 240, precision: 0 },
  '0105': { label: 'Coolant Temp', storeKey: 'coolantTemp', min: -40, max: 215, precision: 1 },
  '012F': { label: 'Fuel Level', storeKey: 'fuelLevel', min: 0, max: 100, precision: 1 },
};

interface DashboardKeys {
  rpm: GaugeReading;
  speed: GaugeReading;
  coolantTemp: GaugeReading;
  fuelLevel: GaugeReading;
  batteryVoltage: GaugeReading;
}

interface Config {
  label: string;
  storeKey: keyof DashboardKeys;
  min: number;
  max: number;
  precision: number;
}

function resolveConfig(toolName: string, toolInput: Record<string, unknown>): Config | null {
  if (toolName === 'read_battery_voltage') {
    return { label: 'Battery Voltage', storeKey: 'batteryVoltage', min: 10, max: 16, precision: 2 };
  }
  if (toolName === 'read_pid') {
    return PID_CONFIG[toolInput.pid as string] ?? null;
  }
  return null;
}

// 10-second staleness threshold — if the dashboard hasn't updated recently the
// live indicator is hidden so the user isn't misled by an old snapshot.
const STALE_MS = 10_000;

interface Props {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolStatus: 'pending' | 'running' | 'done' | 'error';
}

export function PidWidget({ toolName, toolInput, toolStatus }: Props) {
  const config = resolveConfig(toolName, toolInput);
  const reading = useDashboardStore(
    (s): GaugeReading | null => (config ? (s as unknown as DashboardKeys)[config.storeKey] : null),
  );

  if (!config) return null;

  const { label, min, max, precision } = config;
  const value = reading?.value ?? null;
  const unit = reading?.unit ?? '';
  const updatedAt = reading?.updatedAt ?? null;

  const hasValue = value !== null;
  const isLive = updatedAt !== null && Date.now() - updatedAt < STALE_MS;
  const progress = hasValue ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  if (toolStatus === 'error') return null;

  return (
    <View className="mt-1.5 rounded-xl border border-gray-700/60 bg-gray-800/70 px-3 py-2.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {label}
        </Text>
        {isLive && (
          <View className="flex-row items-center gap-1">
            <View className="h-1.5 w-1.5 rounded-full bg-green-400" />
            <Text className="text-xs text-gray-600">live</Text>
          </View>
        )}
      </View>

      <View className="mt-1.5 flex-row items-end gap-1.5">
        {hasValue ? (
          <>
            <Text className="text-2xl font-bold text-white">{value.toFixed(precision)}</Text>
            <Text className="mb-0.5 text-sm text-gray-400">{unit}</Text>
          </>
        ) : (
          <Text className="text-2xl font-bold text-gray-600">
            {toolStatus === 'running' ? '…' : '—'}
          </Text>
        )}
      </View>

      <View className="mt-2 h-1 overflow-hidden rounded-full bg-gray-700">
        <View
          className="h-full rounded-full bg-blue-500"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>
    </View>
  );
}
