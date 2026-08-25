import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/src/store/auth';
import { colors } from '@/src/theme/colors';
import { ambientScreenLayout } from '@/src/components/AmbientScreen';

export default function AppLayout() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  if (isHydrated && !user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenLayout={ambientScreenLayout}
        screenOptions={{
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: '600', fontSize: 16 },
          headerShadowVisible: false,
          // The ground is painted inside each screen; without this the
          // content area stops below the header and the strip goes bare.
          headerTransparent: true,
          // Without this the back control falls back to the previous route's
          // file name, which showed up on screen as "(tabs)".
          headerBackTitle: t('common.back'),
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen
          name="threshold-settings"
          options={{ title: t('thresholds.title') }}
        />
      </Stack>
    </>
  );
}
