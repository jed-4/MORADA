import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Task {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  projectId?: string;
  assigneeIds?: string[];
  ownerId?: string;
  assigneeId?: string;
}

interface ScheduleItem {
  id: string;
  name: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  assignedToName: string | null;
  scheduleId: string;
  projectId?: string;
  projectName?: string;
}

interface Project {
  id: string;
  name: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  type: 'task' | 'schedule' | 'timesheet' | 'reminder';
  color: string;
  status?: string;
  projectId?: string;
  projectName?: string;
  raw?: any;
}

type ViewMode = 'month' | 'week' | 'day';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const EVENT_COLORS: Record<string, string> = {
  task: '#3b82f6',
  schedule: '#10b981',
  timesheet: '#f59e0b',
  reminder: '#a855f7',
};

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
}

export default function CalendarScreen({ navigation }: Props) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStartDate, setWeekStartDate] = useState<Date>(getMondayOfWeek(new Date()));
  const [dayViewDate, setDayViewDate] = useState<Date>(new Date());

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1' };

  const fetchData = useCallback(async () => {
    try {
      const [tasksData, projectsData, scheduleData] = await Promise.all([
        apiFetch<Task[]>('/api/tasks').catch(() => []),
        apiFetch<Project[]>('/api/projects').catch(() => []),
        apiFetch<ScheduleItem[]>('/api/schedule-items/all').catch(() => []),
      ]);

      const projectMap: Record<string, string> = {};
      (projectsData || []).forEach(p => { projectMap[p.id] = p.name; });

      const myTasks = (tasksData || []).filter((t: any) => {
        const ids = t.assigneeIds || [];
        return ids.includes(user?.id) || t.ownerId === user?.id || t.assigneeId === user?.id;
      });

      const calEvents: CalendarEvent[] = [];

      myTasks.forEach(task => {
        if (task.dueDate) {
          calEvents.push({
            id: `task-${task.id}`,
            title: task.title,
            date: task.dueDate,
            type: 'task',
            color: EVENT_COLORS.task,
            status: task.status,
            projectId: task.projectId,
            projectName: task.projectId ? projectMap[task.projectId] : undefined,
            raw: task,
          });
        }
      });

      (scheduleData || []).forEach(item => {
        calEvents.push({
          id: `schedule-${item.id}`,
          title: item.name,
          date: item.startDate,
          endDate: item.endDate,
          startTime: item.startTime,
          endTime: item.endTime,
          type: 'schedule',
          color: EVENT_COLORS.schedule,
          status: item.status,
          projectName: item.projectName || (item.projectId ? projectMap[item.projectId] : undefined),
          raw: item,
        });
      });

      setEvents(calEvents);
    } catch (e) {
      console.error('Failed to fetch calendar data:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const getEventsForDate = useCallback((date: Date): CalendarEvent[] => {
    return events.filter(event => {
      const eventDate = new Date(event.date);
      eventDate.setHours(0, 0, 0, 0);
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);

      if (event.endDate) {
        const endDate = new Date(event.endDate);
        endDate.setHours(23, 59, 59, 999);
        return checkDate >= eventDate && checkDate <= endDate;
      }
      return isSameDay(eventDate, checkDate);
    });
  }, [events]);

  const getDotsForDate = useCallback((date: Date): string[] => {
    const dayEvents = getEventsForDate(date);
    const dotColors: string[] = [];
    const seen = new Set<string>();
    dayEvents.forEach(event => {
      if (!seen.has(event.color) && dotColors.length < 3) {
        seen.add(event.color);
        dotColors.push(event.color);
      }
    });
    return dotColors;
  }, [getEventsForDate]);

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    let startOffset = firstDay.getDay();
    startOffset = startOffset === 0 ? 6 : startOffset - 1;

    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: prevMonthLastDay - i, month: prevMonth, year: prevYear, isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: currentMonth, year: currentYear, isCurrentMonth: true });
    }
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    while (cells.length < 42) {
      const d = cells.length - startOffset - daysInMonth + 1;
      cells.push({ day: d, month: nextMonth, year: nextYear, isCurrentMonth: false });
    }

    const rows: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [currentYear, currentMonth]);

  const navigatePeriod = (direction: number) => {
    if (viewMode === 'month') {
      let newMonth = currentMonth + direction;
      let newYear = currentYear;
      if (newMonth < 0) { newMonth = 11; newYear--; }
      if (newMonth > 11) { newMonth = 0; newYear++; }
      setCurrentMonth(newMonth);
      setCurrentYear(newYear);
    } else if (viewMode === 'week') {
      const newStart = new Date(weekStartDate);
      newStart.setDate(newStart.getDate() + direction * 7);
      setWeekStartDate(newStart);
    } else {
      const newDay = new Date(dayViewDate);
      newDay.setDate(newDay.getDate() + direction);
      setDayViewDate(newDay);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setSelectedDate(now);
    setWeekStartDate(getMondayOfWeek(now));
    setDayViewDate(now);
  };

  const handleEventTap = (event: CalendarEvent) => {
    if (event.type === 'task' && event.raw) {
      const task = event.raw;
      Alert.alert(
        task.title,
        [
          `Status: ${task.status || 'N/A'}`,
          `Due: ${task.dueDate ? formatDateShort(task.dueDate) : 'N/A'}`,
          event.projectName ? `Project: ${event.projectName}` : null,
        ].filter(Boolean).join('\n'),
        [{ text: 'OK' }]
      );
    } else if (event.type === 'schedule' && event.raw) {
      const item = event.raw;
      Alert.alert(
        item.name,
        [
          `Status: ${item.status || 'N/A'}`,
          `Start: ${formatDateShort(item.startDate)}`,
          `End: ${formatDateShort(item.endDate)}`,
          event.projectName ? `Project: ${event.projectName}` : null,
        ].filter(Boolean).join('\n'),
        [{ text: 'OK' }]
      );
    }
  };

  const getPeriodLabel = (): string => {
    if (viewMode === 'month') {
      return `${MONTHS[currentMonth]} ${currentYear}`;
    } else if (viewMode === 'week') {
      const endDate = new Date(weekStartDate);
      endDate.setDate(endDate.getDate() + 6);
      const startStr = `${weekStartDate.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][weekStartDate.getMonth()]}`;
      const endStr = `${endDate.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][endDate.getMonth()]}`;
      return `${startStr} - ${endStr}`;
    } else {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return `${dayNames[dayViewDate.getDay()]}, ${dayViewDate.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dayViewDate.getMonth()]} ${dayViewDate.getFullYear()}`;
    }
  };

  const renderEventItem = (event: CalendarEvent, compact: boolean = false) => (
    <TouchableOpacity
      key={event.id}
      style={[
        styles.eventItem,
        { backgroundColor: colors.card, borderColor: colors.border },
        compact && styles.eventItemCompact,
      ]}
      onPress={() => handleEventTap(event)}
      activeOpacity={0.7}
    >
      <View style={[styles.eventColorStrip, { backgroundColor: event.color }]} />
      <View style={styles.eventContent}>
        <Text style={[styles.eventTitle, { color: colors.text }, compact && styles.eventTitleCompact]} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={styles.eventMeta}>
          {event.startTime && (
            <Text style={[styles.eventTime, { color: colors.secondary }]}>
              {formatTime(event.startTime)}
              {event.endTime ? ` - ${formatTime(event.endTime)}` : ''}
            </Text>
          )}
          {event.projectName && (
            <Text style={[styles.eventProject, { color: colors.accent }]} numberOfLines={1}>
              {event.projectName}
            </Text>
          )}
        </View>
      </View>
      <View style={[styles.eventTypeBadge, { backgroundColor: event.color + '20' }]}>
        <Text style={[styles.eventTypeText, { color: event.color }]}>
          {event.type === 'task' ? 'Task' : event.type === 'schedule' ? 'Schedule' : event.type === 'timesheet' ? 'Time' : 'Reminder'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderMonthView = () => {
    const cellWidth = (SCREEN_WIDTH - 32) / 7;
    const selectedEvents = getEventsForDate(selectedDate);

    return (
      <View>
        <View style={styles.dayNamesRow}>
          {DAY_NAMES.map(name => (
            <View key={name} style={[styles.dayNameCell, { width: cellWidth }]}>
              <Text style={[styles.dayNameText, { color: colors.secondary }]}>{name}</Text>
            </View>
          ))}
        </View>

        {calendarGrid.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.calendarRow}>
            {row.map((cell, cellIdx) => {
              const cellDate = new Date(cell.year, cell.month, cell.day);
              const isCurrentDay = isToday(cellDate);
              const isSelected = isSameDay(cellDate, selectedDate);
              const dots = getDotsForDate(cellDate);

              return (
                <TouchableOpacity
                  key={cellIdx}
                  style={[styles.calendarCell, { width: cellWidth }]}
                  onPress={() => setSelectedDate(cellDate)}
                  activeOpacity={0.6}
                >
                  <View style={[
                    styles.dayCellInner,
                    isSelected && { backgroundColor: colors.accent },
                    isCurrentDay && !isSelected && { backgroundColor: colors.accent + '30' },
                  ]}>
                    <Text style={[
                      styles.dayNumber,
                      { color: cell.isCurrentMonth ? colors.text : colors.muted },
                      isSelected && { color: '#ffffff', fontWeight: '700' },
                      isCurrentDay && !isSelected && { color: colors.accent, fontWeight: '700' },
                    ]}>
                      {cell.day}
                    </Text>
                  </View>
                  <View style={styles.dotsRow}>
                    {dots.map((dotColor, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: dotColor }]} />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={[styles.selectedDateHeader, { borderTopColor: colors.border }]}>
          <Text style={[styles.selectedDateText, { color: colors.text }]}>
            {isToday(selectedDate) ? 'Today' : `${DAY_NAMES[(selectedDate.getDay() + 6) % 7]}, ${selectedDate.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][selectedDate.getMonth()]}`}
          </Text>
          <Text style={[styles.selectedEventCount, { color: colors.secondary }]}>
            {selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}
          </Text>
        </View>

        {selectedEvents.length === 0 ? (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={28} color={colors.muted} />
            <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No events on this day</Text>
          </View>
        ) : (
          selectedEvents.map(event => renderEventItem(event))
        )}
      </View>
    );
  };

  const renderWeekView = () => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    return (
      <View>
        {days.map((day, idx) => {
          const dayEvents = getEventsForDate(day);
          const currentDay = isToday(day);

          return (
            <View key={idx} style={[styles.weekDaySection, { borderBottomColor: colors.border }]}>
              <View style={styles.weekDayHeader}>
                <View style={[
                  styles.weekDayBadge,
                  currentDay && { backgroundColor: colors.accent },
                  !currentDay && { backgroundColor: colors.card },
                ]}>
                  <Text style={[
                    styles.weekDayName,
                    { color: currentDay ? '#ffffff' : colors.secondary },
                  ]}>
                    {DAY_NAMES[idx]}
                  </Text>
                  <Text style={[
                    styles.weekDayNumber,
                    { color: currentDay ? '#ffffff' : colors.text },
                  ]}>
                    {day.getDate()}
                  </Text>
                </View>
                <Text style={[styles.weekEventCount, { color: colors.muted }]}>
                  {dayEvents.length > 0 ? `${dayEvents.length}` : ''}
                </Text>
              </View>
              {dayEvents.length === 0 ? (
                <View style={styles.weekEmptyDay}>
                  <Text style={[styles.weekEmptyText, { color: colors.muted }]}>No events</Text>
                </View>
              ) : (
                dayEvents.map(event => renderEventItem(event, true))
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderDayView = () => {
    const dayEvents = getEventsForDate(dayViewDate);
    const sortedEvents = [...dayEvents].sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return 0;
    });

    return (
      <View>
        {sortedEvents.length === 0 ? (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={36} color={colors.muted} />
            <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No events on this day</Text>
          </View>
        ) : (
          sortedEvents.map(event => (
            <TouchableOpacity
              key={event.id}
              style={[styles.dayEventItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleEventTap(event)}
              activeOpacity={0.7}
            >
              <View style={[styles.dayEventColorBar, { backgroundColor: event.color }]} />
              <View style={styles.dayEventTimeCol}>
                {event.startTime ? (
                  <>
                    <Text style={[styles.dayEventTimeText, { color: colors.text }]}>{formatTime(event.startTime)}</Text>
                    {event.endTime && (
                      <Text style={[styles.dayEventEndTime, { color: colors.secondary }]}>{formatTime(event.endTime)}</Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.dayEventTimeText, { color: colors.muted }]}>All day</Text>
                )}
              </View>
              <View style={styles.dayEventContent}>
                <Text style={[styles.dayEventTitle, { color: colors.text }]} numberOfLines={2}>{event.title}</Text>
                {event.projectName && (
                  <Text style={[styles.dayEventProject, { color: colors.accent }]} numberOfLines={1}>{event.projectName}</Text>
                )}
                {event.status && (
                  <Text style={[styles.dayEventStatus, { color: colors.secondary }]}>{event.status}</Text>
                )}
              </View>
              <View style={[styles.eventTypeBadge, { backgroundColor: event.color + '20' }]}>
                <Text style={[styles.eventTypeText, { color: event.color }]}>
                  {event.type === 'task' ? 'Task' : event.type === 'schedule' ? 'Schedule' : event.type === 'timesheet' ? 'Time' : 'Reminder'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Calendar</Text>
      </View>

      <View style={[styles.segmentedControl, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(['month', 'week', 'day'] as ViewMode[]).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.segmentButton,
              viewMode === mode && { backgroundColor: colors.accent },
            ]}
            onPress={() => setViewMode(mode)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.segmentText,
              { color: viewMode === mode ? '#ffffff' : colors.secondary },
              viewMode === mode && { fontWeight: '600' },
            ]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.periodNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigatePeriod(-1)} style={styles.navButton} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.periodLabelContainer}>
          <Text style={[styles.periodLabel, { color: colors.text }]}>{getPeriodLabel()}</Text>
        </View>
        <TouchableOpacity onPress={() => navigatePeriod(1)} style={styles.navButton} activeOpacity={0.6}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToToday} style={[styles.todayButton, { borderColor: colors.accent }]} activeOpacity={0.6}>
          <Text style={[styles.todayButtonText, { color: colors.accent }]}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'day' && renderDayView()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 13 },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  navButton: { padding: 6 },
  periodLabelContainer: { flex: 1, alignItems: 'center' },
  periodLabel: { fontSize: 16, fontWeight: '600' },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  todayButtonText: { fontSize: 12, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  dayNamesRow: { flexDirection: 'row', marginBottom: 4 },
  dayNameCell: { alignItems: 'center', paddingVertical: 6 },
  dayNameText: { fontSize: 12, fontWeight: '600' },
  calendarRow: { flexDirection: 'row' },
  calendarCell: { alignItems: 'center', paddingVertical: 4 },
  dayCellInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: { fontSize: 14 },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    height: 6,
    alignItems: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  selectedDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 8,
    marginTop: 8,
    borderTopWidth: 1,
  },
  selectedDateText: { fontSize: 16, fontWeight: '600' },
  selectedEventCount: { fontSize: 13 },
  emptySection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  emptySectionText: { fontSize: 14 },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  eventItemCompact: { marginBottom: 6 },
  eventColorStrip: { width: 4, alignSelf: 'stretch' },
  eventContent: { flex: 1, paddingVertical: 10, paddingHorizontal: 10 },
  eventTitle: { fontSize: 14, fontWeight: '500' },
  eventTitleCompact: { fontSize: 13 },
  eventMeta: { flexDirection: 'row', gap: 8, marginTop: 3 },
  eventTime: { fontSize: 12 },
  eventProject: { fontSize: 12 },
  eventTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 10,
  },
  eventTypeText: { fontSize: 10, fontWeight: '600' },
  weekDaySection: { marginBottom: 4, borderBottomWidth: 1, paddingBottom: 8 },
  weekDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  weekDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  weekDayName: { fontSize: 12, fontWeight: '600' },
  weekDayNumber: { fontSize: 16, fontWeight: '700' },
  weekEventCount: { fontSize: 12 },
  weekEmptyDay: { paddingVertical: 6, paddingLeft: 12 },
  weekEmptyText: { fontSize: 12, fontStyle: 'italic' },
  dayEventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  dayEventColorBar: { width: 4, alignSelf: 'stretch' },
  dayEventTimeCol: {
    width: 70,
    paddingVertical: 12,
    paddingLeft: 10,
    alignItems: 'center',
  },
  dayEventTimeText: { fontSize: 13, fontWeight: '600' },
  dayEventEndTime: { fontSize: 11, marginTop: 2 },
  dayEventContent: { flex: 1, paddingVertical: 10, paddingHorizontal: 8 },
  dayEventTitle: { fontSize: 15, fontWeight: '500' },
  dayEventProject: { fontSize: 12, marginTop: 3 },
  dayEventStatus: { fontSize: 11, marginTop: 2 },
});
