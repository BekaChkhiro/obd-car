import {
  PID_BY_ID,
  PIDS,
  decodePid,
  type PidKey,
  type PidValue,
} from '@obd-car/obd-protocol';
import { Elm327Error } from './elm327/errors';
import type { Elm327Client, SendCommandOptions } from './elm327/client';

export type { PidKey, PidValue };

export class PidReader {
  constructor(private readonly client: Elm327Client) {}

  async readPid(pidId: string, options: SendCommandOptions = {}): Promise<PidValue> {
    const normalized = pidId.toUpperCase();
    const def = PID_BY_ID[normalized];
    if (!def) {
      throw new Elm327Error('protocol', `Unknown PID "${pidId}"`, { command: pidId });
    }
    const parsed = await this.client.readPid(def.mode, def.pid, options);
    const result = decodePid(normalized, parsed.data);
    if (!result) {
      throw new Elm327Error('protocol', `Failed to decode PID "${pidId}"`, { command: pidId });
    }
    return result;
  }

  async readByKey(key: PidKey, options: SendCommandOptions = {}): Promise<PidValue> {
    const def = PIDS[key];
    const pidId = `${def.mode.toString(16).padStart(2, '0')}${def.pid.toString(16).padStart(2, '0')}`.toUpperCase();
    return this.readPid(pidId, options);
  }

  readRpm(options?: SendCommandOptions): Promise<PidValue> {
    return this.readByKey('RPM', options);
  }

  readSpeed(options?: SendCommandOptions): Promise<PidValue> {
    return this.readByKey('SPEED', options);
  }

  readCoolantTemp(options?: SendCommandOptions): Promise<PidValue> {
    return this.readByKey('COOLANT_TEMP', options);
  }

  readFuelLevel(options?: SendCommandOptions): Promise<PidValue> {
    return this.readByKey('FUEL_LEVEL', options);
  }

  readBatteryVoltage(options?: SendCommandOptions): Promise<PidValue> {
    return this.readByKey('BATTERY_VOLTAGE', options);
  }
}
