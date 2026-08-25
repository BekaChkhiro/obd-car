import { useCallback, useEffect, useState } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { useAuthStore } from '@/src/store/auth';
import { useChatStore } from '@/src/store/chat';
import { openSession, useSessionStore } from '@/src/store/session';
import {
  deleteSession,
  getSessionsWithSummary,
  renameSession,
  type SessionSummary,
} from '@/src/db/repositories/sessions';

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
    synced: { bg: 'bg-success-soft', border: 'border-success/30', text: 'text-success', label: t('history.synced') },
    pending: { bg: 'bg-warning-soft', border: 'border-warning/30', text: 'text-warning', label: t('history.pendingSync') },
    failed: { bg: 'bg-danger-soft', border: 'border-danger/30', text: 'text-danger', label: t('history.syncFailed') },
  }[status as 'synced' | 'pending' | 'failed'] ?? null;
  if (!cfg) return null;
  return (
    <View className={`rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.border}`}>
      <Text className={`text-[9px] font-bold tracking-widest ${cfg.text}`}>{cfg.label}</Text>
    </View>
  );
}

interface SessionRowProps {
  item: SessionSummary;
  isActive: boolean;
  onPress: () => void;
  onActions: () => void;
}

function SessionRow({ item, isActive, onPress, onActions }: SessionRowProps) {
  const { t } = useTranslation();
  const snippet = item.first_user_message
    ? item.first_user_message.length > 80
      ? item.first_user_message.slice(0, 80) + '…'
      : item.first_user_message
    : null;
  // A renamed session keeps its own title; otherwise the date is the only
  // thing that distinguishes one conversation from another.
  const heading = item.title ?? formatDate(item.updated_at);

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-2.5 rounded-2xl border border-border bg-surface px-4 py-3 active:bg-surface"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-sm font-semibold text-text-primary" numberOfLines={1}>
          {heading}
        </Text>
        <Text className="text-[11px] tabular-nums text-text-muted">
          {formatTime(item.updated_at)}
        </Text>
        <Pressable
          onPress={onActions}
          accessibilityRole="button"
          accessibilityLabel={t('history.actions')}
          hitSlop={10}
          className="h-7 w-7 items-center justify-center rounded-full active:bg-surface-muted"
        >
          <Feather name="more-horizontal" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
      {snippet ? (
        <Text className="mt-1.5 text-xs text-text-muted" numberOfLines={2}>
          {snippet}
        </Text>
      ) : (
        <Text className="mt-1.5 text-xs italic text-text-dim">{t('history.emptySession')}</Text>
      )}
      <View className="mt-3 flex-row items-center gap-2">
        <Text className="text-[10px] font-semibold tracking-wider text-text-muted">
          {item.message_count} {item.message_count === 1 ? t('history.message') : t('history.messages')}
        </Text>
        <SyncBadge status={item.sync_status} />
        {isActive && (
          <View className="rounded-full border border-accent bg-accent-soft px-2 py-0.5">
            <Text className="text-[9px] font-bold tracking-widest text-accent">
              {t('history.active')}
            </Text>
          </View>
        )}
        {item.ended_at && !isActive && (
          <View className="rounded-full border border-border-strong px-2 py-0.5">
            <Text className="text-[9px] font-bold tracking-widest text-text-muted">
              {t('history.ended')}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Action sheet ─────────────────────────────────────────────────────────────

interface ActionSheetProps {
  session: SessionSummary | null;
  onClose: () => void;
  onContinue: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ActionSheet({ session, onClose, onContinue, onRename, onDelete }: ActionSheetProps) {
  const { t } = useTranslation();
  if (!session) return null;

  const rows = [
    { key: 'continue', icon: 'play' as const, label: t('history.continue'), onPress: onContinue, danger: false },
    { key: 'rename', icon: 'edit-2' as const, label: t('history.rename'), onPress: onRename, danger: false },
    { key: 'delete', icon: 'trash-2' as const, label: t('history.delete'), onPress: onDelete, danger: true },
  ];

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" onPress={onClose}>
        {/* Stop taps inside the sheet from dismissing it. */}
        <Pressable
          onPress={() => undefined}
          className="rounded-t-3xl border-t border-border bg-surface px-4 pb-10 pt-3"
        >
          <View className="mb-3 self-center h-1 w-10 rounded-full bg-surface-sunken" />
          <Text className="mb-2 px-2 text-xs text-text-muted" numberOfLines={1}>
            {session.title ?? formatDate(session.updated_at)}
          </Text>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-xl px-3 py-3.5 active:bg-surface"
            >
              <Feather
                name={row.icon}
                size={16}
                color={row.danger ? colors.danger : colors.textSecondary}
              />
              <Text
                className={`text-sm font-medium ${row.danger ? 'text-danger' : 'text-text-primary'}`}
              >
                {row.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Rename dialog ────────────────────────────────────────────────────────────

function RenameDialog({
  session,
  onCancel,
  onSave,
}: {
  session: SessionSummary | null;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  // Seed the field each time a different session is opened.
  useEffect(() => {
    setText(session?.title ?? '');
  }, [session]);

  if (!session) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-full rounded-2xl border border-border bg-surface p-5">
          <Text className="text-base font-bold text-text-primary">{t('history.renameTitle')}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            maxLength={60}
            placeholder={t('history.renamePlaceholder')}
            placeholderTextColor={colors.textDim}
            className="mt-4 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary"
          />
          <View className="mt-5 flex-row justify-end gap-2">
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              className="rounded-xl px-4 py-2.5 active:bg-surface"
            >
              <Text className="text-sm font-semibold text-text-muted">{t('history.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(text)}
              accessibilityRole="button"
              className="rounded-xl bg-accent px-4 py-2.5 active:bg-accent-strong"
            >
              <Text className="text-sm font-bold text-on-accent">{t('history.save')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  // Ask the navigator how tall its bar actually is rather than hard-coding
  // a guess — the floating bar's height moves with the device's safe area.
  const tabBarHeight = useBottomTabBarHeight();
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionTarget, setActionTarget] = useState<SessionSummary | null>(null);
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const rows = await getSessionsWithSummary(db, user.id);
    setSessions(rows);
  }, [db, user]);

  // Reload on focus, not just on mount: the list is reached from the chat
  // screen, so a session the user just wrote to is stale by the time they
  // navigate back here.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleContinue = useCallback(
    async (session: SessionSummary) => {
      setActionTarget(null);
      await openSession(db, session.id);
      // Back to the chat screen, which picks the session up from the store.
      router.back();
    },
    [db, router],
  );

  const handleRename = useCallback(
    async (session: SessionSummary, title: string) => {
      setRenameTarget(null);
      await renameSession(db, session.id, title);
      await load();
    },
    [db, load],
  );

  const handleDelete = useCallback(
    (session: SessionSummary) => {
      setActionTarget(null);
      Alert.alert(t('history.deleteTitle'), t('history.deleteBody'), [
        { text: t('history.cancel'), style: 'cancel' },
        {
          text: t('history.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await deleteSession(db, session.id);
              // Deleting the open conversation must also clear it from the
              // chat screen — otherwise the transcript stays on screen and the
              // next message would be journalled to a row that no longer exists.
              if (session.id === activeSessionId) {
                clearMessages();
                setActiveSessionId(null);
              }
              await load();
            })();
          },
        },
      ]);
    },
    [db, t, load, activeSessionId, clearMessages, setActiveSessionId],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SessionSummary>) => (
      <SessionRow
        item={item}
        isActive={item.id === activeSessionId}
        onPress={() => router.push(`/(app)/ai/history/${item.id}` as never)}
        onActions={() => setActionTarget(item)}
      />
    ),
    [router, activeSessionId],
  );

  if (!refreshing && sessions.length === 0) {
    return (
      <View className="flex-1">
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-6 h-16 w-16 items-center justify-center rounded-full border border-border">
            <View className="h-2 w-2 rounded-full bg-surface-sunken" />
          </View>
          <Text className="text-center text-xl font-bold text-text-primary">{t('history.noSessions')}</Text>
          <Text className="mt-2 text-center text-sm text-text-muted">
            {t('history.noSessionsHint')}
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="mt-6 w-full items-center rounded-xl bg-accent px-6 py-3 active:bg-accent-strong"
          >
            <Text className="text-sm font-bold tracking-wider text-on-accent">{t('history.openAssistant')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 + tabBarHeight }}
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textMuted}
          />
        }
      />

      <ActionSheet
        session={actionTarget}
        onClose={() => setActionTarget(null)}
        onContinue={() => {
          if (actionTarget) void handleContinue(actionTarget);
        }}
        onRename={() => {
          setRenameTarget(actionTarget);
          setActionTarget(null);
        }}
        onDelete={() => {
          if (actionTarget) handleDelete(actionTarget);
        }}
      />

      <RenameDialog
        session={renameTarget}
        onCancel={() => setRenameTarget(null)}
        onSave={(title) => {
          if (renameTarget) void handleRename(renameTarget, title);
        }}
      />
    </View>
  );
}
