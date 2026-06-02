import { BleManager, type Device } from 'react-native-ble-plx';
import {
  BleElmTransport,
  Elm327Client,
  discoverElmProfile,
  Elm327Error,
  TcpElmTransport,
  DEFAULT_TCP_ELM_CONFIG,
  ClassicElmTransport,
  type BleElmTransportConfig,
  type TcpElmTransportConfig,
  type ClassicElmTransportConfig,
} from './elm327';
import { PidReader } from './pid-reader';
import { DtcReader } from './dtc-reader';
import { VinReader } from './vin-reader';
import { FreezeFrameReader } from './freeze-frame-reader';
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
  DtcReader,
  VinReader,
  FreezeFrameReader,
  discoverSupportedPids,
  loadCachedPids,
  clearCachedPids,
  clearCachedProtocol,
  loadCachedProtocol,
  OBD_PROTOCOL_NAMES,
};
export type { PidKey, PidValue } from './pid-reader';
export type { ClearDtcsResult, DtcResult, ReadDtcsOptions } from './dtc-reader';
export type { VinResult } from './vin-reader';
export type { FreezeFrameResult } from './freeze-frame-reader';
export type { NegotiatedProtocol, ProtocolNegotiationOptions };

export const bleManager = new BleManager();

export interface ConnectedAdapter {
  client: Elm327Client;
  pid: PidReader;
  dtc: DtcReader;
  vin: VinReader;
  ff: FreezeFrameReader;
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

  return {
    client,
    pid: new PidReader(client),
    dtc: new DtcReader(client),
    vin: new VinReader(client),
    ff: new FreezeFrameReader(client),
    negotiatedProtocol,
  };
}

export interface CreateClassicElm327ClientOptions {
  address: string;
  delimiter?: string;
  protocolOverride?: number;
  cacheKey?: string;
}

export async function createClassicElm327Client(
  options: CreateClassicElm327ClientOptions,
): Promise<ConnectedAdapter> {
  const transport = new ClassicElmTransport({
    address: options.address,
    delimiter: options.delimiter,
  });
  await transport.connect();
  const client = new Elm327Client(transport);
  await client.initialize();

  const protoOpts: ProtocolNegotiationOptions = {
    override: options.protocolOverride,
    cacheKey: options.cacheKey ?? `classic:${options.address}`,
  };
  const negotiatedProtocol = await negotiateProtocol(client, protoOpts);

  return {
    client,
    pid: new PidReader(client),
    dtc: new DtcReader(client),
    vin: new VinReader(client),
    ff: new FreezeFrameReader(client),
    negotiatedProtocol,
  };
}

export interface CreateWifiElm327ClientOptions {
  config?: Partial<TcpElmTransportConfig>;
  protocolOverride?: number;
  /** Stable cache key for negotiated-protocol caching. */
  cacheKey?: string;
}

export async function createWifiElm327Client(
  options: CreateWifiElm327ClientOptions = {},
): Promise<ConnectedAdapter> {
  const config = { ...DEFAULT_TCP_ELM_CONFIG, ...options.config };
  const transport = new TcpElmTransport(config);
  await transport.connect();
  const client = new Elm327Client(transport);
  await client.initialize();

  const protoOpts: ProtocolNegotiationOptions = {
    override: options.protocolOverride,
    cacheKey: options.cacheKey ?? `wifi:${config.host}:${config.port}`,
  };
  const negotiatedProtocol = await negotiateProtocol(client, protoOpts);

  return {
    client,
    pid: new PidReader(client),
    dtc: new DtcReader(client),
    vin: new VinReader(client),
    ff: new FreezeFrameReader(client),
    negotiatedProtocol,
  };
}
