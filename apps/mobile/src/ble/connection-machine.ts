import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import type { ConnectionPhase } from '../store/ble';
import type { ConnectedAdapter } from './manager';
import { createElm327Client } from './manager';

/** Exponential back-off delays (ms) for auto-reconnect. Capped at the last value. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

/** Minimum subset of the Zustand store that ConnectionMachine needs to call. */
export interface BleStoreInterface {
  setConnectionPhase(phase: ConnectionPhase): void;
  setConnectionError(error: string | null): void;
  setRetryCount(count: number): void;
  setConnectedDeviceId(id: string | null): void;
  setScanning(scanning: boolean): void;
  upsertDevice(device: Device): void;
  clearDevices(): void;
  /** Returns the user-configured protocol override (0-9), or null for auto-detect. */
  getProtocolOverride(): number | null;
}

/**
 * Finite state machine for the ELM327 BLE connection lifecycle.
 *
 * States:
 *   disconnected → scanning → connecting → ready → reading → error
 *
 * Auto-reconnect: on unexpected disconnect (or a failed connect attempt) the
 * machine schedules a retry with exponential backoff, as long as a target
 * device is known. Calling disconnect() or reset() cancels pending retries.
 */
export class ConnectionMachine {
  private phase: ConnectionPhase = 'disconnected';
  private targetDeviceId: string | null = null;
  private adapter: ConnectedAdapter | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private disconnectSub: Subscription | null = null;
  private destroyed = false;

  constructor(
    private readonly store: BleStoreInterface,
    private readonly ble: BleManager,
  ) {}

  /**
   * Start BLE scan. Auto-stops after `timeout` ms (default 15 s).
   * No-op if already scanning.
   */
  startScan(timeout = 15_000): void {
    if (this.phase === 'scanning') return;
    this.transition('scanning');
    this.store.clearDevices();

    this.ble.startDeviceScan(null, { allowDuplicates: true }, (err, device) => {
      if (err) {
        this.cancelScanTimer();
        this.transition('error', err.message);
        return;
      }
      if (device) this.store.upsertDevice(device);
    });

    this.scanTimer = setTimeout(() => {
      this.ble.stopDeviceScan();
      if (this.phase === 'scanning') this.transition('disconnected');
    }, timeout);
  }

  /** Stop an in-progress scan and return to disconnected. */
  stopScan(): void {
    this.cancelScanTimer();
    this.ble.stopDeviceScan();
    if (this.phase === 'scanning') this.transition('disconnected');
  }

  /**
   * Connect to a device and run ELM327 initialisation. Stores the device ID
   * as the reconnect target. Failed attempts trigger automatic reconnect with
   * exponential backoff.
   */
  async connect(deviceId: string): Promise<void> {
    this.cancelScanTimer();
    this.ble.stopDeviceScan();
    this.cancelReconnect();

    this.targetDeviceId = deviceId;
    this.transition('connecting');

    try {
      const device = await this.ble.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      const protocolOverride = this.store.getProtocolOverride();
      const adapter = await createElm327Client(device, {
        protocolOverride: protocolOverride ?? undefined,
      });
      this.adapter = adapter;

      // Watch for unexpected BLE-level disconnects so we can auto-reconnect.
      this.disconnectSub?.remove();
      this.disconnectSub = this.ble.onDeviceDisconnected(deviceId, () => {
        this.handleUnexpectedDisconnect();
      });

      this.store.setConnectedDeviceId(deviceId);
      this.retryCount = 0;
      this.store.setRetryCount(0);
      this.transition('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.adapter = null;
      this.store.setConnectedDeviceId(null);
      this.transition('error', msg);
      this.scheduleReconnect();
    }
  }

  /**
   * Inject a pre-built ConnectedAdapter and transition straight to 'ready'.
   *
   * Used by E2E tests to skip BLE scanning/connection and drive the rest of
   * the app (chat tool executor, dashboard poller) against a mock ELM327.
   * The supplied adapter is owned by the machine afterwards — reset() /
   * disconnect() will tear it down via its `client.close()` method.
   */
  injectAdapter(adapter: ConnectedAdapter, deviceId = 'mock-adapter'): void {
    this.cancelReconnect();
    this.cancelScanTimer();
    this.ble.stopDeviceScan();
    void this.teardownAdapter();

    this.targetDeviceId = null;
    this.adapter = adapter;
    this.store.setConnectedDeviceId(deviceId);
    this.retryCount = 0;
    this.store.setRetryCount(0);
    this.transition('ready');
  }

  /** Intentional disconnect — clears reconnect target and stops retries. */
  async disconnect(): Promise<void> {
    this.cancelReconnect();
    this.targetDeviceId = null;
    this.retryCount = 0;
    await this.teardownAdapter();
    this.store.setConnectedDeviceId(null);
    this.store.setRetryCount(0);
    this.transition('disconnected');
  }

  /**
   * Signal that the app is actively polling PIDs (dashboard visible).
   * Only valid from 'ready'; ignored otherwise.
   */
  startReading(): void {
    if (this.phase !== 'ready') return;
    this.transition('reading');
  }

  /**
   * Signal that active PID polling has stopped.
   * Only valid from 'reading'; ignored otherwise.
   */
  stopReading(): void {
    if (this.phase !== 'reading') return;
    this.transition('ready');
  }

  /**
   * Hard reset: cancel all pending work, tear down the adapter, and return to
   * disconnected without scheduling a reconnect.
   */
  reset(): void {
    this.cancelReconnect();
    this.cancelScanTimer();
    this.targetDeviceId = null;
    this.retryCount = 0;
    void this.teardownAdapter();
    this.store.setConnectedDeviceId(null);
    this.store.setRetryCount(0);
    this.transition('disconnected');
  }

  /** The live ELM327 adapter, or null when not connected. */
  getAdapter(): ConnectedAdapter | null {
    return this.adapter;
  }

  /** Current state machine phase. */
  getPhase(): ConnectionPhase {
    return this.phase;
  }

  /** Tear down and stop all internal work. Call once on app teardown. */
  destroy(): void {
    this.destroyed = true;
    this.cancelReconnect();
    this.cancelScanTimer();
    void this.teardownAdapter();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private transition(phase: ConnectionPhase, error?: string): void {
    this.phase = phase;
    this.store.setConnectionPhase(phase);
    this.store.setConnectionError(error ?? null);
    // Keep the legacy isScanning flag in sync.
    this.store.setScanning(phase === 'scanning');
  }

  private handleUnexpectedDisconnect(): void {
    if (this.destroyed) return;
    this.adapter = null;
    this.store.setConnectedDeviceId(null);
    this.transition('error', 'Device disconnected unexpectedly');
    if (this.targetDeviceId) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.targetDeviceId || this.destroyed) return;
    this.cancelReconnect();
    const delay = BACKOFF_MS[Math.min(this.retryCount, BACKOFF_MS.length - 1)];
    this.retryCount += 1;
    this.store.setRetryCount(this.retryCount);
    this.reconnectTimer = setTimeout(() => {
      if (this.targetDeviceId && !this.destroyed) {
        void this.connect(this.targetDeviceId);
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cancelScanTimer(): void {
    if (this.scanTimer !== null) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  private async teardownAdapter(): Promise<void> {
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    if (this.adapter) {
      await this.adapter.client.close().catch(() => undefined);
      this.adapter = null;
    }
  }
}
