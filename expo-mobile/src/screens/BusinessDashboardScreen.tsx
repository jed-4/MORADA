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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../services/api';
import { toLocalDateStr, dateStrOf } from '../lib/dates';

import { useTheme } from '../theme';
interface Project {
  id: string;
  status?: string;
  projectSubStatus?: string;
}

interface Task {
  id: string;
  status?: string;
}

interface TimesheetEntry {
  id: string;
  date: string;
  duration: string;
  status: string;
  isActive?: boolean;
  clockInTime?: string;
}

export default function BusinessDashboardScreen({ navigation }: any) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);

  const theme = useTheme();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
};

  const fetchData = useCallback(async () => {
    try {
      const [projectsData, tasksData, timesheetsData] = await Promise.all([
        apiFetch<Project[]>('/api/projects').catch(() => []),
        apiFetch<Task[]>('/api/tasks').catch(() => []),
        apiFetch<TimesheetEntry[]>('/api/timesheets').catch(() => []),
      ]);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setTimesheets(Array.isArray(timesheetsData) ? timesheetsData : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const activeProjects = projects.filter(p =>
    !['completed', 'cancelled', 'Completed', 'Cancelled'].includes(p.status || '') &&
    !['Completed', 'Cancelled'].includes(p.projectSubStatus || '')
  ).length;

  const openTasks = tasks.filter(t => !['completed', 'done', 'Completed', 'Done'].includes(t.status || '')).length;

  // Current week starting Monday (Australian convention), compared on local calendar days
  const now = new Date();
  const day = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = toLocalDateStr(weekStart);
  const weekEndStr = toLocalDateStr(weekEnd);

  const hoursThisWeek = timesheets.reduce((sum, ts) => {
    const dayStr = dateStrOf(ts.date);
    if (!dayStr || dayStr < weekStartStr || dayStr > weekEndStr) return sum;
    return sum + (parseFloat(ts.duration) || 0);
  }, 0);

  // Only timers that are actually running (isActive) — a completed entry keeps
  // its clockInTime, so that alone must not count as an active timer.
  const activeTimers = timesheets.filter(ts => ts.isActive).length;

  const screenWidth = Dimensions.get('window').width;
  const tileSize = Math.floor((screenWidth - 32 - 30) / 4);

  const statTiles = [
    { label: 'Active Projects', value: activeProjects, icon: 'briefcase-outline' as keyof typeof Ionicons.glyphMap, color: theme.statusInfo },
    { label: 'Open Tasks', value: openTasks, icon: 'checkbox-outline' as keyof typeof Ionicons.glyphMap, color: theme.amber },
    { label: 'Hours (Week)', value: hoursThisWeek.toFixed(1), icon: 'time-outline' as keyof typeof Ionicons.glyphMap, color: theme.sage },
    { label: 'Active Timers', value: activeTimers, icon: 'timer-outline' as keyof typeof Ionicons.glyphMap, color: theme.primary },
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
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Business Dashboard</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.statRow}>
          {statTiles.map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, width: tileSize, height: tileSize }]}>
              <View style={[styles.statIconBg, { backgroundColor: stat.color + '15' }]}>
                <Ionicons name={stat.icon} size={20} color={stat.color} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.secondary }]} numberOfLines={2}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="business-outline" size={32} color={colors.muted} style={{ marginBottom: 12 }} />
          <Text style={[styles.infoTitle, { color: colors.text }]}>Company Overview</Text>
          <Text style={[styles.infoSub, { color: colors.secondary }]}>
            Showing aggregated stats across all projects and team members.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: 16 },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 10, fontWeight: '500', marginTop: 2, textAlign: 'center' },
  infoCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  infoSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
