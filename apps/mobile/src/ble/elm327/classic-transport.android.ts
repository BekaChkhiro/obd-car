import RNBluetoothClassic, {
  type BluetoothDevice,
  type BluetoothEventSubscription,
} from 'react-native-bluetooth-classic';
import type { ElmTransport } from './transport';
import { ELM_PROMPT } from './framer';

export interface ClassicElmTransportConfig {
  /** Bluetooth Classic address (MAC) of the paired adapter. */
  address: string;
  /** Optional delimiter used by RNBluetoothClassic to chunk reads. */
  delimiter?: string;
}

export class ClassicElmTransport implements ElmTransport {
  private device: BluetoothDevice | null = null;
  private subscription: BluetoothEventSubscription | null = null;

  constructor(private readonly config: ClassicElmTransportConfig) {}

  async connect(): Promise<void> {
    const paired = await RNBluetoothClassic.getBondedDevices();
    const found = paired.find((d) => d.address === this.config.address);
    if (!found) {
      throw new Error(
        `Bluetooth Classic device ${this.config.address} not paired. Pair it from the system Bluetooth settings first.`,
      );
    }
    // Delimiter '>' splits on ELM's prompt — the same character the framer
    // uses to mark frame ends. RNBluetoothClassic strips the delimiter from
    // the emitted data, so we re-append it in subscribe() before pushing to
    // the framer; otherwise the framer never sees a frame boundary.
    //
    // secureSocket=false avoids the well-known
    //   java.io.IOException: read failed, socket might closed or timeout, read ret:-1
    // that the Android RFCOMM stack throws for many ELM327 clones (HC-05/06).
    // The insecure socket path skips the pairing-encryption handshake and is
    // what virtually every working OBD-II Android app uses for SPP adapters.
    const baseOptions = {
      delimiter: this.config.delimiter ?? ELM_PROMPT,
      readSize: 1024,
      secureSocket: false,
    };
    let connected = false;
    try {
      connected = await found.connect(baseOptions);
    } catch (err) {
      // Some chip combos still fail on the first attempt — fall back to the
      // default (secure) connector before giving up.
      try {
        connected = await found.connect({
          delimiter: this.config.delimiter ?? ELM_PROMPT,
          readSize: 1024,
        });
      } catch {
        throw err;
      }
    }
    if (!connected) {
      throw new Error(`Failed to connect to Bluetooth Classic device ${this.config.address}`);
    }
    this.device = found;
  }

  async write(payload: string): Promise<void> {
    if (!this.device) throw new Error('Bluetooth Classic transport not connected');
    await this.device.write(payload);
  }

  subscribe(onData: (chunk: string) => void): () => void {
    if (!this.device) throw new Error('Bluetooth Classic transport not connected');
    const sub = this.device.onDataReceived((event) => {
      const data = event?.data;
      if (typeof data !== 'string') return;
      // The delimiter ('>') is stripped from the delivered data; re-append it
      // so the shared framer can find a frame boundary the same way it does
      // for BLE/TCP transports.
      onData(data + ELM_PROMPT);
    });
    this.subscription = sub;
    return () => {
      sub.remove();
      if (this.subscription === sub) this.subscription = null;
    };
  }

  async close(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    if (this.device) {
      try {
        await this.device.disconnect();
      } catch {
        // already disconnected
      }
      this.device = null;
    }
  }
}

export async function getPairedClassicDevices(): Promise<BluetoothDevice[]> {
  return RNBluetoothClassic.getBondedDevices();
}
