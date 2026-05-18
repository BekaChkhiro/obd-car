import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/src/store/auth';

export default function HomeScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-xl font-bold text-gray-900">OBD-II AI Diagnostic Assistant</Text>
      <Text className="mt-2 text-gray-500">Connect your ELM327 adapter to get started</Text>
      {user ? (
        <Text className="mt-4 text-sm text-gray-400">Signed in as {user.email}</Text>
      ) : null}
      <Pressable
        onPress={logout}
        className="mt-8 rounded-xl border border-gray-300 px-6 py-3"
      >
        <Text className="text-sm font-medium text-gray-700">Sign out</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}
