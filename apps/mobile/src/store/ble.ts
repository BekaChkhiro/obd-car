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

/**
 * Where the currently-connected adapter came from.
 *
 * `simulated` means a mock ELM327 (E2E/demo builds). It is tracked separately
 * from `real` so nothing downstream — least of all the AI assistant — can
 * present generated numbers as measurements from the user's actual car.
 */
export type AdapterKind = 'real' | 'simulated';

interface BleState {
  connectionPhase: ConnectionPhase;
  connectionError: string | null;
  retryCount: number;
  permissionGranted: boolean;
  devices: ScannedDevice[];
  connectedDeviceId: string | null;
  /** Mode-01 PIDs the ECU reported as supported, e.g. ['010C','010D']. */
  supportedPids: string[];
  /** Null when nothing is connected. */
  adapterKind: AdapterKind | null;
  /**
   * VIN read from the ECU on connect, or null when unread/unavailable.
   *
   * It is what identifies the car rather than the dongle: the make decoded
   * from it decides what a manufacturer-specific DTC means, and it keys the
   * protocol cache to the vehicle instead of to the adapter.
   */
  vin: string | null;
  /**
   * Stored trouble codes counted on the last read, or null when nothing has
   * been read yet. Null and 0 are different answers — "unknown" must not be
   * shown as "no faults".
   */
  dtcCount: number | null;

  /** Convenience alias — true when connectionPhase === 'scanning'. */
  isScanning: boolean;

  /**
   * Manual OBD protocol override (0-9, where 0 = auto-detect).
   * null means use the automatic probe sequence.
   * Set by the user in settings for stubborn ECUs (ISO 9141, some Korean/Asian vehicles).
   */
  protocolOverride: number | null;

  setConnectionPhase: (phase: ConnectionPhase) => void;
  setConnectionError: (error: string | null) => void;
  setRetryCount: (count: number) => void;
  setPermissionGranted: (granted: boolean) => void;
  upsertDevice: (device: Device) => void;
  clearDevices: () => void;
  setConnectedDeviceId: (id: string | null) => void;
  setSupportedPids: (pids: string[]) => void;
  setAdapterKind: (kind: AdapterKind | null) => void;
  setVin: (vin: string | null) => void;
  setDtcCount: (count: number | null) => void;
  /** @deprecated Use setConnectionPhase('scanning' | 'disconnected') via ConnectionMachine. */
  setScanning: (scanning: boolean) => void;
  setProtocolOverride: (override: number | null) => void;
}

export const useBleStore = create<BleState>((set) => ({
  connectionPhase: 'disconnected',
  connectionError: null,
  retryCount: 0,
  permissionGranted: false,
  devices: [],
  connectedDeviceId: null,
  supportedPids: [],
  adapterKind: null,
  vin: null,
  dtcCount: null,
  isScanning: false,
  protocolOverride: null,

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

  setSupportedPids: (pids) => set({ supportedPids: pids }),

  setAdapterKind: (kind) => set({ adapterKind: kind }),

  setVin: (vin) => set({ vin }),

  setDtcCount: (dtcCount) => set({ dtcCount }),

  setScanning: (scanning) =>
    set((state) => ({
      isScanning: scanning,
      connectionPhase: scanning ? 'scanning' : state.connectionPhase === 'scanning' ? 'disconnected' : state.connectionPhase,
    })),

  setProtocolOverride: (override) => set({ protocolOverride: override }),
}));
