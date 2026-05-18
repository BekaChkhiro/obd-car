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
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-2 text-center text-3xl font-bold text-gray-900">Create account</Text>
        <Text className="mb-8 text-center text-gray-500">
          Start your OBD-II diagnostic journey
        </Text>

        {serverError ? (
          <View className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-sm text-red-700">{serverError}</Text>
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
          className="mb-8 items-center rounded-xl bg-blue-600 py-4 disabled:opacity-50"
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-semibold text-white">Create account</Text>
          )}
        </Pressable>

        <View className="flex-row justify-center">
          <Text className="text-sm text-gray-500">Already have an account? </Text>
          <Link href="/(auth)/sign-in">
            <Text className="text-sm font-semibold text-blue-600">Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
