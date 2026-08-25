import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/src/theme/colors';
import { ambientScreenLayout } from '@/src/components/AmbientScreen';

export default function HomeStackLayout() {
  const { t } = useTranslation();

  return (
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
        // file name — the user was seeing "index".
        headerBackTitle: t('common.back'),
        // Transparent: the ground is painted per screen by
        // screenLayout, so a push cannot show the screen underneath.
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="pair" options={{ title: t('pair.headerTitle') }} />
      <Stack.Screen name="codes" options={{ title: t('codes.title') }} />
    </Stack>
  );
}
