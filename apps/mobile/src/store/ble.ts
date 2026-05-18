import { create } from 'zustand';
import type { Device } from 'react-native-ble-plx';

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

interface BleState {
  isScanning: boolean;
  permissionGranted: boolean;
  devices: ScannedDevice[];
  connectedDeviceId: string | null;

  setScanning: (scanning: boolean) => void;
  setPermissionGranted: (granted: boolean) => void;
  upsertDevice: (device: Device) => void;
  clearDevices: () => void;
  setConnectedDeviceId: (id: string | null) => void;
}

export const useBleStore = create<BleState>((set) => ({
  isScanning: false,
  permissionGranted: false,
  devices: [],
  connectedDeviceId: null,

  setScanning: (scanning) => set({ isScanning: scanning }),
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
}));
