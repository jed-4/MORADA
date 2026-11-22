import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CloudOff, Palette, Search, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import { readCachedSelections, writeCachedSelections, describeAge, cacheSelectionPhotos } from '../services/selectionsOffline';
import { metrics, radii, size, space, type, useColors } from '../theme';
import { usePersistedState } from '../lib/usePersistedState';
import { SkeletonList } from '../components/ui/Skeleton';
import { Card, CollapsedGroupList, EmptyState, GroupHeader, PageHeader, ProgressLine, UnderlineTabs, type CollapsedGroup } from '../components/kit';
import { haptic } from '../lib/haptics';
import SpecRow from '../components/selections/SpecRow';
import { TwoPane } from '../components/ui/TwoPane';
import { useTwoPaneSelection } from '../lib/twoPane';
import SelectionDetailScreen from './SelectionDetailScreen';
import {
  getSelectionState,
  groupByCategory,
  groupByRoom,
  isSettled,
  matchesSearch,
  type Selection,
  type SelectionGroup,
} from '../lib/selections';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

type GroupMode = 'room' | 'category';

/**
 * The spec sheet — "what is going in this room?".
 *
 * Grouped by room by default because that is the question asked on site; a
 * carpenter in the ensuite does not think in trade categories. What each role
 * may see (unapproved selections, costs) is decided SERVER-side by
 * server/selectionVisibility.ts, so this screen renders whatever arrived
 * without second-guessing it.
 */
export default function SelectionsScreen({ navigation, route }: Props) {
  const { projectId, projectName, projectColor } = (route.params ?? {}) as {
    projectId: string;
    projectName?: string;
    projectColor?: string | null;
  };
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('room');
  const [query, setQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  // Folded rooms/categories, remembered per project; "Show N more" per group.
  const [collapsed, setCollapsed] = usePersistedState<string[]>(`selections.collapsed.${projectId}`, []);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  /** Set when the list on screen came from disk because the network failed. */
  const [staleSince, setStaleSince] = useState<Date | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      try {
        const data = await apiFetch<Selection[]>(
          `/api/selections/with-options?projectId=${projectId}`,
        );
        const rows = data ?? [];
        setSelections(rows);
        setStaleSince(null);
        writeCachedSelections(user?.id, projectId, rows);
        // In the background: the chosen products' photos, for the basement.
        cacheSelectionPhotos(rows);
      } catch (err) {
        // No signal is the normal case on site, not an error state: fall back
        // to the last payload written to disk and say how old it is.
        const cached = await readCachedSelections(user?.id, projectId);
        if (cached) {
          setSelections(cached.selections);
          setStaleSince(cached.savedAt);
        } else if (mode === 'initial') {
          console.error('Failed to load selections:', err);
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId, user?.id],
  );

  // Paint from disk immediately, then let the network overwrite it. Opening
  // the screen underground shows the spec instead of a spinner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCachedSelections(user?.id, projectId);
      if (cached && !cancelled) {
        setSelections(cached.selections);
        setStaleSince(cached.savedAt);
        setLoading(false);
      }
      if (!cancelled) await load('initial');
    })();
    return () => {
      cancelled = true;
    };
  }, [load, projectId, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load('refresh');
    setRefreshing(false);
  }, [load]);

  const groups: SelectionGroup[] = useMemo(() => {
    const filtered = selections.filter((s) => matchesSearch(s, query));
    return groupMode === 'room' ? groupByRoom(filtered) : groupByCategory(filtered);
  }, [selections, query, groupMode]);

  const settledTotal = useMemo(
    () => selections.filter((s) => isSettled(getSelectionState(s))).length,
    [selections],
  );

  // Phone: a tap pushes SelectionDetail, as before. Duo unfolded: the item
  // opens on the right and the spec list stays put on the left.
  const { selectedId, open, isWide, paneProps } = useTwoPaneSelection({
    navigation,
    route,
    detailRoute: 'SelectionDetail',
    paramsFor: (id) => ({ selectionId: id, projectId, projectName }),
  });

  const openSelection = useCallback(
    (selection: Selection) => {
      haptic.select();
      open(selection.id);
    },
    [open],
  );

  const switchMode = (mode: GroupMode) => {
    if (mode === groupMode) return;
    haptic.select();
    setGroupMode(mode);
  };

  const pendingTotal = useMemo(
    () => selections.filter((s) => getSelectionState(s) === 'awaiting').length,
    [selections],
  );
  const searching = query.trim().length > 0;

  const toggleGroup = (title: string) => {
    haptic.select();
    setCollapsed(collapsed.includes(title) ? collapsed.filter((t) => t !== title) : [...collapsed, title]);
  };
  const toggleShowMore = (title: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });

  const project = { name: projectName ?? '', color: projectColor ?? null, id: projectId };
  const pageHeader = (
    <PageHeader
      title="Selections"
      project={projectName ? project : null}
      onBack={() => navigation.goBack()}
      actions={[
        searchVisible
          ? { icon: X, label: 'Close search', onPress: () => { setQuery(''); setSearchVisible(false); } }
          : { icon: Search, label: 'Search selections', onPress: () => setSearchVisible(true) },
      ]}
    />
  );

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top + metrics.schedule.top }]}>
        <View style={styles.headerPad}>{pageHeader}</View>
        <SkeletonList />
      </View>
    );
  }

  const sl = metrics.selections;

  // Group blocks: open groups as card lists (first 7 rows, then "Show N more"),
  // runs of collapsed groups as plain divider rows.
  const blocks: JSX.Element[] = [];
  let run: CollapsedGroup[] = [];
  const flush = () => {
    if (run.length) {
      blocks.push(<CollapsedGroupList key={`c-${blocks.length}`} groups={run} />);
      run = [];
    }
  };
  groups.forEach((g) => {
    const meta = `${g.settledCount}/${g.data.length}`;
    if (!searching && collapsed.includes(g.title)) {
      run.push({ key: g.title, title: g.title, meta, onPress: () => toggleGroup(g.title) });
      return;
    }
    flush();
    const showAll = searching || expandedGroups.has(g.title);
    const rows = showAll ? g.data : g.data.slice(0, sl.groupLimit);
    const hidden = g.data.length - rows.length;
    blocks.push(
      <View key={g.title}>
        <GroupHeader title={g.title} meta={meta} open onToggle={() => toggleGroup(g.title)} />
        <Card variant="list">
          {rows.map((item) => (
            <SpecRow key={item.id} selection={item} onPress={openSelection} selected={isWide && item.id === selectedId} />
          ))}
          {hidden > 0 || (expandedGroups.has(g.title) && g.data.length > sl.groupLimit && !searching) ? (
            <Pressable key="__more" onPress={() => toggleShowMore(g.title)} accessibilityRole="button" style={styles.more}>
              <Text style={[type.body, { color: c.accent }]}>{hidden > 0 ? `Show ${hidden} more` : 'Show less'}</Text>
            </Pressable>
          ) : null}
        </Card>
      </View>,
    );
  });
  flush();

  const list = (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingTop: (isWide ? 0 : insets.top) + metrics.schedule.top }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        {/* Phone: back + title live here. Unfolded: in the full-width header. */}
        {!isWide && pageHeader}

        {searchVisible && (
          <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Search size={metrics.projects.searchIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Room, product, brand or code"
              placeholderTextColor={c.faint}
              style={[type.body, styles.searchInput, { color: c.text }]}
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        )}

        {selections.length > 0 && (
          <ProgressLine
            value={selections.length ? settledTotal / selections.length : 0}
            label={`${settledTotal} of ${selections.length} selected${pendingTotal ? ` · ${pendingTotal} pending` : ''}`}
          />
        )}

        <UnderlineTabs
          tabs={[{ key: 'room', label: 'By room' }, { key: 'category', label: 'By category' }]}
          value={groupMode}
          onChange={switchMode}
        />

        {staleSince && (
          <View style={styles.offline}>
            <CloudOff size={size.icon.meta} color={c.status.pendingText} strokeWidth={metrics.iconStroke} />
            <Text style={[type.caption, { color: c.status.pendingText, flex: 1 }]}>
              Offline — showing the spec saved {describeAge(staleSince)}
            </Text>
          </View>
        )}

        {groups.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon={Palette}
              title={query ? 'Nothing matches' : 'No selections yet'}
              helper={query ? 'Try a room, a brand or a product code.' : 'Selections added to this project will appear here.'}
            />
          </View>
        ) : (
          blocks
        )}
      </ScrollView>
    </View>
  );

  // Always rendered through TwoPane — on a phone it is just the list — so the
  // list (scroll position, search text) stays mounted across fold/unfold.
  // The detail is keyed by id so each item starts fresh (no comment draft or
  // photo page carried over from the previous one).
  // Keyed: the PageHeader appearing before it on unfold must not shift its
  // position and remount the list (scroll, search) or the open item.
  const pane = (
    <TwoPane
      key="pane"
      {...paneProps}
      list={list}
      detail={
        selectedId ? (
          <SelectionDetailScreen
            key={selectedId}
            embedded
            navigation={navigation}
            route={{ key: `embedded-${selectedId}`, name: 'SelectionDetail', params: { selectionId: selectedId, projectId, projectName } }}
          />
        ) : null
      }
      emptyTitle="Select an item to see what's going in"
      emptyIcon="albums-outline"
    />
  );

  // Unfolded: one header across both columns, back always top-left.
  // The wrapper View is always there so the pane never remounts on fold.
  return (
    <View style={styles.screen}>
      {isWide && (
        <View key="header" style={[styles.headerPad, { paddingTop: insets.top + metrics.schedule.top, backgroundColor: c.bg }]}>
          {pageHeader}
        </View>
      )}
      {pane}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerPad: { paddingHorizontal: space.screenX, paddingBottom: metrics.scope.gap },
  list: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom, gap: metrics.scope.gap },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    minHeight: metrics.projects.searchHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
    paddingHorizontal: metrics.projects.cardPad,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  more: { paddingVertical: metrics.listRow.padY },
  empty: { minHeight: metrics.emptyState.circle * 6 },
});
