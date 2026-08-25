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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { State } from 'react-native-ble-plx';
import { colors } from '@/src/theme/colors';
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
          <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl border border-accent bg-accent-soft">
            <Text className="text-[10px] font-bold tracking-[2px] text-accent">OBD</Text>
          </View>
          <Text className="text-center text-3xl font-bold text-text-primary">
            {t('onboarding.welcome.title')}
          </Text>
          <Text className="mt-3 text-center text-base leading-6 text-text-muted">
            {t('onboarding.welcome.subtitle')}
          </Text>
        </View>

        <View className="mb-8 rounded-2xl border border-accent bg-accent-soft px-5 py-4">
          <Text className="mb-1 text-[10px] font-bold tracking-[2px] text-accent">
            {t('onboarding.welcome.bleHeading').toUpperCase()}
          </Text>
          <Text className="text-sm leading-5 text-accent/80">
            {t('onboarding.welcome.bleBody')}
          </Text>
        </View>

        <Pressable
          onPress={onNext}
          className="items-center rounded-2xl bg-accent py-4 active:bg-accent-strong"
        >
          <Text className="text-base font-bold tracking-wider text-on-accent">
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
      Alert.alert(t('onboarding.pair.connectionFailed'), connectionError);
    }
  }, [connectionPhase, connectionError, retryCount, t]);

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
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-success/30 bg-success-soft">
            <View className="h-2 w-2 rounded-full bg-success" />
          </View>
          <Text className="text-center text-xl font-bold text-text-primary">
            {t('onboarding.pair.connected')}
          </Text>
          <Text className="mt-2 text-center text-sm text-text-muted" numberOfLines={1}>
            {connectedDeviceId}
          </Text>
        </View>
        <Pressable
          onPress={onNext}
          className="mb-3 items-center rounded-2xl bg-accent py-4 active:bg-accent-strong"
        >
          <Text className="text-base font-bold tracking-wider text-on-accent">
            {t('onboarding.pair.next').toUpperCase()}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="px-6 pt-2 pb-4">
        <Text className="text-2xl font-bold text-text-primary">
          {t('onboarding.pair.title')}
        </Text>
        <Text className="mt-1 text-sm text-text-muted">
          {t('onboarding.pair.subtitle')}
        </Text>
      </View>

      <View className="mx-6 mb-4 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
        <View>
          {isScanning ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={colors.accent} />
              <Text className="text-sm text-accent">
                {t('pair.scanning')}
              </Text>
            </View>
          ) : isConnecting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={colors.warning} />
              <Text className="text-sm text-warning">{t('onboarding.pair.connecting')}</Text>
            </View>
          ) : (
            <Text className="text-sm text-text-muted">
              {devices.length === 0
                ? t('onboarding.pair.noDevices')
                : t('onboarding.pair.devicesFound', { count: devices.length })}
            </Text>
          )}
          {!permissionGranted && Platform.OS === 'android' && (
            <Text className="mt-0.5 text-xs text-danger">
              {t('pair.permissionDenied')}
            </Text>
          )}
        </View>
        <Pressable
          onPress={isScanning ? stopScan : startScan}
          disabled={isConnecting}
          accessibilityRole="button"
          accessibilityLabel={isScanning ? t('pair.stop') : t('pair.scan')}
          className={`rounded-lg px-4 py-2.5 ${
            isScanning ? 'bg-surface-muted' : isConnecting ? 'bg-surface' : 'bg-accent'
          }`}
        >
          <Text
            className={`text-[11px] font-bold tracking-wider ${
              isScanning ? 'text-text-secondary' : isConnecting ? 'text-text-dim' : 'text-on-accent'
            }`}
          >
            {isScanning ? t('pair.stop') : t('pair.scan')}
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
            accessibilityRole="button"
            accessibilityLabel={`${item.name ?? t('onboarding.pair.unknownDevice')}, ${rssiLabel(item.rssi)}`}
            accessibilityState={{ selected: connectedDeviceId === item.id }}
            className="mx-6 mb-2 rounded-xl border border-border bg-surface px-4 py-3 active:bg-surface"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-sm font-semibold text-text-primary" numberOfLines={1}>
                  {item.name ?? t('onboarding.pair.unknownDevice')}
                </Text>
                <Text className="mt-0.5 text-[11px] text-text-muted" numberOfLines={1}>
                  {item.id}
                </Text>
                <Text className="mt-1 text-[11px] text-accent">
                  {rssiLabel(item.rssi)}
                </Text>
              </View>
              <View
                className={`rounded-lg px-3 py-2.5 ${
                  connectedDeviceId === item.id
                    ? 'border border-success/30 bg-success-soft'
                    : isConnecting
                      ? 'border border-warning/30 bg-warning-soft'
                      : 'bg-accent'
                }`}
              >
                {isConnecting && connectedDeviceId !== item.id ? (
                  <ActivityIndicator size="small" color={colors.warning} />
                ) : (
                  <Text
                    className={`text-[11px] font-bold tracking-wider ${
                      connectedDeviceId === item.id ? 'text-success' : 'text-on-accent'
                    }`}
                  >
                    {connectedDeviceId === item.id ? t('onboarding.pair.connectedBadge') : t('pair.connect').toUpperCase()}
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !isScanning && !isConnecting ? (
            <View className="mt-6 items-center px-8">
              <Text className="text-center text-sm text-text-muted">
                {t('onboarding.pair.emptyList')}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <View className="absolute bottom-0 left-0 right-0 bg-surface px-6 pb-6 pt-3">
        <Pressable
          onPress={onSkip}
          className="items-center rounded-2xl border border-border py-3 active:bg-surface"
        >
          <Text className="text-sm font-semibold text-text-muted">
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 pt-2">
          <Text className="text-2xl font-bold text-text-primary">
            {t('onboarding.vin.title')}
          </Text>
          <Text className="mb-6 mt-1 text-sm text-text-muted">
            {t('onboarding.vin.subtitle')}
          </Text>

          {isConnected && (
            <View className="mb-6">
              <Pressable
                onPress={handleReadVin}
                disabled={vinStatus === 'reading' || vinStatus === 'success'}
                className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${
                  vinStatus === 'success'
                    ? 'border border-success/30 bg-success-soft'
                    : vinStatus === 'reading'
                      ? 'bg-surface'
                      : 'bg-accent'
                }`}
              >
                {vinStatus === 'reading' ? (
                  <>
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                    <Text className="text-sm font-semibold text-text-muted">
                      {t('onboarding.vin.autoReading')}
                    </Text>
                  </>
                ) : vinStatus === 'success' ? (
                  <Text className="text-sm font-semibold text-success">
                    {t('onboarding.vin.autoSuccess')}
                  </Text>
                ) : (
                  <Text className="text-sm font-bold tracking-wider text-on-accent">
                    {t('onboarding.vin.readVin').toUpperCase()}
                  </Text>
                )}
              </Pressable>
              {vinStatus === 'failed' && (
                <Text className="mt-2 text-center text-xs text-danger">
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
                <Text className="mb-2 text-center text-xs text-text-muted">
                  {t('onboarding.vin.orEnterManually')}
                </Text>
              )}
              <TextInput
                value={vin}
                onChangeText={setVin}
                placeholder={t('onboarding.vin.placeholder')}
                placeholderTextColor={colors.textDim}
                autoCapitalize="characters"
                maxLength={17}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-mono text-text-primary"
              />
            </View>
          )}

          {vinStatus === 'success' && (
            <View className="mb-2 rounded-xl border border-border bg-surface px-4 py-3">
              <Text className="mb-1 text-[10px] font-bold tracking-[2px] text-text-muted">VIN</Text>
              <Text className="font-mono text-sm font-semibold text-text-primary">{vin}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View className="gap-3 px-6 pb-6">
        <Pressable
          onPress={handleContinue}
          className="items-center rounded-2xl bg-accent py-4 active:bg-accent-strong"
        >
          <Text className="text-base font-bold tracking-wider text-on-accent">
            {t('onboarding.vin.next').toUpperCase()}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSkip}
          className="items-center rounded-2xl border border-border py-3 active:bg-surface"
        >
          <Text className="text-sm font-semibold text-text-muted">
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
        <Text className="text-center text-3xl font-bold text-text-primary">
          {t('onboarding.language.title')}
        </Text>
        <Text className="mt-3 text-center text-base leading-6 text-text-muted">
          {t('onboarding.language.subtitle')}
        </Text>
      </View>

      <View className="mb-10 flex-row gap-2 rounded-2xl border border-border bg-surface p-1">
        {(['en', 'ka'] as Locale[]).map((lng) => (
          <Pressable
            key={lng}
            onPress={() => setLocale(lng)}
            accessibilityRole="radio"
            accessibilityState={{ selected: locale === lng }}
            accessibilityLabel={lng === 'en' ? 'English' : 'ქართული'}
            className={`flex-1 items-center rounded-xl py-4 ${
              locale === lng ? 'bg-accent/10' : 'bg-transparent'
            }`}
          >
            <Text
              className={`text-sm font-bold tracking-wider ${
                locale === lng ? 'text-accent' : 'text-text-muted'
              }`}
            >
              {lng === 'en' ? 'ENGLISH' : 'ქართული'}
            </Text>
            <Text
              className={`mt-1 text-[10px] tracking-widest ${
                locale === lng ? 'text-accent' : 'text-text-dim'
              }`}
            >
              {lng === 'en' ? 'EN' : 'KA'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={onFinish}
        className="items-center rounded-2xl bg-accent py-4 active:bg-accent-strong"
      >
        <Text className="text-base font-bold tracking-wider text-on-accent">
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
    router.replace('/(app)/(tabs)/(home)');
  }

  return (
    <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
      {step > 0 && (
        <View className="flex-row items-center gap-3 px-6 pb-2 pt-3">
          <Pressable
            onPress={() => setStep((s) => s - 1)}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={12}
            className="-ml-2 p-2"
          >
            <Text className="text-sm font-semibold text-accent">← {t('common.back')}</Text>
          </Pressable>
          <View className="flex-1 flex-row gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-muted'}`}
              />
            ))}
          </View>
          <Text className="text-[10px] font-semibold tracking-widest text-text-muted">
            {t('onboarding.step', { current: step + 1, total: TOTAL_STEPS })}
          </Text>
        </View>
      )}

      {step === 0 && <WelcomeStep onNext={goNext} />}
      {step === 1 && <PairStep onNext={goNext} onSkip={goNext} />}
      {step === 2 && <VinStep onNext={goNext} onSkip={goNext} />}
      {step === 3 && <LanguageStep onFinish={finish} />}
    </SafeAreaView>
  );
}
