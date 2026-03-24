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

interface ChecklistInstance {
  id: string;
  name: string;
  status: 'active' | 'in_progress' | 'completed' | 'cancelled';
  completedCount: number;
  totalCount: number;
}

interface ChecklistItem {
  id: string;
  instanceId: string;
  groupId?: string;
  groupName?: string;
  description: string;
  order: number;
  isRequired: boolean;
  status: 'pending' | 'completed' | 'na';
}

interface SiteDiaryEntry {
  id: string;
  title?: string;
  entryDateTime?: string;
  weather?: { condition?: string; temp?: number } | null;
  notes?: string;
  createdByName?: string;
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
  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstance[]>([]);
  const [expandedChecklist, setExpandedChecklist] = useState<string | null>(null);
  const [checklistItems, setChecklistItems] = useState<Record<string, ChecklistItem[]>>({});
  const [loadingChecklistItems, setLoadingChecklistItems] = useState<Record<string, boolean>>({});
  const [collapsedChecklistGroups, setCollapsedChecklistGroups] = useState<Record<string, boolean>>({});
  const [siteDiaryEntries, setSiteDiaryEntries] = useState<SiteDiaryEntry[]>([]);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1' };

  const fetchData = useCallback(async () => {
    try {
      const [projectData, tasksData, scheduleData, collapsedPrefs, checklistData, diaryData] = await Promise.all([
        apiFetch<Project>(`/api/projects/${projectId}`),
        apiFetch<Task[]>(`/api/tasks?projectId=${projectId}`).catch(() => []),
        apiFetch<ScheduleItem[]>(`/api/projects/${projectId}/schedule-items`).catch(() => []),
        apiFetch<any>('/api/user-view-preferences/mobile-project-detail-collapsed').catch(() => null),
        apiFetch<ChecklistInstance[]>(`/api/checklist-instances?projectId=${projectId}`).catch(() => []),
        apiFetch<SiteDiaryEntry[]>(`/api/projects/${projectId}/site-diary-entries`).catch(() => []),
      ]);
      setProject(projectData);
      setTasks((tasksData || []).filter((t: Task) => t.type === 'task'));
      setScheduleItems(scheduleData || []);
      setChecklistInstances(checklistData || []);
      setSiteDiaryEntries((diaryData || []).slice(0, 8));
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
    setChecklistItems({});
    setLoadingChecklistItems({});
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

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const dateOnlyStr = (dateStr?: string) => {
    if (!dateStr) return '';
    return dateStr.slice(0, 10);
  };

  const todayStr = getTodayStr();
  const tomorrowStr = getTomorrowStr();

  const todayTasks = tasks.filter(t => dateOnlyStr(t.dueDate) === todayStr);
  const tasksToShow = todayTasks.length > 0 ? todayTasks : tasks.slice(0, 10);
  const tasksSectionTitle = todayTasks.length > 0 ? 'Tasks — Today' : 'Tasks';

  const nearScheduleItems = scheduleItems.filter(item => {
    const start = dateOnlyStr(item.startDate);
    const end = dateOnlyStr(item.endDate) || start;
    return (start <= tomorrowStr && end >= todayStr);
  });
  const scheduleToShow = nearScheduleItems.length > 0 ? nearScheduleItems : scheduleItems.slice(0, 10);
  const scheduleSectionTitle = nearScheduleItems.length > 0 ? 'Schedule — Today & Tomorrow' : 'Schedule';

  const getWeatherIcon = (condition?: string): keyof typeof Ionicons.glyphMap => {
    if (!condition) return 'partly-sunny-outline';
    const c = condition.toLowerCase();
    if (c.includes('rain') || c.includes('shower')) return 'rainy-outline';
    if (c.includes('storm') || c.includes('thunder')) return 'thunderstorm-outline';
    if (c.includes('cloud') || c.includes('overcast')) return 'cloudy-outline';
    if (c.includes('sun') || c.includes('clear') || c.includes('fine')) return 'sunny-outline';
    if (c.includes('wind')) return 'flag-outline';
    if (c.includes('snow')) return 'snow-outline';
    return 'partly-sunny-outline';
  };

  const formatDiaryDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const categoryTiles: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; showCount: boolean; count?: number }[] = [
    { key: 'tasks', icon: 'checkbox-outline', label: 'Tasks', showCount: true, count: tasks.length },
    { key: 'schedule', icon: 'calendar-outline', label: 'Schedule', showCount: false },
    { key: 'siteDiary', icon: 'book-outline', label: 'Site Diary', showCount: false },
    { key: 'checklists', icon: 'checkmark-done-outline', label: 'Checklists', showCount: false },
  ];

  const handleTileTap = (key: string) => {
    if (!project) return;
    switch (key) {
      case 'siteDiary':
        navigation.navigate('SiteDiary', { projectId, projectName: project.name });
        break;
      case 'schedule':
        navigation.navigate('Schedule', { projectId });
        break;
      case 'checklists':
        navigation.navigate('Checklists', { projectId });
        break;
      case 'tasks':
        navigation.navigate('ProjectTasks', { projectId, projectName: project.name });
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

  const fetchChecklistItems = async (instanceId: string) => {
    if (checklistItems[instanceId]) return;
    setLoadingChecklistItems(prev => ({ ...prev, [instanceId]: true }));
    try {
      const items = await apiFetch<ChecklistItem[]>(`/api/checklist-instances/${instanceId}/items`);
      setChecklistItems(prev => ({ ...prev, [instanceId]: items || [] }));
    } catch {
      setChecklistItems(prev => ({ ...prev, [instanceId]: [] }));
    } finally {
      setLoadingChecklistItems(prev => ({ ...prev, [instanceId]: false }));
    }
  };

  const toggleChecklistExpand = (instanceId: string) => {
    if (expandedChecklist === instanceId) {
      setExpandedChecklist(null);
    } else {
      setExpandedChecklist(instanceId);
      fetchChecklistItems(instanceId);
    }
  };

  const toggleChecklistItem = (item: ChecklistItem) => {
    if (item.status === 'na') return;
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    setChecklistItems(prev => ({
      ...prev,
      [item.instanceId]: (prev[item.instanceId] || []).map(i => i.id === item.id ? { ...i, status: newStatus } : i),
    }));
    const delta = newStatus === 'completed' ? 1 : -1;
    setChecklistInstances(prev => prev.map(inst => inst.id === item.instanceId ? { ...inst, completedCount: Math.max(0, inst.completedCount + delta) } : inst));
    apiRequest(`/api/checklist-instance-items/${item.id}`, 'PATCH', { status: newStatus }).catch(() => {
      setChecklistItems(prev => ({
        ...prev,
        [item.instanceId]: (prev[item.instanceId] || []).map(i => i.id === item.id ? { ...i, status: item.status } : i),
      }));
      setChecklistInstances(prev => prev.map(inst => inst.id === item.instanceId ? { ...inst, completedCount: Math.max(0, inst.completedCount - delta) } : inst));
    });
  };

  const toggleChecklistGroup = (groupKey: string) => {
    setCollapsedChecklistGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const groupChecklistItems = (items: ChecklistItem[]) => {
    const groups: Record<string, ChecklistItem[]> = {};
    const ungrouped: ChecklistItem[] = [];
    for (const item of items) {
      if (item.groupName) {
        if (!groups[item.groupName]) groups[item.groupName] = [];
        groups[item.groupName].push(item);
      } else {
        ungrouped.push(item);
      }
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.order - b.order);
    }
    ungrouped.sort((a, b) => a.order - b.order);
    return { groups, ungrouped };
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
              {tile.showCount && tile.count != null && tile.count > 0 && (
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
          {renderSectionHeader(tasksSectionTitle, 'tasks', tasks.length)}
          {!collapsed.tasks && (
            <View>
              {tasksToShow.length === 0 ? (
                <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="checkbox-outline" size={28} color={colors.muted} />
                  <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No tasks for this project</Text>
                </View>
              ) : (
                tasksToShow.map(task => (
                  <View key={task.id} style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                    <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
                    {task.status && (
                      <Text style={[styles.taskStatus, { color: colors.secondary }]}>{task.status.replace(/_/g, ' ')}</Text>
                    )}
                  </View>
                ))
              )}
              <TouchableOpacity
                style={[styles.viewAllBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate('ProjectTasks', { projectId, projectName: project.name })}
                activeOpacity={0.7}
              >
                <Text style={[styles.viewAllBtnText, { color: colors.accent }]}>View All Tasks</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          {renderSectionHeader(scheduleSectionTitle, 'schedule')}
          {!collapsed.schedule && (
            <View>
              {scheduleToShow.length === 0 ? (
                <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="calendar-outline" size={28} color={colors.muted} />
                  <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No schedule items</Text>
                </View>
              ) : (
                scheduleToShow.map(item => (
                  <View key={item.id} style={[styles.scheduleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.scheduleContent}>
                      <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                      {item.startDate && (
                        <Text style={[styles.scheduleDate, { color: colors.secondary }]}>
                          {new Date(item.startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          {item.endDate ? ` – ${new Date(item.endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                        </Text>
                      )}
                    </View>
                    {item.status && (
                      <Text style={[styles.scheduleStatus, { color: colors.muted }]}>{item.status.replace(/_/g, ' ')}</Text>
                    )}
                  </View>
                ))
              )}
              <TouchableOpacity
                style={[styles.viewAllBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate('Schedule', { projectId })}
                activeOpacity={0.7}
              >
                <Text style={[styles.viewAllBtnText, { color: colors.accent }]}>View Full Schedule</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <TouchableOpacity style={styles.sectionHeaderRowLeft} onPress={() => toggleSection('siteDiary')} activeOpacity={0.7}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Site Diary</Text>
              <Ionicons name={collapsed.siteDiary ? 'chevron-forward' : 'chevron-down'} size={18} color={colors.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sectionActionBtn, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]}
              onPress={() => navigation.navigate('SiteDiary', { projectId, projectName: project.name })}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={14} color={colors.accent} />
              <Text style={[styles.sectionActionBtnText, { color: colors.accent }]}>New Entry</Text>
            </TouchableOpacity>
          </View>
          {!collapsed.siteDiary && (
            <View>
              {siteDiaryEntries.length === 0 ? (
                <TouchableOpacity
                  style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => navigation.navigate('SiteDiary', { projectId, projectName: project.name })}
                  activeOpacity={0.7}
                >
                  <Ionicons name="book-outline" size={28} color={colors.muted} />
                  <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No diary entries yet</Text>
                  <Text style={[styles.emptySectionText, { color: colors.accent, fontSize: 12 }]}>Tap to add first entry</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.diaryCarouselRow}
                    style={{ flexShrink: 0, flexGrow: 0 }}
                  >
                    {siteDiaryEntries.map(entry => (
                      <TouchableOpacity
                        key={entry.id}
                        style={[styles.diaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => navigation.navigate('SiteDiary', { projectId, projectName: project.name })}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.diaryCardDate, { color: colors.secondary }]}>
                          {formatDiaryDate(entry.entryDateTime)}
                        </Text>
                        <Text style={[styles.diaryCardTitle, { color: colors.text }]} numberOfLines={2}>
                          {entry.title || 'Site Diary Entry'}
                        </Text>
                        {entry.weather?.condition && (
                          <View style={styles.diaryCardWeather}>
                            <Ionicons name={getWeatherIcon(entry.weather.condition)} size={13} color={colors.secondary} />
                            <Text style={[styles.diaryCardWeatherText, { color: colors.secondary }]}>
                              {entry.weather.condition}{entry.weather.temp != null ? ` ${entry.weather.temp}°` : ''}
                            </Text>
                          </View>
                        )}
                        {entry.createdByName && (
                          <Text style={[styles.diaryCardAuthor, { color: colors.muted }]} numberOfLines={1}>
                            {entry.createdByName}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.diaryCardViewAll, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '30' }]}
                      onPress={() => navigation.navigate('SiteDiary', { projectId, projectName: project.name })}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="book-outline" size={22} color={colors.accent} />
                      <Text style={[styles.diaryCardViewAllText, { color: colors.accent }]}>All Entries</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </>
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          {renderSectionHeader('Checklists', 'checklists')}
          {!collapsed.checklists && (
            checklistInstances.length === 0 ? (
              <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="checkmark-done-outline" size={28} color={colors.muted} />
                <Text style={[styles.emptySectionText, { color: colors.secondary }]}>No checklists</Text>
              </View>
            ) : (
              checklistInstances.map(inst => {
                const isExpanded = expandedChecklist === inst.id;
                const progress = inst.totalCount > 0 ? inst.completedCount / inst.totalCount : 0;
                const statusColor = inst.status === 'completed' ? '#22c55e' : inst.status === 'in_progress' ? '#3b82f6' : inst.status === 'cancelled' ? '#ef4444' : '#94a3b8';
                return (
                  <View key={inst.id} style={[styles.checklistCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TouchableOpacity onPress={() => toggleChecklistExpand(inst.id)} style={styles.checklistHeader} activeOpacity={0.7}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.checklistName, { color: colors.text }]} numberOfLines={1}>{inst.name}</Text>
                          <View style={[styles.checklistStatusBadge, { backgroundColor: statusColor + '20' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: statusColor }}>{inst.status.replace('_', ' ')}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.checklistProgress, { backgroundColor: colors.border }]}>
                            <View style={[styles.checklistProgressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: progress === 1 ? '#22c55e' : colors.accent }]} />
                          </View>
                          <Text style={{ fontSize: 11, color: colors.secondary }}>{inst.completedCount}/{inst.totalCount}</Text>
                        </View>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                    </TouchableOpacity>
                    {isExpanded && (
                      loadingChecklistItems[inst.id] ? (
                        <View style={{ padding: 16, alignItems: 'center' }}><ActivityIndicator size="small" color={colors.accent} /></View>
                      ) : (() => {
                        const items = checklistItems[inst.id] || [];
                        if (items.length === 0) return <View style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: colors.secondary, fontSize: 12 }}>No items</Text></View>;
                        const { groups, ungrouped } = groupChecklistItems(items);
                        const groupKeys = Object.keys(groups).map(g => `${inst.id}:${g}`);
                        const allCollapsed = groupKeys.length > 0 && groupKeys.every(k => collapsedChecklistGroups[k]);
                        return (
                          <View style={[styles.checklistItemsWrap, { borderTopColor: colors.border }]}>
                            {groupKeys.length > 1 && (
                              <TouchableOpacity onPress={() => {
                                const newState = !allCollapsed;
                                setCollapsedChecklistGroups(prev => {
                                  const updated = { ...prev };
                                  groupKeys.forEach(k => { updated[k] = newState; });
                                  return updated;
                                });
                              }} style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }} activeOpacity={0.7}>
                                <Ionicons name={allCollapsed ? 'chevron-down' : 'chevron-up'} size={11} color={colors.secondary} />
                                <Text style={{ fontSize: 10, color: colors.secondary, fontWeight: '500' }}>{allCollapsed ? 'Expand All' : 'Collapse All'}</Text>
                              </TouchableOpacity>
                            )}
                            {ungrouped.map(item => (
                              <TouchableOpacity key={item.id} style={[styles.checklistItemRow, { borderColor: colors.border }]} onPress={() => toggleChecklistItem(item)} activeOpacity={0.7} disabled={item.status === 'na'}>
                                <Ionicons name={item.status === 'completed' ? 'checkbox' : item.status === 'na' ? 'remove-circle-outline' : 'square-outline'} size={20} color={item.status === 'completed' ? '#22c55e' : item.status === 'na' ? colors.muted : colors.secondary} />
                                <Text style={[{ fontSize: 13, flex: 1, color: item.status === 'completed' ? colors.muted : colors.text }, item.status === 'completed' && { textDecorationLine: 'line-through' }]} numberOfLines={2}>{item.description}</Text>
                                {item.isRequired && <View style={{ backgroundColor: '#ef444420', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}><Text style={{ fontSize: 9, fontWeight: '600', color: '#ef4444' }}>Req</Text></View>}
                              </TouchableOpacity>
                            ))}
                            {Object.entries(groups).map(([groupName, grpItems]) => {
                              const gk = `${inst.id}:${groupName}`;
                              const gCollapsed = collapsedChecklistGroups[gk];
                              const doneInGroup = grpItems.filter(i => i.status === 'completed' || i.status === 'na').length;
                              return (
                                <View key={groupName}>
                                  <TouchableOpacity style={[styles.checklistGroupHeader, { borderColor: colors.border }]} onPress={() => toggleChecklistGroup(gk)} activeOpacity={0.7}>
                                    <Ionicons name={gCollapsed ? 'chevron-forward' : 'chevron-down'} size={13} color={colors.accent} />
                                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>{groupName}</Text>
                                    <Text style={{ fontSize: 10, color: colors.secondary }}>{doneInGroup}/{grpItems.length}</Text>
                                  </TouchableOpacity>
                                  {!gCollapsed && grpItems.map(item => (
                                    <TouchableOpacity key={item.id} style={[styles.checklistItemRow, { borderColor: colors.border }]} onPress={() => toggleChecklistItem(item)} activeOpacity={0.7} disabled={item.status === 'na'}>
                                      <Ionicons name={item.status === 'completed' ? 'checkbox' : item.status === 'na' ? 'remove-circle-outline' : 'square-outline'} size={20} color={item.status === 'completed' ? '#22c55e' : item.status === 'na' ? colors.muted : colors.secondary} />
                                      <Text style={[{ fontSize: 13, flex: 1, color: item.status === 'completed' ? colors.muted : colors.text }, item.status === 'completed' && { textDecorationLine: 'line-through' }]} numberOfLines={2}>{item.description}</Text>
                                      {item.isRequired && <View style={{ backgroundColor: '#ef444420', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}><Text style={{ fontSize: 9, fontWeight: '600', color: '#ef4444' }}>Req</Text></View>}
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              );
                            })}
                          </View>
                        );
                      })()
                    )}
                  </View>
                );
              })
            )
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
  checklistCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  checklistName: { fontSize: 14, fontWeight: '600', flex: 1 },
  checklistStatusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  checklistProgress: { height: 4, borderRadius: 2, flex: 1, overflow: 'hidden' },
  checklistProgressFill: { height: 4, borderRadius: 2 },
  checklistItemsWrap: { borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  checklistGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    marginTop: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionHeaderRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  sectionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  sectionActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 4,
  },
  viewAllBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  diaryCarouselRow: {
    gap: 10,
    paddingBottom: 4,
    paddingRight: 4,
  },
  diaryCard: {
    width: 160,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginBottom: 4,
  },
  diaryCardDate: {
    fontSize: 11,
    fontWeight: '500',
  },
  diaryCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  diaryCardWeather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  diaryCardWeatherText: {
    fontSize: 11,
  },
  diaryCardAuthor: {
    fontSize: 11,
    marginTop: 2,
  },
  diaryCardViewAll: {
    width: 100,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaryCardViewAllText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
