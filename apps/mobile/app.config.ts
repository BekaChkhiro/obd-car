import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...((config as ExpoConfig).plugins ?? []),
    'expo-secure-store',
    'expo-web-browser',
  ],
  extra: {
    ...(config as ExpoConfig).extra,
    apiUrl: process.env.API_URL ?? 'http://localhost:8000',
    wsUrl: process.env.WS_URL ?? 'ws://localhost:8000',
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? '',
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID ?? '',
  },
});
