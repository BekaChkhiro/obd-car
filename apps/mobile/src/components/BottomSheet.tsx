import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/src/theme/colors';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Label for the closing button at the foot of the sheet. */
  closeLabel?: string;
  /**
   * Whether the foot of the sheet carries a dismiss button.
   *
   * True for sheets that only explain something — there the button is the
   * whole point. False for sheets whose body ends in its own action: a form
   * that already shows "Save" must not stack "Got it" underneath it, which
   * reads as two competing submits.
   */
  showCloseButton?: boolean;
}

/**
 * The shell every explanatory sheet in the app shares: grabber, title, close
 * control, a scrolling body and a dismiss button.
 *
 * Extracted so the sheets cannot drift apart — two hand-built sheets end up
 * with different corner radii and paddings within a few edits, and the
 * difference is only ever noticed by the user.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  closeLabel,
  showCloseButton = true,
}: BottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const label = closeLabel ?? t('common.gotIt');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Tapping the dimmed area closes — the expected way out of a sheet. */}
      <Pressable className="flex-1 bg-black/30" onPress={onClose} accessible={false}>
        <View className="flex-1" />
      </Pressable>

      <View
        className="rounded-t-3xl bg-surface px-5 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 8, maxHeight: '82%' }}
      >
        <View className="mb-4 h-1 w-10 self-center rounded-full bg-border-strong" />

        <View className="mb-4 flex-row items-center justify-between">
          <Text className="flex-1 text-lg font-bold text-text-primary">{title}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={10}
            className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
          >
            <Feather name="x" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>

        {showCloseButton ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="mt-4 items-center rounded-full bg-accent py-3.5 active:bg-accent-strong"
          >
            <Text className="text-[15px] font-bold text-on-accent">{label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}
