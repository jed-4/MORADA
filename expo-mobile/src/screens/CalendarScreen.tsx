import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { fetchCached, clearCache } from '../services/cache';
import { dateStrOf, toLocalDateStr, fromLocalDateStr } from '../lib/dates';
import { doneStatusKey, defaultStatusKey, isDoneStatus, type TaskStatusOption as LibStatusOption } from '../lib/taskStatus';
import { haptic } from '../lib/haptics';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, useColors, radius, metrics, size, space, type } from '../theme';
import { Check, ChevronLeft, ChevronRight, Layers, Plus, SlidersHorizontal, Trash2 } from 'lucide-react-native';
import {
  ButtonRow, Card, FAB, FieldHint, FieldLabel, ListRow, PrimaryButton, ProjectSquare, PropertyRow, SecondaryButton, Segmented,
  SheetBody, TextButton, TextField,
} from '../components/kit';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { isInStack } from '../navigation/back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EVENT_COLORS,
  SCHEDULE_STATUS_COLORS,
  MONTHS,
  getProjectEventColor,
  getMondayOfWeek,
  isSameDay,
  isEventAllDay,
  formatClock,
  type CalendarEvent,
  type EventsByDay,
} from '../components/calendar/shared';
import { FeedView, type FeedViewHandle } from '../components/calendar/FeedView';
import { WeekView, useWeekColWidth, useWeekVisibleDays, HOUR_HEIGHT, WEEK_TOTAL_DAYS, WEEK_VISIBLE_DAYS_WIDE } from '../components/calendar/WeekView';
import { MonthView, type MonthCell } from '../components/calendar/MonthView';
import { FilterSheet } from '../components/calendar/FilterSheet';
import { EventPeekSheet } from '../components/calendar/EventPeekSheet';
import type { ScrollViewInstance } from 'react-native';

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
  const insets = useSafeAreaInsets();
  // Same component as the Calendar TAB (no back) and More > My Calendar (a
  // stack screen, usually its only route — needs its own back control).
  const showBack = isInStack(navigation as any);
  const k = useColors();

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
  const feedRef = useRef<FeedViewHandle>(null);
  const filterSheetRef = useRef<SheetRef>(null);
  const createViewSheetRef = useRef<SheetRef>(null);
  const eventSheetRef = useRef<SheetRef>(null);
  const createTaskSheetRef = useRef<SheetRef>(null);
  const projectPickerSheetRef = useRef<SheetRef>(null);

  const timeGridScrollRef = useRef<ScrollViewInstance>(null);
  const weekScrollRef = useRef<ScrollViewInstance>(null);
  const timeLabelScrollRef = useRef<ScrollViewInstance>(null);

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

  // Follows the screen size (fold/unfold) — must match WeekView's columns.
  const GRID_COL_WIDTH = useWeekColWidth();
  // 3 on a phone, 7 (a whole Mon–Sun week) on a wide screen. Changes live.
  const WEEK_VISIBLE = useWeekVisibleDays();
  const isFullWeek = WEEK_VISIBLE >= WEEK_VISIBLE_DAYS_WIDE;

  const todayWeekIndex = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return weekDays.findIndex(d => isSameDay(d, today));
  }, [weekDays]);

  /** Index (in weekDays) of the Monday on or before day `idx`. May be < 0. */
  const mondayIndexOf = useCallback((idx: number) => {
    const i = Math.max(0, Math.min(weekDays.length - 1, Math.round(idx)));
    return i - ((weekDays[i].getDay() + 6) % 7);
  }, [weekDays]);

  /** Left-most visible day for "today": phone shows yesterday|today|tomorrow,
   *  the full-week view starts on this week's Monday. */
  const todayLeftIndex = useCallback(
    (visible: number) => (visible >= WEEK_VISIBLE_DAYS_WIDE ? mondayIndexOf(todayWeekIndex) : todayWeekIndex - 1),
    [mondayIndexOf, todayWeekIndex],
  );

  // Initialise to the real starting offset so secondary refs sync correctly
  // even before the first onScroll event fires from weekScrollRef.
  const weekScrollOffset = useRef(Math.max(0, todayLeftIndex(WEEK_VISIBLE) * GRID_COL_WIDTH));
  // The same position in DAYS (fractional). Pixels go stale when a fold or
  // unfold changes the column width; days don't, so this is what we restore.
  const weekLeftDay = useRef(weekScrollOffset.current / GRID_COL_WIDTH);

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
    // Week grid and List both draw the now line.
    if (viewMode === 'month') return;
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

  // The All day row only takes space when a day in the grid has something all-day.
  const anyAllDayEvents = useMemo(
    () => weekDays.some(d => (eventsByDay[toLocalDateStr(d)] || []).some(isEventAllDay)),
    [weekDays, eventsByDay],
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
    weekLeftDay.current = clamped / GRID_COL_WIDTH;
  };

  // Fold/unfold: the column width (and maybe the 3↔7 day count) just changed,
  // so the old pixel offset points at a different day. Re-scroll to the same
  // day instead of letting the view drift or jump back to today. Layout effect
  // so it lands before the resized grid is painted.
  const prevWeekLayout = useRef({ col: GRID_COL_WIDTH, visible: WEEK_VISIBLE });
  useLayoutEffect(() => {
    const prev = prevWeekLayout.current;
    if (prev.col === GRID_COL_WIDTH && prev.visible === WEEK_VISIBLE) return;
    prevWeekLayout.current = { col: GRID_COL_WIDTH, visible: WEEK_VISIBLE };
    let left = weekLeftDay.current;
    if (prev.visible !== WEEK_VISIBLE) {
      // Keep the day the user was looking at on screen: today if it was
      // visible, otherwise the middle visible day.
      const prevLeft = Math.round(left);
      const todayVisible = todayWeekIndex >= prevLeft && todayWeekIndex < prevLeft + prev.visible;
      const focus = todayVisible ? todayWeekIndex : prevLeft + Math.floor(prev.visible / 2);
      left = WEEK_VISIBLE >= WEEK_VISIBLE_DAYS_WIDE ? mondayIndexOf(focus) : focus - Math.floor(WEEK_VISIBLE / 2);
    }
    scrollWeekTo(left * GRID_COL_WIDTH, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GRID_COL_WIDTH, WEEK_VISIBLE]);

  // Where the week ScrollView starts when it mounts. Recomputed only when the
  // column width or view mode changes (NOT every render — it's a contentOffset
  // prop, and the minute tick re-renders WeekView), from the day ref above.
  const weekInitialOffset = useMemo(
    () => Math.max(0, weekLeftDay.current * GRID_COL_WIDTH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [GRID_COL_WIDTH, viewMode],
  );

  // Full-week view pages a week at a time, landing on Mondays. The phone has
  // no snapping (unchanged).
  const weekSnapOffsets = useMemo(() => {
    if (!isFullWeek) return undefined;
    const offsets: number[] = [];
    weekDays.forEach((d, i) => { if (d.getDay() === 1) offsets.push(i * GRID_COL_WIDTH); });
    return offsets;
  }, [isFullWeek, weekDays, GRID_COL_WIDTH]);

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
      if (isFullWeek) {
        // Whole weeks, Monday-aligned, from the week currently in view.
        const monday = mondayIndexOf(Math.round(weekLeftDay.current) + Math.floor(WEEK_VISIBLE / 2));
        scrollWeekTo((monday + direction * 7) * GRID_COL_WIDTH);
      } else {
        scrollWeekTo(weekScrollOffset.current + direction * WEEK_VISIBLE * GRID_COL_WIDTH);
      }
    }
  }, [viewMode, onNavigateMonth, GRID_COL_WIDTH, isFullWeek, mondayIndexOf, WEEK_VISIBLE]);

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === viewMode) return;
    haptic.select();
    if (mode === 'week') {
      setWeekStartDate(getMondayOfWeek(new Date()));
      // Mount the week grid already at today (see weekInitialOffset).
      weekLeftDay.current = Math.max(0, todayLeftIndex(WEEK_VISIBLE));
      setTimeout(() => {
        const x = Math.max(0, todayLeftIndex(WEEK_VISIBLE) * GRID_COL_WIDTH);
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
      const x = Math.max(0, todayLeftIndex(WEEK_VISIBLE) * GRID_COL_WIDTH);
      scrollWeekTo(x);
    } else if (viewMode === 'list') {
      feedRef.current?.scrollToToday();
    }
  };

  const handleWeekScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    weekScrollOffset.current = offsetX;
    weekLeftDay.current = offsetX / GRID_COL_WIDTH;
    const leftIndex = Math.round(offsetX / GRID_COL_WIDTH);
    const centerIndex = Math.min(leftIndex + Math.floor(WEEK_VISIBLE / 2), weekDays.length - 1);
    const centerDay = weekDays[centerIndex];
    if (centerDay) {
      const monday = getMondayOfWeek(centerDay);
      setWeekStartDate(prev => {
        if (prev.getTime() !== monday.getTime()) return monday;
        return prev;
      });
    }
  }, [weekDays, GRID_COL_WIDTH, WEEK_VISIBLE]);

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
    : viewMode === 'list'
      // The list opens at today, so name today's month.
      ? `${MONTHS[todayDate.getMonth()]} ${todayDate.getFullYear()}`
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
    <View style={[styles.container, { backgroundColor: k.bg }]}>
      <View style={[cx.top, { paddingTop: insets.top + metrics.calendar.top }]}>
        {/* Month · ‹ › · Today · filter */}
        <View style={cx.headRow}>
          {showBack ? (
            <Pressable onPress={() => navigation.goBack()} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
              <ChevronLeft size={metrics.pageHeader.back} color={k.accent} strokeWidth={metrics.iconStroke} />
            </Pressable>
          ) : null}
          <Text style={[type.heading, cx.shrink, { color: k.text }]} numberOfLines={1} accessibilityRole="header">
            {headerMonth}
          </Text>
          {viewMode !== 'list' ? (
            <View style={cx.arrows}>
              <Pressable onPress={() => navigatePeriod(-1)} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel={viewMode === 'month' ? 'Previous month' : 'Previous days'}>
                <ChevronLeft size={metrics.calendar.arrow} color={k.muted} strokeWidth={metrics.iconStroke} />
              </Pressable>
              <Pressable onPress={() => navigatePeriod(1)} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel={viewMode === 'month' ? 'Next month' : 'Next days'}>
                <ChevronRight size={metrics.calendar.arrow} color={k.muted} strokeWidth={metrics.iconStroke} />
              </Pressable>
            </View>
          ) : null}
          <View style={cx.spacer} />
          <View style={cx.actions}>
            <Pressable onPress={goToToday} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Go to today">
              <Text style={[type.body, { color: k.accent }]}>Today</Text>
            </Pressable>
            <Pressable
              onPress={() => { haptic.select(); filterSheetRef.current?.present(); }}
              hitSlop={metrics.hitSlop}
              accessibilityRole="button"
              accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} on` : 'Filters and views'}
            >
              <SlidersHorizontal size={size.icon.header + 1} color={activeFilterCount > 0 ? k.accent : k.icon} strokeWidth={metrics.iconStroke} />
              {activeFilterCount > 0 ? <View style={[cx.filterDot, { backgroundColor: k.accent, borderColor: k.bg }]} /> : null}
            </Pressable>
          </View>
        </View>
        <Segmented options={VIEW_MODES} value={viewMode} onChange={handleViewModeChange} />
      </View>

      <View style={cx.body}>
        {loading ? renderSkeleton() : (
          <>
            {viewMode === 'list' && (
              <FeedView
                ref={feedRef}
                eventsByDay={eventsByDay}
                nowMinutes={nowMinutes}
                refreshing={refreshing}
                onRefresh={onRefresh}
                onEventPress={handleEventTap}
                onDayLongPress={handleDayLongPress}
              />
            )}
            {viewMode === 'week' && (
              <WeekView
                weekDays={weekDays}
                eventsByDay={eventsByDay}
                nowMinutes={nowMinutes}
                anyAllDayEvents={anyAllDayEvents}
                allDayExpanded={allDayExpanded}
                onToggleAllDay={() => { haptic.select(); setAllDayExpanded(v => !v); }}
                initialOffset={weekInitialOffset}
                snapOffsets={weekSnapOffsets}
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
      </View>

      <FAB onPress={handleHeaderCreate} label="New task" />

      {/* ── Saved views ──────────────────────────────────────────────────── */}
      <Sheet ref={viewsSheetRef} title="Saved views" scrollable>
        <SheetBody>
          <Card variant="list">
            {views.map(view => {
              const isActive = view.id === selectedViewId;
              return (
                <ListRow
                  key={view.id}
                  lead={<Layers size={size.icon.row} color={isActive ? k.accent : k.icon} strokeWidth={metrics.iconStroke} />}
                  title={view.name}
                  titleLines={1}
                  selected={isActive}
                  trailing={
                    isActive ? (
                      <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} />
                    ) : !view.isDefault ? (
                      <Pressable hitSlop={metrics.hitSlop} onPress={() => handleDeleteView(view)} accessibilityRole="button" accessibilityLabel={`Delete ${view.name}`}>
                        <Trash2 size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />
                      </Pressable>
                    ) : undefined
                  }
                  onPress={() => handleSelectView(view)}
                  onLongPress={() => handleDeleteView(view)}
                />
              );
            })}
          </Card>
          <TextButton
            label="New view"
            icon={Plus}
            onPress={() => { haptic.light(); setNewViewName(''); createViewSheetRef.current?.present(); }}
          />
        </SheetBody>
      </Sheet>

      {/* ── Save view (stacks over Saved views) ─────────────────────────── */}
      <Sheet ref={createViewSheetRef} title="Save view" stackBehavior="push">
        <SheetBody>
          <FieldHint>Saves your current filters and view (List, Week or Month) under a name.</FieldHint>
          <TextField
            inSheet
            placeholder="View name (e.g. My tasks)"
            value={newViewName}
            autoCapitalize="words"
            onChangeText={setNewViewName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreateView}
            accessibilityLabel="View name"
          />
          <ButtonRow>
            <SecondaryButton label="Cancel" onPress={() => { setNewViewName(''); createViewSheetRef.current?.dismiss(); }} />
            <PrimaryButton label="Save view" onPress={handleCreateView} loading={savingView} disabled={!newViewName.trim()} />
          </ButtonRow>
        </SheetBody>
      </Sheet>

      {/* ── Filters sheet ────────────────────────────────────────────────── */}
      <FilterSheet
        sheetRef={filterSheetRef}
        activeFilters={activeFilters}
        setActiveFilters={setActiveFilters}
        activeFilterCount={activeFilterCount}
        taskStatusOptions={taskStatusOptions}
        googleConnected={googleConnected}
        showStatusChips={showStatusChips}
        onToggleStatusChips={() => setShowStatusChips(v => !v)}
        canSaveFilters={!!canSaveFilters}
        onSaveFiltersToView={handleSaveFiltersToView}
        viewName={currentView?.name ?? null}
        onOpenViews={() => {
          filterSheetRef.current?.dismiss();
          setTimeout(() => viewsSheetRef.current?.present(), metrics.sheetSwapMs);
        }}
      />

      {/* ── Event peek sheet ─────────────────────────────────────────────── */}
      <EventPeekSheet
        sheetRef={eventSheetRef}
        event={selectedEvent}
        onDismiss={() => setSelectedEvent(null)}
        taskIsDone={selectedTaskIsDone}
        onToggleTaskComplete={handleToggleTaskComplete}
        onOpenMoreScreen={navigateToMoreScreen}
      />
      {/* ── New task ─────────────────────────────────────────────────────── */}
      <Sheet
        ref={createTaskSheetRef}
        title="New task"
        scrollable
        snapPoints={['70%', '92%']}
        footer={<PrimaryButton label="Create task" onPress={handleCreateTask} loading={creatingTask} disabled={!createTitle.trim()} />}
      >
        <SheetBody>
          <TextField
            inSheet
            value={createTitle}
            autoCapitalize="sentences"
            returnKeyType="done"
            onChangeText={setCreateTitle}
            placeholder="Task title"
            accessibilityLabel="Task title"
          />

          <Card variant="list">
            <PropertyRow
              key="project"
              form
              label="Project"
              value={createProject?.name}
              placeholder="No project"
              onPress={() => { haptic.select(); projectPickerSheetRef.current?.present(); }}
            />
            <PropertyRow
              key="date"
              form
              label="Due date"
              value={createDate ? fromLocalDateStr(createDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : undefined}
              placeholder="Pick a date"
              onPress={() => { setShowCreateTimePicker(false); setShowCreateDatePicker(v => !v); }}
            />
            {showCreateDatePicker ? (
              <DateTimePicker
                key="datePicker"
                value={createDate ? fromLocalDateStr(createDate) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                accentColor={k.accent}
                onChange={(_event, date) => {
                  if (Platform.OS === 'android') setShowCreateDatePicker(false);
                  if (date) setCreateDate(toLocalDateStr(date));
                }}
              />
            ) : null}
            <PropertyRow
              key="time"
              form
              label="Time"
              value={createTime ? formatClock(createTime) : undefined}
              placeholder="No time"
              onPress={() => { setShowCreateDatePicker(false); setShowCreateTimePicker(v => !v); }}
            />
            {showCreateTimePicker ? (
              <View key="timePicker">
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
                />
                {createTime ? (
                  <TextButton label="Clear time" tone="muted" center onPress={() => { setCreateTime(''); setShowCreateTimePicker(false); }} />
                ) : null}
              </View>
            ) : null}
          </Card>

          <View style={cx.field}>
            <FieldLabel>Priority</FieldLabel>
            <Segmented
              options={PRIORITY_OPTIONS.map(p => ({ key: p.key, label: p.label }))}
              value={createPriority}
              onChange={key => { haptic.select(); setCreatePriority(key); }}
            />
          </View>
        </SheetBody>
      </Sheet>

      {/* ── Project picker (stacks over New task) ───────────────────────── */}
      <Sheet ref={projectPickerSheetRef} title="Project" stackBehavior="push" scrollable snapPoints={['60%']}>
        <SheetBody>
          <Card variant="list">
            <ListRow
              key="__none"
              title="No project"
              selected={!createProjectId}
              trailing={!createProjectId ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
              onPress={() => { haptic.select(); setCreateProjectId(null); projectPickerSheetRef.current?.dismiss(); }}
            />
            {projects.map(proj => {
              const active = createProjectId === proj.id;
              return (
                <ListRow
                  key={proj.id}
                  lead={<ProjectSquare color={proj.color} fallbackKey={proj.id} />}
                  title={proj.name}
                  titleLines={1}
                  selected={active}
                  trailing={active ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                  onPress={() => { haptic.select(); setCreateProjectId(proj.id); projectPickerSheetRef.current?.dismiss(); }}
                />
              );
            })}
          </Card>
        </SheetBody>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

const cx = StyleSheet.create({
  top: { paddingHorizontal: metrics.calendar.padX, gap: metrics.calendar.gap, paddingBottom: metrics.calendar.gap },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.calendar.headerArrowGap, minHeight: metrics.pageHeader.height },
  shrink: { flexShrink: 1 },
  arrows: { flexDirection: 'row', alignItems: 'center', gap: metrics.calendar.headerArrowGap, marginLeft: metrics.calendar.headerArrowGap },
  spacer: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: metrics.calendar.headerActionGap },
  filterDot: {
    position: 'absolute',
    top: -metrics.calendar.filterDotOffset,
    right: -metrics.calendar.filterDotOffset,
    width: metrics.calendar.filterDot,
    height: metrics.calendar.filterDot,
    borderRadius: metrics.calendar.filterDot / 2,
    borderWidth: size.border,
  },
  body: { flex: 1 },
  field: { gap: metrics.form.labelGap },
});
