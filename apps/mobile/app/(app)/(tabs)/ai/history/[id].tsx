import { useCallback, useEffect, useState } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { useSQLiteContext } from 'expo-sqlite';
import { openSession } from '@/src/store/session';
import { getMessages } from '@/src/db/repositories/messages';
import { getSession } from '@/src/db/repositories/sessions';
import { getVehicle } from '@/src/db/repositories/vehicles';
import type { Message, Session, Vehicle } from '@/src/db/schema';

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isToolResult = msg.role === 'tool';

  if (isToolResult) {
    return (
      <View className="mb-2 mx-4 rounded-xl border border-border bg-surface px-3 py-2">
        <Text className="text-[10px] font-bold tracking-[2px] text-text-muted">TOOL RESULT</Text>
        <Text className="mt-1 text-xs text-text-muted" numberOfLines={3}>{msg.content}</Text>
      </View>
    );
  }

  return (
    <View className={`mb-3 px-4 ${isUser ? 'items-end' : 'items-start'}`}>
      <View
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser ? 'rounded-tr-md bg-accent' : 'rounded-tl-md border border-border bg-surface'
        }`}
      >
        <Text className={`text-sm leading-5 ${isUser ? 'text-on-accent' : 'text-text-primary'}`}>
          {msg.content}
        </Text>
      </View>
      <Text className="mt-0.5 text-[10px] text-text-dim">
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

function renderMessage({ item }: ListRenderItemInfo<Message>) {
  return <MessageBubble msg={item} />;
}

function SessionHeader({ session, vehicle }: { session: Session; vehicle: Vehicle | null }) {
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || vehicle.id
    : null;

  return (
    <View className="mx-4 mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
      <Text className="text-[10px] font-bold tracking-[2px] text-text-muted">SESSION</Text>
      <Text className="mt-2 text-sm font-semibold text-text-primary">
        {new Date(session.created_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
      {vehicleLabel ? (
        <Text className="mt-1 text-xs text-text-muted">{vehicleLabel}</Text>
      ) : null}
    </View>
  );
}

export default function SessionDetailScreen() {
  // Ask the navigator how tall its bar actually is rather than hard-coding
  // a guess — the floating bar's height moves with the device's safe area.
  const tabBarHeight = useBottomTabBarHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function load() {
      const [sess, msgs] = await Promise.all([
        getSession(db, id),
        getMessages(db, id),
      ]);
      setSession(sess);
      setMessages(msgs);
      if (sess?.vehicle_id) {
        const v = await getVehicle(db, sess.vehicle_id);
        setVehicle(v);
      }
      setLoading(false);
    }

    load();
  }, [db, id]);

  // Reopen this conversation in the assistant. The chat screen watches the
  // session store, so it reconnects on its own once we navigate back to it.
  const handleContinue = useCallback(async () => {
    if (!id) return;
    await openSession(db, id);
    router.navigate('/ai');
  }, [db, id, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        className="flex-1"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 + tabBarHeight }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListHeaderComponent={session ? <SessionHeader session={session} vehicle={vehicle} /> : null}
        ListEmptyComponent={
          <View className="items-center justify-center px-6 py-12">
            <Text className="text-center text-sm text-text-muted">{t('history.emptySession')}</Text>
          </View>
        }
      />

      {session && (
        <View className="border-t border-border bg-surface px-4 pb-8 pt-3">
          <Pressable
            onPress={() => void handleContinue()}
            accessibilityRole="button"
            accessibilityLabel={t('history.continue')}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-accent py-3 active:bg-accent-strong"
          >
            <Feather name="play" size={14} color={colors.bg} />
            <Text className="text-sm font-bold tracking-wider text-on-accent">
              {t('history.continue')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
