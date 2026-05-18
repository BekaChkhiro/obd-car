import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';

export interface GaugeReading {
  value: number | null;
  unit: string;
  updatedAt: number | null;
}

export interface TimePoint {
  value: number;
  ts: number;
}

const FIVE_MIN_MS = 5 * 60 * 1000;
const MAX_HISTORY_POINTS = 300;

function trimHistory(history: TimePoint[], next: TimePoint): TimePoint[] {
  const cutoff = Date.now() - FIVE_MIN_MS;
  const appended = [...history, next];
  const trimmed = appended.filter((p) => p.ts >= cutoff);
  return trimmed.length > MAX_HISTORY_POINTS
    ? trimmed.slice(trimmed.length - MAX_HISTORY_POINTS)
    : trimmed;
}

interface DashboardState {
  rpm: GaugeReading;
  speed: GaugeReading;
  coolantTemp: GaugeReading;
  fuelLevel: GaugeReading;
  batteryVoltage: GaugeReading;

  rpmHistory: TimePoint[];
  speedHistory: TimePoint[];
  coolantTempHistory: TimePoint[];
  fuelLevelHistory: TimePoint[];
  batteryVoltageHistory: TimePoint[];

  setRpm(value: number, unit: string): void;
  setSpeed(value: number, unit: string): void;
  setCoolantTemp(value: number, unit: string): void;
  setFuelLevel(value: number, unit: string): void;
  setBatteryVoltage(value: number, unit: string): void;
  reset(): void;
}

type DashboardSnapshot = Pick<
  DashboardState,
  'rpm' | 'speed' | 'coolantTemp' | 'fuelLevel' | 'batteryVoltage'
>;

const empty: GaugeReading = { value: null, unit: '', updatedAt: null };

const SNAPSHOT_KEY = 'dashboard.snapshot';
const storage = createMMKV({ id: 'dashboard' });

function loadSnapshot(): DashboardSnapshot {
  const raw = storage.getString(SNAPSHOT_KEY);
  if (!raw) return { rpm: empty, speed: empty, coolantTemp: empty, fuelLevel: empty, batteryVoltage: empty };
  try {
    const parsed = JSON.parse(raw) as Partial<DashboardSnapshot>;
    return {
      rpm: parsed.rpm ?? empty,
      speed: parsed.speed ?? empty,
      coolantTemp: parsed.coolantTemp ?? empty,
      fuelLevel: parsed.fuelLevel ?? empty,
      batteryVoltage: parsed.batteryVoltage ?? empty,
    };
  } catch {
    return { rpm: empty, speed: empty, coolantTemp: empty, fuelLevel: empty, batteryVoltage: empty };
  }
}

function persistSnapshot(snapshot: DashboardSnapshot): void {
  storage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  ...loadSnapshot(),

  rpmHistory: [],
  speedHistory: [],
  coolantTempHistory: [],
  fuelLevelHistory: [],
  batteryVoltageHistory: [],

  setRpm: (value, unit) => {
    set((s) => ({
      rpm: { value, unit, updatedAt: Date.now() },
      rpmHistory: trimHistory(s.rpmHistory, { value, ts: Date.now() }),
    }));
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setSpeed: (value, unit) => {
    set((s) => ({
      speed: { value, unit, updatedAt: Date.now() },
      speedHistory: trimHistory(s.speedHistory, { value, ts: Date.now() }),
    }));
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setCoolantTemp: (value, unit) => {
    set((s) => ({
      coolantTemp: { value, unit, updatedAt: Date.now() },
      coolantTempHistory: trimHistory(s.coolantTempHistory, { value, ts: Date.now() }),
    }));
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setFuelLevel: (value, unit) => {
    set((s) => ({
      fuelLevel: { value, unit, updatedAt: Date.now() },
      fuelLevelHistory: trimHistory(s.fuelLevelHistory, { value, ts: Date.now() }),
    }));
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setBatteryVoltage: (value, unit) => {
    set((s) => ({
      batteryVoltage: { value, unit, updatedAt: Date.now() },
      batteryVoltageHistory: trimHistory(s.batteryVoltageHistory, { value, ts: Date.now() }),
    }));
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  // reset clears live display and history but intentionally does NOT erase the
  // persisted snapshot — so next app open can hydrate instantly from last session.
  reset: () =>
    set({
      rpm: empty,
      speed: empty,
      coolantTemp: empty,
      fuelLevel: empty,
      batteryVoltage: empty,
      rpmHistory: [],
      speedHistory: [],
      coolantTempHistory: [],
      fuelLevelHistory: [],
      batteryVoltageHistory: [],
    }),
}));
