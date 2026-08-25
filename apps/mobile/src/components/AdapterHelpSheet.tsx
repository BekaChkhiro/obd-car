import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/src/theme/colors';
import { AmbientBackground } from '@/src/components/AmbientBackground';
import step1 from '@/assets/pair-step-1.png';
import step2 from '@/assets/pair-step-2.png';
import step3 from '@/assets/pair-step-3.png';
import step4 from '@/assets/pair-step-4.png';

interface AdapterHelpSheetProps {
  visible: boolean;
  onClose: () => void;
}

const ART = [step1, step2, step3, step4];

/** Where the trouble list belongs — it answers "I scanned and found nothing". */
const LAST_STEP = ART.length - 1;

function Dots({ active, total }: { active: number; total: number }) {
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={`h-1.5 rounded-full ${
            i === active ? 'w-5 bg-accent' : 'w-1.5 bg-border-strong'
          }`}
        />
      ))}
    </View>
  );
}

/**
 * How to get an adapter talking, one step to a screen.
 *
 * Full screen rather than a sheet because each step is carried by a picture of
 * the actual thing — the socket under the dash, the adapter going in — and at
 * sheet size those shrink to the point of being decoration. Someone reading
 * this is usually in the driver's seat looking for a socket they have never
 * noticed, so the picture is the instruction and the text is the caption.
 *
 * One step at a time for the same reason: the whole list at once invites
 * skimming, and every one of these steps is skipped by somebody.
 */
export function AdapterHelpSheet({ visible, onClose }: AdapterHelpSheetProps) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const [step, setStep] = useState(0);

  // Sized in points rather than as a percentage: a percentage width with an
  // aspect ratio leaves the image unconstrained here and it renders many
  // times its box. Capped against the height too, so the caption below still
  // fits on a short screen.
  const artSize = Math.min(width - 48, height * 0.36);

  // Reopening starts at the beginning: the guide is read when something is
  // wrong, and resuming halfway through hides the step that was skipped.
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const steps = [
    { title: t('pair.helpStep1Title'), body: t('pair.helpStep1Body') },
    { title: t('pair.helpStep2Title'), body: t('pair.helpStep2Body') },
    { title: t('pair.helpStep3Title'), body: t('pair.helpStep3Body') },
    { title: t('pair.helpStep4Title'), body: t('pair.helpStep4Body') },
  ];

  const troubles = [t('pair.helpTrouble1'), t('pair.helpTrouble2'), t('pair.helpTrouble3')];
  const current = steps[step];
  const isLast = step === LAST_STEP;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {/* A modal is its own native view hierarchy on iOS, and the app's
          safe-area provider does not measure inside it — without a provider of
          its own the insets come back as zero and the header sits under the
          status bar. */}
      <SafeAreaProvider>
        <View className="flex-1">
          <AmbientBackground />
          <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
            <View className="flex-row items-center justify-between px-5 pb-1 pt-2">
              <Text className="text-[11px] font-bold uppercase tracking-eyebrow text-text-muted">
                {t('pair.helpStepLabel', { current: step + 1, total: steps.length })}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                hitSlop={10}
                className="h-9 w-9 items-center justify-center rounded-full bg-surface active:opacity-70"
              >
                <Feather name="x" size={17} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Decorative: the caption below carries the same instruction. */}
              <Image
                source={ART[step]}
                style={{ width: artSize, height: artSize, alignSelf: 'center' }}
                resizeMode="contain"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />

              <Text className="mt-2 text-center text-[22px] font-bold text-text-primary">
                {current.title}
              </Text>
              <Text className="mt-2.5 text-center text-[14.5px] leading-[21px] text-text-secondary">
                {current.body}
              </Text>

              {isLast && (
                <View className="mt-6 rounded-2xl bg-warning-soft px-4 py-3.5">
                  <Text className="mb-2 text-[13px] font-bold text-warning">
                    {t('pair.helpTroubleTitle')}
                  </Text>
                  {troubles.map((line) => (
                    <View key={line} className="mb-1.5 flex-row gap-2">
                      <Text className="text-[13px] leading-[18px] text-text-secondary">•</Text>
                      <Text className="flex-1 text-[13px] leading-[18px] text-text-secondary">
                        {line}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View className="px-6 pb-3 pt-3">
              <Dots active={step} total={steps.length} />

              <View className="mt-4 flex-row items-center gap-3">
                {/* There is nothing to go back to on the first step, so the
                    control is left out entirely and the primary one takes the
                    full width. */}
                {step > 0 && (
                  <Pressable
                    onPress={() => setStep((s) => s - 1)}
                    accessibilityRole="button"
                    className="items-center justify-center rounded-full border border-border bg-surface px-7 py-4 active:bg-surface-muted"
                  >
                    <Text className="text-[15px] font-semibold text-text-secondary">
                      {t('common.back')}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => (isLast ? onClose() : setStep((s) => s + 1))}
                  accessibilityRole="button"
                  className="flex-1 items-center rounded-full bg-accent py-4 active:bg-accent-strong"
                >
                  <Text className="text-[15px] font-bold text-on-accent">
                    {isLast ? t('pair.helpDone') : t('common.next')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
