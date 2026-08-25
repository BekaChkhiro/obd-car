import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/src/components/BottomSheet';

interface AssistantHelpSheetProps {
  visible: boolean;
  onClose: () => void;
}

function Entry({ title, body }: { title: string; body: string }) {
  return (
    <View className="mb-5">
      <Text className="text-[15px] font-semibold text-text-primary">{title}</Text>
      <Text className="mt-1 text-[13px] leading-[19px] text-text-secondary">{body}</Text>
    </View>
  );
}

/**
 * What the assistant is and what it is reading.
 *
 * The thing people most need told is that the answers come off this car rather
 * than out of a language model's memory — that is the whole reason the adapter
 * has to be connected, and it is not obvious from a chat box. The rest is the
 * mechanics of the screen: sessions, where deleting one lives now, and that
 * nothing is written to the car without being asked.
 */
export function AssistantHelpSheet({ visible, onClose }: AssistantHelpSheetProps) {
  const { t } = useTranslation();

  const entries = [
    { title: t('chat.helpWhatTitle'), body: t('chat.helpWhatBody') },
    { title: t('chat.helpReadsTitle'), body: t('chat.helpReadsBody') },
    { title: t('chat.helpAskTitle'), body: t('chat.helpAskBody') },
    { title: t('chat.helpSessionsTitle'), body: t('chat.helpSessionsBody') },
    { title: t('chat.helpWriteTitle'), body: t('chat.helpWriteBody') },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('chat.helpTitle')}>
      {entries.map((e) => (
        <Entry key={e.title} title={e.title} body={e.body} />
      ))}

      <View className="mt-1 rounded-2xl bg-warning-soft px-4 py-3.5">
        <Text className="mb-1.5 text-[13px] font-bold text-warning">
          {t('chat.helpLimitTitle')}
        </Text>
        <Text className="text-[13px] leading-[18px] text-text-secondary">
          {t('chat.helpLimitBody')}
        </Text>
      </View>
    </BottomSheet>
  );
}
