import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/src/store/auth';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  if (isHydrated && !user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'OBD Car' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="pair" options={{ title: 'Connect Adapter' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="threshold-settings" options={{ title: 'Alert Thresholds' }} />
      <Stack.Screen name="chat" options={{ title: 'AI Assistant' }} />
      <Stack.Screen name="history" options={{ title: 'Session History' }} />
      <Stack.Screen name="history/[id]" options={{ title: 'Session' }} />
    </Stack>
  );
}
