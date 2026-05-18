export type QueuePriority = 'high' | 'normal';

export interface EnqueueOptions {
  priority?: QueuePriority;
  /**
   * When set, concurrent enqueue calls with the same key share one in-flight
   * Promise instead of sending a duplicate command. The shared promise is
   * cleared as soon as the first execution settles.
   */
  coalesceKey?: string;
}

export interface QueueStats {
  /** Items waiting + 1 if a command is currently executing. */
  queueDepth: number;
  /** Round-trip time of the most recently completed command, or null. */
  lastLatencyMs: number | null;
}

interface QueueItem {
  execute: () => Promise<unknown>;
  priority: QueuePriority;
  coalesceKey: string | undefined;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
}

/**
 * Single-channel serializing queue with two priority lanes.
 *
 * - 'high' items (AI tool calls, init) always run before 'normal' ones.
 * - pause() holds 'normal' items; 'high' items continue unblocked.
 * - resume() drains paused 'normal' items in FIFO order.
 * - coalesceKey deduplicates concurrent requests for the same command:
 *   all callers share one in-flight Promise until it settles.
 */
export class CommandQueue {
  private highItems: QueueItem[] = [];
  private normalItems: QueueItem[] = [];
  private running = false;
  private paused = false;
  private lastLatencyMs: number | null = null;
  private coalesceMap = new Map<string, Promise<unknown>>();

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.drain();
  }

  enqueue<T>(execute: () => Promise<T>, opts: EnqueueOptions = {}): Promise<T> {
    const { priority = 'normal', coalesceKey } = opts;

    if (coalesceKey) {
      const existing = this.coalesceMap.get(coalesceKey);
      if (existing) return existing as Promise<T>;
    }

    let outerResolve!: (value: T) => void;
    let outerReject!: (err: unknown) => void;

    const promise = new Promise<T>((resolve, reject) => {
      outerResolve = resolve;
      outerReject = reject;
    });

    const item: QueueItem = {
      execute: execute as () => Promise<unknown>,
      priority,
      coalesceKey,
      resolve: outerResolve as (value: unknown) => void,
      reject: outerReject,
    };

    if (priority === 'high') {
      this.highItems.push(item);
    } else {
      this.normalItems.push(item);
    }

    if (coalesceKey) {
      this.coalesceMap.set(coalesceKey, promise);
      void promise.finally(() => {
        if (this.coalesceMap.get(coalesceKey) === promise) {
          this.coalesceMap.delete(coalesceKey);
        }
      });
    }

    this.drain();
    return promise;
  }

  /**
   * Reject all queued (not yet running) items. Used on adapter close so
   * callers don't hang waiting for responses from a closed transport.
   */
  cancelAll(err: Error): void {
    const items = [...this.highItems, ...this.normalItems];
    this.highItems = [];
    this.normalItems = [];
    this.coalesceMap.clear();
    for (const item of items) {
      item.reject(err);
    }
  }

  getStats(): QueueStats {
    return {
      queueDepth: this.highItems.length + this.normalItems.length + (this.running ? 1 : 0),
      lastLatencyMs: this.lastLatencyMs,
    };
  }

  private nextItem(): QueueItem | undefined {
    if (this.highItems.length > 0) return this.highItems.shift();
    if (!this.paused && this.normalItems.length > 0) return this.normalItems.shift();
    return undefined;
  }

  private drain(): void {
    if (this.running) return;
    const item = this.nextItem();
    if (!item) return;

    this.running = true;
    const start = Date.now();

    void item.execute().then(
      (result) => {
        this.lastLatencyMs = Date.now() - start;
        this.running = false;
        item.resolve(result);
        this.drain();
      },
      (err: unknown) => {
        this.lastLatencyMs = Date.now() - start;
        this.running = false;
        item.reject(err);
        this.drain();
      },
    );
  }
}
