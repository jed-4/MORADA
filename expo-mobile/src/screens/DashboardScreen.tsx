import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Animated, {
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { getCached, setCached, clearCache } from '../services/cache';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { Skeleton, SkeletonRow } from '../components/ui/Skeleton';
import { haptic } from '../lib/haptics';
import { useLayout } from '../lib/useLayout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compareProjects } from '../lib/projects';
import { SuggestionSheet } from '../components/more/SuggestionSheet';
import { QuickCaptureRow } from '../components/home/QuickCaptureRow';
import { clockedOutOnThisPhone } from '../services/liveActivity';
import { refreshWidgetSnapshot } from '../services/widgetSnapshot';
import { getInitials, timeAgo } from '../lib/format';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, useColors, fontSize, fontWeight, radius, projectColors, metrics, radii, size, space, tabular, type, fonts } from '../theme';
import {
  Activity, AtSign, Bell, Building, ChevronDown, ChevronRight, CircleCheck, Clock, Cloud, CloudFog, CloudLightning, CloudRain,
  CloudSun, Folder, Lightbulb, LogOut, Settings, Snowflake, Sun, type LucideIcon,
} from 'lucide-react-native';
import { Avatar, Card, Checkbox, Divider, ListRow, UnreadBadge } from '../components/kit';
import { AgendaRow, EmptyLine, MoreRow, ProjectLineRow, Rows, SubLabel, WorkspaceSection } from '../components/home/WorkspaceSections';

interface Project {
  id: string;
  name: string;
  projectNumber?: string;
  jobNumber?: string;
  clientName?: string;
  currentSystemPhase?: string;
  projectSubStatus?: string;
  address?: string;
  color?: string;
  isFavourite?: boolean;
  isArchived?: boolean;
  isBusiness?: boolean;
}

interface CompanySettings {
  brandColor?: string;
}

interface ChecklistItem {
  id?: string;
  text: string;
  completed: boolean;
  assigneeId?: string;
  assigneeName?: string;
}

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
  content?: string;
  contentText?: string;
  checklist?: ChecklistItem[];
  checklistInstanceId?: string;
  checklistInstanceName?: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  linkUrl?: string;
}

interface ActivityItem {
  id: string;
  activityType: string;
  action: string;
  description: string;
  userName?: string;
  entityName?: string;
  projectId?: string;
  createdAt: string;
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

interface ActiveTimesheet {
  id: string;
  projectId: string;
  clockInTime: string;
  projectName?: string;
  costCodeId?: string | null;
}

interface TimesheetEntry {
  id: string;
  projectId?: string;
  userId?: string;
  date: string;
  duration: string;
  status: string;
  startTime?: string;
  endTime?: string;
  costCodeId?: string;
  costCodeSplits?: Array<{ costCodeId: string; costCodeName?: string; duration: string }>;
  projectName?: string;
}

interface CostCode {
  id: string;
  code: string;
  title: string;
}

interface SiteWeather {
  tempMax: number;
  tempMin: number;
  description: string;
  iconKey: string;
  precipChance: number;
  rainFromHour: number | null;
  locationName: string;
}

interface MentionNotification {
  id: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatTimeSince(dateStr: string): string {
  const start = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

const isComplete = (s?: string) => s === 'completed' || s === 'done';

/** Server weather iconKey → Lucide icon. */
const weatherIcons: Record<string, LucideIcon> = {
  clear: Sun,
  'partly-cloudy': CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  thunderstorm: CloudLightning,
  snow: Snowflake,
};

/** 0-23 → "12am" / "2pm". */
function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

const BREAK_OPTIONS = [0, 15, 30, 45, 60, 90, 120];

function breakLabel(mins: number): string {
  if (mins === 0) return 'None';
  if (mins < 60) return `${mins}m`;
  return mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** Accent pulsing dot on the live clocked-in card. */
function PulsingDot() {
  const c = useColors();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulsingDot, { backgroundColor: c.accent }, style]} />;
}

export default function DashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  // Wide screen (Duo unfolded): widgets flow two to a row. Same children in the
  // same order with the same keys — only styles change, so a fold never
  // remounts a widget (horizontal list positions, expanded state survive).
  const { isWide } = useLayout();
  const fullW = isWide && styles.sectionFull;
  const halfW = isWide && styles.sectionHalf;

  const [projects, setProjects] = useState<Project[]>(() => getCached<Project[]>('projects') || []);
  const [costCodes, setCostCodes] = useState<CostCode[]>(() => getCached<CostCode[]>('costCodes') || []);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(
    () => getCached<CompanySettings | null>('companySettings'),
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [activeTimesheet, setActiveTimesheet] = useState<ActiveTimesheet | null>(null);
  const [recentTimesheets, setRecentTimesheets] = useState<TimesheetEntry[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  // Mirror the Projects list: never show archived or business projects in the
  // Workspace project row (the dashboard endpoint returns them unfiltered).
  const sortedProjects = useMemo(
    () => projects.filter(p => !p.isArchived && !p.isBusiness).sort(compareProjects),
    [projects],
  );
  const [selectedTimesheetDetail, setSelectedTimesheetDetail] = useState<TimesheetEntry | null>(null);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [scheduleDetail, setScheduleDetail] = useState<ScheduleItem | null>(null);
  const [weather, setWeather] = useState<SiteWeather | null>(null);
  const [mentions, setMentions] = useState<MentionNotification[]>([]);
  const [scheduleStatusOptions, setScheduleStatusOptions] = useState<{ key: string; name: string; color: string }[]>([]);
  const [phaseLabels, setPhaseLabels] = useState<Record<string, string>>({});
  const [subStatusLabels, setSubStatusLabels] = useState<Record<string, string>>({});

  // Collapsed state for Recent Activity persists across sessions.
  useEffect(() => {
    AsyncStorage.getItem('@morada_home_activity_collapsed')
      .then((v) => { if (v === '1') setActivityCollapsed(true); })
      .catch(() => {});
  }, []);
  const toggleActivityCollapsed = () => {
    haptic.select();
    setActivityCollapsed((prev) => {
      AsyncStorage.setItem('@morada_home_activity_collapsed', prev ? '0' : '1').catch(() => {});
      return !prev;
    });
  };

  const clockOutSheetRef = useRef<SheetRef>(null);
  const suggestionSheetRef = useRef<SheetRef>(null);
  const timesheetSheetRef = useRef<SheetRef>(null);
  const taskSheetRef = useRef<SheetRef>(null);
  const scheduleSheetRef = useRef<SheetRef>(null);

  // Unread @mentions from the chat — powers the mentions digest card.
  // Mentions are an enhancement: any failure just leaves the card hidden.
  const fetchMentions = useCallback(() => {
    apiFetch<MentionNotification[]>('/api/notifications?unreadOnly=true&limit=20')
      .then(notifs => setMentions((notifs || []).filter(n => n.type === 'mention')))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    fetchMentions();
    try {
      const [data, statusData, phaseData, subStatusData] = await Promise.all([
        apiFetch<{
          projects: Project[];
          tasks: Task[];
          notifications: Notification[];
          unreadCount: number;
          activeTimesheet: ActiveTimesheet | null;
          recentTimesheets: TimesheetEntry[];
          scheduleItems: ScheduleItem[];
          companySettings: CompanySettings | null;
          costCodes: CostCode[];
          activities: ActivityItem[];
        }>('/api/mobile/dashboard'),
        apiFetch<{ options: { key: string; name: string; color: string | null; sortOrder: number }[] }>(
          '/api/field-categories/by-key/schedule_item.status'
        ).catch(() => ({ options: [] })),
        apiFetch<{ options: { key: string; name: string }[] }>(
          '/api/field-categories/by-key/project.system_phase'
        ).catch(() => ({ options: [] })),
        apiFetch<{ options: { key: string; name: string }[] }>(
          '/api/field-categories/by-key/project.sub_status'
        ).catch(() => ({ options: [] })),
      ]);

      setProjects(data.projects || []);
      setCostCodes(data.costCodes || []);
      setCompanySettings(data.companySettings || null);
      setTasks(data.tasks || []);
      setUnreadCount(data.unreadCount || 0);
      setActiveTimesheet(data.activeTimesheet || null);
      setRecentActivities(data.activities || []);
      setRecentTimesheets(data.recentTimesheets || []);
      setScheduleItems(data.scheduleItems || []);
      if (statusData?.options?.length) {
        setScheduleStatusOptions(
          statusData.options
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(o => ({ key: o.key, name: o.name, color: o.color || theme.textMuted }))
        );
      }
      if (phaseData?.options?.length) {
        setPhaseLabels(Object.fromEntries(phaseData.options.map(o => [o.key, o.name])));
      }
      if (subStatusData?.options?.length) {
        setSubStatusLabels(Object.fromEntries(subStatusData.options.map(o => [o.key, o.name])));
      }

      // Seed cache so other screens don't need to re-fetch this data
      setCached('projects', data.projects || []);
      setCached('costCodes', data.costCodes || []);
      setCached('companySettings', data.companySettings || null);
      // Home Screen widgets follow the dashboard (own small, money-free fetch).
      refreshWidgetSnapshot();
    } catch {
      console.error('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [fetchMentions]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (activeTimesheet) {
      clockTimerRef.current = setInterval(() => setTick(t => t + 1), 60000);
    }
    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
  }, [activeTimesheet]);

  useFocusEffect(
    useCallback(() => {
      apiFetch<{ count: number }>('/api/notifications/unread-count')
        .then(data => setUnreadCount(data?.count ?? 0))
        .catch(() => {});
      // Lightweight re-sync of the clock-in state — clocking in/out from the
      // Timesheets screen must be reflected here without a full dashboard fetch.
      apiFetch<ActiveTimesheet | null>('/api/timesheets/active')
        .then(ts => setActiveTimesheet(ts && ts.id ? ts : null))
        .catch(() => {});
      // Reading a thread in Messages should clear the mentions card on return.
      fetchMentions();
    }, [fetchMentions])
  );

  // Site weather for the active (clocked-in) project, else the first project.
  // Weather is garnish — any failure just means no weather line.
  const weatherProjectId = activeTimesheet?.projectId || projects[0]?.id;
  useEffect(() => {
    if (!weatherProjectId) {
      setWeather(null);
      return;
    }
    const cacheKey = `weather:${weatherProjectId}`;
    const cached = getCached<SiteWeather>(cacheKey);
    if (cached) {
      setWeather(cached);
      return;
    }
    let cancelled = false;
    apiFetch<SiteWeather>(`/api/weather?projectId=${weatherProjectId}`)
      .then(data => {
        setCached(cacheKey, data);
        if (!cancelled) setWeather(data);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => { cancelled = true; };
  }, [weatherProjectId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    clearCache();
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const toggleTaskComplete = useCallback(async (taskId: string, currentStatus?: string) => {
    const wasDone = isComplete(currentStatus);
    if (wasDone) haptic.select(); else haptic.success();
    const newStatus = wasDone ? 'todo' : 'completed';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await apiRequest(`/api/tasks/${taskId}`, 'PATCH', { status: newStatus });
    } catch {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: currentStatus } : t));
      toast.error('Could not update task');
    }
  }, [toast]);

  const openTaskSheet = useCallback(async (task: Task) => {
    setTaskDetail(task);
    taskSheetRef.current?.present();
    setTaskDetailLoading(true);
    try {
      const full = await apiFetch<Task>(`/api/tasks/${task.id}`);
      setTaskDetail(full);
    } catch {
      // keep the summary data we already have
    } finally {
      setTaskDetailLoading(false);
    }
  }, []);

  const openScheduleSheet = useCallback((item: ScheduleItem) => {
    setScheduleDetail(item);
    scheduleSheetRef.current?.present();
  }, []);

  const openTimesheetSheet = useCallback((ts: TimesheetEntry) => {
    setSelectedTimesheetDetail(ts);
    timesheetSheetRef.current?.present();
  }, []);

  // Mentions card tap: deep-link into the thread when we know the channel
  // (the notification link is "/messages?channel=<id>"), else the Messages tab.
  const openMentions = useCallback(() => {
    const first = mentions[0];
    const channelId = first?.link?.match(/[?&]channel=([^&]+)/)?.[1];
    // Type the parent (the tab navigator) explicitly so the union's .navigate
    // stays callable — a bare getParent() ?? navigation yields a mixed nav type.
    const tabNav = navigation.getParent<NativeStackNavigationProp<any>>() ?? navigation;
    if (channelId) {
      const channelName = first.title.match(/ in #(.+)$/)?.[1] || 'Messages';
      tabNav.navigate('Messages', {
        screen: 'MessageThread',
        params: { channelId, channelName },
      });
    } else {
      tabNav.navigate('Messages');
    }
  }, [mentions, navigation]);

  const handleTaskSheetToggleComplete = useCallback(async () => {
    if (!taskDetail) return;
    const currentStatus = taskDetail.status;
    const wasDone = isComplete(currentStatus);
    if (wasDone) haptic.select(); else haptic.success();
    const newStatus = wasDone ? 'todo' : 'completed';
    setTaskDetail(prev => prev ? { ...prev, status: newStatus } : prev);
    setTasks(prev => prev.map(t => t.id === taskDetail.id ? { ...t, status: newStatus } : t));
    try {
      await apiRequest(`/api/tasks/${taskDetail.id}`, 'PATCH', { status: newStatus });
    } catch {
      setTaskDetail(prev => prev ? { ...prev, status: currentStatus } : prev);
      setTasks(prev => prev.map(t => t.id === taskDetail.id ? { ...t, status: currentStatus } : t));
      toast.error('Could not update task');
    }
  }, [taskDetail, toast]);

  const handleChecklistItemToggle = useCallback(async (itemIndex: number) => {
    if (!taskDetail || savingChecklist) return;
    haptic.select();
    const checklist = (taskDetail.checklist || []).map((item, i) =>
      i === itemIndex ? { ...item, completed: !item.completed } : item
    );
    setTaskDetail(prev => prev ? { ...prev, checklist } : prev);
    setSavingChecklist(true);
    try {
      await apiRequest(`/api/tasks/${taskDetail.id}`, 'PATCH', { checklist });
    } catch {
      // revert on error
      setTaskDetail(prev => prev ? { ...prev, checklist: taskDetail.checklist } : prev);
      toast.error('Could not update checklist');
    } finally {
      setSavingChecklist(false);
    }
  }, [taskDetail, savingChecklist, toast]);

  const openClockOutSheet = useCallback(() => {
    haptic.warning();
    setBreakMinutes(0);
    clockOutSheetRef.current?.present();
  }, []);

  const confirmClockOut = useCallback(async () => {
    if (!activeTimesheet || clockingOut) return;
    setClockingOut(true);
    const duration = formatTimeSince(activeTimesheet.clockInTime);
    try {
      await apiRequest('/api/timesheets/clock-out', 'POST', {
        timesheetId: activeTimesheet.id,
        breakDuration: breakMinutes,
        clientTime: new Date().toISOString(), // the tap, not when it lands
      });
      setActiveTimesheet(null);
      clockedOutOnThisPhone();
      clockOutSheetRef.current?.dismiss();
      toast.success(`Clocked out — ${duration} logged`);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message ? e.message : 'Please check your connection and try again.';
      toast.error(msg);
    } finally {
      setClockingOut(false);
    }
  }, [activeTimesheet, clockingOut, breakMinutes, fetchData, toast]);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || '';
  const lastName = user?.lastName || (user?.fullName?.split(' ').slice(1).join(' ')) || '';
  const fullDisplayName = `${firstName} ${lastName}`.trim() || 'User';

  const todayTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).slice(0, 5);
  const incompleteTasks = todayTasks.filter(t => !isComplete(t.status));
  const completedTasks = todayTasks.filter(t => isComplete(t.status));

  const getProjectName = (pid?: string) => {
    if (!pid) return 'No project';
    const p = projects.find(pr => pr.id === pid);
    if (!p) return 'Unknown';
    return p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name;
  };

  const getCostCodeLabel = (ccId: string) => {
    const cc = costCodes.find(c => c.id === ccId);
    return cc ? `${cc.code} - ${cc.title}` : 'Unknown';
  };

  const getProjectColor = (projectId?: string): string => {
    const fallback = companySettings?.brandColor || projectColors[0];
    if (!projectId) return fallback;
    const project = projects.find(p => p.id === projectId);
    if (project?.color) return project.color;
    return fallback;
  };

  const now = new Date();
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();
  const contextLine = `${now.toLocaleDateString('en-AU', { weekday: 'long' })} ${now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })} · ${greeting}`;

  const isFirstLoad = loading && projects.length === 0;

  const prettify = (k: string | undefined, map: Record<string, string>) =>
    k ? map[k] || k.replace(/_/g, ' ') : '';

  // ── Derived data for the section cards ──────────────────────────────────

  // Pinned (favourite) projects first, then the usual Projects-list order.
  const workspaceProjects = useMemo(
    () => [...sortedProjects].sort((a, b) => Number(!!b.isFavourite) - Number(!!a.isFavourite)),
    [sortedProjects],
  );
  const projectStage = (p: Project) =>
    [prettify(p.currentSystemPhase, phaseLabels), prettify(p.projectSubStatus, subStatusLabels)].filter(Boolean).join(' · ');

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);
  const todayScheduleItems = scheduleItems.filter(i => new Date(i.startDate) >= todayStart && new Date(i.startDate) <= todayEnd);
  const tomorrowScheduleItems = scheduleItems.filter(i => new Date(i.startDate) >= tomorrowStart && new Date(i.startDate) <= tomorrowEnd);
  const upcomingSchedule: { item: ScheduleItem; isTomorrow: boolean }[] = [
    ...todayScheduleItems.map(item => ({ item, isTomorrow: false })),
    ...tomorrowScheduleItems.map(item => ({ item, isTomorrow: true })),
  ];

  const activeCostCode = activeTimesheet?.costCodeId
    ? costCodes.find(cc => cc.id === activeTimesheet.costCodeId)
    : undefined;

  const tabNav = navigation.getParent<NativeStackNavigationProp<any>>() ?? navigation;
  const ws = metrics.workspace;

  const renderTaskRow = (task: Task) => {
    const done = isComplete(task.status);
    return (
      <AgendaRow
        key={task.id}
        lead={<Checkbox round checked={done} onPress={() => toggleTaskComplete(task.id, task.status)} accessibilityLabel={`Complete ${task.title}`} />}
        title={task.title}
        meta={task.projectId ? getProjectName(task.projectId) : null}
        onPress={() => openTaskSheet(task)}
      />
    );
  };

  // Greeting header. It scrolls away with the content (design rule: no sticky headers).
  const greetingHeader = (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={[type.metaMedium, { color: c.mutedStrong }]} numberOfLines={1}>
          {contextLine}
        </Text>
        <Text style={[type.display, { color: c.text }]} numberOfLines={1}>
          {firstName || fullDisplayName}
        </Text>
        {weather && (
          <View style={styles.weatherRow}>
            {(() => {
              const W = weatherIcons[weather.iconKey] || CloudSun;
              return <W size={ws.weatherIcon} color={c.mutedStrong} strokeWidth={metrics.iconStroke} />;
            })()}
            <Text style={[type.caption, { color: c.mutedStrong, flexShrink: 1 }]} numberOfLines={1}>
              {weather.tempMax}° · {weather.description} at{' '}
              {projects.find(p => p.id === weatherProjectId)?.name || weather.locationName}
              {weather.rainFromHour !== null ? ` · rain from ${formatHour(weather.rainFromHour)}` : ''}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.headerRight}>
        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          hitSlop={metrics.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell size={ws.headerIcon} color={c.icon} strokeWidth={metrics.iconStroke} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <UnreadBadge count={unreadCount} />
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setShowUserMenu(v => !v)}
          hitSlop={metrics.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Account menu"
        >
          <Avatar name={fullDisplayName} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {showUserMenu && (
        <Pressable style={styles.userMenuBackdrop} onPress={() => setShowUserMenu(false)} />
      )}
      {showUserMenu && (
        <View style={[styles.userMenuDropdown, { top: insets.top + metrics.workspace.menuTop }]}>
          <Card variant="list">
            <ListRow
              lead={<Building size={ws.menuIcon} color={c.icon} strokeWidth={metrics.iconStroke} />}
              title="Company dashboard"
              titleLines={1}
              onPress={() => { setShowUserMenu(false); navigation.navigate('BusinessDashboard'); }}
            />
            <ListRow
              lead={<Settings size={ws.menuIcon} color={c.icon} strokeWidth={metrics.iconStroke} />}
              title="Settings"
              titleLines={1}
              onPress={() => { setShowUserMenu(false); navigation.getParent()?.navigate('More', { screen: 'Settings' }); }}
            />
            <ListRow
              lead={<Lightbulb size={ws.menuIcon} color={c.icon} strokeWidth={metrics.iconStroke} />}
              title="Suggest an idea"
              titleLines={1}
              onPress={() => { setShowUserMenu(false); suggestionSheetRef.current?.present(); }}
            />
            <ListRow
              lead={<LogOut size={ws.menuIcon} color={c.danger} strokeWidth={metrics.iconStroke} />}
              title="Log out"
              titleLines={1}
              onPress={() => { setShowUserMenu(false); logout(); }}
            />
          </Card>
        </View>
      )}

      {isFirstLoad ? (
        /* First-ever load (no cached data): skeleton in the card layout */
        <View style={{ paddingTop: insets.top, paddingHorizontal: space.screenX }}>
        {greetingHeader}
        <View style={styles.skeletonBody}>
          <Skeleton width="40%" height={14} />
          <View style={styles.skeletonChips}>
            <Skeleton width="23%" height={metrics.captureChip.workspace.height} borderRadius={radii.card} />
            <Skeleton width="23%" height={metrics.captureChip.workspace.height} borderRadius={radii.card} />
            <Skeleton width="23%" height={metrics.captureChip.workspace.height} borderRadius={radii.card} />
            <Skeleton width="23%" height={metrics.captureChip.workspace.height} borderRadius={radii.card} />
          </View>
          <Card variant="section">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        </View>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }, isWide && styles.scrollContentWide]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        >
          <View style={[styles.headerWrap, fullW]}>{greetingHeader}</View>
          {/* Live clocked-in card */}
          {activeTimesheet && (
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.section, fullW]}>
              <Card variant="padded">
                <View style={styles.clockRow}>
                  <View style={styles.clockBody}>
                    <View style={styles.clockLabelRow}>
                      <PulsingDot />
                      <Text style={[type.metaMedium, { color: c.accent }]}>Clocked in</Text>
                    </View>
                    <Text style={[type.heading, tabular, { color: c.text }]}>{formatTimeSince(activeTimesheet.clockInTime)}</Text>
                    <Text style={[type.meta, { color: c.mutedStrong }]} numberOfLines={1}>
                      {[activeTimesheet.projectName || getProjectName(activeTimesheet.projectId), activeCostCode ? `${activeCostCode.code} · ${activeCostCode.title}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={openClockOutSheet}
                    disabled={clockingOut}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.clockOutBtn, { backgroundColor: c.tint, opacity: pressed ? metrics.pressedOpacity : 1 }]}
                  >
                    <Text style={[type.metaSemi, { color: c.link }]}>Clock out</Text>
                  </Pressable>
                </View>
              </Card>
            </Animated.View>
          )}

          {/* Quick capture: photo to diary, receipt, defect, clock in */}
          <Animated.View entering={FadeInDown.duration(300).delay(30)} style={[styles.section, fullW]}>
            <QuickCaptureRow
              projects={sortedProjects}
              navigation={navigation}
              isClockedIn={!!activeTimesheet}
            />
          </Animated.View>

          {/* Unread mentions (not in the design; shown only when there are some) */}
          {mentions.length > 0 && (
            <Animated.View entering={FadeInDown.duration(300).delay(45)} style={[styles.section, fullW]}>
              <Card variant="list">
                <ListRow
                  onPress={openMentions}
                  lead={<AtSign size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStroke} />}
                  title={mentions[0].title.replace(/#/g, '')}
                  titleLines={1}
                  trailing={mentions.length > 1 ? `+${mentions.length - 1}` : undefined}
                  chevron
                />
              </Card>
            </Animated.View>
          )}

          {/* Today: tasks due today + schedule today/tomorrow */}
          <Animated.View entering={FadeInDown.duration(300).delay(60)} style={[styles.section, halfW]} layout={LinearTransition.duration(200)}>
            <WorkspaceSection
              id="today"
              icon={CircleCheck}
              title="Today"
              count={incompleteTasks.length + upcomingSchedule.length}
              onOpen={() => tabNav.navigate('Calendar')}
            >
              <SubLabel>{incompleteTasks.length > 0 ? `Tasks · ${incompleteTasks.length}` : 'Tasks'}</SubLabel>
              {todayTasks.length === 0 ? (
                <EmptyLine>Nothing due today</EmptyLine>
              ) : (
                <Rows>
                  {incompleteTasks.map(renderTaskRow)}
                  {completedTasks.length > 0 ? (
                    <Pressable
                      key="__completed"
                      onPress={() => { haptic.select(); setCompletedExpanded(v => !v); }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: completedExpanded }}
                      style={styles.completedToggle}
                    >
                      <Text style={[type.metaMedium, tabular, { color: c.muted }]}>{`Completed · ${completedTasks.length}`}</Text>
                      {completedExpanded
                        ? <ChevronDown size={size.icon.caret} color={c.muted} strokeWidth={metrics.iconStrokeActive} />
                        : <ChevronRight size={size.icon.caret} color={c.muted} strokeWidth={metrics.iconStrokeActive} />}
                    </Pressable>
                  ) : null}
                  {completedExpanded ? completedTasks.map(renderTaskRow) : null}
                </Rows>
              )}
              <Divider />
              <SubLabel>{upcomingSchedule.length > 0 ? `Schedule · ${upcomingSchedule.length}` : 'Schedule'}</SubLabel>
              {upcomingSchedule.length === 0 ? (
                <EmptyLine>Nothing scheduled</EmptyLine>
              ) : (
                <Rows>
                  {upcomingSchedule.map(({ item, isTomorrow }) => (
                    <AgendaRow
                      key={item.id}
                      color={getProjectColor(item.projectId)}
                      title={item.name}
                      meta={item.projectName || null}
                      right={`${isTomorrow ? 'Tomorrow' : 'Today'}${item.startTime ? ` · ${item.startTime.slice(0, 5)}` : ''}`}
                      onPress={() => openScheduleSheet(item)}
                    />
                  ))}
                </Rows>
              )}
            </WorkspaceSection>
          </Animated.View>

          {/* Projects: pinned first, capped at 5 */}
          {workspaceProjects.length > 0 && (
            <Animated.View entering={FadeInDown.duration(300).delay(120)} style={[styles.section, halfW]}>
              <WorkspaceSection
                id="projects"
                icon={Folder}
                title="Projects"
                count={workspaceProjects.length}
                onOpen={() => tabNav.navigate('Projects')}
              >
                <Rows>
                  {workspaceProjects.slice(0, ws.maxProjects).map(p => (
                    <ProjectLineRow
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      color={p.color || getProjectColor(p.id)}
                      pinned={p.isFavourite}
                      stage={projectStage(p)}
                      onPress={() => tabNav.navigate('Projects', {
                        screen: 'ProjectDetail',
                        params: { projectId: p.id, projectName: p.name },
                      })}
                    />
                  ))}
                  {workspaceProjects.length > ws.maxProjects ? (
                    <MoreRow key="__more" count={workspaceProjects.length - ws.maxProjects} onPress={() => tabNav.navigate('Projects')} />
                  ) : null}
                </Rows>
              </WorkspaceSection>
            </Animated.View>
          )}

          {/* Timesheets */}
          <Animated.View entering={FadeInDown.duration(300).delay(180)} style={[styles.section, halfW]}>
            <WorkspaceSection
              id="timesheets"
              icon={Clock}
              title="Timesheets"
              count={recentTimesheets.length}
              onOpen={() => navigation.navigate('More', { screen: 'Timesheets' })}
            >
              {recentTimesheets.length === 0 ? (
                <EmptyLine>No recent timesheets</EmptyLine>
              ) : (
                <Rows>
                  {recentTimesheets.slice(0, ws.maxTimesheets).map(ts => {
                    const ccId = ts.costCodeId || ts.costCodeSplits?.[0]?.costCodeId;
                    const hours = parseFloat(ts.duration);
                    return (
                      <AgendaRow
                        key={ts.id}
                        color={getProjectColor(ts.projectId)}
                        title={getProjectName(ts.projectId)}
                        meta={[ccId ? getCostCodeLabel(ccId) : null, formatDateLabel(ts.date)].filter(Boolean).join(' · ')}
                        right={Number.isFinite(hours) ? `${hours.toFixed(1)}h` : null}
                        rightStrong
                        onPress={() => openTimesheetSheet(ts)}
                      />
                    );
                  })}
                  {recentTimesheets.length > ws.maxTimesheets ? (
                    <MoreRow
                      key="__more"
                      count={recentTimesheets.length - ws.maxTimesheets}
                      onPress={() => navigation.navigate('More', { screen: 'Timesheets' })}
                    />
                  ) : null}
                </Rows>
              )}
            </WorkspaceSection>
          </Animated.View>

          {/* Recent activity */}
          <Animated.View entering={FadeInDown.duration(300).delay(240)} style={[styles.section, halfW]}>
            <WorkspaceSection id="activity" icon={Activity} title="Recent activity" count={recentActivities.length}>
              {recentActivities.length === 0 ? (
                <EmptyLine>No recent activity</EmptyLine>
              ) : (
                <Rows>
                  {recentActivities.map(activity => {
                    const userName = activity.userName || 'System';
                    return (
                      <View key={activity.id} style={styles.activityRow}>
                        <Avatar size="activity" name={userName} color={activity.projectId ? getProjectColor(activity.projectId) : null} />
                        <Text style={[type.body, { color: c.text, flex: 1 }]} numberOfLines={2}>
                          <Text style={{ fontFamily: fonts.semibold }}>{userName}</Text>
                          {` ${activity.description}`}
                        </Text>
                        <Text style={[type.meta, tabular, { color: c.mutedStrong }]}>{timeAgo(activity.createdAt)}</Text>
                      </View>
                    );
                  })}
                </Rows>
              )}
            </WorkspaceSection>
          </Animated.View>
        </ScrollView>
      )}

      {/* Clock-out confirm sheet */}
      <SuggestionSheet ref={suggestionSheetRef} sourcePage="dashboard-menu" />

      <Sheet ref={clockOutSheetRef} title="Clock out?">
        <View style={styles.sheetBody}>
          {activeTimesheet && (
            <View style={[styles.clockOutSummary, { backgroundColor: theme.background }]}>
              <Text style={[styles.clockOutProject, { color: theme.textPrimary }]}>
                {activeTimesheet.projectName || getProjectName(activeTimesheet.projectId)}
              </Text>
              <Text style={[styles.clockOutElapsed, { color: theme.textSecondary }]}>
                Clocked in for {formatTimeSince(activeTimesheet.clockInTime)}
              </Text>
            </View>
          )}
          <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Break</Text>
          <View style={styles.breakChipsRow}>
            {BREAK_OPTIONS.map(mins => {
              const selected = breakMinutes === mins;
              return (
                <Pressable
                  key={mins}
                  onPress={() => { haptic.select(); setBreakMinutes(mins); }}
                  style={[
                    styles.breakChip,
                    {
                      backgroundColor: selected ? theme.primaryLight : theme.card,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.breakChipText, { color: selected ? theme.primary : theme.textSecondary }]}>
                    {breakLabel(mins)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.destructiveBtn, { backgroundColor: theme.statusDangerSolid }]}
            onPress={confirmClockOut}
            disabled={clockingOut}
            activeOpacity={0.8}
          >
            {clockingOut
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.destructiveBtnText}>Clock Out</Text>}
          </TouchableOpacity>
        </View>
      </Sheet>

      {/* Timesheet detail sheet */}
      <Sheet ref={timesheetSheetRef} title="Timesheet" onDismiss={() => setSelectedTimesheetDetail(null)}>
        {selectedTimesheetDetail && (
          <View style={styles.sheetBody}>
            <View style={[styles.detailRow, { borderColor: theme.border }]}>
              <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
              <View style={styles.detailBody}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Date</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                  {formatDateLabel(selectedTimesheetDetail.date)}
                </Text>
              </View>
            </View>
            <View style={[styles.detailRow, { borderColor: theme.border }]}>
              <Ionicons name="briefcase-outline" size={16} color={theme.textSecondary} />
              <View style={styles.detailBody}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Project</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                  {getProjectName(selectedTimesheetDetail.projectId)}
                </Text>
              </View>
            </View>
            <View style={[styles.detailRow, { borderColor: theme.border }]}>
              <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
              <View style={styles.detailBody}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Duration</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                  {parseFloat(selectedTimesheetDetail.duration).toFixed(2)}h
                  {selectedTimesheetDetail.startTime && selectedTimesheetDetail.endTime
                    ? `  ·  ${selectedTimesheetDetail.startTime} – ${selectedTimesheetDetail.endTime}`
                    : ''}
                </Text>
              </View>
            </View>
            {(() => {
              const ccId = selectedTimesheetDetail.costCodeId || selectedTimesheetDetail.costCodeSplits?.[0]?.costCodeId;
              return ccId ? (
                <View style={[styles.detailRow, { borderColor: theme.border }]}>
                  <Ionicons name="pricetag-outline" size={16} color={theme.textSecondary} />
                  <View style={styles.detailBody}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Cost Code</Text>
                    <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{getCostCodeLabel(ccId)}</Text>
                  </View>
                </View>
              ) : null;
            })()}
            <View style={styles.statusRow}>
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Status</Text>
              <View style={[styles.statusBadge, {
                backgroundColor:
                  selectedTimesheetDetail.status === 'approved' ? theme.statusSuccessBg :
                  selectedTimesheetDetail.status === 'submitted' ? theme.statusInfoBg :
                  selectedTimesheetDetail.status === 'rejected' ? theme.statusDangerBg : theme.primaryLight,
              }]}>
                <Text style={[styles.statusBadgeText, {
                  color:
                    selectedTimesheetDetail.status === 'approved' ? theme.statusSuccess :
                    selectedTimesheetDetail.status === 'submitted' ? theme.statusInfo :
                    selectedTimesheetDetail.status === 'rejected' ? theme.statusDanger : theme.primary,
                }]}>
                  {selectedTimesheetDetail.status.charAt(0).toUpperCase() + selectedTimesheetDetail.status.slice(1)}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => {
                timesheetSheetRef.current?.dismiss();
                navigation.navigate('More', { screen: 'Timesheets' });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={16} color="#FFFFFF" style={styles.btnIcon} />
              <Text style={styles.sheetPrimaryBtnText}>View in Timesheets</Text>
            </TouchableOpacity>
          </View>
        )}
      </Sheet>

      {/* Task detail sheet */}
      <Sheet
        ref={taskSheetRef}
        title={taskDetail?.title}
        scrollable
        onDismiss={() => setTaskDetail(null)}
      >
        {taskDetailLoading ? (
          <View style={styles.sheetLoading}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <View style={styles.sheetBody}>
            {/* Meta row: project + due date + priority */}
            <View style={styles.taskMetaRow}>
              {taskDetail?.projectId && (
                <View style={[styles.taskMetaBadge, { backgroundColor: getProjectColor(taskDetail.projectId) + '25', borderColor: getProjectColor(taskDetail.projectId) + '50' }]}>
                  <View style={[styles.taskMetaDot, { backgroundColor: getProjectColor(taskDetail.projectId) }]} />
                  <Text style={[styles.taskMetaBadgeText, { color: theme.textPrimary }]} numberOfLines={1}>
                    {projects.find(p => p.id === taskDetail.projectId)?.name || 'Project'}
                  </Text>
                </View>
              )}
              {taskDetail?.dueDate && (
                <View style={[styles.taskMetaBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Ionicons name="calendar-outline" size={12} color={theme.textSecondary} style={styles.taskMetaIcon} />
                  <Text style={[styles.taskMetaBadgeText, { color: theme.textSecondary }]}>
                    {formatDateLabel(taskDetail.dueDate)}
                  </Text>
                </View>
              )}
              {taskDetail?.priority && taskDetail.priority !== 'low' && (
                <View style={[styles.taskMetaBadge, {
                  backgroundColor: taskDetail.priority === 'high' || taskDetail.priority === 'urgent' ? theme.statusDangerBg : taskDetail.priority === 'medium' ? theme.statusWarningBg : theme.card,
                  borderColor: taskDetail.priority === 'high' || taskDetail.priority === 'urgent' ? theme.statusDanger + '50' : taskDetail.priority === 'medium' ? theme.statusWarning + '50' : theme.border,
                }]}>
                  <Text style={[styles.taskMetaBadgeText, styles.capitalize, {
                    color: taskDetail.priority === 'high' || taskDetail.priority === 'urgent' ? theme.statusDanger : taskDetail.priority === 'medium' ? theme.statusWarning : theme.textSecondary,
                  }]}>
                    {taskDetail.priority}
                  </Text>
                </View>
              )}
            </View>

            {/* Notes */}
            {stripHtml(taskDetail?.contentText || taskDetail?.content) ? (
              <View style={styles.sheetBlock}>
                <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Notes</Text>
                <Text style={[styles.taskDescText, { color: theme.textPrimary, backgroundColor: theme.background, borderColor: theme.border }]}>
                  {stripHtml(taskDetail?.contentText || taskDetail?.content)}
                </Text>
              </View>
            ) : null}

            {/* Checklist items */}
            {taskDetail?.checklist && taskDetail.checklist.length > 0 ? (
              <View style={styles.sheetBlock}>
                <View style={styles.checklistHeader}>
                  <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Checklist</Text>
                  <Text style={[styles.taskMetaBadgeText, { color: theme.textSecondary }]}>
                    {taskDetail.checklist.filter(i => i.completed).length}/{taskDetail.checklist.length}
                  </Text>
                </View>
                {taskDetail.checklist.map((item, idx) => (
                  <Pressable
                    key={item.id || idx}
                    style={[styles.checklistRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                    onPress={() => handleChecklistItemToggle(idx)}
                  >
                    <View style={[styles.checklistBox, {
                      borderColor: item.completed ? theme.primary : theme.textMuted,
                      backgroundColor: item.completed ? theme.primary : 'transparent',
                    }]}>
                      {item.completed && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
                    </View>
                    <Text style={[styles.checklistItemText, {
                      color: item.completed ? theme.textMuted : theme.textPrimary,
                    }]}>
                      {item.text}
                    </Text>
                    {item.assigneeName ? (
                      <Text style={[styles.taskMetaBadgeText, styles.checklistAssignee, { color: theme.textSecondary }]} numberOfLines={1}>
                        {item.assigneeName.split(' ')[0]}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Linked checklist instance */}
            {taskDetail?.checklistInstanceName ? (
              <View style={styles.sheetBlock}>
                <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Linked Checklist</Text>
                <View style={[styles.checklistRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <Ionicons name="list-outline" size={16} color={theme.primary} style={styles.btnIcon} />
                  <Text style={[styles.checklistItemText, { color: theme.textPrimary }]}>{taskDetail.checklistInstanceName}</Text>
                </View>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.sheetActionsRow}>
              <TouchableOpacity
                style={[styles.sheetSecondaryBtn, {
                  backgroundColor: isComplete(taskDetail?.status) ? theme.card : theme.primaryLight,
                  borderColor: isComplete(taskDetail?.status) ? theme.border : theme.primary + '60',
                }]}
                onPress={handleTaskSheetToggleComplete}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isComplete(taskDetail?.status) ? 'refresh-outline' : 'checkmark-circle-outline'}
                  size={15}
                  color={isComplete(taskDetail?.status) ? theme.textSecondary : theme.primary}
                  style={styles.btnIcon}
                />
                <Text style={[styles.sheetSecondaryBtnText, { color: isComplete(taskDetail?.status) ? theme.textSecondary : theme.primary }]}>
                  {isComplete(taskDetail?.status) ? 'Mark Incomplete' : 'Mark Complete'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetPrimaryBtn, styles.sheetActionBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  taskSheetRef.current?.dismiss();
                  const tabNav = navigation.getParent<NativeStackNavigationProp<any>>();
                  (tabNav ?? navigation).navigate('More', { screen: 'Tasks', params: { openTaskId: taskDetail?.id } });
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={15} color="#FFFFFF" style={styles.btnIcon} />
                <Text style={styles.sheetPrimaryBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Sheet>

      {/* Schedule item detail sheet */}
      <Sheet
        ref={scheduleSheetRef}
        title={scheduleDetail?.name}
        onDismiss={() => setScheduleDetail(null)}
      >
        {scheduleDetail && (
          <View style={styles.sheetBody}>
            {/* Meta badges row */}
            <View style={styles.taskMetaRow}>
              {scheduleDetail.projectName && (
                <View style={[styles.taskMetaBadge, {
                  backgroundColor: getProjectColor(scheduleDetail.projectId) + '25',
                  borderColor: getProjectColor(scheduleDetail.projectId) + '50',
                }]}>
                  <View style={[styles.taskMetaDot, { backgroundColor: getProjectColor(scheduleDetail.projectId) }]} />
                  <Text style={[styles.taskMetaBadgeText, { color: theme.textPrimary }]} numberOfLines={1}>
                    {scheduleDetail.projectName}
                  </Text>
                </View>
              )}
              {scheduleDetail.type && (
                <View style={[styles.taskMetaBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.taskMetaBadgeText, styles.capitalize, { color: theme.textSecondary }]}>
                    {scheduleDetail.type}
                  </Text>
                </View>
              )}
              {scheduleDetail.status && (() => {
                const opt = scheduleStatusOptions.find(o => o.key === scheduleDetail.status);
                const sc = opt?.color || theme.textMuted;
                const label = opt?.name || scheduleDetail.status;
                return (
                  <View style={[styles.taskMetaBadge, { backgroundColor: sc + '25', borderColor: sc + '60' }]}>
                    <View style={[styles.taskMetaDot, { backgroundColor: sc }]} />
                    <Text style={[styles.taskMetaBadgeText, { color: sc }]}>{label}</Text>
                  </View>
                );
              })()}
            </View>

            {/* Date / Time */}
            <View style={[styles.detailRow, { borderColor: theme.border }]}>
              <Ionicons name="calendar-outline" size={16} color={theme.primary} />
              <View style={styles.detailBody}>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                  {formatDateLabel(scheduleDetail.startDate)}
                  {scheduleDetail.startDate !== scheduleDetail.endDate
                    ? ` → ${formatDateLabel(scheduleDetail.endDate)}`
                    : ''}
                </Text>
                {(scheduleDetail.startTime || scheduleDetail.endTime) && (
                  <Text style={[styles.detailSubtext, { color: theme.textSecondary }]}>
                    {scheduleDetail.startTime ? scheduleDetail.startTime.slice(0, 5) : ''}
                    {scheduleDetail.startTime && scheduleDetail.endTime ? ' – ' : ''}
                    {scheduleDetail.endTime ? scheduleDetail.endTime.slice(0, 5) : ''}
                  </Text>
                )}
              </View>
            </View>

            {/* Assigned To */}
            {scheduleDetail.assignedToName && (
              <View style={[styles.detailRow, { borderColor: theme.border }]}>
                <Ionicons name="person-outline" size={16} color={theme.primary} />
                <View style={styles.detailBody}>
                  <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                    {scheduleDetail.assignedToName}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => {
                scheduleSheetRef.current?.dismiss();
                const tabNav = navigation.getParent<NativeStackNavigationProp<any>>();
                (tabNav ?? navigation).navigate('More', {
                  screen: 'Schedule',
                  params: { projectId: scheduleDetail.projectId },
                });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={15} color="#FFFFFF" style={styles.btnIcon} />
              <Text style={styles.sheetPrimaryBtnText}>View in Schedule</Text>
            </TouchableOpacity>
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Greeting header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: metrics.workspace.contentTop,
    gap: space.rowGap,
  },
  headerWrap: { marginBottom: metrics.workspace.sectionGap },
  headerLeft: { flex: 1, gap: metrics.workspace.headerGap },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: metrics.pageHeader.actionGap, paddingTop: metrics.workspace.headerGap },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  bellBadge: { position: 'absolute', left: metrics.tabBar.icon - metrics.tabBar.badgeOffsetX, top: metrics.tabBar.badgeOffsetY },
  userMenuBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9 },
  userMenuDropdown: { position: 'absolute', right: space.screenX, top: metrics.workspace.menuTop, width: metrics.workspace.menuWidth, zIndex: 10 },
  // Body
  skeletonBody: { paddingTop: metrics.workspace.sectionGap, gap: metrics.workspace.captureGap },
  skeletonChips: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: metrics.workspace.sectionGap },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: space.screenX,
    paddingBottom: space.screenBottom,
  },
  section: { marginBottom: metrics.workspace.sectionGap },
  // Wide-only: row-wrap container; every child needs an explicit width.
  scrollContentWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', paddingHorizontal: space.screenX - space.inline },
  sectionFull: { width: '100%', paddingHorizontal: space.inline },
  sectionHalf: { width: '50%', paddingHorizontal: space.inline },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.workspace.clockGap },
  clockBody: { flex: 1, gap: metrics.listRow.bodyGap },
  clockLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  pulsingDot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
  clockOutBtn: { borderRadius: radii.lg, paddingHorizontal: space.cardX, minHeight: metrics.actionBar.buttonHeight, justifyContent: 'center' },
  completedToggle: { flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.toggleGap, paddingVertical: metrics.workspace.row.padY },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.workspace.activityRow.gap, paddingVertical: metrics.workspace.activityRow.padY },
  // Sheets
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  sheetLoading: {
    padding: 32,
    alignItems: 'center',
  },
  sheetBlock: {
    gap: 6,
  },
  sheetLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clockOutSummary: {
    borderRadius: radius.xl,
    padding: 14,
    gap: 2,
  },
  clockOutProject: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  clockOutElapsed: {
    fontSize: fontSize.bodySm,
  },
  breakChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  breakChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  breakChipText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  destructiveBtn: {
    height: 48,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  destructiveBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailBody: {
    flex: 1,
    marginLeft: 10,
  },
  detailLabel: {
    fontSize: fontSize.table,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  detailSubtext: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: fontSize.table,
    fontWeight: fontWeight.semibold,
  },
  sheetPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.xl,
    marginTop: 4,
  },
  sheetPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  sheetSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  sheetSecondaryBtnText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sheetActionBtn: {
    flex: 1,
    marginTop: 0,
  },
  btnIcon: {
    marginRight: 6,
  },
  // Task sheet meta
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  taskMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  taskMetaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  taskMetaIcon: {
    marginRight: 4,
  },
  taskMetaBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  capitalize: {
    textTransform: 'capitalize',
  },
  taskDescText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  checklistBox: {
    width: 18,
    height: 18,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  checklistItemText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  checklistAssignee: {
    marginLeft: 8,
  },
});
