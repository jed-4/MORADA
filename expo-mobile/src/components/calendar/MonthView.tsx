import { memo, useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { fontSize, fontWeight, radius, type Theme } from '../../theme';
import { toLocalDateStr } from '../../lib/dates';
import {
  DAY_NAMES,
  EventCard,
  isSameDay,
  isToday,
  MONTHS_SHORT,
  SCHEDULE_STATUS_LABELS,
  type CalendarEvent,
  type EventsByDay,
} from './shared';

// Month grid with full-height tappable day cells (up to 2 event-title chips
// + overflow count) and the selected day's agenda below. Horizontal swipe on
// the grid navigates months.

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_CELL_CHIPS = 2;

export interface MonthCell {
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
}

interface TaskStatusOption {
  value: string;
  label: string;
  color: string;
}

interface MonthViewProps {
  theme: Theme;
  calendarGrid: MonthCell[][];
  selectedDate: Date;
  eventsByDay: EventsByDay;
  refreshing: boolean;
  onRefresh: () => void;
  onSelectDay: (date: Date) => void;
  /** Long-press a day cell → create a task on that day. */
  onDayLongPress: (dateKey: string) => void;
  onEventPress: (event: CalendarEvent) => void;
  /** Swipe left/right on the grid → next/previous month. */
  onNavigateMonth: (direction: number) => void;
  showStatusChips: boolean;
  taskStatusOptions: TaskStatusOption[];
}

function MonthViewInner({
  theme,
  calendarGrid,
  selectedDate,
  eventsByDay,
  refreshing,
  onRefresh,
  onSelectDay,
  onDayLongPress,
  onEventPress,
  onNavigateMonth,
  showStatusChips,
  taskStatusOptions,
}: MonthViewProps) {
  const cellWidth = (SCREEN_WIDTH - 32) / 7;
  const selectedKey = toLocalDateStr(selectedDate);
  const selectedEvents = eventsByDay[selectedKey] || [];

  // Horizontal swipe on the grid changes month; generous fail offsets keep
  // vertical scrolling and cell taps/long-presses responsive.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onEnd(e => {
          'worklet';
          if (e.translationX < -50) runOnJS(onNavigateMonth)(1);
          else if (e.translationX > 50) runOnJS(onNavigateMonth)(-1);
        }),
    [onNavigateMonth],
  );

  const statusChipFor = (event: CalendarEvent): { label: string; color: string } | null => {
    if (!showStatusChips) return null;
    if (event.type === 'task') {
      const opt = taskStatusOptions.find(o => o.value === (event.status || 'todo'));
      return opt ? { label: opt.label, color: opt.color } : null;
    }
    if (event.type === 'schedule' && event.statusColor && event.status) {
      return { label: SCHEDULE_STATUS_LABELS[event.status] || event.status, color: event.statusColor };
    }
    return null;
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <GestureDetector gesture={swipeGesture}>
        <View>
          <View style={styles.dayNamesRow}>
            {DAY_NAMES.map(name => (
              <View key={name} style={[styles.dayNameCell, { width: cellWidth }]}>
                <Text style={[styles.dayNameText, { color: theme.textSecondary }]}>{name}</Text>
              </View>
            ))}
          </View>

          {calendarGrid.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.calendarRow}>
              {row.map((cell, cellIdx) => {
                const cellDate = new Date(cell.year, cell.month, cell.day);
                const cellKey = toLocalDateStr(cellDate);
                const isCurrentDay = isToday(cellDate);
                const isSelected = isSameDay(cellDate, selectedDate);
                const cellEvents = eventsByDay[cellKey] || [];
                const visible = cellEvents.slice(0, MAX_CELL_CHIPS);
                const overflow = cellEvents.length - visible.length;

                return (
                  <Pressable
                    key={cellIdx}
                    style={[
                      styles.dayCell,
                      { width: cellWidth, borderColor: theme.border + '60' },
                      isSelected && { backgroundColor: theme.primary + '18', borderColor: theme.primary + '60' },
                    ]}
                    onPress={() => onSelectDay(cellDate)}
                    onLongPress={() => onDayLongPress(cellKey)}
                  >
                    <View style={styles.dayNumWrap}>
                      {isCurrentDay ? (
                        <View style={[styles.todayBubble, { backgroundColor: theme.primary }]}>
                          <Text style={styles.todayBubbleText}>{cell.day}</Text>
                        </View>
                      ) : (
                        <Text style={[
                          styles.dayNumber,
                          { color: cell.isCurrentMonth ? theme.textPrimary : theme.textMuted },
                          isSelected && { color: theme.primary, fontWeight: fontWeight.bold },
                        ]}>
                          {cell.day}
                        </Text>
                      )}
                    </View>
                    {visible.map(event => (
                      <View
                        key={event.id}
                        style={[styles.cellChip, { backgroundColor: (event.color || theme.textMuted) + '30' }]}
                      >
                        <Text
                          style={[styles.cellChipText, { color: theme.textPrimary }]}
                          numberOfLines={1}
                        >
                          {event.title}
                        </Text>
                      </View>
                    ))}
                    {overflow > 0 && (
                      <Text style={[styles.cellOverflow, { color: theme.textSecondary }]}>+{overflow}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </GestureDetector>

      <View style={[styles.selectedDateHeader, { borderTopColor: theme.border }]}>
        <Text style={[styles.selectedDateText, { color: theme.textPrimary }]}>
          {isToday(selectedDate) ? 'Today' : `${DAY_NAMES[(selectedDate.getDay() + 6) % 7]}, ${selectedDate.getDate()} ${MONTHS_SHORT[selectedDate.getMonth()]}`}
        </Text>
        <Text style={[styles.selectedEventCount, { color: theme.textSecondary }]}>
          {selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}
        </Text>
      </View>

      {selectedEvents.length === 0 ? (
        <View style={[styles.emptySection, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="calendar-outline" size={28} color={theme.textMuted} />
          <Text style={[styles.emptySectionText, { color: theme.textSecondary }]}>No events on this day</Text>
        </View>
      ) : (
        selectedEvents.map(event => (
          <EventCard
            key={event.id}
            event={event}
            theme={theme}
            onPress={onEventPress}
            statusChip={statusChipFor(event)}
          />
        ))
      )}
    </ScrollView>
  );
}

export const MonthView = memo(MonthViewInner);

const styles = StyleSheet.create({
  dayNamesRow: { flexDirection: 'row', marginBottom: 4 },
  dayNameCell: { alignItems: 'center', paddingVertical: 6 },
  dayNameText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  calendarRow: { flexDirection: 'row' },
  dayCell: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 2,
    paddingBottom: 2,
    gap: 2,
  },
  dayNumWrap: {
    alignItems: 'center',
    paddingTop: 3,
    paddingBottom: 1,
  },
  dayNumber: { fontSize: fontSize.bodySm },
  todayBubble: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBubbleText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  cellChip: {
    borderRadius: radius.sm,
    paddingHorizontal: 3,
    paddingVertical: 1.5,
  },
  cellChipText: { fontSize: fontSize.label, fontWeight: fontWeight.medium },
  cellOverflow: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  selectedDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 8,
    marginTop: 8,
    borderTopWidth: 1,
  },
  selectedDateText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  selectedEventCount: { fontSize: fontSize.bodySm },
  emptySection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 8,
  },
  emptySectionText: { fontSize: fontSize.sm },
});
