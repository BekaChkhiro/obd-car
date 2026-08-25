import { View, Text } from 'react-native';
import type { ToolCall } from '../types/chat';

const STATUS_CONFIG = {
  pending: { label: 'PENDING', bg: 'bg-surface-muted', border: 'border-border-strong', text: 'text-text-muted', dot: 'bg-text-muted' },
  running: { label: 'RUNNING', bg: 'bg-accent-soft', border: 'border-accent', text: 'text-accent', dot: 'bg-accent' },
  done: { label: 'DONE', bg: 'bg-success-soft', border: 'border-success/30', text: 'text-success', dot: 'bg-success' },
  error: { label: 'ERROR', bg: 'bg-danger-soft', border: 'border-danger/30', text: 'text-danger', dot: 'bg-danger' },
} satisfies Record<ToolCall['status'], { label: string; bg: string; border: string; text: string; dot: string }>;

interface Props {
  toolCall: ToolCall;
}

// "read_pid" -> "Read pid" — turns raw tool identifiers into readable labels.
function humanizeToolName(name: string): string {
  const spaced = name.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function ToolCallBadge({ toolCall }: Props) {
  const cfg = STATUS_CONFIG[toolCall.status];
  return (
    <View className={`mt-1 flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1 ${cfg.bg} ${cfg.border}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <Text className={`text-[10px] font-semibold tracking-wider ${cfg.text}`}>
        {humanizeToolName(toolCall.name)}
      </Text>
      <Text className={`text-[9px] font-bold tracking-widest ${cfg.text} opacity-70`}>
        · {cfg.label}
      </Text>
    </View>
  );
}
