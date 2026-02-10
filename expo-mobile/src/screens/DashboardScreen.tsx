import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Project {
  id: string;
  name: string;
  projectNumber?: string;
  clientName?: string;
  currentSystemPhase?: string;
  projectSubStatus?: string;
  address?: string;
}

interface Task {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  projectId?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function DashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb' };

  const fetchData = useCallback(async () => {
    try {
      const [projectsData, tasksData] = await Promise.all([
        apiFetch<Project[]>('/api/projects'),
        apiFetch<Task[]>('/api/tasks').catch(() => []),
      ]);
      setProjects(projectsData || []);
      const myTasks = (tasksData || []).filter((t: any) =>
        t.assignees?.some?.((a: any) => a.userId === user?.id) || t.ownerId === user?.id
      );
      setTasks(myTasks.slice(0, 5));
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

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

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'there';
  const activeProjects = projects.filter(p => p.currentSystemPhase !== 'completed');

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.secondary }]}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}
          </Text>
          <Text style={[styles.userName, { color: colors.text }]}>{firstName}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: colors.accent }]}>{activeProjects.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondary }]}>Active Projects</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: colors.accent }]}>{tasks.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondary }]}>My Tasks</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: colors.accent }]}>{projects.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondary }]}>Total Projects</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Projects</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '500' }}>View All</Text>
            </TouchableOpacity>
          </View>

          {activeProjects.slice(0, 4).map((project) => (
            <TouchableOpacity
              key={project.id}
              style={[styles.projectCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => navigation.navigate('ProjectDetail', { projectId: project.id, projectName: project.name })}
              activeOpacity={0.7}
            >
              <View style={styles.projectCardTop}>
                <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                  {project.name}
                </Text>
                <View style={[styles.phaseBadge, { backgroundColor: getPhaseColor(project.currentSystemPhase) + '20' }]}>
                  <Text style={[styles.phaseBadgeText, { color: getPhaseColor(project.currentSystemPhase) }]}>
                    {getPhaseLabel(project.currentSystemPhase)}
                  </Text>
                </View>
              </View>
              {project.clientName && (
                <Text style={[styles.projectClient, { color: colors.secondary }]} numberOfLines={1}>
                  {project.clientName}
                </Text>
              )}
              {project.address && (
                <View style={styles.projectAddress}>
                  <Ionicons name="location-outline" size={12} color={colors.secondary} />
                  <Text style={[styles.projectAddressText, { color: colors.secondary }]} numberOfLines={1}>
                    {project.address}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}

          {activeProjects.length === 0 && !loading && (
            <Text style={[styles.emptyText, { color: colors.secondary }]}>No active projects</Text>
          )}
        </View>

        {tasks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>My Tasks</Text>
            {tasks.map((task) => (
              <View
                key={task.id}
                style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>
                    {task.title}
                  </Text>
                  {task.dueDate && (
                    <Text style={[styles.taskDue, { color: colors.secondary }]}>
                      Due: {new Date(task.dueDate).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  greeting: { fontSize: 13 },
  userName: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  logoutBtn: { padding: 8 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  statNumber: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  projectCard: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  projectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  projectName: { fontSize: 15, fontWeight: '600', flex: 1 },
  phaseBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  phaseBadgeText: { fontSize: 11, fontWeight: '500' },
  projectClient: { fontSize: 13, marginTop: 4 },
  projectAddress: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  projectAddressText: { fontSize: 12 },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  taskDue: { fontSize: 12, marginTop: 2 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
});
