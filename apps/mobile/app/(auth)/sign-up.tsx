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
import { colors } from '@/src/theme/colors';
import { ApiError } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/auth';
import AuthInput from '@/src/components/AuthInput';

type Translate = ReturnType<typeof useTranslation>['t'];

function validate(
  email: string,
  password: string,
  confirm: string,
  t: Translate,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!email.trim()) errors.email = t('auth.emailRequired');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = t('auth.emailInvalid');
  if (!password) errors.password = t('auth.passwordRequired');
  else if (password.length < 8) errors.password = t('auth.passwordTooShort');
  if (!confirm) errors.confirm = t('auth.confirmRequired');
  else if (password !== confirm) errors.confirm = t('auth.passwordsMismatch');
  return errors;
}

export default function SignUpScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  const { register, isLoading } = useAuthStore();

  async function handleRegister() {
    const errors = validate(email, password, confirm, t);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setServerError('');
    try {
      await register(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('auth.genericError');
      setServerError(msg === 'email already registered' ? t('auth.emailInUse') : msg);
    }
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
        <Text className="mt-2 text-center text-3xl font-bold text-zinc-50">{t('auth.createAccount')}</Text>
        <Text className="mb-8 mt-2 text-center text-sm text-zinc-500">
          {t('auth.signUpSubtitle')}
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
          textContentType="newPassword"
          autoComplete="new-password"
          error={fieldErrors.password}
          placeholder={t('auth.passwordHint')}
        />

        <AuthInput
          label={t('auth.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          error={fieldErrors.confirm}
          placeholder="••••••••"
        />

        <Pressable
          onPress={handleRegister}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={t('auth.createAccount')}
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
          className="mb-8 items-center rounded-xl bg-cyan-500 py-4 active:bg-cyan-600 disabled:opacity-50"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text className="text-base font-bold tracking-wider text-zinc-950">{t('auth.createAccount')}</Text>
          )}
        </Pressable>

        <View className="flex-row justify-center">
          <Text className="text-sm text-zinc-500">{t('auth.hasAccount')} </Text>
          <Link href="/(auth)/sign-in">
            <Text className="text-sm font-semibold text-cyan-400">{t('auth.signIn')}</Text>
          </Link>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
