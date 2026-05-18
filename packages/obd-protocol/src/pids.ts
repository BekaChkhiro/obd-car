export type PidMode = 0x01 | 0x02;

export interface PidDefinition {
  mode: PidMode;
  pid: number;
  name: string;
  unit: string;
  min: number;
  max: number;
  byteCount: number;
  decode: (bytes: readonly number[]) => number;
}

export interface PidValue {
  mode: PidMode;
  pid: number;
  name: string;
  value: number;
  unit: string;
  raw: readonly number[];
}

export const PIDS = {
  RPM: {
    mode: 0x01 as PidMode,
    pid: 0x0c,
    name: 'Engine RPM',
    unit: 'rpm',
    min: 0,
    max: 16383.75,
    byteCount: 2,
    decode: (bytes: readonly number[]) => {
      const a = bytes[0] ?? 0;
      const b = bytes[1] ?? 0;
      return (a * 256 + b) / 4;
    },
  },
  SPEED: {
    mode: 0x01 as PidMode,
    pid: 0x0d,
    name: 'Vehicle Speed',
    unit: 'km/h',
    min: 0,
    max: 255,
    byteCount: 1,
    decode: (bytes: readonly number[]) => bytes[0] ?? 0,
  },
  COOLANT_TEMP: {
    mode: 0x01 as PidMode,
    pid: 0x05,
    name: 'Engine Coolant Temperature',
    unit: '°C',
    min: -40,
    max: 215,
    byteCount: 1,
    decode: (bytes: readonly number[]) => (bytes[0] ?? 0) - 40,
  },
  FUEL_LEVEL: {
    mode: 0x01 as PidMode,
    pid: 0x2f,
    name: 'Fuel Tank Level',
    unit: '%',
    min: 0,
    max: 100,
    byteCount: 1,
    decode: (bytes: readonly number[]) => ((bytes[0] ?? 0) * 100) / 255,
  },
  BATTERY_VOLTAGE: {
    mode: 0x01 as PidMode,
    pid: 0x42,
    name: 'Control Module Voltage',
    unit: 'V',
    min: 0,
    max: 65.535,
    byteCount: 2,
    decode: (bytes: readonly number[]) => {
      const a = bytes[0] ?? 0;
      const b = bytes[1] ?? 0;
      return (a * 256 + b) / 1000;
    },
  },
} satisfies Record<string, PidDefinition>;

export type PidKey = keyof typeof PIDS;

// Lookup by "MMPP" hex string (e.g. "010C" for mode 01, PID 0C)
export const PID_BY_ID: Record<string, PidDefinition> = Object.fromEntries(
  Object.values(PIDS).map((def) => [
    `${def.mode.toString(16).padStart(2, '0')}${def.pid.toString(16).padStart(2, '0')}`.toUpperCase(),
    def,
  ]),
);

export function decodePid(
  modeAndPid: string,
  rawBytes: readonly number[],
): PidValue | null {
  const def = PID_BY_ID[modeAndPid.toUpperCase()];
  if (!def) return null;
  return {
    mode: def.mode,
    pid: def.pid,
    name: def.name,
    value: def.decode(rawBytes),
    unit: def.unit,
    raw: rawBytes,
  };
}
