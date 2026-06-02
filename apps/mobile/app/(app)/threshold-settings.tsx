import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useThresholdsStore, DEFAULT_THRESHOLDS, type ThresholdConfig } from '@/src/store/thresholds';

interface FieldProps {
  label: string;
  description: string;
  value: number;
  unit: string;
  onCommit: (v: number) => void;
}

function ThresholdField({ label, description, value, unit, onCommit }: FieldProps): React.JSX.Element {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState('');

  function handleBlur(): void {
    const parsed = parseFloat(text);
    if (Number.isNaN(parsed)) {
      setError('Must be a number');
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
            placeholderTextColor="#52525b"
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
  const { thresholds, updateThreshold, resetToDefaults } = useThresholdsStore();

  function update<K extends keyof ThresholdConfig>(key: K, value: ThresholdConfig[K]): void {
    updateThreshold(key, value);
  }

  function handleReset(): void {
    Alert.alert('Reset thresholds', 'Restore all thresholds to their default values?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetToDefaults },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-[#08080a]"
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text className="text-[10px] font-bold tracking-[3px] text-zinc-500">CALIBRATION</Text>
      <Text className="mt-1 text-2xl font-bold text-zinc-50">Alert thresholds</Text>
      <Text className="mt-2 text-xs text-zinc-500">
        Alerts fire when a value crosses its threshold. Settings are saved per vehicle.
      </Text>

      <View className="mt-6">
        <ThresholdField
          label="Max coolant temperature"
          description="Alert when engine coolant exceeds this temperature."
          value={thresholds.coolantTempMax}
          unit="°C"
          onCommit={(v) => update('coolantTempMax', v)}
        />

        <ThresholdField
          label="Min battery voltage"
          description="Alert when control module voltage drops below this level."
          value={thresholds.batteryVoltageMin}
          unit="V"
          onCommit={(v) => update('batteryVoltageMin', v)}
        />

        <ThresholdField
          label="Min fuel level"
          description="Alert when fuel tank level drops below this percentage."
          value={thresholds.fuelLevelMin}
          unit="%"
          onCommit={(v) => update('fuelLevelMin', v)}
        />
      </View>

      <View className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">FACTORY DEFAULTS</Text>
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
        className="mt-6 items-center rounded-xl border border-red-500/40 bg-red-500/5 py-3 active:bg-red-500/10"
      >
        <Text className="text-sm font-bold tracking-wider text-red-400">RESET TO DEFAULTS</Text>
      </Pressable>
    </ScrollView>
  );
}
