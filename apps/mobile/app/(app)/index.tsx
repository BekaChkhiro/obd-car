import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/auth';
import { useBleStore } from '@/src/store/ble';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const connectedDeviceId = useBleStore((s) => s.connectedDeviceId);

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-xl font-bold text-gray-900">OBD-II AI Diagnostic Assistant</Text>
      <Text className="mt-2 text-gray-500">Connect your ELM327 adapter to get started</Text>
      {user ? (
        <Text className="mt-4 text-sm text-gray-400">Signed in as {user.email}</Text>
      ) : null}

      <Pressable
        onPress={() => router.push('/(app)/pair')}
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3"
      >
        <Text className="text-sm font-medium text-white">
          {connectedDeviceId ? 'Adapter Connected — Manage' : 'Connect OBD Adapter'}
        </Text>
      </Pressable>

      {connectedDeviceId ? (
        <Text className="mt-2 text-xs text-green-600" numberOfLines={1}>
          {connectedDeviceId}
        </Text>
      ) : null}

      <Pressable
        onPress={() => router.push('/(app)/dashboard')}
        className="mt-3 rounded-xl bg-gray-900 px-6 py-3"
      >
        <Text className="text-sm font-medium text-white">Open Dashboard</Text>
      </Pressable>

      <Pressable
        onPress={logout}
        className="mt-4 rounded-xl border border-gray-300 px-6 py-3"
      >
        <Text className="text-sm font-medium text-gray-700">Sign out</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}
