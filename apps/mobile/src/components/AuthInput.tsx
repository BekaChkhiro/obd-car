import { forwardRef } from 'react';
import { TextInput, TextInputProps, View, Text } from 'react-native';
import { colors } from '@/src/theme/colors';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

const AuthInput = forwardRef<TextInput, Props>(({ label, error, ...props }, ref) => (
  <View className="mb-4">
    <Text className="mb-1.5 text-[10px] font-bold tracking-eyebrow text-text-muted">
      {label.toUpperCase()}
    </Text>
    <TextInput
      ref={ref}
      className={`rounded-xl border bg-surface px-4 py-3 text-base text-text-primary ${
        error ? 'border-danger/30' : 'border-border'
      }`}
      style={{ minHeight: 48 }}
      accessibilityLabel={label}
      placeholderTextColor={colors.textDim}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
    />
    {error ? <Text className="mt-1.5 text-xs text-danger">{error}</Text> : null}
  </View>
));

AuthInput.displayName = 'AuthInput';
export default AuthInput;
