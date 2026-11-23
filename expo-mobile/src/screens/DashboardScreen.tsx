import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { getCached, setCached, clearCache } from '../services/cache';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { Skeleton, SkeletonRow } from '../components/ui/Skeleton';
import { haptic } from '../lib/haptics';
import { useLayout } from '../lib/useLayout';
import { usePersistedState } from '../lib/usePersistedState';
import { compareProjects } from '../lib/projects';
import { SuggestionSheet } from '../components/more/SuggestionSheet';
import { QuickCaptureRow } from '../components/home/QuickCaptureRow';
import { clockedOutOnThisPhone } from '../services/liveActivity';
import { refreshWidgetSnapshot } from '../services/widgetSnapshot';
import { getInitials, timeAgo, compactAgo } from '../lib/format';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, useColors, projectColors, metrics, radii, size, space, tabular, type, fonts } from '../theme';
import {
  Activity, AtSign, Bell, Building, ChevronDown, ChevronRight, CircleCheck, Clock, Folder, Lightbulb, LogOut, Pencil, RotateCcw, Settings,
} from 'lucide-react-native';
import {
  Avatar, ButtonRow, Card, Checkbox, Divider, FieldLabel, ListRow, PrimaryButton, ProjectSquare, PropertyRow, SecondaryButton, SheetBody,
  UnreadBadge, fallbackProjectColor, initialsOf,
} from '../components/kit';
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
  const [completedExpanded, setCompletedExpanded] = usePersistedState<boolean>('workspace.completedExpanded', false);
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
  const [mentions, setMentions] = useState<MentionNotification[]>([]);
  const [scheduleStatusOptions, setScheduleStatusOptions] = useState<{ key: string; name: string; color: string }[]>([]);
  const [phaseLabels, setPhaseLabels] = useState<Record<string, string>>({});
  const [subStatusLabels, setSubStatusLabels] = useState<Record<string, string>>({});

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

  const getProjectName = (pid?: string, known?: string | null) => {
    if (!pid) return 'No project';
    const p = projects.find(pr => pr.id === pid);
    if (!p) return known || 'Project';
    return p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name;
  };

  const getCostCodeLabel = (ccId: string) => {
    const cc = costCodes.find(c => c.id === ccId);
    return cc ? `${cc.code} - ${cc.title}` : null;
  };

  const getProjectColor = (projectId?: string): string => {
    // Same fallback as Projects and Project detail, so a project without a
    // colour gets one consistent square everywhere.
    if (!projectId) return companySettings?.brandColor || projectColors[0];
    const project = projects.find(p => p.id === projectId);
    return project?.color || fallbackProjectColor(projectId);
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
                      onPress={() => { haptic.select(); setCompletedExpanded(!completedExpanded); }}
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
          {(
            <Animated.View entering={FadeInDown.duration(300).delay(120)} style={[styles.section, halfW]}>
              <WorkspaceSection
                id="projects"
                icon={Folder}
                title="Projects"
                count={workspaceProjects.length}
                onOpen={() => tabNav.navigate('Projects')}
              >
                {workspaceProjects.length === 0 ? (
                  <EmptyLine>No projects yet</EmptyLine>
                ) : (
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
                )}
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
                        title={getProjectName(ts.projectId, ts.projectName)}
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
                        <Text style={[type.meta, tabular, { color: c.mutedStrong }]}>{compactAgo(activity.createdAt)}</Text>
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
        <SheetBody>
          {activeTimesheet ? (
            <Card variant="list">
              <PropertyRow key="project" label="Project" value={activeTimesheet.projectName || getProjectName(activeTimesheet.projectId)} />
              <PropertyRow key="since" label="Clocked in" value={`for ${formatTimeSince(activeTimesheet.clockInTime)}`} />
            </Card>
          ) : null}
          <View style={wx.group}>
            <FieldLabel>Break</FieldLabel>
            <View style={wx.chips}>
              {BREAK_OPTIONS.map(mins => {
                const selected = breakMinutes === mins;
                return (
                  <Pressable
                    key={mins}
                    onPress={() => { haptic.select(); setBreakMinutes(mins); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      wx.chip,
                      { backgroundColor: selected ? c.tint : c.surface, borderColor: selected ? c.accent : c.border, opacity: pressed ? metrics.pressedOpacity : 1 },
                    ]}
                  >
                    <Text style={[type.meta, tabular, { color: selected ? c.link : c.text }]}>{breakLabel(mins)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <ButtonRow>
            <PrimaryButton label="Clock out" onPress={confirmClockOut} loading={clockingOut} />
          </ButtonRow>
        </SheetBody>
      </Sheet>

      {/* Timesheet detail sheet */}
      <Sheet ref={timesheetSheetRef} title="Timesheet" onDismiss={() => setSelectedTimesheetDetail(null)}>
        {selectedTimesheetDetail ? (() => {
          const ts = selectedTimesheetDetail;
          const ccId = ts.costCodeId || ts.costCodeSplits?.[0]?.costCodeId;
          const cc = ccId ? getCostCodeLabel(ccId) : null;
          const st = ts.status;
          const dotColor = st === 'approved' ? c.status.done : st === 'submitted' ? c.status.sent : st === 'rejected' ? c.danger : c.status.upcoming;
          return (
            <SheetBody>
              <Card variant="list">
                <PropertyRow key="date" label="Date" value={formatDateLabel(ts.date)} />
                <PropertyRow key="project" label="Project" value={getProjectName(ts.projectId, ts.projectName)} />
                <PropertyRow key="hours" label="Hours">
                  <Text style={[type.body, tabular, { color: c.text }]}>
                    {`${parseFloat(ts.duration).toFixed(2)}h${ts.startTime && ts.endTime ? `  ·  ${ts.startTime} – ${ts.endTime}` : ''}`}
                  </Text>
                </PropertyRow>
                {cc ? <PropertyRow key="cc" label="Cost code" value={cc} /> : null}
                <PropertyRow key="status" label="Status">
                  <View style={wx.status}>
                    <View style={[wx.dot, { backgroundColor: dotColor }]} />
                    <Text style={[type.body, { color: st === 'rejected' ? c.danger : c.text }]}>{st.charAt(0).toUpperCase() + st.slice(1)}</Text>
                  </View>
                </PropertyRow>
              </Card>
              <ButtonRow>
                <SecondaryButton
                  label="View in Timesheets"
                  onPress={() => {
                    timesheetSheetRef.current?.dismiss();
                    navigation.navigate('More', { screen: 'Timesheets' });
                  }}
                />
              </ButtonRow>
            </SheetBody>
          );
        })() : null}
      </Sheet>

      {/* Task detail sheet */}
      <Sheet ref={taskSheetRef} scrollable onDismiss={() => setTaskDetail(null)}>
        {taskDetailLoading ? (
          <View style={wx.loading}>
            <ActivityIndicator size="large" color={c.accent} />
          </View>
        ) : taskDetail ? (
          <SheetBody>
            <View style={wx.titleBlock}>
              {taskDetail.projectId ? (
                <View style={wx.kind}>
                  <ProjectSquare color={getProjectColor(taskDetail.projectId)} fallbackKey={taskDetail.projectId} size="header" />
                  <Text style={[type.meta, wx.shrink, { color: c.muted }]} numberOfLines={1}>
                    {projects.find(p => p.id === taskDetail.projectId)?.name || 'Project'}
                  </Text>
                </View>
              ) : null}
              <Text style={[type.headingSemi, { color: c.text }]}>{taskDetail.title}</Text>
              {(taskDetail.dueDate || (taskDetail.priority && taskDetail.priority !== 'low')) ? (
                <Text style={[type.meta, { color: c.muted }]}>
                  {[
                    taskDetail.dueDate ? `Due ${formatDateLabel(taskDetail.dueDate)}` : null,
                    taskDetail.priority && taskDetail.priority !== 'low'
                      ? `${taskDetail.priority.charAt(0).toUpperCase()}${taskDetail.priority.slice(1)} priority`
                      : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>

            {stripHtml(taskDetail.contentText || taskDetail.content) ? (
              <View style={wx.group}>
                <FieldLabel>Notes</FieldLabel>
                <Card variant="notes">
                  <Text style={[type.bodyRead, { color: c.textLong }]}>{stripHtml(taskDetail.contentText || taskDetail.content)}</Text>
                </Card>
              </View>
            ) : null}

            {taskDetail.checklist && taskDetail.checklist.length > 0 ? (
              <View style={wx.group}>
                <View style={wx.labelRow}>
                  <FieldLabel>Checklist</FieldLabel>
                  <Text style={[type.meta, tabular, { color: c.muted }]}>
                    {`${taskDetail.checklist.filter(i => i.completed).length}/${taskDetail.checklist.length}`}
                  </Text>
                </View>
                <Card variant="list">
                  {taskDetail.checklist.map((item, idx) => (
                    <Pressable
                      key={item.id || idx}
                      style={({ pressed }) => [wx.itemRow, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
                      onPress={() => handleChecklistItemToggle(idx)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!item.completed }}
                    >
                      <Checkbox checked={!!item.completed} accessibilityLabel={item.text} />
                      <Text style={[type.rowTitle, wx.flex, { color: item.completed ? c.muted : c.text }, item.completed && wx.strike]}>{item.text}</Text>
                      {item.assigneeName ? (
                        <Text style={[type.caption, { color: c.muted }]}>{initialsOf(item.assigneeName)}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </Card>
              </View>
            ) : null}

            {taskDetail.checklistInstanceName ? (
              <Card variant="list">
                <PropertyRow key="linked" label="Checklist" value={taskDetail.checklistInstanceName} />
              </Card>
            ) : null}

            <ButtonRow>
              <SecondaryButton
                label={isComplete(taskDetail.status) ? 'Mark incomplete' : 'Mark complete'}
                icon={isComplete(taskDetail.status) ? RotateCcw : CircleCheck}
                onPress={handleTaskSheetToggleComplete}
              />
              <PrimaryButton
                label="Edit"
                icon={Pencil}
                onPress={() => {
                  taskSheetRef.current?.dismiss();
                  const tabNav = navigation.getParent<NativeStackNavigationProp<any>>();
                  (tabNav ?? navigation).navigate('More', { screen: 'Tasks', params: { openTaskId: taskDetail.id } });
                }}
              />
            </ButtonRow>
          </SheetBody>
        ) : null}
      </Sheet>

      {/* Schedule item detail sheet */}
      <Sheet ref={scheduleSheetRef} onDismiss={() => setScheduleDetail(null)}>
        {scheduleDetail ? (() => {
          const opt = scheduleStatusOptions.find(o => o.key === scheduleDetail.status);
          const dates = `${formatDateLabel(scheduleDetail.startDate)}${scheduleDetail.startDate !== scheduleDetail.endDate ? ` – ${formatDateLabel(scheduleDetail.endDate)}` : ''}`;
          const times = [scheduleDetail.startTime?.slice(0, 5), scheduleDetail.endTime?.slice(0, 5)].filter(Boolean).join(' – ');
          return (
            <SheetBody>
              <View style={wx.titleBlock}>
                <View style={wx.kind}>
                  {scheduleDetail.type ? (
                    <Text style={[type.meta, { color: c.muted }]}>{scheduleDetail.type.charAt(0).toUpperCase() + scheduleDetail.type.slice(1)}</Text>
                  ) : null}
                  {scheduleDetail.projectName ? (
                    <>
                      {scheduleDetail.type ? <Text style={[type.meta, { color: c.faint }]}>·</Text> : null}
                      <ProjectSquare color={getProjectColor(scheduleDetail.projectId)} fallbackKey={scheduleDetail.projectId} size="header" />
                      <Text style={[type.meta, wx.shrink, { color: c.muted }]} numberOfLines={1}>{scheduleDetail.projectName}</Text>
                    </>
                  ) : null}
                </View>
                <Text style={[type.headingSemi, { color: c.text }]}>{scheduleDetail.name}</Text>
                {scheduleDetail.status ? (
                  <View style={wx.status}>
                    <View style={[wx.dot, { backgroundColor: opt?.color || c.status.upcoming }]} />
                    <Text style={[type.meta, { color: c.muted }]}>{opt?.name || scheduleDetail.status}</Text>
                  </View>
                ) : null}
              </View>
              <Card variant="list">
                <PropertyRow key="dates" label="Dates" value={dates} />
                {times ? <PropertyRow key="times" label="Time" value={times} /> : null}
                {scheduleDetail.assignedToName ? <PropertyRow key="assigned" label="Assigned" value={scheduleDetail.assignedToName} /> : null}
              </Card>
              <ButtonRow>
                <SecondaryButton
                  label="View in Schedule"
                  onPress={() => {
                    scheduleSheetRef.current?.dismiss();
                    const tabNav = navigation.getParent<NativeStackNavigationProp<any>>();
                    (tabNav ?? navigation).navigate('More', { screen: 'Schedule', params: { projectId: scheduleDetail.projectId } });
                  }}
                />
              </ButtonRow>
            </SheetBody>
          );
        })() : null}
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
});

const wx = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  loading: { paddingVertical: space.screenBottom * 2, alignItems: 'center' },
  group: { gap: metrics.form.labelGap },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBlock: { gap: metrics.form.labelGap },
  kind: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  status: { flexDirection: 'row', alignItems: 'center', gap: metrics.statusDot.gap },
  dot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inline },
  chip: { paddingHorizontal: metrics.filterChip.padX, paddingVertical: metrics.filterChip.padY, borderRadius: radii.pill, borderWidth: size.border },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowGap, paddingVertical: metrics.listRow.padY },
  strike: { textDecorationLine: 'line-through' },
});
