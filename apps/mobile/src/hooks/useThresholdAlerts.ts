import { useEffect, useRef } from 'react';
import { useDashboardStore } from '../store/dashboard';
import { useThresholdsStore } from '../store/thresholds';
import { scheduleThresholdAlert } from '../lib/notifications';
import { useToast } from '../components/ToastProvider';

/** Minimum milliseconds between repeat alerts for the same condition. */
const ALERT_COOLDOWN_MS = 60_000;

type AlertKey = 'overheat' | 'lowBattery' | 'lowFuel';

export function useThresholdAlerts(): void {
  const coolantTemp = useDashboardStore((s) => s.coolantTemp);
  const batteryVoltage = useDashboardStore((s) => s.batteryVoltage);
  const fuelLevel = useDashboardStore((s) => s.fuelLevel);
  const thresholds = useThresholdsStore((s) => s.thresholds);
  const showToast = useToast();

  const lastAlertAt = useRef<Partial<Record<AlertKey, number>>>({});

  useEffect(() => {
    const now = Date.now();

    function maybeAlert(key: AlertKey, title: string, body: string): void {
      const last = lastAlertAt.current[key] ?? 0;
      if (now - last < ALERT_COOLDOWN_MS) return;
      lastAlertAt.current[key] = now;
      showToast(body, 'warning');
      scheduleThresholdAlert(title, body).catch(() => {});
    }

    if (coolantTemp.value !== null && coolantTemp.value > thresholds.coolantTempMax) {
      maybeAlert(
        'overheat',
        'Engine Overheat Warning',
        `Coolant temp ${Math.round(coolantTemp.value)}°C exceeds ${thresholds.coolantTempMax}°C`,
      );
    }

    if (batteryVoltage.value !== null && batteryVoltage.value < thresholds.batteryVoltageMin) {
      maybeAlert(
        'lowBattery',
        'Low Battery Warning',
        `Battery ${batteryVoltage.value.toFixed(1)} V below ${thresholds.batteryVoltageMin} V`,
      );
    }

    if (fuelLevel.value !== null && fuelLevel.value < thresholds.fuelLevelMin) {
      maybeAlert(
        'lowFuel',
        'Low Fuel Warning',
        `Fuel level ${Math.round(fuelLevel.value)}% below ${thresholds.fuelLevelMin}%`,
      );
    }
  }, [coolantTemp, batteryVoltage, fuelLevel, thresholds, showToast]);
}
