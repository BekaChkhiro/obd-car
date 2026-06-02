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
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuthRequest } from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { colors } from '@/src/theme/colors';
import { ApiError } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/auth';
import { useOnboardingStore } from '@/src/store/onboarding';
import AuthInput from '@/src/components/AuthInput';
import { isE2E } from '@/src/lib/e2e';

WebBrowser.maybeCompleteAuthSession();

type Translate = ReturnType<typeof useTranslation>['t'];

function validate(email: string, password: string, t: Translate): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!email.trim()) errors.email = t('auth.emailRequired');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = t('auth.emailInvalid');
  if (!password) errors.password = t('auth.passwordRequired');
  return errors;
}

export default function SignInScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { login, googleSignIn, isLoading, e2eSignIn } = useAuthStore();
  const markOnboarded = useOnboardingStore((s) => s.markOnboarded);

  function handleE2eSignIn() {
    e2eSignIn();
    markOnboarded();
  }

  const [, googleResponse, googlePromptAsync] = useAuthRequest({
    iosClientId: Constants.expoConfig?.extra?.googleIosClientId as string | undefined,
    androidClientId: Constants.expoConfig?.extra?.googleAndroidClientId as string | undefined,
  });

  async function handleLogin() {
    const errors = validate(email, password, t);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setServerError('');
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('auth.genericError'));
    }
  }

  async function handleGoogle() {
    setServerError('');
    setIsGoogleLoading(true);
    try {
      const result = await googlePromptAsync();
      if (result?.type === 'success') {
        const idToken = result.authentication?.idToken;
        if (!idToken) {
          setServerError(t('auth.googleNoToken'));
          return;
        }
        await googleSignIn(idToken);
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('auth.googleFailed'));
    } finally {
      setIsGoogleLoading(false);
    }
  }

  // Pick up cancelled/dismissed results from googleResponse
  if (googleResponse?.type === 'error') {
    // Already handled above; show nothing extra.
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-center text-[10px] font-bold tracking-[3px] text-zinc-500">
          {t('garage.brand')}
        </Text>
        <Text className="mt-2 text-center text-3xl font-bold text-zinc-50">{t('auth.welcomeBack')}</Text>
        <Text className="mb-8 mt-2 text-center text-sm text-zinc-500">
          {t('auth.signInSubtitle')}
        </Text>

        {serverError ? (
          <View className="mb-4 flex-row items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
            <Feather name="alert-circle" size={16} color={colors.danger} />
            <Text className="flex-1 text-sm text-red-300">{serverError}</Text>
          </View>
        ) : null}

        <AuthInput
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          error={fieldErrors.email}
          placeholder="you@example.com"
        />

        <AuthInput
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          error={fieldErrors.password}
          placeholder="••••••••"
        />

        <Pressable
          onPress={handleLogin}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={t('auth.signIn')}
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
          className="mb-4 items-center rounded-xl bg-cyan-500 py-4 active:bg-cyan-600 disabled:opacity-50"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text className="text-base font-bold tracking-wider text-zinc-950">{t('auth.signIn')}</Text>
          )}
        </Pressable>

        <View className="mb-6 flex-row items-center">
          <View className="flex-1 border-t border-zinc-800" />
          <Text className="mx-3 text-[10px] font-semibold tracking-widest text-zinc-600">{t('common.or')}</Text>
          <View className="flex-1 border-t border-zinc-800" />
        </View>

        <Pressable
          onPress={handleGoogle}
          disabled={isLoading || isGoogleLoading}
          accessibilityRole="button"
          accessibilityLabel={t('auth.continueWithGoogle')}
          accessibilityState={{ disabled: isLoading || isGoogleLoading, busy: isGoogleLoading }}
          className="mb-8 flex-row items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 py-4 active:bg-zinc-900 disabled:opacity-50"
        >
          {isGoogleLoading ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Text className="text-sm font-semibold text-zinc-200">{t('auth.continueWithGoogle')}</Text>
          )}
        </Pressable>

        <View className="flex-row justify-center">
          <Text className="text-sm text-zinc-500">{t('auth.noAccount')} </Text>
          <Link href="/(auth)/sign-up">
            <Text className="text-sm font-semibold text-cyan-400">{t('auth.signUp')}</Text>
          </Link>
        </View>

        {isE2E() && (
          <Pressable
            testID="e2e-skip-sign-in"
            onPress={handleE2eSignIn}
            className="mt-8 items-center rounded-xl bg-violet-600 py-3"
          >
            <Text className="text-sm font-semibold text-white">E2E: Skip sign-in</Text>
          </Pressable>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
