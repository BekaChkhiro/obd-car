import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/src/components/BottomSheet';

interface CodesHelpSheetProps {
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
 * What the codes on this screen actually mean.
 *
 * Three things trip people up and all three are here: that a code names a
 * symptom rather than a part, that stored / pending / permanent are different
 * claims about certainty, and that clearing codes repairs nothing — it only
 * erases the evidence. The last one is worth stating plainly, because the
 * obvious reading of a "clear" button is that it fixes the problem.
 */
export function CodesHelpSheet({ visible, onClose }: CodesHelpSheetProps) {
  const { t } = useTranslation();

  const entries = [
    { title: t('codes.helpWhatTitle'), body: t('codes.helpWhatBody') },
    { title: t('codes.helpStoredTitle'), body: t('codes.helpStoredBody') },
    { title: t('codes.helpPendingTitle'), body: t('codes.helpPendingBody') },
    { title: t('codes.helpPermanentTitle'), body: t('codes.helpPermanentBody') },
    { title: t('codes.helpLettersTitle'), body: t('codes.helpLettersBody') },
    { title: t('codes.helpSingleTitle'), body: t('codes.helpSingleBody') },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('codes.helpTitle')}>
      {entries.map((e) => (
        <Entry key={e.title} title={e.title} body={e.body} />
      ))}

      <View className="mt-1 rounded-2xl bg-warning-soft px-4 py-3.5">
        <Text className="mb-1.5 text-[13px] font-bold text-warning">
          {t('codes.helpClearTitle')}
        </Text>
        <Text className="text-[13px] leading-[18px] text-text-secondary">
          {t('codes.helpClearBody')}
        </Text>
      </View>
    </BottomSheet>
  );
}
