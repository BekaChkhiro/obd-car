import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { ConnectionPriority } from 'react-native-ble-plx';
import type { AdapterKind, ConnectionPhase } from '../store/ble';
import type { ConnectedAdapter } from './manager';
import { createElm327Client, discoverSupportedPids } from './manager';

/** Exponential back-off delays (ms) for auto-reconnect. Capped at the last value. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

/**
 * How often to prove the adapter is still there, and how many probes may fail
 * before the link is declared dead.
 *
 * Only BLE reports a dropped link on its own. A Wi-Fi dongle is reached over a
 * TCP socket that simply goes quiet when the phone leaves the car's network —
 * no close, no error — and a Classic-Bluetooth one is attached from outside
 * this machine with no disconnect signal at all. Without a probe those links
 * stay 'ready' forever, and the app keeps claiming a car it cannot reach.
 *
 * Two misses rather than one: a single command can lose out to a busy bus or a
 * momentary radio dropout, and tearing the link down for that would be worse
 * than the stale state it is meant to prevent.
 */
const HEARTBEAT_MS = 12_000;
const HEARTBEAT_MISSES_BEFORE_DEAD = 2;

/** Minimum subset of the Zustand store that ConnectionMachine needs to call. */
export interface BleStoreInterface {
  setConnectionPhase(phase: ConnectionPhase): void;
  setConnectionError(error: string | null): void;
  setRetryCount(count: number): void;
  setConnectedDeviceId(id: string | null): void;
  setScanning(scanning: boolean): void;
  upsertDevice(device: Device): void;
  clearDevices(): void;
  /** Mode-01 PIDs the ECU actually reported, e.g. ['010C','010D']. */
  setSupportedPids(pids: string[]): void;
  /** Distinguishes a real ELM327 link from an injected mock. */
  setAdapterKind(kind: AdapterKind | null): void;
  setVin(vin: string | null): void;
  setDtcCount(count: number | null): void;
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
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatMisses = 0;
  private heartbeatInFlight = false;
  private retryCount = 0;
  private disconnectSub: Subscription | null = null;
  private destroyed = false;
  private supportedPids: string[] = [];
  private vin: string | null = null;
  private dtcCount: number | null = null;
  private adapterKind: AdapterKind | null = null;
  /**
   * Incremented on every adapter teardown so an in-flight PID discovery from a
   * previous connection cannot publish its results onto the current one.
   */
  private adapterGeneration = 0;

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
      // requestMTU=247 lets ELM frames arrive in one notification instead of
      // being split across 20-byte BLE chunks (default MTU). Cheap HM-10
      // clones honor this; some ignore it silently, which is fine.
      const device = await this.ble.connectToDevice(deviceId, { requestMTU: 247 });
      await device.discoverAllServicesAndCharacteristics();

      // Ask Android to keep the link in high-priority mode (~10–20 ms
      // interval) instead of dropping to low-power mode when traffic pauses.
      // Many ELM327 clones drop the connection during the first idle window
      // if the phone slips into the default balanced interval.
      await device.requestConnectionPriority(ConnectionPriority.High).catch(() => undefined);

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
      this.setAdapterKind('real');
      this.transition('ready');
      this.startHeartbeat();

      // Ask the ECU which PIDs it actually supports. Done after 'ready' so the
      // UI is usable immediately; the result is what the AI assistant is told
      // is readable, so a guessed list here would become a fabricated claim.
      void this.refreshVehicleProfile();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.adapter = null;
      this.store.setConnectedDeviceId(null);
      this.clearAdapterMetadata();
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
  /**
   * Attach an already-connected adapter that this machine did not open itself:
   * Wi-Fi (ESP8266) and Classic-Bluetooth ELM327s, and the E2E mock.
   *
   * `kind` is explicit rather than inferred from the device id — a Wi-Fi dongle
   * talks to the same ECU a BLE one does, and quietly labelling it 'simulated'
   * would have the assistant refuse to trust real readings.
   */
  injectAdapter(
    adapter: ConnectedAdapter,
    deviceId = 'mock-adapter',
    kind: AdapterKind = 'simulated',
  ): void {
    this.cancelReconnect();
    this.cancelScanTimer();
    this.ble.stopDeviceScan();
    void this.teardownAdapter();

    this.targetDeviceId = null;
    this.adapter = adapter;
    this.store.setConnectedDeviceId(deviceId);
    this.retryCount = 0;
    this.store.setRetryCount(0);
    // Everything downstream — the dashboard banner, the AI's system prompt —
    // keys off this, so the mock must never reach here as 'real'.
    this.setAdapterKind(kind);
    this.transition('ready');
    this.startHeartbeat();

    void this.refreshVehicleProfile();
  }

  /** Intentional disconnect — clears reconnect target and stops retries. */
  async disconnect(): Promise<void> {
    this.cancelReconnect();
    this.targetDeviceId = null;
    this.retryCount = 0;
    await this.teardownAdapter();
    this.store.setConnectedDeviceId(null);
    this.clearAdapterMetadata();
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
    this.clearAdapterMetadata();
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

  /**
   * Mode-01 PIDs the ECU reported as supported, e.g. `['010C','010D']`.
   *
   * Empty until discovery completes (or when discovery failed). Empty means
   * "not known", never "none supported" — callers must not present it as a
   * statement about the vehicle.
   */
  getSupportedPids(): readonly string[] {
    return this.supportedPids;
  }

  /** VIN read from the ECU, or null when not read yet / not supported. */
  getVin(): string | null {
    return this.vin;
  }

  /** Stored codes counted on the last read, or null when not read. */
  getDtcCount(): number | null {
    return this.dtcCount;
  }

  /** `'real'` for a physical ELM327, `'simulated'` for an injected mock, null when down. */
  getAdapterKind(): AdapterKind | null {
    return this.adapterKind;
  }

  /** True only for a physical adapter on a live link — the bar for "we can read the car". */
  hasLiveVehicleLink(): boolean {
    return this.adapter !== null && this.adapterKind === 'real';
  }

  /** Tear down and stop all internal work. Call once on app teardown. */
  destroy(): void {
    this.destroyed = true;
    this.cancelReconnect();
    this.cancelScanTimer();
    void this.teardownAdapter();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Read the vehicle's identity and capabilities once the link is up: VIN
   * first, then the mode-01 availability bitmaps.
   *
   * Failure is silent by design: a null VIN and an empty PID list both read as
   * "not discovered", which is the honest answer. Guessing either would put
   * unverified facts in front of the assistant — a wrong make is how a Ford's
   * definition of a code ends up quoted at the owner of a Toyota.
   */
  private async refreshVehicleProfile(): Promise<void> {
    const generation = this.adapterGeneration;
    const adapter = this.adapter;
    if (!adapter) return;

    // VIN first: it identifies the car rather than the dongle, so it keys the
    // PID cache and tells the assistant which make's DTC table applies. A
    // failure here is ordinary — plenty of pre-2005 ECUs never implemented
    // mode 09 — so it must not stop PID discovery.
    try {
      const { vin } = await adapter.vin.readVin({ priority: 'normal' });
      if (generation !== this.adapterGeneration || this.adapter !== adapter) return;
      this.vin = vin;
      this.store.setVin(vin);
    } catch {
      if (generation !== this.adapterGeneration) return;
      this.vin = null;
      this.store.setVin(null);
    }

    // Stored codes, so the garage screen can show a count without the user
    // having to open anything. A failure leaves it null rather than zero —
    // "we did not read" and "no faults" must not look the same.
    try {
      const dtcs = await adapter.dtc.readStoredDtcs({ priority: 'normal' });
      if (generation !== this.adapterGeneration || this.adapter !== adapter) return;
      this.dtcCount = dtcs.length;
      this.store.setDtcCount(dtcs.length);
    } catch {
      if (generation !== this.adapterGeneration) return;
      this.dtcCount = null;
      this.store.setDtcCount(null);
    }

    try {
      const pids = await discoverSupportedPids(adapter.client, this.vin ?? undefined);
      // The adapter may have been torn down while discovery was in flight.
      if (generation !== this.adapterGeneration || this.adapter !== adapter) return;
      const formatted = [...pids]
        .sort((a, b) => a - b)
        .map((pid) => `01${pid.toString(16).toUpperCase().padStart(2, '0')}`);
      this.supportedPids = formatted;
      this.store.setSupportedPids(formatted);
    } catch {
      if (generation !== this.adapterGeneration) return;
      this.supportedPids = [];
      this.store.setSupportedPids([]);
    }
  }

  private setAdapterKind(kind: AdapterKind | null): void {
    this.adapterKind = kind;
    this.store.setAdapterKind(kind);
  }

  /** Drop everything derived from a link that no longer exists. */
  private clearAdapterMetadata(): void {
    this.adapterGeneration += 1;
    this.supportedPids = [];
    this.store.setSupportedPids([]);
    this.vin = null;
    this.store.setVin(null);
    this.dtcCount = null;
    this.store.setDtcCount(null);
    this.setAdapterKind(null);
  }

  private transition(phase: ConnectionPhase, error?: string): void {
    this.phase = phase;
    this.store.setConnectionPhase(phase);
    this.store.setConnectionError(error ?? null);
    // Keep the legacy isScanning flag in sync.
    this.store.setScanning(phase === 'scanning');
  }

  private handleUnexpectedDisconnect(): void {
    if (this.destroyed) return;
    // Close rather than merely drop the adapter: a BLE device that vanished has
    // nothing left to close, but a Wi-Fi one is a TCP socket this process still
    // owns, and abandoning it leaks the socket and lets late data arrive on a
    // link the app has already declared dead.
    void this.teardownAdapter();
    this.store.setConnectedDeviceId(null);
    this.clearAdapterMetadata();
    this.transition('error', 'Device disconnected unexpectedly');
    // Only a link this machine opened itself can be reopened by it. Injected
    // adapters (Wi-Fi, Classic Bluetooth) have no target, and stop here.
    if (this.targetDeviceId) this.scheduleReconnect();
  }

  /**
   * Ask the adapter to identify itself on a timer, and treat silence as death.
   *
   * `ATI` is answered by the dongle itself rather than the ECU, which is the
   * right question here: the claim being checked is that the link is up, and a
   * car with the ignition off would fail an ECU-level probe while still being
   * perfectly well connected.
   *
   * Runs at normal priority so an AI tool call in flight still goes first, and
   * skips its turn if the previous probe has not come back — on a link that is
   * already struggling, piling on more commands only makes it worse.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatMisses = 0;
    this.heartbeatTimer = setInterval(() => {
      void this.probeLink();
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatMisses = 0;
    this.heartbeatInFlight = false;
  }

  private async probeLink(): Promise<void> {
    const adapter = this.adapter;
    if (this.destroyed || this.heartbeatInFlight || !adapter) return;
    if (this.phase !== 'ready' && this.phase !== 'reading') return;

    const generation = this.adapterGeneration;
    this.heartbeatInFlight = true;
    try {
      await adapter.client.sendCommand('ATI', { retries: 0 });
      if (generation !== this.adapterGeneration) return;
      this.heartbeatMisses = 0;
    } catch {
      if (generation !== this.adapterGeneration || this.adapter !== adapter) return;
      this.heartbeatMisses += 1;
      if (this.heartbeatMisses >= HEARTBEAT_MISSES_BEFORE_DEAD) {
        this.handleUnexpectedDisconnect();
      }
    } finally {
      this.heartbeatInFlight = false;
    }
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
    this.stopHeartbeat();
    this.adapterGeneration += 1;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    if (this.adapter) {
      await this.adapter.client.close().catch(() => undefined);
      this.adapter = null;
    }
  }
}
