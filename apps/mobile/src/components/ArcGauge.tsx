import { View, Text } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Line,
  Path,
  Stop,
} from 'react-native-svg';
import { colors } from '@/src/theme/colors';

interface ArcGaugeProps {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  max: number;
  precision?: number;
  size?: number;
  /** Arc colour. Defaults to the telemetry accent; pass a status colour to flag a reading. */
  tone?: string;
  /** Value from which the scale is marked as a danger zone, e.g. an engine's redline. */
  redlineFrom?: number;
  /** Draw a needle as well as the filled arc. Reads as an instrument; off for small dials. */
  needle?: boolean;
  /** Number of scale divisions. Every fifth is drawn long. */
  ticks?: number;
  /** Small caption under the label, e.g. the range. */
  caption?: string;
  /** Unique id for this gauge's gradient. Two gradients sharing an id collide. */
  gradientId?: string;
}

/**
 * Degrees of sweep, and where it starts.
 *
 * 250° with the opening at the bottom is the proportion a car's own dials use:
 * enough arc for the scale to be readable, and a gap that gives the needle a
 * rest position instead of wrapping the value round a closed ring.
 */
const SWEEP = 250;
const START_ANGLE = 90 + (360 - SWEEP) / 2;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, sweepDeg: number): string {
  // A full 360° sweep has no endpoints to draw between, so clamp just short of
  // it — otherwise the arc collapses to nothing.
  const sweep = Math.min(sweepDeg, 359.999);
  const start = polar(cx, cy, r, fromDeg);
  const end = polar(cx, cy, r, fromDeg + sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * A dial for one live reading.
 *
 * Built to read as an instrument rather than a ring-shaped progress bar: a
 * graduated scale, a needle at the current value, and a marked danger zone
 * where the range has one. The graduations are what let you judge a reading at
 * a glance without parsing the number — the thing a bare arc cannot do.
 *
 * Two deliberate refusals. A null value draws the scale with no fill and shows
 * "—" rather than a zero, because a zero is a reading and "no reading" is not.
 * And the fill is clamped to the track, so an out-of-range value cannot wrap
 * around and read as a low one.
 */
export function ArcGauge({
  label,
  value,
  unit,
  min,
  max,
  precision = 0,
  size = 132,
  tone = colors.accent,
  redlineFrom,
  needle = false,
  ticks = 36,
  caption,
  gradientId,
}: ArcGaugeProps) {
  const stroke = Math.max(7, size * 0.062);
  const r = (size - stroke) / 2 - size * 0.055;
  const cx = size / 2;
  const cy = size / 2;
  const gid = gradientId ?? `gauge-${label.replace(/\W/g, '')}-${Math.round(size)}`;

  const span = max - min;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const ratio = value === null || span <= 0 ? 0 : clamp((value - min) / span);

  const trackPath = arcPath(cx, cy, r, START_ANGLE, SWEEP);
  const valuePath = arcPath(cx, cy, r, START_ANGLE, SWEEP * ratio);

  const redlineRatio =
    redlineFrom !== undefined && span > 0 ? clamp((redlineFrom - min) / span) : null;
  const redlinePath =
    redlineRatio !== null && redlineRatio < 1
      ? arcPath(cx, cy, r, START_ANGLE + SWEEP * redlineRatio, SWEEP * (1 - redlineRatio))
      : null;

  const needleAngle = START_ANGLE + SWEEP * ratio;
  const needleTip = polar(cx, cy, r - stroke * 0.9, needleAngle);
  const needleTail = polar(cx, cy, size * 0.06, needleAngle + 180);

  const tickInner = r - stroke * 0.85;
  const tickMarks = Array.from({ length: ticks + 1 }, (_, i) => {
    const t = i / ticks;
    const angle = START_ANGLE + SWEEP * t;
    const major = i % 5 === 0;
    const len = major ? size * 0.055 : size * 0.03;
    const a = polar(cx, cy, tickInner, angle);
    const b = polar(cx, cy, tickInner - len, angle);
    const past = t <= ratio && value !== null;
    return { a, b, major, past, key: i };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Defs>
            {/* Along-the-arc gradient: a flat fill makes the sweep look printed
                on, a graded one gives it the depth a lit instrument has. */}
            <LinearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={tone} stopOpacity={0.45} />
              <Stop offset="1" stopColor={tone} stopOpacity={1} />
            </LinearGradient>
          </Defs>

          <G>
            <Path
              d={trackPath}
              stroke={colors.surfaceSunken}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />

            {redlinePath ? (
              <Path
                d={redlinePath}
                stroke={colors.danger}
                strokeWidth={stroke}
                strokeLinecap="butt"
                fill="none"
                opacity={0.85}
              />
            ) : null}

            {/* Graduations. The ones the needle has passed darken, so the
                reading is legible from the scale alone. */}
            {tickMarks.map((tick) => (
              <Line
                key={tick.key}
                x1={tick.a.x}
                y1={tick.a.y}
                x2={tick.b.x}
                y2={tick.b.y}
                stroke={tick.past ? colors.textSecondary : colors.borderStrong}
                strokeWidth={tick.major ? 1.6 : 1}
                strokeLinecap="round"
                opacity={tick.major ? 1 : 0.65}
              />
            ))}

            {value !== null && ratio > 0 ? (
              <Path
                d={valuePath}
                stroke={`url(#${gid})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
              />
            ) : null}

            {needle && value !== null ? (
              <>
                <Line
                  x1={needleTail.x}
                  y1={needleTail.y}
                  x2={needleTip.x}
                  y2={needleTip.y}
                  stroke={colors.accent}
                  strokeWidth={Math.max(2, size * 0.018)}
                  strokeLinecap="round"
                />
                <Circle cx={cx} cy={cy} r={size * 0.045} fill={colors.accent} />
                <Circle cx={cx} cy={cy} r={size * 0.018} fill={colors.surface} />
              </>
            ) : null}
          </G>
        </Svg>

        {needle ? null : (
          <View style={{ alignItems: 'center' }}>
            <Text
              style={{
                fontSize: size * 0.2,
                fontWeight: '700',
                color: colors.textPrimary,
                fontVariant: ['tabular-nums'],
              }}
            >
              {value === null ? '—' : value.toFixed(precision)}
            </Text>
            <Text style={{ fontSize: size * 0.082, color: colors.textMuted, marginTop: -2 }}>
              {unit}
            </Text>
          </View>
        )}
      </View>

      {needle ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: -size * 0.06 }}>
          <Text
            style={{
              fontSize: size * 0.2,
              fontWeight: '700',
              color: colors.textPrimary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {value === null ? '—' : value.toFixed(precision)}
          </Text>
          <Text style={{ fontSize: size * 0.09, color: colors.textMuted, marginLeft: 4 }}>
            {unit}
          </Text>
        </View>
      ) : null}

      <Text
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.2,
          color: colors.textSecondary,
        }}
      >
        {label}
      </Text>
      {caption ? (
        <Text style={{ fontSize: 10, color: colors.textDim, marginTop: 1 }}>{caption}</Text>
      ) : null}
    </View>
  );
}
