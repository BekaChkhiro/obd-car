import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Link, useRouter } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { ApiError } from '@/src/lib/api';
import { describeAuthError } from '@/src/lib/auth-errors';
import { formatGeorgianPhone, isValidGeorgianMobile, toE164 } from '@/src/lib/phone';
import { useAuthStore } from '@/src/store/auth';
import { useOnboardingStore } from '@/src/store/onboarding';
import PhoneInput from '@/src/components/PhoneInput';
import { AuthCodeStep } from '@/src/components/AuthCodeStep';
import { isE2E } from '@/src/lib/e2e';

type Step = 'phone' | 'code';

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { requestCode, verifyCode, isLoading, e2eSignIn } = useAuthStore();
  const markOnboarded = useOnboardingStore((s) => s.markOnboarded);

  const [step, setStep] = useState<Step>('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [serverError, setServerError] = useState('');
  const [resendAfter, setResendAfter] = useState(60);
  const [sendKey, setSendKey] = useState(0);

  function handleE2eSignIn() {
    e2eSignIn();
    markOnboarded();
  }

  async function sendCode() {
    if (!isValidGeorgianMobile(phoneDigits)) {
      setPhoneError(t('auth.phoneInvalid'));
      return;
    }
    setPhoneError('');
    setServerError('');
    try {
      const res = await requestCode(toE164(phoneDigits));
      setResendAfter(res.resend_after);
      setSendKey((k) => k + 1);
      setCode('');
      setStep('code');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // The number has no account, and the server said so before sending
        // anything. Going straight to the register screen with the digits
        // already filled in is the whole point of learning it this early —
        // the alternative was an SMS whose only possible outcome was this.
        router.push({ pathname: '/(auth)/sign-up', params: { phone: phoneDigits } });
        return;
      }
      setServerError(describeAuthError(err, t));
    }
  }

  function handleChangeCode(next: string) {
    setCode(next);
    // Typing again after a rejected code is the retry — the red boxes and
    // banner have done their job once the person has acted on them.
    if (serverError) setServerError('');
  }

  async function handleVerify(enteredCode: string) {
    setServerError('');
    try {
      await verifyCode(toE164(phoneDigits), enteredCode);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // This phone has no account — the code was valid, there is just
        // nothing to sign into. Carrying the phone forward means the person
        // never retypes the nine digits they already got right.
        router.push({ pathname: '/(auth)/sign-up', params: { phone: phoneDigits } });
        return;
      }
      setCode('');
      setServerError(describeAuthError(err, t));
    }
  }

  return (
    <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-center text-[10px] font-bold tracking-[3px] text-text-muted">
            {t('garage.brand')}
          </Text>
          <Text className="mt-2 text-center text-3xl font-bold text-text-primary">
            {t('auth.welcomeBack')}
          </Text>
          <Text className="mb-8 mt-2 text-center text-sm text-text-muted">
            {step === 'phone' ? t('auth.signInSubtitle') : t('auth.enterCodeSubtitle')}
          </Text>

          {serverError ? (
            <View className="mb-4 flex-row items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text className="flex-1 text-sm text-danger">{serverError}</Text>
            </View>
          ) : null}

          {step === 'phone' ? (
            <>
              <PhoneInput
                label={t('auth.phone')}
                value={phoneDigits}
                onChangeText={setPhoneDigits}
                error={phoneError}
                editable={!isLoading}
                autoFocus
              />

              <Pressable
                onPress={() => void sendCode()}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel={t('auth.continue')}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                className="mb-8 items-center rounded-xl bg-accent py-4 active:bg-accent-strong disabled:opacity-50"
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text className="text-base font-bold tracking-wider text-on-accent">
                    {t('auth.continue')}
                  </Text>
                )}
              </Pressable>

              <View className="flex-row justify-center">
                <Text className="text-sm text-text-muted">{t('auth.noAccount')} </Text>
                <Link href="/(auth)/sign-up">
                  <Text className="text-sm font-semibold text-accent">{t('auth.signUp')}</Text>
                </Link>
              </View>
            </>
          ) : (
            <AuthCodeStep
              phoneDisplay={`+995 ${formatGeorgianPhone(phoneDigits)}`}
              code={code}
              onChangeCode={handleChangeCode}
              onComplete={(c) => void handleVerify(c)}
              onResend={() => void sendCode()}
              onChangePhone={() => {
                setStep('phone');
                setCode('');
                setServerError('');
              }}
              isLoading={isLoading}
              hasError={!!serverError}
              resendAfter={resendAfter}
              sendKey={sendKey}
            />
          )}

          {isE2E() && (
            <Pressable
              testID="e2e-skip-sign-in"
              onPress={handleE2eSignIn}
              className="mt-8 items-center rounded-xl bg-info py-3"
            >
              <Text className="text-sm font-semibold text-text-primary">E2E: Skip sign-in</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
