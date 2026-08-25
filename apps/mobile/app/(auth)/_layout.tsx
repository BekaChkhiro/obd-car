import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/src/store/auth';
import { ambientScreenLayout } from '@/src/components/AmbientScreen';

export default function AuthLayout() {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  if (isHydrated && user) {
    return <Redirect href="/(app)/(tabs)/(home)" />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenLayout={ambientScreenLayout}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack>
    </>
  );
}
