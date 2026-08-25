import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/store/auth';
import { useOnboardingStore } from '@/src/store/onboarding';

export default function IndexRedirect() {
  const user = useAuthStore((s) => s.user);
  const hasOnboarded = useOnboardingStore((s) => s.hasOnboarded);
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!hasOnboarded) return <Redirect href="/(app)/onboarding" />;
  return <Redirect href="/(app)/(tabs)/(home)" />;
}
