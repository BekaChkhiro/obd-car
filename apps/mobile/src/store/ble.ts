import { create } from 'zustand';
import type { Device } from 'react-native-ble-plx';

export type ConnectionPhase =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'ready'
  | 'reading'
  | 'error';

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

interface BleState {
  connectionPhase: ConnectionPhase;
  connectionError: string | null;
  retryCount: number;
  permissionGranted: boolean;
  devices: ScannedDevice[];
  connectedDeviceId: string | null;

  /** Convenience alias — true when connectionPhase === 'scanning'. */
  isScanning: boolean;

  setConnectionPhase: (phase: ConnectionPhase) => void;
  setConnectionError: (error: string | null) => void;
  setRetryCount: (count: number) => void;
  setPermissionGranted: (granted: boolean) => void;
  upsertDevice: (device: Device) => void;
  clearDevices: () => void;
  setConnectedDeviceId: (id: string | null) => void;
  /** @deprecated Use setConnectionPhase('scanning' | 'disconnected') via ConnectionMachine. */
  setScanning: (scanning: boolean) => void;
}

export const useBleStore = create<BleState>((set) => ({
  connectionPhase: 'disconnected',
  connectionError: null,
  retryCount: 0,
  permissionGranted: false,
  devices: [],
  connectedDeviceId: null,
  isScanning: false,

  setConnectionPhase: (phase) =>
    set({ connectionPhase: phase, isScanning: phase === 'scanning' }),

  setConnectionError: (error) => set({ connectionError: error }),

  setRetryCount: (count) => set({ retryCount: count }),

  setPermissionGranted: (granted) => set({ permissionGranted: granted }),

  upsertDevice: (device) =>
    set((state) => {
      const entry: ScannedDevice = { id: device.id, name: device.name, rssi: device.rssi };
      const idx = state.devices.findIndex((d) => d.id === device.id);
      if (idx >= 0) {
        const updated = [...state.devices];
        updated[idx] = entry;
        return { devices: updated };
      }
      return { devices: [...state.devices, entry] };
    }),

  clearDevices: () => set({ devices: [] }),

  setConnectedDeviceId: (id) => set({ connectedDeviceId: id }),

  setScanning: (scanning) =>
    set((state) => ({
      isScanning: scanning,
      connectionPhase: scanning ? 'scanning' : state.connectionPhase === 'scanning' ? 'disconnected' : state.connectionPhase,
    })),
}));
