import { MockElmTransport, createMockAdapter } from '../mock-adapter';
import { Elm327Client } from '../elm327/client';
import { Elm327Error } from '../elm327/errors';

// Use a zero delay to keep tests fast
const FAST: { replyDelayMs: number } = { replyDelayMs: 0 };

// ── MockElmTransport ──────────────────────────────────────────────────────────

describe('MockElmTransport', () => {
  it('calls subscriber with a response ending in >', async () => {
    const transport = new MockElmTransport(FAST);
    const chunks: string[] = [];
    transport.subscribe((c) => chunks.push(c));
    await transport.write('ATZ\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toMatch(/>$/);
  });

  it('does not call subscriber after close()', async () => {
    const transport = new MockElmTransport(FAST);
    const chunks: string[] = [];
    transport.subscribe((c) => chunks.push(c));
    await transport.close();
    await transport.write('ATZ\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(chunks).toHaveLength(0);
  });

  it('unsubscribe function removes the listener', async () => {
    const transport = new MockElmTransport(FAST);
    const chunks: string[] = [];
    const unsub = transport.subscribe((c) => chunks.push(c));
    unsub();
    await transport.write('ATZ\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(chunks).toHaveLength(0);
  });

  it('replies OK to generic AT commands', async () => {
    const transport = new MockElmTransport(FAST);
    const chunks: string[] = [];
    transport.subscribe((c) => chunks.push(c));
    await transport.write('ATE0\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(chunks.join('')).toContain('OK');
  });

  it('replies with ATZ banner for ATZ', async () => {
    const transport = new MockElmTransport(FAST);
    const chunks: string[] = [];
    transport.subscribe((c) => chunks.push(c));
    await transport.write('ATZ\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(chunks.join('')).toContain('ELM327');
  });

  it('replies NO DATA for unknown PIDs', async () => {
    const transport = new MockElmTransport(FAST);
    const chunks: string[] = [];
    transport.subscribe((c) => chunks.push(c));
    await transport.write('01FF\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(chunks.join('')).toContain('NO DATA');
  });
});

// ── Elm327Client + MockElmTransport integration ───────────────────────────────

describe('Elm327Client with MockElmTransport', () => {
  async function makeClient() {
    const transport = new MockElmTransport(FAST);
    const client = new Elm327Client(transport);
    await client.initialize();
    return { client, transport };
  }

  it('initializes without throwing', async () => {
    await expect(makeClient()).resolves.toBeDefined();
  });

  it('isInitialized() is true after initialize()', async () => {
    const { client } = await makeClient();
    expect(client.isInitialized()).toBe(true);
  });

  it('throws not-initialized before initialize()', async () => {
    const transport = new MockElmTransport(FAST);
    const client = new Elm327Client(transport);
    let caughtErr: unknown;
    try {
      await client.sendCommand('0100');
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(Elm327Error);
    expect((caughtErr as Elm327Error).kind).toBe('not-initialized');
  });

  it('sends a command and receives a frame', async () => {
    const { client } = await makeClient();
    const frame = await client.sendCommand('0100');
    expect(frame).toBeTruthy();
  });

  it('readPid returns parsed mode/pid/data', async () => {
    const { client } = await makeClient();
    const result = await client.readPid(0x01, 0x0c);
    expect(result.mode).toBe(0x01);
    expect(result.pid).toBe(0x0c);
    expect(result.data).toHaveLength(2);
  });

  it('readPid for speed returns single-byte data', async () => {
    const { client } = await makeClient();
    const result = await client.readPid(0x01, 0x0d);
    expect(result.data).toHaveLength(1);
  });

  it('close() disables subsequent commands', async () => {
    const { client } = await makeClient();
    await client.close();
    expect(client.isInitialized()).toBe(false);
  });

  it('getQueueStats() returns a stats object', async () => {
    const { client } = await makeClient();
    const stats = client.getQueueStats();
    expect(typeof stats.queueDepth).toBe('number');
  });
});

// ── createMockAdapter ─────────────────────────────────────────────────────────

describe('createMockAdapter', () => {
  it('returns a ConnectedAdapter with pid/dtc/vin/ff', async () => {
    const adapter = await createMockAdapter(FAST);
    expect(adapter.pid).toBeDefined();
    expect(adapter.dtc).toBeDefined();
    expect(adapter.vin).toBeDefined();
    expect(adapter.ff).toBeDefined();
    expect(adapter.client).toBeDefined();
  });

  it('pid.readRpm() returns a numeric value between 0 and 20000', async () => {
    const adapter = await createMockAdapter(FAST);
    const pidVal = await adapter.pid.readRpm();
    expect(pidVal.value).toBeGreaterThanOrEqual(0);
    expect(pidVal.value).toBeLessThanOrEqual(20000);
    expect(pidVal.unit).toBe('rpm');
  });

  it('pid.readSpeed() returns a value in km/h', async () => {
    const adapter = await createMockAdapter(FAST);
    const pidVal = await adapter.pid.readSpeed();
    expect(pidVal.unit).toBe('km/h');
    expect(pidVal.value).toBeGreaterThanOrEqual(0);
  });

  it('pid.readCoolantTemp() returns temperature in °C', async () => {
    const adapter = await createMockAdapter(FAST);
    const pidVal = await adapter.pid.readCoolantTemp();
    expect(pidVal.unit).toBe('°C');
    expect(pidVal.value).toBeGreaterThanOrEqual(-40);
    expect(pidVal.value).toBeLessThanOrEqual(215);
  });

  it('pid.readFuelLevel() returns a percentage', async () => {
    const adapter = await createMockAdapter(FAST);
    const pidVal = await adapter.pid.readFuelLevel();
    expect(pidVal.unit).toBe('%');
    expect(pidVal.value).toBeGreaterThanOrEqual(0);
    expect(pidVal.value).toBeLessThanOrEqual(100);
  });

  it('pid.readBatteryVoltage() returns volts', async () => {
    const adapter = await createMockAdapter(FAST);
    const pidVal = await adapter.pid.readBatteryVoltage();
    expect(pidVal.unit).toBe('V');
    expect(pidVal.value).toBeGreaterThan(0);
  });

  it('dtc.readStoredDtcs() returns an array', async () => {
    const adapter = await createMockAdapter(FAST);
    const dtcs = await adapter.dtc.readStoredDtcs();
    expect(Array.isArray(dtcs)).toBe(true);
  });

  it('vin.readVin() returns a 17-char VIN', async () => {
    const adapter = await createMockAdapter(FAST);
    const { vin } = await adapter.vin.readVin();
    expect(vin).toHaveLength(17);
    expect(vin).toMatch(/^[A-Z0-9]+$/);
  });

  it('negotiatedProtocol is Auto', async () => {
    const adapter = await createMockAdapter(FAST);
    expect(adapter.negotiatedProtocol.protocolName).toBe('Auto');
  });
});
