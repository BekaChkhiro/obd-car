import { create } from 'zustand';
import type { ChatMessage, ToolCall } from '../types/chat';
import { ChatClient, type ChatConnectionState } from '../chat/client';
import type { ServerFrame } from '../chat/protocol';
import { connectionMachine } from '../ble/connection';
import { getFreshAccessToken } from '../lib/api';
import type { AdapterState } from '../chat/client';
import type { SQLiteDatabase } from 'expo-sqlite';
import { appendMessage } from '../db/repositories/messages';
import { appendToolCall, resolveToolCall } from '../db/repositories/tool-calls';
import { touchSession } from '../db/repositories/sessions';

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

/**
 * The live-link snapshot handed to the backend on every (re)connect.
 *
 * A simulated link counts as connected in every build, demo mode included:
 * told there is no adapter, the assistant correctly refuses to read anything,
 * which leaves demo mode unable to show the one feature it exists to show.
 *
 * What keeps that honest is `simulated` travelling beside it rather than being
 * folded into it. The two facts answer different questions — whether a reading
 * can be taken, and whether it came off the user's car — and the backend needs
 * both to tell the model to report the numbers *as* generated. Collapsing them
 * either way is a lie: `connected: false` hides a working demo, and dropping
 * `simulated` hands the user an invented reading about their own vehicle.
 */
export function currentAdapterState(): AdapterState {
  const simulated = connectionMachine.getAdapterKind() === 'simulated';
  const connected = connectionMachine.hasLiveVehicleLink() || simulated;
  return {
    connected,
    simulated,
    supportedPids: connected ? [...connectionMachine.getSupportedPids()] : [],
    // The backend decodes this into a make, which is what decides the meaning
    // of a manufacturer-specific DTC. Sending null leaves the assistant
    // guessing which brand a P1xxx belongs to.
    vin: connected ? connectionMachine.getVin() : null,
  };
}

/**
 * Tell the backend the adapter came up or dropped, without reconnecting.
 *
 * No-op when the socket is closed — the state is re-sent in the `register`
 * frame on the next connect anyway.
 */
export function notifyAdapterStatus(): void {
  client?.sendAdapterStatus();
}

export function registerToolExecutor(fn: ToolExecutor): void {
  toolExecutor = fn;
}

export function unregisterToolExecutor(): void {
  toolExecutor = null;
}

/** Send a tool result back to the backend over the open WebSocket. */
export function sendToolResult(toolUseId: string, content: unknown, isError = false): void {
  client?.sendToolResult(toolUseId, content, isError);
  // Keep the payload on the in-memory tool call. It is the only place the
  // phone-side result exists — the backend's `tool_call_completed` frame
  // carries timing, not data — and the journal writes it out at end of turn.
  const serialised = typeof content === 'string' ? content : JSON.stringify(content);
  useChatStore.setState((state) => ({
    messages: state.messages.map((m) =>
      m.toolCalls?.some((t) => t.id === toolUseId)
        ? {
            ...m,
            toolCalls: m.toolCalls.map((t) =>
              t.id === toolUseId ? { ...t, result: serialised } : t,
            ),
          }
        : m,
    ),
  }));
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  connection: ChatConnectionState;
  // Active assistant message id currently being streamed, if any.
  streamingMessageId: string | null;
  // Set when the backend blocked a write tool and is waiting for user OK.
  pendingWriteConfirmation: PendingWriteConfirmation | null;

  connect: (opts: {
    sessionId: string;
    locale?: string;
    /** Journal target. Omit to run the session without local history. */
    db?: SQLiteDatabase;
  }) => void;
  /** Replace the transcript with messages loaded from local history. */
  hydrateMessages: (messages: ChatMessage[]) => void;
  disconnect: () => void;
  sendUserMessage: (content: string) => void;
  confirmWrite: (followUpMessage: string) => void;
  denyWrite: () => void;
  abort: () => void;
  clearMessages: () => void;
}

// Module-scoped client so HMR / re-mounts don't open a second socket.
let client: ChatClient | null = null;

/**
 * Journal target for the active session.
 *
 * Set by `connect(...)`. The SQLite handle is passed in from the React tree
 * rather than opened here so every writer shares the one connection expo-sqlite
 * hands out — a second connection to the same file invites `database is locked`
 * under the dashboard poller's write rate.
 */
let journal: { db: SQLiteDatabase; sessionId: string } | null = null;

/**
 * Persist without ever failing a UI action.
 *
 * A journal write is bookkeeping; a message that reached the backend must still
 * render if the local insert fails. Errors are swallowed deliberately.
 */
function persist(run: (j: { db: SQLiteDatabase; sessionId: string }) => Promise<unknown>): void {
  const target = journal;
  if (!target) return;
  void Promise.resolve(run(target)).catch(() => undefined);
}

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
      } else {
        // Nothing is mounted to run BLE commands. Answer immediately rather
        // than going silent: an unanswered tool_call only surfaces to the model
        // as a 5-second timeout, which reads like a flaky adapter and invites
        // it to fill in a plausible value instead of reporting the failure.
        sendToolResult(
          frame.tool_use_id,
          'No OBD-II adapter is connected — this reading could not be taken.',
          true,
        );
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

    case 'assistant_message_end': {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === frame.message_id ? { ...m, isStreaming: false } : m,
        ),
      }));
      // Write the finished turn out in one go. Tool calls are written here
      // rather than when their frame arrives so the message row they reference
      // already exists.
      const finished = useChatStore
        .getState()
        .messages.find((m) => m.id === frame.message_id);
      if (finished && finished.content.trim()) {
        persist(async ({ db, sessionId }) => {
          await appendMessage(db, {
            id: frame.message_id,
            session_id: sessionId,
            role: 'assistant',
            content: finished.content,
          });
          for (const tc of finished.toolCalls ?? []) {
            await appendToolCall(db, {
              id: tc.id,
              message_id: frame.message_id,
              tool_name: tc.name,
              input: JSON.stringify(tc.input),
            });
            if (tc.result !== undefined) {
              await resolveToolCall(db, tc.id, tc.result);
            }
          }
          await touchSession(db, sessionId);
        });
      }
      return;
    }

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

  connect: ({ sessionId, locale, db }) => {
    journal = db ? { db, sessionId } : null;
    if (client !== null) {
      // Already connected/connecting to the same session — leave it alone.
      return;
    }
    client = new ChatClient({
      // Fetched per handshake, not captured here: this store outlives the
      // 15-minute access token by a wide margin.
      getToken: (forceRefresh) => getFreshAccessToken(forceRefresh),
      sessionId,
      locale: locale ?? 'en',
      // Read live rather than snapshotted: the adapter can come up or drop
      // between opening the chat and the socket actually (re)connecting.
      getAdapterState: currentAdapterState,
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
    // Drop the journal target with the socket: without a client no further
    // frames arrive, and holding the handle would let a late write land on a
    // session the screen has already left.
    journal = null;
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
    persist(async ({ db, sessionId }) => {
      await appendMessage(db, {
        id,
        session_id: sessionId,
        role: 'user',
        content: trimmed,
      });
      // Bump the session so it sorts to the top of history, and reopen it if
      // the user had previously closed it.
      await touchSession(db, sessionId);
    });
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

  hydrateMessages: (messages) =>
    set(() => ({
      messages,
      isStreaming: false,
      streamingMessageId: null,
      pendingWriteConfirmation: null,
    })),

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
