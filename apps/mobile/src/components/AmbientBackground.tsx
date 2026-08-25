import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/src/theme/colors';

/**
 * The app's ground: a cool near-white wash with a warm glow falling across the
 * top-right corner.
 *
 * Every screen mounts its own copy, via `ambientScreenLayout`. One shared
 * layer behind the navigator would leave each screen transparent, and a stack
 * keeps the outgoing screen visible until its animation ends — so the old
 * content would show through the new one on every push.
 *
 * Two linear gradients stand in for one radial glow: the first carries the
 * warm light diagonally down-left and fades out; the second lifts the bottom
 * back toward cool. Layering them keeps the falloff soft — a single gradient
 * across the whole screen bands visibly on a near-white ground.
 *
 * Purely decorative, so it never takes touches.
 */
export function AmbientBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />

      {/* Warm light, strongest at the top-right, gone by mid-screen.
          start/end stay inside 0..1: an off-canvas start point makes
          expo-linear-gradient compute an empty ramp and draw nothing. */}
      <LinearGradient
        colors={[
          'rgba(251,232,201,0.95)',
          'rgba(250,240,224,0.70)',
          'rgba(238,241,247,0)',
        ]}
        locations={[0, 0.35, 0.85]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.1, y: 0.62 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Periwinkle in the top-left, opposite the warm light and across from
          the green. Held weaker than either: with three hues on one pale
          ground, a third at equal strength stops reading as light and starts
          reading as a stain. */}
      <LinearGradient
        colors={[
          'rgba(213,214,247,0.72)',
          'rgba(226,228,250,0.35)',
          'rgba(238,241,247,0)',
        ]}
        locations={[0, 0.3, 0.66]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.72, y: 0.62 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Cool settle through the middle so the warmth reads as a light source. */}
      <LinearGradient
        colors={['rgba(238,241,247,0)', 'rgba(224,231,244,0.65)']}
        locations={[0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Green rising out of the bottom-left corner, opposite the warm light.
          Kept pale and desaturated: it is the ground the white cards sit on,
          so any more saturation and the cards start reading as tinted. */}
      <LinearGradient
        colors={[
          'rgba(179,225,197,0.95)',
          'rgba(205,235,215,0.55)',
          'rgba(224,231,244,0)',
        ]}
        locations={[0, 0.32, 0.72]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.8, y: 0.1 }}
        style={StyleSheet.absoluteFill}
      />

    </View>
  );
}
