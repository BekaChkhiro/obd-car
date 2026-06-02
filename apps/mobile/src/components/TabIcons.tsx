import { View } from 'react-native';
import { colors } from '@/src/theme/colors';

interface IconProps {
  focused?: boolean;
}

function tone(focused?: boolean): string {
  return focused ? colors.accent : colors.textMuted;
}

const STROKE = 1.5;

// ── GARAGE — Car silhouette viewed from front ────────────────────────────────

export function GarageIcon({ focused }: IconProps) {
  const color = tone(focused);
  return (
    <View style={{ width: 22, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      {/* Upper cabin (windshield band) */}
      <View
        style={{
          width: 12,
          height: 5,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderWidth: STROKE,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
      {/* Main body */}
      <View
        style={{
          width: 20,
          height: 7,
          borderRadius: 3,
          borderWidth: STROKE,
          borderColor: color,
          marginTop: -STROKE,
          justifyContent: 'center',
        }}
      >
        {/* Horizontal split line for the lower edge of glass */}
        <View
          style={{
            height: STROKE,
            backgroundColor: color,
            marginHorizontal: 3,
            marginTop: -1,
          }}
        />
      </View>
      {/* Wheels */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          width: 16,
          marginTop: 1,
        }}
      >
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
      </View>
    </View>
  );
}

// ── LIVE — Speedometer dome with needle ──────────────────────────────────────

export function LiveIcon({ focused }: IconProps) {
  const color = tone(focused);
  return (
    <View style={{ width: 22, height: 18, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* Half-circle outline (gauge dome) */}
      <View
        style={{
          width: 20,
          height: 10,
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderWidth: STROKE,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
      {/* Baseline */}
      <View
        style={{
          width: 20,
          height: STROKE,
          backgroundColor: color,
          borderRadius: STROKE / 2,
        }}
      />
      {/* Needle — angled line pointing to upper-right */}
      <View
        style={{
          position: 'absolute',
          bottom: 1,
          left: 10,
          width: STROKE,
          height: 7,
          backgroundColor: color,
          borderRadius: STROKE / 2,
          transform: [{ translateX: -STROKE / 2 }, { rotate: '35deg' }],
          transformOrigin: 'bottom',
        }}
      />
      {/* Pivot dot */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 10,
          width: 3,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: color,
          transform: [{ translateX: -1.5 }],
        }}
      />
    </View>
  );
}

// ── AI — Sparkle (4-point star) ──────────────────────────────────────────────

export function AIIcon({ focused }: IconProps) {
  const color = tone(focused);
  // Sparkle: a center dot plus four thin radial dashes — reads as
  // "AI / generative" without the visual noise of a full + glyph.
  return (
    <View style={{ width: 22, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      {/* Top dash */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: STROKE,
          height: 5,
          backgroundColor: color,
          borderRadius: STROKE / 2,
        }}
      />
      {/* Bottom dash */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: STROKE,
          height: 5,
          backgroundColor: color,
          borderRadius: STROKE / 2,
        }}
      />
      {/* Left dash */}
      <View
        style={{
          position: 'absolute',
          left: 3,
          width: 5,
          height: STROKE,
          backgroundColor: color,
          borderRadius: STROKE / 2,
        }}
      />
      {/* Right dash */}
      <View
        style={{
          position: 'absolute',
          right: 3,
          width: 5,
          height: STROKE,
          backgroundColor: color,
          borderRadius: STROKE / 2,
        }}
      />
      {/* Center diamond */}
      <View
        style={{
          width: 5,
          height: 5,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
          borderRadius: 1,
        }}
      />
    </View>
  );
}

// ── HISTORY — Clock face ─────────────────────────────────────────────────────

export function HistoryIcon({ focused }: IconProps) {
  const color = tone(focused);
  return (
    <View style={{ width: 22, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      {/* Clock circle */}
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: STROKE,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Hour hand — short, pointing up */}
        <View
          style={{
            position: 'absolute',
            top: 3,
            width: STROKE,
            height: 5,
            backgroundColor: color,
            borderRadius: STROKE / 2,
          }}
        />
        {/* Minute hand — long, pointing right */}
        <View
          style={{
            position: 'absolute',
            left: 7,
            width: 5,
            height: STROKE,
            backgroundColor: color,
            borderRadius: STROKE / 2,
          }}
        />
        {/* Center pivot */}
        <View
          style={{
            width: 2,
            height: 2,
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}
