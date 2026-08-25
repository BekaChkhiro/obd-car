import type { ReactNode } from 'react';
import { Image, Text, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import noConnectionArt from '@/assets/no-connection.png';

interface NoAdapterStateProps {
  title: string;
  body: string;
  /** The actions offered instead — usually a button leading to pairing. */
  children: ReactNode;
}

/**
 * What a screen shows when it has nothing to show, because no adapter is
 * linked.
 *
 * Three screens reach this state — the assistant, the live data page and the
 * trouble codes page — and each was drawing its own small icon, so they had
 * drifted into three different sizes and shapes for the same message. Sharing
 * one component keeps them identical and gives the illustration a single place
 * to live.
 */
export function NoAdapterState({ title, body, children }: NoAdapterStateProps) {
  // The floating bar overlaps the bottom of this view, so centring against the
  // full height would leave the content low in what is actually visible.
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ paddingBottom: tabBarHeight }}
    >
      {/* Decorative: the heading below says the same thing in words. */}
      <Image
        source={noConnectionArt}
        style={{ width: 300, height: 354 }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text className="text-center text-xl font-bold text-text-primary">{title}</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-text-muted">{body}</Text>
      <View className="mt-6 w-full items-center">{children}</View>
    </View>
  );
}
