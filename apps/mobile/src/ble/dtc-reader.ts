import {
  parseDtcFrame,
  getDtcDescription,
  isSaeGenericCode,
  type Dtc,
  type DtcLocale,
} from '@obd-car/obd-protocol';
import type { Elm327Client, SendCommandOptions } from './elm327/client';

export type { Dtc };

export interface DtcResult extends Dtc {
  /** Human-readable description in the requested locale, or undefined for manufacturer-specific codes. */
  description: string | undefined;
  /** True when the description came from the bundled SAE database. */
  isSaeGeneric: boolean;
}

export interface ReadDtcsOptions extends SendCommandOptions {
  /** Include pending DTCs (mode 0x07) in addition to stored (mode 0x03). Default: false. */
  includePending?: boolean;
  /** Locale for bundled SAE descriptions. Default: 'en'. */
  locale?: DtcLocale;
}

export interface ClearDtcsResult {
  /** True when the re-read after clear found zero remaining DTCs. */
  verified: boolean;
  /** DTCs still present after the clear (empty array means all cleared). */
  remainingDtcs: DtcResult[];
}

/**
 * Reads stored and/or pending DTCs from the ECU via mode 0x03 / 0x07,
 * then enriches each code with its SAE description when available.
 *
 * Manufacturer-specific codes (P1xxx, B1xxx, etc.) are returned without a
 * description — Claude interprets those from the raw code string.
 */
export class DtcReader {
  constructor(private readonly client: Elm327Client) {}

  async readStoredDtcs(options: SendCommandOptions = {}): Promise<Dtc[]> {
    const frame = await this.client.sendCommand('03', options);
    return parseDtcFrame(frame, false);
  }

  async readPendingDtcs(options: SendCommandOptions = {}): Promise<Dtc[]> {
    const frame = await this.client.sendCommand('07', options);
    return parseDtcFrame(frame, true);
  }

  async readDtcs(options: ReadDtcsOptions = {}): Promise<DtcResult[]> {
    const { includePending = false, locale = 'en', ...cmdOpts } = options;

    const [stored, pending] = await Promise.all([
      this.readStoredDtcs(cmdOpts),
      includePending ? this.readPendingDtcs(cmdOpts) : Promise.resolve([] as Dtc[]),
    ]);

    return [...stored, ...pending].map((dtc) => ({
      ...dtc,
      description: getDtcDescription(dtc.code, locale),
      isSaeGeneric: isSaeGenericCode(dtc.code),
    }));
  }

  /**
   * Clears all stored and pending DTCs from the ECU (OBD-II mode 0x04).
   * Re-reads after the clear to verify the operation succeeded.
   */
  async clearDtcs(options: SendCommandOptions = {}): Promise<ClearDtcsResult> {
    await this.client.sendCommand('04', options);
    const remainingDtcs = await this.readDtcs({ includePending: true, ...options });
    return { verified: remainingDtcs.length === 0, remainingDtcs };
  }
}
