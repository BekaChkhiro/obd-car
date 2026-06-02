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
import { Link } from 'expo-router';
import { ApiError } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/auth';
import AuthInput from '@/src/components/AuthInput';

function validate(
  email: string,
  password: string,
  confirm: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (!confirm) errors.confirm = 'Please confirm your password';
  else if (password !== confirm) errors.confirm = 'Passwords do not match';
  return errors;
}

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  const { register, isLoading } = useAuthStore();

  async function handleRegister() {
    const errors = validate(email, password, confirm);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setServerError('');
    try {
      await register(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong';
      setServerError(msg === 'email already registered' ? 'This email is already in use' : msg);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#08080a]"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-center text-[10px] font-bold tracking-[3px] text-zinc-500">
          OBD-II  ·  DIAGNOSTICS
        </Text>
        <Text className="mt-2 text-center text-3xl font-bold text-zinc-50">Create account</Text>
        <Text className="mb-8 mt-2 text-center text-sm text-zinc-500">
          Start your OBD-II diagnostic journey
        </Text>

        {serverError ? (
          <View className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
            <Text className="text-sm text-red-300">{serverError}</Text>
          </View>
        ) : null}

        <AuthInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          error={fieldErrors.email}
          placeholder="you@example.com"
        />

        <AuthInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          error={fieldErrors.password}
          placeholder="Min. 8 characters"
        />

        <AuthInput
          label="Confirm password"
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
          className="mb-8 items-center rounded-xl bg-cyan-500 py-4 active:bg-cyan-600 disabled:opacity-50"
        >
          {isLoading ? (
            <ActivityIndicator color="#08080a" />
          ) : (
            <Text className="text-base font-bold tracking-wider text-zinc-950">CREATE ACCOUNT</Text>
          )}
        </Pressable>

        <View className="flex-row justify-center">
          <Text className="text-sm text-zinc-500">Already have an account? </Text>
          <Link href="/(auth)/sign-in">
            <Text className="text-sm font-semibold text-cyan-400">Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
