export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface Vehicle {
  id: string;
  user_id: number;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  created_at: string;
  sync_status: SyncStatus;
  server_id: number | null;
}

export interface Session {
  id: string;
  user_id: number;
  vehicle_id: string | null;
  created_at: string;
  sync_status: SyncStatus;
  server_id: number | null;
}

export type MessageRole = 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  sync_status: SyncStatus;
  server_id: number | null;
}

export interface ToolCall {
  id: string;
  message_id: string;
  tool_name: string;
  input: string;
  output: string | null;
  created_at: string;
  sync_status: SyncStatus;
  server_id: number | null;
}
