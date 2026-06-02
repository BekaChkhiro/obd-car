// iOS stub for Bluetooth Classic. The actual implementation lives in
// classic-transport.android.ts and depends on react-native-bluetooth-classic,
// which uses Apple's ExternalAccessory framework and crashes on iOS without
// MFi-certified accessories — none of which apply to commodity ELM327 clones.
// Use BLE or WiFi transport on iOS instead.

import type { ElmTransport } from './transport';

export interface ClassicElmTransportConfig {
  address: string;
  delimiter?: string;
}

export class ClassicElmTransport implements ElmTransport {
  constructor(_config: ClassicElmTransportConfig) {
    throw new Error(
      'Bluetooth Classic is not available on iOS. Use BLE or WiFi transport instead.',
    );
  }

  async connect(): Promise<void> {
    throw new Error('Bluetooth Classic is not available on iOS.');
  }

  async write(_payload: string): Promise<void> {
    throw new Error('Bluetooth Classic is not available on iOS.');
  }

  subscribe(_onData: (chunk: string) => void): () => void {
    throw new Error('Bluetooth Classic is not available on iOS.');
  }

  async close(): Promise<void> {
    // no-op
  }
}

export async function getPairedClassicDevices(): Promise<
  Array<{ address: string; name: string | null }>
> {
  return [];
}
