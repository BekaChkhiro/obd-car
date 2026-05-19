import { parseVinFrame } from '@obd-car/obd-protocol';
import { Elm327Error } from './elm327/errors';
import type { Elm327Client, SendCommandOptions } from './elm327/client';

export interface VinResult {
  vin: string;
}

export class VinReader {
  constructor(private readonly client: Elm327Client) {}

  async readVin(options: SendCommandOptions = {}): Promise<VinResult> {
    const frame = await this.client.sendCommand('0902', options);
    const vin = parseVinFrame(frame);
    if (!vin) {
      throw new Elm327Error('protocol', 'ECU returned no VIN data', { command: '0902' });
    }
    return { vin };
  }
}
