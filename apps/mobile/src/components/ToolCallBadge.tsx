import { View, Text } from 'react-native';
import type { ToolCall } from '../types/chat';

const STATUS_CONFIG = {
  pending: { label: 'PENDING', bg: 'bg-zinc-800', border: 'border-zinc-700', text: 'text-zinc-400', dot: 'bg-zinc-500' },
  running: { label: 'RUNNING', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  done: { label: 'DONE', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  error: { label: 'ERROR', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', dot: 'bg-red-400' },
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
