// E2E test mode helpers.
//
// When the app is built or started with EXPO_PUBLIC_E2E=1, this flag is true
// and screens expose extra affordances (auth bypass, mock-adapter connect)
// that let Maestro drive the happy-path flow without a real backend / OBD-II
// dongle. Production builds always set this to false because the env var is
// not present at build time.

import Constants from 'expo-constants';

function readFlag(): boolean {
  // process.env.EXPO_PUBLIC_E2E is inlined by Metro for EXPO_PUBLIC_* vars.
  const fromEnv = process.env.EXPO_PUBLIC_E2E;
  if (fromEnv === '1' || fromEnv === 'true') return true;

  // Fall back to expo extra (set in app.config.ts) so dev clients can opt in.
  const fromExtra = Constants.expoConfig?.extra?.e2e;
  return fromExtra === true || fromExtra === '1' || fromExtra === 'true';
}

export const E2E_MODE: boolean = readFlag();

export function isE2E(): boolean {
  return E2E_MODE;
}
