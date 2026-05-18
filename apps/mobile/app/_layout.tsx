import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/src/store/auth';

export default function RootLayout() {
  const { hydrate, isHydrated } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    // Render nothing while we load tokens from SecureStore.
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="index" redirect />
    </Stack>
  );
}
