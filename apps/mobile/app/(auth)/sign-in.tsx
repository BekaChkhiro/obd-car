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
import { useOnboardingStore } from '@/src/store/onboarding';
import AuthInput from '@/src/components/AuthInput';
import { isE2E } from '@/src/lib/e2e';

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
        <Text className="mt-2 text-center text-3xl font-bold text-zinc-50">Welcome back</Text>
        <Text className="mb-8 mt-2 text-center text-sm text-zinc-500">
          Sign in to your account
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
          textContentType="password"
          autoComplete="current-password"
          error={fieldErrors.password}
          placeholder="••••••••"
        />

        <Pressable
          onPress={handleLogin}
          disabled={isLoading}
          className="mb-4 items-center rounded-xl bg-cyan-500 py-4 active:bg-cyan-600 disabled:opacity-50"
        >
          {isLoading ? (
            <ActivityIndicator color="#08080a" />
          ) : (
            <Text className="text-base font-bold tracking-wider text-zinc-950">SIGN IN</Text>
          )}
        </Pressable>

        <View className="mb-6 flex-row items-center">
          <View className="flex-1 border-t border-zinc-800" />
          <Text className="mx-3 text-[10px] font-semibold tracking-widest text-zinc-600">OR</Text>
          <View className="flex-1 border-t border-zinc-800" />
        </View>

        <Pressable
          onPress={handleGoogle}
          disabled={isLoading}
          className="mb-8 flex-row items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 py-4 active:bg-zinc-900 disabled:opacity-50"
        >
          <Text className="text-sm font-semibold text-zinc-200">Continue with Google</Text>
        </Pressable>

        <View className="flex-row justify-center">
          <Text className="text-sm text-zinc-500">Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text className="text-sm font-semibold text-cyan-400">Sign up</Text>
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
  );
}
