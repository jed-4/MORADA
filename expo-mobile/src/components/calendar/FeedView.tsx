import { Fragment, memo, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { metrics, space, tabular, type, useColors } from '../../theme';
import { dateStrOf, toLocalDateStr } from '../../lib/dates';
import { CalendarBlock, Card, Divider, EmptyState, FAB_CLEARANCE, NowLine } from '../kit';
import {
  eventBlockColor,
  formatClock,
  formatClockRange,
  formatDateRange,
  isEventAllDay,
  isToday,
  timeToMinutes,
  type CalendarEvent,
  type EventsByDay,
} from './shared';

// Agenda list: events from 30 days back to 60 days ahead, grouped by day,
// each day one card. Receives pre-bucketed eventsByDay — no per-render filtering.

const L = metrics.calendar.list;
const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

interface FeedViewProps {
  eventsByDay: EventsByDay;
  nowMinutes: number;
  refreshing: boolean;
  onRefresh: () => void;
  onEventPress: (event: CalendarEvent) => void;
  /** Long-press on a day label → create a task on that day. */
  onDayLongPress: (dateKey: string) => void;
}

interface DayGroup {
  dateKey: string;
  events: CalendarEvent[];
}

/** Second line under the title: time range (+ project), or the multi-day span. */
function subLine(event: CalendarEvent): string | null {
  const parts: string[] = [];
  if (event.startTime) parts.push(formatClockRange(event.startTime, event.endTime));
  else if (event.type === 'schedule') {
    const span = formatDateRange(event.date, event.endDate);
    if (span) parts.push(span);
  }
  if (event.projectName && !event.title.includes(event.projectName)) parts.push(event.projectName);
  return parts.length ? parts.join(' · ') : null;
}

function FeedViewInner({ eventsByDay, nowMinutes, refreshing, onRefresh, onEventPress, onDayLongPress }: FeedViewProps) {
  const c = useColors();

  const days = useMemo(() => {
    const now = new Date();
    const cutoffStart = new Date(now);
    cutoffStart.setDate(cutoffStart.getDate() - 30);
    const cutoffEnd = new Date(now);
    cutoffEnd.setDate(cutoffEnd.getDate() + 60);
    const startKey = toLocalDateStr(cutoffStart);
    const endKey = toLocalDateStr(cutoffEnd);

    const list: DayGroup[] = [];
    Object.keys(eventsByDay)
      .filter(k => k >= startKey && k <= endKey)
      .sort()
      .forEach(dateKey => {
        // Multi-day events are bucketed onto every day they span (for the week
        // and month grids); the list shows each event once, on its start day.
        const events = (eventsByDay[dateKey] || []).filter(e => dateStrOf(e.date) === dateKey);
        if (events.length === 0) return;
        // All-day first, then by start time.
        events.sort((a, b) => {
          const aa = isEventAllDay(a) ? -1 : timeToMinutes(a.startTime!);
          const bb = isEventAllDay(b) ? -1 : timeToMinutes(b.startTime!);
          return aa - bb;
        });
        list.push({ dateKey, events });
      });
    return list;
  }, [eventsByDay]);

  const renderDay = ({ item }: { item: DayGroup }) => {
    const d = new Date(item.dateKey + 'T12:00:00');
    const today = isToday(d);
    const label = d.toLocaleDateString('en-AU', DAY_FMT).replace(',', '');
    // Today: the Now row goes before the first timed event that hasn't started.
    const nowIndex = today
      ? (() => {
          const i = item.events.findIndex(e => !isEventAllDay(e) && timeToMinutes(e.startTime!) > nowMinutes);
          return i === -1 ? item.events.length : i;
        })()
      : -1;
    const nowRow = (
      <View key="now" style={s.nowRow} accessibilityLabel={`Now, ${formatClock(`${Math.floor(nowMinutes / 60)}:${nowMinutes % 60}`)}`}>
        <Text style={[type.micro, tabular, s.nowLabel, { color: c.accent }]}>
          {formatClock(`${Math.floor(nowMinutes / 60)}:${nowMinutes % 60}`)}
        </Text>
        <View style={s.flex}>
          <NowLine />
        </View>
      </View>
    );

    return (
      <View style={s.day}>
        <Pressable onLongPress={() => onDayLongPress(item.dateKey)} delayLongPress={metrics.longPressMs}>
          <Text style={[type.meta, { color: c.muted }]}>{today ? `Today · ${label}` : label}</Text>
        </Pressable>
        <Card style={s.card}>
          {item.events.map((event, i) => (
            <Fragment key={`${event.id}-${i}`}>
              {i === nowIndex ? nowRow : i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => onEventPress(event)}
                accessibilityRole="button"
                style={({ pressed }) => [s.row, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
              >
                <Text style={[type.meta, tabular, s.time, { color: c.muted }]}>
                  {isEventAllDay(event) ? 'All day' : formatClock(event.startTime)}
                </Text>
                <View style={s.flex}>
                  <CalendarBlock variant="list" title={event.title} time={subLine(event)} color={eventBlockColor(event)} />
                </View>
              </Pressable>
            </Fragment>
          ))}
          {nowIndex === item.events.length ? nowRow : null}
        </Card>
      </View>
    );
  };

  return (
    <FlatList
      style={s.flex}
      contentContainerStyle={[s.list, days.length === 0 && s.grow]}
      data={days}
      keyExtractor={item => item.dateKey}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      ListEmptyComponent={
        <EmptyState icon={CalendarDays} title="No events" helper="Events from the next 60 days will appear here." />
      }
      renderItem={renderDay}
    />
  );
}

export const FeedView = memo(FeedViewInner);

const s = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  list: { paddingHorizontal: L.padX, paddingBottom: space.screenBottom + FAB_CLEARANCE, gap: L.gap },
  day: { gap: L.dayGap },
  card: { paddingTop: 0, paddingBottom: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: L.rowGap, paddingVertical: L.rowPadY },
  time: { width: L.timeCol, paddingTop: metrics.calendarBlock.listPad.y },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: L.nowGap, paddingVertical: L.rowPadY / 2 },
  nowLabel: { width: L.timeCol - L.nowGap },
});
