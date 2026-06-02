import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors } from '@/src/theme/colors';

interface SwipeButtonProps {
  label: string;
  /** Label shown briefly after a successful swipe before reset. */
  completedLabel?: string;
  /** Feather icon name on the thumb. */
  icon?: React.ComponentProps<typeof Feather>['name'];
  onComplete: () => void;
  tone?: 'cyan' | 'zinc';
}

const HEIGHT = 58;
const THUMB_SIZE = 50;
const TRACK_PADDING = 4;
const COMPLETE_THRESHOLD = 0.72;

// Three chevrons that pulse from left to right while the thumb is idle —
// a clear affordance that the button wants a swipe.
function HintChevron({ delay, fade }: { delay: number; fade: SharedValue<number> }) {
  const opacity = useSharedValue(0.15);
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 420 }),
          withTiming(0.15, { duration: 620 }),
        ),
        -1,
      ),
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value * fade.value,
  }));

  return (
    <Animated.View style={style}>
      <Feather name="chevron-right" size={16} color={colors.textSecondary} />
    </Animated.View>
  );
}

export function SwipeButton({
  label,
  completedLabel,
  icon = 'arrow-right',
  onComplete,
  tone = 'cyan',
}: SwipeButtonProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [completed, setCompleted] = useState(false);
  const offset = useSharedValue(0);
  const pressed = useSharedValue(0);
  const crossedThreshold = useRef(false);

  const maxOffset = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);

  const handleComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCompleted(true);
    onComplete();
    setTimeout(() => {
      setCompleted(false);
      offset.value = withTiming(0, { duration: 260 });
    }, 650);
  }, [onComplete, offset]);

  const pingPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const pingThreshold = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onBegin(() => {
      pressed.value = withSpring(1, { damping: 22, stiffness: 320 });
      runOnJS(pingPress)();
    })
    .onChange((e) => {
      const next = offset.value + e.changeX;
      if (next < 0) offset.value = 0;
      else if (next > maxOffset) offset.value = maxOffset;
      else offset.value = next;

      // Single haptic tick the first time the thumb crosses the threshold.
      const past = offset.value > maxOffset * COMPLETE_THRESHOLD;
      if (past && !crossedThreshold.current) {
        crossedThreshold.current = true;
        runOnJS(pingThreshold)();
      } else if (!past && crossedThreshold.current) {
        crossedThreshold.current = false;
      }
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, { damping: 22, stiffness: 320 });
      if (maxOffset > 0 && offset.value > maxOffset * COMPLETE_THRESHOLD) {
        offset.value = withSpring(maxOffset, { damping: 16, stiffness: 240, mass: 0.6 });
        runOnJS(handleComplete)();
      } else {
        offset.value = withSpring(0, { damping: 14, stiffness: 200, mass: 0.6 });
      }
      crossedThreshold.current = false;
    });

  const progress = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value },
      { scale: 1 + pressed.value * 0.05 },
    ],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: offset.value + THUMB_SIZE + TRACK_PADDING,
  }));

  const fillOverlay = useAnimatedStyle(() => ({
    width: offset.value + THUMB_SIZE + TRACK_PADDING,
    opacity: maxOffset > 0
      ? interpolate(offset.value, [0, maxOffset], [0.0, 0.6], Extrapolation.CLAMP)
      : 0,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      offset.value,
      [0, maxOffset * 0.35],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          offset.value,
          [0, maxOffset],
          [0, 16],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // Chevrons share the same fade as the label so they vanish on drag.
  const hintFade = useSharedValue(1);
  useEffect(() => {
    // Re-derive whenever offset changes — keep chevrons in sync via animated value.
  }, []);

  const hintContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      offset.value,
      [0, maxOffset * 0.25],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const thumbInnerHighlight = useAnimatedStyle(() => ({
    opacity: 0.35 + pressed.value * 0.25,
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const accent = tone === 'cyan' ? colors.accent : '#3f3f46';
  const accentDeep = tone === 'cyan' ? colors.accentDim : '#27272a';
  const fillTint = tone === 'cyan' ? 'rgba(34, 211, 238, 0.14)' : 'rgba(82, 82, 91, 0.22)';
  const fillTintBright = tone === 'cyan' ? 'rgba(34, 211, 238, 0.22)' : 'rgba(113, 113, 122, 0.28)';

  return (
    <View
      onLayout={handleLayout}
      style={{
        height: HEIGHT,
        borderRadius: HEIGHT / 2,
        backgroundColor: '#0d0d11',
        borderWidth: 1,
        borderColor: '#1f1f25',
        overflow: 'hidden',
        justifyContent: 'center',
        padding: TRACK_PADDING,
      }}
    >
      {/* Subtle inner darkening — gives the track an "inset" feel */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: '#08080a',
          opacity: 0.45,
          borderRadius: HEIGHT / 2,
        }}
      />

      {/* Trailing fill — soft tint with full pill rounding so the right edge
          mirrors the thumb's curve as it slides. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            backgroundColor: fillTint,
            borderRadius: HEIGHT / 2,
          },
          fillStyle,
        ]}
      />
      {/* Trailing fill — brighter overlay that fades in with progress */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            backgroundColor: fillTintBright,
            borderRadius: HEIGHT / 2,
          },
          fillOverlay,
        ]}
      />

      {/* Right-aligned chevron hint cluster */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            right: 18,
            top: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
          },
          hintContainerStyle,
        ]}
        pointerEvents="none"
      >
        <HintChevron delay={0} fade={hintFade} />
        <HintChevron delay={140} fade={hintFade} />
        <HintChevron delay={280} fade={hintFade} />
      </Animated.View>

      {/* Center label */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: THUMB_SIZE + TRACK_PADDING + 14,
            right: 56,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          },
          labelStyle,
        ]}
        pointerEvents="none"
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 10.5,
            fontWeight: '700',
            letterSpacing: 1.8,
          }}
        >
          {completed && completedLabel ? completedLabel : label}
        </Text>
      </Animated.View>

      {/* Draggable thumb */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: accent,
              alignItems: 'center',
              justifyContent: 'center',
              // Subtle elevation only on the thumb itself.
              shadowColor: accent,
              shadowOpacity: 0.35,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 0 },
              elevation: 6,
            },
            progress,
          ]}
        >
          {/* Inner highlight ring — gives the thumb a slight 3-D feel */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 3,
                left: 3,
                right: 3,
                bottom: 3,
                borderRadius: (THUMB_SIZE - 6) / 2,
                borderWidth: 1,
                borderColor: '#ffffff',
              },
              thumbInnerHighlight,
            ]}
            pointerEvents="none"
          />
          {/* Inner darker ring — deepens the lower edge */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              right: 2,
              bottom: 2,
              borderRadius: (THUMB_SIZE - 4) / 2,
              borderWidth: 1,
              borderTopColor: 'transparent',
              borderLeftColor: 'transparent',
              borderRightColor: accentDeep,
              borderBottomColor: accentDeep,
              opacity: 0.45,
            }}
          />
          <Feather
            name={completed ? 'check' : icon}
            size={20}
            color={colors.bg}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
