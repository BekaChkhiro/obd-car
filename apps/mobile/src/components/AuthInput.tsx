import { forwardRef } from 'react';
import { TextInput, TextInputProps, View, Text } from 'react-native';
import { colors } from '@/src/theme/colors';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

const AuthInput = forwardRef<TextInput, Props>(({ label, error, ...props }, ref) => (
  <View className="mb-4">
    <Text className="mb-1.5 text-[10px] font-bold tracking-eyebrow text-zinc-500">
      {label.toUpperCase()}
    </Text>
    <TextInput
      ref={ref}
      className={`rounded-xl border bg-zinc-900/60 px-4 py-3 text-base text-zinc-50 ${
        error ? 'border-red-500/60' : 'border-zinc-800'
      }`}
      style={{ minHeight: 48 }}
      accessibilityLabel={label}
      placeholderTextColor={colors.textDim}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
    />
    {error ? <Text className="mt-1.5 text-xs text-red-400">{error}</Text> : null}
  </View>
));

AuthInput.displayName = 'AuthInput';
export default AuthInput;
