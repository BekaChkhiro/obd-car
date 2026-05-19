import { CommandQueue } from '../command-queue';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('CommandQueue', () => {
  it('executes a single item and resolves', async () => {
    const q = new CommandQueue();
    const result = await q.enqueue(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('serialises items: second starts after first completes', async () => {
    const q = new CommandQueue();
    const order: number[] = [];

    const first = q.enqueue(async () => {
      order.push(1);
      return 'a';
    });
    const second = q.enqueue(async () => {
      order.push(2);
      return 'b';
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it('propagates rejection to the caller', async () => {
    const q = new CommandQueue();
    await expect(
      q.enqueue(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });

  it('continues processing after a rejection', async () => {
    const q = new CommandQueue();
    void q.enqueue(() => Promise.reject(new Error('fail'))).catch(() => {});
    const result = await q.enqueue(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('runs high-priority items before normal-priority items', async () => {
    const q = new CommandQueue();
    const order: string[] = [];

    // Block the queue with a slow normal item already running
    let unblockFirst!: () => void;
    const first = q.enqueue(
      () =>
        new Promise<void>((res) => {
          unblockFirst = res;
        }),
    );

    // Enqueue one normal and one high while first is running
    const normal = q.enqueue(async () => {
      order.push('normal');
    });
    const high = q.enqueue(
      async () => {
        order.push('high');
      },
      { priority: 'high' },
    );

    unblockFirst();
    await first;
    await Promise.all([normal, high]);

    expect(order[0]).toBe('high');
    expect(order[1]).toBe('normal');
  });

  it('pause() holds normal items but not high-priority ones', async () => {
    const q = new CommandQueue();
    q.pause();

    const ran: string[] = [];
    const normalPromise = q
      .enqueue(async () => {
        ran.push('normal');
      })
      .catch(() => {});

    const highPromise = q.enqueue(
      async () => {
        ran.push('high');
      },
      { priority: 'high' },
    );

    await highPromise;
    expect(ran).toContain('high');
    expect(ran).not.toContain('normal');

    q.resume();
    await normalPromise;
    expect(ran).toContain('normal');
  });

  it('resume() drains paused normal items', async () => {
    const q = new CommandQueue();
    q.pause();

    const p = q.enqueue(() => Promise.resolve('queued'));
    q.resume();
    expect(await p).toBe('queued');
  });

  it('resume() is idempotent when not paused', () => {
    const q = new CommandQueue();
    expect(() => q.resume()).not.toThrow();
  });

  it('coalesces concurrent requests with the same key', async () => {
    const q = new CommandQueue();
    let callCount = 0;

    const execute = () =>
      new Promise<string>((r) => {
        callCount++;
        setTimeout(() => r('result'), 10);
      });

    const [a, b] = await Promise.all([
      q.enqueue(execute, { coalesceKey: 'rpm' }),
      q.enqueue(execute, { coalesceKey: 'rpm' }),
    ]);

    expect(a).toBe('result');
    expect(b).toBe('result');
    expect(callCount).toBe(1);
  });

  it('cancelAll() rejects all queued items', async () => {
    const q = new CommandQueue();

    let blockRelease!: () => void;
    // Keep the queue busy so we can enqueue items before they run
    void q.enqueue(
      () => new Promise<void>((r) => { blockRelease = r; }),
    );

    const p1 = q.enqueue(() => Promise.resolve('a'));
    const p2 = q.enqueue(() => Promise.resolve('b'));

    q.cancelAll(new Error('closed'));
    blockRelease();

    await expect(p1).rejects.toThrow('closed');
    await expect(p2).rejects.toThrow('closed');
  });

  it('getStats() returns correct queueDepth', async () => {
    const q = new CommandQueue();
    expect(q.getStats().queueDepth).toBe(0);

    let blockRelease!: () => void;
    const running = q.enqueue(() => new Promise<void>((r) => { blockRelease = r; }));
    q.enqueue(() => Promise.resolve());

    await tick();
    expect(q.getStats().queueDepth).toBe(2);

    blockRelease();
    await running;
    await tick();
  });

  it('getStats() lastLatencyMs is null initially', () => {
    const q = new CommandQueue();
    expect(q.getStats().lastLatencyMs).toBeNull();
  });

  it('getStats() lastLatencyMs is set after an execution', async () => {
    const q = new CommandQueue();
    await q.enqueue(() => Promise.resolve('x'));
    expect(q.getStats().lastLatencyMs).not.toBeNull();
    expect(q.getStats().lastLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
