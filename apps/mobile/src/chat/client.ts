// Auto-reconnecting WebSocket client for /ws/session/{id}.
//
// Lifecycle:
//   1. connect(token, sessionId)
//   2. on open → send `register`, await `registered`
//   3. on reconnect (drop + reopen) → re-register + send `resume{last_seq}` so
//      the backend replays everything we missed (the last partial assistant
//      message survives because the backend buffers recent frames).
//   4. consumer-supplied `onFrame` is called for every server frame in order.
//
// The dispatch layer (chat store) decides what to do with each frame — this
// class is just the connection mechanic.

import Constants from 'expo-constants';
import type { ClientFrame, ServerFrame } from './protocol';

const BASE_WS_URL: string =
  (Constants.expoConfig?.extra?.wsUrl as string | undefined) ?? 'ws://localhost:8000';

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16000];

export interface ChatClientOptions {
  token: string;
  sessionId: string;
  locale?: string;
  supportedPids?: string[];
  vin?: string | null;
  onFrame: (frame: ServerFrame) => void;
  onStateChange?: (state: ChatConnectionState) => void;
  // Test/DI seam — used by unit tests to inject a fake WS implementation.
  wsFactory?: (url: string) => WebSocket;
}

export type ChatConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

export class ChatClient {
  private ws: WebSocket | null = null;
  private opts: ChatClientOptions;
  private lastSeq = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;
  private state: ChatConnectionState = 'idle';
  private hasRegisteredOnce = false;

  constructor(opts: ChatClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.ws !== null) return;
    this.explicitlyClosed = false;
    this.open();
  }

  close(): void {
    this.explicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setState('closed');
  }

  sendUserMessage(id: string, content: string): void {
    this.send({ type: 'user_message', id, content });
  }

  sendToolResult(toolUseId: string, content: unknown, isError = false): void {
    this.send({
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      is_error: isError,
    });
  }

  sendConfirmWrite(name: string): void {
    this.send({ type: 'confirm_write', name });
  }

  abort(): void {
    this.send({ type: 'abort' });
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private open(): void {
    const url = `${BASE_WS_URL}/ws/session/${encodeURIComponent(
      this.opts.sessionId,
    )}?token=${encodeURIComponent(this.opts.token)}`;
    this.setState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const factory = this.opts.wsFactory ?? ((u: string) => new WebSocket(u));
    const ws = factory(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.send({
        type: 'register',
        supported_pids: this.opts.supportedPids ?? [],
        vin: this.opts.vin ?? null,
        locale: this.opts.locale ?? 'en',
      });
      if (this.hasRegisteredOnce && this.lastSeq > 0) {
        this.send({ type: 'resume', last_seq: this.lastSeq });
      }
    };

    ws.onmessage = (evt) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(typeof evt.data === 'string' ? evt.data : '') as ServerFrame;
      } catch {
        return;
      }
      if (typeof frame.seq === 'number' && frame.seq > this.lastSeq) {
        this.lastSeq = frame.seq;
      }
      if (frame.type === 'registered') {
        this.hasRegisteredOnce = true;
        this.setState('connected');
      }
      this.opts.onFrame(frame);
    };

    ws.onerror = () => {
      // The actual handling happens in onclose, which always fires after.
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.explicitlyClosed) {
        this.setState('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private send(frame: ClientFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private scheduleReconnect(): void {
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.reconnectAttempt += 1;
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.explicitlyClosed) {
        this.open();
      }
    }, delay);
  }

  private setState(s: ChatConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onStateChange?.(s);
  }
}
