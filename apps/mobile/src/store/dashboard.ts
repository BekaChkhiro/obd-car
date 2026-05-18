import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';

export interface GaugeReading {
  value: number | null;
  unit: string;
  updatedAt: number | null;
}

interface DashboardState {
  rpm: GaugeReading;
  speed: GaugeReading;
  coolantTemp: GaugeReading;
  fuelLevel: GaugeReading;
  batteryVoltage: GaugeReading;

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

  setRpm: (value, unit) => {
    set({ rpm: { value, unit, updatedAt: Date.now() } });
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setSpeed: (value, unit) => {
    set({ speed: { value, unit, updatedAt: Date.now() } });
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setCoolantTemp: (value, unit) => {
    set({ coolantTemp: { value, unit, updatedAt: Date.now() } });
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setFuelLevel: (value, unit) => {
    set({ fuelLevel: { value, unit, updatedAt: Date.now() } });
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  setBatteryVoltage: (value, unit) => {
    set({ batteryVoltage: { value, unit, updatedAt: Date.now() } });
    const { rpm, speed, coolantTemp, fuelLevel, batteryVoltage } = get();
    persistSnapshot({ rpm, speed, coolantTemp, fuelLevel, batteryVoltage });
  },
  // reset clears live display but intentionally does NOT erase the persisted
  // snapshot — so next app open can hydrate instantly from last session.
  reset: () =>
    set({
      rpm: empty,
      speed: empty,
      coolantTemp: empty,
      fuelLevel: empty,
      batteryVoltage: empty,
    }),
}));
