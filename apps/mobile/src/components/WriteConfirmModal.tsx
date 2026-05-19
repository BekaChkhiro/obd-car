import { Modal, Pressable, Text, View } from 'react-native';

interface Props {
  toolName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const TOOL_LABELS: Record<string, { title: string; body: string; action: string }> = {
  clear_dtcs: {
    title: 'Clear Diagnostic Codes?',
    body: 'This will erase all stored and pending DTCs from the vehicle ECU. The operation cannot be undone.',
    action: 'Clear DTCs',
  },
};

export function WriteConfirmModal({ toolName, onConfirm, onCancel }: Props) {
  const cfg = TOOL_LABELS[toolName] ?? {
    title: 'Confirm Action',
    body: `Claude wants to perform a write operation: ${toolName}. This cannot be undone.`,
    action: 'Confirm',
  };

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full rounded-2xl bg-gray-900 p-6 shadow-2xl">
          <View className="mb-4 h-10 w-10 items-center justify-center rounded-full bg-red-900/60">
            <Text className="text-xl">⚠️</Text>
          </View>
          <Text className="text-lg font-bold text-white">{cfg.title}</Text>
          <Text className="mt-2 text-sm leading-5 text-gray-400">{cfg.body}</Text>
          <View className="mt-6 gap-3">
            <Pressable
              onPress={onConfirm}
              className="items-center rounded-xl bg-red-600 py-3 active:bg-red-700"
            >
              <Text className="font-semibold text-white">{cfg.action}</Text>
            </Pressable>
            <Pressable
              onPress={onCancel}
              className="items-center rounded-xl bg-gray-800 py-3 active:bg-gray-700"
            >
              <Text className="font-semibold text-gray-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
