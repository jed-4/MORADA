import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleX, CloudOff, FolderOpen, Search, X } from 'lucide-react-native';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { metrics, radii, size, space, tabular, type, useColors } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { compareProjects } from '../lib/projects';
import { formatShortCents } from '../lib/format';
import { TwoPane } from '../components/ui/TwoPane';
import { useTwoPaneSelection } from '../lib/twoPane';
import { usePersistedState } from '../lib/usePersistedState';
import ProjectDetailScreen from './ProjectDetailScreen';
import { ProjectRail } from '../components/projects/ProjectRail';
import { readableFrame } from '../components/ui/ReadableColumn';
import { SkeletonList } from '../components/ui/Skeleton';
import { Card, Divider, EmptyState, FilterChips, GroupHeader, ProgressLine, ProjectSquare, RootTitle } from '../components/kit';

interface Project {
  id: string;
  name: string;
  jobNumber?: string;
  projectNumber?: string;
  clientName?: string;
  currentSystemPhase?: string;
  projectSubStatus?: string;
  address?: string;
  color?: string;
  createdAt?: string;
  // Financial fields — server stores ALL values in cents.
  budget?: number;          // legacy internal budget (cents)
  clientBudget?: number;    // client's budget (cents)
  contractCost?: number;    // agreed contract cost (cents)
  contractPrice?: number;   // locked contract price set at construction (cents)
  // Completion — two sources:
  // `progress`: dynamically computed from schedule item progressPercent (enriched by GET /api/projects)
  // `percentComplete`: manually-set field used by OH predictor, almost always 0
  progress?: number | null;
  percentComplete?: number;
  // Dates
  startDate?: string;
  endDate?: string;
  proposedStartDate?: string;
  proposedEndDate?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: any };
};

// Stage groups, in pipeline order. Anything with an unknown / missing phase
// lands in "Other" so no project ever disappears from the list.
const GROUPS = [
  { key: 'lead', label: 'Lead' },
  { key: 'pre_construction', label: 'Pre-construction' },
  { key: 'construction', label: 'Construction' },
  { key: 'post_construction', label: 'Post-construction' },
  { key: 'other', label: 'Other' },
] as const;
type GroupKey = (typeof GROUPS)[number]['key'];

const CHIPS: { key: 'all' | GroupKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lead', label: 'Lead' },
  { key: 'pre_construction', label: 'Pre-con' },
  { key: 'construction', label: 'Construction' },
  { key: 'post_construction', label: 'Post-con' },
];

const groupOf = (p: Project): GroupKey =>
  (GROUPS.find(g => g.key === p.currentSystemPhase)?.key ?? 'other') as GroupKey;

type Row =
  | { kind: 'header'; key: string; group: GroupKey; label: string; count: number; open: boolean; first: boolean }
  | { kind: 'card'; key: string; project: Project; last: boolean };

export default function ProjectsScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  // Mirror server-side authority check used by GET /api/projects in
  // server/routes.ts: roleName matched case-insensitively against
  // admin / owner / general manager. The backend remains authoritative.
  const canViewFinancials = (() => {
    const r = (user?.roleName ?? '').toLowerCase();
    return (
      r.includes('admin') ||
      r.includes('owner') ||
      r.includes('general manager')
    );
  })();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  // Remembered between launches, so search opens on the stage you last used.
  const [activePhase, setActivePhase] = usePersistedState<'all' | GroupKey>('projects.phase', 'all');
  // Post-construction starts collapsed (design); every toggle is remembered.
  const [collapsed, setCollapsed] = usePersistedState<Record<string, boolean>>('projects.collapsed', { post_construction: true });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const insets = useSafeAreaInsets();
  const c = useColors();
  // Phone: a tap pushes the project. Duo unfolded: it opens on the right.
  const { selectedId, open, isWide, paneProps } = useTwoPaneSelection({
    navigation,
    route,
    detailRoute: 'ProjectDetail',
    // `progress` rides along so the detail header can draw its progress line
    // (only the list endpoint computes it).
    paramsFor: (id: string) => {
      const p = projects.find(x => x.id === id);
      return { projectId: id, projectName: p?.name, progress: p?.progress ?? null };
    },
  });

  const fetchProjects = useCallback(async () => {
    try {
      const data = await apiFetch<Project[]>('/api/projects');
      // Mirror the web ProjectSwitcher's client-side filter: exclude archived
      // and business projects regardless of what the server version returns.
      const active = (data || []).filter((p: any) => !p.isArchived && !p.isBusiness);
      setProjects(active);
      setError(false);
    } catch (e) {
      console.error('Failed to fetch projects:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }, [fetchProjects]);

  // Search only narrows while the search bar is open.
  const searching = searchVisible && (search.trim() !== '' || activePhase !== 'all');

  const filteredProjects = useMemo(() => {
    let filtered = searchVisible && activePhase !== 'all' ? projects.filter(p => groupOf(p) === activePhase) : projects;
    if (searchVisible && search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.name?.toLowerCase().includes(q) ||
          p.clientName?.toLowerCase().includes(q) ||
          p.jobNumber?.toLowerCase().includes(q) ||
          p.projectNumber?.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort(compareProjects);
  }, [projects, search, searchVisible, activePhase]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let first = true;
    for (const g of GROUPS) {
      const items = filteredProjects.filter(p => groupOf(p) === g.key);
      if (items.length === 0) continue;
      // While searching every matching group is open, so a hit is never hidden.
      const isOpen = searching || !collapsed[g.key];
      out.push({ kind: 'header', key: `h:${g.key}`, group: g.key, label: g.label, count: items.length, open: isOpen, first });
      first = false;
      if (isOpen) items.forEach((p, i) => out.push({ kind: 'card', key: p.id, project: p, last: i === items.length - 1 }));
    }
    return out;
  }, [filteredProjects, collapsed, searching]);

  const toggleGroup = (key: GroupKey) => setCollapsed({ ...collapsed, [key]: !collapsed[key] });

  const openSearchOn = (key: GroupKey) => {
    setSearchVisible(true);
    setActivePhase(key);
  };

  const closeSearch = () => {
    setSearchVisible(false);
    setSearch('');
  };

  const m = metrics.projects;

  const renderCard = (item: Project, last: boolean) => {
    const color = item.color || null;
    // `progress` is computed by the server from schedule item progressPercent
    // values; null when a project has no schedule. Construction cards only.
    const showProgress = groupOf(item) === 'construction' && typeof item.progress === 'number';
    // Headline value (cents), role-gated. Same priority as before.
    const value = canViewFinancials
      ? formatShortCents(item.contractPrice ?? item.contractCost ?? item.clientBudget ?? item.budget)
      : null;
    const selected = isWide && selectedId === item.id;
    return (
      <Pressable
        onPress={() => open(item.id)}
        accessibilityRole="button"
        accessibilityLabel={[item.name, item.clientName, value].filter(Boolean).join(', ')}
        style={({ pressed }) => [{ marginBottom: last ? 0 : m.cardGap, opacity: pressed ? metrics.pressedOpacity : 1 }]}
      >
        <Card style={[styles.card, selected && { backgroundColor: c.tint, borderColor: c.accentLine }]}>
          <ProjectSquare color={color} fallbackKey={item.id} size="card" />
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={[type.cardTitle, { color: c.text, flex: 1 }]} numberOfLines={2}>
                {item.name}
              </Text>
              {value ? <Text style={[type.rowTitle, tabular, { color: c.text }]}>{value}</Text> : null}
            </View>
            {!!item.clientName && (
              <Text style={[type.meta, { color: c.muted }]} numberOfLines={1}>
                {item.clientName}
              </Text>
            )}
            {showProgress ? (
              <View style={styles.progress}>
                <ProgressLine value={(item.progress ?? 0) / 100} color={color} trackColor={c.hairline} />
              </View>
            ) : null}
          </View>
        </Card>
      </Pressable>
    );
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'card') return renderCard(item.project, item.last);
    return (
      <View style={[styles.groupHeader, !item.first && { marginTop: m.groupGap }]}>
        <GroupHeader
          title={item.label}
          meta={item.count}
          open={item.open}
          onToggle={() => toggleGroup(item.group)}
          onOpen={item.group === 'other' ? undefined : () => openSearchOn(item.group)}
        />
        {!item.open ? <Divider /> : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top + m.contentTop }]}>
        <View style={styles.titleRow}>
          <RootTitle title="Projects" />
        </View>
        <SkeletonList />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <EmptyState icon={CloudOff} title="Couldn't load your projects" helper="Check your connection, then try again." />
        <Pressable
          onPress={() => { setLoading(true); fetchProjects(); }}
          accessibilityRole="button"
          style={styles.retry}
        >
          <Text style={[type.body, { color: c.accent }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const header = (
    <View style={styles.titleRow}>
      <RootTitle
        title="Projects"
        count={projects.length}
        accentActions
        actions={[
          searchVisible
            ? { icon: X, label: 'Close search', onPress: closeSearch }
            : { icon: Search, label: 'Search projects', onPress: () => setSearchVisible(true) },
        ]}
      />
      {searchVisible && (
        <View style={styles.searchBlock}>
          <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Search size={m.searchIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
            <TextInput
              style={[type.body, styles.searchInput, { color: c.text }]}
              placeholder="Search projects"
              placeholderTextColor={c.faint}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={metrics.hitSlop} accessibilityLabel="Clear search">
                <CircleX size={m.searchIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
              </Pressable>
            )}
          </View>
          <FilterChips chips={CHIPS} value={activePhase} onChange={setActivePhase} />
        </View>
      )}
    </View>
  );

  const listPane = (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <FlatList
        data={rows}
        keyExtractor={item => item.key}
        renderItem={renderRow}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingTop: insets.top + m.contentTop }, isWide && readableFrame]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyState
              icon={FolderOpen}
              title={searching ? 'No matching projects' : 'No projects yet'}
              helper={searching ? 'Try another name, client or job number.' : 'Projects you can see will show here.'}
            />
          </View>
        }
      />
    </View>
  );

  return (
    <TwoPane
      {...paneProps}
      list={listPane}
      // Unfolded: a job open → the list collapses to a sidebar of job badges.
      rail={<ProjectRail projects={filteredProjects} selectedId={selectedId} onSelect={open} />}
      detailKey={selectedId}
      emptyTitle="Select a project"
      emptyIcon="briefcase-outline"
      detail={
        selectedId ? (
          <ProjectDetailScreen
            key={selectedId}
            embedded
            navigation={navigation}
            route={{ key: `embedded-${selectedId}`, name: 'ProjectDetail', params: { projectId: selectedId, progress: projects.find(p => p.id === selectedId)?.progress ?? null } } as any}
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom },
  titleRow: { marginBottom: space.sectionRoot },
  searchBlock: { marginTop: metrics.projects.searchGap, gap: metrics.projects.searchGap },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    minHeight: metrics.projects.searchHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
    paddingHorizontal: metrics.projects.cardPad,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  groupHeader: { paddingTop: metrics.projects.groupTopPad, marginBottom: metrics.projects.cardGap - space.groupHeaderToCard },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: metrics.projects.cardInnerGap,
    // Explicit sides: Card's own paddingTop/Bottom would beat a `padding` shorthand.
    paddingTop: metrics.projects.cardPad,
    paddingBottom: metrics.projects.cardPad,
    paddingHorizontal: metrics.projects.cardPad,
  },
  cardBody: { flex: 1, gap: metrics.listRow.bodyGap },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: metrics.projects.cardInnerGap },
  progress: { marginTop: metrics.projects.progressTop - metrics.listRow.bodyGap },
  empty: { minHeight: metrics.emptyState.circle * 6 },
  retry: { alignSelf: 'center', padding: space.section, marginBottom: metrics.emptyState.padBottom },
});
