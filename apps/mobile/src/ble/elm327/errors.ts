export type Elm327ErrorKind =
  | 'timeout'
  | 'no-data'
  | 'unable-to-connect'
  | 'bus-busy'
  | 'bus-error'
  | 'can-error'
  | 'stopped'
  | 'searching'
  | 'unknown-command'
  | 'protocol'
  | 'transport'
  | 'not-initialized'
  | 'no-protocol';

export class Elm327Error extends Error {
  readonly kind: Elm327ErrorKind;
  readonly command?: string;
  readonly response?: string;

  constructor(
    kind: Elm327ErrorKind,
    message: string,
    options: { command?: string; response?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'Elm327Error';
    this.kind = kind;
    this.command = options.command;
    this.response = options.response;
  }
}

const ERROR_PATTERNS: ReadonlyArray<{ re: RegExp; kind: Elm327ErrorKind }> = [
  { re: /NO\s*DATA/i, kind: 'no-data' },
  { re: /UNABLE\s*TO\s*CONNECT/i, kind: 'unable-to-connect' },
  { re: /BUS\s*BUSY/i, kind: 'bus-busy' },
  { re: /BUS\s*ERROR/i, kind: 'bus-error' },
  { re: /CAN\s*ERROR/i, kind: 'can-error' },
  { re: /STOPPED/i, kind: 'stopped' },
  { re: /SEARCHING/i, kind: 'searching' },
  { re: /\?/, kind: 'unknown-command' },
];

export function detectElmError(response: string): Elm327ErrorKind | null {
  for (const { re, kind } of ERROR_PATTERNS) {
    if (re.test(response)) return kind;
  }
  return null;
}
