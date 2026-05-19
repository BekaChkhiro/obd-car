import { PID_BY_ID, decodePid, type PidValue } from '@obd-car/obd-protocol';
import { Elm327Error } from './elm327/errors';
import { parseObdResponse } from './elm327/parser';
import type { Elm327Client, SendCommandOptions } from './elm327/client';

export interface FreezeFrameResult {
  pid: string;
  dtcCode: string;
  name: string;
  value: number;
  unit: string;
  raw: readonly number[];
}

export class FreezeFrameReader {
  constructor(private readonly client: Elm327Client) {}

  /**
   * Read a freeze-frame snapshot for the given mode-02 PID identifier.
   *
   * @param pidId - Four-char hex string with mode prefix, e.g. "020C" for freeze-frame RPM.
   * @param dtcCode - DTC associated with this freeze frame (informational — used in result only).
   */
  async readFreezeFrame(
    pidId: string,
    dtcCode: string,
    options: SendCommandOptions = {},
  ): Promise<FreezeFrameResult> {
    const upper = pidId.toUpperCase();
    if (upper.length !== 4 || !upper.startsWith('02')) {
      throw new Elm327Error('protocol', `Freeze-frame PID must be a 4-char mode-02 string (e.g. "020C"), got "${pidId}"`, {
        command: pidId,
      });
    }

    const pidHex = upper.slice(2); // e.g. "0C"
    const pidNum = parseInt(pidHex, 16);

    // Decode using the mode-01 definition — the byte formula is identical across modes.
    const mode01Key = `01${pidHex}`;
    const def = PID_BY_ID[mode01Key];
    if (!def) {
      throw new Elm327Error('protocol', `Unsupported freeze-frame PID "${pidId}"`, { command: pidId });
    }

    const frame = await this.client.sendCommand(upper, options);
    const parsed = parseObdResponse(frame, 0x02, pidNum);
    const decoded = decodePid(mode01Key, parsed.data) as PidValue;

    return {
      pid: upper,
      dtcCode,
      name: decoded.name,
      value: decoded.value,
      unit: decoded.unit,
      raw: decoded.raw,
    };
  }
}
