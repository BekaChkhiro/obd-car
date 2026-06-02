import type { Device, Subscription } from 'react-native-ble-plx';

// React Native (Hermes) exposes atob/btoa globally. ELM327 traffic is pure ASCII,
// so we avoid the heavyweight `buffer` polyfill.
function asciiToBase64(input: string): string {
  return globalThis.btoa(input);
}

function base64ToAscii(input: string): string {
  return globalThis.atob(input);
}

export interface ElmTransport {
  write(payload: string): Promise<void>;
  subscribe(onData: (chunk: string) => void): () => void;
  close(): Promise<void>;
}

export interface BleElmTransportConfig {
  serviceUUID: string;
  notifyCharacteristicUUID: string;
  writeCharacteristicUUID: string;
  withResponse?: boolean;
}

// Common ELM327 BLE adapter profiles. Most clones use HM-10 (FFE0/FFE1).
// Some newer adapters use Nordic UART Service.
export const COMMON_ELM327_PROFILES: ReadonlyArray<BleElmTransportConfig> = [
  {
    serviceUUID: '0000fff0-0000-1000-8000-00805f9b34fb',
    notifyCharacteristicUUID: '0000fff1-0000-1000-8000-00805f9b34fb',
    writeCharacteristicUUID: '0000fff2-0000-1000-8000-00805f9b34fb',
    withResponse: false,
  },
  {
    serviceUUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    notifyCharacteristicUUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    writeCharacteristicUUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    withResponse: false,
  },
  {
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    notifyCharacteristicUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    writeCharacteristicUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    withResponse: false,
  },
];

export class BleElmTransport implements ElmTransport {
  private subscription: Subscription | null = null;

  constructor(
    private readonly device: Device,
    private readonly config: BleElmTransportConfig,
  ) {}

  async write(payload: string): Promise<void> {
    const base64 = asciiToBase64(payload);
    if (this.config.withResponse) {
      await this.device.writeCharacteristicWithResponseForService(
        this.config.serviceUUID,
        this.config.writeCharacteristicUUID,
        base64,
      );
    } else {
      await this.device.writeCharacteristicWithoutResponseForService(
        this.config.serviceUUID,
        this.config.writeCharacteristicUUID,
        base64,
      );
    }
  }

  subscribe(onData: (chunk: string) => void): () => void {
    const sub = this.device.monitorCharacteristicForService(
      this.config.serviceUUID,
      this.config.notifyCharacteristicUUID,
      (error, characteristic) => {
        if (error) return;
        const value = characteristic?.value;
        if (!value) return;
        const chunk = base64ToAscii(value);
        onData(chunk);
      },
    );
    this.subscription = sub;
    return () => {
      sub.remove();
      if (this.subscription === sub) this.subscription = null;
    };
  }

  async close(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
  }
}

export async function discoverElmProfile(
  device: Device,
  profiles: ReadonlyArray<BleElmTransportConfig> = COMMON_ELM327_PROFILES,
): Promise<BleElmTransportConfig | null> {
  const services = await device.services();
  const serviceUUIDs = new Set(services.map((s) => s.uuid.toLowerCase()));
  for (const profile of profiles) {
    if (serviceUUIDs.has(profile.serviceUUID.toLowerCase())) {
      return profile;
    }
  }
  // Fallback: scan every service for a usable notify + write characteristic
  // pair. Many ELM327 clones use custom UUIDs that don't match the well-known
  // FFE0/FFF0/Nordic profiles.
  for (const service of services) {
    const characteristics = await service.characteristics();
    const notifyChar = characteristics.find((c) => c.isNotifiable || c.isIndicatable);
    const writeChar =
      characteristics.find((c) => c.isWritableWithResponse || c.isWritableWithoutResponse) ?? notifyChar;
    if (notifyChar && writeChar) {
      const supportsWriteWithoutResponse =
        writeChar.isWritableWithoutResponse === true;
      return {
        serviceUUID: service.uuid,
        notifyCharacteristicUUID: notifyChar.uuid,
        writeCharacteristicUUID: writeChar.uuid,
        withResponse: !supportsWriteWithoutResponse,
      };
    }
  }
  return null;
}
