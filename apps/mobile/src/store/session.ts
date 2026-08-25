import { create } from 'zustand';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useChatStore } from './chat';
import { getMessages } from '../db/repositories/messages';
import { getToolCallsForMessage } from '../db/repositories/tool-calls';
import type { ChatMessage, ToolCall } from '../types/chat';

/**
 * Which chat session the AI screen is currently attached to.
 *
 * Lives outside the screen so navigating away and back — or opening a past
 * session from history — continues the same conversation instead of silently
 * starting a new one and orphaning the old transcript.
 */
interface SessionState {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}));

/** Sortable-ish, collision-resistant id. Kept short — it appears in the WS URL. */
export function newSessionId(): string {
  return `chat-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function safeParse(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Rebuild an in-memory transcript from local history.
 *
 * Tool results are read back too — without them a resumed session would show
 * bare "ran read_dtcs" badges with no outcome, which reads like data that was
 * never actually retrieved.
 */
export async function loadTranscript(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<ChatMessage[]> {
  const rows = await getMessages(db, sessionId);
  const messages: ChatMessage[] = [];

  for (const row of rows) {
    if (row.role === 'tool') continue; // tool rows are attached to their message
    const toolCalls = await getToolCallsForMessage(db, row.id);
    const mapped: ToolCall[] = toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.tool_name,
      input: safeParse(tc.input),
      status: tc.output === null ? 'pending' : 'done',
      result: tc.output ?? undefined,
    }));
    messages.push({
      id: row.id,
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
      createdAt: row.created_at,
      ...(mapped.length > 0 ? { toolCalls: mapped } : {}),
    });
  }

  return messages;
}

/**
 * Attach the assistant to an existing session and replay its transcript.
 *
 * Callable from anywhere (history list, session detail) — the chat screen
 * watches `activeSessionId` and reconnects its socket when it changes, so no
 * navigation parameters have to be threaded through the router.
 *
 * The transcript is hydrated *before* the id is published so the screen never
 * renders the new session's header above the previous conversation's messages.
 */
export async function openSession(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<void> {
  const transcript = await loadTranscript(db, sessionId);
  useChatStore.getState().hydrateMessages(transcript);
  useSessionStore.getState().setActiveSessionId(sessionId);
}
