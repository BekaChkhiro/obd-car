// The honesty contract for demo mode, pinned.
//
// `currentAdapterState()` is the only place the phone decides what the backend
// — and through it the model — believes about the OBD-II link. Two facts leave
// here and they must stay independent: whether a reading can be taken at all,
// and whether it came off the user's car. Collapse them either way and the app
// either hides a working demo or narrates generated numbers as measurements.

jest.mock('../../ble/connection', () => ({
  connectionMachine: {
    hasLiveVehicleLink: jest.fn(),
    getAdapterKind: jest.fn(),
    getSupportedPids: jest.fn(),
    getVin: jest.fn(),
  },
}));
// Pulled in transitively by the chat store; neither is exercised here and both
// reach for native modules that do not exist under the node test environment.
jest.mock('../../lib/api', () => ({ getFreshAccessToken: jest.fn() }));
jest.mock('../../chat/client', () => ({ ChatClient: class {} }));

import { connectionMachine } from '../../ble/connection';
import { currentAdapterState } from '../chat';

type AdapterKind = 'real' | 'simulated' | null;

const machine = connectionMachine as unknown as {
  hasLiveVehicleLink: jest.Mock;
  getAdapterKind: jest.Mock;
  getSupportedPids: jest.Mock;
  getVin: jest.Mock;
};

function linkIs(kind: AdapterKind): void {
  machine.hasLiveVehicleLink.mockReturnValue(kind === 'real');
  machine.getAdapterKind.mockReturnValue(kind);
}

beforeEach(() => {
  jest.clearAllMocks();
  machine.getSupportedPids.mockReturnValue(['010C', '010D']);
  machine.getVin.mockReturnValue('1HGCM82633A123456');
});

describe('currentAdapterState', () => {
  it('reports a physical adapter as connected and not simulated', () => {
    linkIs('real');
    expect(currentAdapterState()).toEqual({
      connected: true,
      simulated: false,
      supportedPids: ['010C', '010D'],
      vin: '1HGCM82633A123456',
    });
  });

  it('reports a simulated adapter as connected AND simulated', () => {
    linkIs('simulated');
    expect(currentAdapterState()).toEqual({
      connected: true,
      simulated: true,
      supportedPids: ['010C', '010D'],
      vin: '1HGCM82633A123456',
    });
  });

  it('reports nothing connected when there is no link', () => {
    linkIs(null);
    expect(currentAdapterState()).toEqual({
      connected: false,
      simulated: false,
      supportedPids: [],
      vin: null,
    });
  });

  it('treats the demo link as usable without consulting any build flag', () => {
    // This used to be gated on isE2E(), which left a shipped demo telling the
    // assistant no adapter was present: it refused to read anything, and demo
    // mode could not show the one feature it exists to show. The gate is gone,
    // so the link state alone decides — nothing here reads the environment.
    linkIs('simulated');
    expect(currentAdapterState().connected).toBe(true);
    expect(currentAdapterState().simulated).toBe(true);
  });

  it('never claims a real reading is simulated', () => {
    // The dangerous direction is not only the obvious one: wrongly flagging a
    // genuine measurement teaches the user to discount readings that are real.
    linkIs('real');
    expect(currentAdapterState().simulated).toBe(false);
  });

  it('copies the PID list rather than handing out the machine’s array', () => {
    const pids = ['010C'];
    machine.getSupportedPids.mockReturnValue(pids);
    linkIs('real');
    currentAdapterState().supportedPids.push('010D');
    expect(pids).toEqual(['010C']);
  });
});
