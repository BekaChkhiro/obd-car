import { BleManager, type Device } from 'react-native-ble-plx';
import {
  BleElmTransport,
  Elm327Client,
  discoverElmProfile,
  Elm327Error,
  type BleElmTransportConfig,
} from './elm327';

export const bleManager = new BleManager();

export async function createElm327Client(
  device: Device,
  options: { profile?: BleElmTransportConfig } = {},
): Promise<Elm327Client> {
  const profile = options.profile ?? (await discoverElmProfile(device));
  if (!profile) {
    throw new Elm327Error(
      'transport',
      `No known ELM327 BLE service found on device ${device.id}`,
    );
  }
  const transport = new BleElmTransport(device, profile);
  const client = new Elm327Client(transport);
  await client.initialize();
  return client;
}
