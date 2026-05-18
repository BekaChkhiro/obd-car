import type { PidReader, PidValue } from './pid-reader';
import { useDashboardStore } from '../store/dashboard';

const RPM_INTERVAL_MS = 250;
const SLOW_INTERVAL_MS = 1000;

/**
 * Polls OBD-II PIDs at independent intervals and writes live readings to
 * the dashboard store.
 *
 * RPM is polled at 250 ms; speed, coolant temp, fuel level, and battery
 * voltage share a 1 s cycle. All reads go through the Elm327Client's
 * CommandQueue so they are serialized on the single-channel ELM327 link.
 * coalesceKey prevents duplicate in-flight reads when the queue is busy.
 */
export class DashboardPoller {
  private rpmTimer: ReturnType<typeof setInterval> | null = null;
  private slowTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;

  constructor(private readonly pid: PidReader) {}

  start(): void {
    if (this.active) return;
    this.active = true;

    this.rpmTimer = setInterval(() => {
      void this.pollRpm();
    }, RPM_INTERVAL_MS);

    this.slowTimer = setInterval(() => {
      void this.pollSlow();
    }, SLOW_INTERVAL_MS);
  }

  stop(): void {
    this.active = false;
    if (this.rpmTimer !== null) {
      clearInterval(this.rpmTimer);
      this.rpmTimer = null;
    }
    if (this.slowTimer !== null) {
      clearInterval(this.slowTimer);
      this.slowTimer = null;
    }
  }

  private async pollRpm(): Promise<void> {
    try {
      const v = await this.pid.readRpm({ coalesceKey: 'dash-rpm' });
      useDashboardStore.getState().setRpm(v.value, v.unit);
    } catch {
      // Queue may be momentarily busy or adapter temporarily unavailable.
    }
  }

  private async pollSlow(): Promise<void> {
    await this.tryRead(
      () => this.pid.readSpeed({ coalesceKey: 'dash-speed' }),
      (v) => useDashboardStore.getState().setSpeed(v.value, v.unit),
    );
    await this.tryRead(
      () => this.pid.readCoolantTemp({ coalesceKey: 'dash-coolant' }),
      (v) => useDashboardStore.getState().setCoolantTemp(v.value, v.unit),
    );
    await this.tryRead(
      () => this.pid.readFuelLevel({ coalesceKey: 'dash-fuel' }),
      (v) => useDashboardStore.getState().setFuelLevel(v.value, v.unit),
    );
    await this.tryRead(
      () => this.pid.readBatteryVoltage({ coalesceKey: 'dash-battery' }),
      (v) => useDashboardStore.getState().setBatteryVoltage(v.value, v.unit),
    );
  }

  private async tryRead(
    read: () => Promise<PidValue>,
    update: (v: PidValue) => void,
  ): Promise<void> {
    try {
      update(await read());
    } catch {
      // Silently skip — ELM327 may be busy or ECU doesn't support this PID.
    }
  }
}
