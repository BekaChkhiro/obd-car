export type DtcCategory = 'P' | 'B' | 'C' | 'U';

export interface Dtc {
  code: string;
  category: DtcCategory;
  number: number;
  isPending: boolean;
  isPermanent: boolean;
}

// OBD-II byte encoding: upper 2 bits → category, next 2 bits → subcategory, lower 12 bits → number
const BYTE_CATEGORIES: readonly DtcCategory[] = ['P', 'C', 'B', 'U'];

export function dtcFromBytes(byteA: number, byteB: number): Dtc {
  const categoryIndex = (byteA >> 6) & 0x3;
  const category = BYTE_CATEGORIES[categoryIndex] ?? 'P';
  const subcategory = (byteA >> 4) & 0x3;
  const num = ((byteA & 0x0f) << 8) | byteB;
  const code = `${category}${subcategory}${num.toString(16).padStart(3, '0').toUpperCase()}`;
  return { code, category, number: num, isPending: false, isPermanent: false };
}

const DTC_CODE_RE = /^([PBCU])(\d{4})$/i;

export function parseDtcCode(raw: string): Dtc | null {
  const match = DTC_CODE_RE.exec(raw.trim().toUpperCase());
  if (!match) return null;
  const [, letter, numStr] = match;
  const category = (letter as DtcCategory | undefined) ?? 'P';
  return {
    code: raw.trim().toUpperCase(),
    category,
    number: parseInt(numStr!, 10),
    isPending: false,
    isPermanent: false,
  };
}

// Error-string patterns that indicate the ECU returned no DTC data.
const ELM_NO_DATA_RE = /NO\s*DATA|UNABLE|BUS\s*(BUSY|ERROR)|CAN\s*ERROR|STOPPED|\?/i;

/**
 * Parse a raw ELM327 response frame for mode 0x03 (stored DTCs) or 0x07
 * (pending DTCs) into an array of Dtc objects.
 *
 * Handles:
 *  - Space-separated bytes ("43 03 00") — mock adapter and most real ELM327 configs
 *  - Compact no-space bytes ("430300") — ELM327 with ATS0
 *  - Multi-line CAN ISO-TP responses with frame-number prefixes ("0: 43 06 ...")
 *  - 00 00 padding bytes (ignored)
 *  - Error strings ("NO DATA", "BUS ERROR", etc.) → returns []
 */
export function parseDtcFrame(frame: string, isPending: boolean): Dtc[] {
  const cleaned = frame.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || ELM_NO_DATA_RE.test(cleaned)) return [];

  // Strip CAN multi-frame line-number prefixes ("0: ", "1: ", …).
  const stripped = cleaned.replace(/\b[0-9A-Fa-f]:\s*/g, ' ');

  // Collect valid 2-char hex tokens; ignore anything else.
  const tokens = stripped.split(/\s+/).flatMap((tok) => {
    if (/^[0-9A-Fa-f]{2}$/.test(tok)) return [tok];
    // Handle compact format: split a long hex string into 2-char pairs.
    if (/^[0-9A-Fa-f]+$/.test(tok) && tok.length % 2 === 0) {
      const pairs: string[] = [];
      for (let i = 0; i < tok.length; i += 2) pairs.push(tok.slice(i, i + 2));
      return pairs;
    }
    return [];
  });

  if (tokens.length === 0) return [];
  const bytes = tokens.map((t) => parseInt(t, 16));

  const expectedEcho = isPending ? 0x47 : 0x43;
  if (bytes[0] !== expectedEcho) return [];

  const dtcBytes = bytes.slice(1);
  const dtcs: Dtc[] = [];

  for (let i = 0; i + 1 < dtcBytes.length; i += 2) {
    const a = dtcBytes[i]!;
    const b = dtcBytes[i + 1]!;
    if (a === 0 && b === 0) continue;
    const dtc = dtcFromBytes(a, b);
    dtcs.push({ ...dtc, isPending, isPermanent: false });
  }

  return dtcs;
}

/**
 * Parse a raw ELM327 response frame for mode 0x0A (permanent DTCs) into an
 * array of Dtc objects. Permanent DTCs use echo byte 0x4A and are marked with
 * `isPermanent: true`. The ECU only clears these after self-verifying the fix
 * through a drive cycle — they cannot be cleared with mode 0x04.
 */
export function parsePermaDtcFrame(frame: string): Dtc[] {
  const cleaned = frame.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || ELM_NO_DATA_RE.test(cleaned)) return [];

  const stripped = cleaned.replace(/\b[0-9A-Fa-f]:\s*/g, ' ');

  const tokens = stripped.split(/\s+/).flatMap((tok) => {
    if (/^[0-9A-Fa-f]{2}$/.test(tok)) return [tok];
    if (/^[0-9A-Fa-f]+$/.test(tok) && tok.length % 2 === 0) {
      const pairs: string[] = [];
      for (let i = 0; i < tok.length; i += 2) pairs.push(tok.slice(i, i + 2));
      return pairs;
    }
    return [];
  });

  if (tokens.length === 0) return [];
  const bytes = tokens.map((t) => parseInt(t, 16));

  if (bytes[0] !== 0x4a) return [];

  const dtcBytes = bytes.slice(1);
  const dtcs: Dtc[] = [];

  for (let i = 0; i + 1 < dtcBytes.length; i += 2) {
    const a = dtcBytes[i]!;
    const b = dtcBytes[i + 1]!;
    if (a === 0 && b === 0) continue;
    const dtc = dtcFromBytes(a, b);
    dtcs.push({ ...dtc, isPending: false, isPermanent: true });
  }

  return dtcs;
}

/**
 * Parse a raw ELM327 response for mode 0x09 PID 0x02 (VIN request).
 *
 * Expected format: `49 02 01 <17 ASCII VIN bytes>`
 * Handles space-separated, compact, and multi-line CAN ISO-TP responses.
 * Returns the 17-character VIN string, or null on malformed/no-data responses.
 */
export function parseVinFrame(frame: string): string | null {
  const cleaned = frame.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || ELM_NO_DATA_RE.test(cleaned)) return null;

  const stripped = cleaned.replace(/\b[0-9A-Fa-f]:\s*/g, ' ');

  const tokens = stripped.split(/\s+/).flatMap((tok) => {
    if (/^[0-9A-Fa-f]{2}$/.test(tok)) return [tok];
    if (/^[0-9A-Fa-f]+$/.test(tok) && tok.length % 2 === 0) {
      const pairs: string[] = [];
      for (let i = 0; i < tok.length; i += 2) pairs.push(tok.slice(i, i + 2));
      return pairs;
    }
    return [];
  });

  if (tokens.length === 0) return null;
  const bytes = tokens.map((t) => parseInt(t, 16));

  // Expect mode echo 0x49, PID echo 0x02
  if (bytes[0] !== 0x49 || bytes[1] !== 0x02) return null;

  // bytes[2] is the message count byte — skip it, then read ASCII VIN chars
  const vinBytes = bytes.slice(3).filter((b) => b >= 0x20 && b <= 0x7e);
  const vin = String.fromCharCode(...vinBytes).trim();

  return vin.length > 0 ? vin : null;
}
