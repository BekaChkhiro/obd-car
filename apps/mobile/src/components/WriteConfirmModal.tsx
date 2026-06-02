import { Modal, Pressable, Text, View } from 'react-native';

interface Props {
  toolName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const TOOL_LABELS: Record<string, { title: string; body: string; action: string }> = {
  clear_dtcs: {
    title: 'Clear diagnostic codes?',
    body: 'This will erase all stored and pending DTCs from the vehicle ECU. The operation cannot be undone.',
    action: 'CLEAR DTCS',
  },
};

export function WriteConfirmModal({ toolName, onConfirm, onCancel }: Props) {
  const cfg = TOOL_LABELS[toolName] ?? {
    title: 'Confirm action',
    body: `Claude wants to perform a write operation: ${toolName}. This cannot be undone.`,
    action: 'CONFIRM',
  };

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        className="flex-1 items-center justify-center bg-black/80 px-6"
      >
        <Pressable onPress={() => {}} className="w-full rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <View className="mb-3 flex-row items-center gap-2">
            <View className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <Text className="text-[10px] font-bold tracking-[2px] text-red-300">
              WRITE OPERATION
            </Text>
          </View>
          <Text className="text-xl font-bold text-zinc-50">{cfg.title}</Text>
          <Text className="mt-2 text-sm leading-5 text-zinc-400">{cfg.body}</Text>
          <View className="mt-6 gap-2">
            <Pressable
              onPress={onConfirm}
              className="items-center rounded-xl bg-red-500 py-3 active:bg-red-600"
            >
              <Text className="text-sm font-bold tracking-wider text-zinc-950">{cfg.action}</Text>
            </Pressable>
            <Pressable
              onPress={onCancel}
              className="items-center rounded-xl border border-zinc-800 bg-zinc-950 py-3 active:bg-zinc-900"
            >
              <Text className="text-sm font-semibold text-zinc-300">Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
