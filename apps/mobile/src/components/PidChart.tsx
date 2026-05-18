import { View, Text } from 'react-native';
import type { TimePoint } from '@/src/store/dashboard';

const MAX_BARS = 50;
const CHART_HEIGHT = 48;

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
  color = '#10b981',
  className = '',
}: PidChartProps) {
  const bars = data.length > MAX_BARS ? data.slice(data.length - MAX_BARS) : data;
  const range = max - min || 1;

  return (
    <View className={`rounded-2xl bg-gray-900 p-3 ${className}`}>
      <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </Text>

      {bars.length === 0 ? (
        <View style={{ height: CHART_HEIGHT }} className="mt-2 items-center justify-center">
          <Text className="text-xs text-gray-700">No data yet</Text>
        </View>
      ) : (
        <View
          className="mt-2 flex-row items-end"
          style={{ height: CHART_HEIGHT, gap: 1 }}
        >
          {bars.map((p, i) => {
            const normalized = Math.max(0, Math.min(1, (p.value - min) / range));
            const heightPx = Math.max(2, Math.round(normalized * CHART_HEIGHT));
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: heightPx,
                  backgroundColor: color,
                  borderRadius: 1,
                  opacity: 0.7 + normalized * 0.3,
                }}
              />
            );
          })}
        </View>
      )}

      <View className="mt-1.5 flex-row justify-between">
        <Text className="text-xs text-gray-700">
          {min} {unit}
        </Text>
        <Text className="text-xs text-gray-700">
          {max} {unit}
        </Text>
      </View>
    </View>
  );
}
