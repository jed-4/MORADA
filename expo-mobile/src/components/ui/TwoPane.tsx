import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '../../lib/useLayout';
import { metrics, radii, shadow, size, space, type, useColors } from '../../theme';
import { ChevronLeft, Menu, X } from 'lucide-react-native';

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
export const RAIL_WIDTH = size.railWidth;

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
  /** Replaces the default empty state (e.g. a kit EmptyState). */
  empty?: ReactNode;
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
  empty,
  listWidth,
  narrowDetail = false,
  onCloseDetail,
  rail,
  detailKey,
}: TwoPaneProps) {
  const { isWide } = useLayout();
  const c = useColors();
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
        <View key="rail" style={[styles.rail, { backgroundColor: c.bg, borderRightColor: c.border, paddingTop: insets.top + space.inline }]}>
          {/* Back to the full list — top-left, where back is on every other
              screen (Jed, 11-21: back buttons weren't consistently placed). */}
          {onCloseDetail ? (
            <Pressable
              onPress={onCloseDetail}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to the full list"
              style={styles.railToggle}
            >
              <ChevronLeft size={metrics.pageHeader.backTasks} color={c.accent} strokeWidth={metrics.iconStroke} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse list' : 'Show full list'}
            style={[styles.railToggle, { backgroundColor: expanded ? c.tint : 'transparent' }]}
          >
            {expanded
              ? <X size={size.icon.header} color={c.accent} strokeWidth={metrics.iconStroke} />
              : <Menu size={size.icon.header} color={c.icon} strokeWidth={metrics.iconStroke} />}
          </Pressable>
          <View style={[styles.railDivider, { backgroundColor: c.border }]} />
          <RailContext.Provider value={{ expand: () => setExpanded(true) }}>{rail}</RailContext.Provider>
        </View>
      ) : null}
      <View
        key="list"
        style={[
          styles.list,
          isWide && !collapsible && { width, flex: 0, borderRightColor: c.border, borderRightWidth: size.border },
          // Collapsed to the rail: the list floats over the detail when
          // expanded, and is hidden (never unmounted) otherwise.
          railMode && (expanded
            ? [styles.overlay, { left: RAIL_WIDTH, width, backgroundColor: c.bg, borderRightColor: c.border }]
            : styles.hidden),
          // Hidden, never unmounted: the list keeps its scroll and search.
          narrowDetail && styles.hidden,
        ]}
      >
        {list}
      </View>
      {showDetail ? (
        <View key="detail" style={[styles.detail, { backgroundColor: c.bg }]}>
          <DetailContext.Provider value={{ heldOnFold: narrowDetail }}>
            {detail ?? empty ?? (
            <View style={styles.empty}>
              <View style={[styles.emptyCircle, { backgroundColor: c.greyFill }]}>
                <Ionicons name={emptyIcon} size={metrics.emptyState.icon} color={c.muted} />
              </View>
              <Text style={[type.emptyTitle, { color: c.muted }]}>{emptyTitle}</Text>
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
              style={[styles.back, { top: insets.top + 6, backgroundColor: c.surface, borderColor: c.border }]}
            >
              <ChevronLeft size={size.icon.header} color={c.accent} strokeWidth={metrics.iconStroke} />
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
  rail: { width: RAIL_WIDTH, borderRightWidth: size.border, alignItems: 'center' },
  railDivider: { width: RAIL_WIDTH / 2, height: size.border, marginBottom: space.inline + space.inlineSm },
  railToggle: { width: metrics.minHit, height: metrics.minHit, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', marginBottom: space.inline },
  // The expanded list floats over the detail, so it carries the sheet shadow.
  overlay: { position: 'absolute', top: 0, bottom: 0, zIndex: 10, borderRightWidth: size.border, ...shadow.sheet },
  back: {
    position: 'absolute',
    left: space.rowGap,
    width: metrics.minHit - space.inline,
    height: metrics.minHit - space.inline,
    borderRadius: (metrics.minHit - space.inline) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: size.border,
    ...shadow.fab,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: metrics.emptyState.gap },
  emptyCircle: { width: metrics.emptyState.circle, height: metrics.emptyState.circle, borderRadius: metrics.emptyState.circle / 2, alignItems: 'center', justifyContent: 'center' },
});
