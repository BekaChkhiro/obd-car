import { useEffect, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/src/theme/colors';
import { useChatStore } from '@/src/store/chat';
import { useTabHistory } from '@/src/store/tab-history';
import { useBleStore } from '@/src/store/ble';
import { useRouter } from 'expo-router';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Icon pairs rather than one outline icon tinted two ways. Weight carries the
 * selected state as clearly as colour does, which keeps the affordance for
 * anyone who cannot separate the accent from the grey.
 */
const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  '(home)': { active: 'car-sport', inactive: 'car-sport-outline' },
  dashboard: { active: 'speedometer', inactive: 'speedometer-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
};

/** Route lifted out of the pill and onto the accent button beside it. */
const FEATURED_ROUTE = 'ai';

const PILL_HEIGHT = 64;
const FAB_SIZE = PILL_HEIGHT;
const MAX_CHARS = 1000;

/**
 * The bar is opaque, not frosted.
 *
 * A translucent fill let page content read straight through the bar — a
 * heading scrolling underneath showed up as ghost text behind the labels,
 * which is worse than no glass at all. Without a real blur pane behind it
 * (both blur libraries fail to link under this Xcode) translucency has nothing
 * to soften what shows through, so the fill is solid instead.
 *
 * The track is the muted surface and the selected item is white, the way a
 * segmented control is built: the selection reads as lifted out of the track
 * rather than tinted, and the bar still sits clearly above the pale gradient.
 */

const BAR_FILL = colors.surfaceMuted;
/** A hairline edge is what keeps the shape a pane rather than a smudge. */
const BAR_EDGE = colors.border;

const SHADOW = Platform.select({
  ios: {
    shadowColor: colors.accent,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 10 },
  default: {},
});

/** Keyboard height, so the bar can ride above it instead of being covered. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // `will*` on iOS so the bar moves with the keyboard rather than after it;
    // Android only emits `did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) =>
      setHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/**
 * Floating bottom navigation that becomes the chat composer on the assistant
 * tab.
 *
 * Two things share one piece of screen because they are never both wanted at
 * once: on the assistant tab the destinations are noise and the message field
 * is the whole point, so the pill becomes the field and the accent button
 * becomes send. Keeping a separate composer inside the chat screen would put
 * two bars at the bottom, and the tab bar would be the one covering the input.
 *
 * The bar is a normal flex child, not absolutely positioned, so the navigator
 * still reserves its height and screen content is never hidden underneath it.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const keyboardHeight = useKeyboardHeight();

  const isStreaming = useChatStore((s) => s.isStreaming);
  const connection = useChatStore((s) => s.connection);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const abort = useChatStore((s) => s.abort);

  const [draft, setDraft] = useState('');

  // The assistant is only useful once it has a car to read, so the composer
  // stays shut until there is one — a field that accepts a question the
  // assistant cannot ground is worse than no field.
  const carConnected = useBleStore((s) => s.connectedDeviceId) !== null;
  const router = useRouter();

  const focusedRoute = state.routes[state.index];
  const composing = focusedRoute?.name === FEATURED_ROUTE;

  // Only the bar sees tab transitions, so it is what records them for the
  // assistant's back control.
  const visitTab = useTabHistory((s) => s.visit);
  useEffect(() => {
    if (focusedRoute?.name) visitTab(focusedRoute.name);
  }, [focusedRoute?.name, visitTab]);

  const pillRoutes = state.routes.filter((r) => r.name !== FEATURED_ROUTE);
  const featured = state.routes.find((r) => r.name === FEATURED_ROUTE);

  const overLimit = draft.length > MAX_CHARS;
  const canSend =
    carConnected &&
    draft.trim().length > 0 &&
    !isStreaming &&
    !overLimit &&
    connection === 'connected';

  const go = (routeKey: string, routeName: string, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    sendUserMessage(draft.trim());
    setDraft('');
  };

  const openAssistant = () => {
    if (featured) go(featured.key, featured.name, false);
  };

  const circleLabel = composing
    ? isStreaming
      ? t('chat.stopGenerating')
      : t('chat.send')
    : (typeof descriptors[featured?.key ?? '']?.options.title === 'string'
        ? (descriptors[featured!.key]!.options.title as string)
        : 'AI');

  return (
    <View
      style={{
        // Out of flow: the bar floats over the page instead of taking a strip
        // of it. Screens reserve room for it through useBottomTabBarHeight(),
        // so content still scrolls clear of the bar rather than under it.
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 8,
        // A floating bar needs air beneath it; without this it reads as a bar
        // that failed to reach the bottom of the screen.
        paddingBottom: Math.max(insets.bottom, 12),
        // The bar sits outside the screen's keyboard-avoiding view, so it has
        // to clear the keyboard itself or the field it owns ends up under it.
        marginBottom: keyboardHeight > 0 ? keyboardHeight - insets.bottom : 0,
        backgroundColor: 'transparent',
      }}
    >
      <View
        style={[
          {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: PILL_HEIGHT,
            borderRadius: PILL_HEIGHT / 2,
            paddingHorizontal: composing ? 20 : 6,
            borderWidth: 1,
            borderColor: overLimit ? colors.danger : BAR_EDGE,
            overflow: 'hidden',
          },
          SHADOW,
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: composing ? colors.surface : BAR_FILL },
          ]}
          pointerEvents="none"
        />

        {composing && !carConnected ? (
          <Pressable
            onPress={() => router.push('/pair')}
            accessibilityRole="button"
            accessibilityLabel={t('chat.gateCta')}
            className="flex-1 flex-row items-center gap-2 py-3"
          >
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text className="text-[15px] text-text-muted">{t('chat.gateComposer')}</Text>
          </Pressable>
        ) : composing ? (
          <TextInput
            style={{
              flex: 1,
              fontSize: 15,
              lineHeight: 20,
              color: colors.textPrimary,
              paddingVertical: Platform.OS === 'ios' ? 12 : 8,
              maxHeight: 120,
            }}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.textDim}
            value={draft}
            onChangeText={setDraft}
            multiline
            accessibilityLabel={t('chat.placeholder')}
            returnKeyType="default"
            blurOnSubmit={false}
          />
        ) : (
          pillRoutes.map((route) => {
            const { options } = descriptors[route.key]!;
            const isFocused = focusedRoute?.key === route.key;
            const label =
              typeof options.title === 'string' ? options.title : route.name;
            const icon = ICONS[route.name];

            return (
              <Pressable
                key={route.key}
                onPress={() => go(route.key, route.name, isFocused)}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={label}
                style={{
                  flex: 1,
                  height: PILL_HEIGHT - 12,
                  borderRadius: (PILL_HEIGHT - 12) / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  backgroundColor: isFocused ? colors.surface : 'transparent',
                }}
              >
                <Ionicons
                  name={
                    isFocused
                      ? icon?.active ?? 'ellipse'
                      : icon?.inactive ?? 'ellipse-outline'
                  }
                  size={21}
                  color={isFocused ? colors.accent : colors.textMuted}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 11,
                    fontWeight: isFocused ? '700' : '500',
                    color: isFocused ? colors.accent : colors.textMuted,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>

      {featured ? (
        <Pressable
          onPress={
            composing ? (isStreaming ? abort : handleSend) : openAssistant
          }
          // Only the send state can be unavailable; the tab itself is always
          // reachable, and a dead-looking button would suggest otherwise.
          disabled={composing && !isStreaming && !canSend}
          accessibilityRole="button"
          accessibilityLabel={circleLabel}
          accessibilityState={{
            disabled: composing && !isStreaming && !canSend,
            selected: !composing && focusedRoute?.name === FEATURED_ROUTE,
          }}
          // Static style, not the `({ pressed }) => …` form: under NativeWind's
          // transform the function variant silently drops the resolved
          // background and the button renders as a floating icon.
          style={[
            {
              width: FAB_SIZE,
              height: FAB_SIZE,
              flexGrow: 0,
              flexShrink: 0,
              alignSelf: 'center',
              borderRadius: FAB_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: composing
                ? isStreaming
                  ? colors.danger
                  : canSend
                    ? colors.accent
                    : colors.surfaceSunken
                : colors.accent,
            },
            SHADOW,
          ]}
        >
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
          {composing ? (
            isStreaming ? (
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  backgroundColor: colors.onAccent,
                }}
              />
            ) : (
              <Ionicons
                name="arrow-up"
                size={24}
                color={canSend ? colors.onAccent : colors.textMuted}
              />
            )
          ) : (
            <>
              <Ionicons name="sparkles" size={19} color={colors.onAccent} />
              <Text
                style={{
                  marginTop: 1,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                  color: colors.onAccent,
                }}
              >
                AI
              </Text>
            </>
          )}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
