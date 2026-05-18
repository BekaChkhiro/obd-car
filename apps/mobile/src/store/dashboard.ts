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

const empty: GaugeReading = { value: null, unit: '', updatedAt: null };

export const useDashboardStore = create<DashboardState>((set) => ({
  rpm: empty,
  speed: empty,
  coolantTemp: empty,
  fuelLevel: empty,
  batteryVoltage: empty,

  setRpm: (value, unit) => set({ rpm: { value, unit, updatedAt: Date.now() } }),
  setSpeed: (value, unit) => set({ speed: { value, unit, updatedAt: Date.now() } }),
  setCoolantTemp: (value, unit) => set({ coolantTemp: { value, unit, updatedAt: Date.now() } }),
  setFuelLevel: (value, unit) => set({ fuelLevel: { value, unit, updatedAt: Date.now() } }),
  setBatteryVoltage: (value, unit) =>
    set({ batteryVoltage: { value, unit, updatedAt: Date.now() } }),
  reset: () =>
    set({
      rpm: empty,
      speed: empty,
      coolantTemp: empty,
      fuelLevel: empty,
      batteryVoltage: empty,
    }),
}));
