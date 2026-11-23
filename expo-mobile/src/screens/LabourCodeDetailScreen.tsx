import { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { apiFetch } from '../services/api';
import { metrics, radii, size, space, tabular, type, useColors } from '../theme';
import { Avatar, Card, DetailHeader, EmptyState, FAB, FAB_CLEARANCE, ProjectSquare } from '../components/kit';
import { LabourSummary } from '../components/labour/LabourSummary';
import { readableFrame } from '../components/ui/ReadableColumn';
import { SkeletonList } from '../components/ui/Skeleton';
import { dateStrOf, fromLocalDateStr } from '../lib/dates';
import { fmtHours, hoursNum } from '../lib/labour';
import { plural } from '../lib/format';

interface Timesheet {
  id: string;
  userId: string;
  date: string;
  duration: string;
  description: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  costCodeId: string | null;
  costCodeSplits?: { costCodeId: string; duration: string }[];
}

interface TeamUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

interface Entry {
  id: string;
  userId: string;
  date: string;
  hours: number;
  note: string | null;
  pending: boolean;
}

interface Params {
  projectId: string;
  projectName?: string;
  projectColor?: string | null;
  costCodeId: string;
  code?: string;
  title: string;
  categoryTitle?: string;
  budgeted: number;
  used: number;
}

/** "Russ T": first name and last initial, as on the design. */
function shortName(u?: TeamUser): string {
  if (!u) return 'Unknown';
  const first = (u.firstName ?? '').trim();
  const last = (u.lastName ?? '').trim();
  if (!first && !last) return u.email?.split('@')[0] ?? 'Unknown';
  return last ? `${first} ${last[0]}`.trim() : first;
}

/** "Mon 9 Nov". */
function dayLabel(value: string): string {
  const d = fromLocalDateStr(dateStrOf(value));
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

/**
 * Hours this timesheet booked to the code. Same rule as the server's labour
 * budget: split rows win; otherwise the timesheet's own cost code. Only
 * submitted and approved time counts, so the list adds up to "Used".
 */
function hoursForCode(ts: Timesheet, costCodeId: string): number {
  if (ts.status !== 'submitted' && ts.status !== 'approved') return 0;
  const splits = ts.costCodeSplits ?? [];
  if (splits.length > 0) {
    return splits.filter(s => s.costCodeId === costCodeId).reduce((sum, s) => sum + hoursNum(s.duration), 0);
  }
  return ts.costCodeId === costCodeId ? hoursNum(ts.duration) : 0;
}

export default function LabourCodeDetailScreen({
  navigation,
  route,
}: {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
}) {
  const p = route.params as Params;
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [person, setPerson] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const fetchData = useCallback(async () => {
    try {
      const [ts, team] = await Promise.all([
        apiFetch<Timesheet[]>(`/api/projects/${p.projectId}/timesheets`).catch(() => []),
        apiFetch<TeamUser[]>('/api/users/assignable').catch(() => []),
      ]);
      setTimesheets(ts || []);
      setUsers(team || []);
    } finally {
      setLoading(false);
    }
  }, [p.projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  // Newest first: the latest day is what people come to check.
  const entries = useMemo<Entry[]>(
    () =>
      timesheets
        .map(ts => ({
          id: ts.id,
          userId: ts.userId,
          date: ts.date,
          hours: hoursForCode(ts, p.costCodeId),
          note: ts.description?.trim() || null,
          pending: ts.status === 'submitted',
        }))
        .filter(e => e.hours > 0)
        .sort((a, b) => dateStrOf(b.date).localeCompare(dateStrOf(a.date))),
    [timesheets, p.costCodeId],
  );

  const people = useMemo(() => {
    const byUser = new Map<string, number>();
    entries.forEach(e => byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + e.hours));
    return Array.from(byUser.entries())
      .map(([userId, hours]) => ({ userId, hours, name: shortName(userById.get(userId)) }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries, userById]);

  const shown = person ? entries.filter(e => e.userId === person) : entries;
  const listedHours = entries.reduce((s, e) => s + e.hours, 0);
  // Timesheet view scope can hide other people's time from this user.
  const hiddenSome = !loading && listedHours + 0.05 < p.used;

  const subtitle = [p.code, p.categoryTitle].filter(Boolean).join(' · ');

  return (
    <View style={[dx.container, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={[
          dx.list,
          { paddingTop: insets.top + metrics.schedule.top, paddingBottom: space.screenBottom + insets.bottom + FAB_CLEARANCE },
          readableFrame,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        <DetailHeader onBack={() => navigation.goBack()} />

        <View style={dx.titleBlock}>
          <Text style={[type.title, { color: c.text }]}>{p.title}</Text>
          <View style={dx.subtitle}>
            {subtitle ? (
              <Text style={[type.meta, { color: c.muted }]} numberOfLines={1}>
                {subtitle}
                {p.projectName ? ' · ' : ''}
              </Text>
            ) : null}
            {p.projectName ? (
              <>
                <ProjectSquare color={p.projectColor} fallbackKey={p.projectId} />
                <Text style={[type.meta, dx.shrink, { color: c.muted }]} numberOfLines={1}>
                  {p.projectName}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <LabourSummary used={p.used} budgeted={p.budgeted} />

        {loading ? (
          <SkeletonList />
        ) : entries.length === 0 ? (
          <View style={dx.empty}>
            <EmptyState
              icon={Clock}
              title="No hours logged"
              helper={hiddenSome ? "Hours here were logged by people whose timesheets you can't see." : 'Submitted and approved timesheets for this code show here.'}
            />
          </View>
        ) : (
          <>
            {people.length > 0 ? (
              <View style={dx.section}>
                <Text style={[type.caption, { color: c.muted }]}>By person</Text>
                <View style={dx.pills}>
                  {people.map(pp => {
                    const active = person === pp.userId;
                    return (
                      <Pressable
                        key={pp.userId}
                        onPress={() => setPerson(active ? null : pp.userId)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${pp.name}, ${fmtHours(pp.hours)} hours${active ? ', showing only their entries' : ''}`}
                        style={({ pressed }) => [
                          dx.pill,
                          {
                            backgroundColor: active ? c.tint : c.surface,
                            borderColor: active ? c.accent : c.border,
                            opacity: pressed ? metrics.pressedOpacity : 1,
                          },
                        ]}
                      >
                        <Avatar name={pp.name} size="chip" />
                        <Text style={[type.meta, { color: active ? c.accent : c.text }]}>{pp.name}</Text>
                        <Text style={[type.meta, tabular, { color: c.muted }]}>{fmtHours(pp.hours)}h</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={dx.section}>
              <View style={dx.logHeader}>
                <Text style={[type.rowTitle, { color: c.text }]}>Logged hours</Text>
                <Text style={[type.meta, tabular, { color: c.muted }]}>
                  {shown.length} {plural(shown.length, 'entry', 'entries')}
                </Text>
              </View>
              <Card variant="list">
                {shown.map(e => (
                  <View key={e.id} style={dx.entry}>
                    <View style={dx.entryBody}>
                      <View style={dx.entryTop}>
                        <Text style={[type.rowTitle, dx.shrink, { color: c.text }]} numberOfLines={1}>
                          {shortName(userById.get(e.userId))}
                        </Text>
                        <Text style={[type.meta, { color: c.muted }]}>
                          {dayLabel(e.date)}
                          {e.pending ? ' · Pending' : ''}
                        </Text>
                      </View>
                      {e.note ? (
                        <Text style={[type.meta, { color: c.muted }]} numberOfLines={2}>
                          {e.note}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[type.rowTitle, tabular, { color: c.text }]}>{fmtHours(e.hours)}h</Text>
                  </View>
                ))}
              </Card>
              {hiddenSome ? (
                <Text style={[type.caption, { color: c.muted }]}>
                  Some hours were logged by people whose timesheets you can't see.
                </Text>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
      <FAB
        label="Log hours"
        onPress={() => navigation.navigate('More', { screen: 'Timesheets', params: { logProjectId: p.projectId, logCostCodeId: p.costCodeId } })}
      />
    </View>
  );
}

const D = metrics.labourDetail;

const dx = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: space.screenX, gap: metrics.labour.gap },
  titleBlock: { gap: D.titleGap },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  shrink: { flexShrink: 1 },
  empty: { paddingTop: space.screenBottom },
  section: { gap: D.sectionGap },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: D.pillGap },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.pillInnerGap,
    borderRadius: radii.pill,
    borderWidth: size.border,
    paddingTop: D.pillPadY,
    paddingBottom: D.pillPadY,
    paddingRight: D.pillPadRight,
    paddingLeft: D.pillPadLeft,
  },
  logHeader: { flexDirection: 'row', alignItems: 'baseline', gap: D.logHeaderGap },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: D.entryGap, paddingVertical: D.entryPadY, minHeight: D.entryMin },
  entryBody: { flex: 1, gap: D.entryBodyGap },
  entryTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.inline },
});
