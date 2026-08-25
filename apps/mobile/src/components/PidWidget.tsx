import { View, Text } from 'react-native';
import { useDashboardStore, type GaugeReading } from '@/src/store/dashboard';

const PID_CONFIG: Record<
  string,
  { label: string; storeKey: keyof DashboardKeys; min: number; max: number; precision: number }
> = {
  '010C': { label: 'RPM', storeKey: 'rpm', min: 0, max: 8000, precision: 0 },
  '010D': { label: 'SPEED', storeKey: 'speed', min: 0, max: 240, precision: 0 },
  '0105': { label: 'COOLANT', storeKey: 'coolantTemp', min: -40, max: 215, precision: 1 },
  '012F': { label: 'FUEL', storeKey: 'fuelLevel', min: 0, max: 100, precision: 1 },
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
    return { label: 'BATTERY', storeKey: 'batteryVoltage', min: 10, max: 16, precision: 2 };
  }
  if (toolName === 'read_pid') {
    return PID_CONFIG[toolInput.pid as string] ?? null;
  }
  return null;
}

const STALE_MS = 10_000;

type ToolStatus = 'pending' | 'running' | 'done' | 'error';

const STATUS_DOT: Record<ToolStatus, string> = {
  pending: 'bg-text-muted',
  running: 'bg-accent',
  done: 'bg-success',
  error: 'bg-danger',
};

interface Props {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolStatus: ToolStatus;
}

export function PidWidget({ toolName, toolInput, toolStatus }: Props) {
  const config = resolveConfig(toolName, toolInput);
  const reading = useDashboardStore(
    (s): GaugeReading | null => (config ? (s as unknown as DashboardKeys)[config.storeKey] : null),
  );

  if (!config) return null;
  if (toolStatus === 'error') return null;

  const { label, precision } = config;
  const value = reading?.value ?? null;
  const unit = reading?.unit ?? '';
  const updatedAt = reading?.updatedAt ?? null;
  const hasValue = value !== null;
  const isLive = updatedAt !== null && Date.now() - updatedAt < STALE_MS;

  return (
    <View className="self-start flex-row items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1">
      <View className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[toolStatus]}`} />
      <Text className="text-[10px] font-semibold tracking-wider text-text-muted">{label}</Text>
      {hasValue ? (
        <Text className="text-[12px] font-semibold tabular-nums text-text-primary">
          {value.toFixed(precision)}
          {unit ? <Text className="text-text-muted"> {unit}</Text> : null}
        </Text>
      ) : (
        <Text className="text-[12px] font-semibold text-text-dim">
          {toolStatus === 'running' ? '…' : '—'}
        </Text>
      )}
      {isLive && <View className="h-1 w-1 rounded-full bg-success" />}
    </View>
  );
}
