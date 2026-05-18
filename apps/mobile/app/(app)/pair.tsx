import { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { State } from 'react-native-ble-plx';
import { bleManager } from '@/src/ble/manager';
import { connectionMachine } from '@/src/ble/connection';
import { useBleStore, type ScannedDevice } from '@/src/store/ble';

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

function rssiLabel(rssi: number | null): string {
  if (rssi === null) return '—';
  if (rssi >= -60) return `${rssi} dBm (strong)`;
  if (rssi >= -75) return `${rssi} dBm (good)`;
  if (rssi >= -90) return `${rssi} dBm (weak)`;
  return `${rssi} dBm (poor)`;
}

interface DeviceRowProps {
  device: ScannedDevice;
  onConnect: (id: string) => void;
  isConnected: boolean;
  isConnecting: boolean;
}

function DeviceRow({ device, onConnect, isConnected, isConnecting }: DeviceRowProps) {
  const busy = isConnected || isConnecting;
  return (
    <View className="mx-4 mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
            {device.name ?? 'Unknown Device'}
          </Text>
          <Text className="mt-0.5 text-xs text-gray-400" numberOfLines={1}>
            {device.id}
          </Text>
          <Text className="mt-0.5 text-xs text-blue-500">{rssiLabel(device.rssi)}</Text>
        </View>
        <Pressable
          onPress={() => !busy && onConnect(device.id)}
          className={`rounded-lg px-3 py-2 ${isConnected ? 'bg-green-100' : isConnecting ? 'bg-yellow-100' : 'bg-blue-600'}`}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#ca8a04" />
          ) : (
            <Text className={`text-xs font-medium ${isConnected ? 'text-green-700' : 'text-white'}`}>
              {isConnected ? 'Connected' : 'Connect'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function PairScreen() {
  const router = useRouter();
  const { connectionPhase, connectionError, retryCount, permissionGranted, devices, connectedDeviceId } =
    useBleStore();
  const { setPermissionGranted } = useBleStore();

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
        return;
      }

      const state = await bleManager.state();
      if (state !== State.PoweredOn) {
        Alert.alert('Bluetooth is off', 'Please enable Bluetooth to scan for OBD adapters.');
        return;
      }

      startScan();
    }

    init();

    return () => {
      connectionMachine.stopScan();
    };
  }, [setPermissionGranted, startScan]);

  async function handleConnect(deviceId: string) {
    stopScan();
    try {
      await connectionMachine.connect(deviceId);
      Alert.alert('Connected', `Connected to ${deviceId}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      // connectionMachine updates the store; error message is in connectionError
    }
  }

  // Show connection error as an alert (only for user-triggered connects, not background retries)
  useEffect(() => {
    if (connectionPhase === 'error' && connectionError && retryCount === 0) {
      Alert.alert('Connection failed', connectionError);
    }
  }, [connectionPhase, connectionError, retryCount]);

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-6 pb-4">
        <Text className="text-2xl font-bold text-gray-900">Connect OBD Adapter</Text>
        <Text className="mt-1 text-sm text-gray-500">
          Make sure your ELM327 adapter is powered on and nearby.
        </Text>
      </View>

      <View className="mx-4 mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
        <View>
          {isScanning ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#2563eb" />
              <Text className="ml-2 text-sm text-blue-600">Scanning…</Text>
            </View>
          ) : isConnecting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#ca8a04" />
              <Text className="ml-2 text-sm text-yellow-600">Connecting…</Text>
            </View>
          ) : connectionPhase === 'error' && retryCount > 0 ? (
            <Text className="text-sm text-orange-600">
              Reconnecting… (attempt {retryCount})
            </Text>
          ) : (
            <Text className="text-sm text-gray-600">
              {devices.length === 0 ? 'No devices found' : `${devices.length} device(s) found`}
            </Text>
          )}
          {!permissionGranted && Platform.OS === 'android' && (
            <Text className="mt-0.5 text-xs text-red-500">Bluetooth permission denied</Text>
          )}
        </View>
        <Pressable
          onPress={isScanning ? stopScan : () => startScan()}
          disabled={isConnecting}
          className={`rounded-lg px-4 py-2 ${isScanning ? 'bg-gray-200' : isConnecting ? 'bg-gray-100' : 'bg-blue-600'}`}
        >
          <Text className={`text-sm font-medium ${isScanning ? 'text-gray-700' : isConnecting ? 'text-gray-400' : 'text-white'}`}>
            {isScanning ? 'Stop' : 'Scan'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DeviceRow
            device={item}
            onConnect={handleConnect}
            isConnected={connectedDeviceId === item.id}
            isConnecting={isConnecting && connectedDeviceId !== item.id}
          />
        )}
        ListEmptyComponent={
          !isScanning && !isConnecting ? (
            <View className="mt-12 items-center px-8">
              <Text className="text-center text-sm text-gray-400">
                No Bluetooth devices discovered. Tap Scan to search again.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}
