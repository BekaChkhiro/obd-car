import { Stack } from 'expo-router';
import { colors } from '@/src/theme/colors';

export default function AILayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600', fontSize: 16 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
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
