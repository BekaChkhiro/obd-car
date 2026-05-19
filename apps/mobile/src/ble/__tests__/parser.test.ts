import { cleanFrame, isHexByteString, parseHexBytes, parseObdResponse } from '../elm327/parser';
import { Elm327Error } from '../elm327/errors';

describe('cleanFrame', () => {
  it('trims whitespace', () => {
    expect(cleanFrame('  41 0C  ')).toBe('41 0C');
  });

  it('collapses multiple spaces', () => {
    expect(cleanFrame('41  0C   08')).toBe('41 0C 08');
  });

  it('replaces CR/LF with spaces', () => {
    expect(cleanFrame('41\r\n0C')).toBe('41 0C');
  });

  it('handles empty string', () => {
    expect(cleanFrame('')).toBe('');
  });

  it('handles frame with only whitespace', () => {
    expect(cleanFrame('   \r\n  ')).toBe('');
  });
});

describe('isHexByteString', () => {
  it('returns true for valid 2-char hex tokens', () => {
    expect(isHexByteString('00')).toBe(true);
    expect(isHexByteString('FF')).toBe(true);
    expect(isHexByteString('0C')).toBe(true);
    expect(isHexByteString('ab')).toBe(true);
  });

  it('returns false for invalid tokens', () => {
    expect(isHexByteString('GG')).toBe(false);
    expect(isHexByteString('0')).toBe(false);
    expect(isHexByteString('000')).toBe(false);
    expect(isHexByteString('')).toBe(false);
  });
});

describe('parseHexBytes', () => {
  it('parses space-separated hex bytes', () => {
    expect(parseHexBytes('41 0C 08 00')).toEqual([0x41, 0x0c, 0x08, 0x00]);
  });

  it('returns empty array for empty string', () => {
    expect(parseHexBytes('')).toEqual([]);
  });

  it('throws for invalid hex token', () => {
    expect(() => parseHexBytes('41 ZZ 08')).toThrow(Elm327Error);
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseHexBytes('  41 0C  ')).toEqual([0x41, 0x0c]);
  });
});

describe('parseObdResponse', () => {
  it('parses a valid mode 01 RPM response', () => {
    // mode 01, pid 0x0C → echo byte 0x41, pid echo 0x0C, data = [0x08, 0x00]
    const result = parseObdResponse('41 0C 08 00', 0x01, 0x0c);
    expect(result.mode).toBe(0x01);
    expect(result.pid).toBe(0x0c);
    expect(result.data).toEqual([0x08, 0x00]);
  });

  it('throws Elm327Error for ELM error strings', () => {
    expect(() => parseObdResponse('NO DATA', 0x01, 0x0c)).toThrow(Elm327Error);
    expect(() => parseObdResponse('BUS BUSY', 0x01, 0x0c)).toThrow(Elm327Error);
  });

  it('throws when response is too short', () => {
    expect(() => parseObdResponse('41', 0x01, 0x0c)).toThrow(Elm327Error);
  });

  it('throws on mode echo mismatch', () => {
    // Mode 01 expects echo 0x41, not 0x42
    expect(() => parseObdResponse('42 0C 08 00', 0x01, 0x0c)).toThrow(Elm327Error);
  });

  it('throws on PID echo mismatch', () => {
    expect(() => parseObdResponse('41 0D 60', 0x01, 0x0c)).toThrow(Elm327Error);
  });

  it('handles CRLF in response', () => {
    const result = parseObdResponse('41 0C 08 00\r', 0x01, 0x0c);
    expect(result.data).toEqual([0x08, 0x00]);
  });

  it('returns empty data array for response with no data bytes', () => {
    // Exactly mode echo + pid echo, no extra bytes
    const result = parseObdResponse('41 0C', 0x01, 0x0c);
    expect(result.data).toEqual([]);
  });

  it('handles mode 02 (freeze frame) echo byte offset', () => {
    // mode 02 + 0x40 = 0x42
    const result = parseObdResponse('42 0C 08 00', 0x02, 0x0c);
    expect(result.mode).toBe(0x02);
    expect(result.pid).toBe(0x0c);
    expect(result.data).toEqual([0x08, 0x00]);
  });
});
