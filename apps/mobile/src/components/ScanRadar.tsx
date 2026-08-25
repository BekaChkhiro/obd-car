import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';

interface ScanRadarProps {
  scanning: boolean;
  /** Devices discovered so far — drawn as marks around the sweep. */
  found: number;
  size?: number;
  caption?: string;
}

const RING_COUNT = 3;
const RING_DURATION = 2600;

/** One expanding ring. Three of these, staggered, make the sweep. */
function Ring({ index, active, size }: { index: number; active: boolean; size: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: 220 });
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      (RING_DURATION / RING_COUNT) * index,
      withRepeat(
        withTiming(1, { duration: RING_DURATION, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [active, index, progress]);

  const style = useAnimatedStyle(() => ({
    // Starts small and opaque at the centre, ends wide and gone at the edge —
    // the shape of a pulse leaving the antenna rather than a spinner going
    // round, because scanning here is broadcast-and-listen, not a sweep.
    transform: [{ scale: 0.28 + progress.value * 0.72 }],
    opacity: (1 - progress.value) * 0.5,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: colors.accent,
          backgroundColor: colors.accentSoft,
        },
        style,
      ]}
    />
  );
}

/**
 * The scanning state, drawn.
 *
 * A spinner would say "busy"; this says "listening" — pulses leaving the
 * centre, with a mark appearing for each adapter that answers. Waiting for a
 * Bluetooth device is a slow, uncertain thing, and a picture of it reassures
 * far better than a progress indicator that cannot honestly show progress.
 */
export function ScanRadar({ scanning, found, size = 210, caption }: ScanRadarProps) {
  const hubSize = size * 0.3;

  // Marks sit on a fixed ring, spaced evenly, so a newly found adapter appears
  // in its own place rather than shuffling the ones already there.
  const markRadius = size * 0.38;
  const marks = Array.from({ length: Math.min(found, 6) }, (_, i) => {
    const angle = (-90 + (360 / Math.max(Math.min(found, 6), 1)) * i) * (Math.PI / 180);
    return {
      key: i,
      left: size / 2 + markRadius * Math.cos(angle) - hubSize * 0.28,
      top: size / 2 + markRadius * Math.sin(angle) - hubSize * 0.28,
    };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Array.from({ length: RING_COUNT }, (_, i) => (
          <Ring key={i} index={i} active={scanning} size={size} />
        ))}

        {/* Resting outline, so the area does not read as empty between pulses. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: size * 0.31,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />

        {marks.map((m) => (
          <View
            key={m.key}
            style={{
              position: 'absolute',
              left: m.left,
              top: m.top,
              width: hubSize * 0.56,
              height: hubSize * 0.56,
              borderRadius: hubSize * 0.28,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="cpu" size={hubSize * 0.28} color={colors.accent} />
          </View>
        ))}

        <View
          style={{
            width: hubSize,
            height: hubSize,
            borderRadius: hubSize / 2,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="bluetooth" size={hubSize * 0.46} color={colors.onAccent} />
        </View>
      </View>

      {caption ? (
        <Text
          style={{
            marginTop: 10,
            fontSize: 12,
            color: colors.textMuted,
            textAlign: 'center',
          }}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
