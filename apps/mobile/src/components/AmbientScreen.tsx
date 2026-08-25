import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { AmbientBackground } from '@/src/components/AmbientBackground';

/**
 * The ground for one screen, plus the room its header takes up.
 *
 * This has to be a component rather than markup inlined into the layout
 * function below: React Navigation calls `screenLayout` directly, so anything
 * inlined there runs in the navigator's render and its hooks read the
 * navigator's context — `useHeaderHeight` would report the parent stack's
 * header, which is zero, and every screen would slide under its own header.
 * Returned as an element, this mounts inside the screen and sees the screen's.
 */
function AmbientScreen({ children }: { children: ReactNode }) {
  // Non-zero only where a header is actually shown: for a screen that hides
  // its own, this reports the parent's, which is zero at the top of the app.
  const headerHeight = useHeaderHeight();

  return (
    <View style={{ flex: 1 }}>
      <AmbientBackground />
      <View style={{ flex: 1, paddingTop: headerHeight }}>{children}</View>
    </View>
  );
}

/**
 * `screenLayout` for stacks whose screens paint no background of their own.
 *
 * A stack animates the incoming screen over the outgoing one and only hides
 * the outgoing screen once the animation ends. A screen with a transparent
 * background is therefore see-through for the whole push: the old content
 * shows through the new one and then blinks out, which reads as a rendering
 * fault rather than as a transition. Giving every screen its own copy of the
 * ground closes the gap. The layers are static views over an opaque base, so a
 * nested stack repainting what its parent already painted costs nothing and
 * looks identical.
 *
 * The stacks pair this with `headerTransparent`, so the content area covers
 * the full screen and the ground runs behind the header instead of stopping
 * below it and leaving the header strip bare.
 */
export function ambientScreenLayout({ children }: { children: ReactNode }) {
  return <AmbientScreen>{children}</AmbientScreen>;
}
