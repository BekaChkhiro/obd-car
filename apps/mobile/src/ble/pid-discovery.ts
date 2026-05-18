import { createMMKV } from 'react-native-mmkv';
import type { Elm327Client } from './elm327/client';
import { Elm327Error } from './elm327/errors';

const storage = createMMKV({ id: 'obd-pid-discovery' });

// Mode 01 availability-bitmap PIDs: each returns a 32-bit mask covering the
// next 32 PIDs. Bit 31 of the first response = PID 0x01, bit 0 = PID 0x20.
const BITMAP_PIDS = [0x00, 0x20, 0x40] as const;

export function parseBitmap(basePid: number, bytes: readonly number[]): Set<number> {
  const a = bytes[0] ?? 0;
  const b = bytes[1] ?? 0;
  const c = bytes[2] ?? 0;
  const d = bytes[3] ?? 0;
  // >>> 0 forces unsigned 32-bit so high bits (byte[0] > 0x7F) work correctly.
  const bits = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  const supported = new Set<number>();
  for (let i = 0; i < 32; i++) {
    if ((bits >>> (31 - i)) & 1) {
      supported.add(basePid + i + 1);
    }
  }
  return supported;
}

function cacheKey(vin: string): string {
  return `pids:${vin}`;
}

export function loadCachedPids(vin: string): Set<number> | null {
  const raw = storage.getString(cacheKey(vin));
  if (!raw) return null;
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Set(arr as number[]);
  } catch {
    return null;
  }
}

export function clearCachedPids(vin: string): void {
  storage.remove(cacheKey(vin));
}

function saveCachedPids(vin: string, pids: Set<number>): void {
  storage.set(cacheKey(vin), JSON.stringify([...pids]));
}

/**
 * Queries mode-01 availability bitmaps (0x00, 0x20, 0x40) and returns the set
 * of supported PIDs. Results are cached in MMKV keyed by VIN when provided.
 *
 * Stops early if a bitmap query returns NO DATA / timeout, or if the "next
 * range available" flag bit is not set in the current response.
 */
export async function discoverSupportedPids(
  client: Elm327Client,
  vin?: string,
): Promise<Set<number>> {
  if (vin) {
    const cached = loadCachedPids(vin);
    if (cached) return cached;
  }

  const supported = new Set<number>();

  for (const basePid of BITMAP_PIDS) {
    let data: number[];
    try {
      const response = await client.readPid(0x01, basePid);
      data = response.data;
    } catch (err) {
      if (
        err instanceof Elm327Error &&
        (err.kind === 'no-data' || err.kind === 'timeout')
      ) {
        break;
      }
      throw err;
    }

    const range = parseBitmap(basePid, data);
    for (const pid of range) supported.add(pid);

    // The last PID in this range (basePid+0x20) being set means the next
    // availability bitmap is supported. Stop early if it is not.
    if (!range.has(basePid + 0x20)) break;
  }

  if (vin) saveCachedPids(vin, supported);

  return supported;
}
