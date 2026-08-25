export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface Vehicle {
  id: string;
  user_id: number;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
  server_id: number | null;
}

export interface Session {
  id: string;
  user_id: number;
  vehicle_id: string | null;
  /** User-set name, or null to fall back to a generated one in the UI. */
  title: string | null;
  created_at: string;
  /** Bumped on every message — drives most-recent-first ordering. */
  updated_at: string;
  /** Set when the user explicitly closes the session; null while resumable. */
  ended_at: string | null;
  /** Soft delete: rows stay so a pending sync can still push the deletion. */
  deleted_at: string | null;
  sync_status: SyncStatus;
  server_id: number | null;
}

/** Where a recording's numbers came from. Never inferred at read time. */
export type AdapterKind = 'real' | 'simulated';

/** One live-data capture run. */
export interface Recording {
  id: string;
  user_id: number;
  vehicle_id: string | null;
  session_id: string | null;
  label: string | null;
  adapter_kind: AdapterKind;
  started_at: string;
  ended_at: string | null;
  sample_count: number;
  deleted_at: string | null;
}

export type RecordingMetric =
  | 'rpm'
  | 'speed'
  | 'coolantTemp'
  | 'fuelLevel'
  | 'batteryVoltage';

export interface RecordingSample {
  id: number;
  recording_id: string;
  ts: string;
  metric: RecordingMetric;
  value: number;
  unit: string;
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

/** Per-entity cursor for pull-since queries. Key examples: "vehicles", "messages". */
export interface SyncCursor {
  entity: string;
  last_pulled_at: string | null;
}
