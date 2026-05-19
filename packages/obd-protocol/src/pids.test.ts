import { describe, it, expect } from 'vitest';
import { decodePid, PID_BY_ID, PIDS } from './pids.js';

// ── PID_BY_ID lookup ──────────────────────────────────────────────────────────

describe('PID_BY_ID', () => {
  it('contains entry for RPM (010C)', () => {
    const def = PID_BY_ID['010C'];
    expect(def).toBeDefined();
    expect(def?.mode).toBe(0x01);
    expect(def?.pid).toBe(0x0c);
  });

  it('contains entry for SPEED (010D)', () => {
    expect(PID_BY_ID['010D']).toBeDefined();
  });

  it('returns undefined for unknown PID', () => {
    expect(PID_BY_ID['FFFF']).toBeUndefined();
  });
});

// ── decodePid ─────────────────────────────────────────────────────────────────

describe('decodePid', () => {
  it('decodes RPM correctly', () => {
    // RPM = (A*256 + B) / 4
    // 800 rpm → 3200 raw → A=0x0C, B=0x80
    const result = decodePid('010C', [0x0c, 0x80]);
    expect(result).not.toBeNull();
    expect(result?.value).toBe(800);
    expect(result?.unit).toBe('rpm');
    expect(result?.name).toBe('Engine RPM');
  });

  it('decodes RPM of 0', () => {
    const result = decodePid('010C', [0x00, 0x00]);
    expect(result?.value).toBe(0);
  });

  it('decodes vehicle speed', () => {
    // Speed in km/h: single byte, value = byte
    const result = decodePid('010D', [60]);
    expect(result?.value).toBe(60);
    expect(result?.unit).toBe('km/h');
  });

  it('decodes coolant temperature', () => {
    // Coolant: value = byte - 40
    // 88°C → byte = 128 (88+40)
    const result = decodePid('0105', [128]);
    expect(result?.value).toBe(88);
    expect(result?.unit).toBe('°C');
  });

  it('decodes coolant minimum (-40°C)', () => {
    const result = decodePid('0105', [0]);
    expect(result?.value).toBe(-40);
  });

  it('decodes fuel level', () => {
    // Fuel: (byte * 100) / 255
    // 75% → byte ≈ 191.25 → 191
    const result = decodePid('012F', [191]);
    expect(result?.value).toBeCloseTo(74.9, 0);
    expect(result?.unit).toBe('%');
  });

  it('decodes battery voltage', () => {
    // Battery: (A*256 + B) / 1000 volts
    // 13.8V → 13800 raw → A=0x35, B=0xE8
    const result = decodePid('0142', [0x35, 0xe8]);
    expect(result?.value).toBeCloseTo(13.8, 1);
    expect(result?.unit).toBe('V');
  });

  it('returns null for unknown PID', () => {
    expect(decodePid('FFFF', [0x00])).toBeNull();
  });

  it('is case-insensitive for PID string', () => {
    const lower = decodePid('010c', [0x0c, 0x80]);
    const upper = decodePid('010C', [0x0c, 0x80]);
    expect(lower?.value).toBe(upper?.value);
  });

  it('preserves raw bytes on result', () => {
    const bytes = [0x0c, 0x80];
    const result = decodePid('010C', bytes);
    expect(Array.from(result?.raw ?? [])).toEqual(bytes);
  });

  it('exposes mode and pid on result', () => {
    const result = decodePid('010C', [0x00, 0x00]);
    expect(result?.mode).toBe(0x01);
    expect(result?.pid).toBe(0x0c);
  });
});

// ── PIDS constant ─────────────────────────────────────────────────────────────

describe('PIDS', () => {
  it('has the expected PID keys', () => {
    expect(PIDS).toHaveProperty('RPM');
    expect(PIDS).toHaveProperty('SPEED');
    expect(PIDS).toHaveProperty('COOLANT_TEMP');
    expect(PIDS).toHaveProperty('FUEL_LEVEL');
    expect(PIDS).toHaveProperty('BATTERY_VOLTAGE');
  });

  it('RPM byteCount is 2', () => {
    expect(PIDS.RPM.byteCount).toBe(2);
  });

  it('SPEED byteCount is 1', () => {
    expect(PIDS.SPEED.byteCount).toBe(1);
  });
});
