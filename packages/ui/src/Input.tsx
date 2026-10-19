import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, sizes, font } from '@koursa/shared';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const Input = forwardRef<TextInput, InputProps>(function Input({ label, hint, error, style, ...rest }, ref) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        {...rest}
        style={[styles.input, rest.multiline && styles.multiline, !!error && styles.inputError, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  label: { fontSize: font.caption, color: colors.muted, fontWeight: '600' },
  input: {
    minHeight: sizes.input,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: font.body,
    color: colors.text,
  },
  multiline: { paddingTop: 14, minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderWidth: 1, borderColor: colors.danger },
  hint: { fontSize: font.caption, color: colors.muted },
  error: { fontSize: font.caption, color: colors.danger },
});
