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
          <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl border border-cyan-500/30 bg-cyan-500/10">
            <Text className="text-[10px] font-bold tracking-[2px] text-cyan-400">OBD</Text>
          </View>
          <Text className="text-center text-3xl font-bold text-zinc-50">
            {t('onboarding.welcome.title')}
          </Text>
          <Text className="mt-3 text-center text-base leading-6 text-zinc-500">
            {t('onboarding.welcome.subtitle')}
          </Text>
        </View>

        <View className="mb-8 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-4">
          <Text className="mb-1 text-[10px] font-bold tracking-[2px] text-cyan-300">
            {t('onboarding.welcome.bleHeading').toUpperCase()}
          </Text>
          <Text className="text-sm leading-5 text-cyan-200/80">
            {t('onboarding.welcome.bleBody')}
          </Text>
        </View>

        <Pressable
          onPress={onNext}
          className="items-center rounded-2xl bg-cyan-500 py-4 active:bg-cyan-600"
        >
          <Text className="text-base font-bold tracking-wider text-zinc-950">
            {t('onboarding.welcome.next').toUpperCase()}
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
        <View className="mb-10 items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10">
            <View className="h-2 w-2 rounded-full bg-emerald-400" />
          </View>
          <Text className="text-center text-xl font-bold text-zinc-50">
            {t('onboarding.pair.connected')}
          </Text>
          <Text className="mt-2 text-center text-sm text-zinc-500" numberOfLines={1}>
            {connectedDeviceId}
          </Text>
        </View>
        <Pressable
          onPress={onNext}
          className="mb-3 items-center rounded-2xl bg-cyan-500 py-4 active:bg-cyan-600"
        >
          <Text className="text-base font-bold tracking-wider text-zinc-950">
            {t('onboarding.pair.next').toUpperCase()}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="px-6 pt-2 pb-4">
        <Text className="text-2xl font-bold text-zinc-50">
          {t('onboarding.pair.title')}
        </Text>
        <Text className="mt-1 text-sm text-zinc-500">
          {t('onboarding.pair.subtitle')}
        </Text>
      </View>

      <View className="mx-6 mb-4 flex-row items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <View>
          {isScanning ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#22d3ee" />
              <Text className="ml-2 text-sm text-cyan-300">
                {t('pair.scanning')}
              </Text>
            </View>
          ) : isConnecting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fbbf24" />
              <Text className="ml-2 text-sm text-amber-300">Connecting…</Text>
            </View>
          ) : (
            <Text className="text-sm text-zinc-400">
              {devices.length === 0
                ? 'No devices found'
                : `${devices.length} device(s) found`}
            </Text>
          )}
          {!permissionGranted && Platform.OS === 'android' && (
            <Text className="mt-0.5 text-xs text-red-400">
              Bluetooth permission denied
            </Text>
          )}
        </View>
        <Pressable
          onPress={isScanning ? stopScan : startScan}
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
            {isScanning ? 'STOP' : 'SCAN'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: ScannedDevice }) => (
          <Pressable
            onPress={() =>
              !isConnecting && connectedDeviceId !== item.id && handleConnect(item.id)
            }
            className="mx-6 mb-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 active:bg-zinc-900"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-sm font-semibold text-zinc-50" numberOfLines={1}>
                  {item.name ?? 'Unknown device'}
                </Text>
                <Text className="mt-0.5 text-[11px] text-zinc-500" numberOfLines={1}>
                  {item.id}
                </Text>
                <Text className="mt-1 text-[11px] text-cyan-400">
                  {rssiLabel(item.rssi)}
                </Text>
              </View>
              <View
                className={`rounded-lg px-3 py-2 ${
                  connectedDeviceId === item.id
                    ? 'border border-emerald-500/30 bg-emerald-500/10'
                    : isConnecting
                      ? 'border border-amber-500/30 bg-amber-500/10'
                      : 'bg-cyan-500'
                }`}
              >
                {isConnecting && connectedDeviceId !== item.id ? (
                  <ActivityIndicator size="small" color="#fbbf24" />
                ) : (
                  <Text
                    className={`text-[11px] font-bold tracking-wider ${
                      connectedDeviceId === item.id ? 'text-emerald-300' : 'text-zinc-950'
                    }`}
                  >
                    {connectedDeviceId === item.id ? 'CONNECTED' : t('pair.connect').toUpperCase()}
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !isScanning && !isConnecting ? (
            <View className="mt-6 items-center px-8">
              <Text className="text-center text-sm text-zinc-500">
                No Bluetooth devices discovered. Tap Scan to search.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <View className="absolute bottom-0 left-0 right-0 bg-[#08080a] px-6 pb-6 pt-3">
        <Pressable
          onPress={onSkip}
          className="items-center rounded-2xl border border-zinc-800 py-3 active:bg-zinc-900"
        >
          <Text className="text-sm font-semibold text-zinc-400">
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
          <Text className="text-2xl font-bold text-zinc-50">
            {t('onboarding.vin.title')}
          </Text>
          <Text className="mb-6 mt-1 text-sm text-zinc-500">
            {t('onboarding.vin.subtitle')}
          </Text>

          {isConnected && (
            <View className="mb-6">
              <Pressable
                onPress={handleReadVin}
                disabled={vinStatus === 'reading' || vinStatus === 'success'}
                className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${
                  vinStatus === 'success'
                    ? 'border border-emerald-500/30 bg-emerald-500/10'
                    : vinStatus === 'reading'
                      ? 'bg-zinc-900'
                      : 'bg-cyan-500'
                }`}
              >
                {vinStatus === 'reading' ? (
                  <>
                    <ActivityIndicator size="small" color="#a1a1aa" />
                    <Text className="ml-2 text-sm font-semibold text-zinc-400">
                      {t('onboarding.vin.autoReading')}
                    </Text>
                  </>
                ) : vinStatus === 'success' ? (
                  <Text className="text-sm font-semibold text-emerald-300">
                    {t('onboarding.vin.autoSuccess')}
                  </Text>
                ) : (
                  <Text className="text-sm font-bold tracking-wider text-zinc-950">
                    {t('onboarding.vin.readVin').toUpperCase()}
                  </Text>
                )}
              </Pressable>
              {vinStatus === 'failed' && (
                <Text className="mt-2 text-center text-xs text-red-400">
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
                <Text className="mb-2 text-center text-xs text-zinc-500">
                  {t('onboarding.vin.orEnterManually')}
                </Text>
              )}
              <TextInput
                value={vin}
                onChangeText={setVin}
                placeholder={t('onboarding.vin.placeholder')}
                placeholderTextColor="#52525b"
                autoCapitalize="characters"
                maxLength={17}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm font-mono text-zinc-50"
              />
            </View>
          )}

          {vinStatus === 'success' && (
            <View className="mb-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <Text className="mb-1 text-[10px] font-bold tracking-[2px] text-zinc-500">VIN</Text>
              <Text className="font-mono text-sm font-semibold text-zinc-50">{vin}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View className="gap-3 px-6 pb-6">
        <Pressable
          onPress={handleContinue}
          className="items-center rounded-2xl bg-cyan-500 py-4 active:bg-cyan-600"
        >
          <Text className="text-base font-bold tracking-wider text-zinc-950">
            {t('onboarding.vin.next').toUpperCase()}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSkip}
          className="items-center rounded-2xl border border-zinc-800 py-3 active:bg-zinc-900"
        >
          <Text className="text-sm font-semibold text-zinc-400">
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
      <View className="mb-10 items-center">
        <Text className="text-center text-3xl font-bold text-zinc-50">
          {t('onboarding.language.title')}
        </Text>
        <Text className="mt-3 text-center text-base leading-6 text-zinc-500">
          {t('onboarding.language.subtitle')}
        </Text>
      </View>

      <View className="mb-10 flex-row gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1">
        {(['en', 'ka'] as Locale[]).map((lng) => (
          <Pressable
            key={lng}
            onPress={() => setLocale(lng)}
            className={`flex-1 items-center rounded-xl py-5 ${
              locale === lng ? 'bg-zinc-100' : 'bg-transparent'
            }`}
          >
            <Text
              className={`text-sm font-bold tracking-wider ${
                locale === lng ? 'text-zinc-950' : 'text-zinc-400'
              }`}
            >
              {lng === 'en' ? 'ENGLISH' : 'ქართული'}
            </Text>
            <Text
              className={`mt-1 text-[10px] tracking-widest ${
                locale === lng ? 'text-zinc-600' : 'text-zinc-600'
              }`}
            >
              {lng === 'en' ? 'EN' : 'KA'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={onFinish}
        className="items-center rounded-2xl bg-cyan-500 py-4 active:bg-cyan-600"
      >
        <Text className="text-base font-bold tracking-wider text-zinc-950">
          {t('onboarding.language.finish').toUpperCase()}
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
    <View className="flex-1 bg-[#08080a]">
      {step > 0 && (
        <View className="flex-row items-center gap-3 px-6 pb-2 pt-5">
          <Pressable onPress={() => setStep((s) => s - 1)}>
            <Text className="text-sm font-semibold text-cyan-400">← Back</Text>
          </Pressable>
          <View className="flex-1 flex-row gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-cyan-400' : 'bg-zinc-800'}`}
              />
            ))}
          </View>
          <Text className="text-[10px] font-semibold tracking-widest text-zinc-500">
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
