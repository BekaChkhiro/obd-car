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
import { Link, useLocalSearchParams } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { describeAuthError } from '@/src/lib/auth-errors';
import { formatGeorgianPhone, isValidGeorgianMobile, toE164 } from '@/src/lib/phone';
import { useAuthStore } from '@/src/store/auth';
import AuthInput from '@/src/components/AuthInput';
import PhoneInput from '@/src/components/PhoneInput';
import { AuthCodeStep } from '@/src/components/AuthCodeStep';

type Step = 'details' | 'code';
type Translate = ReturnType<typeof useTranslation>['t'];

function validate(
  firstName: string,
  lastName: string,
  phoneDigits: string,
  t: Translate,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!firstName.trim()) errors.firstName = t('auth.firstNameRequired');
  if (!lastName.trim()) errors.lastName = t('auth.lastNameRequired');
  if (!isValidGeorgianMobile(phoneDigits)) errors.phone = t('auth.phoneInvalid');
  return errors;
}

export default function SignUpScreen() {
  const { t } = useTranslation();
  // Arrives pre-filled when sign-in found this phone has no account —
  // typing nine digits correctly once should be enough.
  const params = useLocalSearchParams<{ phone?: string }>();
  const { requestCode, verifyCode, isLoading } = useAuthStore();

  const [step, setStep] = useState<Step>('details');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState(params.phone ?? '');
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [resendAfter, setResendAfter] = useState(60);
  const [sendKey, setSendKey] = useState(0);

  async function sendCode() {
    const errors = validate(firstName, lastName, phoneDigits, t);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setServerError('');
    try {
      const res = await requestCode(toE164(phoneDigits), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setResendAfter(res.resend_after);
      setSendKey((k) => k + 1);
      setCode('');
      setStep('code');
    } catch (err) {
      setServerError(describeAuthError(err, t));
    }
  }

  function handleChangeCode(next: string) {
    setCode(next);
    if (serverError) setServerError('');
  }

  async function handleVerify(enteredCode: string) {
    setServerError('');
    try {
      await verifyCode(toE164(phoneDigits), enteredCode);
    } catch (err) {
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
            {t('auth.createAccount')}
          </Text>
          <Text className="mb-8 mt-2 text-center text-sm text-text-muted">
            {step === 'details' ? t('auth.signUpSubtitle') : t('auth.enterCodeSubtitle')}
          </Text>

          {serverError ? (
            <View className="mb-4 flex-row items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text className="flex-1 text-sm text-danger">{serverError}</Text>
            </View>
          ) : null}

          {step === 'details' ? (
            <>
              <AuthInput
                label={t('auth.firstName')}
                value={firstName}
                onChangeText={setFirstName}
                textContentType="givenName"
                autoComplete="given-name"
                autoCapitalize="words"
                error={fieldErrors.firstName}
                editable={!isLoading}
              />

              <AuthInput
                label={t('auth.lastName')}
                value={lastName}
                onChangeText={setLastName}
                textContentType="familyName"
                autoComplete="family-name"
                autoCapitalize="words"
                error={fieldErrors.lastName}
                editable={!isLoading}
              />

              <PhoneInput
                label={t('auth.phone')}
                value={phoneDigits}
                onChangeText={setPhoneDigits}
                error={fieldErrors.phone}
                editable={!isLoading}
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
                <Text className="text-sm text-text-muted">{t('auth.hasAccount')} </Text>
                <Link href="/(auth)/sign-in">
                  <Text className="text-sm font-semibold text-accent">{t('auth.signIn')}</Text>
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
                setStep('details');
                setCode('');
                setServerError('');
              }}
              isLoading={isLoading}
              hasError={!!serverError}
              resendAfter={resendAfter}
              sendKey={sendKey}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
