import { BleManager, type Device } from 'react-native-ble-plx';
import {
  BleElmTransport,
  Elm327Client,
  discoverElmProfile,
  Elm327Error,
  type BleElmTransportConfig,
} from './elm327';
import { PidReader } from './pid-reader';
import { discoverSupportedPids, loadCachedPids, clearCachedPids } from './pid-discovery';
import {
  negotiateProtocol,
  clearCachedProtocol,
  loadCachedProtocol,
  OBD_PROTOCOL_NAMES,
  type NegotiatedProtocol,
  type ProtocolNegotiationOptions,
} from './protocol-negotiation';

export {
  PidReader,
  discoverSupportedPids,
  loadCachedPids,
  clearCachedPids,
  clearCachedProtocol,
  loadCachedProtocol,
  OBD_PROTOCOL_NAMES,
};
export type { PidKey, PidValue } from './pid-reader';
export type { NegotiatedProtocol, ProtocolNegotiationOptions };

export const bleManager = new BleManager();

export interface ConnectedAdapter {
  client: Elm327Client;
  pid: PidReader;
  negotiatedProtocol: NegotiatedProtocol;
}

export interface CreateElm327ClientOptions {
  profile?: BleElmTransportConfig;
  /**
   * Manual protocol override (0-9). Bypasses auto-detect and the probe
   * sequence. Passed directly to negotiateProtocol.
   */
  protocolOverride?: number;
  /**
   * VIN or other stable identifier for protocol caching. Falls back to
   * device.id so repeated connections to the same adapter skip probing.
   */
  vin?: string;
}

export async function createElm327Client(
  device: Device,
  options: CreateElm327ClientOptions = {},
): Promise<ConnectedAdapter> {
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

  const protoOpts: ProtocolNegotiationOptions = {
    override: options.protocolOverride,
    cacheKey: options.vin ?? device.id,
  };
  const negotiatedProtocol = await negotiateProtocol(client, protoOpts);

  return { client, pid: new PidReader(client), negotiatedProtocol };
}
