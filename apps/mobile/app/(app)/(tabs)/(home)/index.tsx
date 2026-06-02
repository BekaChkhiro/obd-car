import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBleStore } from '@/src/store/ble';
import { colors } from '@/src/theme/colors';
import { SwipeButton } from '@/src/components/SwipeButton';

function StatusDot({ active }: { active: boolean }) {
  return (
    <View className="relative h-2.5 w-2.5">
      {active && (
        <View className="absolute inset-0 rounded-full bg-emerald-400 opacity-40" />
      )}
      <View
        className={`h-2.5 w-2.5 rounded-full ${
          active ? 'bg-emerald-400' : 'bg-zinc-700'
        }`}
      />
    </View>
  );
}

function VehicleArt({ active }: { active: boolean }) {
  // Sporty side-view car silhouette (Ionicons "car-sport").
  // Only the fill color changes — no glow, halo, or shadow. Purely decorative,
  // so it's hidden from screen readers (status is announced by the card above).
  return (
    <View
      className="my-5 items-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons
        name="car-sport"
        size={96}
        color={active ? colors.success : colors.textDim}
      />
    </View>
  );
}

interface ShortcutTileProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  hint: string;
  onPress: () => void;
  accent?: 'cyan' | 'amber' | 'violet' | 'emerald';
}

const ACCENT_MAP: Record<
  NonNullable<ShortcutTileProps['accent']>,
  { bg: string; tone: string; border: string }
> = {
  cyan: { bg: 'bg-cyan-500/10', tone: '#22d3ee', border: 'border-cyan-500/30' },
  amber: { bg: 'bg-amber-500/10', tone: '#fbbf24', border: 'border-amber-500/30' },
  violet: { bg: 'bg-violet-500/10', tone: '#a78bfa', border: 'border-violet-500/30' },
  emerald: { bg: 'bg-emerald-500/10', tone: '#34d399', border: 'border-emerald-500/30' },
};

function ShortcutTile({ icon, label, hint, onPress, accent = 'cyan' }: ShortcutTileProps) {
  const a = ACCENT_MAP[accent];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 active:bg-zinc-900"
    >
      <View
        className={`h-9 w-9 items-center justify-center rounded-xl border ${a.bg} ${a.border}`}
      >
        <Feather name={icon} size={16} color={a.tone} />
      </View>
      <Text className="mt-3 text-[14px] font-semibold text-zinc-50">{label}</Text>
      <Text className="mt-0.5 text-[11px] text-zinc-500" numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const connectedDeviceId = useBleStore((s) => s.connectedDeviceId);
  const isConnected = Boolean(connectedDeviceId);
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#08080a]">
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          paddingBottom: 32,
        }}
      >
        <View className="mb-7 flex-row items-center justify-between">
          <View>
            <Text className="text-[10px] font-semibold tracking-[3px] text-zinc-500">
              {t('garage.brand')}
            </Text>
            <Text className="mt-1 text-3xl font-bold text-zinc-50">{t('garage.title')}</Text>
          </View>
          <View className="rounded-full border border-zinc-800 px-3 py-1.5">
            <Text className="text-[10px] font-semibold tracking-widest text-zinc-500">
              v1.0
            </Text>
          </View>
        </View>

        <View
          className={`mb-5 rounded-3xl border p-5 ${
            isConnected
              ? 'border-emerald-500/30 bg-emerald-950/20'
              : 'border-zinc-800 bg-zinc-900/40'
          }`}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <StatusDot active={isConnected} />
              <Text
                className={`text-[10px] font-bold tracking-[2px] ${
                  isConnected ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              >
                {isConnected ? t('garage.adapterLive') : t('garage.noAdapter')}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold tracking-widest text-zinc-600">
              {t('garage.status')}
            </Text>
          </View>

          <Text className="mt-4 text-xl font-semibold text-zinc-50">
            {isConnected ? t('garage.vehicleConnected') : t('garage.vehicleOffline')}
          </Text>
          <Text className="mt-1 text-xs text-zinc-500" numberOfLines={1}>
            {isConnected ? connectedDeviceId : t('home.subtitle')}
          </Text>

          <VehicleArt active={isConnected} />

          {isConnected ? (
            <Pressable
              testID="home-connect-adapter"
              onPress={() => router.push('/(app)/pair' as never)}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 py-3 active:bg-zinc-800"
            >
              <Feather name="bluetooth" size={14} color={colors.textPrimary} />
              <Text className="text-sm font-bold tracking-wider text-zinc-50">
                {t('garage.manageAdapter')}
              </Text>
            </Pressable>
          ) : (
            <SwipeButton
              label={t('garage.swipeToConnect')}
              completedLabel={t('garage.opening')}
              icon="arrow-right"
              onComplete={() => router.push('/(app)/pair' as never)}
              tone="cyan"
            />
          )}
        </View>

        <Text className="mb-3 px-1 text-[10px] font-bold tracking-[2px] text-zinc-500">
          {t('garage.shortcuts')}
        </Text>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <ShortcutTile
              icon="activity"
              label={t('garage.liveData')}
              hint={t('garage.liveDataHint')}
              accent="cyan"
              onPress={() => router.push('/(app)/dashboard' as never)}
            />
            <ShortcutTile
              icon="message-circle"
              label={t('garage.aiAssistant')}
              hint={t('garage.aiAssistantHint')}
              accent="violet"
              onPress={() => router.push('/(app)/ai' as never)}
            />
          </View>
          <View className="flex-row gap-3">
            <ShortcutTile
              icon="clock"
              label={t('garage.sessions')}
              hint={t('garage.sessionsHint')}
              accent="emerald"
              onPress={() => router.push('/(app)/ai/history' as never)}
            />
            <ShortcutTile
              icon="sliders"
              label={t('garage.alerts')}
              hint={t('garage.alertsHint')}
              accent="amber"
              onPress={() => router.push('/(app)/threshold-settings')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
