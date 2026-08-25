import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { useTranslation } from 'react-i18next';
import { useNavigation } from 'expo-router';
import { useTabHistory } from '@/src/store/tab-history';
import { useChatStore } from '@/src/store/chat';
import { useBleStore } from '@/src/store/ble';
import { useLocaleStore } from '@/src/store/locale';
import { connectionMachine } from '@/src/ble/connection';
import { isE2E } from '@/src/lib/e2e';
import { MarkdownText } from '@/src/components/MarkdownText';
import { PidWidget } from '@/src/components/PidWidget';
import { ToolCallBadge } from '@/src/components/ToolCallBadge';
import { AssistantHelpSheet } from '@/src/components/AssistantHelpSheet';
import { NoAdapterState } from '@/src/components/NoAdapterState';
import { WriteConfirmModal } from '@/src/components/WriteConfirmModal';
import { useToolExecutor } from '@/src/hooks/useToolExecutor';
import { useAdapterStatusSync } from '@/src/hooks/useAdapterStatusSync';
import { useChatSession } from '@/src/hooks/useChatSession';
import { useSQLiteContext } from 'expo-sqlite';
import type { ChatMessage } from '@/src/types/chat';

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
          className="h-2 w-2 rounded-full bg-accent"
          style={{ opacity: anim }}
        />
      ))}
    </View>
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
        <View className="max-w-[82%] rounded-2xl rounded-tr-md bg-accent px-3.5 py-2">
          <Text selectable className="text-[15px] leading-[20px] text-on-accent">
            {msg.content}
          </Text>
        </View>
        {isLastInGroup && (
          <Text className="mr-1 mt-1 text-[10px] tabular-nums text-text-dim">{time}</Text>
        )}
      </View>
    );
  }

  return (
    <View className={`${isLastInGroup ? 'mb-4' : 'mb-1'} items-start px-4`}>
      <View className="max-w-[82%]">
        {isFirstInGroup && (
          <View className="mb-0.5 ml-2 flex-row items-center gap-1">
            <View className="h-1 w-1 rounded-full bg-accent" />
            <Text className="text-[9px] font-bold tracking-[2px] text-text-muted">AI</Text>
          </View>
        )}
        <View className="rounded-2xl rounded-tl-md bg-surface px-3.5 py-2">
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
          <Text className="ml-2 mt-1 text-[10px] tabular-nums text-text-dim">{time}</Text>
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
      accessibilityRole="button"
      accessibilityLabel={`${category}: ${prompt}`}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 active:bg-surface-muted"
    >
      <View className="flex-1">
        {/* The category is a label on the question, not a heading of its own —
            it sits in a chip so it stops competing with the question's weight. */}
        <View className="self-start rounded-md bg-accent-soft px-1.5 py-0.5">
          <Text className="text-[9px] font-bold tracking-[1.5px] text-text-secondary">
            {category}
          </Text>
        </View>
        <Text className="mt-2 text-[15px] leading-5 text-text-primary">{prompt}</Text>
      </View>
      {/* Without this the cards read as text blocks; the chevron is what says
          they can be tapped. */}
      <Feather name="chevron-right" size={16} color={colors.textDim} />
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
        <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-accent">
          <Feather name="zap" size={22} color={colors.onAccent} />
        </View>
        <Text className="text-2xl font-bold text-text-primary">{t('chat.title')}</Text>
        <Text className="mt-1.5 text-sm leading-5 text-text-muted">{t('chat.subtitle')}</Text>
      </View>

      <Text className="mb-3 text-[10px] font-bold tracking-[2px] text-text-muted">
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
    status === 'unauthorized'
      ? { dot: 'bg-danger', tone: 'text-danger', bg: 'bg-danger-soft', border: 'border-danger/30', label: t('chat.sessionExpired') }
      : status === 'connecting'
      ? { dot: 'bg-accent', tone: 'text-accent', bg: 'bg-accent-soft', border: 'border-accent', label: t('chat.connecting') }
      : status === 'reconnecting'
        ? { dot: 'bg-warning', tone: 'text-warning', bg: 'bg-warning-soft', border: 'border-warning/30', label: t('chat.reconnecting') }
        : { dot: 'bg-danger', tone: 'text-danger', bg: 'bg-danger-soft', border: 'border-danger/30', label: t('chat.disconnected') };
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
  /**
   * Session controls only make sense once there is a conversation to have, and
   * the screen shows the connect gate instead of a chat until then.
   */
  carConnected: boolean;
  onOpenHistory: () => void;
  onNewSession: () => void;
  onOpenHelp: () => void;
  onBack: () => void;
}

function ChatHeader({
  connection,
  carConnected,
  onOpenHistory,
  onNewSession,
  onOpenHelp,
  onBack,
}: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View
      style={{ paddingTop: insets.top }}
      className="bg-transparent"
    >
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        <View className="flex-1 flex-row items-center gap-2">
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('chat.back')}
            className="flex-row items-center gap-1 rounded-full bg-surface py-2 pl-2.5 pr-4 active:bg-surface-muted"
            style={{
              shadowColor: colors.accent,
              shadowOpacity: 0.1,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
            hitSlop={6}
          >
            <Feather name="chevron-left" size={18} color={colors.textPrimary} />
            <Text className="text-sm font-semibold text-text-primary">{t('chat.back')}</Text>
          </Pressable>
          <ConnectionPill status={connection} />
        </View>
        <View className="flex-row items-center gap-1">
          {carConnected && (
            <>
              <Pressable
                onPress={onNewSession}
                accessibilityRole="button"
                accessibilityLabel={t('chat.newSession')}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
                hitSlop={8}
              >
                <Feather name="plus-circle" size={16} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={onOpenHistory}
                accessibilityRole="button"
                accessibilityLabel={t('chat.openHistory')}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-surface"
                hitSlop={8}
              >
                <Feather name="clock" size={16} color={colors.textSecondary} />
              </Pressable>
            </>
          )}
          {/* Explaining the screen is the one thing worth offering before a car
              is connected — it is what says why one is needed. */}
          <Pressable
            onPress={onOpenHelp}
            accessibilityRole="button"
            accessibilityLabel={t('chat.help')}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface active:bg-surface-muted"
            style={{
              shadowColor: colors.accent,
              shadowOpacity: 0.1,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
            hitSlop={8}
          >
            <Feather name="help-circle" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}


// ── Connect-first gate ───────────────────────────────────────────────────────

/**
 * Shown instead of the conversation when no adapter is linked.
 *
 * The assistant's whole value is that its answers come from this car. With
 * nothing connected it can only talk in generalities, so the screen asks for a
 * car rather than inviting a question it would have to hedge.
 */
function ConnectGate({ onConnect }: { onConnect: () => void }) {
  const { t } = useTranslation();
  return (
    <NoAdapterState title={t('chat.gateTitle')} body={t('chat.gateBody')}>
      <Pressable
        onPress={onConnect}
        accessibilityRole="button"
        className="rounded-full bg-accent px-7 py-3.5 active:bg-accent-strong"
      >
        <Text className="text-[15px] font-bold text-on-accent">{t('chat.gateCta')}</Text>
      </Pressable>
    </NoAdapterState>
  );
}

// ── Live-data banner ─────────────────────────────────────────────────────────

/**
 * States plainly that the assistant has no link to the car.
 *
 * The same fact is in the system prompt, so the model already refuses to
 * invent readings — but the user deserves to know *before* asking why the
 * answer is generic, rather than after.
 */
function NoLiveDataBanner({
  simulated,
  onConnect,
}: {
  simulated: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="mx-4 mt-3 flex-row items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-3 py-2.5">
      <Feather
        name="alert-triangle"
        size={14}
        color={colors.warning}
        style={{ marginTop: 2 }}
      />
      <View className="flex-1">
        <Text className="text-[11px] font-bold tracking-wider text-warning">
          {simulated ? t('chat.simulatedDataTitle') : t('chat.noLiveDataTitle')}
        </Text>
        {/* Body in the normal text colour: amber-on-amber is the hardest thing
            on the screen to read, and the tint already says "warning". */}
        <Text className="mt-1 text-[12px] leading-[17px] text-text-secondary">
          {simulated ? t('chat.simulatedDataBody') : t('chat.noLiveDataBody')}
        </Text>
      </View>
      {!simulated && (
        <Pressable
          onPress={onConnect}
          accessibilityRole="button"
          accessibilityLabel={t('chat.connectAdapter')}
          hitSlop={6}
          className="self-center rounded-full bg-warning px-3.5 py-2 active:opacity-80"
        >
          <Text className="text-[11px] font-bold text-on-accent">
            {t('chat.connect')}
          </Text>
        </Pressable>
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
  // The composer floats over the page; reserve its real height so the last
  // message is never left underneath it.
  const tabBarHeight = useBottomTabBarHeight();
  useToolExecutor();
  useAdapterStatusSync();
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();

  const messages = useChatStore((s) => s.messages);
  const connection = useChatStore((s) => s.connection);
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const pendingWriteConfirmation = useChatStore((s) => s.pendingWriteConfirmation);
  const confirmWrite = useChatStore((s) => s.confirmWrite);
  const denyWrite = useChatStore((s) => s.denyWrite);
  const locale = useLocaleStore((s) => s.locale);
  const listRef = useRef<FlatList<RenderItem>>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  // Session lifecycle lives in a store, not in this component: the AI tab
  // unmounts on every tab switch, and a `useMemo` id meant a brand-new
  // conversation each time — the previous transcript was simply orphaned.
  const { sessionId, startNew } = useChatSession();

  // Only a physical adapter counts as a live link. A simulated one is exposed
  // in E2E builds alone, and even there the banner still says the numbers are
  // not coming off the user's car.
  const adapterKind = useBleStore((s) => s.adapterKind);
  const hasLiveLink = adapterKind === 'real';
  // Any adapter counts for the gate — a simulated one still gives the
  // assistant something to read, and the banner already says which it is.
  const carConnected = adapterKind !== null;

  useEffect(() => {
    if (!sessionId) return;
    // A session switch has to tear the socket down and reopen it: the backend
    // keys its conversation state off the session id sent at connect time.
    disconnect();
    connect({ sessionId, locale, db });
    return () => disconnect();
  }, [sessionId, locale, db, connect, disconnect]);

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

  const lastNonAssistantTab = useTabHistory((s) => s.lastNonAssistantTab);
  const navigation = useNavigation();
  const handleBack = useCallback(() => {
    // getParent() is the tab navigator; the assistant's own Stack has nothing
    // to go back to.
    (navigation.getParent() ?? navigation).navigate(lastNonAssistantTab as never);
  }, [navigation, lastNonAssistantTab]);

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
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ChatHeader
        connection={connection}
        carConnected={carConnected}
        onOpenHistory={() => router.push('/ai/history')}
        onNewSession={() => void startNew()}
        onOpenHelp={() => setHelpVisible(true)}
        onBack={handleBack}
      />

      <AssistantHelpSheet visible={helpVisible} onClose={() => setHelpVisible(false)} />

      {carConnected && !hasLiveLink && (
        <NoLiveDataBanner
          simulated={adapterKind === 'simulated'}
          onConnect={() => router.push('/pair')}
        />
      )}

        {isE2E() && (
          <View testID="e2e-chat-toolbar" className="flex-row justify-end px-4 pt-2">
            {/* Test-only control. Kept deliberately plain and out of the way so
                it never reads as part of the product's UI. */}
            <Pressable
              testID="e2e-clear-dtcs"
              onPress={handleE2eClearDtcs}
              disabled={e2eClearing}
              className="rounded-full border border-border bg-surface px-3 py-1 active:bg-surface-muted"
            >
              <Text className="text-[10px] font-semibold text-text-dim">
                {e2eClearing ? 'E2E: clearing DTCs…' : 'E2E: clear DTCs (mock)'}
              </Text>
            </Pressable>
            {e2eClearStatus && (
              <Text testID="e2e-clear-dtcs-status" className="mt-1 text-center text-xs text-info">
                {e2eClearStatus === 'cleared'
                  ? 'DTCs cleared'
                  : e2eClearStatus === 'no-adapter'
                    ? 'No adapter connected'
                    : `Status: ${e2eClearStatus}`}
              </Text>
            )}
          </View>
        )}

        {!carConnected ? (
          <ConnectGate onConnect={() => router.push('/pair')} />
        ) : messages.length === 0 ? (
          <EmptyChat onSend={handleSend} />
        ) : (
          <View className="flex-1">
            <FlatList
              ref={listRef}
              data={items}
              keyExtractor={(item) => item.msg.id}
              renderItem={renderItem}
              contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 + tabBarHeight }}
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
                className="absolute bottom-4 right-4 h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
              >
                <Feather name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        )}


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
