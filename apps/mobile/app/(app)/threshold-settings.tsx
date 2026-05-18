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
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: '#f1f5f9', fontWeight: '600', marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>{description}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={{
            flex: 1,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: error ? '#ef4444' : '#334155',
            backgroundColor: '#1e293b',
            color: '#f1f5f9',
            paddingVertical: 10,
            paddingHorizontal: 14,
            fontSize: 16,
          }}
          keyboardType="numeric"
          value={text}
          onChangeText={(t) => { setText(t); setError(''); }}
          onBlur={handleBlur}
        />
        <Text style={{ color: '#64748b', width: 36 }}>{unit}</Text>
      </View>
      {error ? <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

export default function ThresholdSettingsScreen(): React.JSX.Element {
  const { thresholds, updateThreshold, resetToDefaults } = useThresholdsStore();

  function update<K extends keyof ThresholdConfig>(key: K, value: ThresholdConfig[K]): void {
    updateThreshold(key, value);
  }

  function handleReset(): void {
    Alert.alert(
      'Reset Thresholds',
      'Restore all thresholds to their default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: resetToDefaults },
      ],
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, padding: 20, backgroundColor: '#0f172a' }}
    >
      <Text style={{ color: '#f1f5f9', fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
        Alert Thresholds
      </Text>
      <Text style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
        Alerts fire when a value crosses its threshold. Settings are saved per vehicle.
      </Text>

      <ThresholdField
        label="Max Coolant Temperature"
        description="Alert when engine coolant exceeds this temperature."
        value={thresholds.coolantTempMax}
        unit="°C"
        onCommit={(v) => update('coolantTempMax', v)}
      />

      <ThresholdField
        label="Min Battery Voltage"
        description="Alert when control module voltage drops below this level."
        value={thresholds.batteryVoltageMin}
        unit="V"
        onCommit={(v) => update('batteryVoltageMin', v)}
      />

      <ThresholdField
        label="Min Fuel Level"
        description="Alert when fuel tank level drops below this percentage."
        value={thresholds.fuelLevelMin}
        unit="%"
        onCommit={(v) => update('fuelLevelMin', v)}
      />

      <View style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: '#1e293b' }}>
        <Text style={{ color: '#64748b', fontSize: 12 }}>
          Defaults — Coolant: {DEFAULT_THRESHOLDS.coolantTempMax}°C &nbsp;|&nbsp;
          Battery: {DEFAULT_THRESHOLDS.batteryVoltageMin} V &nbsp;|&nbsp;
          Fuel: {DEFAULT_THRESHOLDS.fuelLevelMin}%
        </Text>
      </View>

      <Pressable
        onPress={handleReset}
        style={{ marginTop: 20, borderRadius: 12, borderWidth: 1, borderColor: '#ef4444', paddingVertical: 12, alignItems: 'center' }}
      >
        <Text style={{ color: '#ef4444', fontWeight: '600' }}>Reset to Defaults</Text>
      </Pressable>
    </ScrollView>
  );
}
