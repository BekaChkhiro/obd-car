import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CodeInput } from '@/src/components/CodeInput';
import { colors } from '@/src/theme/colors';
import { useCountdown } from '@/src/hooks/useCountdown';

interface AuthCodeStepProps {
  /** Formatted for display, e.g. "+995 555 123 456". */
  phoneDisplay: string;
  code: string;
  onChangeCode: (code: string) => void;
  onComplete: (code: string) => void;
  onResend: () => void;
  onChangePhone: () => void;
  isLoading: boolean;
  /** Whether the last submitted code was rejected — shown as a banner by the caller. */
  hasError?: boolean;
  /** Seconds until resend is allowed again, from the server's `resend_after`. */
  resendAfter: number;
  /** Bumped every time a code is (re)sent, to restart the countdown. */
  sendKey: number;
}

/**
 * The code-entry half of both auth screens — identical for sign-in and
 * register, so it lives once rather than drifting between two copies.
 */
export function AuthCodeStep({
  phoneDisplay,
  code,
  onChangeCode,
  onComplete,
  onResend,
  onChangePhone,
  isLoading,
  hasError,
  resendAfter,
  sendKey,
}: AuthCodeStepProps) {
  const { t } = useTranslation();
  const secondsLeft = useCountdown(resendAfter, sendKey);
  const canResend = secondsLeft <= 0 && !isLoading;

  return (
    <View>
      <View className="mb-5 rounded-2xl bg-success-soft px-4 py-3">
        <Text className="text-[13px] leading-[18px] text-text-secondary">
          {t('auth.codeSentTo', { phone: phoneDisplay })}
        </Text>
      </View>

      <CodeInput
        length={4}
        label={t('auth.codeLabel')}
        value={code}
        onChangeText={onChangeCode}
        onComplete={onComplete}
        hasError={hasError}
        editable={!isLoading}
        autoFocus
      />

      {isLoading ? (
        <View className="mb-5 flex-row items-center justify-center gap-2 py-2">
          <ActivityIndicator color={colors.textSecondary} />
          <Text className="text-sm text-text-muted">{t('auth.verifying')}</Text>
        </View>
      ) : null}

      <View className="mb-2 flex-row items-center justify-between">
        <Pressable
          onPress={onChangePhone}
          accessibilityRole="button"
          accessibilityLabel={t('auth.changePhone')}
          hitSlop={8}
          className="active:opacity-60"
        >
          <Text className="text-sm font-semibold text-accent">{t('auth.changePhone')}</Text>
        </Pressable>

        <Pressable
          onPress={onResend}
          disabled={!canResend}
          accessibilityRole="button"
          accessibilityLabel={t('auth.resendCode')}
          accessibilityState={{ disabled: !canResend }}
          hitSlop={8}
          className="active:opacity-60 disabled:opacity-50"
        >
          <Text
            className={`text-sm font-semibold ${canResend ? 'text-accent' : 'text-text-dim'}`}
          >
            {canResend ? t('auth.resendCode') : t('auth.resendIn', { seconds: secondsLeft })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
