import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

interface Project {
  id: string;
  name: string;
  projectNumber?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  currentSystemPhase?: string;
  projectSubStatus?: string;
  address?: string;
  startDate?: string;
  endDate?: string;
  estimatedValue?: number;
  description?: string;
}

interface Task {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

export default function ProjectDetailScreen({ navigation, route }: Props) {
  const { projectId } = route.params as { projectId: string };
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    projectInfo: false,
    tasks: false,
    schedule: false,
    siteDiary: false,
    checklists: true,
  });

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1' };

  const fetchData = useCallback(async () => {
    try {
      const [projectData, tasksData, scheduleData, collapsedPrefs] = await Promise.all([
        apiFetch<Project>(`/api/projects/${projectId}`),
        apiFetch<Task[]>(`/api/projects/${projectId}/tasks`).catch(() => []),
        apiFetch<ScheduleItem[]>(`/api/projects/${projectId}/schedule-items`).catch(() => []),
        apiFetch<any>('/api/user-view-preferences/mobile-project-detail-collapsed').catch(() => null),
      ]);
      setProject(projectData);
      setTasks(tasksData || []);
      setScheduleItems(scheduleData || []);
      if (collapsedPrefs?.preferences) {
        setCollapsed(prev => ({ ...prev, ...collapsedPrefs.preferences }));
      }
    } catch (e) {
      console.error('Failed to fetch project:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const toggleSection = (key: string) => {
    setCollapsed(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      apiRequest('/api/user-view-preferences/mobile-project-detail-collapsed', 'PUT', { preferences: updated }).catch(() => {});
      return updated;
    });
  };

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
      case 'pre_construction': return 'Pre-Construction';
      case 'construction': return 'Construction';
      case 'completed': return 'Completed';
      default: return 'Unknown';
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

  const formatCurrency = (amount?: number) => {
    if (!amount) return null;
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount);
  };

  const categoryTiles: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; count: number }[] = [
    { key: 'tasks', icon: 'checkbox-outline', label: 'Tasks', count: tasks.length },
    { key: 'schedule', icon: 'calendar-outline', label: 'Schedule', count: scheduleItems.length },
    { key: 'siteDiary', icon: 'book-outline', label: 'Site Diary', count: 0 },
    { key: 'checklists', icon: 'checkmark-done-outline', label: 'Checklists', count: 0 },
    { key: 'budget', icon: 'cash-outline', label: 'Budget', count: 0 },
  ];

  const handleTileTap = (key: string) => {
    if (!project) return;
    switch (key) {
      case 'siteDiary':
        navigation.navigate('SiteDiary', { projectId, projectName: project.name });
        break;
      case 'schedule':
        navigation.navigate('Schedule');
        break;
      case 'checklists':
        navigation.navigate('Checklists', { projectId });
        break;
      default:
        if (collapsed[key]) {
          setCollapsed(prev => {
            const updated = { ...prev, [key]: false };
            apiRequest('/api/user-view-preferences/mobile-project-detail-collapsed', 'PUT', { preferences: updated }).catch(() => {});
            return updated;
          });
        }
        break;
    }
  };

  const renderSectionHeader = (title: string, key: string, count?: number) => (
    <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(key)} activeOpacity={0.7}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.sectionHeaderRight}>
        {count !== undefined && count > 0 && (
          <View style={[styles.sectionBadge, { backgroundColor: colors.accent + '20' }]}>
            <Text style={[styles.sectionBadgeText, { color: colors.accent }]}>{count}</Text>
          </View>
        )}
        <Ionicons name={collapsed[key] ? 'chevron-forward' : 'chevron-down'} size={18} color={colors.secondary} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.secondary }}>Project not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.compactHeader}>
          <View style={styles.compactHeaderLeft}>
            {project.projectNumber && (
              <Text style={[styles.projectNumber, { color: colors.accent }]}>#{project.projectNumber}</Text>
            )}
            <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={2}>{project.name}</Text>
          </View>
          <View style={[styles.phaseBadge, { backgroundColor: getPhaseColor(project.currentSystemPhase) + '20' }]}>
            <Text style={[styles.phaseBadgeText, { color: getPhaseColor(project.currentSystemPhase) }]}>
              {getPhaseLabel(project.currentSystemPhase)}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tilesRow}
          style={styles.tilesScroll}
        >
          {categoryTiles.map(tile => (
            <TouchableOpacity
              key={tile.key}
              style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleTileTap(tile.key)}
              activeOpacity={0.7}
            >
              {tile.count > 0 && (
                <View style={[styles.tileBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.tileBadgeText}>{tile.count}</Text>
                </View>
              )}
              <Ionicons name={tile.icon} size={22} color={colors.accent} />
              <Text style={[styles.tileLabel, { color: colors.secondary }]}>{tile.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.section}>
          {renderSectionHeader('Project Info', 'projectInfo')}
          {!collapsed.projectInfo && (
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {project.clientName && (
                <View style={styles.infoRow}>
                  <Ionicons name="person-outline" size={16} color={colors.secondary} />
                  <View style={styles.infoText}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Client</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{project.clientName}</Text>
                  </View>
                </View>
              )}
              {project.address && (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={colors.secondary} />
                  <View style={styles.infoText}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Address</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{project.address}</Text>
                  </View>
                </View>
              )}
              {project.clientEmail && (
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={16} color={colors.secondary} />
                  <View style={styles.infoText}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Email</Text>
                    <Text style={[styles.infoValue, { color: colors.accent }]}>{project.clientEmail}</Text>
                  </View>
                </View>
              )}
              {project.clientPhone && (
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={16} color={colors.secondary} />
                  <View style={styles.infoText}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Phone</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{project.clientPhone}</Text>
                  </View>
                </View>
              )}
              {project.estimatedValue && (
                <View style={styles.infoRow}>
                  <Ionicons name="cash-outline" size={16} color={colors.secondary} />
                  <View style={styles.infoText}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Value</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{formatCurrency(project.estimatedValue)}</Text>
                  </View>
                </View>
              )}
              {(project.startDate || project.endDate) && (
                <View style={styles.infoRow}>
                  <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                  <View style={styles.infoText}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Timeline</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'}
                      {' to '}
                      {project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          {renderSectionHeader('Tasks', 'tasks', tasks.length)}
          {!collapsed.tasks && (
            <View>
              {tasks.length === 0 ? (
                <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="checkbox-outline" size={28} color={colors.muted} />
                  <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No tasks for this project</Text>
                </View>
              ) : (
                tasks.slice(0, 10).map(task => (
                  <View key={task.id} style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                    <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
                    {task.status && (
                      <Text style={[styles.taskStatus, { color: colors.secondary }]}>{task.status}</Text>
                    )}
                  </View>
                ))
              )}
              {tasks.length > 10 && (
                <Text style={[styles.moreText, { color: colors.accent }]}>+{tasks.length - 10} more tasks</Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          {renderSectionHeader('Schedule', 'schedule', scheduleItems.length)}
          {!collapsed.schedule && (
            <View>
              {scheduleItems.length === 0 ? (
                <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="calendar-outline" size={28} color={colors.muted} />
                  <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No schedule items</Text>
                </View>
              ) : (
                scheduleItems.slice(0, 10).map(item => (
                  <View key={item.id} style={[styles.scheduleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.scheduleContent}>
                      <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                      {item.startDate && (
                        <Text style={[styles.scheduleDate, { color: colors.secondary }]}>
                          {new Date(item.startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          {item.endDate ? ` - ${new Date(item.endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                        </Text>
                      )}
                    </View>
                    {item.status && (
                      <Text style={[styles.scheduleStatus, { color: colors.muted }]}>{item.status}</Text>
                    )}
                  </View>
                ))
              )}
              {scheduleItems.length > 10 && (
                <Text style={[styles.moreText, { color: colors.accent }]}>+{scheduleItems.length - 10} more items</Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          {renderSectionHeader('Site Diary', 'siteDiary')}
          {!collapsed.siteDiary && (
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => navigation.navigate('SiteDiary', { projectId, projectName: project.name })}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBg, { backgroundColor: colors.accent + '15' }]}>
                <Ionicons name="book-outline" size={22} color={colors.accent} />
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>Site Diary</Text>
                <Text style={[styles.actionSub, { color: colors.secondary }]}>Record daily activities</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          {renderSectionHeader('Checklists', 'checklists')}
          {!collapsed.checklists && (
            <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="checkmark-done-outline" size={28} color={colors.muted} />
              <Text style={[styles.emptySectionText, { color: colors.secondary }]}>Coming soon</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
  },
  compactHeaderLeft: { flex: 1, gap: 2 },
  projectNumber: { fontSize: 12, fontWeight: '600' },
  projectName: { fontSize: 18, fontWeight: '700' },
  phaseBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  phaseBadgeText: { fontSize: 12, fontWeight: '500' },
  tilesScroll: { marginBottom: 16 },
  tilesRow: { gap: 10, paddingRight: 4 },
  tile: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  tileBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tileBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  tileLabel: { fontSize: 11, fontWeight: '500' },
  section: { marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  sectionBadgeText: { fontSize: 12, fontWeight: '600' },
  sectionCard: {
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  infoValue: { fontSize: 14 },
  emptySection: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  emptySectionText: { fontSize: 13 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 10,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { flex: 1, fontSize: 14 },
  taskStatus: { fontSize: 12 },
  moreText: { fontSize: 13, fontWeight: '500', marginTop: 4, textAlign: 'center', marginBottom: 4 },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 10,
  },
  scheduleContent: { flex: 1 },
  scheduleTitle: { fontSize: 14, fontWeight: '500' },
  scheduleDate: { fontSize: 12, marginTop: 2 },
  scheduleStatus: { fontSize: 12 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    marginBottom: 4,
  },
  actionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600' },
  actionSub: { fontSize: 12, marginTop: 1 },
});
