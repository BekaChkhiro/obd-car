import { useBleStore } from '../store/ble';
import { bleManager } from './manager';
import { ConnectionMachine, type BleStoreInterface } from './connection-machine';

/**
 * Thin adapter from the Zustand store shape to the BleStoreInterface that
 * ConnectionMachine needs. Evaluated lazily at call time so the store is
 * always current (store actions are stable references, but we want the latest
 * state snapshot for upsertDevice / clearDevices).
 */
const storeAdapter: BleStoreInterface = {
  setConnectionPhase: (phase) => useBleStore.getState().setConnectionPhase(phase),
  setConnectionError: (error) => useBleStore.getState().setConnectionError(error),
  setRetryCount: (count) => useBleStore.getState().setRetryCount(count),
  setConnectedDeviceId: (id) => useBleStore.getState().setConnectedDeviceId(id),
  setScanning: (scanning) => useBleStore.getState().setScanning(scanning),
  upsertDevice: (device) => useBleStore.getState().upsertDevice(device),
  clearDevices: () => useBleStore.getState().clearDevices(),
  setSupportedPids: (pids) => useBleStore.getState().setSupportedPids(pids),
  setAdapterKind: (kind) => useBleStore.getState().setAdapterKind(kind),
  setVin: (vin) => useBleStore.getState().setVin(vin),
  setDtcCount: (count) => useBleStore.getState().setDtcCount(count),
  getProtocolOverride: () => useBleStore.getState().protocolOverride,
};

/**
 * App-wide singleton ConnectionMachine.
 *
 * Import this wherever you need to drive the connection lifecycle:
 *   import { connectionMachine } from '@/src/ble/connection';
 *
 * Read state reactively from the Zustand store:
 *   const { connectionPhase, connectionError, retryCount } = useBleStore();
 */
export const connectionMachine = new ConnectionMachine(storeAdapter, bleManager);

export type { ConnectionPhase } from '../store/ble';
export type { BleStoreInterface } from './connection-machine';
