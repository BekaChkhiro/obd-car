import { View, Text } from 'react-native';

export interface GaugeThresholds {
  warnLow?: number;
  dangerLow?: number;
  warnHigh?: number;
  dangerHigh?: number;
}

interface GaugeCardProps {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  max: number;
  precision?: number;
  thresholds?: GaugeThresholds;
  alertActive?: boolean;
  className?: string;
}

type GaugeStatus = 'good' | 'warn' | 'danger';

function getStatus(value: number, thresholds: GaugeThresholds): GaugeStatus {
  const { warnLow, dangerLow, warnHigh, dangerHigh } = thresholds;
  if (dangerHigh !== undefined && value >= dangerHigh) return 'danger';
  if (warnHigh !== undefined && value >= warnHigh) return 'warn';
  if (dangerLow !== undefined && value <= dangerLow) return 'danger';
  if (warnLow !== undefined && value <= warnLow) return 'warn';
  return 'good';
}

const STATUS: Record<GaugeStatus, { bar: string; text: string; dot: string; label: string }> = {
  good: { bar: 'bg-success', text: 'text-success', dot: 'bg-success', label: 'OK' },
  warn: { bar: 'bg-warning', text: 'text-warning', dot: 'bg-warning', label: 'WARN' },
  danger: { bar: 'bg-danger', text: 'text-danger', dot: 'bg-danger', label: 'DANGER' },
};

export function GaugeCard({
  label,
  value,
  unit,
  min,
  max,
  precision = 0,
  thresholds = {},
  alertActive = false,
  className = '',
}: GaugeCardProps) {
  const hasValue = value !== null;
  const derived: GaugeStatus = hasValue ? getStatus(value, thresholds) : 'good';
  const status: GaugeStatus = alertActive ? 'danger' : derived;
  const s = STATUS[status];

  const clamped = hasValue ? Math.max(min, Math.min(max, value)) : 0;
  const progress = max > min ? (clamped - min) / (max - min) : 0;
  const displayValue = hasValue ? value.toFixed(precision) : '—';

  return (
    <View
      className={`overflow-hidden rounded-2xl border bg-surface p-4 ${
        alertActive ? 'border-danger/30' : 'border-border'
      } ${className}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] font-bold tracking-[2px] text-text-muted">{label.toUpperCase()}</Text>
        {hasValue ? (
          <View className="flex-row items-center gap-1.5">
            <View className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            <Text className={`text-[9px] font-bold tracking-widest ${s.text}`}>{s.label}</Text>
          </View>
        ) : (
          <Text className="text-[9px] font-bold tracking-widest text-text-dim">NO DATA</Text>
        )}
      </View>

      <View className="mt-3 flex-row items-baseline">
        <Text
          className={`text-4xl font-bold tabular-nums ${
            hasValue ? 'text-text-primary' : 'text-text-dim'
          }`}
        >
          {displayValue}
        </Text>
        {hasValue && <Text className="ml-1.5 text-sm text-text-muted">{unit}</Text>}
      </View>

      <View className="mt-3 h-1 overflow-hidden rounded-full bg-surface-muted">
        <View
          className={`h-full rounded-full ${s.bar}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>

      <View className="mt-1.5 flex-row justify-between">
        <Text className="text-[10px] text-text-dim tabular-nums">{min}</Text>
        <Text className="text-[10px] text-text-dim tabular-nums">{max}</Text>
      </View>
    </View>
  );
}
