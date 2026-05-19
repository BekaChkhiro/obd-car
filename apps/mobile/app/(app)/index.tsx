import { Alert, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/src/store/auth';
import { useBleStore } from '@/src/store/ble';
import { useLocaleStore, type Locale } from '@/src/store/locale';

function LanguageSwitcher() {
  const { locale, setLocale } = useLocaleStore();
  const { t } = useTranslation();

  return (
    <View className="mt-6 items-center">
      <Text className="mb-2 text-xs text-gray-400">{t('home.language')}</Text>
      <View className="flex-row rounded-xl border border-gray-200 overflow-hidden">
        {(['en', 'ka'] as Locale[]).map((lng) => (
          <Pressable
            key={lng}
            onPress={() => setLocale(lng)}
            className={`px-5 py-2 ${locale === lng ? 'bg-blue-600' : 'bg-white'}`}
          >
            <Text className={`text-sm font-medium ${locale === lng ? 'text-white' : 'text-gray-600'}`}>
              {lng === 'en' ? 'EN' : 'KA'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, logout, deleteAccount } = useAuthStore();
  const connectedDeviceId = useBleStore((s) => s.connectedDeviceId);

  function handleDeleteAccount(): void {
    Alert.alert(
      t('settings.deleteAccountConfirmTitle'),
      t('settings.deleteAccountConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            deleteAccount().catch(() => {
              Alert.alert(t('common.error'), t('settings.deleteAccountError'));
            });
          },
        },
      ],
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-xl font-bold text-gray-900">{t('home.title')}</Text>
      <Text className="mt-2 text-gray-500">{t('home.subtitle')}</Text>
      {user ? (
        <Text className="mt-4 text-sm text-gray-400">{t('home.signedInAs', { email: user.email })}</Text>
      ) : null}

      <Pressable
        testID="home-connect-adapter"
        onPress={() => router.push('/(app)/pair')}
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3"
      >
        <Text className="text-sm font-medium text-white">
          {connectedDeviceId ? t('home.adapterConnected') : t('home.connectAdapter')}
        </Text>
      </Pressable>

      {connectedDeviceId ? (
        <Text className="mt-2 text-xs text-green-600" numberOfLines={1}>
          {connectedDeviceId}
        </Text>
      ) : null}

      <Pressable
        testID="home-open-dashboard"
        onPress={() => router.push('/(app)/dashboard')}
        className="mt-3 rounded-xl bg-gray-900 px-6 py-3"
      >
        <Text className="text-sm font-medium text-white">{t('home.openDashboard')}</Text>
      </Pressable>

      <Pressable
        testID="home-open-chat"
        onPress={() => router.push('/(app)/chat')}
        className="mt-3 rounded-xl bg-indigo-600 px-6 py-3"
      >
        <Text className="text-sm font-medium text-white">{t('home.aiAssistant')}</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/(app)/history')}
        className="mt-3 rounded-xl bg-gray-700 px-6 py-3"
      >
        <Text className="text-sm font-medium text-white">{t('home.sessionHistory')}</Text>
      </Pressable>

      <Pressable
        onPress={logout}
        className="mt-4 rounded-xl border border-gray-300 px-6 py-3"
      >
        <Text className="text-sm font-medium text-gray-700">{t('home.signOut')}</Text>
      </Pressable>

      <Pressable
        onPress={handleDeleteAccount}
        className="mt-3 rounded-xl border border-red-500 px-6 py-3"
      >
        <Text className="text-sm font-medium text-red-500">{t('settings.deleteAccount')}</Text>
      </Pressable>

      <LanguageSwitcher />

      <StatusBar style="auto" />
    </View>
  );
}
