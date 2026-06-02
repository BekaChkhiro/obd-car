import { ConfigContext, ExpoConfig } from 'expo/config';

const apiUrl = process.env.API_URL ?? 'http://localhost:8000';
const wsUrl = process.env.WS_URL ?? 'ws://localhost:8000';
const buildProfile = process.env.EAS_BUILD_PROFILE;
const e2eEnabled =
  process.env.EXPO_PUBLIC_E2E === '1' || process.env.EXPO_PUBLIC_E2E === 'true';

if (buildProfile === 'preview' || buildProfile === 'production') {
  if (apiUrl.includes('example.com') || wsUrl.includes('example.com')) {
    throw new Error(
      `[app.config] Refusing to build profile=${buildProfile} with placeholder example.com URL (got API_URL=${apiUrl})`,
    );
  }
  if (e2eEnabled) {
    throw new Error(
      `[app.config] Refusing to build profile=${buildProfile} with EXPO_PUBLIC_E2E enabled — the E2E sign-in bypass must never ship to real users`,
    );
  }
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...((config as ExpoConfig).plugins ?? []),
    'expo-secure-store',
    'expo-web-browser',
    'expo-sqlite',
    ['expo-notifications', { icon: './assets/icon.png', color: '#3b82f6' }],
  ],
  extra: {
    ...(config as ExpoConfig).extra,
    apiUrl,
    wsUrl,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? '',
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID ?? '',
    sentryDsn: process.env.SENTRY_DSN ?? '',
    e2e: e2eEnabled,
  },
});
