import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { useThresholdsStore, DEFAULT_THRESHOLDS, type ThresholdConfig } from '@/src/store/thresholds';

interface FieldProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  accent: 'danger' | 'info' | 'warning';
  label: string;
  description: string;
  /** What a normal value looks like, so the number has something to mean. */
  guidance: string;
  value: number;
  unit: string;
  /** Values outside this are accepted but flagged — see `warn` below. */
  sane: [number, number];
  onCommit: (v: number) => void;
}

const ACCENTS = {
  danger: { bg: 'bg-danger-soft', border: 'border-danger/30', tone: colors.danger },
  info: { bg: 'bg-info-soft', border: 'border-info/30', tone: colors.info },
  warning: { bg: 'bg-warning-soft', border: 'border-warning/30', tone: colors.warning },
} as const;

function ThresholdField({
  icon,
  accent,
  label,
  description,
  guidance,
  value,
  unit,
  sane,
  onCommit,
}: FieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState('');
  const a = ACCENTS[accent];

  /**
   * A value far outside the usual range is worth pointing out but not worth
   * refusing: an unusual engine is a real thing, and an alert threshold the
   * owner cannot set is worse than one set oddly.
   */
  const parsed = parseFloat(text);
  const warn = !Number.isNaN(parsed) && (parsed < sane[0] || parsed > sane[1]);

  function handleBlur(): void {
    const next = parseFloat(text);
    if (Number.isNaN(next)) {
      setError(t('thresholds.mustBeNumber'));
      setText(String(value));
      return;
    }
    setError('');
    onCommit(next);
  }

  return (
    <View className="mb-3 rounded-3xl border border-border bg-surface p-5">
      <View className="flex-row items-start gap-3.5">
        <View
          className={`h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${a.bg} ${a.border}`}
        >
          <Feather name={icon} size={18} color={a.tone} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-text-primary">{label}</Text>
          <Text className="mt-1 text-[12.5px] leading-[18px] text-text-muted">{description}</Text>
        </View>
      </View>

      <View className="mt-4 flex-row items-stretch gap-2">
        <View
          className={`flex-1 flex-row items-center rounded-2xl border px-4 py-3 ${
            error ? 'border-danger bg-danger-soft' : 'border-border bg-surface-muted'
          }`}
        >
          <TextInput
            className="flex-1 text-[17px] font-semibold tabular-nums text-text-primary"
            keyboardType="decimal-pad"
            value={text}
            accessibilityLabel={label}
            placeholderTextColor={colors.textDim}
            onChangeText={(next) => {
              setText(next);
              setError('');
            }}
            onBlur={handleBlur}
            // Committing on submit as well as on blur: on a numeric keypad
            // there is no visible way to dismiss it, so people tap straight to
            // the next field and the blur is the only thing that fires.
            onSubmitEditing={handleBlur}
            returnKeyType="done"
          />
          <Text className="ml-2 text-[15px] font-semibold text-text-muted">{unit}</Text>
        </View>
      </View>

      {error ? (
        <Text className="mt-2 text-[12px] text-danger">{error}</Text>
      ) : warn ? (
        <View className="mt-2 flex-row items-start gap-1.5">
          <Feather name="alert-triangle" size={12} color={colors.warning} style={{ marginTop: 2 }} />
          <Text className="flex-1 text-[12px] leading-[17px] text-warning">
            {t('thresholds.outOfRange')}
          </Text>
        </View>
      ) : (
        <Text className="mt-2 text-[12px] leading-[17px] text-text-dim">{guidance}</Text>
      )}
    </View>
  );
}

export default function ThresholdSettingsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { thresholds, updateThreshold, resetToDefaults } = useThresholdsStore();
  // The floating bar overlaps this screen; without the reservation the reset
  // button sits underneath it.
  const tabBarHeight = useBottomTabBarHeight();

  function update<K extends keyof ThresholdConfig>(key: K, value: ThresholdConfig[K]): void {
    updateThreshold(key, value);
  }

  function handleReset(): void {
    Alert.alert(t('thresholds.resetConfirmTitle'), t('thresholds.resetConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('thresholds.resetAction'), style: 'destructive', onPress: resetToDefaults },
    ]);
  }

  const defaults: { label: string; value: string }[] = [
    { label: t('thresholds.defaultsCoolant'), value: `${DEFAULT_THRESHOLDS.coolantTempMax} °C` },
    { label: t('thresholds.defaultsBattery'), value: `${DEFAULT_THRESHOLDS.batteryVoltageMin} V` },
    { label: t('thresholds.defaultsFuel'), value: `${DEFAULT_THRESHOLDS.fuelLevelMin} %` },
  ];

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 + tabBarHeight }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-[13px] leading-[19px] text-text-muted">{t('thresholds.subtitle')}</Text>

      <View className="mt-5">
        <ThresholdField
          icon="thermometer"
          accent="danger"
          label={t('thresholds.coolantTemp')}
          description={t('thresholds.coolantTempDesc')}
          guidance={t('thresholds.coolantRange')}
          value={thresholds.coolantTempMax}
          unit="°C"
          sane={[70, 130]}
          onCommit={(v) => update('coolantTempMax', v)}
        />

        <ThresholdField
          icon="battery"
          accent="info"
          label={t('thresholds.batteryVoltage')}
          description={t('thresholds.batteryVoltageDesc')}
          guidance={t('thresholds.batteryRange')}
          value={thresholds.batteryVoltageMin}
          unit="V"
          sane={[10, 14]}
          onCommit={(v) => update('batteryVoltageMin', v)}
        />

        <ThresholdField
          icon="droplet"
          accent="warning"
          label={t('thresholds.fuelLevel')}
          description={t('thresholds.fuelLevelDesc')}
          guidance={t('thresholds.fuelRange')}
          value={thresholds.fuelLevelMin}
          unit="%"
          sane={[1, 60]}
          onCommit={(v) => update('fuelLevelMin', v)}
        />
      </View>

      <View className="mt-2 rounded-3xl border border-border bg-surface px-5 py-4">
        <Text className="text-[10px] font-bold uppercase tracking-eyebrow text-text-muted">
          {t('thresholds.factoryDefaults')}
        </Text>
        <View className="mt-3 flex-row justify-between">
          {defaults.map((d) => (
            <View key={d.label} className="flex-1">
              <Text className="text-[11px] text-text-muted">{d.label}</Text>
              <Text className="mt-0.5 text-[14px] font-semibold tabular-nums text-text-secondary">
                {d.value}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        onPress={handleReset}
        accessibilityRole="button"
        accessibilityLabel={t('thresholds.reset')}
        className="mt-5 flex-row items-center justify-center gap-2 rounded-full border border-danger/30 bg-danger-soft py-4 active:opacity-70"
      >
        <Feather name="rotate-ccw" size={15} color={colors.danger} />
        <Text className="text-[15px] font-bold text-danger">{t('thresholds.reset')}</Text>
      </Pressable>
    </ScrollView>
  );
}
