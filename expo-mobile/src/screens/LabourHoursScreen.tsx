import { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { metrics, space, tabular, type, useColors } from '../theme';
import { usePersistedState } from '../lib/usePersistedState';
import { Card, EmptyState, FAB, FAB_CLEARANCE, GroupHeader, PageHeader, ProgressLine } from '../components/kit';
import { readableFrame } from '../components/ui/ReadableColumn';
import { SkeletonList } from '../components/ui/Skeleton';

interface LabourHoursRow {
  id: string;
  costCodeId?: string | null;
  costCodeTitle?: string | null;
  categoryTitle?: string | null;
  budgetedHours?: string;
  pendingHours?: string;
  approvedHours?: string;
}

interface CostCode {
  id: string;
  code: string;
  title: string;
  categoryId?: string | null;
}

interface CostCategory {
  id: string;
  code: string;
  title: string;
}

const num = (v?: string | null) => parseFloat(v || '0') || 0;
/** "1.8", "20.5", "0" — one decimal at most, no unit. */
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
/** Hours booked past the budget (a code with no budget but time booked counts too). */
const isOver = (budgeted: number, used: number) => used > budgeted && used > 0;
/** "Labour – Framing" → "Framing": the screen is already about labour. */
const shortTitle = (t: string) => t.replace(/^labour\s*[–—-]\s*/i, '');

// Codes read as numbers ("100", "119"); anything else falls back to lexical.
const compareCode = (a: string, b: string) => {
  const an = parseFloat(a);
  const bn = parseFloat(b);
  if (!isNaN(an) && !isNaN(bn)) return an - bn;
  return a.localeCompare(b);
};

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
}

interface Row {
  id: string;
  code: string;
  title: string;
  budgeted: number;
  used: number;
}

export default function LabourHoursScreen({ navigation, route }: Props) {
  const { projectId, projectName, projectColor } = (route.params ?? {}) as {
    projectId?: string;
    projectName?: string;
    projectColor?: string | null;
  };
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<LabourHoursRow[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = usePersistedState<string[]>(`labour.collapsed.${projectId ?? ''}`, []);

  // One-row PageHeader instead of the stack header.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [hours, codes, cats] = await Promise.all([
        apiFetch<LabourHoursRow[]>(`/api/projects/${projectId}/labour-hours-budget`).catch(() => []),
        apiFetch<CostCode[]>('/api/cost-codes').catch(() => []),
        apiFetch<CostCategory[]>('/api/cost-categories').catch(() => []),
      ]);
      setRows(hours || []);
      setCostCodes(codes || []);
      setCategories(cats || []);
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

  // labour_hours_budget caches the cost code title but not its number, so the
  // code and its category come from the catalogue.
  const sections = useMemo(() => {
    const categoryById = new Map(categories.map(cat => [cat.id, cat]));
    const metaById = new Map(
      costCodes.map(cc => {
        const cat = cc.categoryId ? categoryById.get(cc.categoryId) : undefined;
        return [cc.id, { code: cc.code, categoryCode: cat?.code ?? '', categoryTitle: cat?.title ?? 'Uncategorized' }];
      }),
    );

    const groups = new Map<string, { categoryCode: string; rows: Row[] }>();
    rows.forEach(r => {
      const budgeted = num(r.budgetedHours);
      const used = num(r.pendingHours) + num(r.approvedHours);
      // A cost code with neither a budget nor time booked has nothing to say.
      if (budgeted === 0 && used === 0) return;
      const meta = r.costCodeId ? metaById.get(r.costCodeId) : undefined;
      const categoryTitle = meta?.categoryTitle ?? r.categoryTitle ?? 'Uncategorized';
      if (!groups.has(categoryTitle)) {
        groups.set(categoryTitle, { categoryCode: meta?.categoryCode ?? '', rows: [] });
      }
      const group = groups.get(categoryTitle)!;
      if (!group.categoryCode && meta?.categoryCode) group.categoryCode = meta.categoryCode;
      group.rows.push({
        id: r.id,
        code: meta?.code ?? '',
        title: shortTitle(r.costCodeTitle || 'Uncategorized'),
        budgeted,
        used,
      });
    });

    return Array.from(groups.entries())
      .sort((a, b) => {
        if (a[0] === 'Uncategorized') return 1;
        if (b[0] === 'Uncategorized') return -1;
        if (a[1].categoryCode && b[1].categoryCode) return compareCode(a[1].categoryCode, b[1].categoryCode);
        return a[0].localeCompare(b[0]);
      })
      .map(([title, group]) => ({
        title,
        budgeted: group.rows.reduce((s, r) => s + r.budgeted, 0),
        used: group.rows.reduce((s, r) => s + r.used, 0),
        data: [...group.rows].sort((a, b) => {
          if (a.code && b.code) return compareCode(a.code, b.code);
          if (a.code) return -1;
          if (b.code) return 1;
          return a.title.localeCompare(b.title);
        }),
      }));
  }, [rows, costCodes, categories]);

  const totals = useMemo(() => {
    const budgeted = sections.reduce((s, g) => s + g.budgeted, 0);
    const used = sections.reduce((s, g) => s + g.used, 0);
    return { budgeted, used, over: isOver(budgeted, used) };
  }, [sections]);

  const toggleGroup = (title: string) =>
    setCollapsed(collapsed.includes(title) ? collapsed.filter(t => t !== title) : [...collapsed, title]);

  // + opens the existing Log Hours form on Timesheets with this project filled in.
  const logHours = () => navigation.navigate('More', { screen: 'Timesheets', params: { logProjectId: projectId } });

  const header = (
    <PageHeader
      title="Labour hours"
      project={projectName ? { name: projectName, color: projectColor ?? null, id: projectId } : null}
      onBack={() => navigation.goBack()}
    />
  );

  if (loading) {
    return (
      <View style={[lx.container, { backgroundColor: c.bg, paddingTop: insets.top + metrics.schedule.top }]}>
        <View style={lx.topPad}>{header}</View>
        <SkeletonList />
      </View>
    );
  }

  const renderRow = (item: Row) => {
    const over = isOver(item.budgeted, item.used);
    const figure = over ? c.danger : c.text;
    return (
      <View
        key={item.id}
        style={lx.row}
        accessible
        accessibilityLabel={`${item.code ? `${item.code} ` : ''}${item.title}, ${fmt(item.used)} of ${fmt(item.budgeted)} hours${over ? `, ${fmt(item.used - item.budgeted)} hours over` : ''}`}
      >
        <View style={lx.rowTop}>
          <Text style={[type.meta, tabular, lx.code, { color: c.muted }]} numberOfLines={1}>
            {item.code}
          </Text>
          <Text style={[type.rowTitle, lx.title, { color: c.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[type.body, tabular, { color: figure }]}>
            {fmt(item.used)}
            <Text style={{ color: over ? c.danger : c.muted }}> / {fmt(item.budgeted)}h</Text>
          </Text>
        </View>
        <View style={lx.barRow}>
          <View style={lx.bar}>
            <ProgressLine value={item.budgeted > 0 ? item.used / item.budgeted : 0} over={over} />
          </View>
          {over ? (
            <Text style={[type.caption, tabular, { color: c.danger }]}>+{fmt(item.used - item.budgeted)}h over</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[lx.container, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={[
          lx.list,
          { paddingTop: insets.top + metrics.schedule.top, paddingBottom: space.screenBottom + insets.bottom + FAB_CLEARANCE },
          readableFrame,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        {header}
        {sections.length === 0 ? (
          <View style={lx.empty}>
            <EmptyState
              icon={Clock}
              title="No labour hours"
              helper="Hours appear here once an estimate budgets them or a timesheet books time."
            />
          </View>
        ) : (
          <>
            <Card>
              <View style={lx.summary}>
                <View style={lx.summaryRow}>
                  <Text style={[type.meta, { color: c.muted }]}>Used</Text>
                  <Text style={[type.heading, tabular, { color: totals.over ? c.danger : c.text }]}>{fmt(totals.used)}h</Text>
                  <Text style={[type.body, tabular, { color: totals.over ? c.danger : c.muted }]}>of {fmt(totals.budgeted)}h</Text>
                  <Text style={[type.body, tabular, lx.left, { color: totals.over ? c.danger : c.muted }]}>
                    {totals.over
                      ? `${fmt(totals.used - totals.budgeted)}h over`
                      : `${fmt(totals.budgeted - totals.used)}h left`}
                  </Text>
                </View>
                <ProgressLine value={totals.budgeted > 0 ? totals.used / totals.budgeted : 0} over={totals.over} />
              </View>
            </Card>

            {sections.map(section => {
              const open = !collapsed.includes(section.title);
              return (
                <View key={section.title}>
                  <GroupHeader
                    title={section.title}
                    open={open}
                    onToggle={() => toggleGroup(section.title)}
                    trailing={`${fmt(section.used)} / ${fmt(section.budgeted)}h`}
                  />
                  {open ? <Card variant="list">{section.data.map(renderRow)}</Card> : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      {projectId ? <FAB onPress={logHours} label="Log hours" /> : null}
    </View>
  );
}

const L = metrics.labour;

const lx = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: space.screenX, gap: L.gap },
  topPad: { paddingHorizontal: space.screenX, paddingBottom: L.gap },
  empty: { paddingTop: space.screenBottom },
  summary: { gap: L.summaryGap },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: L.summaryRowGap },
  left: { marginLeft: 'auto' },
  row: { paddingTop: L.rowPadTop, paddingBottom: L.rowPadBottom, gap: L.rowGap },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: L.rowInnerGap },
  code: { width: L.codeWidth },
  title: { flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: L.rowGap, paddingLeft: L.barIndent },
  bar: { flex: 1 },
});
