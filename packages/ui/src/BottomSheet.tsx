import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@koursa/shared';

/**
 * Bottom sheet arrondi (radius 16) posé sur la carte plein écran.
 * Volontairement sans geste ni animation coûteuse (téléphones d'entrée de gamme).
 */
export function BottomSheet({ children, style, scroll, maxHeight = '75%' }: {
  children: ReactNode;
  style?: ViewStyle;
  scroll?: boolean;
  maxHeight?: ViewStyle['maxHeight'];
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingBottom: Math.max(insets.bottom, spacing.md) };
  return (
    <View style={[styles.sheet, { maxHeight }, style]}>
      <View style={styles.handle} />
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, pad]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, pad]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 8,
  },
  content: { padding: spacing.md, gap: spacing.md },
});
