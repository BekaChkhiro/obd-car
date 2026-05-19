import { Elm327Error, detectElmError } from '../elm327/errors';

describe('Elm327Error', () => {
  it('has name "Elm327Error"', () => {
    const err = new Elm327Error('timeout', 'command timed out');
    expect(err.name).toBe('Elm327Error');
  });

  it('stores kind, message, command, and response', () => {
    const err = new Elm327Error('protocol', 'bad response', {
      command: '010C',
      response: 'NO DATA',
    });
    expect(err.kind).toBe('protocol');
    expect(err.message).toBe('bad response');
    expect(err.command).toBe('010C');
    expect(err.response).toBe('NO DATA');
  });

  it('is an instance of Error', () => {
    const err = new Elm327Error('transport', 'closed');
    expect(err).toBeInstanceOf(Error);
  });

  it('accepts cause option', () => {
    const cause = new Error('original');
    const err = new Elm327Error('transport', 'wrapped', { cause });
    expect(err.cause).toBe(cause);
  });

  it('command and response are undefined when not provided', () => {
    const err = new Elm327Error('timeout', 'timed out');
    expect(err.command).toBeUndefined();
    expect(err.response).toBeUndefined();
  });

  it('supports all documented error kinds', () => {
    const kinds = [
      'timeout', 'no-data', 'unable-to-connect', 'bus-busy', 'bus-error',
      'can-error', 'stopped', 'searching', 'unknown-command', 'protocol',
      'transport', 'not-initialized', 'no-protocol',
    ] as const;
    for (const kind of kinds) {
      expect(() => new Elm327Error(kind, 'test')).not.toThrow();
    }
  });
});

describe('detectElmError', () => {
  it('returns null for a normal response', () => {
    expect(detectElmError('41 0C 08 00')).toBeNull();
    expect(detectElmError('OK')).toBeNull();
    expect(detectElmError('ELM327 v1.5')).toBeNull();
  });

  it('detects NO DATA', () => {
    expect(detectElmError('NO DATA')).toBe('no-data');
    expect(detectElmError('NODATA')).toBe('no-data');
  });

  it('detects UNABLE TO CONNECT', () => {
    expect(detectElmError('UNABLE TO CONNECT')).toBe('unable-to-connect');
  });

  it('detects BUS BUSY', () => {
    expect(detectElmError('BUS BUSY')).toBe('bus-busy');
  });

  it('detects BUS ERROR', () => {
    expect(detectElmError('BUS ERROR')).toBe('bus-error');
  });

  it('detects CAN ERROR', () => {
    expect(detectElmError('CAN ERROR')).toBe('can-error');
  });

  it('detects STOPPED', () => {
    expect(detectElmError('STOPPED')).toBe('stopped');
  });

  it('detects SEARCHING', () => {
    expect(detectElmError('SEARCHING...')).toBe('searching');
  });

  it('detects unknown command (?)', () => {
    expect(detectElmError('?')).toBe('unknown-command');
  });

  it('is case-insensitive', () => {
    expect(detectElmError('no data')).toBe('no-data');
    expect(detectElmError('Bus Busy')).toBe('bus-busy');
  });
});
