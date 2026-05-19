import type { SQLiteDatabase } from 'expo-sqlite';
import type { Session, SyncStatus } from '../schema';

export interface SessionSummary {
  id: string;
  user_id: number;
  vehicle_id: string | null;
  created_at: string;
  sync_status: SyncStatus;
  message_count: number;
  first_user_message: string | null;
}

export async function getSessions(
  db: SQLiteDatabase,
  userId: number,
): Promise<Session[]> {
  return db.getAllAsync<Session>(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
    userId,
  );
}

export async function getSessionsWithSummary(
  db: SQLiteDatabase,
  userId: number,
): Promise<SessionSummary[]> {
  return db.getAllAsync<SessionSummary>(
    `SELECT s.id, s.user_id, s.vehicle_id, s.created_at, s.sync_status,
            COUNT(m.id) AS message_count,
            MIN(CASE WHEN m.role = 'user' THEN m.content END) AS first_user_message
     FROM sessions s
     LEFT JOIN messages m ON m.session_id = s.id
     WHERE s.user_id = ?
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    userId,
  );
}

export async function getSession(
  db: SQLiteDatabase,
  id: string,
): Promise<Session | null> {
  return db.getFirstAsync<Session>('SELECT * FROM sessions WHERE id = ?', id);
}

export async function createSession(
  db: SQLiteDatabase,
  session: Pick<Session, 'id' | 'user_id' | 'vehicle_id'>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sessions (id, user_id, vehicle_id) VALUES (?, ?, ?)`,
    session.id,
    session.user_id,
    session.vehicle_id ?? null,
  );
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

/** Upsert a session pulled from the server. Marks it as already-synced locally. */
export async function upsertServerSession(
  db: SQLiteDatabase,
  session: Session,
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
