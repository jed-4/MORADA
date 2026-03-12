import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  FlatList,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import CustomizeHomeScreen from './CustomizeHomeScreen';
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

interface CalendarEvent {
  id: string;
  title: string;
  type: 'task' | 'schedule';
  startTime?: string | null;
  endTime?: string | null;
  projectName?: string;
}

interface ActiveTimesheet {
  id: string;
  projectId: string;
  clockInTime: string;
  projectName?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  if (diff === -1) return 'Yesterday';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `In ${diff} days`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
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

function formatCalTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${(m || 0).toString().padStart(2, '0')} ${period}`;
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

export default function DashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTimesheet, setActiveTimesheet] = useState<ActiveTimesheet | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    todayTasks: true,
    overdueTasks: true,
    upcomingTasks: true,
    recentActivity: true,
    calendar: true,
    favourites: true,
    timesheet: true,
  });
  const [showCustomize, setShowCustomize] = useState(false);

  interface LayoutItem { key: string; visible: boolean; }
  interface LayoutPrefs { tiles: LayoutItem[]; sections: LayoutItem[]; }

  const defaultLayout: LayoutPrefs = {
    tiles: [
      { key: 'messages', visible: true },
      { key: 'activity', visible: true },
      { key: 'mentions', visible: true },
      { key: 'assigned', visible: true },
    ],
    sections: [
      { key: 'todayTasks', visible: true },
      { key: 'overdueTasks', visible: true },
      { key: 'upcomingTasks', visible: true },
      { key: 'recentActivity', visible: true },
      { key: 'calendar', visible: true },
      { key: 'favourites', visible: true },
      { key: 'timesheet', visible: true },
    ],
  };
  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPrefs>(defaultLayout);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', cardHover: '#253449' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1', cardHover: '#f1f5f9' };

  const fetchData = useCallback(async () => {
    try {
      const [projectsData, tasksData, notifData, unreadData, timesheetData, prefsData, collapsedData, scheduleData] = await Promise.all([
        apiFetch<Project[]>('/api/projects').catch(() => []),
        apiFetch<Task[]>('/api/tasks').catch(() => []),
        apiFetch<Notification[]>('/api/notifications?limit=20').catch(() => []),
        apiFetch<{ count: number }>('/api/notifications/unread-count').catch(() => ({ count: 0 })),
        apiFetch<ActiveTimesheet | null>('/api/timesheets/active').catch(() => null),
        apiFetch<any>('/api/user-view-preferences/mobile-dashboard-layout').catch(() => null),
        apiFetch<any>('/api/user-view-preferences/mobile-dashboard-collapsed').catch(() => null),
        apiFetch<ScheduleItem[]>('/api/schedule-items/user-assigned').catch(() => []),
      ]);
      setProjects(projectsData || []);
      const myTasks = (tasksData || []).filter((t: any) => {
        const ids = t.assigneeIds || [];
        return ids.includes(user?.id) || t.ownerId === user?.id || t.assigneeId === user?.id;
      });
      setTasks(myTasks);
      setNotifications(notifData || []);
      setUnreadCount(unreadData?.count || 0);
      setActiveTimesheet(timesheetData || null);

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

      const todayCalEvents: CalendarEvent[] = [];

      myTasks.forEach((task: Task) => {
        if (task.dueDate) {
          const dueDate = new Date(task.dueDate);
          if (dueDate >= todayStart && dueDate <= todayEnd) {
            todayCalEvents.push({
              id: `task-${task.id}`,
              title: task.title,
              type: 'task',
            });
          }
        }
      });

      (scheduleData || []).forEach((item: ScheduleItem) => {
        if (!item.startDate) return;
        const startDate = new Date(item.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(item.endDate || item.startDate);
        endDate.setHours(23, 59, 59, 999);
        if (todayStart >= startDate && todayStart <= endDate) {
          todayCalEvents.push({
            id: `schedule-${item.id}`,
            title: item.name,
            type: 'schedule',
            startTime: item.startTime,
            endTime: item.endTime,
            projectName: item.projectName,
          });
        }
      });

      setCalendarEvents(todayCalEvents);

      if (prefsData?.preferences?.tiles && prefsData?.preferences?.sections) {
        const saved = prefsData.preferences as LayoutPrefs;
        const savedTileKeys = new Set(saved.tiles.map((t: LayoutItem) => t.key));
        const savedSectionKeys = new Set(saved.sections.map((s: LayoutItem) => s.key));
        const mergedTiles = [
          ...saved.tiles,
          ...defaultLayout.tiles.filter(t => !savedTileKeys.has(t.key)),
        ];
        const mergedSections = [
          ...saved.sections,
          ...defaultLayout.sections.filter(s => !savedSectionKeys.has(s.key)),
        ];
        setLayoutPrefs({ tiles: mergedTiles, sections: mergedSections });
      }
      if (collapsedData?.preferences) {
        setCollapsed(prev => ({ ...prev, ...collapsedData.preferences }));
      }
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
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

  const toggleSection = (key: string) => {
    setCollapsed(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      apiRequest('/api/user-view-preferences/mobile-dashboard-collapsed', 'PUT', { preferences: updated }).catch(() => {});
      return updated;
    });
  };

  const openNotifications = useCallback(() => {
    setShowNotifications(true);
    if (unreadCount > 0) {
      apiRequest('/api/notifications/read-all', 'POST').then(() => {
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      }).catch(() => {});
    }
  }, [unreadCount]);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || '';
  const lastName = user?.lastName || (user?.fullName?.split(' ').slice(1).join(' ')) || '';
  const fullDisplayName = `${firstName} ${lastName}`.trim() || 'there';

  const isComplete = (s?: string) => s === 'completed' || s === 'done';
  const overdueTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && !isComplete(t.status));
  const todayTasks = tasks.filter(t => {
    if (!t.dueDate || isComplete(t.status)) return false;
    const d = new Date(t.dueDate);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  const upcomingTasks = tasks.filter(t => {
    if (!t.dueDate || isComplete(t.status)) return false;
    const d = new Date(t.dueDate);
    const now = new Date();
    return d > now && !(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate());
  }).slice(0, 5);

  const favouriteProjects = projects.filter(p => p.isFavourite);
  const recentNotifications = notifications.slice(0, 10);

  const unreadNotifications = notifications.filter(n => !n.isRead);
  const mentionCount = notifications.filter(n => n.type === 'mention' && !n.isRead).length;

  const getPhaseColor = (phase?: string) => {
    switch (phase) {
      case 'lead': return '#f59e0b';
      case 'pre_construction': return '#8b5cf6';
      case 'construction': return '#22c55e';
      case 'completed': return '#6b7280';
      default: return '#94a3b8';
    }
  };

  const getPhaseLabel = (phase?: string) => {
    switch (phase) {
      case 'lead': return 'Lead';
      case 'pre_construction': return 'Pre-Con';
      case 'construction': return 'Construction';
      case 'completed': return 'Completed';
      default: return '';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'low': return '#22c55e';
      default: return '#94a3b8';
    }
  };

  const getNotifIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'task_assigned': return 'checkbox-outline';
      case 'mention': return 'at-outline';
      case 'reminder': return 'alarm-outline';
      case 'task_completed': return 'checkmark-circle-outline';
      default: return 'notifications-outline';
    }
  };

  const allCategoryCards: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string; count: number }> = {
    messages: { icon: 'chatbubble-outline', label: 'Messages', count: 0 },
    activity: { icon: 'pulse-outline', label: 'Activity', count: recentNotifications.length },
    mentions: { icon: 'at-outline', label: 'Mentions', count: mentionCount },
    assigned: { icon: 'person-outline', label: 'Assigned', count: tasks.filter(t => !isComplete(t.status)).length },
  };

  const visibleTiles = layoutPrefs.tiles.filter(t => t.visible).map(t => ({ key: t.key, ...allCategoryCards[t.key] })).filter(t => t.icon);
  const visibleSections = layoutPrefs.sections.filter(s => s.visible);

  const renderSectionHeader = (title: string, key: string, count?: number, onTitlePress?: () => void) => (
    <View style={styles.sectionHeader}>
      <TouchableOpacity
        style={{ flex: 1 }}
        onPress={onTitlePress || (() => toggleSection(key))}
        activeOpacity={0.7}
      >
        <Text style={[styles.sectionTitle, { color: colors.secondary }]}>{title}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.sectionHeaderRight}
        onPress={() => toggleSection(key)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {count !== undefined && count > 0 && (
          <View style={[styles.sectionBadge, { backgroundColor: colors.accent + '20' }]}>
            <Text style={[styles.sectionBadgeText, { color: colors.accent }]}>{count}</Text>
          </View>
        )}
        <Ionicons
          name={collapsed[key] ? 'chevron-forward' : 'chevron-down'}
          size={18}
          color={colors.secondary}
        />
      </TouchableOpacity>
    </View>
  );

  const renderSection = (key: string) => {
    switch (key) {
      case 'todayTasks':
        return (
          <View key={key} style={styles.section}>
            {renderSectionHeader("Today's Tasks", 'todayTasks', todayTasks.length)}
            {!collapsed.todayTasks && (
              <View>
                {todayTasks.length === 0 ? (
                  <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle-outline" size={28} color={colors.muted} />
                    <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No tasks due today</Text>
                  </View>
                ) : (
                  todayTasks.map(task => (
                    <View key={task.id} style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.priorityStrip, { backgroundColor: getPriorityColor(task.priority) }]} />
                      <View style={styles.taskContent}>
                        <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
                        <Text style={[styles.taskDue, { color: colors.accent }]}>Today</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      case 'overdueTasks':
        return (
          <View key={key} style={styles.section}>
            {renderSectionHeader('Overdue Tasks', 'overdueTasks', overdueTasks.length)}
            {!collapsed.overdueTasks && (
              <View>
                {overdueTasks.length === 0 ? (
                  <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle-outline" size={28} color={colors.muted} />
                    <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No overdue tasks</Text>
                  </View>
                ) : (
                  overdueTasks.slice(0, 5).map(task => (
                    <View key={task.id} style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.priorityStrip, { backgroundColor: getPriorityColor(task.priority) }]} />
                      <View style={styles.taskContent}>
                        <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
                        <Text style={[styles.taskDue, { color: '#ef4444' }]}>{getRelativeDate(task.dueDate!)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      case 'upcomingTasks':
        return (
          <View key={key} style={styles.section}>
            {renderSectionHeader('Upcoming Tasks', 'upcomingTasks', upcomingTasks.length)}
            {!collapsed.upcomingTasks && (
              <View>
                {upcomingTasks.length === 0 ? (
                  <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle-outline" size={28} color={colors.muted} />
                    <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No upcoming tasks</Text>
                  </View>
                ) : (
                  upcomingTasks.map(task => (
                    <View key={task.id} style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.priorityStrip, { backgroundColor: getPriorityColor(task.priority) }]} />
                      <View style={styles.taskContent}>
                        <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
                        <Text style={[styles.taskDue, { color: colors.secondary }]}>{getRelativeDate(task.dueDate!)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      case 'recentActivity':
        return (
          <View key={key} style={styles.section}>
            {renderSectionHeader('Recent Activity', 'recentActivity', unreadNotifications.length)}
            {!collapsed.recentActivity && (
              <View>
                {recentNotifications.length === 0 ? (
                  <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="pulse-outline" size={28} color={colors.muted} />
                    <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No recent activity</Text>
                  </View>
                ) : (
                  recentNotifications.slice(0, 5).map(notif => (
                    <View key={notif.id} style={[styles.activityRow, { backgroundColor: colors.card, borderColor: colors.border }, !notif.isRead && { borderLeftWidth: 3, borderLeftColor: colors.accent }]}>
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
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      case 'calendar':
        return (
          <View key={key} style={styles.section}>
            {renderSectionHeader("Today's Calendar", 'calendar', calendarEvents.length, () => navigation.navigate('Calendar'))}
            {!collapsed.calendar && (
              <View>
                {calendarEvents.length === 0 ? (
                  <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="calendar-outline" size={28} color={colors.muted} />
                    <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No events today</Text>
                  </View>
                ) : (
                  calendarEvents.map(event => (
                    <View key={event.id} style={[styles.calEventRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.calEventIconBg, { backgroundColor: (event.type === 'task' ? '#3b82f6' : '#10b981') + '15' }]}>
                        <Ionicons
                          name={event.type === 'task' ? 'checkmark-circle-outline' : 'calendar-outline'}
                          size={18}
                          color={event.type === 'task' ? '#3b82f6' : '#10b981'}
                        />
                      </View>
                      <View style={styles.calEventContent}>
                        <Text style={[styles.calEventTitle, { color: colors.text }]} numberOfLines={1}>{event.title}</Text>
                        {event.startTime && (
                          <Text style={[styles.calEventTime, { color: colors.secondary }]}>
                            {formatCalTime(event.startTime)}{event.endTime ? ` - ${formatCalTime(event.endTime)}` : ''}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.calEventBadge, { backgroundColor: (event.type === 'task' ? '#3b82f6' : '#10b981') + '20' }]}>
                        <Text style={[styles.calEventBadgeText, { color: event.type === 'task' ? '#3b82f6' : '#10b981' }]}>
                          {event.type === 'task' ? 'Task' : 'Schedule'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      case 'favourites':
        return (
          <View key={key} style={styles.section}>
            {renderSectionHeader('Favourites', 'favourites', favouriteProjects.length)}
            {!collapsed.favourites && (
              <View>
                {favouriteProjects.length === 0 ? (
                  <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="star-outline" size={28} color={colors.muted} />
                    <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No favourite projects</Text>
                  </View>
                ) : (
                  favouriteProjects.map(project => (
                    <TouchableOpacity
                      key={project.id}
                      style={[styles.favouriteRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => navigation.navigate('Projects', {
                        screen: 'ProjectDetail',
                        params: { projectId: project.id, projectName: project.name },
                      })}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                      <View style={styles.favouriteContent}>
                        <Text style={[styles.favouriteName, { color: colors.text }]} numberOfLines={1}>{project.name}</Text>
                        {project.clientName && (
                          <Text style={[styles.favouriteClient, { color: colors.secondary }]} numberOfLines={1}>{project.clientName}</Text>
                        )}
                      </View>
                      {project.currentSystemPhase && (
                        <View style={[styles.phaseBadge, { backgroundColor: getPhaseColor(project.currentSystemPhase) + '20' }]}>
                          <Text style={[styles.phaseBadgeText, { color: getPhaseColor(project.currentSystemPhase) }]}>
                            {getPhaseLabel(project.currentSystemPhase)}
                          </Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>
        );
      case 'timesheet':
        return (
          <View key={key} style={styles.section}>
            {renderSectionHeader('Timesheet', 'timesheet')}
            {!collapsed.timesheet && (
              <TouchableOpacity
                style={[styles.timesheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => navigation.navigate('Timesheets')}
                activeOpacity={0.7}
              >
                <View style={styles.timesheetCardRow}>
                  <View style={[styles.timesheetIconBg, { backgroundColor: activeTimesheet ? '#22c55e20' : colors.accent + '15' }]}>
                    <Ionicons name="time-outline" size={22} color={activeTimesheet ? '#22c55e' : colors.accent} />
                  </View>
                  <View style={styles.timesheetCardContent}>
                    <Text style={[styles.timesheetCardTitle, { color: colors.text }]}>
                      {activeTimesheet ? 'Currently Clocked In' : 'Not Clocked In'}
                    </Text>
                    <Text style={[styles.timesheetCardSub, { color: colors.secondary }]}>
                      {activeTimesheet
                        ? `${formatTimeSince(activeTimesheet.clockInTime)} elapsed`
                        : 'Tap to view timesheets'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        );
      default:
        return null;
    }
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
        <TouchableOpacity style={styles.headerLeft} onPress={() => setShowUserMenu(true)} activeOpacity={0.7}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarText}>
              {(firstName[0] || '').toUpperCase()}{(lastName[0] || '').toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[styles.greeting, { color: colors.secondary }]}>{getGreeting()}</Text>
            <Text style={[styles.userName, { color: colors.text }]}>{fullDisplayName}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => setShowCustomize(true)}
            style={styles.bellBtn}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openNotifications}
            style={styles.bellBtn}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {visibleTiles.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
            style={styles.categoryScroll}
          >
            {visibleTiles.map(card => (
              <View key={card.key} style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={card.icon} size={22} color={colors.secondary} />
                <Text style={[styles.categoryLabel, { color: colors.text }]}>{card.label}</Text>
                <Text style={[styles.categoryCount, { color: colors.secondary }]}>
                  {card.count > 0 ? `${card.count} new` : '-'}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {activeTimesheet && (
          <View style={[styles.timesheetBanner, { backgroundColor: '#22c55e' + '15', borderColor: '#22c55e' + '40' }]}>
            <View style={styles.timesheetBannerLeft}>
              <View style={[styles.liveDot, { backgroundColor: '#22c55e' }]} />
              <View>
                <Text style={[styles.timesheetBannerTitle, { color: colors.text }]}>Clocked In</Text>
                <Text style={[styles.timesheetBannerSub, { color: colors.secondary }]}>
                  {formatTimeSince(activeTimesheet.clockInTime)}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Timesheets')}>
              <Text style={{ color: '#22c55e', fontWeight: '600', fontSize: 13 }}>View</Text>
            </TouchableOpacity>
          </View>
        )}

        {visibleSections.map(section => renderSection(section.key))}
      </ScrollView>

      <Modal visible={showNotifications} transparent animationType="slide">
        <View style={styles.notifOverlay}>
          <View style={[styles.notifSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={[styles.notifHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Text style={[styles.notifHeaderTitle, { color: colors.text }]}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Ionicons name="close" size={24} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={notifications}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              ListEmptyComponent={
                <View style={styles.notifEmpty}>
                  <Ionicons name="notifications-off-outline" size={40} color={colors.muted} />
                  <Text style={[styles.notifEmptyText, { color: colors.secondary }]}>No notifications</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.notifRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }, !item.isRead && { backgroundColor: isDark ? '#1e3a5f20' : '#eff6ff' }]}>
                  <View style={[styles.notifIcon, { backgroundColor: colors.accent + '15' }]}>
                    <Ionicons name={getNotifIcon(item.type)} size={18} color={colors.accent} />
                  </View>
                  <View style={styles.notifContent}>
                    <Text style={[styles.notifTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                    {item.message && (
                      <Text style={[styles.notifMsg, { color: colors.secondary }]} numberOfLines={2}>{item.message}</Text>
                    )}
                    <Text style={[styles.notifTime, { color: colors.muted }]}>{formatTimeAgo(item.createdAt)}</Text>
                  </View>
                  {!item.isRead && <View style={[styles.notifDot, { backgroundColor: colors.accent }]} />}
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showUserMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.userMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowUserMenu(false)}
        >
          <View style={[styles.userMenuSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: colors.border }]}>
            <View style={[styles.userMenuProfile, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <View style={[styles.avatarCircle, { backgroundColor: colors.accent }]}>
                <Text style={styles.avatarText}>
                  {(firstName[0] || '').toUpperCase()}{(lastName[0] || '').toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={[styles.userMenuName, { color: colors.text }]}>{fullDisplayName}</Text>
                <Text style={[styles.userMenuEmail, { color: colors.secondary }]}>{user?.email}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.userMenuItem}
              onPress={() => {
                setShowUserMenu(false);
                logout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.secondary} />
              <Text style={[styles.userMenuItemText, { color: colors.text }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showCustomize} animationType="slide" presentationStyle="pageSheet">
        <CustomizeHomeScreen
          navigation={{
            goBack: () => {
              setShowCustomize(false);
              fetchData();
            },
          } as any}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  greeting: { fontSize: 12 },
  userName: { fontSize: 18, fontWeight: '700', marginTop: 1 },
  bellBtn: {
    padding: 8,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  categoryScroll: {
    marginTop: 16,
    marginBottom: 8,
  },
  categoryRow: {
    paddingHorizontal: 16,
    gap: 10,
  },
  categoryCard: {
    width: 100,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryCount: {
    fontSize: 12,
  },
  timesheetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  timesheetBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timesheetBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  timesheetBannerSub: {
    fontSize: 12,
    marginTop: 1,
  },
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptySection: {
    marginHorizontal: 16,
    paddingVertical: 24,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptySectionText: {
    fontSize: 13,
  },
  taskGroup: {
    marginBottom: 8,
  },
  taskGroupLabel: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  priorityStrip: {
    width: 3,
    alignSelf: 'stretch',
  },
  taskContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  taskDue: {
    fontSize: 12,
    fontWeight: '500',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  activityMsg: {
    fontSize: 12,
    marginTop: 1,
  },
  activityTime: {
    fontSize: 11,
  },
  calEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  calEventIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calEventContent: {
    flex: 1,
  },
  calEventTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  calEventTime: {
    fontSize: 12,
    marginTop: 2,
  },
  calEventBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  calEventBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  favouriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  favouriteContent: {
    flex: 1,
  },
  favouriteName: {
    fontSize: 14,
    fontWeight: '500',
  },
  favouriteClient: {
    fontSize: 12,
    marginTop: 1,
  },
  phaseBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  phaseBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  timesheetCard: {
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  timesheetCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timesheetIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timesheetCardContent: {
    flex: 1,
  },
  timesheetCardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  timesheetCardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  notifOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  notifSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  notifHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  notifEmpty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  notifEmptyText: {
    fontSize: 15,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notifContent: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  notifMsg: {
    fontSize: 13,
    marginTop: 2,
  },
  notifTime: {
    fontSize: 11,
    marginTop: 4,
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  userMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingTop: 110,
    paddingHorizontal: 16,
  },
  userMenuSheet: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  userMenuProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  userMenuName: {
    fontSize: 15,
    fontWeight: '600',
  },
  userMenuEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  userMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  userMenuItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
