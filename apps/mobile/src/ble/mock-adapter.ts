import { Elm327Client } from './elm327/client';
import type { ElmTransport } from './elm327/transport';
import type { ConnectedAdapter } from './manager';
import { PidReader } from './pid-reader';

export interface MockAdapterOptions {
  /** Simulated round-trip latency in ms. Default: 20. */
  replyDelayMs?: number;
}

// ── Simulation helpers ────────────────────────────────────────────────────────

/** Engine RPM oscillates 800–1800 on a 30-second sine cycle. */
function simRpm(elapsedMs: number): number {
  return 800 + 500 * (1 + Math.sin((2 * Math.PI * elapsedMs) / 30_000));
}

/** Speed tracks RPM curve, 0–60 km/h, clamped positive. */
function simSpeed(elapsedMs: number): number {
  return Math.max(0, Math.round(60 * Math.sin((2 * Math.PI * elapsedMs) / 30_000)));
}

/** Coolant warms from 20 °C to 88 °C over the first 60 s, then holds. */
function simCoolantTemp(elapsedMs: number): number {
  return Math.round(20 + 68 * Math.min(1, elapsedMs / 60_000));
}

/** Fuel level is stable at 75 % for demo purposes. */
function simFuelLevel(): number {
  return 75;
}

/** Battery sits at 13.8 V with minor jitter (±0.1 V). */
function simBattery(): number {
  return 13.8 + (Math.random() - 0.5) * 0.2;
}

// ── OBD response encoders ────────────────────────────────────────────────────

function hex2(n: number): string {
  return (n & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

function encodeRpm(rpm: number): string {
  const v = Math.round(Math.max(0, rpm) * 4) & 0xffff;
  return `41 0C ${hex2(v >> 8)} ${hex2(v)}`;
}

function encodeSpeed(kmh: number): string {
  return `41 0D ${hex2(Math.min(255, Math.max(0, Math.round(kmh))))}`;
}

function encodeCoolantTemp(degC: number): string {
  return `41 05 ${hex2(Math.round(degC) + 40)}`;
}

function encodeFuelLevel(pct: number): string {
  return `41 2F ${hex2(Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255))}`;
}

function encodeBattery(volts: number): string {
  const raw = Math.round(volts * 1000) & 0xffff;
  return `41 42 ${hex2(raw >> 8)} ${hex2(raw)}`;
}

function buildResponse(command: string, startTime: number): string {
  const elapsed = Date.now() - startTime;
  const cmd = command.trim().toUpperCase().replace(/\r$/, '');

  if (cmd.startsWith('AT')) {
    return cmd === 'ATZ' ? 'ELM327 v1.5\r\r\r' : 'OK\r';
  }

  switch (cmd) {
    case '0100':
      // Supported PIDs bitmap 0x01-0x20. Reports: coolant (05), RPM (0C), speed (0D), fuel (2F).
      return '41 00 00 18 80 00\r';
    case '010C':
      return `${encodeRpm(simRpm(elapsed))}\r`;
    case '010D':
      return `${encodeSpeed(simSpeed(elapsed))}\r`;
    case '0105':
      return `${encodeCoolantTemp(simCoolantTemp(elapsed))}\r`;
    case '012F':
      return `${encodeFuelLevel(simFuelLevel())}\r`;
    case '0142':
      return `${encodeBattery(simBattery())}\r`;
    default:
      return 'NO DATA\r';
  }
}

// ── MockElmTransport ──────────────────────────────────────────────────────────

/**
 * In-memory ElmTransport that replies with simulated OBD-II sensor data.
 * Drop-in replacement for BleElmTransport in demos and Detox tests.
 */
export class MockElmTransport implements ElmTransport {
  private listener: ((chunk: string) => void) | null = null;
  private readonly startTime = Date.now();
  private closed = false;
  private readonly replyDelayMs: number;

  constructor(options: MockAdapterOptions = {}) {
    this.replyDelayMs = options.replyDelayMs ?? 20;
  }

  async write(payload: string): Promise<void> {
    if (this.closed) return;
    const response = buildResponse(payload, this.startTime) + '>';
    setTimeout(() => {
      if (!this.closed && this.listener) {
        this.listener(response);
      }
    }, this.replyDelayMs);
  }

  subscribe(onData: (chunk: string) => void): () => void {
    this.listener = onData;
    return () => {
      if (this.listener === onData) this.listener = null;
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.listener = null;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a fully-initialised mock adapter that implements the same
 * ConnectedAdapter interface as the real BLE driver.
 *
 * @example
 * const adapter = await createMockAdapter();
 * const rpm = await adapter.pid.readRpm();
 */
export async function createMockAdapter(
  options: MockAdapterOptions = {},
): Promise<ConnectedAdapter> {
  const transport = new MockElmTransport(options);
  const client = new Elm327Client(transport);
  await client.initialize();
  return {
    client,
    pid: new PidReader(client),
    // Mock always acts as auto-detected protocol — no real negotiation needed.
    negotiatedProtocol: { protocolNumber: 0, protocolName: 'Auto' },
  };
}
