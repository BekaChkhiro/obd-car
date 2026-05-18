import { create } from 'zustand';
import type { ChatMessage, ToolCall } from '../types/chat';

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;

  addMessage: (msg: ChatMessage) => void;
  appendToLastMessage: (chunk: string) => void;
  setStreaming: (streaming: boolean) => void;
  updateToolCall: (messageId: string, toolCallId: string, update: Partial<ToolCall>) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastMessage: (chunk) =>
    set((s) => {
      if (s.messages.length === 0) return s;
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = { ...last, content: last.content + chunk };
      return { messages };
    }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  updateToolCall: (messageId, toolCallId, update) =>
    set((s) => ({
      messages: s.messages.map((msg) => {
        if (msg.id !== messageId || !msg.toolCalls) return msg;
        return {
          ...msg,
          toolCalls: msg.toolCalls.map((tc) =>
            tc.id === toolCallId ? { ...tc, ...update } : tc
          ),
        };
      }),
    })),

  clearMessages: () => set({ messages: [], isStreaming: false }),
}));
