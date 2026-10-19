import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, font, t, type DeliveryStatus } from '@koursa/shared';

export function Screen({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }, padded && { padding: spacing.md, gap: spacing.md }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? <Text style={{ color: colors.muted }}>{label}</Text> : null}
    </View>
  );
}

export function Avatar({ uri, name, size = 48 }: { uri?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '700', color: colors.muted }}>{initials}</Text>
    </View>
  );
}

const STATUS_COLORS: Partial<Record<DeliveryStatus, string>> = {
  searching: colors.warning,
  assigned: colors.accent,
  picked_up: colors.accent,
  delivering: colors.accent,
  delivered: colors.text,
  failed: colors.danger,
  unassigned: colors.danger,
};

export function StatusPill({ status }: { status: DeliveryStatus }) {
  const c = STATUS_COLORS[status] ?? colors.muted;
  return (
    <View style={[styles.pill, { borderColor: c }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.pillText, { color: c }]}>{t(`status.${status}`)}</Text>
    </View>
  );
}

export function ZoneBadge({ name, color }: { name: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color, backgroundColor: color + '1A' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color: colors.text }]}>{name}</Text>
    </View>
  );
}

/** Épingle fixe au centre de la carte (placement manuel du point). */
export function MapPin({ color = colors.text }: { color?: string }) {
  return (
    <View pointerEvents="none" style={styles.pinWrap}>
      <View style={[styles.pinHead, { backgroundColor: color }]}>
        <View style={styles.pinInner} />
      </View>
      <View style={[styles.pinStem, { backgroundColor: color }]} />
    </View>
  );
}

/** Minuteur : temps écoulé depuis `since` (mm:ss), ou compte à rebours jusqu'à `until`. */
export function Timer({ since, until, style }: { since?: string | number | null; until?: string | number | null; style?: object }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  let ms = 0;
  if (until != null) ms = Math.max(0, new Date(until).getTime() - now);
  else if (since != null) ms = Math.max(0, now - new Date(since).getTime());
  const s = Math.floor(ms / 1000);
  const label = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return <Text style={[{ fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }, style]}>{label}</Text>;
}

export function Banner({ text, tone = 'warning', onPress }: { text: string; tone?: 'warning' | 'danger' | 'info'; onPress?: () => void }) {
  const bg = tone === 'danger' ? colors.danger : tone === 'info' ? colors.text : colors.warning;
  return (
    <Pressable onPress={onPress} style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={styles.bannerText}>{text}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, alignSelf: 'stretch' }} />;
}

export function ListItem({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surface }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: font.body, color: colors.text, fontWeight: '500' }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Choice({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} role="radio" accessibilityState={{ selected }}
      style={[styles.choice, selected && { borderColor: colors.text, backgroundColor: colors.background }]}>
      <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.text }}>{label}</Text>
      {hint ? <Text style={{ fontSize: font.caption, color: colors.muted }}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: font.caption, fontWeight: '600' },
  pinWrap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -14, marginTop: -40, alignItems: 'center' },
  pinHead: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pinInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  pinStem: { width: 3, height: 12 },
  banner: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.button },
  bannerText: { color: '#fff', fontWeight: '600', fontSize: font.caption + 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 8 },
  choice: { flex: 1, padding: 12, borderRadius: radius.button, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface, gap: 2 },
});
