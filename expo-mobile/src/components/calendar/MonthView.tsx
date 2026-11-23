import { memo, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { metrics, projectTint, radii, size, space, tabular, type, useColors, type Theme } from '../../theme';
import { CalendarBlock, Card, FAB_CLEARANCE } from '../kit';
import { toLocalDateStr } from '../../lib/dates';
import { useLayout } from '../../lib/useLayout';
import {
  DAY_NAMES,
  eventBlockColor,
  formatClock,
  formatClockRange,
  isEventAllDay,
  isSameDay,
  isToday,
  SCHEDULE_STATUS_LABELS,
  type CalendarEvent,
  type EventsByDay,
} from './shared';

// Month grid with full-height tappable day cells (up to 2 event-title chips
// + overflow count) and the selected day's agenda below. Horizontal swipe on
// the grid navigates months.

const MAX_CELL_CHIPS = 2;
// Wide screen (Duo unfolded): cells are ~2x wider, so taller cells fit more
// titles and longer ones. Phone values above are unchanged.
const MAX_CELL_CHIPS_WIDE = 4;
const WIDE_CELL_MIN_HEIGHT = 104;

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
  const c = useColors();
  const isDark = useColorScheme() === 'dark';
  void theme;
  const { width: screenWidth, isWide } = useLayout();
  const cellWidth = (screenWidth - space.screenX * 2) / 7;
  const maxChips = isWide ? MAX_CELL_CHIPS_WIDE : MAX_CELL_CHIPS;
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

  /** Status word for the agenda line, when "Show status chips" is on. */
  const statusWord = (event: CalendarEvent): string | null => {
    if (!showStatusChips) return null;
    if (event.type === 'task') {
      return taskStatusOptions.find(o => o.value === (event.status || 'todo'))?.label ?? null;
    }
    if (event.type === 'schedule' && event.status) return SCHEDULE_STATUS_LABELS[event.status] || event.status;
    return null;
  };
  const chipFill = (event: CalendarEvent) => {
    const color = eventBlockColor(event);
    return color ? projectTint(color, isDark ? metrics.calendarBlock.tintDark : metrics.calendarBlock.tint, c.bg) : c.internalFill;
  };
  const dayTitle = isToday(selectedDate)
    ? `Today · ${selectedDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}`
    : selectedDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');

  return (
    <ScrollView
      style={mx.flex}
      contentContainerStyle={mx.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      showsVerticalScrollIndicator={false}
    >
      <GestureDetector gesture={swipeGesture}>
        <View>
          <View style={mx.row}>
            {DAY_NAMES.map(name => (
              <View key={name} style={[mx.dayName, { width: cellWidth }]}>
                <Text style={[type.micro, { color: c.muted }]}>{name.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          {calendarGrid.map((row, rowIdx) => (
            <View key={rowIdx} style={[mx.row, { borderTopColor: c.hairline }, mx.weekRow]}>
              {row.map((cell, cellIdx) => {
                const cellDate = new Date(cell.year, cell.month, cell.day);
                const cellKey = toLocalDateStr(cellDate);
                const isCurrentDay = isToday(cellDate);
                const isSelected = isSameDay(cellDate, selectedDate);
                const cellEvents = eventsByDay[cellKey] || [];
                const visible = cellEvents.slice(0, maxChips);
                const overflow = cellEvents.length - visible.length;

                return (
                  <Pressable
                    key={cellIdx}
                    style={[
                      mx.cell,
                      { width: cellWidth },
                      isWide && mx.cellWide,
                      isSelected && { backgroundColor: c.tint },
                    ]}
                    onPress={() => onSelectDay(cellDate)}
                    onLongPress={() => onDayLongPress(cellKey)}
                    delayLongPress={metrics.longPressMs}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${cellDate.toDateString()}, ${cellEvents.length} events`}
                  >
                    <View style={mx.dayNumWrap}>
                      {isCurrentDay ? (
                        <View style={[mx.today, { backgroundColor: c.accent }]}>
                          <Text style={[type.metaSemi, tabular, { color: c.onAccent }]}>{cell.day}</Text>
                        </View>
                      ) : (
                        <Text style={[type.meta, tabular, mx.dayNum, { color: isSelected ? c.accent : cell.isCurrentMonth ? c.text : c.faint }]}>
                          {cell.day}
                        </Text>
                      )}
                    </View>
                    {visible.map(event => (
                      <View key={event.id} style={[mx.chip, { backgroundColor: chipFill(event) }]}>
                        <Text style={[isWide ? type.caption : type.tiny, { color: c.textBody }]} numberOfLines={1}>
                          {event.title}
                        </Text>
                      </View>
                    ))}
                    {overflow > 0 ? <Text style={[type.tiny, tabular, mx.overflow, { color: c.muted }]}>+{overflow}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </GestureDetector>

      {/* The selected day's agenda, in the same style as List view. */}
      <View style={mx.agenda}>
        <View style={mx.agendaHead}>
          <Text style={[type.meta, { color: c.muted }]}>{dayTitle}</Text>
          <Text style={[type.meta, tabular, { color: c.muted }]}>
            {selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}
          </Text>
        </View>
        {selectedEvents.length === 0 ? (
          <Text style={[type.body, mx.none, { color: c.muted }]}>Nothing on this day</Text>
        ) : (
          <Card variant="list">
            {selectedEvents.map(event => {
              const sub = [
                event.startTime ? formatClockRange(event.startTime, event.endTime) : null,
                event.projectName && !event.title.includes(event.projectName) ? event.projectName : null,
                statusWord(event),
              ].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={event.id}
                  onPress={() => onEventPress(event)}
                  accessibilityRole="button"
                  style={({ pressed }) => [mx.eventRow, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
                >
                  <Text style={[type.meta, tabular, mx.eventTime, { color: c.muted }]}>
                    {isEventAllDay(event) ? 'All day' : formatClock(event.startTime)}
                  </Text>
                  <View style={mx.flex}>
                    <CalendarBlock variant="list" title={event.title} time={sub || null} color={eventBlockColor(event)} />
                  </View>
                </Pressable>
              );
            })}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

export const MonthView = memo(MonthViewInner);

const L = metrics.calendar.list;

const mx = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom + FAB_CLEARANCE },
  row: { flexDirection: 'row' },
  weekRow: { borderTopWidth: size.border },
  dayName: { alignItems: 'center', paddingBottom: space.inline },
  cell: { minHeight: metrics.calendar.monthCell, paddingHorizontal: metrics.calendar.colPad / 2, paddingBottom: metrics.calendar.colPad, gap: metrics.calendar.colPad / 2 },
  cellWide: { minHeight: WIDE_CELL_MIN_HEIGHT },
  dayNumWrap: { alignItems: 'center', paddingTop: space.inlineSm, paddingBottom: space.inlineSm / 2 },
  dayNum: { lineHeight: metrics.calendar.monthToday },
  today: { width: metrics.calendar.monthToday, height: metrics.calendar.monthToday, borderRadius: metrics.calendar.monthToday / 2, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: radii.xs, paddingHorizontal: metrics.calendar.colPad, paddingVertical: 1 },
  overflow: { textAlign: 'center' },
  agenda: { gap: L.dayGap, paddingTop: metrics.sheet.gap },
  agendaHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  none: { paddingVertical: space.inline },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: L.rowGap, paddingVertical: L.rowPadY },
  eventTime: { width: L.timeCol, paddingTop: metrics.calendarBlock.listPad.y },
});
