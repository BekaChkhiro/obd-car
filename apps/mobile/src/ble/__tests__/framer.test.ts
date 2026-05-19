import { ResponseFramer } from '../elm327/framer';

describe('ResponseFramer', () => {
  it('returns no frames when chunk has no prompt', () => {
    const f = new ResponseFramer();
    expect(f.push('41 0C 08')).toEqual([]);
  });

  it('splits a single complete frame at the prompt', () => {
    const f = new ResponseFramer();
    const frames = f.push('41 0C 08 00\r>');
    expect(frames).toEqual(['41 0C 08 00\r']);
  });

  it('accumulates across multiple chunks', () => {
    const f = new ResponseFramer();
    expect(f.push('41 0C')).toEqual([]);
    expect(f.push(' 08 00\r>')).toEqual(['41 0C 08 00\r']);
  });

  it('extracts multiple frames from one chunk', () => {
    const f = new ResponseFramer();
    const frames = f.push('OK\r>41 0C 08 00\r>');
    expect(frames).toHaveLength(2);
    expect(frames[0]).toBe('OK\r');
    expect(frames[1]).toBe('41 0C 08 00\r');
  });

  it('pending() reflects buffered data before prompt', () => {
    const f = new ResponseFramer();
    f.push('partial data');
    expect(f.pending()).toBe('partial data');
  });

  it('pending() is empty after a complete frame', () => {
    const f = new ResponseFramer();
    f.push('OK\r>');
    expect(f.pending()).toBe('');
  });

  it('reset() clears the buffer', () => {
    const f = new ResponseFramer();
    f.push('partial');
    f.reset();
    expect(f.pending()).toBe('');
  });

  it('reset() after a partial frame means old data is lost', () => {
    const f = new ResponseFramer();
    f.push('garbage');
    f.reset();
    const frames = f.push('41 0C 08 00\r>');
    expect(frames).toEqual(['41 0C 08 00\r']);
  });

  it('truncates buffer when it exceeds maxBufferBytes', () => {
    const f = new ResponseFramer({ maxBufferBytes: 10 });
    f.push('A'.repeat(20));
    expect(f.pending().length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for empty chunk', () => {
    const f = new ResponseFramer();
    expect(f.push('')).toEqual([]);
  });

  it('handles prompt-only chunk', () => {
    const f = new ResponseFramer();
    const frames = f.push('>');
    expect(frames).toEqual(['']);
  });

  it('does not include the prompt character in frame content', () => {
    const f = new ResponseFramer();
    const frames = f.push('OK\r>');
    expect(frames[0]).not.toContain('>');
  });
});
