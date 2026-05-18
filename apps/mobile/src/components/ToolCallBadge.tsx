import { View, Text } from 'react-native';
import type { ToolCall } from '../types/chat';

const STATUS_CONFIG = {
  pending: { label: 'pending', bg: 'bg-gray-700', text: 'text-gray-400', dot: 'bg-gray-500' },
  running: { label: 'running', bg: 'bg-blue-900/60', text: 'text-blue-300', dot: 'bg-blue-400' },
  done: { label: 'done', bg: 'bg-green-900/50', text: 'text-green-300', dot: 'bg-green-400' },
  error: { label: 'error', bg: 'bg-red-900/50', text: 'text-red-300', dot: 'bg-red-500' },
} satisfies Record<ToolCall['status'], { label: string; bg: string; text: string; dot: string }>;

interface Props {
  toolCall: ToolCall;
}

export function ToolCallBadge({ toolCall }: Props) {
  const cfg = STATUS_CONFIG[toolCall.status];
  return (
    <View className={`mt-1 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 ${cfg.bg}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <Text className={`text-xs font-medium ${cfg.text}`}>
        {toolCall.name}
      </Text>
      <Text className={`text-xs ${cfg.text} opacity-70`}>
        · {cfg.label}
      </Text>
    </View>
  );
}
