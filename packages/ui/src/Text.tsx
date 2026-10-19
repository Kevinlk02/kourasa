import { Text as RNText, type TextProps, StyleSheet } from 'react-native';
import { colors, font } from '@koursa/shared';

export function Title(props: TextProps) {
  return <RNText role="heading" {...props} style={[styles.title, props.style]} />;
}
export function Subtitle(props: TextProps) {
  return <RNText {...props} style={[styles.subtitle, props.style]} />;
}
export function Body(props: TextProps) {
  return <RNText {...props} style={[styles.body, props.style]} />;
}
export function Caption(props: TextProps) {
  return <RNText {...props} style={[styles.caption, props.style]} />;
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font.subtitle, fontWeight: '600', color: colors.text },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  caption: { fontSize: font.caption, color: colors.muted },
});
