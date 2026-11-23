import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, MessageSquare, Settings2, Sparkles } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../services/api';
import { usePolling } from '../lib/usePolling';
import { compactAgo } from '../lib/format';

import { metrics, size, space, tabular, type, useColors } from '../theme';
import { Card, FilterChips, SheetHeader, TextButton, UnreadBadge } from './kit';
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
  const k = useColors();
  const insets = useSafeAreaInsets();

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

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'notes', label: 'Notes' },
    { key: 'changes', label: 'Changes' },
  ];

  return (
    <>
      {/* Header bell (P08): a plain icon like the other header actions; unread as the accent badge. */}
      <Pressable
        onPress={handleOpen}
        hitSlop={metrics.hitSlop}
        style={styles.bellBtn}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Schedule activity, ${unread} new` : 'Schedule activity'}
        testID="button-mobile-schedule-activity-feed"
      >
        <Bell size={size.icon.header} color={k.icon} strokeWidth={metrics.iconStroke} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <UnreadBadge count={unread > 9 ? 9 : unread} />
          </View>
        ) : null}
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.container, { backgroundColor: k.bg, paddingTop: insets.top }]}>
          <View style={styles.header}>
            <SheetHeader title="Schedule activity" cancelLabel="Close" onCancel={() => setOpen(false)} />
            <FilterChips chips={FILTERS} value={filter} onChange={f => { setFilter(f); setPage(1); }} />
          </View>
          {loading && entries.length === 0 ? (
            <View style={styles.center}><ActivityIndicator color={k.accent} /></View>
          ) : entries.length === 0 ? (
            <View style={styles.center}>
              <Text style={[type.body, { color: k.muted }]}>No activity yet</Text>
            </View>
          ) : (
            <FlatList
              data={grouped}
              keyExtractor={(g, idx) => `${g.day}-${idx}`}
              renderItem={({ item: g }) => (
                <View style={styles.day}>
                  <Text style={[type.meta, { color: k.muted }]}>{g.day}</Text>
                  <Card variant="list">
                    {g.items.map(e => {
                      const clickable = !!e.scheduleItemId && !!onSelectItem;
                      const Glyph = e.authorType === 'ai' ? Sparkles : e.source === 'change' || e.authorType === 'system' ? Settings2 : MessageSquare;
                      const inner = (
                        <>
                          <View style={styles.entryHead}>
                            <Glyph size={size.icon.meta} color={k.muted} strokeWidth={metrics.iconStroke} />
                            <Text style={[type.metaSemi, styles.flex, { color: k.text }]} numberOfLines={1}>
                              {e.authorType === 'ai' ? 'AI' : (e.userName || 'System')}
                            </Text>
                            <Text style={[type.caption, tabular, { color: k.muted }]}>{compactAgo(e.createdAt)}</Text>
                          </View>
                          <Text style={[type.bodyPreview, { color: k.textBody }]}>{e.content}</Text>
                          {e.scheduleItemName ? (
                            <Text style={[type.caption, { color: k.muted }]} numberOfLines={1}>{`on ${e.scheduleItemName}`}</Text>
                          ) : null}
                        </>
                      );
                      return clickable ? (
                        <Pressable
                          key={e.id}
                          onPress={() => { onSelectItem!(e.scheduleItemId!); setOpen(false); }}
                          style={({ pressed }) => [styles.entry, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
                          accessibilityRole="button"
                        >
                          {inner}
                        </Pressable>
                      ) : (
                        <View key={e.id} style={styles.entry}>{inner}</View>
                      );
                    })}
                  </Card>
                </View>
              )}
              ListFooterComponent={hasMore ? (
                <TextButton label={loading ? 'Loading…' : 'Load more'} center onPress={() => setPage(p => p + 1)} disabled={loading} />
              ) : undefined}
              contentContainerStyle={[styles.list, { paddingBottom: space.screenBottom + insets.bottom }]}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bellBtn: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -metrics.badge.height / 2, right: -metrics.badge.height / 2 },
  container: { flex: 1 },
  header: { paddingHorizontal: space.screenX, gap: space.inline, paddingBottom: space.inline },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: space.screenX, paddingTop: space.inline, gap: metrics.sheet.gap },
  day: { gap: space.groupHeaderToCard },
  entry: { paddingVertical: metrics.listRow.padY, gap: metrics.listRow.bodyGap },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
});
