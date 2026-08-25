// The BLE library ships untranspiled ESM and the machine imports it for one
// enum. Neither it nor the client factory is exercised here — this suite drives
// an injected adapter, which is the transport that has no disconnect signal.
jest.mock('react-native-ble-plx', () => ({ ConnectionPriority: { High: 1 } }));
jest.mock('../manager', () => ({
  createElm327Client: jest.fn(),
  discoverSupportedPids: jest.fn(() => Promise.reject(new Error('not probed'))),
}));

import { ConnectionMachine, type BleStoreInterface } from '../connection-machine';
import type { ConnectedAdapter } from '../manager';
import type { BleManager } from 'react-native-ble-plx';

function fakeStore() {
  const state = {
    phase: 'disconnected' as string,
    connectedDeviceId: null as string | null,
    adapterKind: null as string | null,
    error: null as string | null,
  };
  const store: BleStoreInterface = {
    setConnectionPhase: (p) => { state.phase = p; },
    setConnectionError: (e) => { state.error = e; },
    setRetryCount: () => undefined,
    setConnectedDeviceId: (id) => { state.connectedDeviceId = id; },
    setScanning: () => undefined,
    upsertDevice: () => undefined,
    clearDevices: () => undefined,
    setSupportedPids: () => undefined,
    setAdapterKind: (k) => { state.adapterKind = k; },
    setVin: () => undefined,
    setDtcCount: () => undefined,
    getProtocolOverride: () => null,
  };
  return { store, state };
}

/** Stands in for a Wi-Fi dongle: attached from outside, no disconnect signal. */
function fakeAdapter(sendCommand: jest.Mock): ConnectedAdapter {
  return {
    client: {
      sendCommand,
      close: jest.fn(() => Promise.resolve()),
    },
    dtc: {},
    vin: { readVin: jest.fn(() => Promise.reject(new Error('no vin'))) },
  } as unknown as ConnectedAdapter;
}

const ble = { stopDeviceScan: () => undefined } as unknown as BleManager;

/** Run the heartbeat `times` times, letting each probe's promise settle. */
async function beat(times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    jest.advanceTimersByTime(12_000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('ConnectionMachine link heartbeat', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('holds the link while the adapter keeps answering', async () => {
    const send = jest.fn(() => Promise.resolve('ELM327 v1.5'));
    const { store, state } = fakeStore();
    const machine = new ConnectionMachine(store, ble);
    machine.injectAdapter(fakeAdapter(send), 'wifi-adapter', 'real');

    await beat(4);

    expect(state.phase).toBe('ready');
    expect(state.connectedDeviceId).toBe('wifi-adapter');
    machine.destroy();
  });

  // The reported bug: a Wi-Fi link goes quiet when the phone leaves the car's
  // network, and nothing on that transport reports it. Before the heartbeat the
  // app stayed green over an adapter that was no longer there.
  it('declares the link dead once probes stop coming back', async () => {
    const send = jest.fn(() => Promise.reject(new Error('socket timed out')));
    const { store, state } = fakeStore();
    const machine = new ConnectionMachine(store, ble);
    machine.injectAdapter(fakeAdapter(send), 'wifi-adapter', 'real');

    await beat(2);

    expect(state.phase).toBe('error');
    expect(state.connectedDeviceId).toBeNull();
    expect(state.adapterKind).toBeNull();
    expect(machine.getAdapter()).toBeNull();
    machine.destroy();
  });

  // A single lost command is ordinary on a busy bus; tearing the link down for
  // one would be worse than the stale state the probe exists to prevent.
  it('survives a single missed probe', async () => {
    let calls = 0;
    const send = jest.fn(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('bus busy')) : Promise.resolve('ELM327 v1.5');
    });
    const { store, state } = fakeStore();
    const machine = new ConnectionMachine(store, ble);
    machine.injectAdapter(fakeAdapter(send), 'wifi-adapter', 'real');

    await beat(3);

    expect(state.phase).toBe('ready');
    machine.destroy();
  });

  it('stops probing once disconnected on purpose', async () => {
    const send = jest.fn(() => Promise.resolve('ELM327 v1.5'));
    const { store } = fakeStore();
    const machine = new ConnectionMachine(store, ble);
    machine.injectAdapter(fakeAdapter(send), 'wifi-adapter', 'real');

    await beat(1);
    const afterOne = send.mock.calls.length;
    await machine.disconnect();
    await beat(3);

    expect(send.mock.calls.length).toBe(afterOne);
    machine.destroy();
  });
});
