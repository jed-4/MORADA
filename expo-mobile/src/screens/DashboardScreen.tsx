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
  isFavourite?: boolean;
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
  costCodeId?: string;
  costCodeSplits?: Array<{ costCodeId: string; costCodeName?: string; duration: string }>;
  projectName?: string;
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
  const [activeTimesheet, setActiveTimesheet] = useState<ActiveTimesheet | null>(null);
  const [recentTimesheets, setRecentTimesheets] = useState<TimesheetEntry[]>([]);
  const [weeklyTimesheets, setWeeklyTimesheets] = useState<TimesheetEntry[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', cardHover: '#253449' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1', cardHover: '#f1f5f9' };

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
      const weekStartISO = weekStart.toISOString().split('T')[0];

      const [projectsData, tasksData, notifData, unreadData, timesheetData, recentTsList, weeklyTsList, scheduleData] = await Promise.all([
        apiFetch<Project[]>('/api/projects').catch(() => []),
        apiFetch<Task[]>('/api/tasks').catch(() => []),
        apiFetch<Notification[]>('/api/notifications?limit=20').catch(() => []),
        apiFetch<{ count: number }>('/api/notifications/unread-count').catch(() => ({ count: 0 })),
        apiFetch<ActiveTimesheet | null>('/api/timesheets/active').catch(() => null),
        apiFetch<TimesheetEntry[]>('/api/timesheets').catch(() => []),
        apiFetch<TimesheetEntry[]>(`/api/timesheets?startDate=${weekStartISO}&userId=${user?.id || ''}`).catch(() => []),
        apiFetch<ScheduleItem[]>('/api/schedule-items/user-assigned').catch(() => []),
      ]);
      setProjects(projectsData || []);
      const myTasks = (tasksData || []).filter((t) => {
        const ids = t.assigneeIds || [];
        return ids.includes(user?.id ?? '') || t.ownerId === user?.id || t.assigneeId === user?.id;
      });
      setTasks(myTasks);
      setNotifications(notifData || []);
      setUnreadCount(unreadData?.count || 0);
      setActiveTimesheet(timesheetData || null);

      const myRecentTimesheets = (recentTsList || [])
        .filter((ts) => ts.userId === user?.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3);
      setRecentTimesheets(myRecentTimesheets);

      setWeeklyTimesheets(weeklyTsList || []);

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

  const handleClockOut = useCallback(async () => {
    if (!activeTimesheet || clockingOut) return;
    setClockingOut(true);
    try {
      const res = await apiRequest('/api/timesheets/clock-out', 'POST', { timesheetId: activeTimesheet.id });
      if (res.ok) {
        setActiveTimesheet(null);
        await fetchData();
      }
    } catch {
      console.error('Clock out failed');
    } finally {
      setClockingOut(false);
    }
  }, [activeTimesheet, clockingOut, fetchData]);

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

  const activeProjects = projects.filter(p => p.currentSystemPhase !== 'completed').length;
  const todayTaskCount = todayTasks.length;
  const hoursThisWeek = (() => {
    let total = 0;
    weeklyTimesheets.forEach(ts => {
      total += parseFloat(ts.duration) || 0;
    });
    return total;
  })();
  const activeTimesheetCount = activeTimesheet ? 1 : 0;

  const recentActivity = notifications.slice(0, 3);

  const upcomingSchedule = scheduleItems
    .filter(item => new Date(item.endDate) >= new Date())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 6);

  const getNotifIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'task_assigned': return 'checkbox-outline';
      case 'mention': return 'at-outline';
      case 'reminder': return 'alarm-outline';
      case 'task_completed': return 'checkmark-circle-outline';
      default: return 'notifications-outline';
    }
  };

  const getTimesheetColor = (index: number): string => {
    const palette = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
    return palette[index % palette.length];
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
        <TouchableOpacity style={styles.headerLeft} onPress={() => setShowUserMenu(v => !v)} activeOpacity={0.7}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarText}>
              {(firstName[0] || '').toUpperCase()}{(lastName[0] || '').toUpperCase()}
            </Text>
          </View>
          <View style={styles.headerNameWrap}>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{fullDisplayName}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.secondary} style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => {
              if (unreadCount > 0) {
                apiRequest('/api/notifications/read-all', 'POST').then(() => {
                  setUnreadCount(0);
                  setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                }).catch(() => {});
              }
            }}
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
          <TouchableOpacity
            onPress={() => setShowUserMenu(v => !v)}
            style={styles.headerIconBtn}
          >
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {showUserMenu && (
        <View style={[styles.userMenuDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.userMenuItem, { borderBottomColor: colors.border }]}
            onPress={() => { setShowUserMenu(false); }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={18} color={colors.secondary} />
            <Text style={[styles.userMenuText, { color: colors.text }]}>Account</Text>
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
        <View style={styles.statRow}>
          {[
            { label: 'Active Projects', value: activeProjects, icon: 'briefcase-outline' as keyof typeof Ionicons.glyphMap, color: '#3b82f6' },
            { label: "Today's Tasks", value: todayTaskCount, icon: 'checkbox-outline' as keyof typeof Ionicons.glyphMap, color: '#f59e0b' },
            { label: 'Hours (Week)', value: hoursThisWeek.toFixed(1), icon: 'time-outline' as keyof typeof Ionicons.glyphMap, color: '#10b981' },
            { label: 'Active Timer', value: activeTimesheetCount, icon: 'timer-outline' as keyof typeof Ionicons.glyphMap, color: '#8b5cf6' },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statIconBg, { backgroundColor: stat.color + '15' }]}>
                <Ionicons name={stat.icon} size={18} color={stat.color} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.secondary }]} numberOfLines={1}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Timesheets</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Timesheets')} activeOpacity={0.7}>
              <Text style={[styles.sectionLink, { color: colors.accent }]}>View All</Text>
            </TouchableOpacity>
          </View>
          {recentTimesheets.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={24} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No recent timesheets</Text>
            </View>
          ) : (
            recentTimesheets.map((ts, idx) => {
              const costCodeName = ts.costCodeSplits?.[0]?.costCodeName || '';
              return (
                <TouchableOpacity
                  key={ts.id}
                  style={[styles.timesheetRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => navigation.navigate('Timesheets')}
                  activeOpacity={0.7}
                >
                  <View style={styles.timesheetRowContent}>
                    <Text style={[styles.timesheetProject, { color: colors.text }]} numberOfLines={1}>
                      {ts.projectName || 'No project'}
                    </Text>
                    <View style={styles.timesheetMeta}>
                      {costCodeName ? (
                        <Text style={[styles.timesheetDetail, { color: colors.secondary }]} numberOfLines={1}>{costCodeName}</Text>
                      ) : null}
                      <Text style={[styles.timesheetDetail, { color: colors.secondary }]}>{formatDateShort(ts.date)}</Text>
                    </View>
                  </View>
                  <View style={styles.timesheetRight}>
                    <Text style={[styles.timesheetHours, { color: colors.text }]}>{parseFloat(ts.duration).toFixed(1)}h</Text>
                    <View style={[styles.timesheetIndicator, { backgroundColor: getTimesheetColor(idx) }]} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Tasks</Text>
            <Text style={[styles.sectionCount, { color: colors.secondary }]}>{todayTasks.filter(t => isComplete(t.status)).length}/{todayTasks.length}</Text>
          </View>
          {todayTasks.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="checkmark-circle-outline" size={24} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No tasks due today</Text>
            </View>
          ) : (
            todayTasks.map(task => {
              const done = isComplete(task.status);
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => toggleTaskComplete(task.id, task.status)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, done && styles.checkboxDone, { borderColor: done ? colors.accent : colors.muted, backgroundColor: done ? colors.accent : 'transparent' }]}>
                    {done && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                  </View>
                  <Text
                    style={[styles.taskTitle, { color: done ? colors.muted : colors.text }, done && styles.taskTitleDone]}
                    numberOfLines={1}
                  >
                    {task.title}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Schedule</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Calendar')} activeOpacity={0.7}>
              <Text style={[styles.sectionLink, { color: colors.accent }]}>Calendar</Text>
            </TouchableOpacity>
          </View>
          {upcomingSchedule.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={24} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No upcoming schedule items</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scheduleScroll}>
              {upcomingSchedule.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.scheduleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => navigation.navigate('Calendar')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.scheduleDate, { color: colors.accent }]}>{formatDateLabel(item.startDate)}</Text>
                  <Text style={[styles.scheduleName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                  {item.projectName && (
                    <Text style={[styles.scheduleProject, { color: colors.secondary }]} numberOfLines={1}>{item.projectName}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
          </View>
          {recentActivity.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="pulse-outline" size={24} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No recent activity</Text>
            </View>
          ) : (
            recentActivity.map(notif => (
              <TouchableOpacity
                key={notif.id}
                style={[styles.activityRow, { backgroundColor: colors.card, borderColor: colors.border }, !notif.isRead && { borderLeftWidth: 3, borderLeftColor: colors.accent }]}
                onPress={() => {
                  if (notif.type === 'task_assigned' || notif.type === 'task_completed') {
                    navigation.navigate('More', { screen: 'Tasks' });
                  } else {
                    navigation.navigate('More', { screen: 'MoreHome' });
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.activityIcon, { backgroundColor: colors.accent + '15' }]}>
                  <Ionicons name={getNotifIcon(notif.type)} size={16} color={colors.accent} />
                </View>
                <View style={styles.activityContent}>
                  <Text style={[styles.activityTitle, { color: colors.text }]} numberOfLines={1}>{notif.title}</Text>
                  {notif.message && (
                    <Text style={[styles.activityMsg, { color: colors.secondary }]} numberOfLines={1}>{notif.message}</Text>
                  )}
                </View>
                <Text style={[styles.activityTime, { color: colors.muted }]}>{formatTimeAgo(notif.createdAt)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      <View style={[styles.clockBtnWrap, { backgroundColor: colors.bg }]}>
        {activeTimesheet ? (
          <TouchableOpacity
            style={[styles.clockBtn, { backgroundColor: '#ef4444' }]}
            onPress={handleClockOut}
            activeOpacity={0.8}
            disabled={clockingOut}
          >
            {clockingOut ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="stop-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.clockBtnText}>Clock Out — {formatTimeSince(activeTimesheet.clockInTime)}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.clockBtn, { backgroundColor: colors.accent }]}
            onPress={() => navigation.navigate('Timesheets')}
            activeOpacity={0.8}
          >
            <Ionicons name="play-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.clockBtnText}>Clock In</Text>
          </TouchableOpacity>
        )}
      </View>
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
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
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
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  statIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
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
  timesheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  timesheetRowContent: {
    flex: 1,
    marginRight: 12,
  },
  timesheetProject: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  timesheetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timesheetDetail: {
    fontSize: 12,
  },
  timesheetRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timesheetHours: {
    fontSize: 15,
    fontWeight: '700',
  },
  timesheetIndicator: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
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
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
  },
  scheduleScroll: {
    gap: 10,
  },
  scheduleCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    width: 150,
  },
  scheduleDate: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  scheduleName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  scheduleProject: {
    fontSize: 11,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  activityContent: {
    flex: 1,
    marginRight: 8,
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
    paddingBottom: 28,
    paddingTop: 8,
  },
  clockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 50,
  },
  clockBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
