import { useState, useCallback, useEffect, useLayoutEffect, type JSX } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, Layers, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { metrics, radii, size, space, type, useColors } from '../theme';
import { usePersistedState } from '../lib/usePersistedState';
import { Card, Checkbox, CollapsedGroupList, EmptyState, GroupHeader, PageHeader, ProgressLine, type CollapsedGroup } from '../components/kit';
import { readableFrame } from '../components/ui/ReadableColumn';
import { haptic } from '../lib/haptics';
import { SkeletonList } from '../components/ui/Skeleton';
interface ScopeStage {
  id: string;
  name: string;
  displayOrder: number;
  isCompleted: boolean;
}

interface GearItem {
  name: string;
  checked: boolean;
  photoUrl?: string;
}

interface ChecklistItemEntry {
  id: string;
  text: string;
  completed: boolean;
}

interface ScopeItem {
  id: string;
  projectId: string;
  stage: string;
  title: string;
  description?: string;
  itemType: string;
  displayOrder: number;
  isCompleted: boolean;
  gearList?: GearItem[];
  checklistItems?: ChecklistItemEntry[];
  parentId?: string | null;
}

interface ScopeItemTypeDef {
  id: string;
  name: string;
  displayOrder: number;
  visibleToRoles: string[];
  companyId: string;
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

export default function ScopeScreen({ navigation, route }: Props) {
  const { projectId, projectName, projectColor } = route.params as { projectId: string; projectName?: string; projectColor?: string | null };
  const { user } = useAuth();

  const [stages, setStages] = useState<ScopeStage[]>([]);
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [typeDefs, setTypeDefs] = useState<ScopeItemTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  // Which categories are folded, remembered per project (GOTCHAS #15).
  const [collapsedIds, setCollapsedIds] = usePersistedState<string[]>(`scope.collapsed.${projectId}`, []);
  const [showAllLines, setShowAllLines] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const insets = useSafeAreaInsets();
  const k = useColors();

  // One-row PageHeader instead of the stack header.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const toggleShowAll = (id: string) =>
    setShowAllLines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });


  const roleName = user?.roleName ?? '';
  const isAdmin =
    roleName.toLowerCase().includes('admin') ||
    roleName.toLowerCase().includes('owner') ||
    roleName.toLowerCase().includes('general manager');
  const currentRoleId = user?.roleId ?? null;
  // Edit permission: team members and suppliers can mark items complete; clients are read-only.
  // userCategory is the canonical permission signal for scope item completion throughout the app
  // (team = internal staff, supplier = subcontractor, client = owner/purchaser, read-only only).
  const canEdit = user?.userCategory !== 'client';

  const visibleTypeDefs = typeDefs.filter(def => {
    const roles = (def.visibleToRoles as string[]) ?? [];
    if (roles.length === 0) return true;
    if (isAdmin) return true;
    if (!currentRoleId) return false;
    return roles.includes(currentRoleId);
  });

  const isItemVisible = useCallback(
    (item: ScopeItem): boolean => {
      // No type definitions configured for this company — show all items
      if (typeDefs.length === 0) return true;
      const type = (item.itemType || 'scope').toLowerCase();
      const allDef = typeDefs.find(d => d.name.toLowerCase() === type);
      // Item has a type not present in company definitions (e.g. legacy/deleted type)
      // Default to visible rather than hiding unexpectedly
      if (!allDef) return true;
      // Type exists but not visible to this role — hide for non-admins
      const visibleDef = visibleTypeDefs.find(d => d.name.toLowerCase() === type);
      if (!visibleDef && !isAdmin) return false;
      return true;
    },
    [typeDefs, visibleTypeDefs, isAdmin]
  );

  const fetchData = useCallback(async () => {
    try {
      const [stagesData, itemsData, typeDefsData] = await Promise.all([
        apiFetch<ScopeStage[]>(`/api/projects/${projectId}/scope-stages`).catch(() => []),
        apiFetch<ScopeItem[]>(`/api/projects/${projectId}/scope`).catch(() => []),
        apiFetch<ScopeItemTypeDef[]>('/api/scope-item-types').catch(() => []),
      ]);
      setStages((stagesData || []).sort((a, b) => a.displayOrder - b.displayOrder));
      setItems(itemsData || []);
      setTypeDefs(typeDefsData || []);
    } catch (e) {
      console.error('Failed to fetch scope data:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleCompletion = async (item: ScopeItem) => {
    if (!canEdit) return;
    const newVal = !item.isCompleted;
    if (newVal) haptic.success(); else haptic.select();
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isCompleted: newVal } : i)));
    try {
      await apiRequest(`/api/scope/${item.id}`, 'PATCH', { isCompleted: newVal });
    } catch (err: any) {
      // Roll back the optimistic update (network failure or server rejection)
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isCompleted: item.isCompleted } : i)));
      Alert.alert('Error', err?.message || 'Failed to update scope item.');
    }
  };

  const toggleStageCompletion = async (stage: ScopeStage) => {
    if (!canEdit) return;
    const newVal = !stage.isCompleted;
    // Optimistically update stage
    setStages(prev => prev.map(s => (s.id === stage.id ? { ...s, isCompleted: newVal } : s)));
    // Cascade: mark all items in the stage as completed/incomplete
    setItems(prev =>
      prev.map(item =>
        item.stage === stage.name ? { ...item, isCompleted: newVal } : item
      )
    );
    // Collapse the stage when marking complete, expand when uncompleting
    const prevCollapsed = collapsedIds;
    if (newVal) {
      if (!collapsedIds.includes(stage.id)) setCollapsedIds([...collapsedIds, stage.id]);
    } else {
      setCollapsedIds(collapsedIds.filter(x => x !== stage.id));
    }
    try {
      await apiRequest(`/api/scope-stages/${stage.id}`, 'PATCH', {
        isCompleted: newVal,
        completedAt: newVal ? new Date().toISOString() : null,
      });
    } catch (err: any) {
      // Rollback both stage and items (network failure or server rejection)
      setStages(prev => prev.map(s => (s.id === stage.id ? { ...s, isCompleted: stage.isCompleted } : s)));
      setItems(prev =>
        prev.map(item =>
          item.stage === stage.name ? { ...item, isCompleted: !newVal } : item
        )
      );
      // Roll the fold back too.
      setCollapsedIds(prevCollapsed);
      Alert.alert('Error', err?.message || 'Failed to update stage.');
    }
  };

  // Items per stage (top-level, visible to this role), in display order.
  const sectionData = stages.map(stage => {
    const stageItems = items
      .filter(item => item.stage === stage.name && !item.parentId && isItemVisible(item))
      .sort((a, b) => a.displayOrder - b.displayOrder);
    return {
      stage,
      allItemCount: stageItems.length,
      // Numerator computed from the SAME filtered list as the denominator so
      // hidden/child items can't push the count above the total (e.g. "3/2").
      completedCount: stageItems.filter(i => i.isCompleted).length,
      items: stageItems,
    };
  }).filter(s => s.allItemCount > 0 || s.stage.isCompleted);

  const totalCount = sectionData.reduce((n, sct) => n + sct.allItemCount, 0);
  const doneCount = sectionData.reduce((n, sct) => n + sct.completedCount, 0);

  // Search + "hide done" narrow what's shown; counts stay the real ones.
  const q = search.trim().toLowerCase();
  const matches = (item: ScopeItem) =>
    (!hideDone || !item.isCompleted) &&
    (!q || item.title.toLowerCase().includes(q) || stripHtml(item.description).toLowerCase().includes(q));

  const toggleStage = (id: string) => {
    haptic.select();
    const next = collapsedIds.includes(id) ? collapsedIds.filter(x => x !== id) : [...collapsedIds, id];
    setCollapsedIds(next);
  };

  // Long-press a category to tick (or un-tick) every item in it — the old
  // category checkbox, which the design drops from view.
  const confirmStageCompletion = (stage: ScopeStage) => {
    if (!canEdit) return;
    haptic.light();
    Alert.alert(
      stage.isCompleted ? `Reopen ${stage.name}?` : `Mark all of ${stage.name} done?`,
      stage.isCompleted ? 'Every item in this category goes back to not done.' : 'Every item in this category will be ticked.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: stage.isCompleted ? 'Reopen' : 'Mark done', onPress: () => toggleStageCompletion(stage) },
      ],
    );
  };

  const header = (
    <View style={sx.top}>
      <PageHeader
        title="Scope"
        project={projectName ? { name: projectName, color: projectColor ?? null, id: projectId } : null}
        onBack={() => navigation.goBack()}
        actions={[
          { icon: searchVisible ? X : Search, label: searchVisible ? 'Close search' : 'Search scope', onPress: () => { if (searchVisible) setSearch(''); setSearchVisible(v => !v); } },
          { icon: SlidersHorizontal, label: hideDone ? 'Show done items' : 'Hide done items', onPress: () => setHideDone(v => !v), active: hideDone },
        ]}
      />
      {searchVisible ? (
        <View style={[sx.searchBar, { backgroundColor: k.surface, borderColor: k.border }]}>
          <Search size={metrics.projects.searchIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search scope"
            placeholderTextColor={k.faint}
            autoFocus
            style={[type.body, sx.searchInput, { color: k.text }]}
          />
        </View>
      ) : null}
      {totalCount > 0 ? (
        <ProgressLine
          value={totalCount ? doneCount / totalCount : 0}
          label={`${doneCount} of ${totalCount} done`}
          rightLabel={`${totalCount ? Math.round((doneCount / totalCount) * 100) : 0}%`}
        />
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={[sx.container, { backgroundColor: k.bg, paddingTop: insets.top + metrics.schedule.top }]}>
        <View style={sx.topPad}><PageHeader title="Scope" project={projectName ? { name: projectName, color: projectColor ?? null, id: projectId } : null} onBack={() => navigation.goBack()} /></View>
        <SkeletonList />
      </View>
    );
  }

  const renderItem = (item: ScopeItem) => {
    const expanded = expandedItems.has(item.id);
    const typeKey = (item.itemType || 'scope').toLowerCase();
    const lines = htmlToLines(item.description);
    const gearList = (item.gearList as GearItem[] | null) ?? [];
    const checklistItems = (item.checklistItems as ChecklistItemEntry[] | null) ?? [];
    const hasDetail = lines.length > 0 || gearList.length > 0 || checklistItems.length > 0;
    const showAll = showAllLines.has(item.id);
    const shownLines = showAll ? lines : lines.slice(0, MAX_LINES);
    const dotColor = typeKey === 'material' ? k.type.material : typeKey === 'scope' ? k.type.scope : k.faint;
    const Chevron = expanded ? ChevronDown : ChevronRight;
    return (
      <View key={item.id}>
        <Pressable
          onPress={hasDetail ? () => toggleExpand(item.id) : undefined}
          disabled={!hasDetail}
          accessibilityRole={hasDetail ? 'button' : undefined}
          accessibilityState={hasDetail ? { expanded } : undefined}
          style={sx.itemRow}
        >
          <View style={sx.check}>
            <Checkbox
              checked={item.isCompleted}
              onPress={canEdit ? () => toggleCompletion(item) : undefined}
              disabled={!canEdit}
              accessibilityLabel={`Mark ${item.title} ${item.isCompleted ? 'not done' : 'done'}`}
            />
          </View>
          <View style={sx.itemBody}>
            <Text style={[type.rowTitle, { color: item.isCompleted ? k.muted : k.text }]} numberOfLines={expanded ? undefined : 2}>
              {item.title}
            </Text>
            <View style={sx.typeRow}>
              <View style={[sx.typeDot, { backgroundColor: dotColor }]} />
              <Text style={[type.caption, { color: k.muted }]}>{(typeKey.charAt(0).toUpperCase() + typeKey.slice(1)).replace(/_/g, ' ')}</Text>
            </View>
          </View>
          {hasDetail ? <Chevron size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} /> : null}
        </Pressable>

        {expanded && hasDetail ? (
          <View style={sx.detail}>
            {shownLines.map((line, i) => (
              <View key={i} style={sx.bulletRow}>
                <View style={[sx.bullet, { backgroundColor: k.faint }]} />
                <Text style={[type.bodyRead, { color: k.textLong, flex: 1 }]}>{line}</Text>
              </View>
            ))}
            {lines.length > MAX_LINES ? (
              <Pressable onPress={() => toggleShowAll(item.id)} hitSlop={metrics.hitSlop} accessibilityRole="button">
                <Text style={[type.meta, { color: k.accent }]}>
                  {showAll ? 'Show less' : `Show all · ${lines.length - MAX_LINES} more`}
                </Text>
              </Pressable>
            ) : null}
            {gearList.length > 0 ? (
              <View style={sx.subList}>
                <Text style={[type.caption, { color: k.muted }]}>Materials and gear</Text>
                {gearList.map((gear, idx) => (
                  <View key={idx} style={sx.subRow}>
                    <Checkbox checked={gear.checked} />
                    <Text style={[type.body, { color: gear.checked ? k.muted : k.textLong, flex: 1 }]}>{gear.name}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {checklistItems.length > 0 ? (
              <View style={sx.subList}>
                <Text style={[type.caption, { color: k.muted }]}>Checklist</Text>
                {checklistItems.map((ci, idx) => (
                  <View key={ci.id || idx} style={sx.subRow}>
                    <Checkbox checked={ci.completed} />
                    <Text style={[type.body, { color: ci.completed ? k.muted : k.textLong, flex: 1 }]}>{ci.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  // Render in stage order; runs of collapsed stages become plain divider rows.
  const blocks: JSX.Element[] = [];
  let collapsedRun: CollapsedGroup[] = [];
  const flushCollapsed = () => {
    if (collapsedRun.length) {
      blocks.push(<CollapsedGroupList key={`c-${blocks.length}`} groups={collapsedRun} />);
      collapsedRun = [];
    }
  };
  const searching = !!q;
  const filtering = searching || hideDone;
  sectionData.forEach(sct => {
    const shown = sct.items.filter(matches);
    if (filtering && shown.length === 0) return;
    // While searching, every matching category is open; hiding done items
    // keeps the folds you chose.
    const collapsed = !searching && collapsedIds.includes(sct.stage.id);
    const meta = `${sct.completedCount}/${sct.allItemCount}`;
    if (collapsed) {
      collapsedRun.push({ key: sct.stage.id, title: sct.stage.name, meta, onPress: () => toggleStage(sct.stage.id) });
      return;
    }
    flushCollapsed();
    blocks.push(
      <View key={sct.stage.id} style={sx.group}>
        <GroupHeader
          title={sct.stage.name}
          meta={meta}
          open
          onToggle={() => toggleStage(sct.stage.id)}
          onLongPress={canEdit ? () => confirmStageCompletion(sct.stage) : undefined}
        />
        {shown.length === 0 ? (
          <Text style={[type.meta, { color: k.muted }]}>Nothing in this category yet</Text>
        ) : (
          <Card variant="list">{shown.map(renderItem)}</Card>
        )}
      </View>
    );
  });
  flushCollapsed();

  return (
    <View style={[sx.container, { backgroundColor: k.bg }]}>
      <ScrollView
        contentContainerStyle={[sx.list, { paddingTop: insets.top + metrics.schedule.top, paddingBottom: space.screenBottom + insets.bottom }, readableFrame]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
      >
        {header}
        {sectionData.length === 0 ? (
          <View style={sx.empty}>
            <EmptyState icon={Layers} title="No scope items yet" helper="Scope items will appear here once they're added on the website." />
          </View>
        ) : blocks.length === 0 ? (
          <Text style={[type.body, { color: k.muted }]}>{q ? 'Nothing matches your search' : 'Everything here is done'}</Text>
        ) : (
          blocks
        )}
      </ScrollView>
    </View>
  );
}

/** Scope descriptions are HTML: lists, paragraphs, line breaks → one line each. */
function htmlToLines(html?: string): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n');
  return stripHtml(withBreaks.replace(/\n/g, '\u0000'))
    .split('\u0000')
    .map(line => line.replace(/^[\s•·\-–*]+/, '').trim())
    .filter(Boolean);
}

const MAX_LINES = 4;
const sp = metrics.scope;

const sx = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: space.screenX, gap: sp.gap },
  top: { gap: sp.gap },
  topPad: { paddingHorizontal: space.screenX, paddingBottom: sp.gap },
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
  group: {},
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowGap, paddingVertical: sp.itemPadY },
  check: { paddingTop: sp.checkOffset },
  itemBody: { flex: 1, gap: sp.itemBodyGap },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  typeDot: { width: size.typeDot, height: size.typeDot, borderRadius: size.typeDot / 2 },
  detail: { paddingLeft: sp.detailIndent, paddingBottom: sp.itemPadY, gap: sp.bulletGap },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowGap - space.inlineSm },
  // Centred on the first line of 14/21 text.
  bullet: { width: sp.bullet, height: sp.bullet, borderRadius: sp.bullet / 2, marginTop: (type.bodyRead.lineHeight - sp.bullet) / 2 },
  subList: { gap: sp.bulletGap, paddingTop: space.inlineSm },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap - space.inlineSm },
  empty: { minHeight: metrics.emptyState.areaMinHeight },
});
