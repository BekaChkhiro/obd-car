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
  /** Override to force the card into the alert (danger) visual state. */
  alertActive?: boolean;
  className?: string;
}

type GaugeStatus = 'good' | 'warn' | 'danger' | 'cold';

function getStatus(value: number, thresholds: GaugeThresholds): GaugeStatus {
  const { warnLow, dangerLow, warnHigh, dangerHigh } = thresholds;
  if (dangerHigh !== undefined && value >= dangerHigh) return 'danger';
  if (warnHigh !== undefined && value >= warnHigh) return 'warn';
  if (dangerLow !== undefined && value <= dangerLow) return 'danger';
  if (warnLow !== undefined && value <= warnLow) return 'warn';
  return 'good';
}

const STATUS_COLORS: Record<GaugeStatus, { bar: string; text: string; bg: string }> = {
  good: { bar: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  warn: { bar: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-400/10' },
  danger: { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10' },
  cold: { bar: 'bg-blue-400', text: 'text-blue-400', bg: 'bg-blue-400/10' },
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
  const derivedStatus: GaugeStatus = hasValue ? getStatus(value, thresholds) : 'good';
  const status: GaugeStatus = alertActive ? 'danger' : derivedStatus;
  const colors = STATUS_COLORS[status];

  const clamped = hasValue ? Math.max(min, Math.min(max, value)) : 0;
  const progress = max > min ? (clamped - min) / (max - min) : 0;
  const displayValue = hasValue ? value.toFixed(precision) : '—';

  return (
    <View className={`rounded-2xl bg-gray-900 p-4 ${alertActive ? 'border border-red-500' : ''} ${className}`}>
      <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </Text>

      <View className="mt-2 flex-row items-end">
        <Text className={`text-4xl font-bold ${hasValue ? 'text-white' : 'text-gray-600'}`}>
          {displayValue}
        </Text>
        {hasValue && (
          <Text className="mb-1 ml-1.5 text-base text-gray-400">{unit}</Text>
        )}
      </View>

      {/* Progress bar */}
      <View className="mt-3 h-1.5 rounded-full bg-gray-800">
        <View
          className={`h-full rounded-full ${colors.bar}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>

      {/* Status dot + range */}
      <View className="mt-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <View className={`h-2 w-2 rounded-full ${hasValue ? colors.bar : 'bg-gray-700'}`} />
          <Text className={`text-xs ${hasValue ? colors.text : 'text-gray-600'}`}>
            {hasValue ? status.toUpperCase() : 'NO DATA'}
          </Text>
        </View>
        <Text className="text-xs text-gray-600">
          {min} – {max} {unit}
        </Text>
      </View>
    </View>
  );
}
