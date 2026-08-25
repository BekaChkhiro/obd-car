import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { newSessionId, openSession, useSessionStore } from '../store/session';
import {
  createSession,
  endSession,
  getSession,
} from '../db/repositories/sessions';

export interface ChatSessionControls {
  /** Null until the session row exists — callers must not connect before then. */
  sessionId: string | null;
  /** True while switching sessions, so the screen can avoid rendering a stale transcript. */
  loading: boolean;
  /** Abandon the current conversation and open an empty one. */
  startNew: () => Promise<void>;
  /** Reopen a past session and replay its transcript into the chat store. */
  resume: (id: string) => Promise<void>;
  /** Mark the session finished. It stays in history and reopens on the next message. */
  end: () => Promise<void>;
}

/**
 * Owns the chat screen's session lifecycle: pick or create one, and expose
 * new / resume / end.
 *
 * The session row is written before the id is published so the journal always
 * has a parent row to attach messages to.
 */
export function useChatSession(): ChatSessionControls {
  const db = useSQLiteContext();
  const user = useAuthStore((s) => s.user);
  const sessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const [loading, setLoading] = useState(false);

  const openNew = useCallback(async () => {
    if (!user) return;
    const id = newSessionId();
    await createSession(db, { id, user_id: user.id, vehicle_id: null });
    clearMessages();
    setActiveSessionId(id);
  }, [db, user, clearMessages, setActiveSessionId]);

  // Adopt the active session if it still exists, otherwise open a fresh one.
  // Re-adoption matters on two paths: the AI tab unmounts on every tab switch,
  // and deleting the open session from history clears the id out from under us.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      if (sessionId) {
        const existing = await getSession(db, sessionId);
        if (existing || cancelled) return; // keep the current transcript as-is
      }
      setLoading(true);
      try {
        if (!cancelled) await openNew();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, user, sessionId, openNew]);

  const startNew = useCallback(async () => {
    setLoading(true);
    try {
      await openNew();
    } finally {
      setLoading(false);
    }
  }, [openNew]);

  const resume = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        await openSession(db, id);
      } finally {
        setLoading(false);
      }
    },
    [db],
  );

  const end = useCallback(async () => {
    if (!sessionId) return;
    await endSession(db, sessionId);
  }, [db, sessionId]);

  return { sessionId, loading, startNew, resume, end };
}
