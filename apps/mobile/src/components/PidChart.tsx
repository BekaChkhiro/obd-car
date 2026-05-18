import { View, Text } from 'react-native';
import type { TimeSeriesSample } from '@/src/store/dashboard';
import type { GaugeThresholds } from './GaugeCard';

interface PidChartProps {
  label: string;
  data: TimeSeriesSample[];
  min: number;
  max: number;
  unit: string;
  thresholds?: GaugeThresholds;
  barCount?: number;
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

const STATUS_COLOR: Record<GaugeStatus, string> = {
  good: '#10b981',
  warn: '#fbbf24',
  danger: '#ef4444',
};

const STATUS_TEXT_CLASS: Record<GaugeStatus, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  danger: 'text-red-400',
};

export function PidChart({
  label,
  data,
  min,
  max,
  unit,
  thresholds = {},
  barCount = 60,
  className = '',
}: PidChartProps) {
  const range = max - min || 1;
  const visible = data.slice(-barCount);
  const hasData = visible.length > 0;
  const latest = hasData ? visible[visible.length - 1] : null;
  const latestStatus = latest ? getStatus(latest.value, thresholds) : 'good';
  const latestDisplay = latest !== null ? latest.value.toFixed(0) : '—';

  return (
    <View className={`rounded-2xl bg-gray-900 p-4 ${className}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {label}
        </Text>
        <Text className="text-xs text-gray-600">5 min</Text>
      </View>

      <View
        style={{ height: 64, flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden' }}
        className="mt-3"
      >
        {hasData ? (
          visible.map((s, i) => {
            const normalized = Math.max(0, Math.min(1, (s.value - min) / range));
            const barHeight = Math.max(2, normalized * 64);
            const status = getStatus(s.value, thresholds);
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: barHeight,
                  backgroundColor: STATUS_COLOR[status],
                  marginHorizontal: 0.5,
                  borderRadius: 1,
                  opacity: 0.35 + 0.65 * ((i + 1) / visible.length),
                }}
              />
            );
          })
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-xs text-gray-600">No data yet</Text>
          </View>
        )}
      </View>

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-xs text-gray-600">
          {min} {unit}
        </Text>
        {latest !== null ? (
          <Text className={`text-xs font-semibold ${STATUS_TEXT_CLASS[latestStatus]}`}>
            {latestDisplay} {unit}
          </Text>
        ) : (
          <Text className="text-xs text-gray-600">—</Text>
        )}
        <Text className="text-xs text-gray-600">
          {max} {unit}
        </Text>
      </View>
    </View>
  );
}
