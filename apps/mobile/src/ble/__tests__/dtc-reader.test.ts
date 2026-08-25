import { DtcReader } from '../dtc-reader';
import { Elm327Error } from '../elm327/errors';
import type { Elm327Client } from '../elm327/client';

/** Answers each mode with a canned frame and records what was asked. */
function fakeClient(frames: Record<string, string>) {
  const sent: { command: string; timeoutMs?: number }[] = [];
  const client = {
    sendCommand: jest.fn((command: string, options?: { timeoutMs?: number }) => {
      sent.push({ command, timeoutMs: options?.timeoutMs });
      const frame = frames[command];
      if (frame === undefined) throw new Error(`unexpected command ${command}`);
      return Promise.resolve(frame);
    }),
  } as unknown as Elm327Client;
  return { client, sent };
}

describe('DtcReader.readStoredDtcs', () => {
  it('reads codes off a normal frame', async () => {
    const { client } = fakeClient({ '03': '43 03 00' });
    const dtcs = await new DtcReader(client).readStoredDtcs();
    expect(dtcs.map((d) => d.code)).toEqual(['P0300']);
  });

  it('treats NO DATA as a car with no stored codes', async () => {
    const { client } = fakeClient({ '03': 'NO DATA' });
    await expect(new DtcReader(client).readStoredDtcs()).resolves.toEqual([]);
  });

  // The bus failing to answer used to parse as a frame holding no codes, so a
  // car that could not be reached looked exactly like a car with nothing wrong.
  it.each(['BUS BUSY', 'STOPPED', 'UNABLE TO CONNECT', '?'])(
    'rejects %s rather than reporting zero codes',
    async (response) => {
      const { client } = fakeClient({ '03': response });
      await expect(new DtcReader(client).readStoredDtcs()).rejects.toBeInstanceOf(Elm327Error);
    },
  );
});

describe('DtcReader.clearDtcs', () => {
  it('verifies the clear by re-reading', async () => {
    const { client } = fakeClient({ '04': '44', '03': 'NO DATA', '07': 'NO DATA' });
    await expect(new DtcReader(client).clearDtcs()).resolves.toEqual({
      verified: true,
      remainingDtcs: [],
    });
  });

  it('reports the codes that survived the clear', async () => {
    const { client } = fakeClient({ '04': '44', '03': '43 03 00', '07': 'NO DATA' });
    const result = await new DtcReader(client).clearDtcs();
    expect(result.verified).toBe(false);
    expect(result.remainingDtcs.map((d) => d.code)).toEqual(['P0300']);
  });

  // An ECU that refuses to clear — most often because the engine is running —
  // answers with an error string. Reporting that as success is the worst
  // outcome available: the codes are still there and the driver thinks they
  // are gone.
  it.each(['NO DATA', 'BUS BUSY', 'STOPPED', '?'])(
    'fails loudly when the ECU answers %s',
    async (response) => {
      const { client } = fakeClient({ '04': response, '03': 'NO DATA', '07': 'NO DATA' });
      await expect(new DtcReader(client).clearDtcs()).rejects.toBeInstanceOf(Elm327Error);
    },
  );

  it('gives the clear longer than an ordinary command', async () => {
    const { client, sent } = fakeClient({ '04': '44', '03': 'NO DATA', '07': 'NO DATA' });
    await new DtcReader(client).clearDtcs();
    const clear = sent.find((s) => s.command === '04');
    expect(clear?.timeoutMs).toBeGreaterThan(4000);
  });

  it('lets an explicit timeout override the default', async () => {
    const { client, sent } = fakeClient({ '04': '44', '03': 'NO DATA', '07': 'NO DATA' });
    await new DtcReader(client).clearDtcs({ timeoutMs: 20_000 });
    expect(sent.find((s) => s.command === '04')?.timeoutMs).toBe(20_000);
  });
});
