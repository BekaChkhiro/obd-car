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
  good: { bar: 'bg-emerald-400', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'OK' },
  warn: { bar: 'bg-amber-400', text: 'text-amber-400', dot: 'bg-amber-400', label: 'WARN' },
  danger: { bar: 'bg-red-400', text: 'text-red-400', dot: 'bg-red-400', label: 'DANGER' },
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
      className={`overflow-hidden rounded-2xl border bg-zinc-900/60 p-4 ${
        alertActive ? 'border-red-500/50' : 'border-zinc-800'
      } ${className}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">{label.toUpperCase()}</Text>
        {hasValue ? (
          <View className="flex-row items-center gap-1.5">
            <View className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            <Text className={`text-[9px] font-bold tracking-widest ${s.text}`}>{s.label}</Text>
          </View>
        ) : (
          <Text className="text-[9px] font-bold tracking-widest text-zinc-700">NO DATA</Text>
        )}
      </View>

      <View className="mt-3 flex-row items-baseline">
        <Text
          className={`text-4xl font-bold tabular-nums ${
            hasValue ? 'text-zinc-50' : 'text-zinc-700'
          }`}
        >
          {displayValue}
        </Text>
        {hasValue && <Text className="ml-1.5 text-sm text-zinc-500">{unit}</Text>}
      </View>

      <View className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
        <View
          className={`h-full rounded-full ${s.bar}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>

      <View className="mt-1.5 flex-row justify-between">
        <Text className="text-[10px] text-zinc-600 tabular-nums">{min}</Text>
        <Text className="text-[10px] text-zinc-600 tabular-nums">{max}</Text>
      </View>
    </View>
  );
}
