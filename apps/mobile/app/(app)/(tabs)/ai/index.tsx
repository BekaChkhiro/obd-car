import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/src/store/chat';
import { useBleStore } from '@/src/store/ble';
import { useLocaleStore } from '@/src/store/locale';
import { getAccessToken } from '@/src/lib/api';
import { connectionMachine } from '@/src/ble/connection';
import { isE2E } from '@/src/lib/e2e';
import { MarkdownText } from '@/src/components/MarkdownText';
import { PidWidget } from '@/src/components/PidWidget';
import { ToolCallBadge } from '@/src/components/ToolCallBadge';
import { WriteConfirmModal } from '@/src/components/WriteConfirmModal';
import { useToolExecutor } from '@/src/hooks/useToolExecutor';
import type { ChatMessage } from '@/src/types/chat';

const MAX_CHARS = 1000;
const CHAR_COUNT_THRESHOLD = 800;
// Group consecutive messages from the same role if sent within this window.
const GROUP_WINDOW_MS = 120_000;

// ── Streaming indicators ─────────────────────────────────────────────────────

function StreamingDots() {
  const anims = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(anim, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 420, useNativeDriver: true }),
          Animated.delay((2 - i) * 180),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View className="flex-row items-center gap-1.5 py-1.5">
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          className="h-2 w-2 rounded-full bg-cyan-400"
          style={{ opacity: anim }}
        />
      ))}
    </View>
  );
}

function StreamingCursor() {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.2, duration: 450, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return (
    <Animated.View
      className="ml-0.5 h-3.5 w-[2px] bg-cyan-400"
      style={{ opacity: blink, transform: [{ translateY: 1 }] }}
    />
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

function MessageBubble({ msg, isFirstInGroup, isLastInGroup }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const time = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isUser) {
    return (
      <View className={`${isLastInGroup ? 'mb-4' : 'mb-1'} items-end px-4`}>
        <View className="max-w-[82%] rounded-2xl rounded-tr-md bg-cyan-500 px-3.5 py-2">
          <Text selectable className="text-[15px] leading-[20px] text-zinc-950">
            {msg.content}
          </Text>
        </View>
        {isLastInGroup && (
          <Text className="mr-1 mt-1 text-[10px] tabular-nums text-zinc-600">{time}</Text>
        )}
      </View>
    );
  }

  return (
    <View className={`${isLastInGroup ? 'mb-4' : 'mb-1'} items-start px-4`}>
      <View className="max-w-[82%]">
        {isFirstInGroup && (
          <View className="mb-0.5 ml-2 flex-row items-center gap-1">
            <View className="h-1 w-1 rounded-full bg-cyan-400" />
            <Text className="text-[9px] font-bold tracking-[2px] text-zinc-500">AI</Text>
          </View>
        )}
        <View className="rounded-2xl rounded-tl-md bg-zinc-900 px-3.5 py-2">
          {msg.isStreaming && msg.content === '' ? (
            <StreamingDots />
          ) : (
            <>
              <MarkdownText content={msg.content} />
              {msg.isStreaming && msg.content !== '' && (
                <View className="mt-1">
                  <StreamingDots />
                </View>
              )}
            </>
          )}
        </View>

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <View className="ml-1 mt-1 gap-1">
            {msg.toolCalls.map((tc) => {
              const isPidTool = tc.name === 'read_pid' || tc.name === 'read_battery_voltage';
              return (
                <View key={tc.id} className="self-start">
                  {isPidTool ? (
                    <PidWidget
                      toolName={tc.name}
                      toolInput={tc.input ?? {}}
                      toolStatus={tc.status}
                    />
                  ) : (
                    <ToolCallBadge toolCall={tc} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {isLastInGroup && (
          <Text className="ml-2 mt-1 text-[10px] tabular-nums text-zinc-600">{time}</Text>
        )}
      </View>
    </View>
  );
}

// ── Empty state with categorised prompts ─────────────────────────────────────

interface PromptCardProps {
  category: string;
  prompt: string;
  onPress: () => void;
}

function PromptCard({ category, prompt, onPress }: PromptCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 active:border-cyan-500/40 active:bg-zinc-900"
    >
      <Text className="text-[9px] font-bold tracking-[2px] text-cyan-400">{category}</Text>
      <Text className="mt-1.5 text-[15px] leading-5 text-zinc-200">{prompt}</Text>
    </Pressable>
  );
}

function EmptyChat({ onSend }: { onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const prompts = [
    { category: t('chat.categoryDiagnostics'), text: t('chat.quickPrompt0') },
    { category: t('chat.categoryBattery'), text: t('chat.quickPrompt1') },
    { category: t('chat.categoryEngine'), text: t('chat.quickPrompt2') },
  ];

  return (
    <View className="flex-1 px-5 pt-8">
      <View className="mb-8">
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
          <Text className="text-[10px] font-bold tracking-[2px] text-cyan-400">AI</Text>
        </View>
        <Text className="text-2xl font-bold text-zinc-50">{t('chat.title')}</Text>
        <Text className="mt-1.5 text-sm leading-5 text-zinc-500">{t('chat.subtitle')}</Text>
      </View>

      <Text className="mb-3 text-[10px] font-bold tracking-[2px] text-zinc-500">
        {t('chat.suggestedQuestions')}
      </Text>
      <View className="gap-2.5">
        {prompts.map((p) => (
          <PromptCard
            key={p.text}
            category={p.category}
            prompt={p.text}
            onPress={() => onSend(p.text)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Connection status pill ───────────────────────────────────────────────────

function ConnectionPill({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === 'connected' || status === 'idle') return null;
  const cfg =
    status === 'connecting'
      ? { dot: 'bg-cyan-400', tone: 'text-cyan-300', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', label: t('chat.connecting') }
      : status === 'reconnecting'
        ? { dot: 'bg-amber-400', tone: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: t('chat.reconnecting') }
        : { dot: 'bg-red-400', tone: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30', label: t('chat.disconnected') };
  return (
    <View className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${cfg.border} ${cfg.bg}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <Text className={`text-[10px] font-bold tracking-wider ${cfg.tone}`}>{cfg.label}</Text>
    </View>
  );
}

// ── Custom header ────────────────────────────────────────────────────────────

interface ChatHeaderProps {
  connection: string;
  hasMessages: boolean;
  onClear: () => void;
  onOpenHistory: () => void;
}

function ChatHeader({ connection, hasMessages, onClear, onOpenHistory }: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View
      style={{ paddingTop: insets.top }}
      className="border-b border-zinc-900 bg-[#08080a]"
    >
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        <View className="flex-1">
          <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">{t('chat.brand')}</Text>
          <View className="mt-0.5 flex-row items-center gap-2">
            <Text className="text-base font-semibold text-zinc-100">{t('chat.diagnostic')}</Text>
            <ConnectionPill status={connection} />
          </View>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={onOpenHistory}
            accessibilityRole="button"
            accessibilityLabel={t('chat.openHistory')}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-zinc-900"
            hitSlop={8}
          >
            <Feather name="clock" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={hasMessages ? onClear : undefined}
            disabled={!hasMessages}
            accessibilityRole="button"
            accessibilityLabel={t('chat.clearConversation')}
            accessibilityState={{ disabled: !hasMessages }}
            className={`h-9 w-9 items-center justify-center rounded-full ${
              hasMessages ? 'active:bg-zinc-900' : 'opacity-30'
            }`}
            hitSlop={8}
          >
            <Feather name="trash-2" size={15} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Input bar ────────────────────────────────────────────────────────────────

interface InputBarProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
}

function InputBar({ onSend, onAbort, disabled }: InputBarProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const overLimit = text.length > MAX_CHARS;
  const showCount = text.length >= CHAR_COUNT_THRESHOLD;
  const canSend = text.trim().length > 0 && !isStreaming && !overLimit && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  return (
    // The tab bar below already accounts for the home-indicator inset, so
    // adding it again here would leave an empty band between the input and the
    // bar. A flat 8 px gap is enough breathing room.
    <View
      style={{ paddingBottom: 8, paddingTop: 8 }}
      className="border-t border-zinc-900 bg-[#08080a] px-3"
    >
      <View
        className={`flex-row items-end gap-2 rounded-3xl border bg-zinc-900/60 px-4 py-2.5 ${
          overLimit
            ? 'border-red-500/60'
            : focused
              ? 'border-cyan-500/40'
              : 'border-zinc-800'
        }`}
      >
        <TextInput
          className="flex-1 text-[15px] leading-5 text-zinc-50"
          placeholder={t('chat.placeholder')}
          placeholderTextColor="#52525b"
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          style={{ maxHeight: 140, paddingTop: 4, paddingBottom: 4 }}
          returnKeyType="default"
          blurOnSubmit={false}
        />
        {isStreaming ? (
          <Pressable
            onPress={onAbort}
            accessibilityRole="button"
            accessibilityLabel={t('chat.stopGenerating')}
            className="h-9 w-9 items-center justify-center rounded-full bg-red-500 active:bg-red-600"
            hitSlop={6}
          >
            <View className="h-2.5 w-2.5 rounded-[2px] bg-zinc-950" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            accessibilityState={{ disabled: !canSend }}
            className={`h-9 w-9 items-center justify-center rounded-full ${
              canSend ? 'bg-cyan-500 active:bg-cyan-600' : 'bg-zinc-800'
            }`}
            hitSlop={6}
          >
            <Feather name="arrow-up" size={18} color={canSend ? colors.bg : colors.textMuted} />
          </Pressable>
        )}
      </View>
      {(showCount || overLimit) && (
        <View className="mt-1 items-end px-2">
          <Text
            className={`text-[10px] tabular-nums ${
              overLimit ? 'text-red-400' : 'text-zinc-600'
            }`}
          >
            {text.length} / {MAX_CHARS}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RenderItem {
  msg: ChatMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

function buildGroupedItems(messages: ChatMessage[]): RenderItem[] {
  const ts = (m: ChatMessage) => new Date(m.createdAt).getTime();
  return messages.map((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const isFirstInGroup =
      !prev || prev.role !== msg.role || ts(msg) - ts(prev) > GROUP_WINDOW_MS;
    const isLastInGroup =
      !next || next.role !== msg.role || ts(next) - ts(msg) > GROUP_WINDOW_MS;
    return { msg, isFirstInGroup, isLastInGroup };
  });
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  useToolExecutor();
  const router = useRouter();
  const { t } = useTranslation();

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const connection = useChatStore((s) => s.connection);
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const pendingWriteConfirmation = useChatStore((s) => s.pendingWriteConfirmation);
  const confirmWrite = useChatStore((s) => s.confirmWrite);
  const denyWrite = useChatStore((s) => s.denyWrite);
  const abort = useChatStore((s) => s.abort);
  const locale = useLocaleStore((s) => s.locale);
  const listRef = useRef<FlatList<RenderItem>>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const sessionId = useMemo(
    () => `chat-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    [],
  );

  // Reconnect the chat WebSocket whenever the adapter comes online or goes
  // offline, so the backend's `register` payload reflects the current
  // supported_pids list. Without this re-register, the AI keeps the stale
  // empty-PID snapshot from initial mount and concludes "no vehicle".
  const phase = useBleStore((s) => s.connectionPhase);
  const hasAdapter = phase === 'ready' || phase === 'reading';

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    disconnect();
    connect({ token, sessionId, locale });
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, locale, hasAdapter]);

  // Auto-scroll on keyboard open so the latest message stays in view when the
  // user starts composing a reply.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (!showScrollToBottom) {
        listRef.current?.scrollToEnd({ animated: true });
      }
    });
    return () => sub.remove();
  }, [showScrollToBottom]);

  const handleSend = useCallback(
    (text: string) => {
      sendUserMessage(text);
    },
    [sendUserMessage],
  );

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setShowScrollToBottom(distanceFromBottom > 240);
  }

  function handleContentSizeChange() {
    if (!showScrollToBottom) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }

  // E2E-only DTC clear button — kept as-is for Maestro tests.
  const [e2eClearStatus, setE2eClearStatus] = useState<string | null>(null);
  const [e2eClearing, setE2eClearing] = useState(false);
  const handleE2eClearDtcs = useCallback(async () => {
    const adapter = connectionMachine.getAdapter();
    if (!adapter) {
      setE2eClearStatus('no-adapter');
      return;
    }
    setE2eClearing(true);
    setE2eClearStatus(null);
    try {
      const { verified, remainingDtcs } = await adapter.dtc.clearDtcs();
      setE2eClearStatus(
        verified && remainingDtcs.length === 0 ? 'cleared' : `remaining-${remainingDtcs.length}`,
      );
    } catch (err) {
      setE2eClearStatus(`error:${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setE2eClearing(false);
    }
  }, []);

  const items = useMemo(() => buildGroupedItems(messages), [messages]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RenderItem>) => (
      <MessageBubble
        msg={item.msg}
        isFirstInGroup={item.isFirstInGroup}
        isLastInGroup={item.isLastInGroup}
      />
    ),
    [],
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#08080a]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ChatHeader
        connection={connection}
        hasMessages={messages.length > 0}
        onClear={clearMessages}
        onOpenHistory={() => router.push('/(app)/ai/history' as never)}
      />

        {isE2E() && (
          <View testID="e2e-chat-toolbar" className="border-b border-zinc-800 bg-zinc-900 px-4 py-2">
            <Pressable
              testID="e2e-clear-dtcs"
              onPress={handleE2eClearDtcs}
              disabled={e2eClearing}
              className={`items-center rounded-lg px-3 py-2 ${e2eClearing ? 'bg-violet-900' : 'bg-violet-600'}`}
            >
              <Text className="text-xs font-semibold text-white">
                {e2eClearing ? 'E2E: clearing DTCs…' : 'E2E: clear DTCs (mock)'}
              </Text>
            </Pressable>
            {e2eClearStatus && (
              <Text testID="e2e-clear-dtcs-status" className="mt-1 text-center text-xs text-violet-300">
                {e2eClearStatus === 'cleared'
                  ? 'DTCs cleared'
                  : e2eClearStatus === 'no-adapter'
                    ? 'No adapter connected'
                    : `Status: ${e2eClearStatus}`}
              </Text>
            )}
          </View>
        )}

        {messages.length === 0 ? (
          <EmptyChat onSend={handleSend} />
        ) : (
          <View className="flex-1">
            <FlatList
              ref={listRef}
              data={items}
              keyExtractor={(item) => item.msg.id}
              renderItem={renderItem}
              contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
              onScroll={handleScroll}
              onContentSizeChange={handleContentSizeChange}
              scrollEventThrottle={120}
              keyboardShouldPersistTaps="handled"
            />

            {showScrollToBottom && (
              <Pressable
                onPress={() => listRef.current?.scrollToEnd({ animated: true })}
                accessibilityRole="button"
                accessibilityLabel={t('chat.scrollToLatest')}
                className="absolute bottom-4 right-4 h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900"
              >
                <Feather name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        )}

        <InputBar
          onSend={handleSend}
          onAbort={abort}
          disabled={connection !== 'connected'}
        />

      {pendingWriteConfirmation && (
        <WriteConfirmModal
          toolName={pendingWriteConfirmation.name}
          onConfirm={() => confirmWrite('Yes, please proceed with clearing the DTCs.')}
          onCancel={denyWrite}
        />
      )}
    </KeyboardAvoidingView>
  );
}
