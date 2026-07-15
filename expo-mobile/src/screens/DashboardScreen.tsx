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
  FlatList,
  Pressable,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { getCached, setCached, clearCache } from '../services/cache';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { Skeleton, SkeletonRow } from '../components/ui/Skeleton';
import { PressableScale } from '../components/ui/PressableScale';
import { SectionHeader } from '../components/ui/SectionHeader';
import { ProgressRing } from '../components/ui/ProgressRing';
import { haptic } from '../lib/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compareProjects } from '../lib/projects';
import { SuggestionSheet } from '../components/more/SuggestionSheet';
import { getInitials, timeAgo } from '../lib/format';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, fontSize, fontWeight, radius, projectColors, typeColors, type Theme } from '../theme';

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

/** Server weather iconKey → Ionicons name. */
const weatherIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny-outline',
  'partly-cloudy': 'partly-sunny-outline',
  cloudy: 'cloud-outline',
  fog: 'cloud-outline',
  rain: 'rainy-outline',
  thunderstorm: 'thunderstorm-outline',
  snow: 'snow-outline',
};

/** 0-23 → "12am" / "2pm". */
function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

const PROJECT_CARD_WIDTH = 124;
const H_CARD_WIDTH = 260;
const CARD_GAP = 10;
const BREAK_OPTIONS = [0, 15, 30, 45, 60, 90, 120];

function breakLabel(mins: number): string {
  if (mins === 0) return 'None';
  if (mins < 60) return `${mins}m`;
  return mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** White pulsing dot on the live clocked-in card. */
function PulsingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulsingDot, style]} />;
}

/** Circular checkbox with a spring scale pop on toggle. */
function TaskCheckbox({ done, onToggle, theme }: { done: boolean; onToggle: () => void; theme: Theme }) {
  const scale = useSharedValue(1);
  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.8, { damping: 15, stiffness: 400 }),
      withSpring(1, { damping: 15, stiffness: 400 }),
    );
    onToggle();
  };
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable onPress={handlePress} hitSlop={10}>
      <Animated.View
        style={[
          styles.taskCheckbox,
          {
            borderColor: done ? theme.statusSuccess : theme.borderStrong,
            backgroundColor: done ? theme.statusSuccess : 'transparent',
          },
          animatedStyle,
        ]}
      >
        {done && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
      </Animated.View>
    </Pressable>
  );
}

export default function DashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const toast = useToast();

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
  // Project row: same order as the Projects list, windowed 8 at a time.
  const [projectRowLimit, setProjectRowLimit] = useState(8);
  const sortedProjects = useMemo(() => [...projects].sort(compareProjects), [projects]);
  const projectRowData = useMemo(
    () => [...sortedProjects.slice(0, projectRowLimit), { id: '__all__' } as any],
    [sortedProjects, projectRowLimit],
  );
  const loadMoreProjectCards = useCallback(() => {
    setProjectRowLimit((limit) =>
      limit < sortedProjects.length ? Math.min(limit + 8, sortedProjects.length) : limit,
    );
  }, [sortedProjects.length]);
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
    const tabNav = navigation.getParent() ?? navigation;
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
      });
      setActiveTimesheet(null);
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

  // ── Section renderers ────────────────────────────────────────────────────

  const renderProjectCard = ({ item }: { item: Project | { id: '__all__' } }) => {
    if (item.id === '__all__') {
      return (
        <PressableScale
          haptics
          onPress={() => navigation.getParent()?.navigate('Projects')}
          style={[styles.projectCard, styles.allProjectsCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Text style={[styles.allProjectsText, { color: theme.textSecondary }]}>All projects</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </PressableScale>
      );
    }
    const p = item as Project;
    const color = p.color || getProjectColor(p.id);
    const phase = prettify(p.projectSubStatus, subStatusLabels) || prettify(p.currentSystemPhase, phaseLabels) || '';
    return (
      <PressableScale
        haptics
        onPress={() => navigation.getParent()?.navigate('Projects', {
          screen: 'ProjectDetail',
          params: { projectId: p.id, projectName: p.name },
        })}
        style={[styles.projectCard, { backgroundColor: theme.card, borderColor: color + '55', borderWidth: 1 }]}
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color + '33' }]} />
        <View style={styles.projectCardTop}>
          <View style={[styles.projectDot, { backgroundColor: color }]} />
        </View>
        <Text style={[styles.projectName, { color: theme.textPrimary }]} numberOfLines={2}>{p.name}</Text>
        {!!phase && (
          <View style={[styles.phaseChip, { backgroundColor: theme.background }]}>
            <Text style={[styles.phaseChipText, { color: theme.textSecondary }]} numberOfLines={1}>{phase}</Text>
          </View>
        )}
      </PressableScale>
    );
  };

  const renderTaskRow = (task: Task, index: number) => {
    const done = isComplete(task.status);
    return (
      <View
        key={task.id}
        style={[styles.taskRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
      >
        <TaskCheckbox done={done} onToggle={() => toggleTaskComplete(task.id, task.status)} theme={theme} />
        <Pressable style={styles.taskRowBody} onPress={() => openTaskSheet(task)}>
          <Text style={[styles.taskRowTitle, { color: done ? theme.textMuted : theme.textPrimary }]} numberOfLines={2}>
            {task.title}
          </Text>
        </Pressable>
        <View style={[styles.taskRowDot, { backgroundColor: getProjectColor(task.projectId) }]} />
      </View>
    );
  };

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
    ? costCodes.find(c => c.id === activeTimesheet.costCodeId)
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerContext, { color: theme.textSecondary }]} numberOfLines={1}>
            {contextLine}
          </Text>
          <Text style={[styles.headerName, { color: theme.textPrimary }]} numberOfLines={1}>
            {firstName || fullDisplayName}
          </Text>
          {weather && (
            <View style={styles.weatherRow}>
              <Ionicons
                name={weatherIcons[weather.iconKey] || 'partly-sunny-outline'}
                size={13}
                color={theme.textSecondary}
              />
              <Text style={[styles.weatherText, { color: theme.textSecondary }]} numberOfLines={1}>
                {weather.tempMax}° · {weather.description} at{' '}
                {projects.find(p => p.id === weatherProjectId)?.name || weather.locationName}
                {weather.rainFromHour !== null ? ` · rain from ${formatHour(weather.rainFromHour)}` : ''}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            style={styles.headerIconBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={22} color={theme.textPrimary} />
            {unreadCount > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: theme.statusDanger }]}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowUserMenu(v => !v)}
            style={[styles.headerAvatar, { backgroundColor: theme.primary }]}
            activeOpacity={0.7}
          >
            <Text style={styles.headerAvatarText}>{getInitials(fullDisplayName)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showUserMenu && (
        <Pressable style={styles.userMenuBackdrop} onPress={() => setShowUserMenu(false)} />
      )}
      {showUserMenu && (
        <View style={[styles.userMenuDropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.userMenuItem, { borderBottomColor: theme.border }]}
            onPress={() => { setShowUserMenu(false); navigation.navigate('BusinessDashboard'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="business-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.userMenuText, { color: theme.textPrimary }]}>Company Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.userMenuItem, { borderBottomColor: theme.border }]}
            onPress={() => { setShowUserMenu(false); navigation.getParent()?.navigate('More', { screen: 'Settings' }); }}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.userMenuText, { color: theme.textPrimary }]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.userMenuItem, { borderBottomColor: theme.border }]}
            onPress={() => { setShowUserMenu(false); suggestionSheetRef.current?.present(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="bulb-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.userMenuText, { color: theme.textPrimary }]}>Suggest an Idea</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.userMenuItem}
            onPress={() => { setShowUserMenu(false); logout(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={18} color={theme.statusDanger} />
            <Text style={[styles.userMenuText, { color: theme.statusDanger }]}>Log Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {isFirstLoad ? (
        /* First-ever load (no cached data): skeleton layout */
        <View style={styles.skeletonBody}>
          <View style={styles.skeletonCardRow}>
            <Skeleton width={PROJECT_CARD_WIDTH} height={148} borderRadius={radius.xxl} />
            <Skeleton width={PROJECT_CARD_WIDTH} height={148} borderRadius={radius.xxl} />
            <Skeleton width={PROJECT_CARD_WIDTH} height={148} borderRadius={radius.xxl} />
          </View>
          <Skeleton width={120} height={14} style={styles.skeletonHeader} />
          <View style={[styles.skeletonGroupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {/* Live clocked-in timer card */}
          {activeTimesheet && (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.section}>
              <View style={[styles.timerCard, { backgroundColor: theme.primary }]}>
                <View style={styles.timerCardLeft}>
                  <View style={styles.timerLabelRow}>
                    <PulsingDot />
                    <Text style={styles.timerLabel}>CLOCKED IN</Text>
                  </View>
                  <Text style={styles.timerElapsed}>{formatTimeSince(activeTimesheet.clockInTime)}</Text>
                  <Text style={styles.timerMeta} numberOfLines={1}>
                    {activeTimesheet.projectName || getProjectName(activeTimesheet.projectId)}
                  </Text>
                  {!!activeCostCode && (
                    <Text style={styles.timerMeta} numberOfLines={1}>
                      {activeCostCode.code} - {activeCostCode.title}
                    </Text>
                  )}
                </View>
                <PressableScale
                  haptics
                  onPress={openClockOutSheet}
                  disabled={clockingOut}
                  style={styles.clockOutPill}
                >
                  <Text style={[styles.clockOutPillText, { color: theme.primary }]}>Clock Out</Text>
                </PressableScale>
              </View>
            </Animated.View>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.section}>
              <SectionHeader
                title="Projects"
                count={projects.length}
                onPress={() => navigation.getParent()?.navigate('Projects')}
              />
              <FlatList
                horizontal
                data={projectRowData}
                keyExtractor={item => item.id}
                renderItem={renderProjectCard}
                showsHorizontalScrollIndicator={false}
                snapToInterval={PROJECT_CARD_WIDTH + CARD_GAP}
                decelerationRate="fast"
                contentContainerStyle={styles.hListContent}
                onEndReached={loadMoreProjectCards}
                onEndReachedThreshold={0.5}
              />
            </Animated.View>
          )}

          {/* Today's Tasks */}
          <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.section} layout={LinearTransition.duration(200)}>
            <SectionHeader
              title="Today's Tasks"
              right={todayTasks.length > 0 ? (
                <View style={styles.taskProgressWrap}>
                  <ProgressRing progress={completedTasks.length / todayTasks.length} />
                  <Text style={[styles.taskProgressText, { color: theme.textSecondary }]}>
                    {completedTasks.length}/{todayTasks.length}
                  </Text>
                </View>
              ) : undefined}
            />
            {todayTasks.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="checkmark-circle-outline" size={22} color={theme.textMuted} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No tasks due today</Text>
              </View>
            ) : (
              <Animated.View
                layout={LinearTransition.duration(200)}
                style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                {incompleteTasks.map((task, i) => renderTaskRow(task, i))}
                {completedTasks.length > 0 && (
                  <>
                    <Pressable
                      onPress={() => { haptic.select(); setCompletedExpanded(v => !v); }}
                      style={[
                        styles.completedToggleRow,
                        incompleteTasks.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                      ]}
                    >
                      <Text style={[styles.completedToggleText, { color: theme.textSecondary }]}>
                        Completed ({completedTasks.length})
                      </Text>
                      <Ionicons
                        name={completedExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={theme.textMuted}
                      />
                    </Pressable>
                    {completedExpanded && (
                      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
                        {completedTasks.map(task => renderTaskRow(task, 1))}
                      </Animated.View>
                    )}
                  </>
                )}
              </Animated.View>
            )}
          </Animated.View>

          {/* Timesheets */}
          <Animated.View entering={FadeInDown.duration(300).delay(180)} style={styles.section}>
            <SectionHeader
              title="Timesheets"
              count={recentTimesheets.length}
              onPress={() => navigation.navigate('Timesheets')}
            />
            {recentTimesheets.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="time-outline" size={22} color={theme.textMuted} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No recent timesheets</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                data={recentTimesheets}
                keyExtractor={ts => ts.id}
                showsHorizontalScrollIndicator={false}
                snapToInterval={H_CARD_WIDTH + CARD_GAP}
                decelerationRate="fast"
                contentContainerStyle={styles.hListContent}
                renderItem={({ item: ts }) => {
                  const ccId = ts.costCodeId || ts.costCodeSplits?.[0]?.costCodeId;
                  return (
                    <PressableScale
                      haptics
                      onPress={() => openTimesheetSheet(ts)}
                      style={[styles.hCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                    >
                      <View style={[styles.accentBar, { backgroundColor: theme.amber }]} />
                      <View style={styles.hCardBody}>
                        <Text style={[styles.hCardTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                          {getProjectName(ts.projectId)}
                        </Text>
                        <Text style={[styles.hCardSub, { color: theme.textSecondary }]} numberOfLines={1}>
                          {ccId ? getCostCodeLabel(ccId) : '—'}
                        </Text>
                        <Text style={[styles.hCardMeta, { color: theme.textMuted }]}>
                          {formatDateLabel(ts.date)}
                        </Text>
                      </View>
                      <View style={[styles.hoursPill, { backgroundColor: theme.primaryLight }]}>
                        <Text style={[styles.hoursPillText, { color: theme.primary }]}>
                          {parseFloat(ts.duration).toFixed(1)}h
                        </Text>
                      </View>
                    </PressableScale>
                  );
                }}
              />
            )}
          </Animated.View>

          {/* Schedule */}
          <Animated.View entering={FadeInDown.duration(300).delay(240)} style={styles.section}>
            <SectionHeader
              title="Schedule"
              count={upcomingSchedule.length}
              onPress={() => (navigation.getParent() ?? navigation).navigate('More', { screen: 'Schedule' })}
            />
            {upcomingSchedule.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="calendar-outline" size={22} color={theme.textMuted} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No upcoming schedule items</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                data={upcomingSchedule}
                keyExtractor={({ item }) => item.id}
                showsHorizontalScrollIndicator={false}
                snapToInterval={H_CARD_WIDTH + CARD_GAP}
                decelerationRate="fast"
                contentContainerStyle={styles.hListContent}
                renderItem={({ item: { item, isTomorrow } }) => (
                  <PressableScale
                    haptics
                    onPress={() => openScheduleSheet(item)}
                    style={[styles.hCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                  >
                    <View style={[styles.accentBar, { backgroundColor: typeColors[item.type as keyof typeof typeColors] || theme.primary }]} />
                    <View style={styles.hCardBody}>
                      <Text style={[styles.hCardTitle, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      {!!item.projectName && (
                        <Text style={[styles.hCardSub, { color: theme.textSecondary }]} numberOfLines={1}>{item.projectName}</Text>
                      )}
                      <Text style={[styles.hCardMeta, { color: theme.textMuted }]}>
                        {isTomorrow ? 'Tomorrow' : 'Today'}
                        {item.startTime ? ` · ${item.startTime.slice(0, 5)}` : ''}
                      </Text>
                    </View>
                  </PressableScale>
                )}
              />
            )}
          </Animated.View>

          {/* Unread mentions digest */}
          {mentions.length > 0 && (
            <Animated.View entering={FadeInDown.duration(300).delay(270)} style={styles.section}>
              <PressableScale
                haptics
                onPress={openMentions}
                style={[styles.mentionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={[styles.mentionIconCircle, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="at" size={16} color={theme.primary} />
                </View>
                <Text style={[styles.mentionText, { color: theme.textPrimary }]} numberOfLines={1}>
                  {mentions[0].title.replace(/#/g, '')}
                  {mentions.length > 1 && (
                    <Text style={{ color: theme.textSecondary }}> · {mentions.length - 1} more</Text>
                  )}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </PressableScale>
            </Animated.View>
          )}

          {/* Recent Activity */}
          <Animated.View entering={FadeInDown.duration(300).delay(300)} style={styles.section}>
            <SectionHeader
              title="Recent Activity"
              count={recentActivities.length}
              right={
                <Pressable hitSlop={10} onPress={toggleActivityCollapsed}>
                  <Ionicons
                    name={activityCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={16}
                    color={theme.textMuted}
                  />
                </Pressable>
              }
            />
            {activityCollapsed ? null : recentActivities.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="pulse-outline" size={22} color={theme.textMuted} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No recent activity</Text>
              </View>
            ) : (
              <View style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {recentActivities.map((activity, i) => {
                  const projColor = activity.projectId ? getProjectColor(activity.projectId) : theme.primary;
                  const userName = activity.userName || 'System';
                  return (
                    <View
                      key={activity.id}
                      style={[styles.activityRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
                    >
                      <View style={[styles.activityAvatar, { backgroundColor: projColor }]}>
                        <Text style={styles.activityAvatarText}>{getInitials(userName)}</Text>
                      </View>
                      <View style={styles.activityBody}>
                        <Text style={[styles.activityName, { color: theme.textPrimary }]} numberOfLines={1}>
                          {userName}
                        </Text>
                        <Text style={[styles.activityDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                          {activity.description}
                        </Text>
                      </View>
                      <Text style={[styles.activityTime, { color: theme.textMuted }]}>
                        {timeAgo(activity.createdAt)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
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
            style={[styles.destructiveBtn, { backgroundColor: theme.statusDanger }]}
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
                navigation.navigate('Timesheets');
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
                  const tabNav = navigation.getParent();
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
                const tabNav = navigation.getParent();
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
  container: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerContext: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  headerName: {
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  weatherText: {
    flexShrink: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  headerIconBtn: {
    padding: 4,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.data,
    fontWeight: fontWeight.bold,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  userMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
    elevation: 9,
  },
  userMenuDropdown: {
    position: 'absolute',
    top: 108,
    right: 20,
    borderRadius: radius.xl,
    borderWidth: 1,
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    minWidth: 180,
  },
  userMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userMenuText: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.medium,
  },
  // Skeleton first load
  skeletonBody: {
    paddingTop: 8,
  },
  skeletonCardRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  skeletonHeader: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  skeletonGroupCard: {
    marginHorizontal: 20,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 18,
  },
  // Scroll layout
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  hListContent: {
    paddingHorizontal: 20,
    gap: CARD_GAP,
  },
  emptyCard: {
    marginHorizontal: 20,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },
  // Live clocked-in timer card
  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    borderRadius: radius.xxl,
    padding: 16,
    gap: 12,
  },
  timerCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  timerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  timerLabel: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.8)',
  },
  timerElapsed: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  timerMeta: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  clockOutPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  clockOutPillText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  // Project cards
  projectCard: {
    width: PROJECT_CARD_WIDTH,
    height: 108,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    overflow: 'hidden',
  },
  projectCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  projectDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  projectName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: 19,
  },
  phaseChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 'auto',
  },
  phaseChipText: {
    fontSize: fontSize.xxs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  allProjectsCard: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  allProjectsText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // Today's tasks grouped card
  taskProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskProgressText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  groupCard: {
    marginHorizontal: 20,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskRowBody: {
    flex: 1,
    minWidth: 0,
  },
  taskRowTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  taskRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  completedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  completedToggleText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  // Horizontal cards (timesheets + schedule)
  hCard: {
    width: H_CARD_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  hCardBody: {
    flex: 1,
    minWidth: 0,
  },
  hCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  hCardSub: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  hCardMeta: {
    fontSize: fontSize.xs,
    marginTop: 4,
  },
  hoursPill: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hoursPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  // Mentions digest card
  mentionCard: {
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  mentionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  // Recent activity
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  activityAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityAvatarText: {
    color: '#FFFFFF',
    fontSize: fontSize.table,
    fontWeight: fontWeight.bold,
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
  },
  activityName: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.bold,
  },
  activityDesc: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  activityTime: {
    fontSize: fontSize.data,
    fontWeight: fontWeight.medium,
  },
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
