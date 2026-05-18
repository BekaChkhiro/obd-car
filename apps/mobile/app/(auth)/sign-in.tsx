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
import * as WebBrowser from 'expo-web-browser';
import { useAuthRequest } from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { ApiError } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/auth';
import AuthInput from '@/src/components/AuthInput';

WebBrowser.maybeCompleteAuthSession();

function validate(email: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (!password) errors.password = 'Password is required';
  return errors;
}

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  const { login, googleSignIn, isLoading } = useAuthStore();

  const [, googleResponse, googlePromptAsync] = useAuthRequest({
    iosClientId: Constants.expoConfig?.extra?.googleIosClientId as string | undefined,
    androidClientId: Constants.expoConfig?.extra?.googleAndroidClientId as string | undefined,
  });

  async function handleLogin() {
    const errors = validate(email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setServerError('');
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  async function handleGoogle() {
    setServerError('');
    const result = await googlePromptAsync();
    if (result?.type === 'success') {
      const idToken = result.authentication?.idToken;
      if (!idToken) {
        setServerError('Google sign-in failed — no ID token received');
        return;
      }
      try {
        await googleSignIn(idToken);
      } catch (err) {
        setServerError(err instanceof ApiError ? err.message : 'Google sign-in failed');
      }
    }
  }

  // Pick up cancelled/dismissed results from googleResponse
  if (googleResponse?.type === 'error') {
    // Already handled above; show nothing extra.
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
        <Text className="mb-2 text-center text-3xl font-bold text-gray-900">Welcome back</Text>
        <Text className="mb-8 text-center text-gray-500">Sign in to your account</Text>

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
          textContentType="password"
          autoComplete="current-password"
          error={fieldErrors.password}
          placeholder="••••••••"
        />

        <Pressable
          onPress={handleLogin}
          disabled={isLoading}
          className="mb-4 items-center rounded-xl bg-blue-600 py-4 disabled:opacity-50"
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-semibold text-white">Sign in</Text>
          )}
        </Pressable>

        <View className="mb-6 flex-row items-center">
          <View className="flex-1 border-t border-gray-200" />
          <Text className="mx-3 text-sm text-gray-400">or</Text>
          <View className="flex-1 border-t border-gray-200" />
        </View>

        <Pressable
          onPress={handleGoogle}
          disabled={isLoading}
          className="mb-8 flex-row items-center justify-center rounded-xl border border-gray-300 bg-white py-4 disabled:opacity-50"
        >
          <Text className="text-base font-medium text-gray-700">Continue with Google</Text>
        </Pressable>

        <View className="flex-row justify-center">
          <Text className="text-sm text-gray-500">Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text className="text-sm font-semibold text-blue-600">Sign up</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
