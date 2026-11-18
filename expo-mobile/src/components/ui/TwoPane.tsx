import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
/** Width of the collapsed sidebar (`rail`) when an item is open. */
export const RAIL_WIDTH = 76;

/**
 * For the `rail` content: expand the full list as an overlay. The rail itself
 * should show a compact item per row (e.g. a coloured badge) and call the
 * screen's own select handler on tap.
 */
const RailContext = createContext<{ expand: () => void }>({ expand: () => {} });
export const useTwoPaneRail = () => useContext(RailContext);

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
  /**
   * Collapsible sidebar (Jed, 11-19: "projects on the side is no good"). When
   * wide and an item is open, the list shrinks to this slim rail and the
   * detail gets the room. Tapping the rail's menu button slides the full list
   * over the detail; picking an item collapses it again. With nothing open
   * the list takes the whole width. Without `rail`, the classic side-by-side
   * layout is used.
   */
  rail?: ReactNode;
  /** Changes when a different item opens — collapses the expanded list. */
  detailKey?: string | null;
}

export function TwoPane({
  list,
  detail,
  emptyTitle = 'Select an item',
  emptyIcon = 'albums-outline',
  listWidth,
  narrowDetail = false,
  onCloseDetail,
  rail,
  detailKey,
}: TwoPaneProps) {
  const { isWide } = useLayout();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const hasDetail = detail != null;
  const collapsible = !!rail && isWide;
  // Collapsible mode: nothing open → the list is the whole screen.
  const showDetail = narrowDetail || (isWide && (!collapsible || hasDetail));
  const railMode = collapsible && hasDetail;
  const [expanded, setExpanded] = useState(false);
  // A different item opened (or the rail went away) → fold the list back.
  useEffect(() => setExpanded(false), [detailKey, railMode]);
  const width = listWidth ?? LIST_PANE_WIDTH;

  // Children are KEYED so the rail appearing before the list never shifts the
  // list's position — it must stay mounted (scroll, search) through every
  // fold, unfold, collapse and expand.
  return (
    <View style={styles.row}>
      {railMode ? (
        <View key="rail" style={[styles.rail, { backgroundColor: theme.card, borderRightColor: theme.border, paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse list' : 'Show full list'}
            style={[styles.railToggle, { backgroundColor: expanded ? theme.primaryLight : 'transparent' }]}
          >
            <Ionicons name={expanded ? 'chevron-back' : 'menu'} size={24} color={theme.textPrimary} />
          </Pressable>
          {onCloseDetail ? (
            <Pressable
              onPress={onCloseDetail}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close and show the full list"
              style={styles.railToggle}
            >
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </Pressable>
          ) : null}
          <View style={[styles.railDivider, { backgroundColor: theme.border }]} />
          <RailContext.Provider value={{ expand: () => setExpanded(true) }}>{rail}</RailContext.Provider>
        </View>
      ) : null}
      <View
        key="list"
        style={[
          styles.list,
          isWide && !collapsible && { width, flex: 0, borderRightColor: theme.border, borderRightWidth: StyleSheet.hairlineWidth },
          // Collapsed to the rail: the list floats over the detail when
          // expanded, and is hidden (never unmounted) otherwise.
          railMode && (expanded
            ? [styles.overlay, { left: RAIL_WIDTH, width, backgroundColor: theme.background, borderRightColor: theme.border }]
            : styles.hidden),
          // Hidden, never unmounted: the list keeps its scroll and search.
          narrowDetail && styles.hidden,
        ]}
      >
        {list}
      </View>
      {showDetail ? (
        <View key="detail" style={[styles.detail, { backgroundColor: theme.background }]}>
          <DetailContext.Provider value={{ heldOnFold: narrowDetail }}>
            {detail ?? (
            <View style={styles.empty}>
              <Ionicons name={emptyIcon} size={40} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>{emptyTitle}</Text>
            </View>
            )}
          </DetailContext.Provider>
          {railMode && expanded ? (
            // Tap the detail to fold the expanded list away.
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setExpanded(false)}
              accessibilityLabel="Close list"
            />
          ) : null}
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
  rail: { width: RAIL_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  railDivider: { width: 40, height: StyleSheet.hairlineWidth, marginBottom: 10 },
  railToggle: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
  },
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
