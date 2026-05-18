import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/src/store/auth';
import { SQLiteProvider } from '@/src/db';
import { runMigrations } from '@/src/db/migrations';
import { DB_NAME } from '@/src/db/database';

export default function RootLayout() {
  const { hydrate, isHydrated } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    return null;
  }

  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={runMigrations}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="index" redirect />
      </Stack>
    </SQLiteProvider>
  );
}
