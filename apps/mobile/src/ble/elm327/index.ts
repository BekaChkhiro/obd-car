export { Elm327Error, detectElmError, type Elm327ErrorKind } from './errors';
export { ResponseFramer, ELM_PROMPT, type FramerOptions } from './framer';
export {
  cleanFrame,
  isHexByteString,
  parseHexBytes,
  parseObdResponse,
  type ParsedObdResponse,
} from './parser';
export {
  BleElmTransport,
  COMMON_ELM327_PROFILES,
  discoverElmProfile,
  type BleElmTransportConfig,
  type ElmTransport,
} from './transport';
export {
  TcpElmTransport,
  DEFAULT_TCP_ELM_CONFIG,
  type TcpElmTransportConfig,
} from './tcp-transport';
export {
  ClassicElmTransport,
  getPairedClassicDevices,
  type ClassicElmTransportConfig,
} from './classic-transport';
export {
  Elm327Client,
  ELM_INIT_COMMANDS,
  type Elm327ClientOptions,
  type SendCommandOptions,
  type QueuePriority,
  type QueueStats,
  type EnqueueOptions,
} from './client';
