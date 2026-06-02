import { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { State } from 'react-native-ble-plx';
import { bleManager, createWifiElm327Client, createClassicElm327Client } from '@/src/ble/manager';
import { getPairedClassicDevices } from '@/src/ble/elm327';
import { connectionMachine } from '@/src/ble/connection';
import { createMockAdapter } from '@/src/ble/mock-adapter';
import { useBleStore, type ScannedDevice } from '@/src/store/ble';

type TransportTab = 'ble' | 'classic' | 'wifi';

async function requestAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);

  if (apiLevel >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function rssiBars(rssi: number | null): { bars: number; label: string; tone: string } {
  if (rssi === null) return { bars: 0, label: '—', tone: 'text-zinc-600' };
  if (rssi >= -60) return { bars: 4, label: 'strong', tone: 'text-emerald-400' };
  if (rssi >= -75) return { bars: 3, label: 'good', tone: 'text-cyan-400' };
  if (rssi >= -90) return { bars: 2, label: 'weak', tone: 'text-amber-400' };
  return { bars: 1, label: 'poor', tone: 'text-red-400' };
}

function SignalBars({ rssi }: { rssi: number | null }) {
  const { bars, tone } = rssiBars(rssi);
  return (
    <View className="flex-row items-end gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          className={`w-1 rounded-sm ${i <= bars ? tone.replace('text-', 'bg-') : 'bg-zinc-800'}`}
          style={{ height: 4 + i * 2 }}
        />
      ))}
    </View>
  );
}

interface DeviceRowProps {
  device: ScannedDevice;
  onConnect: (id: string) => void;
  isConnected: boolean;
  isConnecting: boolean;
  /** True when another device on the list is being connected to. */
  isOtherBusy?: boolean;
}

function DeviceRow({
  device,
  onConnect,
  isConnected,
  isConnecting,
  isOtherBusy = false,
}: DeviceRowProps) {
  const busy = isConnected || isConnecting || isOtherBusy;
  const sig = rssiBars(device.rssi);
  return (
    <Pressable
      onPress={() => !busy && onConnect(device.id)}
      className={`mx-4 mb-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 ${
        isOtherBusy ? 'opacity-40' : 'active:bg-zinc-900'
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-sm font-semibold text-zinc-50" numberOfLines={1}>
            {device.name ?? 'Unknown device'}
          </Text>
          <Text className="mt-0.5 text-[11px] text-zinc-500" numberOfLines={1}>
            {device.id}
          </Text>
          <View className="mt-1.5 flex-row items-center gap-2">
            <SignalBars rssi={device.rssi} />
            <Text className={`text-[11px] ${sig.tone}`}>
              {device.rssi ?? '—'} dBm · {sig.label}
            </Text>
          </View>
        </View>
        <View
          className={`rounded-lg px-3 py-2 ${
            isConnected
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : isConnecting
                ? 'bg-amber-500/10 border border-amber-500/30'
                : isOtherBusy
                  ? 'border border-zinc-800 bg-zinc-900'
                  : 'bg-cyan-500'
          }`}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#fbbf24" />
          ) : (
            <Text
              className={`text-[11px] font-semibold tracking-wider ${
                isConnected
                  ? 'text-emerald-300'
                  : isOtherBusy
                    ? 'text-zinc-600'
                    : 'text-zinc-950'
              }`}
            >
              {isConnected ? 'CONNECTED' : 'CONNECT'}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

interface TabButtonProps {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}

function TabButton({ label, hint, active, onPress }: TabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-lg px-2 py-2.5 ${
        active ? 'bg-zinc-100' : 'bg-transparent'
      }`}
    >
      <Text
        className={`text-[11px] font-bold tracking-wider ${
          active ? 'text-zinc-950' : 'text-zinc-400'
        }`}
      >
        {label}
      </Text>
      <Text
        className={`mt-0.5 text-[9px] ${
          active ? 'text-zinc-600' : 'text-zinc-600'
        }`}
      >
        {hint}
      </Text>
    </Pressable>
  );
}

export default function PairScreen() {
  const router = useRouter();
  const { connectionPhase, connectionError, retryCount, permissionGranted, devices, connectedDeviceId } =
    useBleStore();
  const { setPermissionGranted } = useBleStore();
  const { t } = useTranslation();

  const [tab, setTab] = useState<TransportTab>('ble');
  // Tracks the device the user explicitly tapped so the spinner only renders
  // on that row — without this, every other device shows "Connecting…" while
  // one is being attempted.
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);

  const isScanning = connectionPhase === 'scanning';
  const isConnecting = connectionPhase === 'connecting';

  const startScan = useCallback(() => {
    connectionMachine.startScan();
  }, []);

  const stopScan = useCallback(() => {
    connectionMachine.stopScan();
  }, []);

  useEffect(() => {
    async function init() {
      const granted = await requestAndroidBlePermissions();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert(
          'Bluetooth permission required',
          'Please grant Bluetooth permissions in Settings to scan for OBD adapters.',
        );
      }
    }
    init();
    return () => {
      connectionMachine.stopScan();
    };
  }, [setPermissionGranted]);

  useEffect(() => {
    if (tab !== 'ble') {
      stopScan();
      return;
    }
    if (!permissionGranted) return;
    (async () => {
      const state = await bleManager.state();
      if (state !== State.PoweredOn) {
        Alert.alert('Bluetooth is off', 'Please enable Bluetooth to scan for OBD adapters.');
        return;
      }
      startScan();
    })();
  }, [tab, permissionGranted, startScan, stopScan]);

  async function handleConnect(deviceId: string) {
    stopScan();
    setPendingDeviceId(deviceId);
    try {
      await connectionMachine.connect(deviceId);
      router.replace('/(app)/dashboard');
    } catch {
      // connectionMachine updates the store; error message is in connectionError
    } finally {
      setPendingDeviceId(null);
    }
  }

  async function handleConnectMock() {
    stopScan();
    try {
      const adapter = await createMockAdapter();
      connectionMachine.injectAdapter(adapter, 'mock-adapter');
      router.replace('/(app)/dashboard');
    } catch (err) {
      Alert.alert('Mock adapter failed', err instanceof Error ? err.message : String(err));
    }
  }

  const [wifiHost, setWifiHost] = useState('192.168.0.10');
  const [wifiPort, setWifiPort] = useState('35000');
  const [wifiConnecting, setWifiConnecting] = useState(false);

  type ClassicDevice = { address: string; name: string };
  const [classicDevices, setClassicDevices] = useState<ClassicDevice[]>([]);
  const [classicConnecting, setClassicConnecting] = useState(false);

  const loadClassicDevices = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const paired = await getPairedClassicDevices();
      setClassicDevices(
        paired.map((d: { address: string; name: string | null }) => ({
          address: d.address,
          name: d.name ?? d.address,
        })),
      );
    } catch (err) {
      Alert.alert('Bluetooth list failed', err instanceof Error ? err.message : String(err));
    }
  }, []);

  async function handleConnectClassic(address: string) {
    setClassicConnecting(true);
    try {
      const adapter = await createClassicElm327Client({ address });
      connectionMachine.injectAdapter(adapter, `classic:${address}`);
      router.replace('/(app)/dashboard');
    } catch (err) {
      Alert.alert('Classic connect failed', err instanceof Error ? err.message : String(err));
    } finally {
      setClassicConnecting(false);
    }
  }

  useEffect(() => {
    if (tab === 'classic' && Platform.OS === 'android') {
      loadClassicDevices();
    }
  }, [tab, loadClassicDevices]);

  async function handleConnectWifi() {
    stopScan();
    const portNum = parseInt(wifiPort, 10);
    if (!wifiHost || Number.isNaN(portNum)) {
      Alert.alert('Invalid', 'Enter a valid host and port (e.g. 192.168.0.10 / 35000).');
      return;
    }
    setWifiConnecting(true);
    try {
      const adapter = await createWifiElm327Client({
        config: { host: wifiHost, port: portNum },
      });
      connectionMachine.injectAdapter(adapter, `wifi:${wifiHost}:${portNum}`);
      router.replace('/(app)/dashboard');
    } catch (err) {
      Alert.alert('WiFi connect failed', err instanceof Error ? err.message : String(err));
    } finally {
      setWifiConnecting(false);
    }
  }

  useEffect(() => {
    if (connectionPhase === 'error' && connectionError && retryCount === 0) {
      Alert.alert('Connection failed', connectionError);
    }
  }, [connectionPhase, connectionError, retryCount]);

  // Only surface named adapters — unnamed entries are usually phones, beacons,
  // or accessory peripherals that the user can't connect to anyway.
  const namedDevices = devices.filter(
    (d) => typeof d.name === 'string' && d.name.trim().length > 0,
  );

  const statusLine = isScanning
    ? { dot: 'bg-cyan-400', tone: 'text-cyan-300', text: t('pair.scanningBle') }
    : isConnecting
      ? { dot: 'bg-amber-400', tone: 'text-amber-300', text: t('pair.connectingProbing') }
      : connectionPhase === 'error' && retryCount > 0
        ? { dot: 'bg-orange-400', tone: 'text-orange-300', text: t('pair.reconnectingAttempt', { count: retryCount }) }
        : { dot: 'bg-zinc-600', tone: 'text-zinc-400', text: t('pair.devicesFound', { count: namedDevices.length }) };

  return (
    <View className="flex-1 bg-[#08080a]">
      <View className="px-5 pt-4 pb-3">
        <Text className="text-[10px] font-bold tracking-[3px] text-zinc-500">
          {t('pair.brand')}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-zinc-50">{t('pair.header')}</Text>
        <Text className="mt-1 text-xs text-zinc-500">
          {t('pair.intro')}
        </Text>
      </View>

      <View className="mx-5 mb-3 flex-row gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
        <TabButton label="BLE" hint="HM-10 clones" active={tab === 'ble'} onPress={() => setTab('ble')} />
        <TabButton
          label="BT CLASSIC"
          hint="HC-05 clones"
          active={tab === 'classic'}
          onPress={() => setTab('classic')}
        />
        <TabButton label="WIFI" hint="ESP8266" active={tab === 'wifi'} onPress={() => setTab('wifi')} />
      </View>

      <Pressable
        testID="connect-mock-adapter"
        onPress={handleConnectMock}
        className="mx-5 mb-4 flex-row items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 active:bg-violet-500/20"
      >
        <View>
          <Text className="text-xs font-semibold text-violet-200">{t('pair.demoMode')}</Text>
          <Text className="mt-0.5 text-[11px] text-violet-300/70">
            {t('pair.demoModeHint')}
          </Text>
        </View>
        <Text className="text-xs font-semibold text-violet-300">{t('pair.run')}</Text>
      </Pressable>

      {tab === 'ble' && (
        <>
          <View className="mx-5 mb-3 flex-row items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <View className="flex-row items-center gap-3">
              <View className={`h-2 w-2 rounded-full ${statusLine.dot}`} />
              <View>
                <Text className={`text-xs font-medium ${statusLine.tone}`}>{statusLine.text}</Text>
                {!permissionGranted && Platform.OS === 'android' && (
                  <Text className="mt-0.5 text-[10px] text-red-400">
                    {t('pair.permissionDenied')}
                  </Text>
                )}
              </View>
            </View>
            <Pressable
              onPress={isScanning ? stopScan : () => startScan()}
              disabled={isConnecting}
              className={`rounded-lg px-3 py-2 ${
                isScanning ? 'bg-zinc-800' : isConnecting ? 'bg-zinc-900' : 'bg-cyan-500'
              }`}
            >
              <Text
                className={`text-[11px] font-bold tracking-wider ${
                  isScanning ? 'text-zinc-300' : isConnecting ? 'text-zinc-600' : 'text-zinc-950'
                }`}
              >
                {isScanning ? t('pair.stop') : t('pair.scan')}
              </Text>
            </Pressable>
          </View>

          <FlatList
            data={namedDevices}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <DeviceRow
                device={item}
                onConnect={handleConnect}
                isConnected={connectedDeviceId === item.id}
                isConnecting={pendingDeviceId === item.id && isConnecting}
                isOtherBusy={
                  pendingDeviceId !== null && pendingDeviceId !== item.id
                }
              />
            )}
            ListEmptyComponent={
              !isScanning && !isConnecting ? (
                <View className="mt-12 items-center px-10">
                  <Text className="text-center text-sm text-zinc-400">
                    {t('pair.noBleFound')}
                  </Text>
                  <Text className="mt-2 text-center text-xs text-zinc-600">
                    {t('pair.noBleHint')}
                  </Text>
                </View>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        </>
      )}

      {tab === 'classic' && (
        <View className="mx-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">
              {t('pair.pairedAdapters')}
            </Text>
            <Pressable onPress={loadClassicDevices} className="rounded-md bg-zinc-800 px-2 py-1">
              <Text className="text-[10px] font-semibold text-zinc-300">{t('pair.refresh')}</Text>
            </Pressable>
          </View>

          {Platform.OS !== 'android' ? (
            <Text className="text-xs text-zinc-500">
              {t('pair.classicIosNote')}
            </Text>
          ) : (
            <>
              <Text className="mb-4 text-xs text-zinc-500">
                {t('pair.pairFirst')}
              </Text>
              {classicDevices.length === 0 ? (
                <View className="items-center py-6">
                  <Text className="text-xs text-zinc-600">{t('pair.noPaired')}</Text>
                </View>
              ) : (
                classicDevices.map((d) => (
                  <Pressable
                    key={d.address}
                    onPress={() => handleConnectClassic(d.address)}
                    disabled={classicConnecting}
                    className={`mb-2 flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                      classicConnecting
                        ? 'border-zinc-800 bg-zinc-900'
                        : 'border-indigo-500/30 bg-indigo-500/10 active:bg-indigo-500/20'
                    }`}
                  >
                    <View>
                      <Text className="text-sm font-semibold text-zinc-50">{d.name}</Text>
                      <Text className="mt-0.5 text-[11px] text-zinc-500">{d.address}</Text>
                    </View>
                    <Text className="text-[11px] font-bold tracking-wider text-indigo-300">
                      {t('pair.connectArrow')}
                    </Text>
                  </Pressable>
                ))
              )}
              {classicConnecting && (
                <View className="mt-2 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#a5b4fc" />
                  <Text className="text-xs text-indigo-300">{t('pair.initializing')}</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {tab === 'wifi' && (
        <View className="mx-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">
            {t('pair.wifiAdapter')}
          </Text>
          <Text className="mt-2 text-xs text-zinc-500">
            {t('pair.wifiHint')}
          </Text>

          <View className="mt-4 flex-row gap-2">
            <View className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
              <Text className="text-[9px] font-bold tracking-widest text-zinc-600">{t('pair.host')}</Text>
              <TextInput
                value={wifiHost}
                onChangeText={setWifiHost}
                placeholder="192.168.0.10"
                placeholderTextColor="#52525b"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                className="mt-0.5 text-sm text-zinc-50"
              />
            </View>
            <View className="w-24 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
              <Text className="text-[9px] font-bold tracking-widest text-zinc-600">{t('pair.port')}</Text>
              <TextInput
                value={wifiPort}
                onChangeText={setWifiPort}
                placeholder="35000"
                placeholderTextColor="#52525b"
                keyboardType="number-pad"
                className="mt-0.5 text-sm text-zinc-50"
              />
            </View>
          </View>

          <Pressable
            onPress={handleConnectWifi}
            disabled={wifiConnecting}
            className={`mt-4 items-center rounded-xl py-3 ${
              wifiConnecting ? 'bg-zinc-800' : 'bg-emerald-500 active:bg-emerald-600'
            }`}
          >
            {wifiConnecting ? (
              <ActivityIndicator color="#fafafa" />
            ) : (
              <Text className="text-sm font-bold tracking-wider text-zinc-950">
                {t('pair.connectWifi')}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
