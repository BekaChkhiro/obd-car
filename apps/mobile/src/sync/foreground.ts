/**
 * Foreground sync trigger.
 *
 * The task spec calls for "background sync via expo-task-manager when app
 * foregrounded" — but expo-task-manager's background-fetch runs at OS
 * discretion (every 15+ min, often skipped). For the "when app
 * foregrounded" half, React Native's AppState event is the right hook:
 * it fires the instant the user returns to the app, which is exactly
 * when we want fresh data.
 *
 * Wire this once during app startup (e.g. from a top-level provider):
 *
 *   const db = await getDb();
 *   const unsub = registerForegroundSync(db, () => useAuthStore.getState().user?.id ?? null);
 *
 * The returned unsubscribe function should be invoked on teardown
 * (logout, unmount, etc.).
 */

import { AppState, type AppStateStatus } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { sync } from './engine';

type UserIdProvider = () => number | null;

export interface ForegroundSyncOptions {
  /** Cooldown between automatic ticks (ms). Defaults to 30s. */
  minIntervalMs?: number;
  /** Hook called after each tick. Errors are caught and forwarded. */
  onResult?: (result: Awaited<ReturnType<typeof sync>> | null, error: unknown) => void;
}

export function registerForegroundSync(
  db: SQLiteDatabase,
  getUserId: UserIdProvider,
  options: ForegroundSyncOptions = {},
): () => void {
  const minIntervalMs = options.minIntervalMs ?? 30_000;
  let lastTickAt = 0;

  const tick = async () => {
    const now = Date.now();
    if (now - lastTickAt < minIntervalMs) return;
    const userId = getUserId();
    if (userId == null) return;
    lastTickAt = now;
    try {
      const result = await sync(db, userId);
      options.onResult?.(result, null);
    } catch (err) {
      options.onResult?.(null, err);
    }
  };

  const handleChange = (state: AppStateStatus) => {
    if (state === 'active') {
      void tick();
    }
  };

  const subscription = AppState.addEventListener('change', handleChange);

  // Kick once on registration if already active.
  if (AppState.currentState === 'active') {
    void tick();
  }

  return () => {
    subscription.remove();
  };
}
