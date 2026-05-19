import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View, type ListRenderItemInfo } from 'react-native';
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

function SessionRow({ item, onPress }: { item: SessionSummary; onPress: () => void }) {
  const snippet = item.first_user_message
    ? item.first_user_message.length > 80
      ? item.first_user_message.slice(0, 80) + '…'
      : item.first_user_message
    : null;

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-3 rounded-2xl bg-gray-800 px-4 py-3 active:bg-gray-700"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-white">{formatDate(item.created_at)}</Text>
        <Text className="text-xs text-gray-500">{formatTime(item.created_at)}</Text>
      </View>
      {snippet ? (
        <Text className="mt-1 text-xs text-gray-400" numberOfLines={2}>
          {snippet}
        </Text>
      ) : (
        <Text className="mt-1 text-xs text-gray-600 italic">Empty session</Text>
      )}
      <View className="mt-2 flex-row items-center gap-3">
        <Text className="text-xs text-gray-500">
          {item.message_count} {item.message_count === 1 ? 'message' : 'messages'}
        </Text>
        {item.sync_status === 'synced' && (
          <View className="rounded-full bg-green-900/40 px-2 py-0.5">
            <Text className="text-xs text-green-400">synced</Text>
          </View>
        )}
        {item.sync_status === 'pending' && (
          <View className="rounded-full bg-yellow-900/40 px-2 py-0.5">
            <Text className="text-xs text-yellow-400">pending sync</Text>
          </View>
        )}
        {item.sync_status === 'failed' && (
          <View className="rounded-full bg-red-900/40 px-2 py-0.5">
            <Text className="text-xs text-red-400">sync failed</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function renderRow(
  router: ReturnType<typeof useRouter>,
): (info: ListRenderItemInfo<SessionSummary>) => React.JSX.Element {
  return ({ item }) => (
    <SessionRow
      item={item}
      onPress={() => router.push(`/(app)/history/${item.id}` as never)}
    />
  );
}

export default function HistoryScreen() {
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

  const renderItem = renderRow(router);

  if (!refreshing && sessions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-950 px-6">
        <Text className="text-center text-lg font-semibold text-white">No Sessions Yet</Text>
        <Text className="mt-2 text-center text-sm text-gray-500">
          Start a chat with the AI Assistant to create your first session.
        </Text>
        <Pressable
          onPress={() => router.push('/(app)/chat')}
          className="mt-6 rounded-xl bg-indigo-600 px-6 py-3"
        >
          <Text className="text-sm font-medium text-white">Open AI Assistant</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-gray-950"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      data={sessions}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#6B7280"
        />
      }
    />
  );
}
