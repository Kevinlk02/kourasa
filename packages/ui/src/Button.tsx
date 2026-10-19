import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, radius, sizes, font } from '@koursa/shared';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/** CTA pleine largeur, hauteur 56, radius 12. Une seule action principale par écran. */
export function Button({ title, onPress, variant = 'primary', loading, disabled, style, testID }: ButtonProps) {
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      role="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        off && styles.disabled,
        pressed && !off && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.accentText : colors.text} />
      ) : (
        <Text style={[styles.label, (variant === 'primary' || variant === 'danger') && styles.labelOnColor]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: sizes.button,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    alignSelf: 'stretch',
  },
  label: { fontSize: font.body + 1, fontWeight: '600', color: colors.text },
  labelOnColor: { color: colors.accentText },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
};
