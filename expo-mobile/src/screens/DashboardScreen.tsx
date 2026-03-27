import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', cardHover: '#253449' }
    : { bg: '#ffffff', card: '#f5f5f4', text: '#1c1917', secondary: '#78716c', border: '#e7e5e4', accent: '#9b7fc4', muted: '#d6d3d1', cardHover: '#eeede9' };

  const fetchData = useCallback(async () => {
    try {
      const userId = user?.id || '';
      const companyId = user?.companyId || '';
      const activityParams = companyId ? `companyId=${companyId}&limit=5` : `userId=${userId}&limit=5`;
      const [projectsData, tasksData, notifData, unreadData, timesheetData, recentTsList, scheduleData, settingsData, costCodesData, activitiesData] = await Promise.all([
        apiFetch<Project[]>('/api/projects').catch(() => []),
        apiFetch<Task[]>('/api/tasks').catch(() => []),
        apiFetch<Notification[]>('/api/notifications?limit=20').catch(() => []),
        apiFetch<{ count: number }>('/api/notifications/unread-count').catch(() => ({ count: 0 })),
        apiFetch<ActiveTimesheet | null>('/api/timesheets/active').catch(() => null),
        apiFetch<TimesheetEntry[]>(`/api/timesheets?userId=${userId}`).catch(() => []),
        apiFetch<ScheduleItem[]>('/api/schedule-items/all').catch(() => []),
        apiFetch<CompanySettings>('/api/company-settings').catch(() => null),
        apiFetch<CostCode[]>('/api/cost-codes').catch(() => []),
        apiFetch<ActivityItem[]>(`/api/activities?${activityParams}`).catch(() => []),
      ]);
      setProjects(projectsData || []);
      setCostCodes(costCodesData || []);
      setCompanySettings(settingsData || null);
      const myTasks = (tasksData || []).filter((t) => {
        const ids = t.assigneeIds || [];
        return ids.includes(user?.id ?? '') || t.ownerId === user?.id || t.assigneeId === user?.id;
      });
      setTasks(myTasks);
      setNotifications(notifData || []);
      setUnreadCount(unreadData?.count || 0);
      setActiveTimesheet(timesheetData || null);
      setRecentActivities(activitiesData || []);

      const sortedTimesheets = (recentTsList || [])
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3);
      setRecentTimesheets(sortedTimesheets);

      setScheduleItems(scheduleData || []);
    } catch {
      console.error('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (activeTimesheet) {
      clockTimerRef.current = setInterval(() => setTick(t => t + 1), 30000);
    }
    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
  }, [activeTimesheet]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
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
    const codes = await apiFetch<CostCode[]>('/api/cost-codes').catch(() => []);
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

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.accent + '30', borderBottomColor: colors.accent + '50' }]}>
        <TouchableOpacity style={styles.headerLeft} onPress={() => setShowUserMenu(v => !v)} activeOpacity={0.7}>
          <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{fullDisplayName}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.secondary} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => { navigation.navigate('Notifications'); }}
            style={styles.headerIconBtn}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
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
            onPress={() => { setShowUserMenu(false); navigation.navigate('More'); }}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          style={styles.categoryScroll}
        >
          {categoryTiles.map(tile => (
            <View key={tile.key} style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name={tile.icon} size={22} color={colors.secondary} />
              <Text style={[styles.categoryLabel, { color: colors.text }]}>{tile.label}</Text>
              <Text style={[styles.categoryCount, { color: colors.secondary }]}>
                {tile.count > 0 ? `${tile.count} new` : '—'}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        <View style={[styles.section, styles.todayRow]}>
          <Text style={[styles.todayText, { color: colors.secondary }]}>
            {new Date().toLocaleDateString('en-AU', { weekday: 'long' })}
          </Text>
          <Text style={[styles.todayText, { color: colors.secondary }]}>
            {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}
          </Text>
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeaderRow}
            onPress={() => setTimesheetsCollapsed(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.todayText, { color: colors.secondary }]}>Timesheets</Text>
            <View style={styles.sectionHeaderRight}>
              <Ionicons
                name={timesheetsCollapsed ? 'chevron-forward' : 'chevron-down'}
                size={18}
                color={colors.secondary}
              />
            </View>
          </TouchableOpacity>
          {!timesheetsCollapsed && (
            recentTimesheets.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={24} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.secondary }]}>No recent timesheets</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timesheetScroll}
              >
                {recentTimesheets.map(ts => {
                  const ccId = ts.costCodeId || ts.costCodeSplits?.[0]?.costCodeId;
                  const costCodeName = ccId ? getCostCodeLabel(ccId) : '';
                  const cardWidth = Dimensions.get('window').width * 0.864 - 16;
                  return (
                    <TouchableOpacity
                      key={ts.id}
                      style={[styles.timesheetCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, width: cardWidth }]}
                      onPress={() => setSelectedTimesheetDetail(ts)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.timesheetCardContent}>
                        <View style={styles.timesheetCardRow}>
                          <Text style={[styles.timesheetCardProject, { color: colors.text }]} numberOfLines={1}>
                            {ts.projectId ? getProjectName(ts.projectId) : 'No project'}
                          </Text>
                          <Text style={[styles.timesheetCardDate, { color: colors.secondary }]}>
                            {formatDateShort(ts.date)}
                          </Text>
                        </View>
                        <View style={styles.timesheetCardRow}>
                          <Text style={[styles.timesheetCardCostCode, { color: colors.secondary }]} numberOfLines={1}>
                            {costCodeName || '—'}
                          </Text>
                          <Text style={[styles.timesheetCardHours, { color: colors.text }]}>
                            {parseFloat(ts.duration).toFixed(1)}h
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )
          )}
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.todayText, { color: colors.secondary }]}>Today's Tasks</Text>
            <Text style={[styles.sectionCount, { color: colors.secondary }]}>{todayTasks.filter(t => isComplete(t.status)).length}/{todayTasks.length}</Text>
          </View>
          {todayTasks.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="checkmark-circle-outline" size={24} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No tasks due today</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskScroll}>
              {(() => {
                const taskCardWidth = Dimensions.get('window').width * 0.62 - 16;
                const displayed = todayTasks.slice(0, 16);
                const columns: typeof displayed[] = [];
                for (let i = 0; i < displayed.length; i += 4) columns.push(displayed.slice(i, i + 4));
                return columns.map((col, colIdx) => (
                  <View key={colIdx} style={{ width: taskCardWidth, gap: 6 }}>
                    {col.map(task => {
                      const projectColor = getProjectColor(task.projectId);
                      const done = isComplete(task.status);
                      return (
                        <TouchableOpacity
                          key={task.id}
                          style={[styles.taskCard, { backgroundColor: colors.card, width: taskCardWidth }]}
                          onPress={() => toggleTaskComplete(task.id, task.status)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.taskColorBar, { backgroundColor: projectColor + '45' }]} />
                          <Text
                            style={[styles.taskCardTitle, { color: done ? colors.muted : colors.text }, done && styles.taskTitleDone]}
                            numberOfLines={1}
                          >
                            {task.title}
                          </Text>
                          <View style={[styles.checkbox, { borderColor: done ? colors.accent : colors.muted, backgroundColor: done ? colors.accent : 'transparent', marginRight: 10 }]}>
                            {done && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ));
              })()}
            </ScrollView>
          )}
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.todayText, { color: colors.secondary }]}>Schedule</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Calendar')} activeOpacity={0.7}>
              <Text style={[styles.sectionLink, { color: colors.accent }]}>Calendar</Text>
            </TouchableOpacity>
          </View>
          {(() => {
            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
            const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
            const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);

            const realToday = scheduleItems.filter(i => new Date(i.startDate) >= todayStart && new Date(i.startDate) <= todayEnd);
            const realTomorrow = scheduleItems.filter(i => new Date(i.startDate) >= tomorrowStart && new Date(i.startDate) <= tomorrowEnd);

            const todayItems = realToday;
            const tomorrowItems = realTomorrow;

            const renderCard = (item: typeof todayItems[0], isTomorrow: boolean) => {
              const scheduleColor = getProjectColor(item.projectId);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.scheduleCard, { backgroundColor: scheduleColor + '18', borderColor: scheduleColor + '45' }]}
                  onPress={() => navigation.navigate('Calendar')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.scheduleName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  {item.projectName && (
                    <Text style={[styles.scheduleProject, { color: colors.secondary }]} numberOfLines={1}>{item.projectName}</Text>
                  )}
                  {isTomorrow && (
                    <Text style={[styles.scheduleTomorrow, { color: colors.muted }]}>Tomorrow</Text>
                  )}
                </TouchableOpacity>
              );
            };

            if (todayItems.length === 0 && tomorrowItems.length === 0) {
              return (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="calendar-outline" size={24} color={colors.muted} />
                  <Text style={[styles.emptyText, { color: colors.secondary }]}>No upcoming schedule items</Text>
                </View>
              );
            }

            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scheduleScroll}>
                {todayItems.map(item => renderCard(item, false))}
                {tomorrowItems.length > 0 && (
                  <View style={[styles.scheduleVerticalDivider, { backgroundColor: colors.border }]} />
                )}
                {tomorrowItems.map(item => renderCard(item, true))}
              </ScrollView>
            );
          })()}
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.todayText, { color: colors.secondary }]}>Recent Activity</Text>
          </View>
          {recentActivities.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="pulse-outline" size={24} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No recent activity</Text>
            </View>
          ) : (
            recentActivities.map(activity => (
              <View
                key={activity.id}
                style={[styles.activityRow, { borderColor: colors.border }]}
              >
                <View style={[styles.activityIcon, { backgroundColor: colors.accent + '30' }]}>
                  <Ionicons name={getActivityIcon(activity.activityType)} size={15} color={colors.accent} />
                </View>
                <View style={styles.activityContent}>
                  <Text style={[styles.activityTitle, { color: colors.text }]} numberOfLines={1}>
                    {activity.description}
                  </Text>
                  {activity.userName ? (
                    <Text style={[styles.activityMsg, { color: colors.secondary }]} numberOfLines={1}>
                      {activity.userName}
                      {activity.entityName ? ` · ${activity.entityName}` : ''}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.activityTime, { color: colors.muted }]}>{formatTimeAgo(activity.createdAt)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      <View style={[styles.clockBtnWrap, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        {activeTimesheet ? (
          <TouchableOpacity
            style={[styles.clockBtn, { backgroundColor: '#ef4444', borderColor: '#ef444480' }]}
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
            style={[styles.clockBtn, { backgroundColor: colors.accent + '30', borderColor: colors.accent + '50' }]}
            onPress={openClockInModal}
            activeOpacity={0.8}
          >
            <Ionicons name="play-circle-outline" size={18} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={[styles.clockBtnText, { color: colors.accent }]}>Clock In</Text>
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
});
