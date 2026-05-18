import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-bold text-gray-900">OBD-II AI Diagnostic Assistant</Text>
      <Text className="mt-2 text-gray-500">Connect your ELM327 adapter to get started</Text>
      <StatusBar style="auto" />
    </View>
  );
}
