import { create } from 'zustand';
import type { ChatMessage, ToolCall } from '../types/chat';
import { ChatClient, type ChatConnectionState } from '../chat/client';
import type { ServerFrame } from '../chat/protocol';

function shortId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface PendingWriteConfirmation {
  toolUseId: string;
  name: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  connection: ChatConnectionState;
  // Active assistant message id currently being streamed, if any.
  streamingMessageId: string | null;
  // Set when the backend blocked a write tool and is waiting for user OK.
  pendingWriteConfirmation: PendingWriteConfirmation | null;

  connect: (opts: { token: string; sessionId: string; locale?: string }) => void;
  disconnect: () => void;
  sendUserMessage: (content: string) => void;
  confirmWrite: (followUpMessage: string) => void;
  denyWrite: () => void;
  abort: () => void;
  clearMessages: () => void;
}

// Module-scoped client so HMR / re-mounts don't open a second socket.
let client: ChatClient | null = null;

function applyFrame(
  set: (
    update: (state: ChatState) => Partial<ChatState> | ChatState,
  ) => void,
  frame: ServerFrame,
): void {
  switch (frame.type) {
    case 'registered':
      set(() => ({ connection: 'connected' }));
      return;

    case 'assistant_message_start': {
      const placeholder: ChatMessage = {
        id: frame.message_id,
        role: 'assistant',
        content: '',
        isStreaming: true,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, placeholder],
        isStreaming: true,
        streamingMessageId: frame.message_id,
      }));
      return;
    }

    case 'text_delta':
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === frame.message_id ? { ...m, content: m.content + frame.text } : m,
        ),
      }));
      return;

    case 'tool_call': {
      const tc: ToolCall = {
        id: frame.tool_use_id,
        name: frame.name,
        input: frame.input,
        status: 'running',
      };
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === frame.message_id
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
            : m,
        ),
      }));
      return;
    }

    case 'tool_call_completed':
      set((s) => ({
        messages: s.messages.map((m) =>
          m.toolCalls && m.toolCalls.some((t) => t.id === frame.tool_use_id)
            ? {
                ...m,
                toolCalls: m.toolCalls.map((t) =>
                  t.id === frame.tool_use_id ? { ...t, status: 'done' } : t,
                ),
              }
            : m,
        ),
      }));
      return;

    case 'tool_call_error':
      if (frame.reason === 'confirmation_required') {
        // Backend blocked a write tool — show confirmation modal instead of
        // marking an error (there is no tool_call badge to update because
        // ToolCallDispatched is never emitted for blocked write tools).
        set(() => ({
          pendingWriteConfirmation: { toolUseId: frame.tool_use_id, name: frame.name },
        }));
      } else {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.toolCalls && m.toolCalls.some((t) => t.id === frame.tool_use_id)
              ? {
                  ...m,
                  toolCalls: m.toolCalls.map((t) =>
                    t.id === frame.tool_use_id
                      ? { ...t, status: 'error', result: frame.message }
                      : t,
                  ),
                }
              : m,
          ),
        }));
      }
      return;

    case 'assistant_message_end':
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === frame.message_id ? { ...m, isStreaming: false } : m,
        ),
      }));
      return;

    case 'turn_complete':
      set(() => ({ isStreaming: false, streamingMessageId: null }));
      return;

    case 'replay_complete':
      // No-op — the buffered frames already applied by the time we got here.
      return;

    case 'error':
      // Surface backend errors as a transient assistant note so the user sees them.
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: shortId(),
            role: 'assistant',
            content: `[error: ${frame.message}]`,
            createdAt: new Date().toISOString(),
          },
        ],
        isStreaming: false,
        streamingMessageId: null,
      }));
      return;

    default:
      return;
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  connection: 'idle',
  streamingMessageId: null,
  pendingWriteConfirmation: null,

  connect: ({ token, sessionId, locale }) => {
    if (client !== null) {
      // Already connected/connecting to the same session — leave it alone.
      return;
    }
    client = new ChatClient({
      token,
      sessionId,
      locale: locale ?? 'en',
      onFrame: (frame) => applyFrame(set, frame),
      onStateChange: (s) => set(() => ({ connection: s })),
    });
    client.connect();
  },

  disconnect: () => {
    if (client) {
      client.close();
      client = null;
    }
    set(() => ({ connection: 'closed', isStreaming: false, streamingMessageId: null }));
  },

  sendUserMessage: (content) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const id = shortId();
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'user',
          content: trimmed,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    client?.sendUserMessage(id, trimmed);
  },

  confirmWrite: (followUpMessage: string) => {
    const pending = get().pendingWriteConfirmation;
    if (!pending) return;
    client?.sendConfirmWrite(pending.name);
    set(() => ({ pendingWriteConfirmation: null }));
    get().sendUserMessage(followUpMessage);
  },

  denyWrite: () => {
    set(() => ({ pendingWriteConfirmation: null }));
  },

  abort: () => {
    client?.abort();
    set(() => ({ isStreaming: false, streamingMessageId: null }));
    void get();
  },

  clearMessages: () => set(() => ({ messages: [], isStreaming: false })),
}));

// ── test-only helpers (used by jest) ─────────────────────────────────────────

export function __setChatClientForTesting(c: ChatClient | null): void {
  client = c;
}

export function __getChatClientForTesting(): ChatClient | null {
  return client;
}
