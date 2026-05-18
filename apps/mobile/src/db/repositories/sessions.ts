import type { SQLiteDatabase } from 'expo-sqlite';
import type { Session } from '../schema';

export async function getSessions(
  db: SQLiteDatabase,
  userId: number,
): Promise<Session[]> {
  return db.getAllAsync<Session>(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
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

export async function getPendingSessions(db: SQLiteDatabase): Promise<Session[]> {
  return db.getAllAsync<Session>(
    "SELECT * FROM sessions WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}
