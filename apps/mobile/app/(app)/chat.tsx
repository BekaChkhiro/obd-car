import { useEffect, useRef } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatStore } from '@/src/store/chat';
import { MarkdownText } from '@/src/components/MarkdownText';
import { ToolCallBadge } from '@/src/components/ToolCallBadge';
import type { ChatMessage } from '@/src/types/chat';

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
              <ToolCallBadge key={tc.id} toolCall={tc} />
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

function EmptyChat() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-center text-2xl font-bold text-white">OBD AI Assistant</Text>
      <Text className="mt-2 text-center text-sm text-gray-500">
        Ask about your vehicle — diagnostics, error codes, live sensor data.
      </Text>
      <View className="mt-6 gap-2 self-stretch">
        {['What error codes do I have?', 'How is my battery?', 'Why is my engine hot?'].map(
          (prompt) => (
            <Pressable
              key={prompt}
              className="rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 active:bg-gray-700"
            >
              <Text className="text-sm text-gray-300">{prompt}</Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

function renderMessage({ item }: ListRenderItemInfo<ChatMessage>) {
  return <MessageBubble msg={item} />;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, isStreaming]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {messages.length === 0 ? (
        <EmptyChat />
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

      {/* Placeholder input bar — wired in T4.2 */}
      <View
        style={{ paddingBottom: insets.bottom + 8 }}
        className="border-t border-gray-800 bg-gray-900 px-3 pt-3"
      >
        <View className="flex-row items-center gap-2 rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3">
          <Text className="flex-1 text-sm text-gray-500">Message…</Text>
          <Pressable className="rounded-full bg-blue-600 p-1.5">
            <Text className="text-xs font-bold text-white">↑</Text>
          </Pressable>
        </View>

        {messages.length > 0 && (
          <Pressable
            onPress={clearMessages}
            className="mt-2 items-center"
          >
            <Text className="text-xs text-gray-600">Clear conversation</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
