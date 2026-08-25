import { View, Text } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '@/src/theme/colors';
import type { TimePoint } from '@/src/store/dashboard';

interface AreaChartProps {
  label: string;
  data: TimePoint[];
  min: number;
  max: number;
  unit: string;
  height?: number;
  tone?: string;
  /** Right-hand caption, e.g. the window the data covers. */
  caption?: string;
}

/**
 * Build a smooth path through the points using Catmull-Rom converted to cubic
 * béziers. Straight segments between samples make a noisy PID look like a
 * seismograph; the curve reads as a trend, which is what this chart is for.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Filled trend line for one PID's rolling history.
 *
 * The window is whatever the store is holding — a few minutes of live samples,
 * not a day or a week. There is no period selector because there is no stored
 * history behind one; offering "week" over five minutes of RAM would invent a
 * range the app cannot show.
 */
export function AreaChart({
  label,
  data,
  min,
  max,
  unit,
  height = 120,
  tone = colors.accent,
  caption,
}: AreaChartProps) {
  // Fixed viewBox with preserveAspectRatio="none": the chart scales to whatever
  // width the card gives it without needing a layout pass first.
  const VB_W = 300;
  const VB_H = 100;

  // Scale to the data, not to the sensor's full range. An idling engine plotted
  // against 0–8000 rpm is a flat line pinned to the floor; the point of a trend
  // is the shape of the variation, which only shows when the window fits it.
  const values = data.map((p) => p.value);
  const lo = values.length ? Math.min(...values) : min;
  const hi = values.length ? Math.max(...values) : max;
  const flat = hi - lo < 1e-6;
  // A dead-flat series still needs a band, or every point lands on one row.
  const pad = flat ? Math.max(Math.abs(hi) * 0.1, 1) : (hi - lo) * 0.18;
  const yMin = Math.max(min, lo - pad);
  const yMax = Math.min(max, hi + pad);
  const span = yMax - yMin || 1;

  const points = data.map((p, i) => ({
    x: data.length === 1 ? VB_W / 2 : (i / (data.length - 1)) * VB_W,
    y: VB_H - Math.min(1, Math.max(0, (p.value - yMin) / span)) * VB_H,
  }));

  const line = smoothPath(points);
  const area = line ? `${line} L ${VB_W} ${VB_H} L 0 ${VB_H} Z` : '';
  const latest = data.length ? data[data.length - 1]!.value : null;
  const gid = `area-${label.replace(/\W/g, '')}`;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.2,
            color: colors.textSecondary,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textDim }}>
          {caption ??
            (values.length
              ? `${Math.round(lo)}–${Math.round(hi)} ${unit}`
              : '')}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: '700',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {latest === null ? '—' : Math.round(latest).toString()}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: 5 }}>{unit}</Text>
      </View>

      <View style={{ height, marginTop: 8 }}>
        {points.length >= 2 ? (
          <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={tone} stopOpacity={0.22} />
                <Stop offset="1" stopColor={tone} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill={`url(#${gid})`} />
            {/* vectorEffect keeps the stroke even after the non-uniform scale
                that preserveAspectRatio="none" applies. */}
            <Path
              d={line}
              stroke={tone}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </Svg>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.textDim }}>
              {data.length === 0 ? '—' : '…'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
