import { forwardRef } from 'react';
import { TextInput, View, Text } from 'react-native';
import { colors } from '@/src/theme/colors';
import { formatGeorgianPhone, sanitizePhoneDigits } from '@/src/lib/phone';

interface PhoneInputProps {
  label: string;
  /** Raw digits after +995 — never the formatted or E.164 form. */
  value: string;
  onChangeText: (digits: string) => void;
  error?: string;
  autoFocus?: boolean;
  editable?: boolean;
}

/**
 * A phone field with the +995 country code fixed in place.
 *
 * Georgian mobiles are always +995, so asking someone to type it is nine
 * digits of real information plus four of copywork. The prefix is static
 * chrome here and every keystroke maps onto the 9 digits after it.
 */
const PhoneInput = forwardRef<TextInput, PhoneInputProps>(
  ({ label, value, onChangeText, error, autoFocus, editable = true }, ref) => (
    <View className="mb-4">
      <Text className="mb-1.5 text-[10px] font-bold tracking-eyebrow text-text-muted">
        {label.toUpperCase()}
      </Text>
      <View
        className={`flex-row items-center rounded-xl border bg-surface px-4 ${
          error ? 'border-danger/30' : 'border-border'
        }`}
        style={{ minHeight: 48 }}
      >
        <Text className="text-base font-semibold text-text-secondary">+995</Text>
        <View className="mx-3 h-5 w-px bg-border" />
        <TextInput
          ref={ref}
          value={formatGeorgianPhone(value)}
          onChangeText={(text) => onChangeText(sanitizePhoneDigits(text))}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={11}
          autoFocus={autoFocus}
          editable={editable}
          placeholder="555 12 34 56"
          placeholderTextColor={colors.textDim}
          accessibilityLabel={label}
          className="flex-1 py-3 text-base text-text-primary"
        />
      </View>
      {error ? <Text className="mt-1.5 text-xs text-danger">{error}</Text> : null}
    </View>
  ),
);

PhoneInput.displayName = 'PhoneInput';
export default PhoneInput;
