import { createMMKV } from 'react-native-mmkv';
import type { Elm327Client } from './elm327/client';
import { Elm327Error } from './elm327/errors';

const storage = createMMKV({ id: 'obd-protocol' });

export const OBD_PROTOCOL_NAMES: Readonly<Record<number, string>> = {
  0: 'Auto',
  1: 'SAE J1850 PWM',
  2: 'SAE J1850 VPW',
  3: 'ISO 9141-2',
  4: 'ISO 14230-4 KWP (5-baud init)',
  5: 'ISO 14230-4 KWP (fast init)',
  6: 'ISO 15765-4 CAN (11-bit, 500 kbps)',
  7: 'ISO 15765-4 CAN (29-bit, 500 kbps)',
  8: 'ISO 15765-4 CAN (11-bit, 250 kbps)',
  9: 'ISO 15765-4 CAN (29-bit, 250 kbps)',
};

// Probe sequence: auto-detect first, then each specific protocol in order.
const PROBE_SEQUENCE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

// Mode 01 PID 00 — supported-PIDs bitmap; every OBD-II ECU responds to this.
const PROBE_COMMAND = '0100';
const PROBE_TIMEOUT_MS = 5_000;
const ATSP_TIMEOUT_MS = 3_000;

export interface ProtocolNegotiationOptions {
  /**
   * Force a specific protocol number (0-9). The adapter still probes to verify
   * the ECU responds before caching. Use for stubborn ECUs (ISO 9141, some
   * Korean/Asian vehicles) that don't auto-negotiate cleanly.
   */
  override?: number;
  /**
   * Stable identifier (VIN preferred; BLE device ID as fallback) used to
   * persist the successful protocol in MMKV so future connections skip probing.
   */
  cacheKey?: string;
}

export interface NegotiatedProtocol {
  protocolNumber: number;
  protocolName: string;
}

function storageKey(id: string): string {
  return `protocol:${id}`;
}

export function loadCachedProtocol(id: string): number | null {
  const raw = storage.getString(storageKey(id));
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function saveCachedProtocol(id: string, protocolNumber: number): void {
  storage.set(storageKey(id), String(protocolNumber));
}

export function clearCachedProtocol(id: string): void {
  storage.remove(storageKey(id));
}

async function probeProtocol(client: Elm327Client, n: number): Promise<boolean> {
  try {
    await client.sendCommand(`ATSP${n}`, {
      priority: 'high',
      retries: 0,
      timeoutMs: ATSP_TIMEOUT_MS,
    });
    await client.sendCommand(PROBE_COMMAND, {
      priority: 'high',
      retries: 0,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Negotiate the OBD protocol for an already-initialized ELM327 client.
 *
 * Flow:
 *   1. Manual `override` → apply ATSPn, probe ECU, cache on success.
 *   2. Cached protocol for `cacheKey` → try it first; evict stale entries.
 *   3. Full probe: ATSP0 (auto), then ATSP1–ATSP9 in order.
 *   4. Cache the winner and return.
 *   5. Throw `Elm327Error('no-protocol', …)` with an actionable message if
 *      nothing responds — never silently swallow the failure.
 */
export async function negotiateProtocol(
  client: Elm327Client,
  options: ProtocolNegotiationOptions = {},
): Promise<NegotiatedProtocol> {
  const { override, cacheKey } = options;

  const nameOf = (n: number) => OBD_PROTOCOL_NAMES[n] ?? String(n);

  if (override !== undefined) {
    const ok = await probeProtocol(client, override);
    if (!ok) {
      throw new Elm327Error(
        'no-protocol',
        `Manual protocol override ATSP${override} (${nameOf(override)}) received no ECU response — check that the ignition is on and the adapter is seated correctly.`,
      );
    }
    if (cacheKey) saveCachedProtocol(cacheKey, override);
    return { protocolNumber: override, protocolName: nameOf(override) };
  }

  if (cacheKey) {
    const cached = loadCachedProtocol(cacheKey);
    if (cached !== null) {
      const ok = await probeProtocol(client, cached);
      if (ok) {
        return { protocolNumber: cached, protocolName: nameOf(cached) };
      }
      // Stale cache entry — fall through to full probe sequence.
      clearCachedProtocol(cacheKey);
    }
  }

  for (const n of PROBE_SEQUENCE) {
    const ok = await probeProtocol(client, n);
    if (ok) {
      if (cacheKey) saveCachedProtocol(cacheKey, n);
      return { protocolNumber: n, protocolName: nameOf(n) };
    }
  }

  throw new Elm327Error(
    'no-protocol',
    'No OBD protocol matched after probing ATSP0–ATSP9. Ensure the vehicle ignition is on and the ELM327 adapter is fully seated in the OBD port.',
  );
}
