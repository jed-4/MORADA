import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useAuth } from '../contexts/AuthContext';
import { apiFetch, getAuthedImageSource } from '../services/api';
import { addSyncListener } from '../services/offlineQueue';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { usePersistedState } from '../lib/usePersistedState';
import { useTwoPaneSelection } from '../lib/twoPane';
import { fromLocalDateStr, dateStrOf } from '../lib/dates';
import { TwoPane } from '../components/ui/TwoPane';
import { SkeletonList } from '../components/ui/Skeleton';
import { PendingUploadsBanner } from '../components/photo';
import { StageChip } from '../components/defects/StageChip';
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
  groupByStage,
  loadDefectRefs,
  photosByKind,
  readDefectRefs,
  type Defect,
  type DefectFilters,
  type DefectListResponse,
  type DefectStage,
  type JobStage,
  type StageCounts,
} from '../lib/defects';

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
  const { projectId, projectName, mine: mineMode } = (route.params ?? {}) as {
    projectId?: string;
    projectName?: string;
    mine?: boolean;
  };
  const isMine = !!mineMode || !projectId;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canAdd = usePermission('projects.defects', 'add');

  const [filters, setFilters] = usePersistedState<DefectFilters>(
    isMine ? 'defects:filters:mine' : 'defects:filters',
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

  const sections = useMemo(
    () => groupByStage(items).map((g) => ({ stage: g.stage, data: g.data })),
    [items],
  );

  const totalCount = useMemo(
    () => STAGE_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0),
    [counts],
  );

  const toggleStage = (s: DefectStage) => {
    haptic.select();
    setFilters((f) => ({ ...f, stages: f.stages.includes(s) ? f.stages.filter((x) => x !== s) : [...f.stages, s] }));
  };

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

  const chip = (key: string, label: string, active: boolean, onPress: () => void, count?: number) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>
        {label}
        {count != null ? ` ${count}` : ''}
      </Text>
    </Pressable>
  );

  const header = (
    <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: insets.top + 8 }]}>
      <View style={styles.headerTop}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{isMine ? 'My defects' : 'Defects'}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
            {projectName && !isMine ? `${projectName} · ` : ''}
            {totalCount} {totalCount === 1 ? 'defect' : 'defects'}
            {activeFilterCount ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        {activeFilterCount > 0 && (
          <Pressable
            onPress={() => {
              haptic.select();
              setFilters(EMPTY_FILTERS);
            }}
            style={styles.clearBtn}
            accessibilityRole="button"
          >
            <Text style={[styles.clearText, { color: theme.primary }]}>Clear</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.search, { backgroundColor: theme.subtle }]}>
        <Ionicons name="search" size={15} color={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Title, location, trade or D-number"
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, { color: theme.textPrimary }]}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {STAGE_ORDER.map((s) => chip(s, STAGE_LABEL[s], filters.stages.includes(s), () => toggleStage(s), counts[s] ?? 0))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chip('jobStage', filters.jobStage ? JOB_STAGE_LABEL[filters.jobStage] : 'Any job stage', !!filters.jobStage, () => {
          haptic.light();
          setJobStagePicker(true);
        })}
        {!isMine && chip('mine', 'Mine', filters.mine, () => {
          haptic.select();
          setFilters((f) => ({ ...f, mine: !f.mine }));
        })}
        {chip('overdue', 'Overdue', filters.overdue, () => {
          haptic.select();
          setFilters((f) => ({ ...f, overdue: !f.overdue }));
        })}
      </ScrollView>

      <PendingUploadsBanner projectId={isMine ? undefined : projectId} types={['create-defect']} noun="defect" />
      {error && items.length > 0 ? (
        <Text style={[styles.errorLine, { color: theme.statusWarning }]}>{error}</Text>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: Defect }) => {
    const selected = isWide && item.id === selectedId;
    const thumb = photosByKind(item.attachments).before[0] ?? photosByKind(item.attachments).after[0];
    const due = dateStrOf(item.dueDate ?? null);
    const overdue = !!item.overdue && item.stage !== 'closed';
    return (
      <Pressable
        onPress={() => {
          haptic.select();
          open(item.id);
        }}
        style={[
          styles.row,
          { backgroundColor: theme.card, borderColor: selected ? theme.primary : theme.border },
          selected && { borderWidth: 2 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${defectRef(item)} ${item.title}`}
      >
        <View style={[styles.thumb, { backgroundColor: theme.subtle }]}>
          {thumb ? (
            <Image source={getAuthedImageSource(thumb.url)} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Ionicons name="image-outline" size={20} color={theme.textMuted} />
          )}
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowRef, { color: theme.textMuted }]} numberOfLines={1}>
            {defectRef(item)}
            {isMine && item.projectName ? ` · ${item.projectName}` : ''}
          </Text>
          <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
            {[item.location, item.assignedContactName || (item.trade ? tradeNames[item.trade] ?? item.trade : null), item.ownerName].filter(Boolean).join(' · ') || JOB_STAGE_LABEL[item.jobStage]}
          </Text>
          <View style={styles.rowFoot}>
            <StageChip stage={item.stage} small />
            {due ? (
              <Text style={[styles.rowDue, { color: overdue ? theme.statusDanger : theme.textMuted }]}>
                {overdue ? 'Overdue · ' : 'Due '}
                {fromLocalDateStr(due).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  const list = (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {header}
      {loading && items.length === 0 ? (
        <SkeletonList count={7} style={styles.skeleton} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(d) => d.id}
          renderItem={renderRow}
          extraData={isWide ? selectedId : null}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + (canAdd && !isMine ? 96 : 32) }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.groupHeader}>
              <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>{STAGE_LABEL[section.stage]}</Text>
              <View style={[styles.groupRule, { backgroundColor: theme.border }]} />
              <Text style={[styles.groupCount, { color: theme.textMuted }]}>{counts[section.stage] ?? section.data.length}</Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.more} color={theme.primary} /> : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'checkmark-done-circle-outline'} size={36} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                {error ? "Couldn't load defects" : query || activeFilterCount ? 'Nothing matches' : 'No defects'}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {error
                  ? error
                  : query || activeFilterCount
                    ? 'Try another search or clear the filters.'
                    : isMine
                      ? "Defects you own, raise or watch show here."
                      : 'Walk the job and photograph anything that needs fixing.'}
              </Text>
            </View>
          }
        />
      )}

      {canAdd && !isMine && (
        <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
          <Pressable
            onPress={startWalkthrough}
            style={[styles.fab, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Add defects"
          >
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.fabText}>Add defects</Text>
          </Pressable>
        </View>
      )}

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

  return (
    <TwoPane
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
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 44, height: 44, marginLeft: -12, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  subtitle: { fontSize: fontSize.xs, marginTop: 1 },
  clearBtn: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  clearText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.lg, paddingHorizontal: 10, minHeight: 40 },
  searchInput: { flex: 1, fontSize: fontSize.sm, paddingVertical: 8 },
  chips: { gap: 6, paddingRight: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  errorLine: { fontSize: fontSize.xs },
  skeleton: { padding: 16, gap: 16 },
  listContent: { padding: 14 },
  separator: { height: 8 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 8 },
  groupTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 0.7, textTransform: 'uppercase' },
  groupRule: { flex: 1, height: StyleSheet.hairlineWidth },
  groupCount: { fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 88,
  },
  thumb: { width: 68, height: 68, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowRef: { fontSize: fontSize.table, fontWeight: fontWeight.semibold, fontVariant: ['tabular-nums'] },
  rowTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold },
  rowMeta: { fontSize: fontSize.xs },
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rowDue: { fontSize: fontSize.table, fontWeight: fontWeight.medium },
  more: { marginVertical: 16 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  emptyBody: { fontSize: fontSize.bodySm, textAlign: 'center', lineHeight: 19 },
  fabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 26,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
