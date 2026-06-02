import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/src/store/auth';
import { useLocaleStore, type Locale } from '@/src/store/locale';
import { colors } from '@/src/theme/colors';

interface RowProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  hint?: string;
  onPress?: () => void;
  tone?: 'default' | 'danger';
}

function Row({ icon, label, hint, onPress, tone = 'default' }: RowProps) {
  const labelTone = tone === 'danger' ? 'text-red-400' : 'text-zinc-100';
  const iconColor = tone === 'danger' ? colors.danger : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-t border-zinc-900 px-5 py-3.5 active:bg-zinc-900/40"
    >
      <View className="h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60">
        <Feather name={icon} size={14} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className={`text-[14px] font-medium ${labelTone}`}>{label}</Text>
        {hint && <Text className="mt-0.5 text-[11px] text-zinc-500">{hint}</Text>}
      </View>
      {onPress && tone !== 'danger' && (
        <Feather name="chevron-right" size={16} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, logout, deleteAccount } = useAuthStore();
  const { locale, setLocale } = useLocaleStore();
  const insets = useSafeAreaInsets();

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

  const emailInitial = (user?.email?.[0] || '?').toUpperCase();

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: 32,
      }}
    >
      <View className="px-5 pb-6">
        <Text className="text-[10px] font-semibold tracking-[3px] text-zinc-500">
          {t('profile.brand')}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-zinc-50">{t('profile.title')}</Text>
      </View>

      {/* Avatar + email card */}
      <View className="mx-5 mb-5 flex-row items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-5">
        <View className="h-14 w-14 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10">
          <Text className="text-xl font-bold text-cyan-300">{emailInitial}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">
            {t('profile.signedIn')}
          </Text>
          <Text
            className="mt-1 text-[15px] font-semibold text-zinc-50"
            numberOfLines={1}
          >
            {user?.email ?? '—'}
          </Text>
        </View>
      </View>

      {/* Preferences */}
      <View className="mx-5 mb-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <View className="px-5 pb-2 pt-3">
          <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">
            {t('profile.preferences')}
          </Text>
        </View>

        <View className="flex-row items-center gap-3 border-t border-zinc-900 px-5 py-3.5">
          <View className="h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60">
            <Feather name="globe" size={14} color={colors.textSecondary} />
          </View>
          <Text className="flex-1 text-[14px] font-medium text-zinc-100">
            {t('home.language')}
          </Text>
          <View className="flex-row gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            {(['en', 'ka'] as Locale[]).map((lng) => (
              <Pressable
                key={lng}
                onPress={() => setLocale(lng)}
                className={`rounded-md px-3 py-1 ${
                  locale === lng ? 'bg-zinc-100' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    locale === lng ? 'text-zinc-950' : 'text-zinc-400'
                  }`}
                >
                  {lng === 'en' ? 'EN' : 'KA'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Row
          icon="sliders"
          label={t('profile.alertThresholds')}
          hint={t('profile.alertThresholdsHint')}
          onPress={() => router.push('/(app)/threshold-settings')}
        />
      </View>

      {/* Diagnostics shortcut */}
      <View className="mx-5 mb-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <View className="px-5 pb-2 pt-3">
          <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">
            {t('profile.diagnostics')}
          </Text>
        </View>
        <Row
          icon="clock"
          label={t('profile.sessionHistory')}
          hint={t('profile.sessionHistoryHint')}
          onPress={() => router.push('/(app)/ai/history' as never)}
        />
        <Row
          icon="bluetooth"
          label={t('profile.adapterSettings')}
          hint={t('profile.adapterSettingsHint')}
          onPress={() => router.push('/(app)/pair')}
        />
      </View>

      {/* Account actions — stacked */}
      <View className="mx-5 mb-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <View className="px-5 pb-2 pt-3">
          <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">
            {t('profile.session')}
          </Text>
        </View>
        <Row icon="log-out" label={t('home.signOut')} onPress={logout} />
        <Row
          icon="trash-2"
          label={t('settings.deleteAccount')}
          onPress={handleDeleteAccount}
          tone="danger"
        />
      </View>

      <Text className="text-center text-[10px] tracking-widest text-zinc-700">
        OBD-II  ·  v{Constants.expoConfig?.version ?? '1.0'}
      </Text>
    </ScrollView>
  );
}
