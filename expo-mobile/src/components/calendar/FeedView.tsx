import { memo, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontSize, fontWeight, type Theme } from '../../theme';
import { dateStrOf, toLocalDateStr } from '../../lib/dates';
import {
  EventCard,
  formatDayHeader,
  isToday,
  type CalendarEvent,
  type EventsByDay,
} from './shared';

// Agenda feed: events from 30 days back to 60 days ahead, grouped by day.
// Receives pre-bucketed eventsByDay — no per-render filtering.

interface FeedViewProps {
  theme: Theme;
  eventsByDay: EventsByDay;
  refreshing: boolean;
  onRefresh: () => void;
  onEventPress: (event: CalendarEvent) => void;
  /** Long-press on a day header → create a task on that day. */
  onDayLongPress: (dateKey: string) => void;
}

type FeedItem =
  | { type: 'header'; dateKey: string; count: number }
  | { type: 'event'; event: CalendarEvent; dateKey: string };

function FeedViewInner({ theme, eventsByDay, refreshing, onRefresh, onEventPress, onDayLongPress }: FeedViewProps) {
  const items = useMemo(() => {
    const now = new Date();
    const cutoffStart = new Date(now);
    cutoffStart.setDate(cutoffStart.getDate() - 30);
    const cutoffEnd = new Date(now);
    cutoffEnd.setDate(cutoffEnd.getDate() + 60);
    const startKey = toLocalDateStr(cutoffStart);
    const endKey = toLocalDateStr(cutoffEnd);

    const sortedDates = Object.keys(eventsByDay)
      .filter(k => k >= startKey && k <= endKey)
      .sort();

    const list: FeedItem[] = [];
    sortedDates.forEach(dateKey => {
      // Multi-day events are bucketed onto every day they span (for the week
      // and month grids); the feed lists each event once, on its start day.
      const dayEvents = (eventsByDay[dateKey] || []).filter(e => dateStrOf(e.date) === dateKey);
      if (dayEvents.length === 0) return;
      list.push({ type: 'header', dateKey, count: dayEvents.length });
      dayEvents.forEach(event => list.push({ type: 'event', event, dateKey }));
    });
    return list;
  }, [eventsByDay]);

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingBottom: 40 }, items.length === 0 && { flex: 1 }]}
      data={items}
      keyExtractor={(item, idx) => item.type === 'header' ? `hdr-${item.dateKey}` : `ev-${item.event.id}-${idx}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={52} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No events</Text>
          <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
            Events from the next 60 days will appear here.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        if (item.type === 'header') {
          const d = new Date(item.dateKey + 'T12:00:00');
          const headerIsToday = isToday(d);
          return (
            <Pressable
              style={styles.dayHeader}
              onLongPress={() => onDayLongPress(item.dateKey)}
            >
              <Text style={[styles.dayHeaderTitle, { color: theme.textPrimary }]}>
                {headerIsToday ? "Today's Events" : formatDayHeader(d)}
              </Text>
              <Text style={[styles.dayHeaderCount, { color: theme.primary }]}>
                {item.count} {item.count === 1 ? 'event' : 'events'}
              </Text>
            </Pressable>
          );
        }
        return (
          <View style={styles.cardWrap}>
            <EventCard event={item.event} theme={theme} onPress={onEventPress} />
          </View>
        );
      }}
    />
  );
}

export const FeedView = memo(FeedViewInner);

const styles = StyleSheet.create({
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  dayHeaderTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  dayHeaderCount: { fontSize: fontSize.xs },
  cardWrap: { marginHorizontal: 16 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  emptyDesc: { fontSize: fontSize.bodySm, textAlign: 'center', lineHeight: 18 },
});
