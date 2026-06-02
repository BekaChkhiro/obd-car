import '../global.css';
import '@/src/lib/i18n';
import { initSentry, Sentry } from '@/src/lib/sentry';

initSentry();

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '@/src/store/auth';
import { SQLiteProvider } from '@/src/db';
import { runMigrations } from '@/src/db/migrations';
import { DB_NAME } from '@/src/db/database';
import { ToastProvider } from '@/src/components/ToastProvider';

function RootLayoutInner() {
  const { hydrate, isHydrated } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName={DB_NAME} onInit={runMigrations}>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="index" redirect />
          </Stack>
        </ToastProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayoutInner);
