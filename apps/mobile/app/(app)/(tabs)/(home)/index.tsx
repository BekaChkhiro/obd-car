import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBleStore } from '@/src/store/ble';
import { colors } from '@/src/theme/colors';
import { SwipeButton } from '@/src/components/SwipeButton';
import carArt from '@/assets/car-connect.png';

function StatusDot({ active }: { active: boolean }) {
  return (
    <View className="relative h-2.5 w-2.5">
      {active && (
        <View className="absolute inset-0 rounded-full bg-success opacity-40" />
      )}
      <View
        className={`h-2.5 w-2.5 rounded-full ${
          active ? 'bg-success' : 'bg-surface-sunken'
        }`}
      />
    </View>
  );
}

function VehicleArt() {
  // Purely decorative — the card's own heading states the connection status,
  // so this is hidden from screen readers rather than described twice.
  return (
    <View
      className="my-2 items-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={carArt} style={{ width: 240, height: 240 }} resizeMode="contain" />
    </View>
  );
}

interface ShortcutTileProps {
  /** Optional count shown as a badge, e.g. stored fault codes. */
  badge?: number | null;
  /**
   * Lay the tile out as a row. A full-width card with the icon stacked above
   * the text leaves a wide empty band beside it; side by side, the width is
   * used and the card still scans as one unit.
   */
  wide?: boolean;
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
  cyan: { bg: 'bg-accent-soft', tone: colors.accent, border: 'border-accent' },
  amber: { bg: 'bg-warning-soft', tone: colors.warning, border: 'border-warning/30' },
  violet: { bg: 'bg-info-soft', tone: colors.info, border: 'border-info/30' },
  emerald: { bg: 'bg-success-soft', tone: colors.success, border: 'border-success/30' },
};

function ShortcutTile({
  icon,
  label,
  hint,
  onPress,
  accent = 'cyan',
  badge,
  wide = false,
}: ShortcutTileProps) {
  const a = ACCENT_MAP[accent];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      className={`rounded-3xl border border-border bg-surface px-5 py-5 active:bg-surface-muted ${
        wide ? 'w-full' : 'flex-1'
      }`}
    >
      {/* Only shown once something has actually been read — a badge reading 0
          where nothing was checked would claim a clean bill of health. */}
      {(() => {
        const iconTile = (
          <View
            className={`h-12 w-12 items-center justify-center rounded-2xl border ${a.bg} ${a.border}`}
          >
            <Feather name={icon} size={20} color={a.tone} />
          </View>
        );
        const count =
          typeof badge === 'number' ? (
            <View
              className={`min-w-6 items-center rounded-full px-2 py-0.5 ${
                badge > 0 ? 'bg-danger' : 'bg-success'
              }`}
            >
              <Text className="text-[11px] font-bold tabular-nums text-on-accent">
                {badge}
              </Text>
            </View>
          ) : null;

        if (wide) {
          return (
            <View className="flex-row items-center gap-4">
              {iconTile}
              <View className="flex-1">
                <Text className="text-[16px] font-semibold text-text-primary">{label}</Text>
                <Text className="mt-1 text-[12.5px] text-text-muted" numberOfLines={2}>
                  {hint}
                </Text>
              </View>
              {count}
            </View>
          );
        }

        return (
          <>
            <View className="flex-row items-start justify-between">
              {iconTile}
              {count}
            </View>
            <Text className="mt-3 text-[14px] font-semibold text-text-primary">{label}</Text>
            <Text className="mt-0.5 text-[11px] text-text-muted" numberOfLines={2}>
              {hint}
            </Text>
          </>
        );
      })()}
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const connectedDeviceId = useBleStore((s) => s.connectedDeviceId);
  const dtcCount = useBleStore((s) => s.dtcCount);
  const vin = useBleStore((s) => s.vin);
  const isConnected = Boolean(connectedDeviceId);
  const insets = useSafeAreaInsets();
  // Ask the navigator how tall its bar actually is rather than hard-coding a
  // guess — the floating bar's height moves with the device's safe area.
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View className="flex-1">
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 20,
          paddingBottom: 32 + tabBarHeight,
        }}
      >


        {/* White like every other card. Tinting the whole panel green made the
            connected state shout louder than the readings it introduces, and
            broke the one-surface rhythm of the rest of the screen — the state
            is carried by a chip instead. */}
        <View className="mb-5 rounded-3xl border border-border bg-surface p-5">
          <View className="flex-row items-center justify-between">
            <View
              className={`flex-row items-center gap-2 rounded-full px-2.5 py-1 ${
                isConnected ? 'bg-success-soft' : 'bg-surface-muted'
              }`}
            >
              <StatusDot active={isConnected} />
              <Text
                className={`text-[11px] font-semibold ${
                  isConnected ? 'text-success' : 'text-text-muted'
                }`}
              >
                {isConnected ? t('garage.adapterLive') : t('garage.noAdapter')}
              </Text>
            </View>
            {isConnected && vin ? (
              <Text className="text-[11px] tabular-nums text-text-dim" numberOfLines={1}>
                {vin.slice(-6)}
              </Text>
            ) : null}
          </View>

          <Text className="mt-4 text-2xl font-bold text-text-primary">
            {isConnected ? t('garage.vehicleConnected') : t('garage.vehicleOffline')}
          </Text>
          <Text className="mt-1 text-[13px] text-text-muted" numberOfLines={1}>
            {isConnected ? connectedDeviceId : t('home.subtitle')}
          </Text>

          <VehicleArt />

          {isConnected ? (
            <Pressable
              testID="home-connect-adapter"
              onPress={() => router.push('/pair')}
              className="flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 active:bg-accent-strong"
            >
              <Feather name="bluetooth" size={15} color={colors.onAccent} />
              <Text className="text-[15px] font-bold text-on-accent">
                {t('garage.manageAdapter')}
              </Text>
            </Pressable>
          ) : (
            <SwipeButton
              label={t('garage.swipeToConnect')}
              completedLabel={t('garage.opening')}
              icon="arrow-right"
              onComplete={() => router.push('/pair')}
              tone="cyan"
            />
          )}
        </View>

        {/* Wide tracking is a device for short Latin eyebrows; Georgian glyphs
            are already open, so it just pulls the word apart. A plain, larger
            heading reads as a section instead of a label. */}
        <Text className="mb-3.5 px-1 text-[17px] font-bold text-text-primary">
          {t('garage.shortcuts')}
        </Text>
        {/* One column of rows rather than a grid: the labels are long enough in
            both locales that two-up cards wrap to three lines, and a row gives
            each one its icon, name and hint on a single readable line. */}
        <View className="gap-3">
          <ShortcutTile
            icon="activity"
            label={t('garage.liveData')}
            hint={t('garage.liveDataHint')}
            accent="cyan"
            wide
            onPress={() => router.push('/dashboard')}
          />
          <ShortcutTile
            icon="message-circle"
            label={t('garage.aiAssistant')}
            hint={t('garage.aiAssistantHint')}
            accent="violet"
            wide
            onPress={() => router.push('/ai')}
          />
          <ShortcutTile
            icon="alert-circle"
            label={t('garage.codes')}
            hint={t('garage.codesHint')}
            accent="amber"
            badge={dtcCount}
            wide
            onPress={() => router.push('/codes')}
          />
        </View>
      </ScrollView>
    </View>
  );
}
