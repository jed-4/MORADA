import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../services/api';
import { usePolling } from '../lib/usePolling';
import { timeAgo } from '../lib/format';

import { useTheme } from '../theme';
type Entry = {
  id: string;
  source: 'note' | 'change';
  authorType: 'user' | 'system' | 'ai';
  userName: string | null;
  scheduleItemId: string | null;
  scheduleItemName: string | null;
  content: string;
  createdAt: string;
};

type Filter = 'all' | 'notes' | 'changes';

const PAGE_SIZE = 20;

function lastSeenKey(scheduleId: string, userId?: string | null) {
  return `@buildpro/schedule_feed_last_seen:${userId || 'anon'}:${scheduleId}`;
}

export function ScheduleActivityFeedButton({
  scheduleId,
  userId,
  onSelectItem,
}: {
  scheduleId: string;
  userId?: string | null;
  onSelectItem?: (id: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();
const colors = {
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    bg: theme.background,
};

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [lastSeen, setLastSeen] = useState<string>('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(lastSeenKey(scheduleId, userId)).then(v => setLastSeen(v || ''));
  }, [scheduleId, userId]);

  const markSeen = useCallback(async () => {
    const stamp = new Date().toISOString();
    try { await AsyncStorage.setItem(lastSeenKey(scheduleId, userId), stamp); } catch {}
    setLastSeen(stamp);
    setUnread(0);
  }, [scheduleId, userId]);

  const loadPage = useCallback(
    async (pageNum: number, currentFilter: Filter) => {
      // A newer request (filter/page/schedule change) invalidates this one —
      // stale responses must not append to the freshly reset list.
      const requestId = ++requestIdRef.current;
      setLoading(true);
      const offset = (pageNum - 1) * PAGE_SIZE;
      try {
        const data = await apiFetch<{ entries: Entry[]; hasMore: boolean }>(
          `/api/schedules/${scheduleId}/activity-feed?limit=${PAGE_SIZE}&offset=${offset}&filter=${currentFilter}`
        );
        if (requestId !== requestIdRef.current) return;
        const newEntries = data?.entries || [];
        setEntries(prev => offset === 0 ? newEntries : [...prev, ...newEntries]);
        setHasMore(!!data?.hasMore);
        // Only stamp everything "seen" once the feed has actually loaded.
        if (offset === 0) markSeen();
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (offset === 0) setEntries([]);
        setHasMore(false);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [scheduleId, markSeen]
  );

  // Poll unread count via dedicated endpoint
  const fetchUnread = useCallback(async () => {
    try {
      const url = lastSeen
        ? `/api/schedules/${scheduleId}/activity-feed/unread-count?since=${encodeURIComponent(lastSeen)}`
        : `/api/schedules/${scheduleId}/activity-feed/unread-count`;
      const data = await apiFetch<{ count: number }>(url);
      setUnread(data?.count ?? 0);
    } catch {
      // ignore
    }
  }, [scheduleId, lastSeen]);

  // Refetch immediately when the schedule or last-seen stamp changes…
  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);
  // …and poll while the app is foregrounded (overlap-guarded).
  usePolling(fetchUnread, 60_000, true);

  useEffect(() => {
    if (open) loadPage(page, filter);
  }, [open, page, filter, loadPage]);

  // Reset pagination when filter or schedule changes while open
  useEffect(() => {
    if (open) {
      setPage(1);
      setEntries([]);
    }
  }, [filter, scheduleId]);

  const handleOpen = () => {
    setOpen(true);
    setPage(1);
    setEntries([]);
    // "seen" is stamped by loadPage once the list successfully loads.
  };

  const grouped = useMemo(() => {
    const groups: { day: string; items: Entry[] }[] = [];
    for (const e of entries) {
      const d = new Date(e.createdAt);
      const today = new Date();
      const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
      let label: string;
      if (d.toDateString() === today.toDateString()) label = 'Today';
      else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
      else label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const last = groups[groups.length - 1];
      if (last && last.day === label) last.items.push(e);
      else groups.push({ day: label, items: [e] });
    }
    return groups;
  }, [entries]);

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        style={[styles.bellBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        testID="button-mobile-schedule-activity-feed"
      >
        <Ionicons name="notifications-outline" size={18} color={colors.secondary} />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Schedule activity</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={[styles.filters, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {(['all', 'notes', 'changes'] as Filter[]).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => { setFilter(f); setPage(1); }}
                style={[
                  styles.filterPill,
                  { borderColor: colors.border },
                  filter === f && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
              >
                <Text style={{ color: filter === f ? '#fff' : colors.secondary, fontSize: 12, fontWeight: '600' }}>
                  {f === 'all' ? 'All' : f === 'notes' ? 'Notes' : 'Changes'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {loading && entries.length === 0 ? (
            <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
          ) : entries.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: colors.secondary }}>No activity yet</Text>
            </View>
          ) : (
            <FlatList
              data={grouped}
              keyExtractor={(g, idx) => `${g.day}-${idx}`}
              renderItem={({ item: g }) => (
                <View style={{ marginBottom: 8 }}>
                  <Text style={[styles.dayLabel, { color: colors.secondary }]}>{g.day.toUpperCase()}</Text>
                  {g.items.map(e => {
                    const clickable = !!e.scheduleItemId && !!onSelectItem;
                    const inner = (
                      <>
                        <View style={styles.entryHeader}>
                          <Ionicons
                            name={
                              e.authorType === 'ai' ? 'sparkles-outline'
                              : e.source === 'change' || e.authorType === 'system' ? 'settings-outline'
                              : 'chatbubble-outline'
                            }
                            size={14}
                            color={colors.secondary}
                          />
                          <Text style={[styles.entryAuthor, { color: colors.text }]}>
                            {e.authorType === 'ai' ? 'AI' : (e.userName || 'System')}
                          </Text>
                          <Text style={{ color: colors.secondary, fontSize: 11, marginLeft: 'auto' }}>
                            {timeAgo(e.createdAt)}
                          </Text>
                        </View>
                        <Text style={[styles.entryContent, { color: colors.text }]}>{e.content}</Text>
                        {!!e.scheduleItemName && (
                          <Text style={[styles.entryItem, { color: colors.secondary }]} numberOfLines={1}>
                            on {e.scheduleItemName}
                          </Text>
                        )}
                      </>
                    );
                    return clickable ? (
                      <TouchableOpacity
                        key={e.id}
                        onPress={() => { onSelectItem!(e.scheduleItemId!); setOpen(false); }}
                        style={[styles.entry, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        {inner}
                      </TouchableOpacity>
                    ) : (
                      <View
                        key={e.id}
                        style={[styles.entry, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        {inner}
                      </View>
                    );
                  })}
                </View>
              )}
              ListFooterComponent={hasMore ? (
                <TouchableOpacity onPress={() => setPage(p => p + 1)} style={styles.loadMore}>
                  {loading ? <ActivityIndicator color={colors.accent} /> : (
                    <Text style={{ color: colors.accent, fontWeight: '600' }}>Load more</Text>
                  )}
                </TouchableOpacity>
              ) : null}
              contentContainerStyle={{ padding: 12 }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    height: 36, width: 36, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '600' },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  filterPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, marginLeft: 2, letterSpacing: 0.5 },
  entry: { padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entryAuthor: { fontSize: 12, fontWeight: '600' },
  entryContent: { fontSize: 13, marginTop: 4 },
  entryItem: { fontSize: 11, marginTop: 4 },
  loadMore: { padding: 12, alignItems: 'center' },
});
