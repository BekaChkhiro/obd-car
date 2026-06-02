import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/src/theme/colors';
import { useThresholdsStore, DEFAULT_THRESHOLDS, type ThresholdConfig } from '@/src/store/thresholds';

interface FieldProps {
  label: string;
  description: string;
  value: number;
  unit: string;
  onCommit: (v: number) => void;
}

function ThresholdField({ label, description, value, unit, onCommit }: FieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState('');

  function handleBlur(): void {
    const parsed = parseFloat(text);
    if (Number.isNaN(parsed)) {
      setError(t('thresholds.mustBeNumber'));
      setText(String(value));
      return;
    }
    setError('');
    onCommit(parsed);
  }

  return (
    <View className="mb-5">
      <Text className="text-sm font-semibold text-zinc-50">{label}</Text>
      <Text className="mt-1 text-xs text-zinc-500">{description}</Text>
      <View className="mt-3 flex-row items-stretch gap-2">
        <View
          className={`flex-1 rounded-xl border bg-zinc-950 px-3 py-2.5 ${
            error ? 'border-red-500/50' : 'border-zinc-800'
          }`}
        >
          <TextInput
            className="text-base text-zinc-50 tabular-nums"
            keyboardType="numeric"
            value={text}
            placeholderTextColor={colors.textDim}
            onChangeText={(t) => { setText(t); setError(''); }}
            onBlur={handleBlur}
          />
        </View>
        <View className="items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-4">
          <Text className="text-sm font-semibold text-zinc-400">{unit}</Text>
        </View>
      </View>
      {error ? <Text className="mt-1.5 text-xs text-red-400">{error}</Text> : null}
    </View>
  );
}

export default function ThresholdSettingsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { thresholds, updateThreshold, resetToDefaults } = useThresholdsStore();

  function update<K extends keyof ThresholdConfig>(key: K, value: ThresholdConfig[K]): void {
    updateThreshold(key, value);
  }

  function handleReset(): void {
    Alert.alert(t('thresholds.resetConfirmTitle'), t('thresholds.resetConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('thresholds.resetAction'), style: 'destructive', onPress: resetToDefaults },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text className="text-[10px] font-bold tracking-eyebrow text-zinc-500">{t('thresholds.calibration')}</Text>
      <Text className="mt-1 text-2xl font-bold text-zinc-50">{t('thresholds.title')}</Text>
      <Text className="mt-2 text-xs text-zinc-500">
        {t('thresholds.subtitle')}
      </Text>

      <View className="mt-6">
        <ThresholdField
          label={t('thresholds.coolantTemp')}
          description={t('thresholds.coolantTempDesc')}
          value={thresholds.coolantTempMax}
          unit="°C"
          onCommit={(v) => update('coolantTempMax', v)}
        />

        <ThresholdField
          label={t('thresholds.batteryVoltage')}
          description={t('thresholds.batteryVoltageDesc')}
          value={thresholds.batteryVoltageMin}
          unit="V"
          onCommit={(v) => update('batteryVoltageMin', v)}
        />

        <ThresholdField
          label={t('thresholds.fuelLevel')}
          description={t('thresholds.fuelLevelDesc')}
          value={thresholds.fuelLevelMin}
          unit="%"
          onCommit={(v) => update('fuelLevelMin', v)}
        />
      </View>

      <View className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <Text className="text-[10px] font-bold tracking-eyebrow text-zinc-500">{t('thresholds.factoryDefaults')}</Text>
        <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
          <Text className="text-[11px] text-zinc-400">
            Coolant <Text className="tabular-nums text-zinc-300">{DEFAULT_THRESHOLDS.coolantTempMax}°C</Text>
          </Text>
          <Text className="text-[11px] text-zinc-400">
            Battery <Text className="tabular-nums text-zinc-300">{DEFAULT_THRESHOLDS.batteryVoltageMin} V</Text>
          </Text>
          <Text className="text-[11px] text-zinc-400">
            Fuel <Text className="tabular-nums text-zinc-300">{DEFAULT_THRESHOLDS.fuelLevelMin}%</Text>
          </Text>
        </View>
      </View>

      <Pressable
        onPress={handleReset}
        accessibilityRole="button"
        accessibilityLabel={t('thresholds.reset')}
        className="mt-6 items-center rounded-xl border border-red-500/40 bg-red-500/5 py-3.5 active:bg-red-500/10"
      >
        <Text className="text-sm font-bold tracking-wider text-red-400">{t('thresholds.reset')}</Text>
      </Pressable>
    </ScrollView>
  );
}
