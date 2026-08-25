import type { SQLiteDatabase } from 'expo-sqlite';
import type { Session, SyncStatus } from '../schema';

export interface SessionSummary {
  id: string;
  user_id: number;
  vehicle_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  sync_status: SyncStatus;
  message_count: number;
  first_user_message: string | null;
}

/** Session rows as the sync API delivers them — no client-only lifecycle columns. */
export type ServerSession = Pick<
  Session,
  'id' | 'user_id' | 'vehicle_id' | 'created_at' | 'server_id'
>;

// Soft-deleted rows stay in the table so a later sync can still push the
// deletion, but they must never surface in any list the user sees.
const NOT_DELETED = 'deleted_at IS NULL';

export async function getSessions(
  db: SQLiteDatabase,
  userId: number,
): Promise<Session[]> {
  return db.getAllAsync<Session>(
    `SELECT * FROM sessions
     WHERE user_id = ? AND ${NOT_DELETED}
     ORDER BY updated_at DESC`,
    userId,
  );
}

export async function getSessionsWithSummary(
  db: SQLiteDatabase,
  userId: number,
): Promise<SessionSummary[]> {
  return db.getAllAsync<SessionSummary>(
    `SELECT s.id, s.user_id, s.vehicle_id, s.title, s.created_at, s.updated_at,
            s.ended_at, s.sync_status,
            COUNT(m.id) AS message_count,
            MIN(CASE WHEN m.role = 'user' THEN m.content END) AS first_user_message
     FROM sessions s
     LEFT JOIN messages m ON m.session_id = s.id
     WHERE s.user_id = ? AND s.${NOT_DELETED}
     GROUP BY s.id
     ORDER BY s.updated_at DESC`,
    userId,
  );
}

export async function getSession(
  db: SQLiteDatabase,
  id: string,
): Promise<Session | null> {
  return db.getFirstAsync<Session>(
    `SELECT * FROM sessions WHERE id = ? AND ${NOT_DELETED}`,
    id,
  );
}

export async function createSession(
  db: SQLiteDatabase,
  session: Pick<Session, 'id' | 'user_id' | 'vehicle_id'> & { title?: string | null },
): Promise<void> {
  // Idempotent: the chat screen calls this on every open, and re-opening a
  // session that already exists must not wipe its title or timestamps.
  await db.runAsync(
    `INSERT INTO sessions (id, user_id, vehicle_id, title)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    session.id,
    session.user_id,
    session.vehicle_id ?? null,
    session.title ?? null,
  );
}

/**
 * Bump `updated_at` so the session sorts to the top of history.
 *
 * Also clears `ended_at`: sending a new message in a closed session reopens it,
 * which is what the user means by continuing an old conversation.
 */
export async function touchSession(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sessions
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         ended_at = NULL
     WHERE id = ?`,
    id,
  );
}

export async function renameSession(
  db: SQLiteDatabase,
  id: string,
  title: string | null,
): Promise<void> {
  const trimmed = title?.trim();
  await db.runAsync(
    `UPDATE sessions
     SET title = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
    trimmed ? trimmed : null,
    id,
  );
}

/** Mark a session finished. It stays listed and can be reopened by sending a message. */
export async function endSession(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sessions
     SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND ended_at IS NULL`,
    id,
  );
}

/**
 * Soft-delete a session and its messages.
 *
 * Messages are removed outright — they carry no deletion-sync of their own, and
 * leaving them would let the summary query keep counting a deleted session.
 */
export async function deleteSession(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM tool_calls
       WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?)`,
      id,
    );
    await db.runAsync('DELETE FROM messages WHERE session_id = ?', id);
    await db.runAsync(
      `UPDATE sessions
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
      id,
    );
  });
}

export async function markSessionSynced(
  db: SQLiteDatabase,
  id: string,
  serverId: number,
): Promise<void> {
  await db.runAsync(
    "UPDATE sessions SET sync_status = 'synced', server_id = ? WHERE id = ?",
    serverId,
    id,
  );
}

export async function markSessionFailed(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE sessions SET sync_status = 'failed' WHERE id = ?",
    id,
  );
}

export async function getPendingSessions(db: SQLiteDatabase): Promise<Session[]> {
  return db.getAllAsync<Session>(
    "SELECT * FROM sessions WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}

/**
 * Upsert a session pulled from the server. Marks it as already-synced locally.
 *
 * Title and lifecycle columns are client-only, so the conflict branch leaves
 * them alone — a pull must not rename or resurrect a locally-managed session.
 */
export async function upsertServerSession(
  db: SQLiteDatabase,
  session: ServerSession,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sessions (id, user_id, vehicle_id, created_at, sync_status, server_id)
     VALUES ($id, $user_id, $vehicle_id, $created_at, 'synced', $server_id)
     ON CONFLICT(id) DO UPDATE SET
       vehicle_id  = excluded.vehicle_id,
       sync_status = 'synced',
       server_id   = excluded.server_id`,
    {
      $id: session.id,
      $user_id: session.user_id,
      $vehicle_id: session.vehicle_id,
      $created_at: session.created_at,
      $server_id: session.server_id,
    },
  );
}
