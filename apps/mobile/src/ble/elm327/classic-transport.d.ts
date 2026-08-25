// Type surface shared by the two Bluetooth Classic implementations.
//
// Metro picks `.android.ts` or `.ios.ts` by platform at bundle time, but
// TypeScript resolves the bare specifier and finds neither. Declaring the
// contract here also forces the two to agree: only what both platforms
// genuinely provide is visible to callers, so code cannot be written against
// an Android-only shape and then crash on iOS.
//
// The iOS side is a stub that throws — Apple's ExternalAccessory framework
// only talks to MFi-certified accessories, which no commodity ELM327 clone is.

import type { ElmTransport } from './transport';

export interface ClassicElmTransportConfig {
  /** Bluetooth Classic address (MAC) of the paired adapter. */
  address: string;
  /** Optional delimiter used to chunk reads. */
  delimiter?: string;
}

export declare class ClassicElmTransport implements ElmTransport {
  constructor(config: ClassicElmTransportConfig);
  connect(): Promise<void>;
  write(payload: string): Promise<void>;
  subscribe(onData: (chunk: string) => void): () => void;
  close(): Promise<void>;
}

/**
 * Adapters already paired in the OS settings.
 *
 * Narrowed to the two fields both platforms supply — Android's library hands
 * back a much richer device object, but nothing may depend on that or the code
 * stops compiling against iOS.
 */
export declare function getPairedClassicDevices(): Promise<
  Array<{ address: string; name: string | null }>
>;
