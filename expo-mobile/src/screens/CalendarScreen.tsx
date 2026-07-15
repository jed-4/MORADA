import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { fetchCached, clearCache } from '../services/cache';
import { dateStrOf, toLocalDateStr, fromLocalDateStr } from '../lib/dates';
import { doneStatusKey, defaultStatusKey, isDoneStatus, type TaskStatusOption as LibStatusOption } from '../lib/taskStatus';
import { haptic } from '../lib/haptics';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { Sheet, SheetTextInput, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { PressableScale } from '../components/ui/PressableScale';
import {
  EVENT_COLORS,
  SCHEDULE_STATUS_COLORS,
  MONTHS,
  getProjectEventColor,
  getMondayOfWeek,
  isSameDay,
  type CalendarEvent,
  type EventsByDay,
} from '../components/calendar/shared';
import { FeedView } from '../components/calendar/FeedView';
import { WeekView, GRID_COL_WIDTH, HOUR_HEIGHT, WEEK_TOTAL_DAYS } from '../components/calendar/WeekView';
import { MonthView, type MonthCell } from '../components/calendar/MonthView';
import { FilterSheet, EVENT_TYPE_OPTIONS } from '../components/calendar/FilterSheet';
import { EventPeekSheet } from '../components/calendar/EventPeekSheet';

interface Task {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  startTime?: string | null;
  endTime?: string | null;
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
  parentItemId?: string | null;
}

interface Project {
  id: string;
  name: string;
  color?: string;
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

const PRIORITY_OPTIONS = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

// Keyed by user id so switching accounts (logout/login) re-runs these once
// for the new user instead of silently skipping them for the whole app life.
const defaultViewCreatedFor = new Set<string>();
const cleanupRanFor = new Set<string>();

export default function CalendarScreen({ navigation }: Props) {
  const { user } = useAuth();
  const theme = useTheme();
  const toast = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [taskStatusOptions, setTaskStatusOptions] = useState<TaskStatusOption[]>([]);
  const [rawStatusOptions, setRawStatusOptions] = useState<LibStatusOption[]>([]);
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
    hideScheduleParents?: boolean;
    hideScheduleChildren?: boolean;
  }>({});

  const [showStatusChips, setShowStatusChips] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [savingView, setSavingView] = useState(false);
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStartDate, setWeekStartDate] = useState<Date>(getMondayOfWeek(new Date()));

  // Create-task form state
  const [createTitle, setCreateTitle] = useState('');
  const [createProjectId, setCreateProjectId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState('');
  const [createTime, setCreateTime] = useState('');
  const [createPriority, setCreatePriority] = useState('medium');
  const [creatingTask, setCreatingTask] = useState(false);
  const [showCreateDatePicker, setShowCreateDatePicker] = useState(false);
  const [showCreateTimePicker, setShowCreateTimePicker] = useState(false);

  const viewsSheetRef = useRef<SheetRef>(null);
  const filterSheetRef = useRef<SheetRef>(null);
  const createViewSheetRef = useRef<SheetRef>(null);
  const eventSheetRef = useRef<SheetRef>(null);
  const createTaskSheetRef = useRef<SheetRef>(null);
  const projectPickerSheetRef = useRef<SheetRef>(null);

  const timeGridScrollRef = useRef<ScrollView>(null);
  const weekScrollRef = useRef<ScrollView>(null);
  const timeLabelScrollRef = useRef<ScrollView>(null);

  const weekBaseDate = useRef<Date>((() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  })());

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

  // Initialise to the real starting offset so secondary refs sync correctly
  // even before the first onScroll event fires from weekScrollRef.
  const weekScrollOffset = useRef(Math.max(0, (todayWeekIndex - 1) * GRID_COL_WIDTH));

  const buildDateRange = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { startDate: fmt(start), endDate: fmt(end) };
  }, []);

  // One-time (per mount) guard so focus refetches don't re-apply the default
  // view, plus a timestamp to throttle focus refetches to every 30s.
  const didInitViewsRef = useRef(false);
  const lastFetchRef = useRef(0);

  const fetchData = useCallback(async (force = false) => {
    if (!user?.id) return;
    // Focus refetches are throttled: fast-moving data refreshes at most every
    // 30s; slow-moving data (projects, views, settings, ...) comes from the
    // 5-minute cache. Pull-to-refresh passes force=true and bypasses both.
    if (!force && Date.now() - lastFetchRef.current < 30_000) return;
    try {
      const dateRange = buildDateRange();

      const [tasksData, projectsData, scheduleData, timesheetsData, diariesData, gcalStatus, viewsData, taskStatusCat, companySettings] = await Promise.all([
        apiFetch<Task[]>('/api/tasks').catch(() => [] as Task[]),
        fetchCached<Project[]>('projects', () => apiFetch<Project[]>('/api/projects'), force).catch(() => [] as Project[]),
        apiFetch<ScheduleItem[]>(`/api/schedule-items/all?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`).catch(() => [] as ScheduleItem[]),
        apiFetch<any[]>(`/api/timesheets?userId=${user.id}`).catch(() => []),
        apiFetch<any[]>('/api/company/site-diary-entries').catch(() => []),
        fetchCached<{ connected: boolean }>('gcalStatus', () => apiFetch<{ connected: boolean }>('/api/google-calendar/status'), force).catch(() => ({ connected: false })),
        fetchCached<SavedView[]>('calendarViews:personal', () => apiFetch<SavedView[]>('/api/calendar-views?calendarType=personal'), force).catch(() => [] as SavedView[]),
        fetchCached<any>('fieldCategory:task.status', () => apiFetch<any>('/api/field-categories/by-key/task.status'), force).catch(() => null),
        fetchCached<any>('companySettings', () => apiFetch<any>('/api/company-settings'), force).catch(() => null),
      ]);
      lastFetchRef.current = Date.now();

      const resolvedBrandColor: string | null = companySettings?.brandColor || null;
      setBrandColor(resolvedBrandColor);

      const statusList: any[] | null =
        taskStatusCat?.options && Array.isArray(taskStatusCat.options) ? taskStatusCat.options
        : Array.isArray(taskStatusCat) ? taskStatusCat
        : null;
      if (statusList) {
        setTaskStatusOptions(
          statusList.map((o: any) => ({
            value: o.key || o.value,
            label: o.name || o.label,
            color: o.color || theme.textMuted,
          }))
        );
        setRawStatusOptions(
          statusList.map((o: any) => ({
            key: o.key || o.value,
            name: o.name || o.label,
            color: o.color || null,
            sortOrder: o.sortOrder ?? 0,
            isDefault: o.isDefault,
            isCompleted: o.isCompleted,
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
            startTime: task.startTime ?? null,
            endTime: task.endTime ?? null,
            type: 'task',
            color: getProjectEventColor(task.projectId, proj?.color, EVENT_COLORS.task, resolvedBrandColor),
            status: task.status,
            projectId: task.projectId,
            projectName: proj?.name,
            assigneeId: user.id,
            raw: task,
          });
        }
      });

      (scheduleData || []).forEach(item => {
        const scheduleColor = getProjectEventColor(item.projectId, item.projectColor, EVENT_COLORS.schedule, resolvedBrandColor);
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
          date: dateStrOf(ts.date),
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
            date: dateStrOf(d.entryDateTime),
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
            // Server returns processed format: ev.startDate (ISO), ev.startTime ("HH:MM"), etc.
            const startDate = ev.startDate ? new Date(ev.startDate) : null;
            const endDate = ev.endDate ? new Date(ev.endDate) : null;
            if (!startDate) return;
            const localDate = toLocalDateStr(startDate);
            calEvents.push({
              id: `gcal-${ev.id}`,
              title: ev.title || 'Untitled',
              date: localDate,
              endDate: endDate ? toLocalDateStr(endDate) : undefined,
              startTime: ev.startTime || null,
              endTime: ev.endTime || null,
              type: 'google_cal',
              color: EVENT_COLORS.google_cal,
              assigneeId: user.id,
              raw: ev,
            });
          });
        } catch {}
      }

      setAllEvents(calEvents);

      const fetchedViews = (viewsData || []).filter(v => v.name && v.name.trim() !== '');

      const blankViews = (viewsData || []).filter(v => !v.name || v.name.trim() === '');
      blankViews.forEach(v => apiRequest(`/api/calendar-views/${v.id}`, 'DELETE').catch(() => {}));

      setViews(fetchedViews);

      if (fetchedViews.length === 0 && !defaultViewCreatedFor.has(user.id)) {
        defaultViewCreatedFor.add(user.id);
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
            clearCache('calendarViews:personal');
            didInitViewsRef.current = true;
            setViews([newView]);
            setSelectedViewId(newView.id);
            setActiveFilters({});
            setViewMode('week');
          }
        } catch {}
      } else if (fetchedViews.length > 0 && !didInitViewsRef.current) {
        // Apply the default view ONCE per mount — later focus refetches must
        // not clobber the view/filters/mode the user picked in-session.
        didInitViewsRef.current = true;
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
    if (!user?.id || cleanupRanFor.has(user.id)) return;
    cleanupRanFor.add(user.id);
    apiRequest('/api/calendar-views/cleanup-duplicates', 'POST', { calendarType: 'personal' })
      .then(() => {
        clearCache('calendarViews:personal');
        return fetchData(true);
      })
      .catch(() => {});
  }, [user?.id, fetchData]);

  // The minute tick only drives the "now" line, which only week view renders —
  // FeedView/MonthView are memoized and don't receive nowMinutes, so the tick
  // re-renders the week grid only.
  useEffect(() => {
    if (viewMode !== 'week') return;
    const tick = () => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [viewMode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
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
    if (activeFilters.hideScheduleParents) {
      events = events.filter(e => e.type !== 'schedule' || !!e.raw?.parentItemId);
    }
    if (activeFilters.hideScheduleChildren) {
      events = events.filter(e => e.type !== 'schedule' || !e.raw?.parentItemId);
    }
    return events;
  }, [allEvents, activeFilters]);

  // Bucket events by local day ONCE per filter change — every view reads from
  // this instead of re-filtering the whole list per visible day per render.
  const eventsByDay = useMemo<EventsByDay>(() => {
    const map: EventsByDay = {};
    const push = (key: string, e: CalendarEvent) => {
      (map[key] ||= []).push(e);
    };
    for (const e of filteredEvents) {
      const startKey = dateStrOf(e.date);
      if (!startKey) continue;
      const endKey = e.endDate ? dateStrOf(e.endDate) : startKey;
      if (!endKey || endKey <= startKey) {
        push(startKey, e);
        continue;
      }
      const start = fromLocalDateStr(startKey);
      const end = fromLocalDateStr(endKey);
      // Cap runaway ranges (bad data) at ~400 days of expansion.
      const spanDays = Math.min(Math.round((end.getTime() - start.getTime()) / 86_400_000), 400);
      for (let i = 0; i <= spanDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        push(toLocalDateStr(d), e);
      }
    }
    return map;
  }, [filteredEvents]);

  const anyAllDayEvents = useMemo(
    () => allEvents.some(e => {
      if (e.type === 'task' || e.type === 'site_diary') return true;
      if (e.type === 'google_cal' && !e.startTime) return true;
      return false;
    }),
    [allEvents],
  );

  const weekIsEmpty = useMemo(
    () => weekDays.every(d => !(eventsByDay[toLocalDateStr(d)]?.length)),
    [weekDays, eventsByDay],
  );

  const calendarGrid = useMemo<MonthCell[][]>(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    let startOffset = firstDay.getDay();
    startOffset = startOffset === 0 ? 6 : startOffset - 1;

    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    const cells: MonthCell[] = [];

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
    const rows: MonthCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [currentYear, currentMonth]);

  const scrollWeekTo = (offsetX: number, animated = true) => {
    const clamped = Math.max(0, Math.min(offsetX, (WEEK_TOTAL_DAYS - 1) * GRID_COL_WIDTH));
    weekScrollRef.current?.scrollTo({ x: clamped, animated });
    weekScrollOffset.current = clamped;
  };

  const onNavigateMonth = useCallback((direction: number) => {
    haptic.select();
    let newMonth = currentMonth + direction;
    let newYear = currentYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  }, [currentMonth, currentYear]);

  const navigatePeriod = useCallback((direction: number) => {
    if (viewMode === 'month') {
      onNavigateMonth(direction);
    } else if (viewMode === 'week') {
      haptic.select();
      scrollWeekTo(weekScrollOffset.current + direction * 3 * GRID_COL_WIDTH);
    }
  }, [viewMode, onNavigateMonth]);

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === viewMode) return;
    haptic.select();
    if (mode === 'week') {
      setWeekStartDate(getMondayOfWeek(new Date()));
      setTimeout(() => {
        const x = Math.max(0, (todayWeekIndex - 1) * GRID_COL_WIDTH);
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
    haptic.select();
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setSelectedDate(now);
    setWeekStartDate(getMondayOfWeek(now));
    if (viewMode === 'week') {
      const x = Math.max(0, (todayWeekIndex - 1) * GRID_COL_WIDTH);
      scrollWeekTo(x);
    }
  };

  const handleWeekScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    weekScrollOffset.current = offsetX;
    const leftIndex = Math.round(offsetX / GRID_COL_WIDTH);
    const centerIndex = Math.min(leftIndex + 1, weekDays.length - 1);
    const centerDay = weekDays[centerIndex];
    if (centerDay) {
      const monday = getMondayOfWeek(centerDay);
      setWeekStartDate(prev => {
        if (prev.getTime() !== monday.getTime()) return monday;
        return prev;
      });
    }
  }, [weekDays]);

  // ── Saved views ────────────────────────────────────────────────────────────

  const handleSelectView = (view: SavedView) => {
    haptic.select();
    setSelectedViewId(view.id);
    setActiveFilters(view.filters || {});
    const rawMode = view.calendarMode as string;
    const resolved: ViewMode =
      view.name === 'All Events' ? 'week' :
      rawMode === 'month' ? 'month' :
      rawMode === 'list' ? 'list' :
      'week';
    setViewMode(resolved);
    viewsSheetRef.current?.dismiss();
  };

  const handleDeleteView = (view: SavedView) => {
    if (view.isDefault) return;
    haptic.warning();
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
              clearCache('calendarViews:personal');
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
              toast.success('View deleted');
            } catch (e: any) {
              toast.error(e?.message || 'Could not delete view.');
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
        clearCache('calendarViews:personal');
        setViews(prev => [...prev, newView]);
        setSelectedViewId(newView.id);
        setNewViewName('');
        createViewSheetRef.current?.dismiss();
        viewsSheetRef.current?.dismiss();
        haptic.success();
        toast.success('View saved');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not create view.');
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
      clearCache('calendarViews:personal');
      setViews(prev => prev.map(v => v.id === selectedViewId ? { ...v, filters: activeFilters, calendarMode: viewMode } : v));
      filterSheetRef.current?.dismiss();
      toast.success('Filters saved to view');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save filters to view.');
    }
  };

  const activeFilterCount = (activeFilters.eventTypes?.length || 0)
    + (activeFilters.taskStatuses?.length || 0)
    + (activeFilters.excludedTaskStatuses?.length || 0)
    + (activeFilters.assignedToMe ? 1 : 0)
    + (activeFilters.scheduleAssignedToMe ? 1 : 0)
    + (activeFilters.scheduleAssignedToCompany ? 1 : 0)
    + (activeFilters.hideScheduleParents ? 1 : 0)
    + (activeFilters.hideScheduleChildren ? 1 : 0);
  const currentView = views.find(v => v.id === selectedViewId);
  const canSaveFilters = currentView && !currentView.isDefault;

  // ── Event peek ─────────────────────────────────────────────────────────────

  const handleEventTap = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    eventSheetRef.current?.present();
  }, []);

  const selectedTaskIsDone = selectedEvent?.type === 'task'
    ? isDoneStatus(selectedEvent.status, rawStatusOptions)
    : false;

  const handleToggleTaskComplete = async () => {
    if (!selectedEvent || selectedEvent.type !== 'task') return;
    const taskId: string | undefined = selectedEvent.raw?.id;
    if (!taskId) return;
    const eventId = selectedEvent.id;
    const previousStatus = selectedEvent.status;
    const wasDone = isDoneStatus(previousStatus, rawStatusOptions);
    const newStatus = wasDone ? defaultStatusKey(rawStatusOptions) : doneStatusKey(rawStatusOptions);
    if (wasDone) haptic.select(); else haptic.success();
    const apply = (status: string | undefined) => {
      setSelectedEvent(prev => prev && prev.id === eventId
        ? { ...prev, status, raw: { ...prev.raw, status } }
        : prev);
      setAllEvents(prev => prev.map(e => e.id === eventId
        ? { ...e, status, raw: { ...e.raw, status } }
        : e));
    };
    apply(newStatus);
    try {
      await apiRequest(`/api/tasks/${taskId}`, 'PATCH', { status: newStatus });
      toast.success(wasDone ? 'Task reopened' : 'Task completed');
    } catch (e: any) {
      apply(previousStatus);
      toast.error(e?.message || 'Could not update task.');
    }
  };

  // Cross-tab deep link: works both when Calendar is the tab screen
  // (navigation IS the tab navigator) and when mounted as MyCalendar inside
  // the More stack (navigate bubbles up to the tab navigator).
  const navigateToMoreScreen = (screen: string, params?: Record<string, unknown>) => {
    eventSheetRef.current?.dismiss();
    navigation.navigate('More', params ? { screen, params } : { screen });
  };

  // ── Create task ────────────────────────────────────────────────────────────

  const openCreateTask = useCallback((dateKey?: string, hour?: number) => {
    haptic.light();
    setCreateTitle('');
    setCreateProjectId(null);
    setCreateDate(dateKey || toLocalDateStr(new Date()));
    setCreateTime(hour != null ? `${String(hour).padStart(2, '0')}:00` : '');
    setCreatePriority('medium');
    setShowCreateDatePicker(false);
    setShowCreateTimePicker(false);
    createTaskSheetRef.current?.present();
  }, []);

  const handleHeaderCreate = () => {
    openCreateTask(viewMode === 'month' ? toLocalDateStr(selectedDate) : undefined);
  };

  const handleDayLongPress = useCallback((dateKey: string) => {
    openCreateTask(dateKey);
  }, [openCreateTask]);

  const handleSlotLongPress = useCallback((dateKey: string, hour: number) => {
    openCreateTask(dateKey, hour);
  }, [openCreateTask]);

  const handleCreateTask = async () => {
    if (!createTitle.trim() || creatingTask) return;
    setCreatingTask(true);
    try {
      // Field shape copied from ProjectTasksScreen.handleCreateTask — the
      // app's existing POST /api/tasks path. projectId is optional here; the
      // server derives business context when it's absent.
      await apiRequest('/api/tasks', 'POST', {
        type: 'task',
        title: createTitle.trim(),
        priority: createPriority,
        status: defaultStatusKey(rawStatusOptions),
        content: '',
        dueDate: createDate ? new Date(createDate).toISOString() : undefined,
        startTime: createTime || undefined,
        projectId: createProjectId || undefined,
        assigneeIds: user?.id ? [user.id] : undefined,
      });
      createTaskSheetRef.current?.dismiss();
      haptic.success();
      toast.success('Task created');
      await fetchData(true);
    } catch (e: any) {
      // Keep the sheet open so the entered task isn't lost.
      toast.error(e?.message || 'Could not create task.');
    } finally {
      setCreatingTask(false);
    }
  };

  const onSelectDay = useCallback((date: Date) => {
    haptic.select();
    setSelectedDate(date);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const todayDate = new Date();
  const headerMonth = viewMode === 'month'
    ? `${MONTHS[currentMonth]} ${currentYear}`
    : `${MONTHS[weekStartDate.getMonth()]} ${weekStartDate.getFullYear()}`;
  const createProject = projects.find(p => p.id === createProjectId);

  const renderSkeleton = () => {
    if (viewMode === 'list') {
      return (
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton width={150} height={14} style={{ marginBottom: 6 }} />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={64} borderRadius={radius.xl} />
          ))}
        </View>
      );
    }
    if (viewMode === 'month') {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
          {Array.from({ length: 6 }, (_, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
              {Array.from({ length: 7 }, (_, c) => (
                <Skeleton key={c} height={64} borderRadius={radius.md} style={{ flex: 1 }} />
              ))}
            </View>
          ))}
          <Skeleton width={120} height={14} style={{ marginTop: 14 }} />
          <Skeleton height={64} borderRadius={radius.xl} style={{ marginTop: 8 }} />
        </View>
      );
    }
    // week
    return (
      <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 12, gap: 10, paddingTop: 8 }}>
        <View style={{ width: 38, gap: 44, paddingTop: 64 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} width={32} height={9} />
          ))}
        </View>
        {Array.from({ length: 3 }, (_, col) => (
          <View key={col} style={{ flex: 1, gap: 8 }}>
            <Skeleton height={44} borderRadius={radius.lg} />
            <Skeleton height={72} borderRadius={radius.md} style={{ marginTop: 24 + col * 30 }} />
            <Skeleton height={48} borderRadius={radius.md} style={{ marginTop: 40 }} />
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.View entering={FadeInDown.duration(300)}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Calendar</Text>
            <Text style={[styles.headerMonthLabel, { color: theme.textSecondary }]}>{headerMonth}</Text>
          </View>
          <PressableScale
            style={[styles.viewsBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={() => { haptic.select(); viewsSheetRef.current?.present(); }}
          >
            <Ionicons name="layers-outline" size={15} color={theme.primary} />
            <Text style={[styles.viewsBtnText, { color: theme.textPrimary }]} numberOfLines={1}>
              {currentView?.name || 'Views'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={theme.textSecondary} />
          </PressableScale>
        </View>

        <View style={styles.toolbar}>
          <View style={[styles.segmented, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {VIEW_MODES.map(m => {
              const active = viewMode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.segment, active && { backgroundColor: theme.primary }]}
                  onPress={() => handleViewModeChange(m.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.segmentText,
                    { color: active ? '#FFFFFF' : theme.textSecondary },
                    active && { fontWeight: fontWeight.semibold },
                  ]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.toolbarRight}>
            {viewMode !== 'list' && (
              <>
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={() => navigatePeriod(-1)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={() => navigatePeriod(1)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </>
            )}
            <PressableScale
              style={[styles.addBtn, { backgroundColor: theme.primary }]}
              onPress={handleHeaderCreate}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </PressableScale>
            <TouchableOpacity
              onPress={goToToday}
              style={[styles.todayBadge, { borderColor: theme.primary }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.todayBadgeText, { color: theme.primary }]}>{todayDate.getDate()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(60)} style={{ flex: 1 }}>
        {loading ? renderSkeleton() : (
          <>
            {viewMode === 'list' && (
              <FeedView
                theme={theme}
                eventsByDay={eventsByDay}
                refreshing={refreshing}
                onRefresh={onRefresh}
                onEventPress={handleEventTap}
                onDayLongPress={handleDayLongPress}
              />
            )}
            {viewMode === 'week' && (
              <WeekView
                theme={theme}
                weekDays={weekDays}
                eventsByDay={eventsByDay}
                nowMinutes={nowMinutes}
                anyAllDayEvents={anyAllDayEvents}
                allDayExpanded={allDayExpanded}
                initialOffset={Math.max(0, (todayWeekIndex - 1) * GRID_COL_WIDTH)}
                weekScrollRef={weekScrollRef}
                timeGridScrollRef={timeGridScrollRef}
                timeLabelScrollRef={timeLabelScrollRef}
                onWeekScroll={handleWeekScroll}
                onEventPress={handleEventTap}
                onSlotLongPress={handleSlotLongPress}
                isEmpty={weekIsEmpty}
              />
            )}
            {viewMode === 'month' && (
              <MonthView
                theme={theme}
                calendarGrid={calendarGrid}
                selectedDate={selectedDate}
                eventsByDay={eventsByDay}
                refreshing={refreshing}
                onRefresh={onRefresh}
                onSelectDay={onSelectDay}
                onDayLongPress={handleDayLongPress}
                onEventPress={handleEventTap}
                onNavigateMonth={onNavigateMonth}
                showStatusChips={showStatusChips}
                taskStatusOptions={taskStatusOptions}
              />
            )}
          </>
        )}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(300).delay(120)}
        style={[styles.chipBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {viewMode === 'week' && (
            <PressableScale
              style={[
                styles.chip,
                { backgroundColor: allDayExpanded ? theme.primary : theme.subtle },
              ]}
              onPress={() => { haptic.select(); setAllDayExpanded(v => !v); }}
            >
              <Text style={[
                styles.chipLabel,
                {
                  color: allDayExpanded ? '#FFFFFF' : theme.textSecondary,
                  fontWeight: allDayExpanded ? fontWeight.semibold : fontWeight.regular,
                },
              ]}>
                All Day
              </Text>
            </PressableScale>
          )}

          {EVENT_TYPE_OPTIONS.filter(opt => opt.value !== 'google_cal' || googleConnected).map(opt => {
            const isSelected = activeFilters.eventTypes?.includes(opt.value) ?? false;
            return (
              <PressableScale
                key={opt.value}
                style={[
                  styles.chip,
                  { backgroundColor: isSelected ? theme.primary : theme.subtle },
                ]}
                onPress={() => {
                  haptic.select();
                  const current = activeFilters.eventTypes || [];
                  const updated = isSelected
                    ? current.filter(t => t !== opt.value)
                    : [...current, opt.value];
                  setActiveFilters({ ...activeFilters, eventTypes: updated.length > 0 ? updated : undefined });
                }}
              >
                <Text style={[
                  styles.chipLabel,
                  {
                    color: isSelected ? '#FFFFFF' : theme.textSecondary,
                    fontWeight: isSelected ? fontWeight.semibold : fontWeight.regular,
                  },
                ]}>
                  {opt.label}
                </Text>
              </PressableScale>
            );
          })}

          <PressableScale
            style={[
              styles.chip,
              { backgroundColor: activeFilterCount > 0 ? theme.primary : theme.subtle },
            ]}
            onPress={() => { haptic.select(); filterSheetRef.current?.present(); }}
          >
            <Ionicons
              name="options-outline"
              size={14}
              color={activeFilterCount > 0 ? '#FFFFFF' : theme.textSecondary}
            />
            <Text style={[
              styles.chipLabel,
              {
                color: activeFilterCount > 0 ? '#FFFFFF' : theme.textSecondary,
                fontWeight: activeFilterCount > 0 ? fontWeight.semibold : fontWeight.regular,
              },
            ]}>
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </PressableScale>
        </ScrollView>
      </Animated.View>

      {/* ── Views sheet ──────────────────────────────────────────────────── */}
      <Sheet ref={viewsSheetRef} title="Views" scrollable>
        <View style={styles.sheetBody}>
          {views.map(view => {
            const isActive = view.id === selectedViewId;
            return (
              <TouchableOpacity
                key={view.id}
                style={[
                  styles.viewRow,
                  { borderColor: theme.border },
                  isActive && { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' },
                ]}
                onPress={() => handleSelectView(view)}
                onLongPress={() => handleDeleteView(view)}
                activeOpacity={0.7}
              >
                <Ionicons name="layers-outline" size={18} color={isActive ? theme.primary : theme.textSecondary} />
                <Text style={[styles.viewRowText, { color: isActive ? theme.textPrimary : theme.textSecondary }]}>
                  {view.name}
                </Text>
                {isActive && (
                  <Ionicons name="checkmark-circle" size={18} color={theme.primary} style={{ marginLeft: 'auto' }} />
                )}
                {!view.isDefault && !isActive && (
                  <TouchableOpacity onPress={() => handleDeleteView(view)} style={{ marginLeft: 'auto', padding: 4 }}>
                    <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.newViewBtn, { borderColor: theme.border }]}
            onPress={() => { haptic.light(); setNewViewName(''); createViewSheetRef.current?.present(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.newViewBtnText, { color: theme.textSecondary }]}>New View</Text>
          </TouchableOpacity>
        </View>
      </Sheet>

      {/* ── Create-view sheet (stacks over the views sheet) ─────────────── */}
      <Sheet ref={createViewSheetRef} title="Save View" stackBehavior="push">
        <View style={styles.sheetBody}>
          <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
            Save your current filters and view mode as a named view.
          </Text>
          <SheetTextInput
            style={[styles.viewNameInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="View name (e.g. My Tasks)"
            placeholderTextColor={theme.textMuted}
            value={newViewName}
            onChangeText={setNewViewName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreateView}
          />
          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => { setNewViewName(''); createViewSheetRef.current?.dismiss(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: newViewName.trim() ? theme.primary : theme.textMuted }]}
              onPress={handleCreateView}
              disabled={!newViewName.trim() || savingView}
              activeOpacity={0.8}
            >
              {savingView
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.primaryBtnText}>Save View</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Sheet>

      {/* ── Filters sheet ────────────────────────────────────────────────── */}
      <FilterSheet
        sheetRef={filterSheetRef}
        theme={theme}
        activeFilters={activeFilters}
        setActiveFilters={setActiveFilters}
        activeFilterCount={activeFilterCount}
        taskStatusOptions={taskStatusOptions}
        googleConnected={googleConnected}
        showStatusChips={showStatusChips}
        onToggleStatusChips={() => setShowStatusChips(v => !v)}
        canSaveFilters={!!canSaveFilters}
        onSaveFiltersToView={handleSaveFiltersToView}
      />

      {/* ── Event peek sheet ─────────────────────────────────────────────── */}
      <EventPeekSheet
        sheetRef={eventSheetRef}
        theme={theme}
        event={selectedEvent}
        onDismiss={() => setSelectedEvent(null)}
        taskIsDone={selectedTaskIsDone}
        onToggleTaskComplete={handleToggleTaskComplete}
        onOpenMoreScreen={navigateToMoreScreen}
      />
      {/* ── Create-task sheet ────────────────────────────────────────────── */}
      <Sheet ref={createTaskSheetRef} title="New Task" scrollable snapPoints={['70%', '92%']}>
        <View style={styles.eventSheetBody}>
          <View style={styles.editField}>
            <Text style={[styles.editLabel, { color: theme.textSecondary }]}>Title</Text>
            <SheetTextInput
              style={[styles.editInput, { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }]}
              value={createTitle}
              onChangeText={setCreateTitle}
              placeholder="Task title"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <View style={styles.editField}>
            <Text style={[styles.editLabel, { color: theme.textSecondary }]}>Project</Text>
            <TouchableOpacity
              style={[styles.editSelect, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => { haptic.select(); projectPickerSheetRef.current?.present(); }}
              activeOpacity={0.7}
            >
              <Ionicons name="briefcase-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.editSelectText, { color: createProject ? theme.textPrimary : theme.textMuted }]}>
                {createProject?.name || 'No project'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.editField}>
            <Text style={[styles.editLabel, { color: theme.textSecondary }]}>Due Date</Text>
            <TouchableOpacity
              style={[styles.editSelect, { backgroundColor: theme.background, borderColor: showCreateDatePicker ? theme.primary : theme.border }]}
              onPress={() => { setShowCreateTimePicker(false); setShowCreateDatePicker(v => !v); }}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.editSelectText, { color: theme.textPrimary }]}>
                {createDate ? fromLocalDateStr(createDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'}
              </Text>
              <Ionicons name={showCreateDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
            </TouchableOpacity>
            {showCreateDatePicker && (
              <DateTimePicker
                value={createDate ? fromLocalDateStr(createDate) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_event, date) => {
                  if (Platform.OS === 'android') setShowCreateDatePicker(false);
                  if (date) setCreateDate(toLocalDateStr(date));
                }}
                style={{ marginTop: 4 }}
              />
            )}
          </View>

          <View style={styles.editField}>
            <Text style={[styles.editLabel, { color: theme.textSecondary }]}>Time (optional)</Text>
            <TouchableOpacity
              style={[styles.editSelect, { backgroundColor: theme.background, borderColor: showCreateTimePicker ? theme.primary : theme.border }]}
              onPress={() => { setShowCreateDatePicker(false); setShowCreateTimePicker(v => !v); }}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.editSelectText, { color: createTime ? theme.textPrimary : theme.textMuted }]}>
                {createTime || 'No time'}
              </Text>
              {createTime ? (
                <TouchableOpacity
                  onPress={() => { setCreateTime(''); setShowCreateTimePicker(false); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              ) : (
                <Ionicons name={showCreateTimePicker ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
            {showCreateTimePicker && (
              <DateTimePicker
                value={(() => {
                  const d = new Date();
                  if (createTime) {
                    const [h, m] = createTime.split(':').map(Number);
                    d.setHours(h || 0, m || 0, 0, 0);
                  }
                  return d;
                })()}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_event, date) => {
                  if (Platform.OS === 'android') setShowCreateTimePicker(false);
                  if (date) {
                    setCreateTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
                  }
                }}
                style={{ marginTop: 4 }}
              />
            )}
          </View>

          <View style={styles.editField}>
            <Text style={[styles.editLabel, { color: theme.textSecondary }]}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITY_OPTIONS.map(p => {
                const active = createPriority === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.priorityChip,
                      { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '20' : 'transparent' },
                    ]}
                    onPress={() => { haptic.select(); setCreatePriority(p.key); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.priorityChipText, { color: active ? theme.primary : theme.textSecondary }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: createTitle.trim() ? theme.primary : theme.textMuted, marginTop: 8 }]}
            onPress={handleCreateTask}
            disabled={!createTitle.trim() || creatingTask}
            activeOpacity={0.8}
          >
            {creatingTask
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.primaryBtnText}>Create Task</Text>
            }
          </TouchableOpacity>
        </View>
      </Sheet>

      {/* ── Project picker (stacks over the create sheet) ────────────────── */}
      <Sheet ref={projectPickerSheetRef} title="Project" stackBehavior="push" scrollable snapPoints={['60%']}>
        <View style={styles.sheetBody}>
          <TouchableOpacity
            style={[styles.pickerOption, !createProjectId && { backgroundColor: theme.primary + '15' }]}
            onPress={() => { haptic.select(); setCreateProjectId(null); projectPickerSheetRef.current?.dismiss(); }}
            activeOpacity={0.7}
          >
            <View style={[styles.filterColorDot, { backgroundColor: theme.textMuted }]} />
            <Text style={[styles.pickerOptionText, { color: !createProjectId ? theme.primary : theme.textPrimary }]}>
              No project
            </Text>
            {!createProjectId && <Ionicons name="checkmark" size={20} color={theme.primary} />}
          </TouchableOpacity>
          {projects.map(proj => {
            const active = createProjectId === proj.id;
            const projColor = getProjectEventColor(proj.id, proj.color, EVENT_COLORS.task, brandColor);
            return (
              <TouchableOpacity
                key={proj.id}
                style={[styles.pickerOption, active && { backgroundColor: theme.primary + '15' }]}
                onPress={() => { haptic.select(); setCreateProjectId(proj.id); projectPickerSheetRef.current?.dismiss(); }}
                activeOpacity={0.7}
              >
                <View style={[styles.filterColorDot, { backgroundColor: projColor }]} />
                <Text style={[styles.pickerOptionText, { color: active ? theme.primary : theme.textPrimary }]}>
                  {proj.name}
                </Text>
                {active && <Ionicons name="checkmark" size={20} color={theme.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
    gap: 10,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  headerMonthLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    marginTop: 1,
  },
  viewsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 180,
  },
  viewsBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.lg + 1,
    overflow: 'hidden',
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.lg,
  },
  segmentText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navArrowBtn: { padding: 4 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.lg + 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },

  chipBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
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
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  chipLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
  },

  // Sheets
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  sheetSubtitle: {
    fontSize: fontSize.bodySm,
    lineHeight: 18,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  secondaryBtn: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: 6,
    marginTop: 2,
  },
  viewRowText: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium },
  newViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginTop: 8,
  },
  newViewBtnText: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium },
  viewNameInput: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.bodyLg,
  },

  filterColorDot: { width: 8, height: 8, borderRadius: radius.sm },

  // Create/picker sheet bodies
  eventSheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Create-task form
  editField: { marginBottom: 16 },
  editLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    marginBottom: 6,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.bodyLg,
  },
  editSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  editSelectText: {
    fontSize: fontSize.bodyLg,
    flex: 1,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  priorityChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    marginBottom: 2,
  },
  pickerOptionText: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
});
