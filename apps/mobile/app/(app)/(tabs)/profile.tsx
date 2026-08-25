import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/src/store/auth';
import { EditProfileSheet } from '@/src/components/ProfileEditSheets';
import { useLocaleStore, type Locale } from '@/src/store/locale';
import { colors } from '@/src/theme/colors';
import { formatE164Display } from '@/src/lib/phone';

interface RowProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  hint?: string;
  onPress?: () => void;
  tone?: 'default' | 'danger';
}

function Row({ icon, label, hint, onPress, tone = 'default' }: RowProps) {
  const labelTone = tone === 'danger' ? 'text-danger' : 'text-text-primary';
  const iconColor = tone === 'danger' ? colors.danger : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-t border-border px-5 py-3.5 active:bg-surface"
    >
      <View className="h-8 w-8 items-center justify-center rounded-full border border-border bg-surface">
        <Feather name={icon} size={14} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className={`text-[14px] font-medium ${labelTone}`}>{label}</Text>
        {hint && <Text className="mt-0.5 text-[11px] text-text-muted">{hint}</Text>}
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
  // Ask the navigator how tall its bar actually is rather than hard-coding a
  // guess — the floating bar's height moves with the device's safe area.
  const tabBarHeight = useBottomTabBarHeight();

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

  const [editOpen, setEditOpen] = useState(false);

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
  const avatarInitial = (user?.first_name?.[0] || '?').toUpperCase();

  return (
    <>
      <EditProfileSheet visible={editOpen} onClose={() => setEditOpen(false)} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: 32 + tabBarHeight,
        }}
      >
      <View className="px-5 pb-6">
        <Text className="text-[10px] font-semibold tracking-[3px] text-text-muted">
          {t('profile.brand')}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-text-primary">{t('profile.title')}</Text>
      </View>

      {/* Avatar + phone card */}
      <Pressable
        onPress={() => setEditOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('profile.editProfile')}
        className="mx-5 mb-5 flex-row items-center gap-4 rounded-3xl border border-border bg-surface p-5 active:bg-surface-muted"
      >
        <View className="h-14 w-14 items-center justify-center rounded-full border border-accent bg-accent-soft">
          <Text className="text-xl font-bold text-accent">{avatarInitial}</Text>
        </View>
        <View className="flex-1">
          {/* Name first when there is one — an account with a name should be
              addressed by it, with the number kept visible underneath. */}
          <Text className="text-[17px] font-bold text-text-primary" numberOfLines={1}>
            {displayName || t('profile.noName')}
          </Text>
          <Text className="mt-0.5 text-[13px] text-text-muted" numberOfLines={1}>
            {user?.phone ? formatE164Display(user.phone) : '—'}
          </Text>
        </View>
        <Feather name="edit-2" size={16} color={colors.textMuted} />
      </Pressable>

      {/* Preferences */}
      <View className="mx-5 mb-5 overflow-hidden rounded-2xl border border-border bg-surface">
        <View className="px-5 pb-2 pt-3">
          <Text className="text-[10px] font-bold tracking-[2px] text-text-muted">
            {t('profile.preferences')}
          </Text>
        </View>

        <View className="flex-row items-center gap-3 border-t border-border px-5 py-3.5">
          <View className="h-8 w-8 items-center justify-center rounded-full border border-border bg-surface">
            <Feather name="globe" size={14} color={colors.textSecondary} />
          </View>
          <Text className="flex-1 text-[14px] font-medium text-text-primary">
            {t('home.language')}
          </Text>
          <View className="flex-row gap-1 rounded-lg border border-border bg-surface-muted p-0.5">
            {(['en', 'ka'] as Locale[]).map((lng) => (
              <Pressable
                key={lng}
                onPress={() => setLocale(lng)}
                className={`rounded-md px-3 py-1 ${
                  locale === lng ? 'bg-accent-soft' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    locale === lng ? 'text-on-accent' : 'text-text-muted'
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

      {/* Account actions — stacked */}
      <View className="mx-5 mb-5 overflow-hidden rounded-2xl border border-border bg-surface">
        <View className="px-5 pb-2 pt-3">
          <Text className="text-[10px] font-bold tracking-[2px] text-text-muted">
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

      <Text className="text-center text-[10px] tracking-widest text-text-dim">
        OBD-II  ·  v{Constants.expoConfig?.version ?? '1.0'}
      </Text>
      </ScrollView>
    </>
  );
}
