import { forwardRef } from 'react';
import { TextInput, TextInputProps, View, Text } from 'react-native';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

const AuthInput = forwardRef<TextInput, Props>(({ label, error, ...props }, ref) => (
  <View className="mb-4">
    <Text className="mb-1 text-sm font-medium text-gray-700">{label}</Text>
    <TextInput
      ref={ref}
      className={`rounded-xl border px-4 py-3 text-base text-gray-900 bg-white ${
        error ? 'border-red-500' : 'border-gray-300'
      }`}
      placeholderTextColor="#9ca3af"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
    />
    {error ? <Text className="mt-1 text-xs text-red-500">{error}</Text> : null}
  </View>
));

AuthInput.displayName = 'AuthInput';
export default AuthInput;
