import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, sizes, font } from '@koursa/shared';

export interface PhoneInputProps {
  /** Indicatif lu depuis la table countries (+228, +235). */
  dialCode: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  error?: string | null;
  label?: string;
}

export function PhoneInput({ dialCode, value, onChangeText, placeholder, autoFocus, error, label }: PhoneInputProps) {
  return (
    <View style={{ gap: 6, alignSelf: 'stretch' }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.row, !!error && styles.err]}>
        <Text style={styles.dial}>{dialCode}</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => onChangeText(t.replace(/[^\d ]/g, ''))}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoFocus={autoFocus}
          maxLength={14}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: font.caption, color: colors.muted, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: sizes.input,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    gap: 10,
  },
  err: { borderWidth: 1, borderColor: colors.danger },
  dial: { fontSize: font.body + 2, fontWeight: '600', color: colors.text },
  input: { flex: 1, fontSize: font.body + 2, color: colors.text, height: '100%' },
  error: { fontSize: font.caption, color: colors.danger },
});
