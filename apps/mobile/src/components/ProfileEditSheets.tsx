import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/src/components/BottomSheet';
import { useAuthStore } from '@/src/store/auth';
import { colors } from '@/src/theme/colors';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-[12px] font-semibold text-text-secondary">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        autoFocus={autoFocus}
        autoCapitalize="words"
        autoCorrect={false}
        className="rounded-2xl border border-border bg-surface-muted px-4 py-3.5 text-[15px] text-text-primary"
      />
    </View>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="mb-3 rounded-2xl bg-danger-soft px-4 py-3">
      <Text className="text-[13px] leading-[18px] text-danger">{message}</Text>
    </View>
  );
}

function SubmitButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled, busy }}
      className={`items-center rounded-full py-3.5 ${
        busy || disabled ? 'bg-surface-sunken' : 'bg-accent active:bg-accent-strong'
      }`}
    >
      {busy ? (
        <ActivityIndicator color={colors.textSecondary} />
      ) : (
        <Text
          className={`text-[15px] font-bold ${
            disabled ? 'text-text-dim' : 'text-on-accent'
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Edit the name shown on the account. */
export function EditProfileSheet({ visible, onClose }: SheetProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening should show what is stored, not what was abandoned last time.
  useEffect(() => {
    if (visible) {
      setFirstName(user?.first_name ?? '');
      setLastName(user?.last_name ?? '');
      setError(null);
    }
  }, [visible, user?.first_name, user?.last_name]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('profile.editProfile')} showCloseButton={false}>
      <ErrorLine message={error} />
      <Field
        label={t('profile.firstNameLabel')}
        value={firstName}
        onChange={setFirstName}
        placeholder={t('profile.firstNamePlaceholder')}
        autoFocus
      />
      <Field
        label={t('profile.lastNameLabel')}
        value={lastName}
        onChange={setLastName}
        placeholder={t('profile.lastNamePlaceholder')}
      />
      {/* The phone is the account's identity and changing it would move the
          account, so it is shown but not editable here. */}
      <Text className="mb-5 text-[12px] text-text-muted">{user?.phone}</Text>
      <SubmitButton
        label={t('profile.save')}
        onPress={() => void save()}
        busy={busy}
        disabled={false}
      />
    </BottomSheet>
  );
}
