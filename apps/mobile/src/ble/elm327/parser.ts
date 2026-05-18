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
  const tokens = cleaned.split(' ').filter(Boolean);
  const bytes: number[] = [];
  for (const tok of tokens) {
    if (!isHexByteString(tok)) {
      throw new Elm327Error('protocol', `Invalid hex byte token "${tok}"`, {
        response: frame,
      });
    }
    bytes.push(parseInt(tok, 16));
  }
  return bytes;
}

export function parseObdResponse(
  frame: string,
  requestedMode: number,
  requestedPid: number,
): ParsedObdResponse {
  const cleaned = cleanFrame(frame);

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
