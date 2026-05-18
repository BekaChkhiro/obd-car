import type { SQLiteDatabase } from 'expo-sqlite';
import type { ToolCall } from '../schema';

export async function getToolCallsForMessage(
  db: SQLiteDatabase,
  messageId: string,
): Promise<ToolCall[]> {
  return db.getAllAsync<ToolCall>(
    'SELECT * FROM tool_calls WHERE message_id = ? ORDER BY created_at ASC',
    messageId,
  );
}

export async function appendToolCall(
  db: SQLiteDatabase,
  toolCall: {
    id: string;
    message_id: string;
    tool_name: string;
    input: string;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO tool_calls (id, message_id, tool_name, input) VALUES (?, ?, ?, ?)`,
    toolCall.id,
    toolCall.message_id,
    toolCall.tool_name,
    toolCall.input,
  );
}

export async function resolveToolCall(
  db: SQLiteDatabase,
  id: string,
  output: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE tool_calls SET output = ? WHERE id = ?',
    output,
    id,
  );
}

export async function markToolCallSynced(
  db: SQLiteDatabase,
  id: string,
  serverId: number,
): Promise<void> {
  await db.runAsync(
    "UPDATE tool_calls SET sync_status = 'synced', server_id = ? WHERE id = ?",
    serverId,
    id,
  );
}

export async function getPendingToolCalls(db: SQLiteDatabase): Promise<ToolCall[]> {
  return db.getAllAsync<ToolCall>(
    "SELECT * FROM tool_calls WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}
