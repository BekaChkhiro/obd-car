import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View, type ListRenderItemInfo } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuthStore } from '@/src/store/auth';
import { getSessionsWithSummary, type SessionSummary } from '@/src/db/repositories/sessions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SyncBadge({ status }: { status: SessionSummary['sync_status'] }) {
  const { t } = useTranslation();
  const cfg = {
    synced: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', label: t('history.synced') },
    pending: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', label: t('history.pendingSync') },
    failed: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', label: t('history.syncFailed') },
  }[status as 'synced' | 'pending' | 'failed'] ?? null;
  if (!cfg) return null;
  return (
    <View className={`rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.border}`}>
      <Text className={`text-[9px] font-bold tracking-widest ${cfg.text}`}>{cfg.label}</Text>
    </View>
  );
}

function SessionRow({ item, onPress }: { item: SessionSummary; onPress: () => void }) {
  const { t } = useTranslation();
  const snippet = item.first_user_message
    ? item.first_user_message.length > 80
      ? item.first_user_message.slice(0, 80) + '…'
      : item.first_user_message
    : null;

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 active:bg-zinc-900"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-zinc-50">{formatDate(item.created_at)}</Text>
        <Text className="text-[11px] tabular-nums text-zinc-500">{formatTime(item.created_at)}</Text>
      </View>
      {snippet ? (
        <Text className="mt-1.5 text-xs text-zinc-400" numberOfLines={2}>
          {snippet}
        </Text>
      ) : (
        <Text className="mt-1.5 text-xs italic text-zinc-600">{t('history.emptySession')}</Text>
      )}
      <View className="mt-3 flex-row items-center gap-2">
        <Text className="text-[10px] font-semibold tracking-wider text-zinc-500">
          {item.message_count} {item.message_count === 1 ? t('history.message') : t('history.messages')}
        </Text>
        <SyncBadge status={item.sync_status} />
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const rows = await getSessionsWithSummary(db, user.id);
    setSessions(rows);
  }, [db, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SessionSummary>) => (
      <SessionRow
        item={item}
        onPress={() => router.push(`/(app)/ai/history/${item.id}` as never)}
      />
    ),
    [router],
  );

  if (!refreshing && sessions.length === 0) {
    return (
      <View className="flex-1 bg-bg">
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-6 h-16 w-16 items-center justify-center rounded-full border border-zinc-800">
            <View className="h-2 w-2 rounded-full bg-zinc-700" />
          </View>
          <Text className="text-center text-xl font-bold text-zinc-50">{t('history.noSessions')}</Text>
          <Text className="mt-2 text-center text-sm text-zinc-500">
            {t('history.noSessionsHint')}
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="mt-6 w-full items-center rounded-xl bg-cyan-500 px-6 py-3 active:bg-cyan-600"
          >
            <Text className="text-sm font-bold tracking-wider text-zinc-950">{t('history.openAssistant')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#71717a"
          />
        }
      />
    </View>
  );
}
