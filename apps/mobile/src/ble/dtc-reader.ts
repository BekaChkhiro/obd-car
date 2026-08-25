import {
  parseDtcFrame,
  parsePermaDtcFrame,
  lookupDtc,
  type Dtc,
  type DtcLocale,
  type DtcSubsystem,
} from '@obd-car/obd-protocol';
import type { Elm327Client, SendCommandOptions } from './elm327/client';
import { Elm327Error, detectElmError } from './elm327/errors';

export type { Dtc };

/**
 * Mode 04 resets the readiness monitors as well as the codes, and ECUs take
 * their time over it — the 4 s default is short enough to time out mid-clear.
 */
const CLEAR_TIMEOUT_MS = 10_000;

export interface DtcResult extends Dtc {
  /** Description in the requested locale, or undefined when none is known. */
  description: string | undefined;
  /** True when the code number is in an SAE-standardised range. */
  isSaeGeneric: boolean;
  /**
   * True when the code is manufacturer-specific and we do not know the make,
   * so no description can be given. The caller should ask which vehicle this
   * is rather than present a definition from some other brand.
   */
  needsMake: boolean;
  /** System the code belongs to, derived from the number — always available. */
  subsystem: DtcSubsystem;
}

export interface ReadDtcsOptions extends SendCommandOptions {
  /** Include pending DTCs (mode 0x07) in addition to stored (mode 0x03). Default: false. */
  includePending?: boolean;
  /** Locale for bundled descriptions. Default: 'en'. */
  locale?: DtcLocale;
  /**
   * Vehicle make, when known (decoded from the VIN). Manufacturer-specific
   * codes resolve only with it — the same number is a different fault on a
   * different brand, so without it they are reported as undefined rather than
   * guessed.
   */
  make?: string | null;
}

export interface ClearDtcsResult {
  /** True when the re-read after clear found zero remaining DTCs. */
  verified: boolean;
  /** DTCs still present after the clear (empty array means all cleared). */
  remainingDtcs: DtcResult[];
}

/**
 * Reject an adapter response that reports a fault instead of answering.
 *
 * `sendCommand` hands back whatever came off the wire — only PID reads run
 * through the parser that recognises ELM error strings. For the DTC modes that
 * left "BUS BUSY", "STOPPED" and "?" to be parsed as a frame containing no
 * codes, so a bus that never answered was indistinguishable from a car with
 * nothing wrong.
 *
 * `NO DATA` is exempt on the read modes, where it is the ordinary way an ECU
 * says it holds no codes.
 */
function assertAnswered(command: string, frame: string, allowNoData: boolean): void {
  const kind = detectElmError(frame);
  if (kind === null) return;
  if (kind === 'no-data' && allowNoData) return;
  throw new Elm327Error(kind, `Adapter reported "${frame.trim()}" for mode ${command}`, {
    command,
    response: frame,
  });
}

function describe(dtc: Dtc, locale: DtcLocale, make: string | null | undefined): DtcResult {
  const info = lookupDtc(dtc.code, { locale, make });
  return {
    ...dtc,
    description: info.description,
    isSaeGeneric: info.isGeneric,
    needsMake: info.needsMake,
    subsystem: info.subsystem,
  };
}

/**
 * Reads stored and/or pending DTCs from the ECU and enriches each code with a
 * description when one is known.
 *
 * Manufacturer-specific codes (P1xxx, B1xxx, …) resolve only when `make` is
 * supplied. Without it they come back with `needsMake` set and no description,
 * which is the honest answer rather than a definition borrowed from whichever
 * brand happens to share the number.
 */
export class DtcReader {
  constructor(private readonly client: Elm327Client) {}

  async readStoredDtcs(options: SendCommandOptions = {}): Promise<Dtc[]> {
    const frame = await this.client.sendCommand('03', options);
    assertAnswered('03', frame, true);
    return parseDtcFrame(frame, false);
  }

  async readPendingDtcs(options: SendCommandOptions = {}): Promise<Dtc[]> {
    const frame = await this.client.sendCommand('07', options);
    assertAnswered('07', frame, true);
    return parseDtcFrame(frame, true);
  }

  async readDtcs(options: ReadDtcsOptions = {}): Promise<DtcResult[]> {
    const { includePending = false, locale = 'en', make, ...cmdOpts } = options;

    const [stored, pending] = await Promise.all([
      this.readStoredDtcs(cmdOpts),
      includePending ? this.readPendingDtcs(cmdOpts) : Promise.resolve([] as Dtc[]),
    ]);

    return [...stored, ...pending].map((dtc) => describe(dtc, locale, make));
  }

  /**
   * Reads permanent DTCs from the ECU (OBD-II mode 0x0A). Permanent DTCs
   * cannot be cleared via mode 0x04 — the ECU clears them only after a
   * successful self-verification drive cycle.
   */
  async readPermanentDtcs(options: ReadDtcsOptions = {}): Promise<DtcResult[]> {
    const { locale = 'en', make, ...cmdOpts } = options;
    const frame = await this.client.sendCommand('0A', cmdOpts);
    assertAnswered('0A', frame, true);
    return parsePermaDtcFrame(frame).map((dtc) => describe(dtc, locale, make));
  }

  /**
   * Clears all stored and pending DTCs from the ECU (OBD-II mode 0x04), then
   * re-reads to confirm it actually happened.
   *
   * The reply is checked rather than assumed. An ECU that refuses the request —
   * most often because the engine is running, which many of them require to be
   * off — answers with an error string, not silence, and treating that as
   * success is how "cleared" ends up on screen over a car whose codes are all
   * still there. `NO DATA` is a refusal here too: unlike a read, there is no
   * reading whose absence it could be reporting.
   *
   * Clearing also wipes the ECU's readiness monitors, so it can take a couple
   * of seconds and deserves a longer window than an ordinary command.
   */
  async clearDtcs(options: SendCommandOptions = {}): Promise<ClearDtcsResult> {
    const frame = await this.client.sendCommand('04', {
      timeoutMs: CLEAR_TIMEOUT_MS,
      ...options,
    });
    assertAnswered('04', frame, false);

    const remainingDtcs = await this.readDtcs({ includePending: true, ...options });
    return { verified: remainingDtcs.length === 0, remainingDtcs };
  }
}
