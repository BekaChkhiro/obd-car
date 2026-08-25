import { Stack } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { ambientScreenLayout } from '@/src/components/AmbientScreen';

export default function AILayout() {
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
        // Transparent: the ground is painted per screen by
        // screenLayout, so a push cannot show the screen underneath.
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="history/index"
        options={{ title: 'Session history' }}
      />
      <Stack.Screen name="history/[id]" options={{ title: 'Session' }} />
    </Stack>
  );
}
