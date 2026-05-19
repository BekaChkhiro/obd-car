import { createMMKV } from 'react-native-mmkv';
import { clearDb } from '../db/database';

const MMKV_IDS = ['locale', 'onboarding', 'thresholds', 'dashboard'];

export async function clearAllLocalData(): Promise<void> {
  for (const id of MMKV_IDS) {
    createMMKV({ id }).clearAll();
  }
  await clearDb();
}
