import { create } from 'zustand';

export interface GaugeReading {
  value: number | null;
  unit: string;
  updatedAt: number | null;
}

export interface TimeSeriesSample {
  value: number;
  ts: number;
}

const BUFFER_WINDOW_MS = 5 * 60 * 1000;

function pushSample(
  buf: TimeSeriesSample[],
  value: number,
): TimeSeriesSample[] {
  const now = Date.now();
  const cutoff = now - BUFFER_WINDOW_MS;
  const trimmed = buf.filter((s) => s.ts >= cutoff);
  trimmed.push({ value, ts: now });
  return trimmed;
}

interface DashboardState {
  rpm: GaugeReading;
  speed: GaugeReading;
  coolantTemp: GaugeReading;
  fuelLevel: GaugeReading;
  batteryVoltage: GaugeReading;

  rpmSeries: TimeSeriesSample[];
  speedSeries: TimeSeriesSample[];
  coolantTempSeries: TimeSeriesSample[];
  fuelLevelSeries: TimeSeriesSample[];
  batteryVoltageSeries: TimeSeriesSample[];

  setRpm(value: number, unit: string): void;
  setSpeed(value: number, unit: string): void;
  setCoolantTemp(value: number, unit: string): void;
  setFuelLevel(value: number, unit: string): void;
  setBatteryVoltage(value: number, unit: string): void;
  reset(): void;
}

const empty: GaugeReading = { value: null, unit: '', updatedAt: null };

export const useDashboardStore = create<DashboardState>((set) => ({
  rpm: empty,
  speed: empty,
  coolantTemp: empty,
  fuelLevel: empty,
  batteryVoltage: empty,

  rpmSeries: [],
  speedSeries: [],
  coolantTempSeries: [],
  fuelLevelSeries: [],
  batteryVoltageSeries: [],

  setRpm: (value, unit) =>
    set((s) => ({
      rpm: { value, unit, updatedAt: Date.now() },
      rpmSeries: pushSample(s.rpmSeries, value),
    })),
  setSpeed: (value, unit) =>
    set((s) => ({
      speed: { value, unit, updatedAt: Date.now() },
      speedSeries: pushSample(s.speedSeries, value),
    })),
  setCoolantTemp: (value, unit) =>
    set((s) => ({
      coolantTemp: { value, unit, updatedAt: Date.now() },
      coolantTempSeries: pushSample(s.coolantTempSeries, value),
    })),
  setFuelLevel: (value, unit) =>
    set((s) => ({
      fuelLevel: { value, unit, updatedAt: Date.now() },
      fuelLevelSeries: pushSample(s.fuelLevelSeries, value),
    })),
  setBatteryVoltage: (value, unit) =>
    set((s) => ({
      batteryVoltage: { value, unit, updatedAt: Date.now() },
      batteryVoltageSeries: pushSample(s.batteryVoltageSeries, value),
    })),
  reset: () =>
    set({
      rpm: empty,
      speed: empty,
      coolantTemp: empty,
      fuelLevel: empty,
      batteryVoltage: empty,
      rpmSeries: [],
      speedSeries: [],
      coolantTempSeries: [],
      fuelLevelSeries: [],
      batteryVoltageSeries: [],
    }),
}));
