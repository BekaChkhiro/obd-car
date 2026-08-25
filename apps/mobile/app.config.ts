import { ConfigContext, ExpoConfig } from 'expo/config';

const apiUrl = process.env.API_URL ?? 'http://localhost:8000';
const wsUrl = process.env.WS_URL ?? 'ws://localhost:8000';
const buildProfile = process.env.EAS_BUILD_PROFILE;
const e2eEnabled =
  process.env.EXPO_PUBLIC_E2E === '1' || process.env.EXPO_PUBLIC_E2E === 'true';

/**
 * Whether this build could reach someone other than the developer.
 *
 * Checking the EAS profile alone was not enough: an archive built locally with
 * `expo run:ios --configuration Release` has no profile at all, and that is
 * exactly the build being uploaded to App Store Connect by hand. Xcode exports
 * CONFIGURATION into the bundling phase, so a local release identifies itself
 * that way. `.env` is read for local builds, and the E2E flag lives in `.env`
 * commented out — one uncommented line away from shipping the sign-in bypass.
 */
const isShippableBuild =
  buildProfile === 'preview' ||
  buildProfile === 'production' ||
  process.env.CONFIGURATION === 'Release';

if (isShippableBuild) {
  const context = buildProfile ? `profile=${buildProfile}` : 'a local Release build';
  if (apiUrl.includes('example.com') || wsUrl.includes('example.com')) {
    throw new Error(
      `[app.config] Refusing to build ${context} with placeholder example.com URL (got API_URL=${apiUrl})`,
    );
  }
  if (apiUrl.startsWith('http://') || wsUrl.startsWith('ws://')) {
    throw new Error(
      `[app.config] Refusing to build ${context} against a plaintext endpoint (got API_URL=${apiUrl}) — ` +
        'auth tokens and chat content would travel unencrypted, and iOS App Transport Security blocks it anyway',
    );
  }
  if (e2eEnabled) {
    throw new Error(
      `[app.config] Refusing to build ${context} with EXPO_PUBLIC_E2E enabled — the E2E sign-in bypass must never ship to real users`,
    );
  }
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...((config as ExpoConfig).plugins ?? []),
    'expo-secure-store',
    'expo-sqlite',
    ['expo-notifications', { icon: './assets/icon.png', color: '#3b82f6' }],
  ],
  extra: {
    ...(config as ExpoConfig).extra,
    apiUrl,
    wsUrl,
    sentryDsn: process.env.SENTRY_DSN ?? '',
    e2e: e2eEnabled,
  },
});
