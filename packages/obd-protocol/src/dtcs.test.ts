import { describe, it, expect } from 'vitest';
import {
  dtcFromBytes,
  parseDtcCode,
  parseDtcFrame,
  parsePermaDtcFrame,
  parseVinFrame,
} from './dtcs.js';

// ── dtcFromBytes ──────────────────────────────────────────────────────────────

describe('dtcFromBytes', () => {
  it('decodes a P0300 code', () => {
    // P0300: category P (00), subcategory 0 (00), number 0x300 = 768
    // byteA = 0x03, byteB = 0x00
    const dtc = dtcFromBytes(0x03, 0x00);
    expect(dtc.category).toBe('P');
    expect(dtc.code).toBe('P0300');
  });

  it('decodes a B-category code', () => {
    // B category starts at bit pattern 10 in upper 2 bits → 0x80
    const dtc = dtcFromBytes(0x80, 0x01);
    expect(dtc.category).toBe('B');
  });

  it('decodes a C-category code', () => {
    // C category = bit pattern 01 → 0x40
    const dtc = dtcFromBytes(0x40, 0x05);
    expect(dtc.category).toBe('C');
  });

  it('decodes a U-category code', () => {
    // U category = bit pattern 11 → 0xC0
    const dtc = dtcFromBytes(0xc0, 0x01);
    expect(dtc.category).toBe('U');
  });

  it('sets isPending and isPermanent to false', () => {
    const dtc = dtcFromBytes(0x03, 0x00);
    expect(dtc.isPending).toBe(false);
    expect(dtc.isPermanent).toBe(false);
  });
});

// ── parseDtcCode ──────────────────────────────────────────────────────────────

describe('parseDtcCode', () => {
  it('parses a valid P-code', () => {
    const dtc = parseDtcCode('P0420');
    expect(dtc).not.toBeNull();
    expect(dtc?.code).toBe('P0420');
    expect(dtc?.category).toBe('P');
    expect(dtc?.number).toBe(420);
  });

  it('parses a valid B-code', () => {
    const dtc = parseDtcCode('B1234');
    expect(dtc?.category).toBe('B');
    expect(dtc?.code).toBe('B1234');
  });

  it('returns null for invalid format', () => {
    expect(parseDtcCode('INVALID')).toBeNull();
    expect(parseDtcCode('')).toBeNull();
    expect(parseDtcCode('P042')).toBeNull();
    expect(parseDtcCode('X0420')).toBeNull();
  });

  it('is case-insensitive', () => {
    const dtc = parseDtcCode('p0420');
    expect(dtc?.code).toBe('P0420');
  });
});

// ── parseDtcFrame ─────────────────────────────────────────────────────────────

describe('parseDtcFrame', () => {
  it('returns empty array for NO DATA', () => {
    expect(parseDtcFrame('NO DATA', false)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseDtcFrame('', false)).toEqual([]);
  });

  it('returns empty array for error responses', () => {
    expect(parseDtcFrame('BUS ERROR', false)).toEqual([]);
    expect(parseDtcFrame('UNABLE TO CONNECT', false)).toEqual([]);
  });

  it('returns empty array when no DTCs present (43 00)', () => {
    expect(parseDtcFrame('43 00', false)).toEqual([]);
  });

  it('parses a single stored DTC', () => {
    // P0300: echo 43, then 03 00
    const dtcs = parseDtcFrame('43 03 00', false);
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]?.code).toBe('P0300');
    expect(dtcs[0]?.isPending).toBe(false);
  });

  it('parses multiple stored DTCs', () => {
    // P0300 (03 00) and P0420 (04 20)
    const dtcs = parseDtcFrame('43 03 00 04 20', false);
    expect(dtcs).toHaveLength(2);
    expect(dtcs[0]?.code).toBe('P0300');
    expect(dtcs[1]?.code).toBe('P0420');
  });

  it('marks pending DTCs with isPending=true', () => {
    // Mode 07: echo byte 47
    const dtcs = parseDtcFrame('47 03 00', true);
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]?.isPending).toBe(true);
  });

  it('skips 00 00 padding bytes', () => {
    const dtcs = parseDtcFrame('43 03 00 00 00', false);
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]?.code).toBe('P0300');
  });

  it('handles compact no-space format', () => {
    const dtcs = parseDtcFrame('430300', false);
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]?.code).toBe('P0300');
  });

  it('strips CAN multi-frame prefixes', () => {
    const dtcs = parseDtcFrame('0: 43 03 00', false);
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]?.code).toBe('P0300');
  });

  it('returns empty if echo byte does not match mode', () => {
    // Wrong echo for stored DTCs (should be 43, not 47)
    expect(parseDtcFrame('47 03 00', false)).toEqual([]);
  });
});

// ── parsePermaDtcFrame ────────────────────────────────────────────────────────

describe('parsePermaDtcFrame', () => {
  it('returns empty for NO DATA', () => {
    expect(parsePermaDtcFrame('NO DATA')).toEqual([]);
  });

  it('returns empty for 4A 00 (no permanent DTCs)', () => {
    expect(parsePermaDtcFrame('4A 00')).toEqual([]);
  });

  it('parses a permanent DTC', () => {
    const dtcs = parsePermaDtcFrame('4A 03 00');
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]?.code).toBe('P0300');
    expect(dtcs[0]?.isPermanent).toBe(true);
    expect(dtcs[0]?.isPending).toBe(false);
  });

  it('returns empty if echo byte is wrong', () => {
    expect(parsePermaDtcFrame('43 03 00')).toEqual([]);
  });
});

// ── parseVinFrame ─────────────────────────────────────────────────────────────

describe('parseVinFrame', () => {
  it('returns null for NO DATA', () => {
    expect(parseVinFrame('NO DATA')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseVinFrame('')).toBeNull();
  });

  it('parses a valid VIN response', () => {
    // Demo VIN: "1GNEK13Z04R101234"
    const frame = '49 02 01 31 47 4E 45 4B 31 33 5A 30 34 52 31 30 31 32 33 34';
    const vin = parseVinFrame(frame);
    expect(vin).toBe('1GNEK13Z04R101234');
  });

  it('returns null when mode echo is wrong', () => {
    expect(parseVinFrame('41 02 01 31 32 33')).toBeNull();
  });

  it('returns null when pid echo is wrong', () => {
    expect(parseVinFrame('49 03 01 31 32 33')).toBeNull();
  });

  it('handles CAN multi-frame format', () => {
    const frame = '0: 49 02 01 31 47 4E 45 4B 31 33 5A 30 34 52 31 30 31 32 33 34';
    const vin = parseVinFrame(frame);
    expect(vin).toBe('1GNEK13Z04R101234');
  });
});
