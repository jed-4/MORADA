import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { setCached, clearCache } from '../services/cache';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme';
interface Project {
  id: string;
  name: string;
  projectNumber?: string;
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

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function DashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [activeTimesheet, setActiveTimesheet] = useState<ActiveTimesheet | null>(null);
  const [recentTimesheets, setRecentTimesheets] = useState<TimesheetEntry[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [timesheetsCollapsed, setTimesheetsCollapsed] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [clockInProjectId, setClockInProjectId] = useState('');
  const [clockInCostCodeId, setClockInCostCodeId] = useState('');
  const [clockInDescription, setClockInDescription] = useState('');
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [clockingIn, setClockingIn] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showCostCodePicker, setShowCostCodePicker] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [selectedBreakMinutes, setSelectedBreakMinutes] = useState(0);
  const [selectedTimesheetDetail, setSelectedTimesheetDetail] = useState<TimesheetEntry | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDetail, setScheduleDetail] = useState<ScheduleItem | null>(null);
  const [scheduleStatusOptions, setScheduleStatusOptions] = useState<{ key: string; name: string; color: string }[]>([]);
  const [phaseLabels, setPhaseLabels] = useState<Record<string, string>>({});
  const [subStatusLabels, setSubStatusLabels] = useState<Record<string, string>>({});

  const theme = useTheme();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
    cardHover: theme.subtle,
    topBar: theme.background,
    topBarText: theme.textPrimary,
    sectionLabel: theme.textMuted,
};

  const fetchData = useCallback(async (forceRefresh = false) => {
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
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setActiveTimesheet(data.activeTimesheet || null);
      setRecentActivities(data.activities || []);
      setRecentTimesheets(data.recentTimesheets || []);
      setScheduleItems(data.scheduleItems || []);
      if (statusData?.options?.length) {
        setScheduleStatusOptions(
          statusData.options
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(o => ({ key: o.key, name: o.name, color: o.color || '#94a3b8' }))
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
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (activeTimesheet) {
      clockTimerRef.current = setInterval(() => setTick(t => t + 1), 30000);
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
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    clearCache();
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  const toggleTaskComplete = useCallback(async (taskId: string, currentStatus?: string) => {
    const newStatus = currentStatus === 'completed' || currentStatus === 'done' ? 'todo' : 'completed';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      const res = await apiRequest(`/api/tasks/${taskId}`, 'PATCH', { status: newStatus });
      if (!res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: currentStatus } : t));
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: currentStatus } : t));
    }
  }, []);

  const openTaskModal = useCallback(async (task: Task) => {
    setTaskDetail(task);
    setShowTaskModal(true);
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

  const openScheduleModal = useCallback((item: ScheduleItem) => {
    setScheduleDetail(item);
    setShowScheduleModal(true);
  }, []);

  const handleTaskModalToggleComplete = useCallback(async () => {
    if (!taskDetail) return;
    const currentStatus = taskDetail.status;
    const newStatus = currentStatus === 'completed' || currentStatus === 'done' ? 'todo' : 'completed';
    setTaskDetail(prev => prev ? { ...prev, status: newStatus } : prev);
    setTasks(prev => prev.map(t => t.id === taskDetail.id ? { ...t, status: newStatus } : t));
    try {
      const res = await apiRequest(`/api/tasks/${taskDetail.id}`, 'PATCH', { status: newStatus });
      if (!res.ok) {
        setTaskDetail(prev => prev ? { ...prev, status: currentStatus } : prev);
        setTasks(prev => prev.map(t => t.id === taskDetail.id ? { ...t, status: currentStatus } : t));
      }
    } catch {
      setTaskDetail(prev => prev ? { ...prev, status: currentStatus } : prev);
      setTasks(prev => prev.map(t => t.id === taskDetail.id ? { ...t, status: currentStatus } : t));
    }
  }, [taskDetail]);

  const handleChecklistItemToggle = useCallback(async (itemIndex: number) => {
    if (!taskDetail || savingChecklist) return;
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
    } finally {
      setSavingChecklist(false);
    }
  }, [taskDetail, savingChecklist]);

  const handleClockOut = useCallback(async (breakMinutes: number = 0) => {
    if (!activeTimesheet || clockingOut) return;
    setClockingOut(true);
    setShowBreakModal(false);
    try {
      const res = await apiRequest('/api/timesheets/clock-out', 'POST', {
        timesheetId: activeTimesheet.id,
        breakDuration: breakMinutes,
      });
      if (res.ok) {
        setActiveTimesheet(null);
        await fetchData();
      } else {
        const body = await res.json().catch(() => ({}));
        Alert.alert('Clock Out Failed', body.error || 'Please try again.');
      }
    } catch {
      Alert.alert('Clock Out Failed', 'Please check your connection and try again.');
    } finally {
      setClockingOut(false);
    }
  }, [activeTimesheet, clockingOut, fetchData]);

  const openClockInModal = useCallback(async () => {
    setClockInProjectId(projects[0]?.id || '');
    setClockInCostCodeId('');
    setClockInDescription('');
    const codes = await apiFetch<CostCode[]>('/api/cost-codes?timesheets=true').catch(() => []);
    setCostCodes(codes);
    setShowClockInModal(true);
  }, [projects]);

  const handleClockIn = useCallback(async () => {
    if (!clockInProjectId || clockingIn) return;
    setClockingIn(true);
    try {
      const res = await apiRequest('/api/timesheets/clock-in', 'POST', {
        projectId: clockInProjectId,
        ...(clockInCostCodeId ? { costCodeId: clockInCostCodeId } : {}),
        ...(clockInDescription.trim() ? { notes: clockInDescription.trim() } : {}),
      });
      if (res.ok) {
        setShowClockInModal(false);
        await fetchData();
      } else {
        const body = await res.json().catch(() => ({}));
        Alert.alert('Clock In Failed', body.error || 'Please try again.');
      }
    } catch {
      Alert.alert('Clock In Failed', 'Please check your connection and try again.');
    } finally {
      setClockingIn(false);
    }
  }, [clockInProjectId, clockInCostCodeId, clockInDescription, clockingIn, fetchData]);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || '';
  const lastName = user?.lastName || (user?.fullName?.split(' ').slice(1).join(' ')) || '';
  const fullDisplayName = `${firstName} ${lastName}`.trim() || 'User';

  const isComplete = (s?: string) => s === 'completed' || s === 'done';

  const todayTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).slice(0, 5);

  const getActivityIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'task': return 'checkmark-circle-outline';
      case 'estimate': return 'document-text-outline';
      case 'invoice': return 'card-outline';
      case 'bill': return 'receipt-outline';
      case 'timesheet': return 'time-outline';
      case 'site_diary': return 'journal-outline';
      case 'schedule': return 'calendar-outline';
      case 'project': return 'business-outline';
      case 'variation': return 'git-branch-outline';
      case 'proposal': return 'mail-outline';
      default: return 'ellipse-outline';
    }
  };

  const getProjectName = (pid: string) => {
    const p = projects.find(pr => pr.id === pid);
    if (!p) return 'Unknown';
    return p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name;
  };

  const getCostCodeLabel = (ccId: string) => {
    const cc = costCodes.find(c => c.id === ccId);
    return cc ? `${cc.code} - ${cc.title}` : 'Unknown';
  };

  const renderPickerModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    items: { id: string; label: string }[],
    selectedId: string,
    onSelect: (id: string) => void,
  ) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerContainer, { backgroundColor: colors.card }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.secondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(item.id); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerItemText, { color: colors.text }]}>{item.label}</Text>
                {selectedId === item.id && <Ionicons name="checkmark" size={18} color={colors.accent} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={[styles.pickerEmpty, { color: colors.secondary }]}>No options available</Text>}
          />
        </View>
      </View>
    </Modal>
  );

  const upcomingSchedule = scheduleItems
    .filter(item => new Date(item.endDate) >= new Date())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 6);


  const PROJECT_PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f43f5e', '#84cc16'];

  const getProjectColor = (projectId?: string): string => {
    const fallback = companySettings?.brandColor || PROJECT_PALETTE[0];
    if (!projectId) return fallback;
    const project = projects.find(p => p.id === projectId);
    if (project?.color) return project.color;
    return fallback;
  };

  const mentionCount = notifications.filter(n => n.type === 'mention' && !n.isRead).length;

  const categoryTiles: Array<{ key: string; icon: keyof typeof Ionicons.glyphMap; label: string; count: number }> = [
    { key: 'messages', icon: 'chatbubble-outline', label: 'Messages', count: 0 },
    { key: 'activity', icon: 'pulse-outline', label: 'Activity', count: notifications.length },
    { key: 'mentions', icon: 'at-outline', label: 'Mentions', count: mentionCount },
    { key: 'assigned', icon: 'person-outline', label: 'Assigned', count: tasks.filter(t => !isComplete(t.status)).length },
  ];

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const SectionHeader = ({ label, right }: { label: string; right?: React.ReactNode }) => (
    <View style={styles.sectionHeaderWrap}>
      <View style={[styles.sectionHeaderDivider, { backgroundColor: colors.border }]} />
      <View style={styles.sectionHeaderInner}>
        <Text style={[styles.sectionHeaderLabel, { color: colors.sectionLabel }]}>{label}</Text>
        {right}
      </View>
    </View>
  );

  const initials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'U';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top espresso bar */}
      <View style={[styles.topBar, { backgroundColor: colors.topBar }]}>
        <View style={styles.topBarLeft}>
          <Text style={[styles.topBarGreeting, { color: colors.accent }]} numberOfLines={1}>
            {greeting}, {firstName || fullDisplayName}
          </Text>
          <View style={styles.topBarBrandRow}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.topBarBrandLogo}
              resizeMode="contain"
            />
            <Text style={styles.topBarBrand} numberOfLines={1}>Morada</Text>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            style={styles.topBarIconBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.topBarText} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowUserMenu(v => !v)}
            style={[styles.topBarAvatar, { backgroundColor: colors.accent }]}
            activeOpacity={0.7}
          >
            <Text style={styles.topBarAvatarText}>{initials(fullDisplayName)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showUserMenu && (
        <View style={[styles.userMenuDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.userMenuItem, { borderBottomColor: colors.border }]}
            onPress={() => { setShowUserMenu(false); navigation.navigate('BusinessDashboard'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="business-outline" size={18} color={colors.secondary} />
            <Text style={[styles.userMenuText, { color: colors.text }]}>Company Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.userMenuItem, { borderBottomColor: colors.border }]}
            onPress={() => { setShowUserMenu(false); navigation.getParent()?.navigate('More'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={18} color={colors.secondary} />
            <Text style={[styles.userMenuText, { color: colors.text }]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.userMenuItem}
            onPress={() => { setShowUserMenu(false); logout(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            <Text style={[styles.userMenuText, { color: '#ef4444' }]}>Log Out</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Project tiles row */}
        {projects.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.projectTilesRow}
            style={styles.projectTilesScroll}
          >
            {projects.slice(0, 12).map(p => {
              const tint = p.color || getProjectColor(p.id);
              const prettify = (k: string | undefined, map: Record<string, string>) =>
                k ? map[k] || k.replace(/_/g, ' ') : '';
              const typeLabel =
                prettify(p.projectSubStatus, subStatusLabels) ||
                prettify(p.currentSystemPhase, phaseLabels) ||
                '';
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => navigation.getParent()?.navigate('Projects', {
                    screen: 'ProjectDetail',
                    params: { projectId: p.id, projectName: p.name },
                  })}
                  activeOpacity={0.85}
                  style={[styles.projectTile, { backgroundColor: tint }]}
                >
                  <View style={styles.projectTileOverlay}>
                    <Text style={styles.projectTileName} numberOfLines={1}>{p.name}</Text>
                    {!!typeLabel && (
                      <Text style={styles.projectTileType} numberOfLines={1}>{typeLabel}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* TIMESHEETS */}
        <SectionHeader
          label="TIMESHEETS"
          right={
            <TouchableOpacity onPress={() => setTimesheetsCollapsed(v => !v)} activeOpacity={0.7}>
              <Ionicons
                name={timesheetsCollapsed ? 'chevron-forward' : 'chevron-down'}
                size={16}
                color={colors.sectionLabel}
              />
            </TouchableOpacity>
          }
        />
        {!timesheetsCollapsed && (
          <View>
            {activeTimesheet && (() => {
              const projColor = getProjectColor(activeTimesheet.projectId);
              return (
                <View style={[styles.activeTsCard, { backgroundColor: colors.card, borderLeftColor: projColor }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.activeTsName, { color: colors.text }]} numberOfLines={1}>
                      {fullDisplayName}
                    </Text>
                    <Text style={[styles.activeTsTask, { color: colors.secondary }]} numberOfLines={1}>
                      {getProjectName(activeTimesheet.projectId)}
                    </Text>
                    <Text style={[styles.activeTsDate, { color: colors.muted }]}>
                      Today · started {new Date(activeTimesheet.clockInTime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.activeTsBadges}>
                    <View style={[styles.pillBadge, { backgroundColor: colors.accent + '22' }]}>
                      <Text style={[styles.pillBadgeText, { color: colors.accent }]}>
                        {formatTimeSince(activeTimesheet.clockInTime)}
                      </Text>
                    </View>
                    <View style={[styles.pillBadge, { backgroundColor: '#10B98122' }]}>
                      <View style={styles.pillDot} />
                      <Text style={[styles.pillBadgeText, { color: '#059669' }]}>Clocked In</Text>
                    </View>
                  </View>
                </View>
              );
            })()}
            {recentTimesheets.length === 0 && !activeTimesheet ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={22} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.secondary }]}>No recent timesheets</Text>
              </View>
            ) : recentTimesheets.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timesheetScroll}
              >
                {recentTimesheets.map(ts => {
                  const ccId = ts.costCodeId || ts.costCodeSplits?.[0]?.costCodeId;
                  const costCodeName = ccId ? getCostCodeLabel(ccId) : '';
                  const projColor = getProjectColor(ts.projectId);
                  const cardWidth = Dimensions.get('window').width * 0.78;
                  return (
                    <TouchableOpacity
                      key={ts.id}
                      style={[styles.recentTsCard, { backgroundColor: colors.card, borderLeftColor: projColor, width: cardWidth }]}
                      onPress={() => setSelectedTimesheetDetail(ts)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.recentTsProject, { color: colors.text }]} numberOfLines={1}>
                          {ts.projectId ? getProjectName(ts.projectId) : 'No project'}
                        </Text>
                        <Text style={[styles.recentTsCostCode, { color: colors.secondary }]} numberOfLines={1}>
                          {costCodeName || '—'}
                        </Text>
                        <Text style={[styles.recentTsDate, { color: colors.muted }]}>
                          {formatDateLabel(ts.date)}
                        </Text>
                      </View>
                      <View style={[styles.pillBadge, { backgroundColor: colors.accent + '22' }]}>
                        <Text style={[styles.pillBadgeText, { color: colors.accent }]}>
                          {parseFloat(ts.duration).toFixed(1)}h
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        )}

        {/* TODAY'S TASKS */}
        <SectionHeader
          label="TODAY'S TASKS"
          right={
            <Text style={[styles.sectionHeaderCount, { color: colors.sectionLabel }]}>
              {todayTasks.filter(t => isComplete(t.status)).length}/{todayTasks.length}
            </Text>
          }
        />
        {todayTasks.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.secondary }]}>No tasks due today</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {todayTasks.map(task => {
              const projectColor = getProjectColor(task.projectId);
              const done = isComplete(task.status);
              const projName = task.projectId ? getProjectName(task.projectId) : '';
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskRow, { backgroundColor: colors.card }]}
                  onPress={() => openTaskModal(task)}
                  activeOpacity={0.7}
                >
                  <TouchableOpacity
                    onPress={() => toggleTaskComplete(task.id, task.status)}
                    activeOpacity={0.7}
                    hitSlop={8}
                    style={[
                      styles.taskCheckbox,
                      {
                        borderColor: done ? '#10B981' : colors.muted,
                        backgroundColor: done ? '#10B981' : 'transparent',
                      },
                    ]}
                  >
                    {done && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                  </TouchableOpacity>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[
                        styles.taskRowTitle,
                        { color: done ? colors.muted : colors.text },
                        done && styles.taskTitleDone,
                      ]}
                      numberOfLines={1}
                    >
                      {task.title}
                    </Text>
                    {!!projName && (
                      <Text style={[styles.taskRowProject, { color: colors.secondary }]} numberOfLines={1}>
                        {projName}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.taskRowDot, { backgroundColor: projectColor }]} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* SCHEDULE */}
        <SectionHeader label="SCHEDULE" />
        {(() => {
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
          const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
          const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);
          const todayItems = scheduleItems.filter(i => new Date(i.startDate) >= todayStart && new Date(i.startDate) <= todayEnd);
          const tomorrowItems = scheduleItems.filter(i => new Date(i.startDate) >= tomorrowStart && new Date(i.startDate) <= tomorrowEnd);
          if (todayItems.length === 0 && tomorrowItems.length === 0) {
            return (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={22} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.secondary }]}>No upcoming schedule items</Text>
              </View>
            );
          }
          const renderCard = (item: ScheduleItem, isTomorrow: boolean) => {
            const sc = getProjectColor(item.projectId);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.scheduleItemCard, { backgroundColor: colors.card, borderLeftColor: sc }]}
                onPress={() => openScheduleModal(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.scheduleItemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                {item.projectName && (
                  <Text style={[styles.scheduleItemProject, { color: colors.secondary }]} numberOfLines={1}>{item.projectName}</Text>
                )}
                <Text style={[styles.scheduleItemMeta, { color: colors.muted }]}>
                  {isTomorrow ? 'Tomorrow' : 'Today'}
                  {item.startTime ? ` · ${item.startTime.slice(0, 5)}` : ''}
                </Text>
              </TouchableOpacity>
            );
          };
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scheduleItemsScrollWrap}
              contentContainerStyle={styles.scheduleItemsScroll}
            >
              {todayItems.map(it => renderCard(it, false))}
              {tomorrowItems.map(it => renderCard(it, true))}
            </ScrollView>
          );
        })()}

        {/* RECENT ACTIVITY */}
        <SectionHeader label="RECENT ACTIVITY" />
        {recentActivities.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="pulse-outline" size={22} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.secondary }]}>No recent activity</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {recentActivities.map(activity => {
              const projColor = activity.projectId ? getProjectColor(activity.projectId) : colors.accent;
              const userName = activity.userName || 'System';
              return (
                <TouchableOpacity
                  key={activity.id}
                  style={[styles.activityRowNew, { backgroundColor: colors.card, borderLeftColor: projColor }]}
                  onPress={() => navigation.navigate('Notifications')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.activityAvatar, { backgroundColor: projColor }]}>
                    <Text style={styles.activityAvatarText}>{initials(userName)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.activityNameLine, { color: colors.text }]} numberOfLines={1}>
                      {userName}
                    </Text>
                    <Text style={[styles.activityDescLine, { color: colors.secondary }]} numberOfLines={2}>
                      {activity.description}
                    </Text>
                  </View>
                  <Text style={[styles.activityTimeNew, { color: colors.muted }]}>
                    {formatTimeAgo(activity.createdAt)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      <View style={[styles.clockBtnWrap, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        {activeTimesheet ? (
          <TouchableOpacity
            style={[styles.clockBtn, { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}
            onPress={() => { setSelectedBreakMinutes(0); setShowBreakModal(true); }}
            activeOpacity={0.8}
            disabled={clockingOut}
          >
            {clockingOut ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="stop-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.clockBtnText}>Clock Out — {formatTimeSince(activeTimesheet.clockInTime)}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.clockBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={openClockInModal}
            activeOpacity={0.8}
          >
            <Ionicons name="play-circle-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={[styles.clockBtnText, { color: '#ffffff' }]}>Clock In</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Timesheet Detail Modal */}
      <Modal
        visible={!!selectedTimesheetDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTimesheetDetail(null)}
      >
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Timesheet</Text>
              <TouchableOpacity onPress={() => setSelectedTimesheetDetail(null)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            {selectedTimesheetDetail ? (
              <View style={{ padding: 16, gap: 12 }}>
                {/* Date */}
                <View style={[styles.detailRow, { borderColor: colors.border }]}>
                  <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.detailLabel, { color: colors.secondary }]}>Date</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDateLabel(selectedTimesheetDetail.date)}
                    </Text>
                  </View>
                </View>
                {/* Project */}
                <View style={[styles.detailRow, { borderColor: colors.border }]}>
                  <Ionicons name="briefcase-outline" size={16} color={colors.secondary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.detailLabel, { color: colors.secondary }]}>Project</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedTimesheetDetail.projectId ? getProjectName(selectedTimesheetDetail.projectId) : 'No project'}
                    </Text>
                  </View>
                </View>
                {/* Duration */}
                <View style={[styles.detailRow, { borderColor: colors.border }]}>
                  <Ionicons name="time-outline" size={16} color={colors.secondary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.detailLabel, { color: colors.secondary }]}>Duration</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {parseFloat(selectedTimesheetDetail.duration).toFixed(2)}h
                      {selectedTimesheetDetail.startTime && selectedTimesheetDetail.endTime
                        ? `  ·  ${selectedTimesheetDetail.startTime} – ${selectedTimesheetDetail.endTime}`
                        : ''}
                    </Text>
                  </View>
                </View>
                {/* Cost code */}
                {(() => {
                  const ccId = selectedTimesheetDetail.costCodeId || selectedTimesheetDetail.costCodeSplits?.[0]?.costCodeId;
                  return ccId ? (
                    <View style={[styles.detailRow, { borderColor: colors.border }]}>
                      <Ionicons name="pricetag-outline" size={16} color={colors.secondary} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.detailLabel, { color: colors.secondary }]}>Cost Code</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>{getCostCodeLabel(ccId)}</Text>
                      </View>
                    </View>
                  ) : null;
                })()}
                {/* Status */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                  <Text style={[styles.detailLabel, { color: colors.secondary }]}>Status</Text>
                  <View style={[styles.statusBadge, {
                    backgroundColor:
                      selectedTimesheetDetail.status === 'approved' ? '#22c55e20' :
                      selectedTimesheetDetail.status === 'submitted' ? '#3b82f620' :
                      selectedTimesheetDetail.status === 'rejected' ? '#ef444420' : colors.accent + '20',
                  }]}>
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color:
                        selectedTimesheetDetail.status === 'approved' ? '#16a34a' :
                        selectedTimesheetDetail.status === 'submitted' ? '#2563eb' :
                        selectedTimesheetDetail.status === 'rejected' ? '#dc2626' : colors.accent,
                    }}>
                      {selectedTimesheetDetail.status.charAt(0).toUpperCase() + selectedTimesheetDetail.status.slice(1)}
                    </Text>
                  </View>
                </View>
                {/* Navigate button */}
                <TouchableOpacity
                  style={[styles.clockBtn, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40', marginTop: 8 }]}
                  onPress={() => {
                    setSelectedTimesheetDetail(null);
                    navigation.navigate('Timesheets');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={16} color={colors.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.clockBtnText, { color: colors.accent }]}>View in Timesheets</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBreakModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBreakModal(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Break Duration</Text>
              <TouchableOpacity onPress={() => setShowBreakModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[0, 15, 30, 45, 60, 75, 90, 120]}
              keyExtractor={item => String(item)}
              renderItem={({ item }) => {
                const label = item === 0 ? 'No Break' : item < 60 ? `${item} min` : item === 60 ? '1 hr' : `${Math.floor(item / 60)} hr ${item % 60 > 0 ? `${item % 60} min` : ''}`.trim();
                const selected = selectedBreakMinutes === item;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, { borderBottomColor: colors.border, backgroundColor: selected ? colors.accent + '20' : 'transparent' }]}
                    onPress={() => setSelectedBreakMinutes(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pickerItemText, { color: colors.text, fontWeight: selected ? '600' : '400' }]}>{label}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowBreakModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelText, { color: colors.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#ef4444' + '30', borderColor: '#ef444480' }]}
                onPress={() => handleClockOut(selectedBreakMinutes)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalConfirmText, { color: '#ef4444' }]}>Clock Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showClockInModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowClockInModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowClockInModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Clock In</Text>
              <TouchableOpacity onPress={() => setShowClockInModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalLabel, { color: colors.secondary }]}>Project</Text>
              <TouchableOpacity
                style={[styles.modalSelector, { backgroundColor: colors.card, borderColor: showProjectPicker ? colors.accent : colors.border }]}
                onPress={() => { setShowProjectPicker(v => !v); setShowCostCodePicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalSelectorText, { color: clockInProjectId ? colors.text : colors.secondary }]} numberOfLines={1}>
                  {clockInProjectId ? getProjectName(clockInProjectId) : 'Select a project...'}
                </Text>
                <Ionicons name={showProjectPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
              </TouchableOpacity>
              {showProjectPicker && (
                <ScrollView style={[styles.inlineList, { borderColor: colors.border, backgroundColor: colors.card }]} nestedScrollEnabled>
                  {projects.map(p => {
                    const label = p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name;
                    const selected = clockInProjectId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.inlineListItem, { borderBottomColor: colors.border, backgroundColor: selected ? colors.accent + '20' : 'transparent' }]}
                        onPress={() => { setClockInProjectId(p.id); setClockInCostCodeId(''); setShowProjectPicker(false); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.inlineListText, { color: colors.text, fontWeight: selected ? '600' : '400' }]} numberOfLines={1}>{label}</Text>
                        {selected && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {clockInProjectId ? (
                <>
                  <Text style={[styles.modalLabel, { color: colors.secondary, marginTop: 14 }]}>Cost Code</Text>
                  <TouchableOpacity
                    style={[styles.modalSelector, { backgroundColor: colors.card, borderColor: showCostCodePicker ? colors.accent : colors.border }]}
                    onPress={() => { setShowCostCodePicker(v => !v); setShowProjectPicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalSelectorText, { color: clockInCostCodeId ? colors.text : colors.secondary }]} numberOfLines={1}>
                      {clockInCostCodeId ? getCostCodeLabel(clockInCostCodeId) : 'Select cost code...'}
                    </Text>
                    <Ionicons name={showCostCodePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                  </TouchableOpacity>
                  {showCostCodePicker && (
                    <ScrollView style={[styles.inlineList, { borderColor: colors.border, backgroundColor: colors.card }]} nestedScrollEnabled>
                      {[...costCodes].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).map(cc => {
                        const label = `${cc.code} - ${cc.title}`;
                        const selected = clockInCostCodeId === cc.id;
                        return (
                          <TouchableOpacity
                            key={cc.id}
                            style={[styles.inlineListItem, { borderBottomColor: colors.border, backgroundColor: selected ? colors.accent + '20' : 'transparent' }]}
                            onPress={() => { setClockInCostCodeId(cc.id); setShowCostCodePicker(false); }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.inlineListText, { color: colors.text, fontWeight: selected ? '600' : '400' }]} numberOfLines={1}>{label}</Text>
                            {selected && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </>
              ) : null}

              <Text style={[styles.modalLabel, { color: colors.secondary, marginTop: 14 }]}>Description</Text>
              <TextInput
                style={[styles.modalTextInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="Optional notes..."
                placeholderTextColor={colors.secondary}
                value={clockInDescription}
                onChangeText={setClockInDescription}
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowClockInModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelText, { color: colors.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.accent + '30', borderColor: colors.accent + '50', opacity: clockInProjectId ? 1 : 0.5 }]}
                onPress={handleClockIn}
                activeOpacity={0.8}
                disabled={!clockInProjectId || clockingIn}
              >
                {clockingIn
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={[styles.modalConfirmText, { color: colors.accent }]}>Clock In</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Task Detail Modal */}
      <Modal
        visible={showTaskModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTaskModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowTaskModal(false)} />
          <View style={[styles.taskModalSheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>
                  {taskDetail?.title || ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTaskModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>

            {taskDetailLoading ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : (
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Meta row: project + due date */}
                <View style={styles.taskMetaRow}>
                  {taskDetail?.projectId && (
                    <View style={[styles.taskMetaBadge, { backgroundColor: getProjectColor(taskDetail.projectId) + '25', borderColor: getProjectColor(taskDetail.projectId) + '50' }]}>
                      <View style={[styles.taskMetaDot, { backgroundColor: getProjectColor(taskDetail.projectId) }]} />
                      <Text style={[styles.taskMetaBadgeText, { color: colors.text }]} numberOfLines={1}>
                        {projects.find(p => p.id === taskDetail.projectId)?.name || 'Project'}
                      </Text>
                    </View>
                  )}
                  {taskDetail?.dueDate && (
                    <View style={[styles.taskMetaBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Ionicons name="calendar-outline" size={12} color={colors.secondary} style={{ marginRight: 4 }} />
                      <Text style={[styles.taskMetaBadgeText, { color: colors.secondary }]}>
                        {formatDateLabel(taskDetail.dueDate)}
                      </Text>
                    </View>
                  )}
                  {taskDetail?.priority && taskDetail.priority !== 'low' && (
                    <View style={[styles.taskMetaBadge, {
                      backgroundColor: taskDetail.priority === 'high' || taskDetail.priority === 'urgent' ? '#ef444420' : taskDetail.priority === 'medium' ? '#f9731620' : colors.card,
                      borderColor: taskDetail.priority === 'high' || taskDetail.priority === 'urgent' ? '#ef444450' : taskDetail.priority === 'medium' ? '#f9731650' : colors.border,
                    }]}>
                      <Text style={[styles.taskMetaBadgeText, {
                        color: taskDetail.priority === 'high' || taskDetail.priority === 'urgent' ? '#ef4444' : taskDetail.priority === 'medium' ? '#f97316' : colors.secondary,
                        textTransform: 'capitalize',
                      }]}>
                        {taskDetail.priority}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Notes */}
                {stripHtml(taskDetail?.contentText || taskDetail?.content) ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.modalLabel, { color: colors.secondary, marginBottom: 6 }]}>Notes</Text>
                    <Text style={[styles.taskDescText, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}>
                      {stripHtml(taskDetail?.contentText || taskDetail?.content)}
                    </Text>
                  </View>
                ) : null}

                {/* Checklist items */}
                {taskDetail?.checklist && taskDetail.checklist.length > 0 ? (
                  <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={[styles.modalLabel, { color: colors.secondary }]}>Checklist</Text>
                      <Text style={[styles.taskMetaBadgeText, { color: colors.secondary }]}>
                        {taskDetail.checklist.filter(i => i.completed).length}/{taskDetail.checklist.length}
                      </Text>
                    </View>
                    {taskDetail.checklist.map((item, idx) => (
                      <TouchableOpacity
                        key={item.id || idx}
                        style={[styles.checklistRow, { borderColor: colors.border, backgroundColor: colors.card }]}
                        onPress={() => handleChecklistItemToggle(idx)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checklistBox, {
                          borderColor: item.completed ? colors.accent : colors.muted,
                          backgroundColor: item.completed ? colors.accent : 'transparent',
                        }]}>
                          {item.completed && <Ionicons name="checkmark" size={11} color="#fff" />}
                        </View>
                        <Text style={[styles.checklistItemText, {
                          color: item.completed ? colors.muted : colors.text,
                          textDecorationLine: item.completed ? 'line-through' : 'none',
                          flex: 1,
                        }]}>
                          {item.text}
                        </Text>
                        {item.assigneeName ? (
                          <Text style={[styles.taskMetaBadgeText, { color: colors.secondary, marginLeft: 8 }]} numberOfLines={1}>
                            {item.assigneeName.split(' ')[0]}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {/* Linked checklist instance */}
                {taskDetail?.checklistInstanceName ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.modalLabel, { color: colors.secondary, marginBottom: 6 }]}>Linked Checklist</Text>
                    <View style={[styles.checklistRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                      <Ionicons name="list-outline" size={16} color={colors.accent} style={{ marginRight: 10 }} />
                      <Text style={[styles.checklistItemText, { color: colors.text, flex: 1 }]}>{taskDetail.checklistInstanceName}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={{ height: 8 }} />
              </ScrollView>
            )}

            {/* Footer */}
            {!taskDetailLoading && (
              <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                  onPress={() => setShowTaskModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalCancelText, { color: colors.secondary }]}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmBtn, {
                    backgroundColor: isComplete(taskDetail?.status) ? colors.card : colors.accent + '30',
                    borderColor: isComplete(taskDetail?.status) ? colors.border : colors.accent + '60',
                  }]}
                  onPress={handleTaskModalToggleComplete}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isComplete(taskDetail?.status) ? 'refresh-outline' : 'checkmark-circle-outline'}
                    size={15}
                    color={isComplete(taskDetail?.status) ? colors.secondary : colors.accent}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.modalConfirmText, { color: isComplete(taskDetail?.status) ? colors.secondary : colors.accent }]}>
                    {isComplete(taskDetail?.status) ? 'Mark Incomplete' : 'Mark Complete'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => {
                    setShowTaskModal(false);
                    const tabNav = navigation.getParent();
                    (tabNav ?? navigation).navigate('More', { screen: 'Tasks', params: { openTaskId: taskDetail?.id } });
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={[styles.modalConfirmText, { color: '#ffffff' }]}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Schedule Item Detail Modal */}
      <Modal
        visible={showScheduleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowScheduleModal(false)} />
          <View style={[styles.taskModalSheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>
                  {scheduleDetail?.name || ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Meta badges row */}
              <View style={styles.taskMetaRow}>
                {scheduleDetail?.projectName && (
                  <View style={[styles.taskMetaBadge, {
                    backgroundColor: getProjectColor(scheduleDetail.projectId) + '25',
                    borderColor: getProjectColor(scheduleDetail.projectId) + '50',
                  }]}>
                    <View style={[styles.taskMetaDot, { backgroundColor: getProjectColor(scheduleDetail.projectId) }]} />
                    <Text style={[styles.taskMetaBadgeText, { color: colors.text }]} numberOfLines={1}>
                      {scheduleDetail.projectName}
                    </Text>
                  </View>
                )}
                {scheduleDetail?.type && (
                  <View style={[styles.taskMetaBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.taskMetaBadgeText, { color: colors.secondary, textTransform: 'capitalize' }]}>
                      {scheduleDetail.type}
                    </Text>
                  </View>
                )}
                {scheduleDetail?.status && (() => {
                  const opt = scheduleStatusOptions.find(o => o.key === scheduleDetail.status);
                  const sc = opt?.color || '#94a3b8';
                  const label = opt?.name || scheduleDetail.status;
                  return (
                    <View style={[styles.taskMetaBadge, {
                      backgroundColor: sc + '25',
                      borderColor: sc + '60',
                    }]}>
                      <View style={[styles.taskMetaDot, { backgroundColor: sc }]} />
                      <Text style={[styles.taskMetaBadgeText, { color: sc }]}>
                        {label}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* Date / Time */}
              <View style={[styles.scheduleDetailRow, { borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={16} color={colors.accent} style={{ marginRight: 10 }} />
                <View>
                  {scheduleDetail?.startDate === scheduleDetail?.endDate ? (
                    <Text style={[styles.scheduleDetailText, { color: colors.text }]}>
                      {formatDateLabel(scheduleDetail?.startDate || '')}
                    </Text>
                  ) : (
                    <Text style={[styles.scheduleDetailText, { color: colors.text }]}>
                      {formatDateLabel(scheduleDetail?.startDate || '')}
                      {' → '}
                      {formatDateLabel(scheduleDetail?.endDate || '')}
                    </Text>
                  )}
                  {(scheduleDetail?.startTime || scheduleDetail?.endTime) && (
                    <Text style={[styles.scheduleDetailSubtext, { color: colors.secondary }]}>
                      {scheduleDetail?.startTime ? scheduleDetail.startTime.slice(0, 5) : ''}
                      {scheduleDetail?.startTime && scheduleDetail?.endTime ? ' – ' : ''}
                      {scheduleDetail?.endTime ? scheduleDetail.endTime.slice(0, 5) : ''}
                    </Text>
                  )}
                </View>
              </View>

              {/* Assigned To */}
              {scheduleDetail?.assignedToName && (
                <View style={[styles.scheduleDetailRow, { borderColor: colors.border }]}>
                  <Ionicons name="person-outline" size={16} color={colors.accent} style={{ marginRight: 10 }} />
                  <Text style={[styles.scheduleDetailText, { color: colors.text }]}>
                    {scheduleDetail.assignedToName}
                  </Text>
                </View>
              )}

              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Footer */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowScheduleModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelText, { color: colors.secondary }]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                onPress={() => {
                  setShowScheduleModal(false);
                  const tabNav = navigation.getParent();
                  (tabNav ?? navigation).navigate('More', {
                    screen: 'Schedule',
                    params: { projectId: scheduleDetail?.projectId },
                  });
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={[styles.modalConfirmText, { color: '#ffffff' }]}>View in Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    padding: 8,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  userMenuDropdown: {
    position: 'absolute',
    top: 100,
    right: 16,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    minWidth: 160,
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
    fontSize: 15,
    fontWeight: '500',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: -14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: -14,
  },
  todayText: {
    fontSize: 13,
    fontWeight: '500',
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryScroll: {
    marginTop: 4,
    marginBottom: 14,
  },
  categoryRow: {
    paddingRight: 16,
    gap: 10,
  },
  categoryCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    width: 100,
    gap: 6,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryCount: {
    fontSize: 12,
  },
  sectionDivider: {
    height: 1,
    marginHorizontal: -16,
    marginBottom: 16,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timesheetScroll: {
    gap: 10,
    paddingBottom: 4,
  },
  timesheetCard: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
  },
  timesheetCardContent: {
    flex: 1,
    padding: 9,
    gap: 3,
  },
  timesheetCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  timesheetCardProject: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  timesheetCardDate: {
    fontSize: 12,
    fontWeight: '500',
  },
  timesheetCardCostCode: {
    fontSize: 12,
    flex: 1,
  },
  timesheetCardHours: {
    fontSize: 14,
    fontWeight: '700',
  },
  taskScroll: {
    gap: 10,
    paddingBottom: 4,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6d3d1',
    overflow: 'hidden',
    height: 38,
  },
  taskColorBar: {
    width: 38,
    alignSelf: 'stretch',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  taskCardTitle: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingHorizontal: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxDone: {},
  taskTitleDone: {
    textDecorationLine: 'line-through',
  },
  scheduleScroll: {
    gap: 10,
  },
  scheduleCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    width: 97,
    height: 63,
    justifyContent: 'space-between',
  },
  scheduleDate: {
    fontSize: 10,
    fontWeight: '600',
  },
  scheduleName: {
    fontSize: 11,
    fontWeight: '600',
  },
  scheduleProject: {
    fontSize: 10,
  },
  scheduleTomorrow: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 2,
  },
  scheduleVerticalDivider: {
    width: 1,
    height: 63,
    alignSelf: 'center',
    marginHorizontal: 4,
  },
  scheduleDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  scheduleDetailText: {
    fontSize: 14,
    fontWeight: '500',
  },
  scheduleDetailSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    height: 38,
    marginBottom: 8,
  },
  activityIcon: {
    width: 38,
    alignSelf: 'stretch',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
    paddingHorizontal: 10,
    marginRight: 4,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  activityMsg: {
    fontSize: 12,
    marginTop: 1,
  },
  activityTime: {
    fontSize: 11,
  },
  clockBtnWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
  },
  clockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
  },
  clockBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalSelectorText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  inlineList: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
  },
  inlineListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inlineListText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 4,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerItemText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  pickerEmpty: {
    padding: 20,
    textAlign: 'center',
    fontSize: 14,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  modalCancelBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 2,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taskModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '90%',
  },
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  taskMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  taskMetaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  taskMetaBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  taskDescText: {
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  checklistBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  checklistItemText: {
    fontSize: 14,
    lineHeight: 20,
  },
  // ----- Redesigned Dashboard styles -----
  topBar: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarLeft: {
    flex: 1,
    minWidth: 0,
  },
  topBarGreeting: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  topBarBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarBrandLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  topBarBrand: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarIconBtn: {
    padding: 4,
    position: 'relative',
  },
  topBarAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  projectTilesScroll: {
    marginTop: 16,
    marginBottom: 4,
    marginHorizontal: -16,
  },
  projectTilesRow: {
    paddingHorizontal: 16,
    gap: 10,
  },
  projectTile: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  projectTileOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  projectTileName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  projectTileType: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    marginTop: 1,
  },
  sectionHeaderWrap: {
    marginTop: 18,
    marginBottom: 8,
  },
  sectionHeaderDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  sectionHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Active timesheet card
  activeTsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    gap: 10,
  },
  activeTsName: {
    fontSize: 14,
    fontWeight: '700',
  },
  activeTsTask: {
    fontSize: 12,
    marginTop: 2,
  },
  activeTsDate: {
    fontSize: 11,
    marginTop: 2,
  },
  activeTsBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  recentTsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    gap: 10,
  },
  recentTsProject: {
    fontSize: 13,
    fontWeight: '700',
  },
  recentTsCostCode: {
    fontSize: 12,
    marginTop: 2,
  },
  recentTsDate: {
    fontSize: 11,
    marginTop: 2,
  },
  // Today's tasks rows
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskRowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  taskRowProject: {
    fontSize: 11,
    marginTop: 2,
  },
  taskRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Schedule items horizontal scroll
  scheduleItemsScrollWrap: {
    marginHorizontal: -16,
  },
  scheduleItemsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  scheduleItemCard: {
    width: 160,
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  scheduleItemName: {
    fontSize: 12,
    fontWeight: '700',
  },
  scheduleItemProject: {
    fontSize: 11,
    marginTop: 2,
  },
  scheduleItemMeta: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
  // Recent activity rows (new)
  activityRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
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
    fontSize: 11,
    fontWeight: '700',
  },
  activityNameLine: {
    fontSize: 13,
    fontWeight: '700',
  },
  activityDescLine: {
    fontSize: 12,
    marginTop: 2,
  },
  activityTimeNew: {
    fontSize: 10,
    fontWeight: '500',
  },
});
