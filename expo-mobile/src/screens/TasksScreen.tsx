import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  FlatList,
  SectionList,
  Platform,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { dateStrOf, toLocalDateStr, fromLocalDateStr } from '../lib/dates';
import { doneStatusKey, defaultStatusKey, isDoneStatus, type TaskStatusOption } from '../lib/taskStatus';
import TaskComments from '../components/TaskComments';
import { Sheet, SheetTextInput, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, lightTheme } from '../theme';
const TASKS_PREFS_KEY = '@buildpro_tasks_prefs';

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

interface Task {
  id: string;
  title: string;
  content?: string;
  contentText?: string;
  type: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  projectId?: string;
  ownerId?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  assigneeNames?: string[];
  checklist?: { id: string; text: string; completed: boolean }[];
  tags?: string[];
  companyId?: string;
}

interface Project {
  id: string;
  name: string;
  color?: string;
}

type ViewMode = 'list' | 'board';
type GroupBy = 'status' | 'priority' | 'project' | 'dueDate';
type DatePreset = 'all' | 'today' | 'this-week' | 'overdue';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route?: { params?: { openTaskId?: string } };
};

const STATUS_LABELS: Record<string, string> = {
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'done': 'Done',
  'completed': 'Completed',
};

const PRIORITY_LABELS: Record<string, string> = {
  'urgent': 'Urgent',
  'high': 'High',
  'medium': 'Medium',
  'low': 'Low',
};

const STATUS_ORDER = ['todo', 'in-progress', 'done', 'completed'];
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'urgent': return lightTheme.statusDanger;
    case 'high': return lightTheme.coral;
    case 'medium': return lightTheme.statusWarning;
    case 'low': return lightTheme.statusSuccess;
    default: return lightTheme.textMuted;
  }
}

function getStatusColorFallback(status?: string): string {
  switch (status) {
    case 'todo': return lightTheme.textMuted;
    case 'in-progress': return lightTheme.statusInfo;
    case 'done':
    case 'completed': return lightTheme.statusSuccess;
    default: return lightTheme.textMuted;
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function getRelativeDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `In ${diff}d`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function getDueDateGroup(dateStr?: string): string {
  if (!dateStr) return 'No Date';
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff <= 7) return 'This Week';
  return 'Later';
}

const DUE_DATE_ORDER = ['Overdue', 'Today', 'This Week', 'Later', 'No Date'];

function getDueDateColor(group: string): string {
  switch (group) {
    case 'Overdue': return lightTheme.statusDanger;
    case 'Today': return lightTheme.statusInfo;
    case 'This Week': return lightTheme.statusWarning;
    case 'Later': return lightTheme.statusSuccess;
    default: return lightTheme.textMuted;
  }
}

export default function TasksScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const groupBySheetRef = useRef<SheetRef>(null);
  const taskSheetRef = useRef<SheetRef>(null);
  const statusSheetRef = useRef<SheetRef>(null);
  const prioritySheetRef = useRef<SheetRef>(null);
  const filterSheetRef = useRef<SheetRef>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  // Plain text seeded into the description field — only PATCH `content` when
  // the user actually edited it, so rich text authored on web isn't destroyed.
  const seededDescriptionRef = useRef('');

  const [statusOptions, setStatusOptions] = useState<TaskStatusOption[]>([]);
  const [filters, setFilters] = useState<{statuses: string[]; priorities: string[]; projects: string[]}>({statuses: [], priorities: [], projects: []});

  const toast = useToast();
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
      const [tasksData, projectsData, statusData] = await Promise.all([
        apiFetch<Task[]>('/api/tasks').catch(() => []),
        apiFetch<Project[]>('/api/projects').catch(() => []),
        apiFetch<{ options: TaskStatusOption[] }>('/api/field-categories/by-key/task.status').catch(() => ({ options: [] })),
      ]);

      const filtered = (tasksData || []).filter(t => {
        if (t.type !== 'task') return false;
        const ids = t.assigneeIds || [];
        return ids.includes(user?.id || '') || t.assigneeId === user?.id;
      });

      setTasks(filtered);
      setProjects(projectsData || []);

      const opts = (statusData?.options || []).sort((a, b) => a.sortOrder - b.sortOrder);
      if (opts.length > 0) {
        setStatusOptions(opts);
      }
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    AsyncStorage.getItem(TASKS_PREFS_KEY).then(raw => {
      if (raw) {
        try {
          const prefs = JSON.parse(raw);
          if (prefs.viewMode) setViewMode(prefs.viewMode);
          if (prefs.groupBy) setGroupBy(prefs.groupBy);
          if (prefs.datePreset) setDatePreset(prefs.datePreset);
          if (prefs.filters) setFilters(prefs.filters);
        } catch {}
      }
    }).finally(() => setPrefsLoaded(true));
  }, []);

  useEffect(() => { if (prefsLoaded) fetchData(); }, [fetchData, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    AsyncStorage.setItem(TASKS_PREFS_KEY, JSON.stringify({ viewMode, groupBy, datePreset, filters })).catch(() => {});
  }, [viewMode, groupBy, datePreset, filters, prefsLoaded]);

  const openTaskId = route?.params?.openTaskId;
  useEffect(() => {
    if (!openTaskId || loading) return;
    const task = tasks.find(t => t.id === openTaskId);
    if (task) {
      setSelectedTask(task);
      setEditTitle(task.title || '');
      setEditStatus(task.status || 'todo');
      setEditPriority(task.priority || 'low');
      setEditDueDate(task.dueDate ? dateStrOf(task.dueDate) : '');
      const seeded = stripHtml(task.contentText || task.content);
      seededDescriptionRef.current = seeded;
      setEditDescription(seeded);
      setShowEditDatePicker(false);
      setIsEditing(true);
      taskSheetRef.current?.present();
      // Clear the param so a refetch doesn't reopen the sheet.
      navigation.setParams({ openTaskId: undefined });
    }
  }, [openTaskId, loading, tasks, navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const getProjectName = useCallback((projectId?: string): string => {
    if (!projectId) return '';
    const p = projects.find(pr => pr.id === projectId);
    return p?.name || '';
  }, [projects]);

  const getProjectColor = useCallback((projectId?: string): string => {
    if (!projectId) return lightTheme.textMuted;
    const p = projects.find(pr => pr.id === projectId);
    return p?.color || lightTheme.textMuted;
  }, [projects]);

  const getStatusColor = useCallback((status?: string): string => {
    if (statusOptions.length > 0) {
      const opt = statusOptions.find(o => o.key === status);
      if (opt?.color) return opt.color;
    }
    return getStatusColorFallback(status);
  }, [statusOptions]);

  const getStatusLabel = useCallback((status?: string): string => {
    if (statusOptions.length > 0) {
      const opt = statusOptions.find(o => o.key === status);
      if (opt) return opt.name;
    }
    return STATUS_LABELS[status || 'todo'] || status || 'To Do';
  }, [statusOptions]);

  const hasActiveFilters = filters.statuses.length > 0 || filters.priorities.length > 0 || filters.projects.length > 0;

  const groupedTasks = useMemo(() => {
    let filteredTasks = tasks;
    if (filters.statuses.length > 0) {
      filteredTasks = filteredTasks.filter(t => !filters.statuses.includes(t.status || 'todo'));
    }
    if (filters.priorities.length > 0) {
      filteredTasks = filteredTasks.filter(t => !filters.priorities.includes(t.priority || 'low'));
    }
    if (filters.projects.length > 0) {
      filteredTasks = filteredTasks.filter(t => !filters.projects.includes(t.projectId || ''));
    }
    if (datePreset === 'today') {
      filteredTasks = filteredTasks.filter(t => getDueDateGroup(t.dueDate) === 'Today');
    } else if (datePreset === 'this-week') {
      filteredTasks = filteredTasks.filter(t => ['Today', 'This Week'].includes(getDueDateGroup(t.dueDate)));
    } else if (datePreset === 'overdue') {
      filteredTasks = filteredTasks.filter(t => getDueDateGroup(t.dueDate) === 'Overdue');
    }

    const groups: { key: string; label: string; color: string; tasks: Task[] }[] = [];

    if (groupBy === 'status') {
      if (statusOptions.length > 0) {
        for (const opt of statusOptions) {
          const items = filteredTasks.filter(t => (t.status || 'todo') === opt.key);
          groups.push({ key: opt.key, label: opt.name, color: opt.color || '#94a3b8', tasks: items });
        }
      } else {
        for (const status of STATUS_ORDER) {
          const items = filteredTasks.filter(t => (t.status || 'todo') === status);
          groups.push({ key: status, label: STATUS_LABELS[status] || status, color: getStatusColor(status), tasks: items });
        }
      }
      // Tasks whose status isn't in the known set must stay visible.
      const knownStatuses = new Set(groups.map(g => g.key));
      const otherTasks = filteredTasks.filter(t => !knownStatuses.has(t.status || 'todo'));
      if (otherTasks.length > 0) {
        groups.push({ key: '__other', label: 'Other', color: '#94a3b8', tasks: otherTasks });
      }
    } else if (groupBy === 'priority') {
      for (const priority of PRIORITY_ORDER) {
        const items = filteredTasks.filter(t => (t.priority || 'low') === priority);
        groups.push({ key: priority, label: PRIORITY_LABELS[priority] || priority, color: getPriorityColor(priority), tasks: items });
      }
    } else if (groupBy === 'project') {
      const projectMap: Record<string, Task[]> = {};
      const noProject: Task[] = [];
      for (const t of filteredTasks) {
        if (t.projectId) {
          if (!projectMap[t.projectId]) projectMap[t.projectId] = [];
          projectMap[t.projectId].push(t);
        } else {
          noProject.push(t);
        }
      }
      for (const [pid, items] of Object.entries(projectMap)) {
        const name = getProjectName(pid) || 'Unknown Project';
        groups.push({ key: pid, label: name, color: colors.accent, tasks: items });
      }
      if (noProject.length > 0) {
        groups.push({ key: 'none', label: 'No Project', color: colors.muted, tasks: noProject });
      }
    } else if (groupBy === 'dueDate') {
      for (const group of DUE_DATE_ORDER) {
        const items = filteredTasks.filter(t => getDueDateGroup(t.dueDate) === group);
        groups.push({ key: group, label: group, color: getDueDateColor(group), tasks: items });
      }
    }

    return groups.filter(g => g.tasks.length > 0);
  }, [tasks, groupBy, getProjectName, getStatusColor, colors.accent, colors.muted, filters, statusOptions]);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(false);
    taskSheetRef.current?.present();
  };

  const handleTaskSheetDismiss = useCallback(() => {
    setIsEditing(false);
    setSelectedTask(null);
    setShowEditDatePicker(false);
  }, []);

  const handleEditTask = () => {
    if (!selectedTask) return;
    setEditTitle(selectedTask.title || '');
    setEditStatus(selectedTask.status || 'todo');
    setEditPriority(selectedTask.priority || 'low');
    setEditDueDate(selectedTask.dueDate ? dateStrOf(selectedTask.dueDate) : '');
    const seeded = stripHtml(selectedTask.contentText || selectedTask.content);
    seededDescriptionRef.current = seeded;
    setEditDescription(seeded);
    setShowEditDatePicker(false);
    setIsEditing(true);
  };

  const handleSaveTask = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      const body: any = {
        title: editTitle,
        status: editStatus,
        priority: editPriority,
      };
      // Only send content if the user actually changed the description —
      // sending the stripped plain text back would destroy rich text.
      if (editDescription !== seededDescriptionRef.current) {
        body.content = editDescription;
      }
      if (editDueDate) {
        body.dueDate = new Date(editDueDate).toISOString();
      } else {
        body.dueDate = null;
      }
      await apiRequest(`/api/tasks/${selectedTask.id}`, 'PATCH', body);
      taskSheetRef.current?.dismiss();
      toast.success('Task saved');
      await fetchData();
    } catch (e: any) {
      // Keep the sheet open so edits aren't lost.
      toast.error(e?.message || 'Failed to save task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isTaskDone = useCallback(
    (status?: string) => isDoneStatus(status, statusOptions),
    [statusOptions],
  );

  const handleToggleDone = async (task: Task) => {
    const wasDone = isTaskDone(task.status);
    const newStatus = wasDone ? defaultStatusKey(statusOptions) : doneStatusKey(statusOptions);
    if (wasDone) haptic.select(); else haptic.success();
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      await apiRequest(`/api/tasks/${task.id}`, 'PATCH', { status: newStatus });
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      toast.error(e?.message || 'Failed to update task status.');
    }
  };

  const groupByOptions: { key: GroupBy; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'status', label: 'Status', icon: 'list-outline' },
    { key: 'priority', label: 'Priority', icon: 'flag-outline' },
    { key: 'project', label: 'Project', icon: 'briefcase-outline' },
    { key: 'dueDate', label: 'Due Date', icon: 'calendar-outline' },
  ];

  const renderTaskRow = (task: Task) => {
    const done = isTaskDone(task.status);
    return (
      <TouchableOpacity
        key={task.id}
        style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => handleViewTask(task)}
        activeOpacity={0.7}
      >
        <View style={[styles.priorityStrip, { backgroundColor: getProjectColor(task.projectId) }]} />
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => handleToggleDone(task)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={[
            styles.checkCircle,
            { borderColor: done ? lightTheme.statusSuccess : colors.muted },
            done && { backgroundColor: lightTheme.statusSuccess },
          ]}>
            {done && (
              <Ionicons name="checkmark" size={12} color="#ffffff" />
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.taskContent}>
          <Text
            style={[
              styles.taskTitle,
              { color: colors.text },
              done && { textDecorationLine: 'line-through', color: colors.muted },
            ]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
          {getProjectName(task.projectId) ? (
            <Text style={[styles.taskSubtext, { color: colors.secondary }]} numberOfLines={1}>
              {getProjectName(task.projectId)}
            </Text>
          ) : null}
        </View>
        {task.dueDate && (
          <Text style={[
            styles.taskDue,
            { color: getDueDateGroup(task.dueDate) === 'Overdue' ? lightTheme.statusDanger : colors.secondary },
          ]}>
            {getRelativeDate(task.dueDate)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderBoardCard = (task: Task) => (
    <TouchableOpacity
      key={task.id}
      style={[styles.boardCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => handleViewTask(task)}
      activeOpacity={0.7}
    >
      <Text style={[styles.boardCardTitle, { color: colors.text }]} numberOfLines={2}>
        {task.title}
      </Text>
      <View style={styles.boardCardMeta}>
        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) + '20' }]}>
          <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
          <Text style={[styles.priorityBadgeText, { color: getPriorityColor(task.priority) }]}>
            {PRIORITY_LABELS[task.priority || 'low'] || 'Low'}
          </Text>
        </View>
        {task.dueDate && (
          <Text style={[
            styles.boardCardDate,
            { color: getDueDateGroup(task.dueDate) === 'Overdue' ? lightTheme.statusDanger : colors.secondary },
          ]}>
            {formatDate(task.dueDate)}
          </Text>
        )}
      </View>
      {getProjectName(task.projectId) ? (
        <Text style={[styles.boardCardProject, { color: colors.secondary }]} numberOfLines={1}>
          {getProjectName(task.projectId)}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const columnWidth = Math.max(screenWidth * 0.7, 260);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View
        style={[styles.header, { backgroundColor: colors.accent + '30', borderBottomColor: colors.accent + '50', paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Tasks</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.groupByBtn, { borderColor: colors.accent + '60', backgroundColor: colors.accent + '15' }]}
            onPress={() => groupBySheetRef.current?.present()}
          >
            <Ionicons name="funnel-outline" size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.groupByBtn, { borderColor: colors.accent + '60', backgroundColor: colors.accent + '15' }]}
            onPress={() => filterSheetRef.current?.present()}
          >
            <Ionicons name="options-outline" size={16} color={colors.text} />
            {hasActiveFilters && (
              <View style={[styles.filterDot, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.datePresetRow}
        style={[styles.datePresetScroll, { borderBottomColor: colors.border }]}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
      >
        {([
          { key: 'all', label: 'All' },
          { key: 'overdue', label: 'Overdue', color: lightTheme.statusDanger },
          { key: 'today', label: 'Today', color: lightTheme.statusInfo },
          { key: 'this-week', label: 'This Week', color: lightTheme.statusWarning },
        ] as { key: DatePreset; label: string; color?: string }[]).map(preset => {
          const active = datePreset === preset.key;
          const chipColor = preset.color || colors.accent;
          return (
            <TouchableOpacity
              key={preset.key}
              style={[
                styles.datePresetPill,
                {
                  borderColor: active ? chipColor : colors.border,
                  backgroundColor: active ? chipColor + '20' : 'transparent',
                },
              ]}
              onPress={() => { haptic.select(); setDatePreset(preset.key); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.datePresetText, { color: active ? chipColor : colors.secondary }]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {viewMode === 'list' ? (
        <SectionList
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          sections={groupedTasks.map(group => ({
            ...group,
            data: collapsedSections[group.key] ? [] : group.tasks,
          }))}
          keyExtractor={task => task.id}
          renderItem={({ item }) => renderTaskRow(item)}
          renderSectionHeader={({ section }) => (
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection(section.key)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.label}</Text>
                <View style={[styles.sectionCount, { backgroundColor: section.color + '20' }]}>
                  <Text style={[styles.sectionCountText, { color: section.color }]}>{section.tasks.length}</Text>
                </View>
              </View>
              <Ionicons
                name={collapsedSections[section.key] ? 'chevron-forward' : 'chevron-down'}
                size={18}
                color={colors.secondary}
              />
            </TouchableOpacity>
          )}
          renderSectionFooter={() => <View style={styles.section} />}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="checkbox-outline" size={40} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>
                {datePreset === 'today' ? 'No tasks due today'
                  : datePreset === 'this-week' ? 'No tasks due this week'
                  : datePreset === 'overdue' ? 'No overdue tasks'
                  : 'No tasks found'}
              </Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
        />
      ) : (
        <ScrollView
          horizontal
          style={styles.boardScroll}
          contentContainerStyle={styles.boardContent}
          showsHorizontalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
        >
          {groupedTasks.map(group => (
            <View key={group.key} style={[styles.boardColumn, { width: columnWidth }]}>
              <View style={[styles.boardColumnHeader, { backgroundColor: group.color + '15', borderColor: group.color + '30' }]}>
                <View style={[styles.sectionDot, { backgroundColor: group.color }]} />
                <Text style={[styles.boardColumnTitle, { color: colors.text }]}>{group.label}</Text>
                <View style={[styles.sectionCount, { backgroundColor: group.color + '20' }]}>
                  <Text style={[styles.sectionCountText, { color: group.color }]}>{group.tasks.length}</Text>
                </View>
              </View>
              <FlatList
                style={{ maxHeight: screenHeight - 240 }}
                data={group.tasks}
                keyExtractor={t => t.id}
                renderItem={({ item }) => renderBoardCard(item)}
                nestedScrollEnabled
                ListEmptyComponent={
                  <View style={[styles.boardEmptyCol, { borderColor: colors.border }]}>
                    <Text style={[styles.boardEmptyText, { color: colors.muted }]}>No tasks</Text>
                  </View>
                }
              />
            </View>
          ))}
          {groupedTasks.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, width: screenWidth - 32 }]}>
              <Ionicons name="checkbox-outline" size={40} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No tasks found</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Sheet ref={groupBySheetRef} title="Group by">
        <View style={styles.sheetBody}>
          {groupByOptions.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.groupByOption, groupBy === opt.key && { backgroundColor: colors.accent + '15' }]}
              onPress={() => { haptic.select(); setGroupBy(opt.key); groupBySheetRef.current?.dismiss(); }}
            >
              <Ionicons name={opt.icon} size={20} color={groupBy === opt.key ? colors.accent : colors.secondary} />
              <Text style={[styles.groupByOptionText, { color: groupBy === opt.key ? colors.accent : colors.text }]}>
                {opt.label}
              </Text>
              {groupBy === opt.key && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </Sheet>

      <Sheet
        ref={taskSheetRef}
        scrollable
        snapPoints={['70%', '92%']}
        onDismiss={handleTaskSheetDismiss}
      >
        <View style={[styles.sheetHeaderRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetHeaderTitle, { color: colors.text }]}>
            {isEditing ? 'Edit Task' : 'Task Details'}
          </Text>
          {!isEditing && (
            <TouchableOpacity onPress={handleEditTask} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 15 }}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.taskSheetBody}>
          {!isEditing && selectedTask && (
            <>
              <Text style={[styles.viewTitle, { color: colors.text }]}>{selectedTask.title}</Text>

              <View style={styles.viewBadgeRow}>
                <View style={[styles.viewBadge, { backgroundColor: getStatusColor(selectedTask.status) + '20' }]}>
                  <Text style={[styles.viewBadgeText, { color: getStatusColor(selectedTask.status) }]}>
                    {getStatusLabel(selectedTask.status)}
                  </Text>
                </View>
                <View style={[styles.viewBadge, { backgroundColor: getPriorityColor(selectedTask.priority) + '20' }]}>
                  <Text style={[styles.viewBadgeText, { color: getPriorityColor(selectedTask.priority) }]}>
                    {PRIORITY_LABELS[selectedTask.priority || 'low'] || 'Low'}
                  </Text>
                </View>
              </View>

              {selectedTask.dueDate && (
                <View style={styles.viewField}>
                  <Ionicons name="calendar-outline" size={18} color={colors.secondary} />
                  <Text style={[styles.viewFieldText, { color: colors.text }]}>
                    {new Date(selectedTask.dueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              )}

              {getProjectName(selectedTask.projectId) ? (
                <View style={styles.viewField}>
                  <Ionicons name="briefcase-outline" size={18} color={colors.secondary} />
                  <Text style={[styles.viewFieldText, { color: colors.text }]}>
                    {getProjectName(selectedTask.projectId)}
                  </Text>
                </View>
              ) : null}

              {stripHtml(selectedTask.contentText || selectedTask.content) ? (
                <View style={styles.viewSection}>
                  <Text style={[styles.viewSectionLabel, { color: colors.secondary }]}>Notes</Text>
                  <Text style={[styles.viewDescription, { color: colors.text }]}>
                    {stripHtml(selectedTask.contentText || selectedTask.content)}
                  </Text>
                </View>
              ) : null}

              {(selectedTask.assigneeNames || []).length > 0 && (
                <View style={styles.viewSection}>
                  <Text style={[styles.viewSectionLabel, { color: colors.secondary }]}>Assignees</Text>
                  {(selectedTask.assigneeNames || []).map((name: string, idx: number) => (
                    <View key={idx} style={styles.assigneeRow}>
                      <View style={[styles.assigneeAvatar, { backgroundColor: colors.accent }]}>
                        <Text style={styles.assigneeAvatarText}>
                          {(name || '').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </Text>
                      </View>
                      <Text style={[styles.assigneeName, { color: colors.text }]}>{name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(selectedTask.checklist || []).length > 0 && (
                <View style={styles.viewSection}>
                  <Text style={[styles.viewSectionLabel, { color: colors.secondary }]}>Checklist</Text>
                  {(selectedTask.checklist || []).map((item: any) => (
                    <View key={item.id} style={styles.checklistRow}>
                      <Ionicons
                        name={item.completed ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={item.completed ? '#22c55e' : colors.muted}
                      />
                      <Text style={[
                        styles.checklistText,
                        { color: colors.text },
                        item.completed && { textDecorationLine: 'line-through', color: colors.muted },
                      ]}>
                        {item.text}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {(selectedTask.tags || []).length > 0 && (
                <View style={styles.viewSection}>
                  <Text style={[styles.viewSectionLabel, { color: colors.secondary }]}>Tags</Text>
                  <View style={styles.tagsRow}>
                    {(selectedTask.tags || []).map((tag: string, idx: number) => (
                      <View key={idx} style={[styles.tagBadge, { backgroundColor: colors.accent + '15' }]}>
                        <Text style={[styles.tagText, { color: colors.accent }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <TaskComments
                taskId={selectedTask.id}
                currentUserId={user?.id}
                colors={colors}
                isDark={isDark}
              />
            </>
          )}

          {isEditing && (
            <>
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: colors.secondary }]}>Title</Text>
                <SheetTextInput
                  style={[styles.editInput, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: colors.text, borderColor: colors.border }]}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Task title"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: colors.secondary }]}>Status</Text>
                <TouchableOpacity
                  style={[styles.editSelect, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: colors.border }]}
                  onPress={() => statusSheetRef.current?.present()}
                >
                  <View style={[styles.selectDot, { backgroundColor: getStatusColor(editStatus) }]} />
                  <Text style={[styles.editSelectText, { color: colors.text }]}>
                    {getStatusLabel(editStatus)}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.secondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: colors.secondary }]}>Priority</Text>
                <TouchableOpacity
                  style={[styles.editSelect, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: colors.border }]}
                  onPress={() => prioritySheetRef.current?.present()}
                >
                  <View style={[styles.selectDot, { backgroundColor: getPriorityColor(editPriority) }]} />
                  <Text style={[styles.editSelectText, { color: colors.text }]}>
                    {PRIORITY_LABELS[editPriority] || editPriority}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.secondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: colors.secondary }]}>Due Date</Text>
                <TouchableOpacity
                  style={[styles.editSelect, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: showEditDatePicker ? colors.accent : colors.border }]}
                  onPress={() => setShowEditDatePicker(v => !v)}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                  <Text style={[styles.editSelectText, { color: editDueDate ? colors.text : colors.muted }]}>
                    {editDueDate ? fromLocalDateStr(editDueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date'}
                  </Text>
                  {editDueDate ? (
                    <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setEditDueDate(''); setShowEditDatePicker(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name={showEditDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                  )}
                </TouchableOpacity>
                {showEditDatePicker && (
                  <DateTimePicker
                    value={editDueDate ? fromLocalDateStr(editDueDate) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={isDark ? 'dark' : 'light'}
                    onChange={(_event, date) => {
                      if (Platform.OS === 'android') setShowEditDatePicker(false);
                      if (date) setEditDueDate(toLocalDateStr(date));
                    }}
                    style={{ marginTop: 4 }}
                  />
                )}
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: colors.secondary }]}>Notes</Text>
                <SheetTextInput
                  style={[styles.editTextArea, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: colors.text, borderColor: colors.border }]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Add a description..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.editCancelBtn, { borderColor: colors.border }]}
                  onPress={() => setIsEditing(false)}
                >
                  <Text style={[styles.editCancelText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editSaveBtn, { backgroundColor: colors.accent }]}
                  onPress={handleSaveTask}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.editSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Sheet>

      <Sheet ref={statusSheetRef} title="Status" stackBehavior="push">
        <View style={styles.sheetBody}>
          {(statusOptions.length > 0 ? statusOptions : STATUS_ORDER.map(s => ({ key: s, name: STATUS_LABELS[s] || s, color: getStatusColor(s), sortOrder: 0 }))).map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.pickerOption, editStatus === opt.key && { backgroundColor: colors.accent + '15' }]}
              onPress={() => { haptic.select(); setEditStatus(opt.key); statusSheetRef.current?.dismiss(); }}
            >
              <View style={[styles.selectDot, { backgroundColor: opt.color || '#94a3b8' }]} />
              <Text style={[styles.pickerOptionText, { color: editStatus === opt.key ? colors.accent : colors.text }]}>
                {opt.name}
              </Text>
              {editStatus === opt.key && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </Sheet>

      <Sheet ref={prioritySheetRef} title="Priority" stackBehavior="push">
        <View style={styles.sheetBody}>
          {PRIORITY_ORDER.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.pickerOption, editPriority === p && { backgroundColor: colors.accent + '15' }]}
              onPress={() => { haptic.select(); setEditPriority(p); prioritySheetRef.current?.dismiss(); }}
            >
              <View style={[styles.selectDot, { backgroundColor: getPriorityColor(p) }]} />
              <Text style={[styles.pickerOptionText, { color: editPriority === p ? colors.accent : colors.text }]}>
                {PRIORITY_LABELS[p]}
              </Text>
              {editPriority === p && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </Sheet>

      <Sheet ref={filterSheetRef} scrollable>
        <View style={[styles.sheetHeaderRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetHeaderTitle, { color: colors.text }]}>Filters</Text>
          {hasActiveFilters && (
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { haptic.select(); setFilters({ statuses: [], priorities: [], projects: [] }); }}
            >
              <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>Show All</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.taskSheetBody}>
          <Text style={[styles.filterSectionLabel, { color: colors.secondary }]}>Status</Text>
          <View style={styles.filterChips}>
            {(statusOptions.length > 0 ? statusOptions : STATUS_ORDER.map(s => ({ key: s, name: STATUS_LABELS[s] || s, color: getStatusColor(s), sortOrder: 0 }))).map(opt => {
              const excluded = filters.statuses.includes(opt.key);
              const chipColor = opt.color || colors.accent;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, {
                    borderColor: excluded ? colors.border : chipColor,
                    backgroundColor: excluded ? 'transparent' : chipColor + '20',
                    opacity: excluded ? 0.45 : 1,
                  }]}
                  onPress={() => {
                    haptic.select();
                    setFilters(prev => ({
                      ...prev,
                      statuses: excluded ? prev.statuses.filter(s => s !== opt.key) : [...prev.statuses, opt.key],
                    }));
                  }}
                >
                  <View style={[styles.selectDot, { backgroundColor: opt.color || '#94a3b8' }]} />
                  <Text style={[styles.filterChipText, { color: excluded ? colors.secondary : chipColor }]}>{opt.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.filterSectionLabel, { color: colors.secondary }]}>Priority</Text>
          <View style={styles.filterChips}>
            {PRIORITY_ORDER.map(p => {
              const excluded = filters.priorities.includes(p);
              const chipColor = getPriorityColor(p);
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.filterChip, {
                    borderColor: excluded ? colors.border : chipColor,
                    backgroundColor: excluded ? 'transparent' : chipColor + '20',
                    opacity: excluded ? 0.45 : 1,
                  }]}
                  onPress={() => {
                    haptic.select();
                    setFilters(prev => ({
                      ...prev,
                      priorities: excluded ? prev.priorities.filter(pr => pr !== p) : [...prev.priorities, p],
                    }));
                  }}
                >
                  <View style={[styles.selectDot, { backgroundColor: chipColor }]} />
                  <Text style={[styles.filterChipText, { color: excluded ? colors.secondary : chipColor }]}>{PRIORITY_LABELS[p]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.filterSectionLabel, { color: colors.secondary }]}>Project</Text>
          <View style={styles.filterChips}>
            {projects.map(proj => {
              const excluded = filters.projects.includes(proj.id);
              const chipColor = proj.color || colors.accent;
              return (
                <TouchableOpacity
                  key={proj.id}
                  style={[styles.filterChip, {
                    borderColor: excluded ? colors.border : chipColor,
                    backgroundColor: excluded ? 'transparent' : chipColor + '20',
                    opacity: excluded ? 0.45 : 1,
                  }]}
                  onPress={() => {
                    haptic.select();
                    setFilters(prev => ({
                      ...prev,
                      projects: excluded ? prev.projects.filter(id => id !== proj.id) : [...prev.projects, proj.id],
                    }));
                  }}
                >
                  <View style={[styles.selectDot, { backgroundColor: chipColor }]} />
                  <Text style={[styles.filterChipText, { color: excluded ? colors.secondary : chipColor }]}>{proj.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Sheet>

      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.bottomBarBtn, viewMode === 'list' && { backgroundColor: colors.accent }]}
          onPress={() => { haptic.select(); setViewMode('list'); }}
        >
          <Ionicons name="list-outline" size={18} color={viewMode === 'list' ? '#ffffff' : colors.secondary} />
          <Text style={[styles.bottomBarBtnText, { color: viewMode === 'list' ? '#ffffff' : colors.secondary }]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBarBtn, viewMode === 'board' && { backgroundColor: colors.accent }]}
          onPress={() => { haptic.select(); setViewMode('board'); }}
        >
          <Ionicons name="grid-outline" size={18} color={viewMode === 'board' ? '#ffffff' : colors.secondary} />
          <Text style={[styles.bottomBarBtnText, { color: viewMode === 'board' ? '#ffffff' : colors.secondary }]}>Board</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderBottomWidth: 0,
    gap: 8,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    flex: 1,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
    borderRadius: 7,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  groupByBtn: {
    width: 40,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePresetScroll: {
    borderBottomWidth: 1,
    height: 48,
    flexShrink: 0,
    flexGrow: 0,
  },
  datePresetRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  datePresetPill: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePresetText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    overflow: 'hidden',
    minHeight: 52,
  },
  priorityStrip: {
    width: 6,
    height: 36,
    borderRadius: 3,
    marginLeft: 8,
    alignSelf: 'center',
  },
  checkbox: {
    paddingHorizontal: 10,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskContent: {
    flex: 1,
    paddingVertical: 10,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  taskSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  taskDue: {
    fontSize: 12,
    fontWeight: '500',
    paddingRight: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
  },
  boardScroll: {
    flex: 1,
  },
  boardContent: {
    padding: 16,
    gap: 12,
  },
  boardColumn: {
    marginRight: 12,
  },
  boardColumnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  boardColumnTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  boardCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  boardCardTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  boardCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  boardCardDate: {
    fontSize: 12,
  },
  boardCardProject: {
    fontSize: 12,
    marginTop: 4,
  },
  boardEmptyCol: {
    paddingVertical: 24,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  boardEmptyText: {
    fontSize: 13,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  sheetHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Option lists inside sheets: options carry 12px inner padding, +8 = 20 gutter.
  sheetBody: {
    paddingHorizontal: 8,
  },
  taskSheetBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  groupByOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  groupByOptionText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  viewTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  viewBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  viewBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  viewBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  viewField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  viewFieldText: {
    fontSize: 14,
  },
  viewSection: {
    marginTop: 16,
  },
  viewSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  viewDescription: {
    fontSize: 14,
    lineHeight: 22,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  assigneeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeAvatarText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  assigneeName: {
    fontSize: 14,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  checklistText: {
    fontSize: 14,
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  editField: {
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  editSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  editSelectText: {
    fontSize: 15,
    flex: 1,
  },
  editTextArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 100,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  editCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  editSaveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editSaveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  pickerOptionText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  filterDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    gap: 4,
  },
  bottomBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bottomBarBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
