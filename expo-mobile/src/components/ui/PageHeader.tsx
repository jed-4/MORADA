import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, MAX_FONT_SCALE } from '../../theme';
import { goBackOrHome } from '../../navigation/back';

/**
 * One slim header across the full width: back top-left, the page name, the
 * project underneath, actions on the right.
 *
 * Used on the unfolded iPhone Duo above a TwoPane (list + open item), so the
 * back button is always in the same place — top-left — instead of sitting at
 * the top of the left column on some pages and beside the open item on others
 * (Jed, 11-21). The look follows the Project Tasks header he liked.
 */
export function PageHeader({
  navigation,
  title,
  projectName,
  right,
  onBack,
}: {
  navigation: any;
  title: string;
  projectName?: string | null;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <Pressable
        onPress={onBack ?? (() => goBackOrHome(navigation))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
      </Pressable>
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {projectName ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.project, { color: theme.textMuted }]} numberOfLines={1}>
            {projectName}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '700' },
  project: { fontSize: 13, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
});
