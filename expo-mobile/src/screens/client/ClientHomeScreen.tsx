import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { apiFetch, getAuthedImageSource } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { usePermission } from '../../lib/usePermission';
import { haptic } from '../../lib/haptics';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { PressableScale } from '../../components/ui/PressableScale';
import {
  PORTAL_KEYS,
  buildAttention,
  diaryPhotoUrls,
  formatDateRange,
  formatDay,
  isScheduleItemDone,
  isScheduleItemUnderway,
  schedulePercent,
  sortDiary,
  type AttentionItem,
  type ClientDiaryEntry,
  type ClientInvoice,
  type ClientScheduleItem,
  type ClientSelection,
  type ClientVariation,
} from '../../lib/clientPortal';
import { ClientCard, ClientHeader, ClientLoading, ClientStatusPill } from '../../components/client/ClientUI';
import { dateStrOf, toLocalDateStr } from '../../lib/dates';

/**
 * A homeowner's front page: what's waiting on them, how far along the job
 * is, and the latest from site.
 *
 * Each section only loads when the client's role can see it (the same
 * portal.* keys the web portal reads) — asking for one they can't would just
 * 403. Everything waiting on them opens in the app.
 */

const ATTENTION_ICON: Record<AttentionItem['kind'], keyof typeof Ionicons.glyphMap> = {
  variation: 'document-text-outline',
  selection: 'color-palette-outline',
  invoice: 'receipt-outline',
};

async function optional<T>(allowed: boolean, path: string): Promise<T | undefined> {
  if (!allowed) return undefined;
  try {
    return await apiFetch<T>(path);
  } catch {
    return undefined;
  }
}

export default function ClientHomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { project, projects, selectProject } = useClientProject();

  const canSchedule = usePermission(PORTAL_KEYS.schedule);
  const canDiary = usePermission(PORTAL_KEYS.siteDiary);
  const canVariations = usePermission(PORTAL_KEYS.variations);
  const canSelections = usePermission(PORTAL_KEYS.selections);
  const canInvoices = usePermission(PORTAL_KEYS.invoices);

  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [schedule, setSchedule] = useState<ClientScheduleItem[]>([]);
  const [latest, setLatest] = useState<ClientDiaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    const pid = project.id;
    const [variations, selections, invoices, items, diary] = await Promise.all([
      optional<ClientVariation[]>(canVariations, `/api/variations?projectId=${pid}`),
      optional<ClientSelection[]>(canSelections, `/api/selections/with-options?projectId=${pid}`),
      optional<ClientInvoice[]>(canInvoices, `/api/client-invoices?projectId=${pid}`),
      optional<ClientScheduleItem[]>(canSchedule, `/api/projects/${pid}/schedule-items`),
      optional<ClientDiaryEntry[]>(canDiary, `/api/projects/${pid}/site-diary-entries`),
    ]);
    setAttention(buildAttention({ variations, selections, invoices }));
    setSchedule(items ?? []);
    setLatest(sortDiary(diary ?? [])[0] ?? null);
    setLoading(false);
  }, [project, canVariations, canSelections, canInvoices, canSchedule, canDiary]);

  // A different project starts from a spinner; coming back to Home (after
  // choosing a selection, say) refreshes quietly in place.
  useEffect(() => {
    setLoading(true);
  }, [project?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const progress = useMemo(() => {
    const today = toLocalDateStr(new Date());
    const underway = schedule.filter((i) => isScheduleItemUnderway(i));
    const next = schedule
      .filter((i) => !isScheduleItemDone(i) && dateStrOf(i.startDate) > today)
      .sort((a, b) => dateStrOf(a.startDate).localeCompare(dateStrOf(b.startDate)))[0];
    return { percent: schedulePercent(schedule), underway: underway.slice(0, 3), next };
  }, [schedule]);

  const openAttention = (item: AttentionItem) => {
    haptic.light();
    if (!project) return;
    if (item.kind === 'selection') {
      navigation.navigate('ClientSelectionDetail', { selectionId: item.id, name: item.title });
      return;
    }
    if (item.kind === 'variation') {
      navigation.navigate('ClientVariationDetail', { variationId: item.id, name: item.title });
      return;
    }
    navigation.navigate('ClientInvoiceDetail', { invoiceId: item.id });
  };

  const latestPhoto = latest ? diaryPhotoUrls(latest).find((u) => u.startsWith('/') || u.startsWith('http')) : undefined;
  const hasAttentionSection = canVariations || canSelections || canInvoices;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader
        title={`Hi${user?.firstName ? ` ${user.firstName}` : ''}`}
        subtitle={project ? [project.name, project.location].filter(Boolean).join(' · ') : null}
        right={
          <Pressable
            onPress={() => navigation.navigate('ClientAccount')}
            hitSlop={10}
            accessibilityLabel="Account"
            style={[styles.avatar, { backgroundColor: theme.primaryLight }]}
          >
            <Ionicons name="person-outline" size={18} color={theme.primary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {projects.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcher}>
            {projects.map((p) => {
              const active = p.id === project?.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => { haptic.select(); selectProject(p.id); }}
                  style={[
                    styles.chip,
                    { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primaryLight : theme.card },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? theme.primary : theme.textSecondary }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <ClientLoading />
        ) : (
          <>
            {hasAttentionSection && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>NEEDS YOUR ATTENTION</Text>
                {attention.length === 0 ? (
                  <ClientCard style={styles.caughtUp}>
                    <Ionicons name="checkmark-circle-outline" size={20} color={theme.statusSuccess} />
                    <Text style={[styles.caughtUpText, { color: theme.textSecondary }]}>
                      You're all caught up — nothing is waiting on you.
                    </Text>
                  </ClientCard>
                ) : (
                  <View style={styles.stack}>
                    {attention.map((item) => (
                      <PressableScale key={`${item.kind}-${item.id}`} onPress={() => openAttention(item)}>
                        <ClientCard style={styles.attentionRow}>
                          <View style={[styles.attentionIcon, { backgroundColor: theme.primaryLight }]}>
                            <Ionicons name={ATTENTION_ICON[item.kind]} size={18} color={theme.primary} />
                          </View>
                          <View style={styles.attentionBody}>
                            <Text style={[styles.attentionTitle, { color: theme.textPrimary }]} numberOfLines={2}>{item.title}</Text>
                            <Text style={[styles.attentionDetail, { color: theme.textSecondary }]}>
                              {item.detail}{item.dueDate ? ` · by ${formatDay(item.dueDate)}` : ''}
                            </Text>
                          </View>
                          {item.urgent && <ClientStatusPill label="Overdue" tone="attention" />}
                          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                        </ClientCard>
                      </PressableScale>
                    ))}
                  </View>
                )}
              </>
            )}

            {canSchedule && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PROGRESS</Text>
                <PressableScale onPress={() => navigation.navigate('ClientSchedule')}>
                  <ClientCard>
                    {schedule.length === 0 ? (
                      <Text style={[styles.muted, { color: theme.textSecondary }]}>
                        Your builder hasn't published a schedule yet.
                      </Text>
                    ) : (
                      <>
                        <View style={styles.progressHead}>
                          <ProgressRing size={44} strokeWidth={5} progress={progress.percent / 100} color={theme.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.progressPercent, { color: theme.textPrimary }]}>{progress.percent}% complete</Text>
                            <Text style={[styles.muted, { color: theme.textSecondary }]}>
                              {schedule.filter(isScheduleItemDone).length} of {schedule.length} stages done
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                        </View>
                        {progress.underway.length > 0 && (
                          <View style={styles.progressList}>
                            <Text style={[styles.progressLabel, { color: theme.textMuted }]}>UNDERWAY NOW</Text>
                            {progress.underway.map((i) => (
                              <Text key={i.id} style={[styles.progressItem, { color: theme.textPrimary }]} numberOfLines={1}>
                                {i.name}
                              </Text>
                            ))}
                          </View>
                        )}
                        {progress.next && (
                          <View style={styles.progressList}>
                            <Text style={[styles.progressLabel, { color: theme.textMuted }]}>NEXT UP</Text>
                            <Text style={[styles.progressItem, { color: theme.textPrimary }]} numberOfLines={1}>
                              {progress.next.name}
                            </Text>
                            <Text style={[styles.muted, { color: theme.textSecondary }]}>
                              {formatDateRange(progress.next.startDate, progress.next.endDate)}
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </ClientCard>
                </PressableScale>
              </>
            )}

            {canDiary && latest && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LATEST FROM SITE</Text>
                  <Pressable onPress={() => navigation.navigate('ClientUpdates')} hitSlop={8}>
                    <Text style={[styles.seeAll, { color: theme.primary }]}>See all</Text>
                  </Pressable>
                </View>
                <PressableScale onPress={() => navigation.navigate('ClientUpdates')}>
                  <ClientCard style={styles.latest}>
                    {latestPhoto && (
                      <Image source={getAuthedImageSource(latestPhoto)} style={[styles.latestPhoto, { backgroundColor: theme.subtle }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.attentionTitle, { color: theme.textPrimary }]} numberOfLines={2}>{latest.title}</Text>
                      <Text style={[styles.muted, { color: theme.textSecondary }]}>{formatDay(latest.entryDateTime)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </ClientCard>
                </PressableScale>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  switcher: { gap: 8, paddingBottom: 4 },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 220 },
  chipText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.medium },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  seeAll: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold },
  stack: { gap: 8 },
  caughtUp: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  caughtUpText: { flex: 1, fontSize: fontSize.sm },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attentionIcon: { width: 36, height: 36, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  attentionBody: { flex: 1, gap: 2 },
  attentionTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium },
  attentionDetail: { fontSize: fontSize.bodySm },
  muted: { fontSize: fontSize.bodySm },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressPercent: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  progressList: { marginTop: 14, gap: 3 },
  progressLabel: { fontSize: 11, fontWeight: fontWeight.semibold, letterSpacing: 0.5 },
  progressItem: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  latestPhoto: { width: 56, height: 56, borderRadius: radius.lg },
});
