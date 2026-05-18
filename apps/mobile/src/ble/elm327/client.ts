import { CommandQueue, type EnqueueOptions, type QueueStats } from '../command-queue';
import { Elm327Error } from './errors';
import { ResponseFramer } from './framer';
import { cleanFrame, parseObdResponse, type ParsedObdResponse } from './parser';
import type { ElmTransport } from './transport';

export type { QueuePriority, QueueStats, EnqueueOptions } from '../command-queue';

export interface Elm327ClientOptions {
  defaultTimeoutMs?: number;
  defaultRetries?: number;
  initTimeoutMs?: number;
}

export interface SendCommandOptions {
  timeoutMs?: number;
  retries?: number;
  ignoreEmpty?: boolean;
  /** 'high' bypasses pause() and runs before any 'normal' items. Default: 'normal'. */
  priority?: EnqueueOptions['priority'];
  /**
   * When set, concurrent calls with the same key share one in-flight Promise.
   * Useful for dashboard PID polling: duplicate reads within a round-trip
   * collapse into a single command on the wire.
   */
  coalesceKey?: string;
}

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_RETRIES = 1;
const DEFAULT_INIT_TIMEOUT_MS = 6000;

// AT init sequence used after every adapter (re)connect.
// ATZ  — full reset (slowest, ~1s)
// ATE0 — turn off command echo so responses don't include the sent command
// ATL0 — disable linefeeds (CR-only response separators)
// ATS0 — disable spaces between bytes (denser frames, easier parsing)
// ATSP0 — auto-negotiate protocol on first OBD request
export const ELM_INIT_COMMANDS: ReadonlyArray<string> = [
  'ATZ',
  'ATE0',
  'ATL0',
  'ATS0',
  'ATSP0',
];

interface PendingRequest {
  resolve: (frame: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  command: string;
}

export class Elm327Client {
  private framer = new ResponseFramer();
  private unsubscribe: (() => void) | null = null;
  private pending: PendingRequest | null = null;
  private queue = new CommandQueue();
  private initialized = false;

  private readonly defaultTimeoutMs: number;
  private readonly defaultRetries: number;
  private readonly initTimeoutMs: number;

  constructor(
    private readonly transport: ElmTransport,
    options: Elm327ClientOptions = {},
  ) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultRetries = options.defaultRetries ?? DEFAULT_RETRIES;
    this.initTimeoutMs = options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
  }

  async initialize(): Promise<void> {
    this.attachListener();
    for (const cmd of ELM_INIT_COMMANDS) {
      // ATZ takes longer than later commands; give the whole init a generous budget.
      // High priority so init is never blocked by a paused queue.
      await this.sendRaw(cmd, { timeoutMs: this.initTimeoutMs, retries: 0, priority: 'high' });
    }
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async sendCommand(command: string, options: SendCommandOptions = {}): Promise<string> {
    if (!this.initialized) {
      throw new Elm327Error('not-initialized', 'Elm327Client.initialize() must be called first', {
        command,
      });
    }
    return this.sendRaw(command, options);
  }

  async readPid(mode: number, pid: number, options: SendCommandOptions = {}): Promise<ParsedObdResponse> {
    const cmd = `${mode.toString(16).padStart(2, '0').toUpperCase()}${pid.toString(16).padStart(2, '0').toUpperCase()}`;
    const frame = await this.sendCommand(cmd, options);
    return parseObdResponse(frame, mode, pid);
  }

  /** Pause normal-priority commands. High-priority (AI tool calls) still run. */
  pauseQueue(): void {
    this.queue.pause();
  }

  /** Resume normal-priority commands after a pause. */
  resumeQueue(): void {
    this.queue.resume();
  }

  /** Queue depth and last-command round-trip time for UI diagnostics. */
  getQueueStats(): QueueStats {
    return this.queue.getStats();
  }

  async close(): Promise<void> {
    this.queue.cancelAll(new Elm327Error('transport', 'Client closed'));
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Elm327Error('transport', 'Client closed'));
      this.pending = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.framer.reset();
    this.initialized = false;
    await this.transport.close();
  }

  private attachListener(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.transport.subscribe((chunk) => this.onChunk(chunk));
  }

  private onChunk(chunk: string): void {
    const frames = this.framer.push(chunk);
    if (frames.length === 0) return;
    for (const frame of frames) {
      this.deliverFrame(frame);
    }
  }

  private deliverFrame(frame: string): void {
    const pending = this.pending;
    if (!pending) return;
    const cleaned = cleanFrame(frame);
    if (!cleaned) return; // Skip empty frames between commands.
    clearTimeout(pending.timer);
    this.pending = null;
    pending.resolve(frame);
  }

  private sendRaw(command: string, options: SendCommandOptions): Promise<string> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const retries = options.retries ?? this.defaultRetries;
    const priority = options.priority ?? 'normal';
    const coalesceKey = options.coalesceKey;

    const run = async (): Promise<string> => {
      let attempt = 0;
      let lastError: Error | null = null;
      while (attempt <= retries) {
        try {
          return await this.dispatch(command, timeoutMs);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (!isRetryable(lastError)) throw lastError;
          attempt += 1;
        }
      }
      throw lastError ?? new Elm327Error('protocol', 'Retry budget exhausted', { command });
    };

    return this.queue.enqueue(run, { priority, coalesceKey });
  }

  private dispatch(command: string, timeoutMs: number): Promise<string> {
    this.attachListener();
    this.framer.reset();

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) {
          this.pending = null;
        }
        reject(new Elm327Error('timeout', `Command "${command}" timed out after ${timeoutMs}ms`, {
          command,
        }));
      }, timeoutMs);

      this.pending = { resolve, reject, timer, command };

      this.transport.write(`${command}\r`).catch((err) => {
        if (this.pending?.timer === timer) {
          clearTimeout(timer);
          this.pending = null;
          reject(
            new Elm327Error('transport', `Failed to write command "${command}"`, {
              command,
              cause: err,
            }),
          );
        }
      });
    });
  }
}

function isRetryable(err: Error): boolean {
  if (!(err instanceof Elm327Error)) return false;
  return err.kind === 'timeout' || err.kind === 'bus-busy' || err.kind === 'searching';
}
