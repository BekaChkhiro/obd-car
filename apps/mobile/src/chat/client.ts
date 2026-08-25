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

/** Live OBD-II link state, as reported to the backend. */
export interface AdapterState {
  connected: boolean;
  /**
   * The link is the demo mock, not a dongle in a car. Kept separate from
   * `connected` because both facts have to travel: the tools work, and every
   * number they return is generated.
   */
  simulated: boolean;
  supportedPids: string[];
  vin: string | null;
}

export interface ChatClientOptions {
  /**
   * Resolves the token for the next handshake, refreshing when asked.
   *
   * Called on every (re)connect rather than captured once: access tokens live
   * ~15 minutes and this screen routinely stays mounted for longer. A token
   * fixed at construction means the socket starts failing mid-session and —
   * because the server accepts the socket before rejecting the token — retries
   * forever without ever getting a usable one.
   */
  getToken: (forceRefresh: boolean) => Promise<string | null>;
  sessionId: string;
  locale?: string;
  /**
   * Read at every (re)connect rather than snapshotted at construction — the
   * adapter can drop or come back while the socket stays up, and re-sending a
   * stale "connected" would tell the assistant it can read a car it cannot.
   */
  getAdapterState?: () => AdapterState;
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
  | 'closed'
  /** Signed out or the refresh token is spent — retrying cannot help. */
  | 'unauthorized';

export class ChatClient {
  private ws: WebSocket | null = null;
  private opts: ChatClientOptions;
  private lastSeq = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;
  private state: ChatConnectionState = 'idle';
  private hasRegisteredOnce = false;
  /** Ask the token provider to refresh on the next open. */
  private forceTokenRefresh = false;
  /** A freshly refreshed token was already rejected — stop retrying. */
  private triedFreshToken = false;

  constructor(opts: ChatClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.ws !== null) return;
    this.explicitlyClosed = false;
    void this.open();
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

  /** Push the current adapter state mid-session (adapter connected or dropped). */
  sendAdapterStatus(): void {
    const adapter = this.currentAdapterState();
    this.send({
      type: 'adapter_status',
      connected: adapter.connected,
      simulated: adapter.simulated,
      supported_pids: adapter.supportedPids,
      vin: adapter.vin,
    });
  }

  abort(): void {
    this.send({ type: 'abort' });
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async open(): Promise<void> {
    this.setState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    const token = await this.opts.getToken(this.forceTokenRefresh);
    this.forceTokenRefresh = false;
    // `close()` may have been called while the refresh was in flight.
    if (this.explicitlyClosed) return;
    if (!token) {
      this.giveUpUnauthorized();
      return;
    }

    const url = `${BASE_WS_URL}/ws/session/${encodeURIComponent(
      this.opts.sessionId,
    )}?token=${encodeURIComponent(token)}`;
    const factory = this.opts.wsFactory ?? ((u: string) => new WebSocket(u));
    const ws = factory(url);
    this.ws = ws;

    ws.onopen = () => {
      // Deliberately *not* resetting `reconnectAttempt` here. The server
      // accepts the socket before it validates the token, so a rejected
      // connection also reaches `onopen` — resetting on open turned an expired
      // token into a once-per-second reconnect loop that never backed off.
      const adapter = this.currentAdapterState();
      this.send({
        type: 'register',
        supported_pids: adapter.supportedPids,
        vin: adapter.vin,
        locale: this.opts.locale ?? 'en',
        adapter_connected: adapter.connected,
        adapter_simulated: adapter.simulated,
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
        // A working session is the only proof the connection is good, so this
        // is where the back-off resets.
        this.reconnectAttempt = 0;
        this.triedFreshToken = false;
        this.hasRegisteredOnce = true;
        this.setState('connected');
      }
      if (frame.type === 'error' && frame.code === 'unauthorized') {
        if (this.triedFreshToken) {
          // Already retried with a newly minted token and still refused —
          // the refresh token is gone too. Hammering the server won't fix it.
          this.giveUpUnauthorized();
          return;
        }
        // The server closes the socket after this; reconnect with a fresh one.
        this.triedFreshToken = true;
        this.forceTokenRefresh = true;
        return;
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

  /** Stop reconnecting and report that the user has to sign in again. */
  private giveUpUnauthorized(): void {
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
    this.setState('unauthorized');
  }

  private currentAdapterState(): AdapterState {
    return (
      this.opts.getAdapterState?.() ?? {
        connected: false,
        simulated: false,
        supportedPids: [],
        vin: null,
      }
    );
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
        void this.open();
      }
    }, delay);
  }

  private setState(s: ChatConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onStateChange?.(s);
  }
}
