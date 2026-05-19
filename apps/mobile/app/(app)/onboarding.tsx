import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { State } from 'react-native-ble-plx';
import { bleManager } from '@/src/ble/manager';
import { connectionMachine } from '@/src/ble/connection';
import { useBleStore, type ScannedDevice } from '@/src/store/ble';
import { useOnboardingStore } from '@/src/store/onboarding';
import { useLocaleStore, type Locale } from '@/src/store/locale';

const TOTAL_STEPS = 4;

async function requestAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const apiLevel =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(Platform.Version, 10);
  if (apiLevel >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED,
    );
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function rssiLabel(rssi: number | null): string {
  if (rssi === null) return '—';
  if (rssi >= -60) return `${rssi} dBm`;
  if (rssi >= -75) return `${rssi} dBm`;
  return `${rssi} dBm`;
}

// ── Step 0: Welcome + BLE ─────────────────────────────────────────────────────

interface WelcomeStepProps {
  onNext: () => void;
}

function WelcomeStep({ onNext }: WelcomeStepProps) {
  const { t } = useTranslation();
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      <View className="flex-1 justify-center px-8">
        <View className="items-center mb-10">
          <View className="w-20 h-20 rounded-2xl bg-blue-600 items-center justify-center mb-6">
            <Text className="text-4xl">🚗</Text>
          </View>
          <Text className="text-3xl font-bold text-gray-900 text-center">
            {t('onboarding.welcome.title')}
          </Text>
          <Text className="mt-3 text-base text-gray-500 text-center leading-6">
            {t('onboarding.welcome.subtitle')}
          </Text>
        </View>

        <View className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 mb-8">
          <Text className="text-sm font-semibold text-blue-800 mb-1">
            {t('onboarding.welcome.bleHeading')}
          </Text>
          <Text className="text-sm text-blue-700 leading-5">
            {t('onboarding.welcome.bleBody')}
          </Text>
        </View>

        <Pressable
          onPress={onNext}
          className="rounded-2xl bg-blue-600 py-4 items-center"
        >
          <Text className="text-base font-semibold text-white">
            {t('onboarding.welcome.next')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ── Step 1: Pair adapter ──────────────────────────────────────────────────────

interface PairStepProps {
  onNext: () => void;
  onSkip: () => void;
}

function PairStep({ onNext, onSkip }: PairStepProps) {
  const { t } = useTranslation();
  const {
    connectionPhase,
    connectionError,
    retryCount,
    permissionGranted,
    devices,
    connectedDeviceId,
    setPermissionGranted,
  } = useBleStore();

  const isScanning = connectionPhase === 'scanning';
  const isConnecting = connectionPhase === 'connecting';
  const isReady = connectionPhase === 'ready' || connectionPhase === 'reading';

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
      if (!granted) return;
      const state = await bleManager.state();
      if (state !== State.PoweredOn) return;
      startScan();
    }
    void init();
    return () => {
      connectionMachine.stopScan();
    };
  }, [setPermissionGranted, startScan]);

  useEffect(() => {
    if (connectionPhase === 'error' && connectionError && retryCount === 0) {
      Alert.alert('Connection failed', connectionError);
    }
  }, [connectionPhase, connectionError, retryCount]);

  async function handleConnect(deviceId: string) {
    stopScan();
    try {
      await connectionMachine.connect(deviceId);
    } catch {
      // connectionMachine updates store; error shown via useEffect above
    }
  }

  if (isReady && connectedDeviceId) {
    return (
      <View className="flex-1 justify-center px-8">
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-2xl bg-green-100 items-center justify-center mb-4">
            <Text className="text-3xl">✓</Text>
          </View>
          <Text className="text-xl font-bold text-gray-900 text-center">
            {t('onboarding.pair.connected')}
          </Text>
          <Text className="mt-2 text-sm text-gray-400 text-center" numberOfLines={1}>
            {connectedDeviceId}
          </Text>
        </View>
        <Pressable
          onPress={onNext}
          className="rounded-2xl bg-blue-600 py-4 items-center mb-3"
        >
          <Text className="text-base font-semibold text-white">
            {t('onboarding.pair.next')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="px-6 pt-2 pb-4">
        <Text className="text-2xl font-bold text-gray-900">
          {t('onboarding.pair.title')}
        </Text>
        <Text className="mt-1 text-sm text-gray-500">
          {t('onboarding.pair.subtitle')}
        </Text>
      </View>

      <View className="mx-6 mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
        <View>
          {isScanning ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#2563eb" />
              <Text className="ml-2 text-sm text-blue-600">
                {t('pair.scanning')}
              </Text>
            </View>
          ) : isConnecting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#ca8a04" />
              <Text className="ml-2 text-sm text-yellow-600">Connecting…</Text>
            </View>
          ) : (
            <Text className="text-sm text-gray-600">
              {devices.length === 0
                ? 'No devices found'
                : `${devices.length} device(s) found`}
            </Text>
          )}
          {!permissionGranted && Platform.OS === 'android' && (
            <Text className="mt-0.5 text-xs text-red-500">
              Bluetooth permission denied
            </Text>
          )}
        </View>
        <Pressable
          onPress={isScanning ? stopScan : startScan}
          disabled={isConnecting}
          className={`rounded-lg px-4 py-2 ${isScanning ? 'bg-gray-200' : isConnecting ? 'bg-gray-100' : 'bg-blue-600'}`}
        >
          <Text
            className={`text-sm font-medium ${isScanning ? 'text-gray-700' : isConnecting ? 'text-gray-400' : 'text-white'}`}
          >
            {isScanning ? 'Stop' : 'Scan'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: ScannedDevice }) => (
          <View className="mx-6 mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text
                  className="text-sm font-semibold text-gray-900"
                  numberOfLines={1}
                >
                  {item.name ?? 'Unknown Device'}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-400" numberOfLines={1}>
                  {item.id}
                </Text>
                <Text className="mt-0.5 text-xs text-blue-500">
                  {rssiLabel(item.rssi)}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  !isConnecting && connectedDeviceId !== item.id && handleConnect(item.id)
                }
                className={`rounded-lg px-3 py-2 ${connectedDeviceId === item.id ? 'bg-green-100' : isConnecting ? 'bg-yellow-100' : 'bg-blue-600'}`}
              >
                {isConnecting && connectedDeviceId !== item.id ? (
                  <ActivityIndicator size="small" color="#ca8a04" />
                ) : (
                  <Text
                    className={`text-xs font-medium ${connectedDeviceId === item.id ? 'text-green-700' : 'text-white'}`}
                  >
                    {connectedDeviceId === item.id
                      ? 'Connected'
                      : t('pair.connect')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !isScanning && !isConnecting ? (
            <View className="mt-6 items-center px-8">
              <Text className="text-center text-sm text-gray-400">
                No Bluetooth devices discovered. Tap Scan to search.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <View className="absolute bottom-0 left-0 right-0 px-6 pb-6 bg-gray-50">
        <Pressable
          onPress={onSkip}
          className="rounded-2xl border border-gray-300 py-3 items-center"
        >
          <Text className="text-sm font-medium text-gray-600">
            {t('onboarding.pair.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Step 2: VIN ───────────────────────────────────────────────────────────────

type VinStatus = 'idle' | 'reading' | 'success' | 'failed';

interface VinStepProps {
  onNext: (vin: string) => void;
  onSkip: () => void;
}

function VinStep({ onNext, onSkip }: VinStepProps) {
  const { t } = useTranslation();
  const connectedDeviceId = useBleStore((s) => s.connectedDeviceId);
  const [vinStatus, setVinStatus] = useState<VinStatus>('idle');
  const [vin, setVin] = useState('');

  const isConnected = !!connectedDeviceId;

  async function handleReadVin() {
    const adapter = connectionMachine.getAdapter();
    if (!adapter) return;
    setVinStatus('reading');
    try {
      const result = await adapter.vin.readVin();
      setVin(result.vin);
      setVinStatus('success');
    } catch {
      setVinStatus('failed');
    }
  }

  function handleContinue() {
    onNext(vin.trim());
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 pt-2">
          <Text className="text-2xl font-bold text-gray-900">
            {t('onboarding.vin.title')}
          </Text>
          <Text className="mt-1 text-sm text-gray-500 mb-6">
            {t('onboarding.vin.subtitle')}
          </Text>

          {isConnected && (
            <View className="mb-6">
              <Pressable
                onPress={handleReadVin}
                disabled={vinStatus === 'reading' || vinStatus === 'success'}
                className={`rounded-xl py-3 px-4 items-center flex-row justify-center gap-2 ${
                  vinStatus === 'success'
                    ? 'bg-green-100'
                    : vinStatus === 'reading'
                      ? 'bg-gray-100'
                      : 'bg-blue-600'
                }`}
              >
                {vinStatus === 'reading' ? (
                  <>
                    <ActivityIndicator size="small" color="#6b7280" />
                    <Text className="ml-2 text-sm font-medium text-gray-600">
                      {t('onboarding.vin.autoReading')}
                    </Text>
                  </>
                ) : vinStatus === 'success' ? (
                  <Text className="text-sm font-medium text-green-700">
                    {t('onboarding.vin.autoSuccess')}
                  </Text>
                ) : (
                  <Text className="text-sm font-medium text-white">
                    {t('onboarding.vin.readVin')}
                  </Text>
                )}
              </Pressable>
              {vinStatus === 'failed' && (
                <Text className="mt-2 text-xs text-red-500 text-center">
                  {t('onboarding.vin.autoFailed')}
                </Text>
              )}
            </View>
          )}

          {(isConnected
            ? vinStatus === 'failed' || vinStatus === 'idle'
            : true) && (
            <View className="mb-2">
              {isConnected && (
                <Text className="text-xs text-gray-400 mb-2 text-center">
                  {t('onboarding.vin.orEnterManually')}
                </Text>
              )}
              <TextInput
                value={vin}
                onChangeText={setVin}
                placeholder={t('onboarding.vin.placeholder')}
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                maxLength={17}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900"
              />
            </View>
          )}

          {vinStatus === 'success' && (
            <View className="rounded-xl border border-gray-200 bg-white px-4 py-3 mb-2">
              <Text className="text-xs text-gray-400 mb-0.5">VIN</Text>
              <Text className="text-sm font-mono font-semibold text-gray-900">
                {vin}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View className="px-6 pb-6 gap-3">
        <Pressable
          onPress={handleContinue}
          className="rounded-2xl bg-blue-600 py-4 items-center"
        >
          <Text className="text-base font-semibold text-white">
            {t('onboarding.vin.next')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSkip}
          className="rounded-2xl border border-gray-300 py-3 items-center"
        >
          <Text className="text-sm font-medium text-gray-600">
            {t('onboarding.vin.skip')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Step 3: Language ──────────────────────────────────────────────────────────

interface LanguageStepProps {
  onFinish: () => void;
}

function LanguageStep({ onFinish }: LanguageStepProps) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocaleStore();

  return (
    <View className="flex-1 justify-center px-8">
      <View className="items-center mb-10">
        <Text className="text-3xl font-bold text-gray-900 text-center">
          {t('onboarding.language.title')}
        </Text>
        <Text className="mt-3 text-base text-gray-500 text-center leading-6">
          {t('onboarding.language.subtitle')}
        </Text>
      </View>

      <View className="flex-row rounded-2xl border border-gray-200 overflow-hidden mb-10">
        {(['en', 'ka'] as Locale[]).map((lng) => (
          <Pressable
            key={lng}
            onPress={() => setLocale(lng)}
            className={`flex-1 py-5 items-center ${locale === lng ? 'bg-blue-600' : 'bg-white'}`}
          >
            <Text
              className={`text-xl font-bold mb-1 ${locale === lng ? 'text-white' : 'text-gray-700'}`}
            >
              {lng === 'en' ? '🇬🇧' : '🇬🇪'}
            </Text>
            <Text
              className={`text-sm font-semibold ${locale === lng ? 'text-white' : 'text-gray-700'}`}
            >
              {lng === 'en' ? 'English' : 'ქართული'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={onFinish}
        className="rounded-2xl bg-blue-600 py-4 items-center"
      >
        <Text className="text-base font-semibold text-white">
          {t('onboarding.language.finish')}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { markOnboarded } = useOnboardingStore();
  const [step, setStep] = useState(0);

  function goNext() {
    setStep((s) => s + 1);
  }

  function finish() {
    markOnboarded();
    router.replace('/(app)/');
  }

  return (
    <View className="flex-1 bg-gray-50">
      {step > 0 && (
        <View className="flex-row items-center px-6 pt-4 pb-2 gap-3">
          <Pressable onPress={() => setStep((s) => s - 1)}>
            <Text className="text-sm text-blue-600">← Back</Text>
          </Pressable>
          <View className="flex-1 flex-row gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
              />
            ))}
          </View>
          <Text className="text-xs text-gray-400">
            {t('onboarding.step', { current: step + 1, total: TOTAL_STEPS })}
          </Text>
        </View>
      )}

      {step === 0 && <WelcomeStep onNext={goNext} />}
      {step === 1 && <PairStep onNext={goNext} onSkip={goNext} />}
      {step === 2 && <VinStep onNext={goNext} onSkip={goNext} />}
      {step === 3 && <LanguageStep onFinish={finish} />}
    </View>
  );
}
