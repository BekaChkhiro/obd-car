import type { SQLiteDatabase } from 'expo-sqlite';
import type { Message, MessageRole } from '../schema';

export async function getMessages(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<Message[]> {
  return db.getAllAsync<Message>(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
    sessionId,
  );
}

export async function getMessage(
  db: SQLiteDatabase,
  id: string,
): Promise<Message | null> {
  return db.getFirstAsync<Message>('SELECT * FROM messages WHERE id = ?', id);
}

/**
 * Write-ahead: append locally first (sync_status='pending'), then send to backend.
 */
export async function appendMessage(
  db: SQLiteDatabase,
  message: {
    id: string;
    session_id: string;
    role: MessageRole;
    content: string;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)`,
    message.id,
    message.session_id,
    message.role,
    message.content,
  );
}

export async function markMessageSynced(
  db: SQLiteDatabase,
  id: string,
  serverId: number,
): Promise<void> {
  await db.runAsync(
    "UPDATE messages SET sync_status = 'synced', server_id = ? WHERE id = ?",
    serverId,
    id,
  );
}

export async function markMessageFailed(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE messages SET sync_status = 'failed' WHERE id = ?",
    id,
  );
}

export async function getPendingMessages(db: SQLiteDatabase): Promise<Message[]> {
  return db.getAllAsync<Message>(
    "SELECT * FROM messages WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}
