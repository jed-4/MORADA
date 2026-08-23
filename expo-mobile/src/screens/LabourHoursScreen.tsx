import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme } from '../theme';

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

type Tone = 'under' | 'near' | 'at' | 'over' | 'unbudgeted' | 'neutral';

/**
 * Same bands as the web budget page: under 95% / 95-99% / 100-105% / over,
 * with hours booked against no budget kept separate rather than counted as
 * over — most projects carry unbudgeted cost codes.
 */
function toneFor(budgeted: number, used: number): Tone {
  if (budgeted <= 0) return used > 0 ? 'unbudgeted' : 'neutral';
  const percent = (used / budgeted) * 100;
  if (percent < 95) return 'under';
  if (percent < 100) return 'near';
  if (percent <= 105) return 'at';
  return 'over';
}

const TONE_COLOR: Record<Tone, string> = {
  under: '#3F9A6A',
  near: '#C79A3C',
  at: '#C4692B',
  over: '#C0453F',
  unbudgeted: '#4874BE',
  neutral: '#8A8A8A',
};

const num = (v?: string | null) => parseFloat(v || '0') || 0;
const formatHours = (n: number) =>
  `${(Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 })}h`;

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

export default function LabourHoursScreen({ route }: Props) {
  const projectId = (route.params as any)?.projectId as string | undefined;
  const theme = useTheme();

  const [rows, setRows] = useState<LabourHoursRow[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    const categoryById = new Map(categories.map(c => [c.id, c]));
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
        title: r.costCodeTitle || 'Uncategorized',
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
    return { budgeted, used, remaining: budgeted - used, tone: toneFor(budgeted, used) };
  }, [sections]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="time-outline" size={40} color={theme.textMuted} />
        <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No labour hours</Text>
        <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
          Hours appear here once an estimate budgets them or a timesheet books time.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.totals, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.totalsStat}>
          <Text style={[styles.totalsLabel, { color: theme.textMuted }]}>Budgeted</Text>
          <Text style={[styles.totalsValue, { color: theme.textPrimary }]}>{formatHours(totals.budgeted)}</Text>
        </View>
        <View style={styles.totalsStat}>
          <Text style={[styles.totalsLabel, { color: theme.textMuted }]}>Used</Text>
          <Text style={[styles.totalsValue, { color: theme.textPrimary }]}>{formatHours(totals.used)}</Text>
        </View>
        <View style={styles.totalsStat}>
          <Text style={[styles.totalsLabel, { color: theme.textMuted }]}>
            {totals.remaining < 0 ? 'Over by' : 'Remaining'}
          </Text>
          <Text style={[styles.totalsValue, { color: TONE_COLOR[totals.tone] }]}>
            {formatHours(Math.abs(totals.remaining))}
          </Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        renderSectionHeader={({ section }) => {
          const tone = toneFor(section.budgeted, section.used);
          return (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={[styles.sectionMeta, { color: TONE_COLOR[tone] }]}>
                {formatHours(section.used)} / {formatHours(section.budgeted)}
              </Text>
            </View>
          );
        }}
        renderItem={({ item }) => {
          const tone = toneFor(item.budgeted, item.used);
          const percent = item.budgeted > 0 ? Math.round((item.used / item.budgeted) * 100) : 0;
          const variance = item.budgeted - item.used;
          return (
            <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.rowTop}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {item.code ? `${item.code}  ` : ''}
                  {item.title}
                </Text>
                <View style={[styles.chip, { backgroundColor: TONE_COLOR[tone] + '22' }]}>
                  <Text style={[styles.chipText, { color: TONE_COLOR[tone] }]}>
                    {variance < 0 ? '+' : ''}
                    {formatHours(Math.abs(variance))}
                  </Text>
                </View>
              </View>

              <View style={[styles.track, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.fill,
                    // Clamped, so an overrun cannot slide the bar out of view;
                    // the percentage below carries it instead.
                    { width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: TONE_COLOR[tone] },
                  ]}
                />
              </View>

              <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                {formatHours(item.used)} of {formatHours(item.budgeted)} · {percent}%
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  totals: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 16 },
  totalsStat: { flex: 1 },
  totalsLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  totalsValue: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },

  listContent: { padding: 12, paddingBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', flex: 1 },
  sectionMeta: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },

  row: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  rowTitle: { fontSize: 14, fontWeight: '500', flex: 1 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  rowMeta: { fontSize: 12, marginTop: 6, fontVariant: ['tabular-nums'] },
});
