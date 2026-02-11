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
import { apiFetch } from '../services/api';
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
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb' };

  const fetchData = useCallback(async () => {
    try {
      const [projectData, tasksData] = await Promise.all([
        apiFetch<Project>(`/api/projects/${projectId}`),
        apiFetch<Task[]>(`/api/projects/${projectId}/tasks`).catch(() => []),
      ]);
      setProject(projectData);
      setTasks(tasksData || []);
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
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleRow}>
              {project.projectNumber && (
                <Text style={[styles.projectNumber, { color: colors.accent }]}>#{project.projectNumber}</Text>
              )}
              <Text style={[styles.heroTitle, { color: colors.text }]}>{project.name}</Text>
            </View>
            <View style={[styles.phaseBadge, { backgroundColor: getPhaseColor(project.currentSystemPhase) + '20' }]}>
              <Text style={[styles.phaseBadgeText, { color: getPhaseColor(project.currentSystemPhase) }]}>
                {getPhaseLabel(project.currentSystemPhase)}
              </Text>
            </View>
          </View>

          {project.description && (
            <Text style={[styles.description, { color: colors.secondary }]} numberOfLines={3}>
              {project.description}
            </Text>
          )}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Details</Text>

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

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Quick Actions</Text>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}
            onPress={() => navigation.navigate('SiteDiary', { projectId, projectName: project.name })}
          >
            <Ionicons name="book-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Site Diary</Text>
              <Text style={[styles.actionButtonSub, { color: colors.secondary }]}>Record daily activities</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </TouchableOpacity>
        </View>

        {tasks.length > 0 && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Tasks ({tasks.length})</Text>
            {tasks.slice(0, 10).map((task) => (
              <View key={task.id} style={[styles.taskRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
                {task.status && (
                  <Text style={[styles.taskStatus, { color: colors.secondary }]}>{task.status}</Text>
                )}
              </View>
            ))}
            {tasks.length > 10 && (
              <Text style={[styles.moreText, { color: colors.accent }]}>+{tasks.length - 10} more tasks</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  heroCard: {
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  heroTitleRow: { flex: 1, gap: 2 },
  projectNumber: { fontSize: 12, fontWeight: '600' },
  heroTitle: { fontSize: 20, fontWeight: '700' },
  phaseBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  phaseBadgeText: { fontSize: 12, fontWeight: '500' },
  description: { fontSize: 14, marginTop: 10, lineHeight: 20 },
  infoCard: {
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 14 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  infoValue: { fontSize: 14 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { flex: 1, fontSize: 14 },
  taskStatus: { fontSize: 12 },
  moreText: { fontSize: 13, fontWeight: '500', marginTop: 10, textAlign: 'center' },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionButtonText: { fontSize: 15, fontWeight: '600' },
  actionButtonSub: { fontSize: 12, marginTop: 1 },
});
