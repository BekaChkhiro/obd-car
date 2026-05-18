// Wire-protocol types for /ws/session/{id} — must stay in lock-step with
// services/backend/src/app/ws/routes.py. Every server frame carries a
// monotonic `seq` so the client can resume after a reconnect.

export type ServerFrame =
  | { type: 'registered'; seq: number; session_id: string; user_id: number }
  | { type: 'assistant_message_start'; seq: number; message_id: string }
  | { type: 'text_delta'; seq: number; message_id: string; text: string }
  | {
      type: 'tool_call';
      seq: number;
      message_id: string;
      tool_use_id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_call_completed';
      seq: number;
      tool_use_id: string;
      name: string;
      elapsed_ms: number;
      truncated: boolean;
    }
  | {
      type: 'tool_call_error';
      seq: number;
      tool_use_id: string;
      name: string;
      reason: 'timeout' | 'transport_error' | 'confirmation_required' | 'unknown_tool';
      message: string;
    }
  | { type: 'assistant_message_end'; seq: number; message_id: string }
  | { type: 'turn_complete'; seq: number; stop_reason: string; iterations: number }
  | { type: 'replay_complete'; seq: number }
  | { type: 'error'; seq: number; code: string; message: string }
  | { type: 'ack'; seq: number; received: string };

export type ClientFrame =
  | { type: 'auth'; token: string }
  | {
      type: 'register';
      supported_pids: string[];
      vin: string | null;
      locale: string;
    }
  | { type: 'user_message'; id: string; content: string }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: unknown;
      is_error?: boolean;
    }
  | { type: 'abort' }
  | { type: 'resume'; last_seq: number };
