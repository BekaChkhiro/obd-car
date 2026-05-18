/**
 * Wire types for the /sync/* protocol. Mirrors the Pydantic schemas in
 * services/backend/src/app/sync/schemas.py.
 */

export interface VehiclePushPayload {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SessionPushPayload {
  id: string;
  vehicle_id: string | null;
  created_at: string;
}

export interface MessagePushPayload {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
}

export interface ToolCallPushPayload {
  id: string;
  message_id: string;
  tool_name: string;
  input: string;
  output: string | null;
  created_at: string;
}

export interface PushRequest {
  vehicles: VehiclePushPayload[];
  sessions: SessionPushPayload[];
  messages: MessagePushPayload[];
  tool_calls: ToolCallPushPayload[];
}

export type PushConflict = 'none' | 'server-newer';

export interface PushAck {
  id: string;
  accepted: boolean;
  server_updated_at: string;
  conflict: PushConflict;
}

export interface PushResponse {
  vehicles: PushAck[];
  sessions: PushAck[];
  messages: PushAck[];
  tool_calls: PushAck[];
}

export interface VehiclePullPayload {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SessionPullPayload {
  id: string;
  vehicle_id: string | null;
  created_at: string;
}

export interface MessagePullPayload {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
}

export interface ToolCallPullPayload {
  id: string;
  message_id: string;
  tool_name: string;
  input: string;
  output: string | null;
  created_at: string;
}

export interface PullResponse {
  vehicles: VehiclePullPayload[];
  sessions: SessionPullPayload[];
  messages: MessagePullPayload[];
  tool_calls: ToolCallPullPayload[];
  server_time: string;
}

export interface SyncResult {
  pushed: { vehicles: number; sessions: number; messages: number; tool_calls: number };
  pulled: { vehicles: number; sessions: number; messages: number; tool_calls: number };
  conflicts: number;
  failures: number;
  serverTime: string | null;
}
