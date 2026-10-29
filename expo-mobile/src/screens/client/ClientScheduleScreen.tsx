import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../services/api';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import {
  formatDateRange,
  groupSchedule,
  isScheduleItemDone,
  isScheduleItemUnderway,
  pickSchedule,
  schedulePercent,
  scheduleSpan,
  type ClientScheduleItem,
} from '../../lib/clientPortal';
import { ClientEmpty, ClientHeader, ClientLoading, ClientOfflineNote, ClientStatusPill } from '../../components/client/ClientUI';

/**
 * The client's view of the programme — the phone twin of the web portal's
 * ClientSchedule. Read only; done or not done, never a builder status.
 * Whether a client sees every item or only the top-level phases is decided by
 * the server from their role (portal.schedule.all_items), so this renders
 * whatever arrives.
 */
export default function ClientScheduleScreen() {
  const theme = useTheme();
  const { project } = useClientProject();
  const [items, setItems] = useState<ClientScheduleItem[]>([]);
  const [hasSchedule, setHasSchedule] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const [schedules, rows] = await Promise.all([
        apiFetch<Array<{ id: string; status?: string | null }>>(`/api/projects/${project.id}/schedules`),
        apiFetch<ClientScheduleItem[]>(`/api/projects/${project.id}/schedule-items`),
      ]);
      setHasSchedule(!!pickSchedule(schedules ?? []));
      setItems(rows ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sections = useMemo(
    () => groupSchedule(items).map((g) => ({ title: g.title, meta: `${g.done} of ${g.items.length} done`, data: g.items })),
    [items],
  );
  const span = scheduleSpan(items);
  const percent = schedulePercent(items);
  const subtitle = [span, items.length ? `${percent}% complete` : null].filter(Boolean).join(' · ');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader title="Schedule" subtitle={subtitle || project?.name} />
      {failed && items.length > 0 && <ClientOfflineNote text="Couldn't refresh — showing the last schedule loaded." />}
      {loading ? (
        <ClientLoading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            failed ? (
              <ClientEmpty icon="cloud-offline-outline" title="Couldn't load the schedule" body="Check your connection and pull down to try again." />
            ) : (
              <ClientEmpty
                icon="calendar-outline"
                title="No schedule to show yet"
                body={hasSchedule
                  ? "There's nothing on the schedule yet."
                  : "Your builder hasn't published a schedule for this project. It'll appear here once they do."}
              />
            )
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{section.title.toUpperCase()}</Text>
              <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>{section.meta}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const done = isScheduleItemDone(item);
            const underway = isScheduleItemUnderway(item);
            const progress = item.progressPercent ?? 0;
            const first = index === 0;
            const last = index === section.data.length - 1;
            return (
              <View
                style={[
                  styles.row,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  first && styles.rowFirst,
                  last && styles.rowLast,
                  !last && { borderBottomWidth: StyleSheet.hairlineWidth },
                  item.parentItemId ? styles.rowChild : null,
                ]}
              >
                <View
                  style={[
                    styles.marker,
                    done
                      ? { backgroundColor: theme.statusSuccessBg, borderColor: theme.statusSuccess }
                      : { borderColor: theme.borderStrong },
                  ]}
                >
                  {done && <Ionicons name="checkmark" size={12} color={theme.statusSuccess} />}
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTitleLine}>
                    {item.type === 'milestone' && <Ionicons name="flag-outline" size={13} color={theme.textMuted} />}
                    <Text
                      style={[styles.rowTitle, { color: done ? theme.textSecondary : theme.textPrimary }]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                  </View>
                  <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{formatDateRange(item.startDate, item.endDate)}</Text>
                  {!done && progress > 0 && (
                    <View style={styles.progressLine}>
                      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%`, backgroundColor: theme.primary }]} />
                      </View>
                      <Text style={[styles.progressText, { color: theme.textMuted }]}>{progress}%</Text>
                    </View>
                  )}
                </View>
                {done ? (
                  <ClientStatusPill label="Done" tone="done" />
                ) : underway ? (
                  <ClientStatusPill label="Underway" tone="info" />
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18, marginBottom: 8 },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  sectionMeta: { fontSize: fontSize.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  rowChild: { paddingLeft: 30 },
  marker: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowBody: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium, flexShrink: 1 },
  rowMeta: { fontSize: fontSize.bodySm },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progressTrack: { flex: 1, maxWidth: 160, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  progressText: { fontSize: fontSize.xs },
});
