import { useEffect, useRef } from 'react';
import { TextInput, View, Text } from 'react-native';

interface CodeInputProps {
  length: number;
  label: string;
  value: string;
  onChangeText: (code: string) => void;
  /** Fires once, the instant the last digit lands — this screen has no submit button. */
  onComplete: (code: string) => void;
  /** Whether the last submitted code was rejected — reddens the boxes and refocuses. */
  hasError?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
}

/**
 * An SMS code field: boxes for display, one real `TextInput` underneath doing
 * the work.
 *
 * `textContentType="oneTimeCode"` is what puts the code from the SMS banner
 * directly above the iOS keyboard — the single biggest usability win this
 * screen has, and it is one prop. The boxes are decoration only: they sit
 * beneath the input and are hidden from the accessibility tree so a screen
 * reader lands on the real field once, not on five things that all claim to
 * be a code entry.
 */
export function CodeInput({
  length,
  label,
  value,
  onChangeText,
  onComplete,
  hasError,
  autoFocus,
  editable = true,
}: CodeInputProps) {
  const inputRef = useRef<TextInput>(null);

  // A failed attempt clears the code (see the screens) — refocusing means the
  // very next keystroke starts the retry instead of requiring a tap first.
  useEffect(() => {
    if (hasError) inputRef.current?.focus();
  }, [hasError]);

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChangeText(digits);
    if (digits.length === length) onComplete(digits);
  }

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-[10px] font-bold tracking-eyebrow text-text-muted">
        {label.toUpperCase()}
      </Text>
      <View className="relative">
        <View
          className="flex-row gap-3"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length }, (_, i) => (
            <View
              key={i}
              className={`h-14 flex-1 items-center justify-center rounded-xl border bg-surface ${
                hasError ? 'border-danger/30' : value.length === i ? 'border-accent' : 'border-border'
              }`}
            >
              <Text className="text-xl font-bold text-text-primary">{value[i] ?? ''}</Text>
            </View>
          ))}
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          autoFocus={autoFocus}
          editable={editable}
          accessibilityLabel={label}
          className="absolute inset-0 opacity-0"
        />
      </View>
    </View>
  );
}
