import { Elm327Error, detectElmError } from './errors';

export interface ParsedObdResponse {
  mode: number;
  pid: number;
  data: number[];
}

export function cleanFrame(frame: string): string {
  return frame.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isHexByteString(token: string): boolean {
  return /^[0-9A-Fa-f]{2}$/.test(token);
}

export function parseHexBytes(frame: string): number[] {
  const cleaned = cleanFrame(frame);
  if (!cleaned) return [];
  // Normalise both styles ELM produces:
  //   "41 0C 0F A0"  — ATS1 (spaces on, default)
  //   "410C0FA0"     — ATS0 (spaces off — what the init sequence sends)
  // Multi-line CAN responses can also carry a frame index prefix like "0:" or
  // "1:" that must be stripped before parsing.
  const stripped = cleaned
    .split(' ')
    .map((tok) => tok.replace(/^\d+:/, ''))
    .filter(Boolean)
    .join('');
  if (!/^[0-9A-Fa-f]+$/.test(stripped)) {
    throw new Elm327Error('protocol', `Invalid hex characters in "${cleaned}"`, {
      response: frame,
    });
  }
  if (stripped.length % 2 !== 0) {
    throw new Elm327Error('protocol', `Odd hex digit count in "${cleaned}"`, {
      response: frame,
    });
  }
  const bytes: number[] = [];
  for (let i = 0; i < stripped.length; i += 2) {
    bytes.push(parseInt(stripped.slice(i, i + 2), 16));
  }
  return bytes;
}

export function parseObdResponse(
  frame: string,
  requestedMode: number,
  requestedPid: number,
): ParsedObdResponse {
  // After ATSP0 the adapter often prints "SEARCHING..." while it tries each
  // protocol, then appends the real response — e.g. "SEARCHING...41 0C 0F A0".
  // Strip that prefix before running error detection so we don't misclassify a
  // valid frame as a transient "searching" error.
  const cleaned = cleanFrame(frame).replace(/SEARCHING\.{0,3}\s*/gi, '').trim();

  const errorKind = detectElmError(cleaned);
  if (errorKind) {
    throw new Elm327Error(errorKind, `ELM327 reported "${cleaned}"`, {
      response: frame,
    });
  }

  const bytes = parseHexBytes(cleaned);
  if (bytes.length < 2) {
    throw new Elm327Error('protocol', 'OBD response too short', {
      response: frame,
    });
  }

  const expectedModeEcho = (requestedMode + 0x40) & 0xff;
  if (bytes[0] !== expectedModeEcho) {
    throw new Elm327Error(
      'protocol',
      `Unexpected mode echo: got 0x${bytes[0]!.toString(16)}, expected 0x${expectedModeEcho.toString(16)}`,
      { response: frame },
    );
  }
  if (bytes[1] !== requestedPid) {
    throw new Elm327Error(
      'protocol',
      `Unexpected PID echo: got 0x${bytes[1]!.toString(16)}, expected 0x${requestedPid.toString(16)}`,
      { response: frame },
    );
  }

  return {
    mode: requestedMode,
    pid: requestedPid,
    data: bytes.slice(2),
  };
}
