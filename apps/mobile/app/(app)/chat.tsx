import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatStore } from '@/src/store/chat';
import { useAuthStore } from '@/src/store/auth';
import { getAccessToken } from '@/src/lib/api';
import { MarkdownText } from '@/src/components/MarkdownText';
import { PidWidget } from '@/src/components/PidWidget';
import { ToolCallBadge } from '@/src/components/ToolCallBadge';
import { WriteConfirmModal } from '@/src/components/WriteConfirmModal';
import { useToolExecutor } from '@/src/hooks/useToolExecutor';
import type { ChatMessage } from '@/src/types/chat';

const QUICK_PROMPTS = [
  'რა შეცდომა გვაქვს?',
  'ბატარეა როგორ არის?',
  'ძრავი რატომ ცხელდება?',
];

const MAX_CHARS = 1000;

function StreamingDots() {
  const anims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View className="flex-row items-center gap-1 px-1">
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-gray-400"
          style={{ opacity: anim }}
        />
      ))}
    </View>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <View className="mb-3 items-end px-4">
        <View className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5">
          <Text className="text-sm leading-5 text-white">{msg.content}</Text>
        </View>
        <Text className="mt-0.5 text-xs text-gray-600">
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }

  return (
    <View className="mb-3 items-start px-4">
      <View className="max-w-[88%]">
        <View className="rounded-2xl rounded-tl-sm bg-gray-800 px-4 py-3">
          {msg.isStreaming && msg.content === '' ? (
            <StreamingDots />
          ) : (
            <MarkdownText content={msg.content} />
          )}
          {msg.isStreaming && msg.content !== '' && (
            <View className="mt-1.5 flex-row items-center gap-1">
              <StreamingDots />
            </View>
          )}
        </View>

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <View className="ml-1 mt-1 gap-1">
            {msg.toolCalls.map((tc) => (
              <View key={tc.id}>
                <ToolCallBadge toolCall={tc} />
                {(tc.name === 'read_pid' || tc.name === 'read_battery_voltage') && (
                  <PidWidget
                    toolName={tc.name}
                    toolInput={tc.input ?? {}}
                    toolStatus={tc.status}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        <Text className="ml-1 mt-0.5 text-xs text-gray-600">
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

function EmptyChat({ onSend }: { onSend: (text: string) => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-center text-2xl font-bold text-white">OBD AI Assistant</Text>
      <Text className="mt-2 text-center text-sm text-gray-500">
        Ask about your vehicle — diagnostics, error codes, live sensor data.
      </Text>
      <View className="mt-6 gap-2 self-stretch">
        {QUICK_PROMPTS.map((prompt) => (
          <Pressable
            key={prompt}
            onPress={() => onSend(prompt)}
            className="rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 active:bg-gray-700"
          >
            <Text className="text-sm text-gray-300">{prompt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function InputBar({
  onSend,
  onAbort,
  disabled,
}: {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const isStreaming = useChatStore((s) => s.isStreaming);
  const messages = useChatStore((s) => s.messages);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const insets = useSafeAreaInsets();

  const overLimit = text.length > MAX_CHARS;
  const canSend = text.trim().length > 0 && !isStreaming && !overLimit && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={{ paddingBottom: insets.bottom + 8 }} className="border-t border-gray-800 bg-gray-900 px-3 pt-3">
      <View
        className={`flex-row items-end gap-2 rounded-2xl border bg-gray-800 px-3 py-2 ${overLimit ? 'border-red-500' : 'border-gray-700'}`}
      >
        <TextInput
          className="flex-1 text-sm leading-5 text-white"
          placeholder="Message…"
          placeholderTextColor="#6B7280"
          value={text}
          onChangeText={setText}
          multiline
          style={{ maxHeight: 120 }}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />
        {isStreaming ? (
          <Pressable onPress={onAbort} className="mb-0.5 rounded-full bg-red-600 p-1.5">
            <Text className="text-xs font-bold text-white">■</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            className={`mb-0.5 rounded-full p-1.5 ${canSend ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            <Text className={`text-xs font-bold ${canSend ? 'text-white' : 'text-gray-500'}`}>↑</Text>
          </Pressable>
        )}
      </View>
      <View className="mt-1 flex-row items-center justify-between px-1">
        <Text className={`text-xs ${overLimit ? 'text-red-400' : 'text-gray-600'}`}>
          {text.length > 0 ? `${text.length} / ${MAX_CHARS}` : ''}
        </Text>
        {messages.length > 0 && (
          <Pressable onPress={clearMessages}>
            <Text className="text-xs text-gray-600">Clear conversation</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function renderMessage({ item }: ListRenderItemInfo<ChatMessage>) {
  return <MessageBubble msg={item} />;
}

function ConnectionBanner({ status }: { status: string }) {
  if (status === 'connected' || status === 'idle') return null;
  const label =
    status === 'connecting'
      ? 'Connecting…'
      : status === 'reconnecting'
        ? 'Reconnecting…'
        : 'Disconnected';
  return (
    <View className="bg-amber-900/40 px-4 py-1">
      <Text className="text-center text-xs text-amber-200">{label}</Text>
    </View>
  );
}

export default function ChatScreen() {
  useToolExecutor();

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const connection = useChatStore((s) => s.connection);
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const pendingWriteConfirmation = useChatStore((s) => s.pendingWriteConfirmation);
  const confirmWrite = useChatStore((s) => s.confirmWrite);
  const denyWrite = useChatStore((s) => s.denyWrite);
  const abort = useChatStore((s) => s.abort);
  const user = useAuthStore((s) => s.user);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Single session per chat session in the app — id is stable for the lifetime
  // of this screen mount, so backend can replay frames on reconnect.
  const sessionId = useMemo(
    () => `chat-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    [],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      connect({ token, sessionId, locale: user?.locale ?? 'en' });
    }
    return () => disconnect();
  }, [connect, disconnect, sessionId, user?.locale]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, isStreaming]);

  const handleSend = useCallback(
    (text: string) => {
      sendUserMessage(text);
    },
    [sendUserMessage],
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ConnectionBanner status={connection} />
      {messages.length === 0 ? (
        <EmptyChat onSend={handleSend} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }}
          removeClippedSubviews
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />
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
