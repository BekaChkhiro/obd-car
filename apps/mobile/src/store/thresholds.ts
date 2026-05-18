import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';

export interface ThresholdConfig {
  /** Engine coolant temperature max (°C). Alert when value exceeds this. */
  coolantTempMax: number;
  /** Battery voltage min (V). Alert when value drops below this. */
  batteryVoltageMin: number;
  /** Fuel tank level min (%). Alert when value drops below this. */
  fuelLevelMin: number;
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  coolantTempMax: 105,
  batteryVoltageMin: 11.5,
  fuelLevelMin: 15,
};

const storage = createMMKV({ id: 'thresholds' });

function loadThresholds(vehicleId: string): ThresholdConfig {
  const raw = storage.getString(`thresholds.${vehicleId}`);
  if (!raw) return { ...DEFAULT_THRESHOLDS };
  try {
    return { ...DEFAULT_THRESHOLDS, ...(JSON.parse(raw) as Partial<ThresholdConfig>) };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

function persistThresholds(vehicleId: string, config: ThresholdConfig): void {
  storage.set(`thresholds.${vehicleId}`, JSON.stringify(config));
}

interface ThresholdsState {
  activeVehicleId: string;
  thresholds: ThresholdConfig;
  setVehicle: (vehicleId: string) => void;
  updateThreshold: <K extends keyof ThresholdConfig>(key: K, value: ThresholdConfig[K]) => void;
  resetToDefaults: () => void;
}

export const useThresholdsStore = create<ThresholdsState>((set, get) => ({
  activeVehicleId: 'default',
  thresholds: loadThresholds('default'),

  setVehicle: (vehicleId) => {
    set({ activeVehicleId: vehicleId, thresholds: loadThresholds(vehicleId) });
  },

  updateThreshold: (key, value) => {
    const { activeVehicleId, thresholds } = get();
    const updated = { ...thresholds, [key]: value };
    persistThresholds(activeVehicleId, updated);
    set({ thresholds: updated });
  },

  resetToDefaults: () => {
    const { activeVehicleId } = get();
    persistThresholds(activeVehicleId, DEFAULT_THRESHOLDS);
    set({ thresholds: { ...DEFAULT_THRESHOLDS } });
  },
}));
