import { View, Text } from 'react-native';
import type { TimePoint } from '@/src/store/dashboard';

const MAX_BARS = 50;
const CHART_HEIGHT = 56;

interface PidChartProps {
  label: string;
  data: TimePoint[];
  min: number;
  max: number;
  unit: string;
  color?: string;
  className?: string;
}

export function PidChart({
  label,
  data,
  min,
  max,
  unit,
  color = '#22d3ee',
  className = '',
}: PidChartProps) {
  const bars = data.length > MAX_BARS ? data.slice(data.length - MAX_BARS) : data;
  const range = max - min || 1;
  const latest = bars[bars.length - 1]?.value;

  return (
    <View className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 ${className}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">
          {label.toUpperCase()}
        </Text>
        {latest !== undefined && (
          <Text className="text-[10px] tabular-nums text-zinc-400">
            {latest.toFixed(latest < 100 ? 1 : 0)} {unit}
          </Text>
        )}
      </View>

      {bars.length === 0 ? (
        <View style={{ height: CHART_HEIGHT }} className="mt-2 items-center justify-center">
          <Text className="text-[10px] text-zinc-700">No data yet</Text>
        </View>
      ) : (
        <View className="mt-2 flex-row items-end" style={{ height: CHART_HEIGHT, gap: 1 }}>
          {bars.map((p) => {
            const normalized = Math.max(0, Math.min(1, (p.value - min) / range));
            const heightPx = Math.max(2, Math.round(normalized * CHART_HEIGHT));
            return (
              <View
                key={p.ts}
                style={{
                  flex: 1,
                  height: heightPx,
                  backgroundColor: color,
                  borderRadius: 1,
                  opacity: 0.55 + normalized * 0.45,
                }}
              />
            );
          })}
        </View>
      )}

      <View className="mt-1.5 flex-row justify-between">
        <Text className="text-[10px] text-zinc-700 tabular-nums">
          {min} {unit}
        </Text>
        <Text className="text-[10px] text-zinc-700 tabular-nums">
          {max} {unit}
        </Text>
      </View>
    </View>
  );
}
