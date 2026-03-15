import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
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
  projectColor?: string | null;
}

interface Project {
  id: string;
  name: string;
  color?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  type: 'task' | 'schedule' | 'timesheet' | 'site_diary' | 'google_cal';
  color: string;
  statusColor?: string;
  status?: string;
  projectId?: string;
  projectName?: string;
  assigneeId?: string;
  raw?: any;
}

interface SavedView {
  id: string;
  name: string;
  isDefault: boolean;
  calendarType: string;
  calendarMode: string;
  filters: {
    eventTypes?: string[];
    projects?: string[];
    status?: string[];
    taskStatuses?: string[];
  };
}

interface TaskStatusOption {
  value: string;
  label: string;
  color: string;
}

type ViewMode = 'list' | 'week' | 'month';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EVENT_COLORS: Record<string, string> = {
  task: '#3b82f6',
  schedule: '#10b981',
  timesheet: '#f59e0b',
  site_diary: '#14b8a6',
  google_cal: '#4285f4',
};

const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  'not-started':   '#94a3b8',
  'not_started':   '#94a3b8',
  'in-progress':   '#3b82f6',
  'in_progress':   '#3b82f6',
  'completed':     '#22c55e',
  'complete':      '#22c55e',
  'done':          '#22c55e',
  'on-hold':       '#f59e0b',
  'on_hold':       '#f59e0b',
  'delayed':       '#ef4444',
  'blocked':       '#ef4444',
  'cancelled':     '#6b7280',
  'booked':        '#8b5cf6',
  'requested':     '#f59e0b',
};

const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  'not-started':   'Not Started',
  'not_started':   'Not Started',
  'in-progress':   'In Progress',
  'in_progress':   'In Progress',
  'completed':     'Completed',
  'complete':      'Completed',
  'done':          'Done',
  'on-hold':       'On Hold',
  'on_hold':       'On Hold',
  'delayed':       'Delayed',
  'blocked':       'Blocked',
  'cancelled':     'Cancelled',
  'booked':        'Booked',
  'requested':     'Requested',
};

const EVENT_TYPE_OPTIONS = [
  { value: 'task', label: 'Tasks', icon: 'checkmark-circle-outline' as const },
  { value: 'schedule', label: 'Schedule', icon: 'construct-outline' as const },
  { value: 'timesheet', label: 'Timesheets', icon: 'time-outline' as const },
  { value: 'site_diary', label: 'Site Diary', icon: 'book-outline' as const },
  { value: 'google_cal', label: 'Google', icon: 'calendar-outline' as const },
];

const HOUR_HEIGHT = 60;
const TIME_LABEL_WIDTH = 44;
const GRID_COL_WIDTH = Math.floor((SCREEN_WIDTH - TIME_LABEL_WIDTH) / 3);
const TOTAL_GRID_HEIGHT = 24 * HOUR_HEIGHT;
const MIN_EVENT_HEIGHT = 22;

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

function formatTimeShort(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${displayH} ${period}`;
  return `${displayH}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDayHeader(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, today)) return `Today — ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  if (isSameDay(date, yesterday)) return `Yesterday — ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  if (isSameDay(date, tomorrow)) return `Tomorrow — ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return `${days[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function getEventDurationMinutes(startTime: string, endTime: string | null | undefined): number {
  if (!endTime) return 60;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return Math.max(end - start, 15);
}

let defaultViewCreated = false;
let cleanupRan = false;

export default function CalendarScreen({ navigation }: Props) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [taskStatusOptions, setTaskStatusOptions] = useState<TaskStatusOption[]>([]);
  const [brandColor, setBrandColor] = useState<string | null>(null);

  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<{
    eventTypes?: string[];
    taskStatuses?: string[];
    excludedTaskStatuses?: string[];
    assignedToMe?: boolean;
    scheduleAssignedToMe?: boolean;
    scheduleAssignedToCompany?: boolean;
    scheduleParentOnly?: boolean;
    scheduleSubOnly?: boolean;
  }>({});

  const [showStatusChips, setShowStatusChips] = useState(true);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showViewsModal, setShowViewsModal] = useState(false);
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [savingView, setSavingView] = useState(false);
  const [showAllDay, setShowAllDay] = useState(true);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStartDate, setWeekStartDate] = useState<Date>(getMondayOfWeek(new Date()));

  const timeGridScrollRef = useRef<ScrollView>(null);
  const weekScrollRef = useRef<ScrollView>(null);
  const weekScrollOffset = useRef(0);
  const CAL_DAY_WIDTH = Math.floor(SCREEN_WIDTH / 3);

  const weekBaseDate = useRef<Date>((() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    d.setHours(0, 0, 0, 0);
    return d;
  })());
  const WEEK_TOTAL_DAYS = 30;

  const weekDays = useMemo(() => {
    const base = weekBaseDate.current;
    return Array.from({ length: WEEK_TOTAL_DAYS }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, []);

  const todayWeekIndex = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return weekDays.findIndex(d => isSameDay(d, today));
  }, [weekDays]);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', input: '#0f172a' }
    : { bg: '#ffffff', card: '#f5f5f4', text: '#1c1917', secondary: '#78716c', border: '#e7e5e4', accent: '#9b7fc4', muted: '#d6d3d1', input: '#f8fafc' };

  const buildDateRange = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { startDate: fmt(start), endDate: fmt(end) };
  }, []);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const dateRange = buildDateRange();

      const [tasksData, projectsData, scheduleData, timesheetsData, diariesData, gcalStatus, viewsData, taskStatusCat, companySettings] = await Promise.all([
        apiFetch<Task[]>('/api/tasks').catch(() => [] as Task[]),
        apiFetch<Project[]>('/api/projects').catch(() => [] as Project[]),
        apiFetch<ScheduleItem[]>(`/api/schedule-items/all?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`).catch(() => [] as ScheduleItem[]),
        apiFetch<any[]>(`/api/timesheets?userId=${user.id}`).catch(() => []),
        apiFetch<any[]>('/api/company/site-diary-entries').catch(() => []),
        apiFetch<{ connected: boolean }>('/api/google-calendar/status').catch(() => ({ connected: false })),
        apiFetch<SavedView[]>('/api/calendar-views?calendarType=personal').catch(() => [] as SavedView[]),
        apiFetch<any>('/api/field-categories/by-key/task.status').catch(() => null),
        apiFetch<any>('/api/company-settings').catch(() => null),
      ]);

      const resolvedBrandColor: string | null = companySettings?.brandColor || null;
      setBrandColor(resolvedBrandColor);

      if (taskStatusCat?.options && Array.isArray(taskStatusCat.options)) {
        setTaskStatusOptions(
          taskStatusCat.options.map((o: any) => ({
            value: o.key || o.value,
            label: o.name || o.label,
            color: o.color || '#6b7280',
          }))
        );
      } else if (taskStatusCat && Array.isArray(taskStatusCat)) {
        setTaskStatusOptions(
          taskStatusCat.map((o: any) => ({
            value: o.key || o.value,
            label: o.name || o.label,
            color: o.color || '#6b7280',
          }))
        );
      }

      const projMap: Record<string, Project> = {};
      (projectsData || []).forEach(p => { projMap[p.id] = p; });
      setProjects(projectsData || []);

      const isGCalConnected = gcalStatus?.connected === true;
      setGoogleConnected(isGCalConnected);

      const calEvents: CalendarEvent[] = [];

      const myTasks = (tasksData || []).filter((t: any) => {
        const ids = t.assigneeIds || [];
        return ids.includes(user.id) || t.ownerId === user.id || t.assigneeId === user.id;
      });

      myTasks.forEach(task => {
        if (task.dueDate) {
          const proj = task.projectId ? projMap[task.projectId] : undefined;
          calEvents.push({
            id: `task-${task.id}`,
            title: task.title,
            date: task.dueDate,
            type: 'task',
            color: proj?.color || resolvedBrandColor || EVENT_COLORS.task,
            status: task.status,
            projectId: task.projectId,
            projectName: proj?.name,
            assigneeId: user.id,
            raw: task,
          });
        }
      });

      (scheduleData || []).forEach(item => {
        const isValidHex = (c: any) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c);
        const scheduleColor = (isValidHex(item.projectColor) ? item.projectColor! : null)
          || (isValidHex(resolvedBrandColor) ? resolvedBrandColor! : null)
          || EVENT_COLORS.schedule;
        const scheduleStatusColor = item.status
          ? (SCHEDULE_STATUS_COLORS[item.status] || EVENT_COLORS.schedule)
          : EVENT_COLORS.schedule;
        calEvents.push({
          id: `schedule-${item.id}`,
          title: item.name,
          date: item.startDate,
          endDate: item.endDate,
          startTime: item.startTime,
          endTime: item.endTime,
          type: 'schedule',
          color: scheduleColor,
          statusColor: scheduleStatusColor,
          status: item.status,
          projectId: item.projectId,
          projectName: item.projectName,
          raw: item,
        });
      });

      (timesheetsData || []).forEach((ts: any) => {
        const hours = parseFloat(ts.duration ?? '0');
        const proj = ts.projectId ? projMap[ts.projectId] : undefined;
        calEvents.push({
          id: `ts-${ts.id}`,
          title: `${proj?.name ?? 'Timesheet'} · ${hours % 1 === 0 ? hours : hours.toFixed(1)}h`,
          date: (ts.date || '').split('T')[0],
          startTime: ts.startTime ?? null,
          endTime: ts.endTime ?? null,
          type: 'timesheet',
          color: EVENT_COLORS.timesheet,
          projectId: ts.projectId,
          projectName: proj?.name,
          assigneeId: user.id,
          raw: ts,
        });
      });

      (diariesData || [])
        .filter((d: any) => d.createdBy === user.id)
        .forEach((d: any) => {
          const proj = d.projectId ? projMap[d.projectId] : undefined;
          calEvents.push({
            id: `diary-${d.id}`,
            title: d.title,
            date: (d.entryDateTime || '').split('T')[0],
            type: 'site_diary',
            color: EVENT_COLORS.site_diary,
            projectId: d.projectId,
            projectName: proj?.name,
            assigneeId: user.id,
            raw: d,
          });
        });

      if (isGCalConnected) {
        try {
          const gcalEvents = await apiFetch<any[]>('/api/google-calendar/events').catch(() => []);
          (gcalEvents || []).forEach((ev: any) => {
            const isAllDay = !!ev.start?.date;
            const start = isAllDay ? ev.start.date : ev.start?.dateTime?.split('T')[0];
            const end = isAllDay
              ? ev.end?.date
              : ev.end?.dateTime?.split('T')[0];
            let gcStartTime: string | null = null;
            let gcEndTime: string | null = null;
            if (!isAllDay && ev.start?.dateTime) {
              const dtStart = new Date(ev.start.dateTime);
              gcStartTime = `${String(dtStart.getHours()).padStart(2, '0')}:${String(dtStart.getMinutes()).padStart(2, '0')}`;
            }
            if (!isAllDay && ev.end?.dateTime) {
              const dtEnd = new Date(ev.end.dateTime);
              gcEndTime = `${String(dtEnd.getHours()).padStart(2, '0')}:${String(dtEnd.getMinutes()).padStart(2, '0')}`;
            }
            if (start) {
              calEvents.push({
                id: `gcal-${ev.id}`,
                title: ev.summary || 'Untitled',
                date: start,
                endDate: end,
                startTime: gcStartTime,
                endTime: gcEndTime,
                type: 'google_cal',
                color: EVENT_COLORS.google_cal,
                assigneeId: user.id,
                raw: ev,
              });
            }
          });
        } catch {}
      }

      setAllEvents(calEvents);

      const fetchedViews = (viewsData || []).filter(v => v.name && v.name.trim() !== '');

      const blankViews = (viewsData || []).filter(v => !v.name || v.name.trim() === '');
      blankViews.forEach(v => apiRequest(`/api/calendar-views/${v.id}`, 'DELETE').catch(() => {}));

      setViews(fetchedViews);

      if (fetchedViews.length === 0 && !defaultViewCreated) {
        defaultViewCreated = true;
        try {
          const res = await apiRequest('/api/calendar-views', 'POST', {
            name: 'All Events',
            calendarType: 'personal',
            filters: {},
            calendarMode: 'week',
            isDefault: true,
          });
          const newView: SavedView = await res.json();
          if (newView?.id) {
            setViews([newView]);
            setSelectedViewId(newView.id);
            setActiveFilters({});
            setViewMode('week');
          }
        } catch {}
      } else if (fetchedViews.length > 0 && !selectedViewId) {
        const defaultView = fetchedViews.find(v => v.isDefault) || fetchedViews[0];
        setSelectedViewId(defaultView.id);
        setActiveFilters(defaultView.filters || {});
        const rawMode = defaultView.calendarMode as string;
        const resolved: ViewMode =
          defaultView.name === 'All Events' ? 'week' :
          rawMode === 'month' ? 'month' :
          rawMode === 'list' ? 'list' :
          'week';
        setViewMode(resolved);
      }
    } catch (e) {
      console.error('Failed to fetch calendar data:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  useEffect(() => {
    if (cleanupRan) return;
    cleanupRan = true;
    apiRequest('/api/calendar-views/cleanup-duplicates', 'POST', { calendarType: 'personal' })
      .then(() => fetchData())
      .catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const filteredEvents = useMemo(() => {
    let events = allEvents;
    if (activeFilters.assignedToMe) {
      events = events.filter(e => !!e.assigneeId);
    }
    if (activeFilters.eventTypes && activeFilters.eventTypes.length > 0) {
      events = events.filter(e => activeFilters.eventTypes!.includes(e.type));
    }
    if (activeFilters.taskStatuses && activeFilters.taskStatuses.length > 0) {
      events = events.filter(e => {
        if (e.type !== 'task') return true;
        return activeFilters.taskStatuses!.includes(e.status || 'todo');
      });
    }
    if (activeFilters.excludedTaskStatuses && activeFilters.excludedTaskStatuses.length > 0) {
      events = events.filter(e => {
        if (e.type !== 'task') return true;
        return !activeFilters.excludedTaskStatuses!.includes(e.status || 'todo');
      });
    }
    if (activeFilters.scheduleAssignedToMe || activeFilters.scheduleAssignedToCompany) {
      events = events.filter(e => {
        if (e.type !== 'schedule') return true;
        const rawAssignedToId: string | null | undefined = e.raw?.assignedToId;
        const rawAssignedToName: string | null | undefined = e.raw?.assignedToName;
        const matchMe = activeFilters.scheduleAssignedToMe && user?.id && (
          rawAssignedToId === user.id ||
          (!!user.firstName && !!rawAssignedToName &&
            rawAssignedToName.toLowerCase().includes(user.firstName.toLowerCase()))
        );
        const matchCompany = activeFilters.scheduleAssignedToCompany &&
          !!rawAssignedToId?.startsWith('company:');
        return !!(matchMe || matchCompany);
      });
    }
    const parentOnly = !!activeFilters.scheduleParentOnly;
    const subOnly = !!activeFilters.scheduleSubOnly;
    if (parentOnly !== subOnly) {
      events = events.filter(e => {
        if (e.type !== 'schedule') return true;
        const hasParent = !!e.raw?.parentItemId;
        return parentOnly ? !hasParent : hasParent;
      });
    }
    return events;
  }, [allEvents, activeFilters]);

  const getEventsForDate = useCallback((date: Date): CalendarEvent[] => {
    return filteredEvents.filter(event => {
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
  }, [filteredEvents]);

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

  const scrollWeekTo = (offsetX: number, animated = true) => {
    const clamped = Math.max(0, Math.min(offsetX, (WEEK_TOTAL_DAYS - 1) * CAL_DAY_WIDTH));
    weekScrollRef.current?.scrollTo({ x: clamped, animated });
    weekScrollOffset.current = clamped;
  };

  const navigatePeriod = (direction: number) => {
    if (viewMode === 'month') {
      let newMonth = currentMonth + direction;
      let newYear = currentYear;
      if (newMonth < 0) { newMonth = 11; newYear--; }
      if (newMonth > 11) { newMonth = 0; newYear++; }
      setCurrentMonth(newMonth);
      setCurrentYear(newYear);
    } else if (viewMode === 'week') {
      scrollWeekTo(weekScrollOffset.current + direction * 3 * CAL_DAY_WIDTH);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'week') {
      setWeekStartDate(getMondayOfWeek(new Date()));
      setTimeout(() => {
        const x = Math.max(0, (todayWeekIndex - 1) * CAL_DAY_WIDTH);
        scrollWeekTo(x, false);
        timeGridScrollRef.current?.scrollTo({ y: 7 * HOUR_HEIGHT, animated: false });
      }, 50);
    } else if (mode === 'month') {
      const now = new Date();
      setCurrentMonth(now.getMonth());
      setCurrentYear(now.getFullYear());
      setSelectedDate(now);
    }
    setViewMode(mode);
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setSelectedDate(now);
    setWeekStartDate(getMondayOfWeek(now));
    if (viewMode === 'week') {
      const x = Math.max(0, (todayWeekIndex - 1) * CAL_DAY_WIDTH);
      scrollWeekTo(x);
    }
  };

  const handleWeekScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    weekScrollOffset.current = offsetX;
    const leftIndex = Math.round(offsetX / CAL_DAY_WIDTH);
    const centerIndex = Math.min(leftIndex + 1, weekDays.length - 1);
    const centerDay = weekDays[centerIndex];
    if (centerDay) {
      const monday = getMondayOfWeek(centerDay);
      setWeekStartDate(prev => {
        if (prev.getTime() !== monday.getTime()) return monday;
        return prev;
      });
    }
  }, [weekDays, CAL_DAY_WIDTH]);

  const handleSelectView = (view: SavedView) => {
    setSelectedViewId(view.id);
    setActiveFilters(view.filters || {});
    const rawMode = view.calendarMode as string;
    const resolved: ViewMode =
      view.name === 'All Events' ? 'week' :
      rawMode === 'month' ? 'month' :
      rawMode === 'list' ? 'list' :
      'week';
    setViewMode(resolved);
    setShowViewsModal(false);
  };

  const handleDeleteView = (view: SavedView) => {
    if (view.isDefault) return;
    Alert.alert(
      'Delete View',
      `Delete "${view.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRequest(`/api/calendar-views/${view.id}`, 'DELETE');
              const updated = views.filter(v => v.id !== view.id);
              setViews(updated);
              if (selectedViewId === view.id) {
                const fallback = updated.find(v => v.isDefault) || updated[0];
                if (fallback) {
                  setSelectedViewId(fallback.id);
                  setActiveFilters(fallback.filters || {});
                } else {
                  setSelectedViewId(null);
                  setActiveFilters({});
                }
              }
            } catch {
              Alert.alert('Error', 'Could not delete view.');
            }
          },
        },
      ]
    );
  };

  const handleCreateView = async () => {
    if (!newViewName.trim()) return;
    setSavingView(true);
    try {
      const res = await apiRequest('/api/calendar-views', 'POST', {
        name: newViewName.trim(),
        calendarType: 'personal',
        filters: activeFilters,
        calendarMode: viewMode,
        isDefault: false,
      });
      const newView: SavedView = await res.json();
      if (newView?.id) {
        setViews(prev => [...prev, newView]);
        setSelectedViewId(newView.id);
        setNewViewName('');
        setShowCreateViewModal(false);
      }
    } catch {
      Alert.alert('Error', 'Could not create view.');
    } finally {
      setSavingView(false);
    }
  };

  const handleSaveFiltersToView = async () => {
    if (!selectedViewId) return;
    const cv = views.find(v => v.id === selectedViewId);
    if (!cv || cv.isDefault) return;
    try {
      await apiRequest(`/api/calendar-views/${selectedViewId}`, 'PATCH', { filters: activeFilters, calendarMode: viewMode });
      setViews(prev => prev.map(v => v.id === selectedViewId ? { ...v, filters: activeFilters, calendarMode: viewMode } : v));
    } catch {}
    setShowFilterModal(false);
  };

  const activeFilterCount = (activeFilters.eventTypes?.length || 0)
    + (activeFilters.taskStatuses?.length || 0)
    + (activeFilters.excludedTaskStatuses?.length || 0)
    + (activeFilters.assignedToMe ? 1 : 0)
    + (activeFilters.scheduleAssignedToMe ? 1 : 0)
    + (activeFilters.scheduleAssignedToCompany ? 1 : 0)
    + (activeFilters.scheduleParentOnly ? 1 : 0)
    + (activeFilters.scheduleSubOnly ? 1 : 0);
  const currentView = views.find(v => v.id === selectedViewId);
  const canSaveFilters = currentView && !currentView.isDefault;

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
    } else if (event.type === 'timesheet' && event.raw) {
      const ts = event.raw;
      const hours = parseFloat(ts.duration ?? '0');
      Alert.alert(
        event.title,
        [
          event.projectName ? `Project: ${event.projectName}` : null,
          `Hours: ${hours % 1 === 0 ? hours : hours.toFixed(1)}`,
          ts.description ? `Notes: ${ts.description}` : null,
        ].filter(Boolean).join('\n'),
        [{ text: 'OK' }]
      );
    } else if (event.type === 'site_diary') {
      Alert.alert(event.title, event.projectName ? `Project: ${event.projectName}` : '', [{ text: 'OK' }]);
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case 'task': return 'Task';
      case 'schedule': return 'Schedule';
      case 'timesheet': return 'Time';
      case 'site_diary': return 'Diary';
      case 'google_cal': return 'Google';
      default: return type;
    }
  };

  const getTypeIcon = (type: string): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (type) {
      case 'task': return 'checkmark-circle-outline';
      case 'schedule': return 'construct-outline';
      case 'timesheet': return 'time-outline';
      case 'site_diary': return 'book-outline';
      case 'google_cal': return 'logo-google';
      default: return 'calendar-outline';
    }
  };

  const formatDateRange = (startDate: string, endDate?: string): string | null => {
    if (!endDate || endDate === startDate) return null;
    const s = new Date(startDate + 'T12:00:00');
    const e = new Date(endDate + 'T12:00:00');
    const sStr = `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]}`;
    const eStr = `${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`;
    return `${sStr} – ${eStr}`;
  };

  const getPeriodLabel = (): string => {
    if (viewMode === 'month') {
      return `${MONTHS[currentMonth]} ${currentYear}`;
    } else if (viewMode === 'week') {
      const endDate = new Date(weekStartDate);
      endDate.setDate(endDate.getDate() + 6);
      const startStr = `${weekStartDate.getDate()} ${MONTHS_SHORT[weekStartDate.getMonth()]}`;
      const endStr = `${endDate.getDate()} ${MONTHS_SHORT[endDate.getMonth()]}`;
      return `${startStr} – ${endStr}`;
    } else {
      const now = new Date();
      return `${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
    }
  };

  const isEventAllDay = (event: CalendarEvent): boolean => {
    if (event.type === 'task' || event.type === 'site_diary') return true;
    if (event.type === 'google_cal' && !event.startTime) return true;
    if (!event.startTime) return true;
    return false;
  };

  const renderFeedView = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoffEnd = new Date(now);
    cutoffEnd.setDate(cutoffEnd.getDate() + 60);
    const cutoffStart = new Date(now);
    cutoffStart.setDate(cutoffStart.getDate() - 30);

    const inRange = filteredEvents.filter(e => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return d >= cutoffStart && d <= cutoffEnd;
    });

    const byDate: Record<string, CalendarEvent[]> = {};
    inRange.forEach(e => {
      const key = e.date.split('T')[0];
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(e);
    });

    const sortedDates = Object.keys(byDate).sort();
    type FeedItem = { type: 'header'; dateKey: string } | { type: 'event'; event: CalendarEvent; dateKey: string };
    const items: FeedItem[] = [];
    sortedDates.forEach(dateKey => {
      items.push({ type: 'header', dateKey });
      byDate[dateKey].forEach(event => items.push({ type: 'event', event, dateKey }));
    });

    return (
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingBottom: 40 }, items.length === 0 && { flex: 1 }]}
        data={items}
        keyExtractor={(item, idx) => item.type === 'header' ? `hdr-${item.dateKey}` : `ev-${(item as any).event.id}-${idx}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={52} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.secondary }]}>No events</Text>
            <Text style={[styles.emptyDesc, { color: colors.muted }]}>Events from the next 60 days will appear here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            const d = new Date(item.dateKey + 'T12:00:00');
            return (
              <View style={[styles.feedDateHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.feedDateHeaderText, { color: colors.accent }]}>
                  {formatDayHeader(d)}
                </Text>
              </View>
            );
          }
          const { event } = item as { type: 'event'; event: CalendarEvent; dateKey: string };
          const taskStatusOpt = event.type === 'task' ? taskStatusOptions.find(o => o.value === (event.status || 'todo')) : null;
          const schedStatusColor = event.statusColor;
          const schedStatusLabel = event.status ? (SCHEDULE_STATUS_LABELS[event.status] || event.status) : null;
          const barColor = event.color;
          const dateRange = event.type === 'schedule' ? formatDateRange(event.date, event.endDate) : null;
          return (
            <TouchableOpacity
              style={[styles.feedEventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={() => handleEventTap(event)}
            >
              <View style={[styles.feedEventColorBar, { backgroundColor: barColor }]} />
              <View style={styles.feedEventContent}>
                <View style={styles.feedEventTop}>
                  <Text style={[styles.feedEventTitle, { color: colors.text }]} numberOfLines={2}>
                    {event.title}
                  </Text>
                </View>
                {showStatusChips && taskStatusOpt && (
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <View style={{ backgroundColor: taskStatusOpt.color + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: taskStatusOpt.color }}>{taskStatusOpt.label}</Text>
                    </View>
                  </View>
                )}
                {showStatusChips && event.type === 'schedule' && schedStatusColor && schedStatusLabel && (
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <View style={{ backgroundColor: schedStatusColor + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: schedStatusColor }}>{schedStatusLabel}</Text>
                    </View>
                  </View>
                )}
                {dateRange && (
                  <Text style={{ fontSize: 10, color: colors.secondary, marginTop: 3 }}>{dateRange}</Text>
                )}
                <View style={styles.feedEventMeta}>
                  {event.projectName && (
                    <Text style={[styles.feedEventProject, { color: colors.accent }]} numberOfLines={1}>
                      {event.projectName}
                    </Text>
                  )}
                  {event.startTime && (
                    <Text style={[styles.feedEventTime, { color: colors.secondary }]}>
                      {formatTime(event.startTime)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderWeekView = () => {
    const initialOffset = Math.max(0, (todayWeekIndex - 1) * CAL_DAY_WIDTH);
    const totalContentWidth = WEEK_TOTAL_DAYS * CAL_DAY_WIDTH + TIME_LABEL_WIDTH;

    const hourLabels = Array.from({ length: 24 }, (_, i) => {
      if (i === 0) return '12 AM';
      if (i < 12) return `${i} AM`;
      if (i === 12) return '12 PM';
      return `${i - 12} PM`;
    });

    return (
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={weekScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentOffset={{ x: initialOffset, y: 0 }}
          onScroll={handleWeekScroll}
          scrollEventThrottle={32}
          decelerationRate="normal"
          nestedScrollEnabled
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={{ width: totalContentWidth, flex: 1 }}>
            <View style={{
              flexDirection: 'row',
              backgroundColor: colors.card,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}>
              <View style={{ width: TIME_LABEL_WIDTH }} />
              {weekDays.map((day, idx) => {
                const currentDay = isToday(day);
                const dowName = DAY_NAMES[(day.getDay() + 6) % 7];
                return (
                  <View
                    key={idx}
                    style={{
                      width: CAL_DAY_WIDTH,
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderLeftColor: colors.border,
                    }}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: currentDay ? colors.accent : colors.secondary,
                    }}>
                      {dowName}
                    </Text>
                    <View style={currentDay ? {
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    } : {
                      width: 26,
                      height: 26,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}>
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: currentDay ? '#fff' : colors.text,
                      }}>
                        {day.getDate()}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {showAllDay && (
              <View style={{
                flexDirection: 'row',
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
                backgroundColor: colors.card,
                minHeight: 28,
              }}>
                <View style={{
                  width: TIME_LABEL_WIDTH,
                  justifyContent: 'center',
                  alignItems: 'flex-end',
                  paddingRight: 6,
                }}>
                  <Text style={{ fontSize: 9, color: colors.secondary, fontWeight: '500' }}>ALL</Text>
                  <Text style={{ fontSize: 9, color: colors.secondary, fontWeight: '500' }}>DAY</Text>
                </View>
                {weekDays.map((day, dayIdx) => {
                  const allDayEvents = getEventsForDate(day).filter(e => isEventAllDay(e));
                  return (
                    <View
                      key={dayIdx}
                      style={{
                        width: CAL_DAY_WIDTH,
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: colors.border,
                        paddingHorizontal: 2,
                        paddingVertical: 3,
                        gap: 2,
                      }}
                    >
                      {allDayEvents.slice(0, 3).map(event => (
                        <TouchableOpacity
                          key={event.id}
                          style={{
                            height: 20,
                            backgroundColor: isDark ? '#3a3a3a' : '#e8e8e8',
                            borderRadius: 4,
                            paddingHorizontal: 4,
                            justifyContent: 'center',
                          }}
                          onPress={() => handleEventTap(event)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={{ fontSize: 10, fontWeight: '600', color: colors.text }}
                            numberOfLines={1}
                          >
                            {event.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {allDayEvents.length > 3 && (
                        <Text style={{ fontSize: 9, color: colors.secondary, textAlign: 'center' }}>
                          +{allDayEvents.length - 3}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <ScrollView
              ref={timeGridScrollRef}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ height: TOTAL_GRID_HEIGHT }}
              onLayout={() => {
                setTimeout(() => {
                  timeGridScrollRef.current?.scrollTo({ y: 7 * HOUR_HEIGHT, animated: false });
                }, 100);
              }}
            >
              <View style={{ flexDirection: 'row', height: TOTAL_GRID_HEIGHT }}>
                <View style={{ width: TIME_LABEL_WIDTH }}>
                  {hourLabels.map((label, i) => (
                    <View key={i} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start' }}>
                      <Text style={{
                        fontSize: 10,
                        color: colors.secondary,
                        textAlign: 'right',
                        paddingRight: 6,
                        marginTop: -6,
                      }}>
                        {i > 0 ? label : ''}
                      </Text>
                    </View>
                  ))}
                </View>

                {weekDays.map((day, dayIdx) => {
                  const currentDay = isToday(day);
                  const dayEvents = getEventsForDate(day).filter(e => !isEventAllDay(e) && e.startTime);

                  const layoutEvents = dayEvents.map(event => {
                    const startMin = timeToMinutes(event.startTime!);
                    const durationMin = getEventDurationMinutes(event.startTime!, event.endTime);
                    return { event, startMin, endMin: startMin + durationMin };
                  }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

                  const lanes: number[][] = [];
                  const laneAssignment = new Map<string, { lane: number; totalLanes: number }>();
                  for (const le of layoutEvents) {
                    let placed = false;
                    for (let i = 0; i < lanes.length; i++) {
                      if (lanes[i][lanes[i].length - 1] <= le.startMin) {
                        lanes[i].push(le.endMin);
                        laneAssignment.set(le.event.id, { lane: i, totalLanes: 0 });
                        placed = true;
                        break;
                      }
                    }
                    if (!placed) {
                      lanes.push([le.endMin]);
                      laneAssignment.set(le.event.id, { lane: lanes.length - 1, totalLanes: 0 });
                    }
                  }
                  const totalLanes = Math.max(lanes.length, 1);
                  laneAssignment.forEach(v => { v.totalLanes = totalLanes; });

                  const colPad = 2;
                  const usableWidth = CAL_DAY_WIDTH - colPad * 2;

                  return (
                    <View
                      key={dayIdx}
                      style={{
                        width: CAL_DAY_WIDTH,
                        height: TOTAL_GRID_HEIGHT,
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: colors.border,
                        backgroundColor: currentDay ? colors.accent + '06' : 'transparent',
                      }}
                    >
                      {hourLabels.map((_, hourIdx) => (
                        <View
                          key={hourIdx}
                          style={{
                            position: 'absolute',
                            top: hourIdx * HOUR_HEIGHT,
                            left: 0,
                            right: 0,
                            height: StyleSheet.hairlineWidth,
                            backgroundColor: colors.border,
                          }}
                        />
                      ))}

                      {layoutEvents.map(({ event, startMin, endMin }) => {
                        const top = (startMin / 60) * HOUR_HEIGHT;
                        const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);
                        const eventColor = event.color || '#94a3b8';
                        const la = laneAssignment.get(event.id);
                        const lane = la?.lane ?? 0;
                        const tl = la?.totalLanes ?? 1;
                        const laneWidth = usableWidth / tl;
                        const left = colPad + lane * laneWidth;

                        return (
                          <TouchableOpacity
                            key={event.id}
                            style={{
                              position: 'absolute',
                              top,
                              left,
                              width: laneWidth - 1,
                              height,
                              backgroundColor: eventColor + '45',
                              borderRadius: 5,
                              borderLeftWidth: 3,
                              borderLeftColor: eventColor,
                              paddingHorizontal: 4,
                              paddingVertical: 2,
                              overflow: 'hidden',
                            }}
                            onPress={() => handleEventTap(event)}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color: colors.text,
                                lineHeight: 14,
                              }}
                              numberOfLines={height >= 36 ? 2 : 1}
                            >
                              {event.title}
                            </Text>
                            {height >= 36 && event.startTime && (
                              <Text
                                style={{
                                  fontSize: 9,
                                  color: colors.secondary,
                                  marginTop: 1,
                                }}
                                numberOfLines={1}
                              >
                                {formatTimeShort(event.startTime)}
                                {event.endTime ? ` – ${formatTimeShort(event.endTime)}` : ''}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderMonthView = () => {
    const cellWidth = (SCREEN_WIDTH - 32) / 7;
    const selectedEvents = getEventsForDate(selectedDate);

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
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
            {isToday(selectedDate) ? 'Today' : `${DAY_NAMES[(selectedDate.getDay() + 6) % 7]}, ${selectedDate.getDate()} ${MONTHS_SHORT[selectedDate.getMonth()]}`}
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
          selectedEvents.map(event => {
            const statusOpt = event.type === 'task' ? taskStatusOptions.find(o => o.value === (event.status || 'todo')) : null;
            const dateRange = event.type === 'schedule' ? formatDateRange(event.date, event.endDate) : null;
            return (
              <TouchableOpacity
                key={event.id}
                style={[styles.feedEventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => handleEventTap(event)}
              >
                <View style={[styles.feedEventColorBar, { backgroundColor: event.color }]} />
                <View style={styles.feedEventContent}>
                  <View style={styles.feedEventTop}>
                    <Text style={[styles.feedEventTitle, { color: colors.text }]} numberOfLines={2}>
                      {event.title}
                    </Text>
                    <View style={[styles.feedEventBadge, { backgroundColor: event.color + '20', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                      <Ionicons name={getTypeIcon(event.type)} size={11} color={event.color} />
                      <Text style={[styles.feedEventBadgeText, { color: event.color }]}>
                        {getEventTypeLabel(event.type)}
                      </Text>
                    </View>
                  </View>
                  {statusOpt && (
                    <View style={{ flexDirection: 'row', marginTop: 4 }}>
                      <View style={{ backgroundColor: statusOpt.color + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: statusOpt.color }}>{statusOpt.label}</Text>
                      </View>
                    </View>
                  )}
                  {dateRange && (
                    <Text style={{ fontSize: 10, color: colors.secondary, marginTop: 3 }}>{dateRange}</Text>
                  )}
                  {event.projectName && (
                    <Text style={[styles.feedEventProject, { color: colors.accent }]} numberOfLines={1}>
                      {event.projectName}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const todayDate = new Date();
  const headerMonth = `${MONTHS[weekStartDate.getMonth()]} ${weekStartDate.getFullYear()}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.accent + '30' }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>My Calendar</Text>
          <Text style={[styles.headerMonthLabel, { color: colors.secondary }]}>
            {viewMode === 'month' ? `${MONTHS[currentMonth]} ${currentYear}` : headerMonth}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {viewMode !== 'list' && (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => navigatePeriod(-1)} style={styles.navArrowBtn} activeOpacity={0.6}>
                <Ionicons name="chevron-back" size={18} color={colors.secondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigatePeriod(1)} style={styles.navArrowBtn} activeOpacity={0.6}>
                <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            onPress={goToToday}
            style={[styles.todayBadge, { backgroundColor: colors.accent }]}
            activeOpacity={0.7}
          >
            <Text style={styles.todayBadgeText}>{todayDate.getDate()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {viewMode === 'list' && renderFeedView()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'month' && renderMonthView()}
      </View>

      <View style={[styles.chipBar, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {(['list', 'week', 'month'] as ViewMode[]).map(mode => {
            const isActive = viewMode === mode;
            const modeLabel = mode === 'list' ? 'List' : mode === 'week' ? 'Week' : 'Month';
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? colors.accent + '30' : colors.card,
                    borderColor: isActive ? colors.accent + '60' : colors.border,
                  },
                ]}
                onPress={() => handleViewModeChange(mode)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipLabel, { color: isActive ? colors.accent : colors.secondary }]}>
                  {modeLabel}
                </Text>
              </TouchableOpacity>
            );
          })}

          <View style={{ width: 1, height: 24, backgroundColor: colors.border, alignSelf: 'center' }} />

          {viewMode === 'week' && (
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor: showAllDay ? colors.accent + '30' : colors.card,
                  borderColor: showAllDay ? colors.accent + '60' : colors.border,
                },
              ]}
              onPress={() => setShowAllDay(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipLabel, { color: showAllDay ? colors.accent : colors.secondary }]}>
                All Day
              </Text>
            </TouchableOpacity>
          )}

          {EVENT_TYPE_OPTIONS.filter(opt => opt.value !== 'google_cal' || googleConnected).map(opt => {
            const isSelected = activeFilters.eventTypes?.includes(opt.value) ?? false;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isSelected ? EVENT_COLORS[opt.value] + '25' : colors.card,
                    borderColor: isSelected ? EVENT_COLORS[opt.value] + '60' : colors.border,
                  },
                ]}
                onPress={() => {
                  const current = activeFilters.eventTypes || [];
                  const updated = isSelected
                    ? current.filter(t => t !== opt.value)
                    : [...current, opt.value];
                  setActiveFilters({ ...activeFilters, eventTypes: updated.length > 0 ? updated : undefined });
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipLabel, { color: isSelected ? EVENT_COLORS[opt.value] : colors.secondary }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[
              styles.chip,
              {
                backgroundColor: activeFilterCount > 0 ? colors.accent + '25' : colors.card,
                borderColor: activeFilterCount > 0 ? colors.accent + '60' : colors.border,
              },
            ]}
            onPress={() => setShowFilterModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="options-outline"
              size={14}
              color={activeFilterCount > 0 ? colors.accent : colors.secondary}
            />
            <Text style={[styles.chipLabel, { color: activeFilterCount > 0 ? colors.accent : colors.secondary }]}>
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <Modal
        visible={showViewsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowViewsModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowViewsModal(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>Views</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
            {views.map(view => {
              const isActive = view.id === selectedViewId;
              return (
                <TouchableOpacity
                  key={view.id}
                  style={[
                    styles.viewRow,
                    { borderColor: colors.border },
                    isActive && { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' },
                  ]}
                  onPress={() => handleSelectView(view)}
                  onLongPress={() => handleDeleteView(view)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="layers-outline" size={18} color={isActive ? colors.accent : colors.secondary} />
                  <Text style={[styles.viewRowText, { color: isActive ? colors.text : colors.secondary }]}>
                    {view.name}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ marginLeft: 'auto' }} />
                  )}
                  {!view.isDefault && !isActive && (
                    <TouchableOpacity onPress={() => handleDeleteView(view)} style={{ marginLeft: 'auto', padding: 4 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={[styles.newViewBtn, { borderColor: colors.border }]}
            onPress={() => { setShowViewsModal(false); setShowCreateViewModal(true); }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.secondary} />
            <Text style={[styles.newViewBtnText, { color: colors.secondary }]}>New View</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowFilterModal(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>Filter Events</Text>
          <Text style={[styles.bottomSheetSubtitle, { color: colors.secondary }]}>
            Select types to show. Leave all off to show everything.
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
            <View style={{ marginTop: 12, gap: 4 }}>
              <TouchableOpacity
                style={[
                  styles.filterRow,
                  { borderColor: colors.border },
                  activeFilters.assignedToMe && { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' },
                ]}
                onPress={() => setActiveFilters({ ...activeFilters, assignedToMe: activeFilters.assignedToMe ? undefined : true })}
                activeOpacity={0.7}
              >
                <View style={[styles.filterColorDot, { backgroundColor: colors.accent }]} />
                <Ionicons name="person-outline" size={18} color={activeFilters.assignedToMe ? colors.accent : colors.secondary} />
                <Text style={[styles.filterRowText, { color: activeFilters.assignedToMe ? colors.text : colors.secondary }]}>
                  Assigned to me
                </Text>
                {activeFilters.assignedToMe && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            </View>

            {(!activeFilters.eventTypes || activeFilters.eventTypes.includes('schedule')) && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.filterSectionLabel, { color: colors.secondary }]}>Schedule Items</Text>
                <View style={{ gap: 4, marginTop: 6 }}>
                  {([
                    { key: 'scheduleAssignedToMe' as const, label: 'Assigned to me', icon: 'person-outline' as const },
                    { key: 'scheduleAssignedToCompany' as const, label: 'Assigned to company', icon: 'business-outline' as const },
                  ] as const).map(opt => {
                    const isOn = !!activeFilters[opt.key];
                    const scheduleColor = EVENT_COLORS.schedule;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.filterRow,
                          { borderColor: colors.border },
                          isOn && { backgroundColor: scheduleColor + '15', borderColor: scheduleColor + '40' },
                        ]}
                        onPress={() => setActiveFilters({ ...activeFilters, [opt.key]: isOn ? undefined : true })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.filterColorDot, { backgroundColor: isOn ? scheduleColor : colors.muted }]} />
                        <Ionicons name={opt.icon} size={18} color={isOn ? scheduleColor : colors.secondary} />
                        <Text style={[styles.filterRowText, { color: isOn ? colors.text : colors.secondary }]}>
                          {opt.label}
                        </Text>
                        {isOn && (
                          <Ionicons name="checkmark-circle" size={18} color={scheduleColor} style={{ marginLeft: 'auto' }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {(() => {
                    const scheduleColor = EVENT_COLORS.schedule;
                    const parentOn = !!activeFilters.scheduleParentOnly;
                    const subOn = !!activeFilters.scheduleSubOnly;
                    return (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {([
                          { key: 'scheduleParentOnly' as const, label: 'Parent', icon: 'git-branch-outline' as const, isOn: parentOn },
                          { key: 'scheduleSubOnly' as const, label: 'Sub', icon: 'return-down-forward-outline' as const, isOn: subOn },
                        ]).map(btn => (
                          <TouchableOpacity
                            key={btn.key}
                            style={[
                              styles.filterRow,
                              { flex: 1, justifyContent: 'center', borderColor: colors.border },
                              btn.isOn && { backgroundColor: scheduleColor + '15', borderColor: scheduleColor + '40' },
                            ]}
                            onPress={() => setActiveFilters({ ...activeFilters, [btn.key]: btn.isOn ? undefined : true })}
                            activeOpacity={0.7}
                          >
                            <Ionicons name={btn.icon} size={16} color={btn.isOn ? scheduleColor : colors.secondary} />
                            <Text style={[styles.filterRowText, { color: btn.isOn ? colors.text : colors.secondary }]}>
                              {btn.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })()}
                </View>
              </View>
            )}

            <View style={{ marginTop: 12, gap: 4 }}>
              {EVENT_TYPE_OPTIONS.filter(opt => opt.value !== 'google_cal' || googleConnected).map(opt => {
                const isSelected = activeFilters.eventTypes?.includes(opt.value) ?? false;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.filterRow,
                      { borderColor: colors.border },
                      isSelected && { backgroundColor: EVENT_COLORS[opt.value] + '15', borderColor: EVENT_COLORS[opt.value] + '40' },
                    ]}
                    onPress={() => {
                      const current = activeFilters.eventTypes || [];
                      const updated = isSelected
                        ? current.filter(t => t !== opt.value)
                        : [...current, opt.value];
                      setActiveFilters({ ...activeFilters, eventTypes: updated.length > 0 ? updated : undefined });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.filterColorDot, { backgroundColor: EVENT_COLORS[opt.value] }]} />
                    <Ionicons name={opt.icon} size={18} color={isSelected ? EVENT_COLORS[opt.value] : colors.secondary} />
                    <Text style={[styles.filterRowText, { color: isSelected ? colors.text : colors.secondary }]}>
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={EVENT_COLORS[opt.value]} style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {(!activeFilters.eventTypes || activeFilters.eventTypes.includes('task')) && taskStatusOptions.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.filterSectionLabel, { color: colors.secondary }]}>Task Status</Text>
                <View style={{ gap: 4, marginTop: 6 }}>
                  {taskStatusOptions.map(opt => {
                    const isOff = activeFilters.excludedTaskStatuses?.includes(opt.value) ?? false;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.filterRow,
                          { borderColor: colors.border },
                          !isOff && { backgroundColor: opt.color + '15', borderColor: opt.color + '40' },
                          isOff && { opacity: 0.45 },
                        ]}
                        onPress={() => {
                          const current = activeFilters.excludedTaskStatuses || [];
                          const updated = isOff
                            ? current.filter(s => s !== opt.value)
                            : [...current, opt.value];
                          setActiveFilters({ ...activeFilters, excludedTaskStatuses: updated.length > 0 ? updated : undefined });
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.filterColorDot, { backgroundColor: isOff ? colors.muted : opt.color }]} />
                        <Text style={[styles.filterRowText, { color: isOff ? colors.secondary : colors.text }]}>
                          {opt.label}
                        </Text>
                        {!isOff && (
                          <Ionicons name="checkmark-circle" size={18} color={opt.color} style={{ marginLeft: 'auto' }} />
                        )}
                        {isOff && (
                          <Ionicons name="close-circle-outline" size={18} color={colors.muted} style={{ marginLeft: 'auto' }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 }}>
            <Text style={[styles.filterSectionLabel, { color: colors.secondary, marginBottom: 6 }]}>Display</Text>
            <TouchableOpacity
              style={[
                styles.filterRow,
                { borderColor: colors.border },
                showStatusChips && { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' },
              ]}
              onPress={() => setShowStatusChips(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.filterColorDot, { backgroundColor: showStatusChips ? colors.accent : colors.muted }]} />
              <Ionicons name="pricetag-outline" size={18} color={showStatusChips ? colors.accent : colors.secondary} />
              <Text style={[styles.filterRowText, { color: showStatusChips ? colors.text : colors.secondary }]}>
                Show status chips
              </Text>
              {showStatusChips && (
                <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ marginLeft: 'auto' }} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.filterActions}>
            {activeFilterCount > 0 && (
              <TouchableOpacity
                style={[styles.filterClearBtn, { borderColor: colors.border }]}
                onPress={() => setActiveFilters({})}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterClearText, { color: colors.secondary }]}>Clear all</Text>
              </TouchableOpacity>
            )}
            {canSaveFilters && (
              <TouchableOpacity
                style={[styles.filterSaveBtn, { backgroundColor: colors.accent }]}
                onPress={handleSaveFiltersToView}
                activeOpacity={0.8}
              >
                <Text style={styles.filterSaveBtnText}>Save to view</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.filterDoneBtn, { backgroundColor: colors.accent }]}
              onPress={() => setShowFilterModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.filterDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCreateViewModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateViewModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={() => setShowCreateViewModal(false)}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>Save View</Text>
            <Text style={[styles.bottomSheetSubtitle, { color: colors.secondary }]}>
              Save your current filters and view mode as a named view.
            </Text>
            <TextInput
              style={[styles.viewNameInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
              placeholder="View name (e.g. My Tasks)"
              placeholderTextColor={colors.muted}
              value={newViewName}
              onChangeText={setNewViewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateView}
            />
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={[styles.filterClearBtn, { borderColor: colors.border }]}
                onPress={() => { setShowCreateViewModal(false); setNewViewName(''); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterClearText, { color: colors.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterDoneBtn, { backgroundColor: newViewName.trim() ? colors.accent : colors.muted, flex: 1 }]}
                onPress={handleCreateView}
                disabled={!newViewName.trim() || savingView}
                activeOpacity={0.8}
              >
                {savingView
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.filterDoneBtnText}>Save View</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
  },
  headerLeft: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerMonthLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navArrowBtn: {
    padding: 4,
  },
  todayBadge: {
    width: 34,
    height: 34,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },

  chipBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
  },
  chipRow: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  feedDateHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  feedDateHeaderText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  feedEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  feedEventColorBar: { width: 4, alignSelf: 'stretch' },
  feedEventContent: { flex: 1, paddingVertical: 11, paddingHorizontal: 11 },
  feedEventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  feedEventTitle: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  feedEventBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  feedEventBadgeText: { fontSize: 10, fontWeight: '600' },
  feedEventMeta: { flexDirection: 'row', gap: 10, marginTop: 4 },
  feedEventProject: { fontSize: 12 },
  feedEventTime: { fontSize: 12 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

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

  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    marginTop: 2,
  },
  viewRowText: { fontSize: 15, fontWeight: '500' },
  newViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  newViewBtnText: { fontSize: 15, fontWeight: '500' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  bottomSheetSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterColorDot: { width: 8, height: 8, borderRadius: 4 },
  filterRowText: { fontSize: 15, fontWeight: '500' },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  filterClearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterClearText: { fontSize: 14, fontWeight: '500' },
  filterSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  filterSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  filterDoneBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDoneBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewNameInput: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
});
