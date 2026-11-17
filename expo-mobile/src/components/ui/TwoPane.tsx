import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayout } from '../../lib/useLayout';
import { useTheme, fontSize } from '../../theme';

/**
 * List on the left, the open item on the right — on a big screen only.
 *
 * On a phone (or the Duo folded) this renders just the list, exactly as before.
 * On the Duo unfolded the detail sits beside it.
 *
 * FOLD-SAFE BY CONSTRUCTION: the list is always the FIRST child of the same
 * row View, whether or not the detail is showing. React keeps it mounted when
 * the screen folds or unfolds, so its scroll position, search text, filters
 * and loaded data all survive. Never branch to a different tree on isWide.
 *
 * Pair it with useTwoPaneSelection (lib/twoPane.ts), which decides whether a
 * tap opens the right panel or pushes the detail screen, and moves between the
 * two when the phone folds or unfolds so you keep your place.
 */

/** Width of the left list panel on a big screen. */
export const LIST_PANE_WIDTH = 360;

interface TwoPaneProps {
  /** The list. Rendered at every size. */
  list: ReactNode;
  /** The open item. Only rendered when wide. */
  detail: ReactNode;
  /** Shown on the right when wide and nothing is selected. */
  emptyTitle?: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  /** Override the list width (defaults to LIST_PANE_WIDTH). */
  listWidth?: number;
}

export function TwoPane({ list, detail, emptyTitle = 'Select an item', emptyIcon = 'albums-outline', listWidth }: TwoPaneProps) {
  const { isWide } = useLayout();
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.list,
          isWide && { width: listWidth ?? LIST_PANE_WIDTH, flex: 0, borderRightColor: theme.border, borderRightWidth: StyleSheet.hairlineWidth },
        ]}
      >
        {list}
      </View>
      {isWide ? (
        <View style={[styles.detail, { backgroundColor: theme.background }]}>
          {detail ?? (
            <View style={styles.empty}>
              <Ionicons name={emptyIcon} size={40} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>{emptyTitle}</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  list: { flex: 1 },
  detail: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyText: { fontSize: fontSize.bodyLg, textAlign: 'center' },
});
