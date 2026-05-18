import type { SQLiteDatabase } from 'expo-sqlite';

export type SyncEntity = 'vehicles' | 'sessions' | 'messages' | 'tool_calls';

export async function getCursor(
  db: SQLiteDatabase,
  entity: SyncEntity,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ last_pulled_at: string | null }>(
    'SELECT last_pulled_at FROM sync_cursors WHERE entity = ?',
    entity,
  );
  return row?.last_pulled_at ?? null;
}

export async function setCursor(
  db: SQLiteDatabase,
  entity: SyncEntity,
  lastPulledAt: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_cursors (entity, last_pulled_at)
     VALUES (?, ?)
     ON CONFLICT(entity) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    entity,
    lastPulledAt,
  );
}

export async function resetCursor(
  db: SQLiteDatabase,
  entity: SyncEntity,
): Promise<void> {
  await db.runAsync('DELETE FROM sync_cursors WHERE entity = ?', entity);
}
