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

export async function markToolCallFailed(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE tool_calls SET sync_status = 'failed' WHERE id = ?",
    id,
  );
}

export async function getPendingToolCalls(db: SQLiteDatabase): Promise<ToolCall[]> {
  return db.getAllAsync<ToolCall>(
    "SELECT * FROM tool_calls WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}

/** Upsert a tool call pulled from the server (server-wins, mirrors messages). */
export async function upsertServerToolCall(
  db: SQLiteDatabase,
  toolCall: ToolCall,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO tool_calls (id, message_id, tool_name, input, output, created_at, sync_status, server_id)
     VALUES ($id, $message_id, $tool_name, $input, $output, $created_at, 'synced', $server_id)
     ON CONFLICT(id) DO UPDATE SET
       tool_name   = excluded.tool_name,
       input       = excluded.input,
       output      = excluded.output,
       created_at  = excluded.created_at,
       sync_status = 'synced',
       server_id   = excluded.server_id`,
    {
      $id: toolCall.id,
      $message_id: toolCall.message_id,
      $tool_name: toolCall.tool_name,
      $input: toolCall.input,
      $output: toolCall.output,
      $created_at: toolCall.created_at,
      $server_id: toolCall.server_id,
    },
  );
}
