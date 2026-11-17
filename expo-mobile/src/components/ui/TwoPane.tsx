import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
 * The detail is fold-safe too: folding with an item open keeps that same
 * detail mounted and shows it full width (list hidden, not unmounted) with a
 * floating back button — so a half-typed comment or an open document survives.
 *
 * Pair it with useTwoPaneSelection (lib/twoPane.ts) and spread its paneProps.
 */

/** Tells an embedded detail whether it is showing full width after a fold. */
const DetailContext = createContext({ heldOnFold: false });
/**
 * For detail screens rendered inside TwoPane: true when the phone was folded
 * with this item open, so a floating back button sits top-left — leave room.
 */
export const useTwoPaneDetail = () => useContext(DetailContext);

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
  /** From useTwoPaneSelection: folded with an item open — show it full width. */
  narrowDetail?: boolean;
  /** From useTwoPaneSelection: the back button on a full-width held detail. */
  onCloseDetail?: () => void;
}

export function TwoPane({
  list,
  detail,
  emptyTitle = 'Select an item',
  emptyIcon = 'albums-outline',
  listWidth,
  narrowDetail = false,
  onCloseDetail,
}: TwoPaneProps) {
  const { isWide } = useLayout();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const showDetail = isWide || narrowDetail;

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.list,
          isWide && { width: listWidth ?? LIST_PANE_WIDTH, flex: 0, borderRightColor: theme.border, borderRightWidth: StyleSheet.hairlineWidth },
          // Hidden, never unmounted: the list keeps its scroll and search.
          narrowDetail && styles.hidden,
        ]}
      >
        {list}
      </View>
      {showDetail ? (
        <View style={[styles.detail, { backgroundColor: theme.background }]}>
          <DetailContext.Provider value={{ heldOnFold: narrowDetail }}>
            {detail ?? (
            <View style={styles.empty}>
              <Ionicons name={emptyIcon} size={40} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>{emptyTitle}</Text>
            </View>
            )}
          </DetailContext.Provider>
          {narrowDetail && onCloseDetail ? (
            <Pressable
              onPress={onCloseDetail}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to list"
              style={[styles.back, { top: insets.top + 6, backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  list: { flex: 1 },
  detail: { flex: 1 },
  hidden: { display: 'none' },
  back: {
    position: 'absolute',
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyText: { fontSize: fontSize.bodyLg, textAlign: 'center' },
});
