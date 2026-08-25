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
        className="flex-1 items-center justify-center bg-bg px-6"
      >
        <Pressable onPress={() => {}} className="w-full rounded-3xl border border-border bg-surface p-6">
          <View className="mb-3 flex-row items-center gap-2">
            <View className="h-1.5 w-1.5 rounded-full bg-danger" />
            <Text className="text-[10px] font-bold tracking-[2px] text-danger">
              WRITE OPERATION
            </Text>
          </View>
          <Text className="text-xl font-bold text-text-primary">{cfg.title}</Text>
          <Text className="mt-2 text-sm leading-5 text-text-muted">{cfg.body}</Text>
          <View className="mt-6 gap-2">
            <Pressable
              onPress={onConfirm}
              className="items-center rounded-xl bg-danger py-3 active:bg-danger"
            >
              <Text className="text-sm font-bold tracking-wider text-on-accent">{cfg.action}</Text>
            </Pressable>
            <Pressable
              onPress={onCancel}
              className="items-center rounded-xl border border-border bg-bg py-3 active:bg-surface"
            >
              <Text className="text-sm font-semibold text-text-secondary">Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
