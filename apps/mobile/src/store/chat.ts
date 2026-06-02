import { create } from 'zustand';
import type { ChatMessage, ToolCall } from '../types/chat';
import { ChatClient, type ChatConnectionState } from '../chat/client';
import type { ServerFrame } from '../chat/protocol';
import { connectionMachine } from '../ble/connection';

// Mandatory OBD-II Mode 1 PIDs that every adapter-equipped vehicle supports.
// Passed to the backend in the `register` frame so the AI knows it has live
// vehicle data available even before any tool runs.
const COMMON_SUPPORTED_PIDS = [
  '0100', // PIDs supported [01–20]
  '0101', // Monitor status
  '0103', // Fuel system status
  '0104', // Engine load
  '0105', // Coolant temperature
  '010B', // Intake manifold pressure
  '010C', // Engine RPM
  '010D', // Vehicle speed
  '010E', // Timing advance
  '010F', // Intake air temperature
  '0111', // Throttle position
  '011C', // OBD standards
  '011F', // Runtime since engine start
  '0121', // Distance with MIL on
  '012F', // Fuel level
  '0142', // Control module voltage
  '0146', // Ambient air temperature
];

function shortId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface PendingWriteConfirmation {
  toolUseId: string;
  name: string;
}

/** Async function registered by useToolExecutor to handle BLE tool dispatch. */
export type ToolExecutor = (
  toolUseId: string,
  name: string,
  input: Record<string, unknown>,
) => Promise<void>;

// Module-scoped executor set by useToolExecutor hook.
let toolExecutor: ToolExecutor | null = null;

export function registerToolExecutor(fn: ToolExecutor): void {
  toolExecutor = fn;
}

export function unregisterToolExecutor(): void {
  toolExecutor = null;
}

/** Send a tool result back to the backend over the open WebSocket. */
export function sendToolResult(toolUseId: string, content: unknown, isError = false): void {
  client?.sendToolResult(toolUseId, content, isError);
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
      if (toolExecutor) {
        void toolExecutor(frame.tool_use_id, frame.name, frame.input);
      }
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
      // Surface backend errors as a transient assistant note so the user sees
      // them. Also stop the in-flight bubble's streaming animation, since no
      // assistant_message_end will arrive for the interrupted turn.
      set((s) => ({
        messages: [
          ...s.messages.map((m) =>
            m.id === s.streamingMessageId ? { ...m, isStreaming: false } : m,
          ),
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
    // Snapshot adapter state at chat-open time so the backend's register payload
    // tells the AI whether vehicle data is reachable. Without this the
    // supported_pids list is empty and Claude assumes "no adapter".
    const adapter = connectionMachine.getAdapter();
    const supportedPids = adapter ? COMMON_SUPPORTED_PIDS : [];
    client = new ChatClient({
      token,
      sessionId,
      locale: locale ?? 'en',
      supportedPids,
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
    set((s) => ({
      isStreaming: false,
      streamingMessageId: null,
      // Clear the in-flight bubble's streaming flag so its animated dots stop;
      // the backend won't send assistant_message_end for an aborted turn.
      messages: s.streamingMessageId
        ? s.messages.map((m) =>
            m.id === s.streamingMessageId ? { ...m, isStreaming: false } : m,
          )
        : s.messages,
    }));
  },

  clearMessages: () =>
    set(() => ({
      messages: [],
      isStreaming: false,
      streamingMessageId: null,
      pendingWriteConfirmation: null,
    })),
}));

// ── test-only helpers (used by jest) ─────────────────────────────────────────

export function __setChatClientForTesting(c: ChatClient | null): void {
  client = c;
}

export function __getChatClientForTesting(): ChatClient | null {
  return client;
}
