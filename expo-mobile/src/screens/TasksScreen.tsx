import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { dateStrOf } from '../lib/dates';
import { doneStatusKey, defaultStatusKey, isDoneStatus, type TaskStatusOption } from '../lib/taskStatus';
import { TaskDetail, TaskDetailPane, stripHtml, getPriorityColor, PRIORITY_LABELS } from '../components/tasks/TaskDetail';
import { TaskForm } from '../components/tasks/TaskForm';
import { CalendarDays, Check, Flag, Folder, List as ListIcon, type LucideIcon } from 'lucide-react-native';
import {
  Card, Checkbox, FieldLabel, ListRow, PrimaryButton, ProjectSquare, SecondaryButton, SheetBody, SheetHeader, TextButton,
} from '../components/kit';
import { useTaskPane, confirmDiscard } from '../components/tasks/useTaskPane';
import { TwoPane } from '../components/ui/TwoPane';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useLayout } from '../lib/useLayout';
import { haptic } from '../lib/haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, useColors, currentTheme, MAX_FONT_SCALE, metrics, size } from '../theme';
import { goBackOrHome } from '../navigation/back';
import { SwipeRow } from '../components/ui/SwipeRow';
const TASKS_PREFS_KEY = '@buildpro_tasks_prefs';

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

const STATUS_ORDER = ['todo', 'in-progress', 'done', 'completed'];
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

function getStatusColorFallback(status?: string): string {
  switch (status) {
    case 'todo': return currentTheme().textMuted;
    case 'in-progress': return currentTheme().statusInfo;
    case 'done':
    case 'completed': return currentTheme().statusSuccess;
    default: return currentTheme().textMuted;
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
    case 'Overdue': return currentTheme().statusDanger;
    case 'Today': return currentTheme().statusInfo;
    case 'This Week': return currentTheme().statusWarning;
    case 'Later': return currentTheme().statusSuccess;
    default: return currentTheme().textMuted;
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
  // Edit form: Title → Next → Notes.
  const editDescRef = useRef<any>(null);
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
  const k = useColors();
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useLayout();
  // Big screen, list view: tasks on the left, the open task on the right.
  const { isWide, paneTaskId, openInPane, close: closePane, paneProps } = useTaskPane();
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
      seedEdit(task);
      editOnlyRef.current = false;
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
    if (!projectId) return currentTheme().textMuted;
    const p = projects.find(pr => pr.id === projectId);
    return p?.color || currentTheme().textMuted;
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
    // Big screen, list view: open it in the right-hand panel. Phone, or the
    // board (its columns already use the full width): the sheet, as before.
    if (isWide && viewMode === 'list') {
      openInPane(task.id);
      return;
    }
    setSelectedTask(task);
    setIsEditing(false);
    taskSheetRef.current?.present();
  };

  // Fill the edit form from a task.
  const seedEdit = (task: Task) => {
    setEditTitle(task.title || '');
    setEditStatus(task.status || 'todo');
    setEditPriority(task.priority || 'low');
    setEditDueDate(task.dueDate ? dateStrOf(task.dueDate) : '');
    const seeded = stripHtml(task.contentText || task.content);
    seededDescriptionRef.current = seeded;
    setEditDescription(seeded);
    setShowEditDatePicker(false);
    setIsEditing(true);
  };

  // Unsaved edits in the task sheet's form?
  const isDirty = !!selectedTask && isEditing && (
    editTitle !== (selectedTask.title || '')
    || editStatus !== (selectedTask.status || 'todo')
    || editPriority !== (selectedTask.priority || 'low')
    || editDueDate !== (selectedTask.dueDate ? dateStrOf(selectedTask.dueDate) : '')
    || editDescription !== seededDescriptionRef.current
  );
  // Read from the sheet's dismiss callback, which can fire after re-renders.
  const dirtyRef = useRef(false);
  dirtyRef.current = isDirty;
  // Set just before a dismiss that must not ask (after a successful save).
  const allowCloseRef = useRef(false);
  // The sheet was opened straight into Edit from the right-hand panel, so
  // Cancel closes it instead of showing the task's details again.
  const editOnlyRef = useRef(false);

  const resetTaskSheet = useCallback(() => {
    setIsEditing(false);
    setSelectedTask(null);
    setShowEditDatePicker(false);
    editOnlyRef.current = false;
  }, []);

  // Swipe-down, backdrop tap and programmatic dismiss all land here. The sheet
  // primitive can't veto a close, so with unsaved edits we ask, and "Keep
  // editing" brings the sheet straight back — the form's values live in this
  // screen's state, so nothing typed is lost.
  const handleTaskSheetDismiss = useCallback(() => {
    const allowed = allowCloseRef.current;
    allowCloseRef.current = false;
    if (!allowed && dirtyRef.current) {
      confirmDiscard(resetTaskSheet, () => taskSheetRef.current?.present());
      return;
    }
    resetTaskSheet();
  }, [resetTaskSheet]);

  const handleEditTask = () => {
    if (!selectedTask) return;
    editOnlyRef.current = false;
    seedEdit(selectedTask);
  };

  // Edit from the right-hand panel: the existing edit sheet, opened on the form.
  const handlePaneEdit = (task: Task) => {
    setSelectedTask(task);
    seedEdit(task);
    editOnlyRef.current = true;
    taskSheetRef.current?.present();
  };

  const handleCancelEdit = () => {
    const leave = () => {
      if (editOnlyRef.current) {
        allowCloseRef.current = true;
        taskSheetRef.current?.dismiss();
      } else {
        setIsEditing(false);
        setShowEditDatePicker(false);
      }
    };
    if (isDirty) confirmDiscard(leave);
    else leave();
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
      allowCloseRef.current = true;
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

  const groupByOptions: { key: GroupBy; label: string; icon: LucideIcon }[] = [
    { key: 'status', label: 'Status', icon: ListIcon },
    { key: 'priority', label: 'Priority', icon: Flag },
    { key: 'project', label: 'Project', icon: Folder },
    { key: 'dueDate', label: 'Due date', icon: CalendarDays },
  ];

  // Every status the pickers and filters offer (the company's, or the defaults).
  const ALL_STATUS = (statusOptions.length > 0
    ? statusOptions
    : STATUS_ORDER.map(st => ({ key: st, name: STATUS_LABELS[st] || st, color: getStatusColor(st), sortOrder: 0 })));

  /** Filter row: ticked = shown. Lists hold what's EXCLUDED, so a tick means "not in the list". */
  const tickRow = (key: string, label: string, on: boolean, toggle: () => void, dotColor?: string | null, lead?: ReactNode) => {
    const press = () => { haptic.select(); toggle(); };
    return (
      <ListRow
        key={key}
        lead={
          <View style={tx.lead}>
            <Checkbox checked={on} onPress={press} accessibilityLabel={label} />
            {lead}
          </View>
        }
        title={label}
        titleLines={1}
        trailing={dotColor ? <View style={[tx.dot, { backgroundColor: dotColor }]} /> : undefined}
        onPress={press}
      />
    );
  };

  const renderTaskRow = (task: Task) => {
    const done = isTaskDone(task.status);
    // Swipe right to complete / reopen — the same action (and permission:
    // any signed-in user, PATCH /api/tasks/:id) as the row's checkbox.
    return (
      <SwipeRow
        key={task.id}
        containerStyle={styles.taskRowSwipe}
        left={{
          label: done ? 'Reopen' : 'Done',
          icon: done ? 'arrow-undo' : 'checkmark',
          color: done ? theme.textSecondary : theme.statusSuccessSolid,
          haptic: 'none', // handleToggleDone already fires success/select
          onAction: () => handleToggleDone(task),
        }}
      >
      <TouchableOpacity
        style={[
          styles.taskRow,
          { backgroundColor: colors.card, borderColor: colors.border },
          isWide && paneTaskId === task.id && { borderColor: colors.accent },
        ]}
        onPress={() => handleViewTask(task)}
        activeOpacity={0.7}
      >
        <View style={[styles.priorityStrip, { backgroundColor: getProjectColor(task.projectId) }]} />
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => handleToggleDone(task)}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Mark ${task.title} ${done ? 'not done' : 'done'}`}
        >
          <View style={[
            styles.checkCircle,
            { borderColor: done ? theme.statusSuccessSolid : colors.muted },
            done && { backgroundColor: theme.statusSuccessSolid },
          ]}>
            {done && (
              <Ionicons name="checkmark" size={12} color="#ffffff" />
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.taskContent}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
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
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.taskSubtext, { color: colors.secondary }]} numberOfLines={1}>
              {getProjectName(task.projectId)}
            </Text>
          ) : null}
        </View>
        {task.dueDate && (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[
            styles.taskDue,
            { color: getDueDateGroup(task.dueDate) === 'Overdue' ? currentTheme().statusDanger : colors.secondary },
          ]}>
            {getRelativeDate(task.dueDate)}
          </Text>
        )}
      </TouchableOpacity>
      </SwipeRow>
    );
  };

  const renderBoardCard = (task: Task) => (
    <TouchableOpacity
      key={task.id}
      style={[styles.boardCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => handleViewTask(task)}
      activeOpacity={0.7}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardCardTitle, { color: colors.text }]} numberOfLines={2}>
        {task.title}
      </Text>
      <View style={styles.boardCardMeta}>
        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) + '20' }]}>
          <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.priorityBadgeText, { color: getPriorityColor(task.priority) }]}>
            {PRIORITY_LABELS[task.priority || 'low'] || 'Low'}
          </Text>
        </View>
        {task.dueDate && (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[
            styles.boardCardDate,
            { color: getDueDateGroup(task.dueDate) === 'Overdue' ? currentTheme().statusDanger : colors.secondary },
          ]}>
            {formatDate(task.dueDate)}
          </Text>
        )}
      </View>
      {getProjectName(task.projectId) ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardCardProject, { color: colors.secondary }]} numberOfLines={1}>
          {getProjectName(task.projectId)}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  // Phone: ~70% of the screen so the next column peeks in. Big screen (Duo
  // unfolded): three columns side by side — width minus the 16pt content
  // padding each side, minus each column's 12pt marginRight + the 12pt gap
  // between columns, split three ways. Recomputed live on fold/unfold; only
  // widths change, so the board's scroll views stay mounted.
  const columnWidth = isWide
    ? Math.floor((screenWidth - 32 - 3 * 12 - 2 * 12) / 3)
    : Math.max(screenWidth * 0.7, 260);

  // The task open in the right-hand panel, read live from the list so a
  // tick or a save shows straight away. Gone (e.g. reassigned) → empty panel.
  const paneTask = paneTaskId ? tasks.find(t => t.id === paneTaskId) ?? null : null;

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
          onPress={() => goBackOrHome(navigation)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.headerTitle, { color: colors.text }]}>My Tasks</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.groupByBtn, { borderColor: colors.accent + '60', backgroundColor: colors.accent + '15' }]}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            onPress={() => groupBySheetRef.current?.present()}
          >
            <Ionicons name="funnel-outline" size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.groupByBtn, { borderColor: colors.accent + '60', backgroundColor: colors.accent + '15' }]}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
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
          { key: 'overdue', label: 'Overdue', color: currentTheme().statusDanger },
          { key: 'today', label: 'Today', color: currentTheme().statusInfo },
          { key: 'this-week', label: 'This Week', color: currentTheme().statusWarning },
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
              hitSlop={{ top: 6, bottom: 6 }}
              activeOpacity={0.7}
            >
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.datePresetText, { color: active ? chipColor : colors.secondary }]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {viewMode === 'list' ? (
        // Always wrapped in TwoPane so the list keeps its place in the tree —
        // folding/unfolding never remounts it. The board stays full width.
        <TwoPane
          {...paneProps}
          emptyTitle="Select a task"
          emptyIcon="checkbox-outline"
          detail={paneTask ? (
            <TaskDetailPane
              key={paneTask.id}
              task={paneTask}
              statusLabel={getStatusLabel(paneTask.status)}
              statusColor={getStatusColor(paneTask.status)}
              projectName={getProjectName(paneTask.projectId)}
              descriptionLabel="Notes"
              colors={colors}
              isDark={isDark}
              currentUserId={user?.id}
              onEdit={() => handlePaneEdit(paneTask)}
            />
          ) : null}
          list={
        <SectionList
          style={styles.listScroll}
          // Big screen: keep task rows (title + notes preview) to a readable
          // width instead of running edge to edge. Style only — no remount.
          contentContainerStyle={[styles.listContent, isWide && readableFrame]}
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
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.sectionTitle, { color: colors.text }]}>{section.label}</Text>
                <View style={[styles.sectionCount, { backgroundColor: section.color + '20' }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.sectionCountText, { color: section.color }]}>{section.tasks.length}</Text>
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
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.emptyText, { color: colors.secondary }]}>
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
          }
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
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardColumnTitle, { color: colors.text }]}>{group.label}</Text>
                <View style={[styles.sectionCount, { backgroundColor: group.color + '20' }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.sectionCountText, { color: group.color }]}>{group.tasks.length}</Text>
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
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardEmptyText, { color: colors.muted }]}>No tasks</Text>
                  </View>
                }
              />
            </View>
          ))}
          {groupedTasks.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, width: screenWidth - 32 }]}>
              <Ionicons name="checkbox-outline" size={40} color={colors.muted} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.emptyText, { color: colors.secondary }]}>No tasks found</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Sheet ref={groupBySheetRef} title="Group by">
        <SheetBody>
          <Card variant="list">
            {groupByOptions.map(opt => {
              const active = groupBy === opt.key;
              const Glyph = opt.icon;
              return (
                <ListRow
                  key={opt.key}
                  lead={<Glyph size={size.icon.row} color={active ? k.accent : k.icon} strokeWidth={metrics.iconStroke} />}
                  title={opt.label}
                  titleLines={1}
                  selected={active}
                  trailing={active ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                  onPress={() => { haptic.select(); setGroupBy(opt.key); groupBySheetRef.current?.dismiss(); }}
                />
              );
            })}
          </Card>
        </SheetBody>
      </Sheet>

      <Sheet
        ref={taskSheetRef}
        scrollable
        snapPoints={['70%', '92%']}
        onDismiss={handleTaskSheetDismiss}
        // Editing: Cancel / Save pinned to the bottom of the sheet, above the
        // keyboard (the header Save stays too).
        footer={isEditing ? (
          <>
            <SecondaryButton label="Cancel" onPress={handleCancelEdit} />
            <PrimaryButton label="Save" onPress={handleSaveTask} loading={saving} />
          </>
        ) : null}
      >
        <SheetBody>
          <SheetHeader
            title={isEditing ? 'Edit task' : 'Task'}
            onCancel={isEditing ? handleCancelEdit : undefined}
            doneLabel={isEditing ? 'Save' : 'Edit'}
            // Also up here: the sheet lifts with the keyboard, so this Save
            // stays in view while typing in a field further down.
            onDone={isEditing ? handleSaveTask : handleEditTask}
            doneLoading={isEditing && saving}
          />

          {!isEditing && selectedTask && (
            <TaskDetail
              task={selectedTask}
              statusLabel={getStatusLabel(selectedTask.status)}
              statusColor={getStatusColor(selectedTask.status)}
              projectName={getProjectName(selectedTask.projectId)}
              descriptionLabel="Notes"
              colors={colors}
              isDark={isDark}
              currentUserId={user?.id}
              inSheet
            />
          )}

          {isEditing && (
            <TaskForm
              inSheet
              isDark={isDark}
              title={editTitle}
              onTitle={setEditTitle}
              status={editStatus}
              statusOptions={ALL_STATUS}
              onStatus={setEditStatus}
              priority={editPriority}
              onPriority={setEditPriority}
              dueDate={editDueDate}
              onDueDate={setEditDueDate}
              description={editDescription}
              onDescription={setEditDescription}
              descriptionLabel="Notes"
              descRef={editDescRef}
            />
          )}
        </SheetBody>
      </Sheet>

      <Sheet
        ref={filterSheetRef}
        title="Filters"
        scrollable
        footer={
          <>
            {hasActiveFilters ? (
              <TextButton label="Show all" tone="muted" onPress={() => { haptic.select(); setFilters({ statuses: [], priorities: [], projects: [] }); }} />
            ) : null}
            <PrimaryButton label="Done" onPress={() => filterSheetRef.current?.dismiss()} />
          </>
        }
      >
        <SheetBody>
          <View style={tx.group}>
            <FieldLabel>Status</FieldLabel>
            <Card variant="list">
              {ALL_STATUS.map(opt =>
                tickRow(`s:${opt.key}`, opt.name, !filters.statuses.includes(opt.key), () =>
                  setFilters(prev => ({
                    ...prev,
                    statuses: prev.statuses.includes(opt.key) ? prev.statuses.filter(x => x !== opt.key) : [...prev.statuses, opt.key],
                  })), opt.color),
              )}
            </Card>
          </View>
          <View style={tx.group}>
            <FieldLabel>Priority</FieldLabel>
            <Card variant="list">
              {PRIORITY_ORDER.map(p =>
                tickRow(`p:${p}`, PRIORITY_LABELS[p], !filters.priorities.includes(p), () =>
                  setFilters(prev => ({
                    ...prev,
                    priorities: prev.priorities.includes(p) ? prev.priorities.filter(x => x !== p) : [...prev.priorities, p],
                  }))),
              )}
            </Card>
          </View>
          {projects.length > 0 ? (
            <View style={tx.group}>
              <FieldLabel>Project</FieldLabel>
              <Card variant="list">
                {projects.map(proj =>
                  tickRow(`j:${proj.id}`, proj.name, !filters.projects.includes(proj.id), () =>
                    setFilters(prev => ({
                      ...prev,
                      projects: prev.projects.includes(proj.id) ? prev.projects.filter(x => x !== proj.id) : [...prev.projects, proj.id],
                    })), undefined, <ProjectSquare color={proj.color} fallbackKey={proj.id} />),
                )}
              </Card>
            </View>
          ) : null}
        </SheetBody>
      </Sheet>

      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.bottomBarBtn, viewMode === 'list' && { backgroundColor: colors.accent }]}
          onPress={() => { haptic.select(); setViewMode('list'); }}
        >
          <Ionicons name="list-outline" size={18} color={viewMode === 'list' ? '#ffffff' : colors.secondary} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.bottomBarBtnText, { color: viewMode === 'list' ? '#ffffff' : colors.secondary }]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBarBtn, viewMode === 'board' && { backgroundColor: colors.accent }]}
          onPress={() => { haptic.select(); closePane(); setViewMode('board'); }}
        >
          <Ionicons name="grid-outline" size={18} color={viewMode === 'board' ? '#ffffff' : colors.secondary} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.bottomBarBtnText, { color: viewMode === 'board' ? '#ffffff' : colors.secondary }]}>Board</Text>
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
  // The swipe container carries the spacing and clips the action panel to
  // the row's rounded corners.
  taskRowSwipe: {
    borderRadius: 10,
    marginBottom: 6,
    overflow: 'hidden',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
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
  // 44pt square tap target; the circle inside stays 22pt.
  checkbox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  filterDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
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

const tx = StyleSheet.create({
  group: { gap: metrics.form.labelGap },
  lead: { flexDirection: 'row', alignItems: 'center', gap: metrics.listRow.gap },
  dot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
});
