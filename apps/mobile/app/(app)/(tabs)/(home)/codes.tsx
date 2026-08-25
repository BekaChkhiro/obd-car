import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { connectionMachine } from '@/src/ble/connection';
import { useBleStore } from '@/src/store/ble';
import { useChatStore } from '@/src/store/chat';
import type { DtcResult } from '@/src/ble/dtc-reader';
import { colors } from '@/src/theme/colors';
import { CodesHelpSheet } from '@/src/components/CodesHelpSheet';
import { NoAdapterState } from '@/src/components/NoAdapterState';

type Load = 'idle' | 'reading' | 'done' | 'error';

function CodeRow({
  dtc,
  onAsk,
  onClear,
  clearing,
}: {
  dtc: DtcResult;
  onAsk: (code: string) => void;
  onClear: (code: string) => void;
  clearing: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View className="mb-2 rounded-2xl border border-border bg-surface px-4 py-3.5">
      <View className="flex-row items-center gap-2">
        <Text className="text-[15px] font-bold tabular-nums text-text-primary">
          {dtc.code}
        </Text>

        {dtc.isPending && (
          <View className="rounded-md bg-warning-soft px-1.5 py-0.5">
            <Text className="text-[9px] font-bold tracking-wider text-warning">
              {t('codes.pending')}
            </Text>
          </View>
        )}
        {dtc.isPermanent && (
          <View className="rounded-md bg-danger-soft px-1.5 py-0.5">
            <Text className="text-[9px] font-bold tracking-wider text-danger">
              {t('codes.permanent')}
            </Text>
          </View>
        )}
      </View>

      {dtc.description ? (
        <Text className="mt-1.5 text-[13px] leading-[19px] text-text-secondary">
          {dtc.description}
        </Text>
      ) : (
        /* No definition is a real answer, not a blank. Saying which kind of
           gap it is tells the user whether naming the car would fix it. */
        <Text className="mt-1.5 text-[13px] leading-[19px] text-text-muted">
          {dtc.needsMake ? t('codes.needsMake') : t('codes.noDefinition')}
        </Text>
      )}

      {/* The table gives the definition; the cause, the severity and what to
          check first are a conversation. This hands the code straight to the
          assistant so nothing has to be retyped — and the assistant answers
          about a code actually read from this car, not one typed from memory. */}
      <View className="mt-4 flex-row items-stretch gap-2">
        <Pressable
          onPress={() => onAsk(dtc.code)}
          accessibilityRole="button"
          accessibilityLabel={`${t('codes.askAi')} — ${dtc.code}`}
          className="flex-1 flex-row items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 active:bg-accent-strong"
        >
          <View className="h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <Feather name="message-circle" size={16} color={colors.onAccent} />
          </View>
          <Text className="flex-1 text-[14.5px] font-semibold text-on-accent">
            {t('codes.askAi')}
          </Text>
          <Feather name="arrow-right" size={16} color={colors.onAccent} />
        </Pressable>

        {/* Outlined rather than filled: clearing is the destructive option and
            should never out-compete asking. The confirmation says plainly that
            OBD-II erases every code at once — there is no command for one. */}
        <Pressable
          onPress={() => onClear(dtc.code)}
          disabled={clearing}
          accessibilityRole="button"
          accessibilityLabel={`${t('codes.clearOne')} - ${dtc.code}`}
          className={`w-14 items-center justify-center rounded-2xl border border-danger/30 active:bg-danger-soft ${
            clearing ? 'opacity-40' : ''
          }`}
        >
          <Feather name="trash-2" size={17} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

export default function CodesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const locale = useTranslation().i18n.language === 'ka' ? 'ka' : 'en';

  const connectedDeviceId = useBleStore((s) => s.connectedDeviceId);
  const setDtcCount = useBleStore((s) => s.setDtcCount);
  const connected = connectedDeviceId !== null;

  const navigation = useNavigation();
  const [helpOpen, setHelpOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setHelpOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('codes.helpTitle')}
          hitSlop={12}
          // Explicit box and centring rather than utility classes: inside
          // headerRight the navigator supplies its own alignment, and the
          // icon ended up sitting off-centre in its circle.
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
          }}
        >
          <Feather name="help-circle" size={18} color={colors.textPrimary} />
        </Pressable>
      ),
    });
  }, [navigation, t]);

  const sendUserMessage = useChatStore((st) => st.sendUserMessage);

  const askAssistant = useCallback(
    (code: string) => {
      sendUserMessage(t('codes.askPrompt', { code }));
      router.push('/ai');
    },
    [sendUserMessage, router, t],
  );

  const [state, setState] = useState<Load>('idle');
  const [dtcs, setDtcs] = useState<DtcResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    const adapter = connectionMachine.getAdapter();
    if (!adapter) return;

    setState('reading');
    setError(null);
    try {
      // Stored, pending and permanent in one pass — a code the ECU cannot
      // clear is the honest answer to "did the fault really go away?", and
      // hiding it behind a second action would bury it.
      const [stored, permanent] = await Promise.all([
        adapter.dtc.readDtcs({ includePending: true, locale, priority: 'high' }),
        adapter.dtc.readPermanentDtcs({ locale, priority: 'high' }),
      ]);
      const seen = new Set(stored.map((d) => d.code));
      const merged = [...stored, ...permanent.filter((d) => !seen.has(d.code))];
      setDtcs(merged);
      setDtcCount(stored.filter((d) => !d.isPending).length);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [locale, setDtcCount]);

  const [clearing, setClearing] = useState(false);

  /**
   * Erasing fault memory is destructive and, crucially, not a repair — so it
   * asks first and says exactly what is lost. Afterwards it reports what the
   * ECU actually says rather than claiming success: a code that survives the
   * clear is either still occurring or permanent, and both are worth knowing.
   */
  const clearCodes = useCallback(
    (code?: string) => {
    Alert.alert(
      code ? t('codes.clearOneTitle') : t('codes.clearConfirmTitle'),
      code ? t('codes.clearOneBody', { code }) : t('codes.clearConfirmBody'),
      [
      { text: t('codes.cancel'), style: 'cancel' },
      {
        text: t('codes.clearConfirmCta'),
        style: 'destructive',
        onPress: async () => {
          const adapter = connectionMachine.getAdapter();
          if (!adapter) return;
          setClearing(true);
          try {
            const { verified, remainingDtcs } = await adapter.dtc.clearDtcs({
              priority: 'high',
            });
            await read();
            if (verified) {
              Alert.alert(t('codes.clearedTitle'), t('codes.clearedBody'));
            } else {
              Alert.alert(
                t('codes.clearedPartialTitle'),
                t('codes.clearedPartialBody', { count: remainingDtcs.length }),
              );
            }
          } catch (err) {
            Alert.alert(
              t('codes.clearFailedTitle'),
              err instanceof Error ? err.message : String(err),
            );
          } finally {
            setClearing(false);
          }
        },
      },
      ],
    );
    },
    [read, t],
  );

  useEffect(() => {
    if (connected) void read();
  }, [connected, read]);

  if (!connected) {
    return (
      <NoAdapterState
        title={t('codes.noAdapterTitle')}
        body={t('codes.noAdapterBody')}
      >
        <CodesHelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
        <Pressable
          onPress={() => router.push('/pair')}
          accessibilityRole="button"
          className="rounded-full bg-accent px-7 py-3.5 active:bg-accent-strong"
        >
          <Text className="text-[15px] font-bold text-on-accent">
            {t('codes.connectCta')}
          </Text>
        </Pressable>
      </NoAdapterState>
    );
  }

  const confirmed = dtcs.filter((d) => !d.isPending).length;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 20, paddingBottom: 32 + tabBarHeight }}
    >
      <CodesHelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />

      <View className="mb-5 items-center rounded-3xl border border-border bg-surface px-5 py-7">
        {state === 'reading' ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Text
              className={`text-5xl font-bold tabular-nums ${
                confirmed > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {confirmed}
            </Text>
            <Text className="mt-1.5 text-center text-sm text-text-secondary">
              {confirmed > 0 ? t('codes.faultsFound') : t('codes.noFaults')}
            </Text>
          </>
        )}

        <Pressable
          onPress={() => void read()}
          disabled={state === 'reading'}
          accessibilityRole="button"
          className="mt-5 flex-row items-center gap-2 rounded-full border border-border px-4 py-2 active:bg-surface-muted"
        >
          <Feather name="refresh-cw" size={13} color={colors.textSecondary} />
          <Text className="text-xs font-semibold text-text-secondary">
            {t('codes.reread')}
          </Text>
        </Pressable>
      </View>

      {state === 'error' && (
        <View className="mb-4 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3">
          <Text className="text-[13px] text-danger">{error}</Text>
        </View>
      )}

      {dtcs.map((d) => (
        <CodeRow
          key={`${d.code}-${d.isPending}-${d.isPermanent}`}
          dtc={d}
          onAsk={askAssistant}
          onClear={clearCodes}
          clearing={clearing}
        />
      ))}

      {dtcs.length > 0 && (
        <Pressable
          onPress={() => clearCodes()}
          disabled={clearing || state === 'reading'}
          accessibilityRole="button"
          accessibilityLabel={t('codes.clear')}
          accessibilityState={{ disabled: clearing, busy: clearing }}
          className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl border border-danger/30 py-3.5 active:bg-danger-soft ${
            clearing ? 'opacity-50' : ''
          }`}
        >
          <Feather name="trash-2" size={15} color={colors.danger} />
          <Text className="text-[14.5px] font-semibold text-danger">
            {clearing ? t('codes.clearing') : t('codes.clear')}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
