import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Camera, CheckCheck, CloudOff, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import { addSyncListener } from '../services/offlineQueue';
import { metrics, radii, size, space, tabular, type, useColors } from '../theme';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import {
  Card, Checkbox, CollapsedGroupList, EmptyState, FAB, FAB_CLEARANCE, FilterChips, GroupHeader, ListRow, PageHeader, PropertyRow, SmartImage,
  StatusDot, type DotStatus,
} from '../components/kit';
import type { CollapsedGroup } from '../components/kit';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { usePersistedState } from '../lib/usePersistedState';
import { useTwoPaneSelection } from '../lib/twoPane';
import { fromLocalDateStr, dateStrOf } from '../lib/dates';
import { TwoPane } from '../components/ui/TwoPane';
import { SkeletonList } from '../components/ui/Skeleton';
import { PendingUploadsBanner } from '../components/photo';
import { PickerSheet } from '../components/defects/PickerSheet';
import DefectDetailScreen from './DefectDetailScreen';
import {
  EMPTY_FILTERS,
  JOB_STAGES,
  JOB_STAGE_LABEL,
  STAGE_LABEL,
  STAGE_ORDER,
  defectRef,
  filterQuery,
  loadDefectRefs,
  photosByKind,
  readDefectRefs,
  type Defect,
  type DefectFilters,
  type DefectListResponse,
  type DefectStage,
  type JobStage,
  type StageCounts, DEFECT_DOT } from '../lib/defects';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

const SEARCH_DELAY_MS = 300;

/**
 * A project's defects, grouped by stage — or, with `mine: true`, every
 * defect I own, raised or watch across my projects (/api/defects/mine).
 *
 * Filters (stage, job stage, mine, overdue) are remembered between launches;
 * search goes to the server (`q`). On the Duo unfolded the open defect sits
 * on the right (TwoPane — the list stays mounted across fold/unfold).
 */
export default function DefectsListScreen({ navigation, route }: Props) {
  const { projectId, projectName, projectColor, mine: mineMode } = (route.params ?? {}) as {
    projectId?: string;
    projectName?: string;
    projectColor?: string | null;
    mine?: boolean;
  };
  const isMine = !!mineMode || !projectId;
  const c = useColors();
  const filtersRef = useRef<SheetRef>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  // Folded locations, remembered per project.
  const [collapsedGroups, setCollapsedGroups] = usePersistedState<string[]>(
    isMine ? 'defects:collapsed:mine' : `defects:collapsed:${projectId}`,
    [],
  );
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canAdd = usePermission('projects.defects', 'add');

  const [filters, setFilters] = usePersistedState<DefectFilters>(
    // v2: the single-select chips; old multi-select saves could leave "All" lit while filtered.
    isMine ? 'defects:filters:mine:v2' : 'defects:filters:v2',
    EMPTY_FILTERS,
  );
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<Defect[]>([]);
  const [counts, setCounts] = useState<StageCounts>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobStagePicker, setJobStagePicker] = useState(false);
  // Ignore answers to requests superseded by a newer filter/search.
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Trade is stored as an option key; the pickers' cached list has the names.
  const [tradeNames, setTradeNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const apply = (r: { trades: { key: string; name: string }[] } | null) => {
      if (alive && r) setTradeNames(Object.fromEntries(r.trades.map((t) => [t.key, t.name])));
    };
    readDefectRefs(projectId).then(apply);
    // Warm the cache so a walkthrough started underground has its pickers.
    loadDefectRefs(projectId).then(apply);
    return () => {
      alive = false;
    };
  }, [projectId]);

  const basePath = isMine ? '/api/defects/mine' : `/api/projects/${projectId}/defects`;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more') => {
      const id = mode === 'more' ? requestId.current : ++requestId.current;
      const qs = filterQuery(isMine ? { ...filters, mine: false } : filters, {
        q: debounced,
        ownerUserId: user?.id,
        cursor: mode === 'more' ? nextCursor : null,
      });
      try {
        const res = await apiFetch<DefectListResponse>(`${basePath}?${qs}`);
        if (id !== requestId.current) return;
        const rows = res?.items ?? [];
        setItems((prev) => (mode === 'more' ? [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))] : rows));
        if (res?.counts) setCounts(res.counts);
        setNextCursor(res?.nextCursor ?? null);
        setError(null);
      } catch (e: any) {
        if (id !== requestId.current) return;
        setError(e?.status ? e.message : 'No signal — pull down to try again.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [basePath, filters, debounced, user?.id, nextCursor, isMine],
  );

  // Reload when filters or search change.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    loadRef.current('initial');
  }, [basePath, filters, debounced]);

  // Back from capture/detail → fresh list. A queued defect reaching the
  // server → fresh list too.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      loadRef.current('refresh');
    }, []),
  );
  useEffect(() => addSyncListener(() => loadRef.current('refresh')), []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load('refresh');
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (!nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    await load('more');
    setLoadingMore(false);
  };

  const listRoute = isMine ? 'MyDefects' : 'DefectsList';
  const { selectedId, open, close, isWide, paneProps } = useTwoPaneSelection({
    navigation,
    route,
    detailRoute: 'DefectDetail',
    paramsFor: (id) => ({ defectId: id, projectId, listRoute }),
  });


  const totalCount = useMemo(
    () => STAGE_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0),
    [counts],
  );


  const activeFilterCount =
    filters.stages.length + (filters.jobStage ? 1 : 0) + (filters.mine && !isMine ? 1 : 0) + (filters.overdue ? 1 : 0);

  const startWalkthrough = () => {
    if (!projectId) return;
    haptic.light();
    navigation.navigate('DefectCapture', { projectId, projectName });
  };

  const onDetailChanged = useCallback(
    (d: Defect | null) => {
      if (!d) {
        close();
        loadRef.current('refresh');
        return;
      }
      setItems((prev) => prev.map((p) => (p.id === d.id ? { ...p, ...d } : p)));
      // Stage moved → section counts changed.
      loadRef.current('refresh');
    },
    [close],
  );

  // Location groups (the question on a walk: "what's wrong in this room?").
  const groups = useMemo(() => {
    const map = new Map<string, Defect[]>();
    for (const d of items) {
      const key = d.location?.trim() || NO_LOCATION;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries())
      .sort(([x], [y]) => (x === NO_LOCATION ? 1 : y === NO_LOCATION ? -1 : x.localeCompare(y)))
      .map(([title, data]) => ({ title, data }));
  }, [items]);

  // Single-select status chips: All, then each status that has defects.
  const activeStage: 'all' | DefectStage = filters.stages.length === 1 ? filters.stages[0] : 'all';
  const chips = [
    { key: 'all' as const, label: 'All', count: totalCount },
    ...STAGE_ORDER.filter((s) => (counts[s] ?? 0) > 0 || filters.stages.includes(s)).map((s) => ({
      key: s,
      label: STAGE_LABEL[s],
      count: counts[s] ?? 0,
    })),
  ];
  const pickStage = (key: 'all' | DefectStage) => {
    haptic.select();
    setFilters((f) => ({ ...f, stages: key === 'all' ? [] : [key] }));
  };
  // Filters behind the sliders: job stage, mine, overdue.
  const extraFilterCount = (filters.jobStage ? 1 : 0) + (filters.mine && !isMine ? 1 : 0) + (filters.overdue ? 1 : 0);
  const nothingAtAll = !loading && totalCount === 0 && activeFilterCount === 0 && !debounced && !error;

  const toggleGroup = (title: string) => {
    haptic.select();
    setCollapsedGroups(collapsedGroups.includes(title) ? collapsedGroups.filter((t) => t !== title) : [...collapsedGroups, title]);
  };

  const pageHeader = (
    <PageHeader
      title={isMine ? 'My defects' : 'Defects'}
      project={projectName && !isMine ? { name: projectName, color: projectColor ?? null, id: projectId } : null}
      onBack={() => navigation.goBack()}
      actions={nothingAtAll ? undefined : [
        searchVisible
          ? { icon: X, label: 'Close search', onPress: () => { setQuery(''); setSearchVisible(false); } }
          : { icon: Search, label: 'Search defects', onPress: () => setSearchVisible(true) },
        { icon: SlidersHorizontal, label: 'More filters', onPress: () => filtersRef.current?.present(), active: extraFilterCount > 0 },
      ]}
    />
  );

  const header = (
    <View style={[dl.header, { paddingTop: isWide ? 0 : insets.top + metrics.schedule.top }]}>
      {/* Phone: back + title here. Unfolded: in the full-width header. */}
      {!isWide && pageHeader}

      {searchVisible && (
        <View style={[dl.search, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Search size={metrics.projects.searchIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Title, location, trade or D-number"
            placeholderTextColor={c.faint}
            style={[type.body, dl.searchInput, { color: c.text }]}
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      )}

      {!nothingAtAll && <FilterChips chips={chips} value={activeStage} onChange={pickStage} />}

      <PendingUploadsBanner projectId={isMine ? undefined : projectId} types={['create-defect']} noun="defect" />
      {error && items.length > 0 ? (
        <Text style={[type.caption, { color: c.status.pendingText }]}>{error}</Text>
      ) : null}
    </View>
  );

  const renderRow = (item: Defect) => {
    const selected = isWide && item.id === selectedId;
    const thumb = photosByKind(item.attachments).before[0] ?? photosByKind(item.attachments).after[0];
    const due = dateStrOf(item.dueDate ?? null);
    const closed = item.stage === 'closed';
    const overdue = !!item.overdue && !closed;
    const dot = DEFECT_DOT[item.stage] ?? DEFECT_DOT.open;
    const trade = item.assignedContactName || (item.trade ? tradeNames[item.trade] ?? item.trade : null);
    const closedKey = closed && item.closedAt ? dateStrOf(item.closedAt) : '';
    const when = closedKey
      ? `Closed ${shortDate(closedKey)}`
      : !closed && due
        ? `${overdue ? 'Overdue' : 'Due'} ${shortDate(due)}`
        : null;
    const sep = <Text style={{ color: c.faint }}>{' · '}</Text>;
    return (
      <Pressable
        key={item.id}
        onPress={() => {
          haptic.select();
          open(item.id);
        }}
        style={({ pressed }) => [dl.row, selected && { backgroundColor: c.tint }, pressed && { opacity: metrics.pressedOpacity }]}
        accessibilityRole="button"
        accessibilityLabel={`${defectRef(item)} ${item.title}`}
      >
        <SmartImage uri={thumb?.url ?? null} width={size.thumb} height={size.thumb} radius={radii.md} fallbackIcon={Camera} />
        <View style={dl.rowText}>
          <Text style={[type.rowTitle, { color: closed ? c.muted : c.text }]} numberOfLines={2}>
            <Text style={[type.body, tabular, { color: c.muted }]}>{`${defectRef(item)}  `}</Text>
            {item.title}
          </Text>
          <View style={dl.meta}>
            <StatusDot status={dot} />
            <Text style={[type.caption, { color: dot === 'rejected' ? c.danger : dot === 'pending' ? c.status.pendingText : c.muted, flexShrink: 1 }]} numberOfLines={1}>
              {STAGE_LABEL[item.stage] ?? item.stage}
              {isMine && item.projectName ? <>{sep}{item.projectName}</> : null}
              {/* The date matters most, so it comes before trade and survives truncation. */}
              {when ? <>{sep}<Text style={{ color: overdue ? c.danger : c.muted }}>{when}</Text></> : null}
              {trade ? <>{sep}<Text style={{ color: c.muted }}>{trade}</Text></> : null}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  // Open groups as sections; collapsed ones move to the foot as plain divider
  // rows (spec §8).
  const sections = groups
    .filter((g) => !collapsedGroups.includes(g.title))
    .map((g) => ({ title: g.title, count: g.data.length, data: [g.data] }));
  const foldedGroups: CollapsedGroup[] = groups
    .filter((g) => collapsedGroups.includes(g.title))
    .map((g) => ({ key: g.title, title: g.title, meta: String(g.data.length), onPress: () => toggleGroup(g.title) }));

  const list = (
    <View style={[dl.screen, { backgroundColor: c.bg }]}>
      {loading && items.length === 0 ? (
        <>
          {header}
          <SkeletonList count={7} />
        </>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(_rows, i) => String(i)}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: rows }) => <Card variant="list">{rows.map(renderRow)}</Card>}
          renderSectionHeader={({ section }) => (
            <View style={dl.groupHeader}>
              <GroupHeader
                title={section.title}
                meta={section.count}
                open
                onToggle={() => toggleGroup(section.title)}
              />
            </View>
          )}
          SectionSeparatorComponent={() => <View style={dl.sectionGap} />}
          extraData={[isWide ? selectedId : null, collapsedGroups, tradeNames]}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[dl.listContent, { paddingBottom: (canAdd && !isMine ? FAB_CLEARANCE : 0) + space.screenBottom + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            foldedGroups.length || loadingMore ? (
              <>
                {foldedGroups.length ? <View style={sections.length ? dl.foldedTop : undefined}><CollapsedGroupList groups={foldedGroups} /></View> : null}
                {loadingMore ? <ActivityIndicator style={dl.more} color={c.accent} /> : null}
              </>
            ) : undefined
          }
          ListEmptyComponent={
            foldedGroups.length ? undefined : (
            <View style={dl.empty}>
              <EmptyState
                icon={error ? CloudOff : CheckCheck}
                title={error ? "Couldn't load defects" : debounced || activeFilterCount ? 'Nothing matches' : 'No defects'}
                helper={
                  error
                    ? error
                    : debounced || activeFilterCount
                      ? 'Try another search or clear the filters.'
                      : isMine
                        ? 'Defects you own, raise or watch show here.'
                        : 'Walk the job and photograph anything that needs fixing. Each one goes straight to the list.'
                }
              />
            </View>
            )
          }
        />
      )}

      {canAdd && !isMine && <FAB icon={Camera} onPress={startWalkthrough} label="Add defects" />}

      <Sheet ref={filtersRef} title="Filters">
        <View style={dl.sheetBody}>
          <Card variant="list">
            <PropertyRow
              form
              label="Job stage"
              value={filters.jobStage ? JOB_STAGE_LABEL[filters.jobStage] : undefined}
              placeholder="Any"
              onPress={() => {
                haptic.light();
                filtersRef.current?.dismiss();
                setTimeout(() => setJobStagePicker(true), 250);
              }}
            />
            {!isMine ? (
              <ListRow
                title="Mine only"
                titleLines={1}
                trailing={<Checkbox checked={filters.mine} />}
                onPress={() => { haptic.select(); setFilters((f) => ({ ...f, mine: !f.mine })); }}
              />
            ) : null}
            <ListRow
              title="Overdue only"
              titleLines={1}
              trailing={<Checkbox checked={filters.overdue} />}
              onPress={() => { haptic.select(); setFilters((f) => ({ ...f, overdue: !f.overdue })); }}
            />
          </Card>
          {activeFilterCount > 0 ? (
            <Pressable
              onPress={() => { haptic.select(); setFilters(EMPTY_FILTERS); filtersRef.current?.dismiss(); }}
              accessibilityRole="button"
              style={dl.clear}
            >
              <Text style={[type.body, { color: c.accent }]}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>
      </Sheet>

      <PickerSheet
        visible={jobStagePicker}
        title="Job stage"
        options={JOB_STAGES.map((s) => ({ value: s, label: JOB_STAGE_LABEL[s] }))}
        selected={filters.jobStage}
        allowNone
        noneLabel="Any job stage"
        searchable={false}
        onSelect={(o) => {
          setFilters((f) => ({ ...f, jobStage: (o?.value as JobStage) ?? null }));
          setJobStagePicker(false);
        }}
        onClose={() => setJobStagePicker(false)}
      />
    </View>
  );

  const pane = (
    <TwoPane
      key="pane"
      {...paneProps}
      list={list}
      detail={
        selectedId ? (
          <DefectDetailScreen
            key={selectedId}
            embedded
            navigation={navigation}
            onChanged={onDetailChanged}
            route={{ key: `embedded-${selectedId}`, name: 'DefectDetail', params: { defectId: selectedId, projectId, listRoute } }}
          />
        ) : null
      }
      emptyTitle="Select a defect"
      emptyIcon="construct-outline"
    />
  );

  // Unfolded: one header across both columns, back always top-left. Keyed
  // so the header appearing on unfold never remounts the pane.
  return (
    <View style={styles.screen}>
      {isWide && (
        <View key="header" style={[dl.wideHeader, { paddingTop: insets.top + metrics.schedule.top, backgroundColor: c.bg }]}>
          {pageHeader}
        </View>
      )}
      {pane}
    </View>
  );
}

const NO_LOCATION = 'No location';


function shortDate(dateStr: string): string {
  return fromLocalDateStr(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

const dl = StyleSheet.create({
  screen: { flex: 1 },
  wideHeader: { paddingHorizontal: space.screenX, paddingBottom: metrics.scope.gap },
  header: { gap: metrics.scope.gap, paddingBottom: metrics.scope.gap },
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
  listContent: { paddingHorizontal: space.screenX },
  groupHeader: {},
  sectionGap: { height: metrics.defects.groupGap / 2 },
  foldedTop: { paddingTop: metrics.defects.groupGap },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, paddingVertical: metrics.defects.rowPadY },
  rowText: { flex: 1, minWidth: 0, gap: metrics.defects.rowGap },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  more: { paddingVertical: space.section },
  empty: { minHeight: metrics.emptyState.circle * 7 },
  sheetBody: { paddingHorizontal: space.screenX, paddingTop: space.inline, gap: space.rowGap },
  clear: { alignSelf: 'center', paddingVertical: space.inline },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
