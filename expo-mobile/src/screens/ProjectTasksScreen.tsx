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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest } from '../services/api';
import { dateStrOf, toLocalDateStr, fromLocalDateStr } from '../lib/dates';
import { doneStatusKey, defaultStatusKey, isDoneStatus, type TaskStatusOption } from '../lib/taskStatus';
import { useAuth } from '../contexts/AuthContext';
import { TaskDetail, TaskDetailPane, stripHtml, getPriorityColor, PRIORITY_LABELS } from '../components/tasks/TaskDetail';
import { useTaskPane, confirmDiscard } from '../components/tasks/useTaskPane';
import { TwoPane } from '../components/ui/TwoPane';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme, useColors, currentTheme, MAX_FONT_SCALE, metrics, space, type } from '../theme';
import { ChevronRight, Eye, EyeOff, LayoutGrid, List, SquareCheck } from 'lucide-react-native';
import { Card, Checkbox, EmptyState, FAB, FAB_CLEARANCE, GroupHeader, ListRow, TasksHeader } from '../components/kit';
import { SkeletonList } from '../components/ui/Skeleton';
import { getInitials } from '../lib/format';
import { SwipeRow } from '../components/ui/SwipeRow';
import { useLayout } from '../lib/useLayout';
import { sheetFrame } from '../components/ui/Sheet';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useKeyboardAwareScroll } from '../lib/useKeyboardAwareScroll';
import type { TextInputInstance } from 'react-native';
interface Task {
  id: string;
  title: string;
  content?: string;
  contentText?: string;
  type: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assigneeNames?: string[];
  checklist?: { id: string; text: string; completed: boolean }[];
  tags?: string[];
}

type StatusOption = TaskStatusOption;

type ViewMode = 'list' | 'board';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];
function getStatusColorFallback(status?: string): string {
  switch (status) {
    case 'todo': return currentTheme().textMuted;
    case 'in_progress':
    case 'in-progress': return currentTheme().statusInfo;
    case 'done':
    case 'completed': return currentTheme().statusSuccess;
    default: return currentTheme().textMuted;
  }
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

function isOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return target < today;
}

export default function ProjectTasksScreen({ navigation, route }: Props) {
  const { width: screenWidth } = useLayout();
  // Big screen, list view: tasks on the left, the open task on the right.
  const { isWide, paneTaskId, openInPane, close: closePane, paneProps } = useTaskPane();
  const { projectId, projectName, projectColor } = route.params as { projectId: string; projectName: string; projectColor?: string | null };
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Edit / create forms: the KeyboardAvoidingView resizes the sheet so the
  // bottom Save bar sits on the keyboard; these scroll the focused field into
  // the smaller window (extraSpace leaves room above that bar).
  const editKb = useKeyboardAwareScroll({ extraSpace: 24 });
  const createKb = useKeyboardAwareScroll({ extraSpace: 24 });
  // Title → Next → Description.
  const editDescRef = useRef<TextInputInstance>(null);
  const newDescRef = useRef<TextInputInstance>(null);

  const theme = useTheme();
  const k = useColors();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
    inputBg: theme.card,
};

  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // View / edit modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);

  // Filter
  const [hideDone, setHideDone] = useState(true);
  // Groups with no tasks fold into one "Show empty groups" line.
  const [showEmptyGroups, setShowEmptyGroups] = useState(false);

  // Edit checklist
  const [editChecklist, setEditChecklist] = useState<{ id: string; text: string; completed: boolean }[]>([]);
  const [editChecklistInput, setEditChecklistInput] = useState('');

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newChecklist, setNewChecklist] = useState<{ id: string; text: string; completed: boolean }[]>([]);
  const [newChecklistInput, setNewChecklistInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNewStatusPicker, setShowNewStatusPicker] = useState(false);
  const [showNewPriorityPicker, setShowNewPriorityPicker] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showNewDatePicker, setShowNewDatePicker] = useState(false);

  // ─── Derived helpers ────────────────────────────────────────────────────────

  const getStatusColor = useCallback((status?: string): string => {
    const opt = statusOptions.find(o => o.key === status);
    return opt?.color || getStatusColorFallback(status);
  }, [statusOptions]);

  const getStatusLabel = useCallback((status?: string): string => {
    const opt = statusOptions.find(o => o.key === status);
    return opt ? opt.name : (status?.replace(/_/g, ' ') || 'To Do');
  }, [statusOptions]);

  const defaultStatus = useMemo(() => defaultStatusKey(statusOptions), [statusOptions]);

  const doneStatus = useMemo(() => doneStatusKey(statusOptions), [statusOptions]);

  const isTaskDone = useCallback(
    (status?: string): boolean => isDoneStatus(status, statusOptions),
    [statusOptions],
  );

  // ─── Data loading ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [tasksData, statusData] = await Promise.all([
        apiFetch<Task[]>(`/api/tasks?projectId=${projectId}`).catch(() => []),
        apiFetch<{ options: StatusOption[] }>('/api/field-categories/by-key/task.status').catch(() => ({ options: [] })),
      ]);
      setTasks((tasksData || []).filter(t => t.type === 'task'));
      const opts = (statusData?.options || []).sort((a, b) => a.sortOrder - b.sortOrder);
      if (opts.length > 0) setStatusOptions(opts);
    } catch (e) {
      console.error('Failed to fetch project tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ─── Grouped tasks ───────────────────────────────────────────────────────────

  const groupedTasks = useMemo(() => {
    const opts: StatusOption[] = statusOptions.length > 0
      ? statusOptions
      : [
          { key: 'todo', name: 'To Do', color: '#94a3b8', sortOrder: 0 },
          { key: 'in_progress', name: 'In Progress', color: '#3b82f6', sortOrder: 1 },
          { key: 'done', name: 'Done', color: '#22c55e', sortOrder: 2 },
        ];

    const visibleOpts = hideDone ? opts.filter(o => o.key !== doneStatus) : opts;
    const knownKeys = new Set(opts.map(o => o.key));

    const groups = visibleOpts.map(opt => ({
      key: opt.key,
      label: opt.name,
      color: opt.color || '#94a3b8',
      tasks: tasks.filter(t => (t.status || defaultStatus) === opt.key),
    }));

    // Catch tasks with unknown statuses — always shown, otherwise tasks with a
    // status outside the company's options vanish while "hide done" is on.
    const others = tasks.filter(t => !knownKeys.has(t.status || defaultStatus));
    if (others.length > 0) {
      groups.push({ key: 'other', label: 'Other', color: '#94a3b8', tasks: others });
    }

    return groups;
  }, [tasks, statusOptions, defaultStatus, hideDone, doneStatus]);

  const emptyGroupNames = useMemo(
    () => groupedTasks.filter(g => g.tasks.length === 0).map(g => g.label),
    [groupedTasks],
  );

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setNewTitle(''); setNewStatus(''); setNewPriority('medium'); setNewDueDate(''); setNewDescription('');
    setNewChecklist([]); setNewChecklistInput(''); setShowCreateModal(true);
  };

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleDone = async (task: Task) => {
    const done = isTaskDone(task.status);
    const newStatus = done ? defaultStatus : doneStatus;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      await apiRequest(`/api/tasks/${task.id}`, 'PATCH', { status: newStatus });
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      Alert.alert('Error', e?.message || 'Failed to update task.');
    }
  };

  const openViewTask = (task: Task) => {
    // Big screen, list view: the right-hand panel. Phone, or the board (its
    // columns already use the full width): the modal, as before.
    if (isWide && viewMode === 'list') {
      openInPane(task.id);
      return;
    }
    editOnlyRef.current = false;
    setSelectedTask(task);
    setIsEditing(false);
    setShowViewModal(true);
  };

  // The modal was opened straight into Edit from the right-hand panel, so
  // Cancel closes it instead of showing the task's details again.
  const editOnlyRef = useRef(false);

  // Plain text seeded into the description field — only PATCH `content` when
  // the user actually edited it, so rich text authored on web isn't destroyed.
  const seededDescriptionRef = useRef('');

  const openEditTask = (task: Task | null = selectedTask) => {
    if (!task) return;
    setEditTitle(task.title || '');
    setEditStatus(task.status || defaultStatus);
    setEditPriority(task.priority || 'medium');
    setEditDueDate(task.dueDate ? dateStrOf(task.dueDate) : '');
    const seeded = stripHtml(task.contentText || task.content || '');
    seededDescriptionRef.current = seeded;
    setEditDescription(seeded);
    setEditChecklist(task.checklist ? [...task.checklist] : []);
    setEditChecklistInput('');
    setShowStatusPicker(false);
    setShowPriorityPicker(false);
    setShowEditDatePicker(false);
    setIsEditing(true);
  };

  // Edit from the right-hand panel: the existing modal, opened on the form.
  const openPaneEdit = (task: Task) => {
    setSelectedTask(task);
    openEditTask(task);
    editOnlyRef.current = true;
    setShowViewModal(true);
  };

  // Unsaved edits in the edit form?
  const isEditDirty = !!selectedTask && isEditing && (
    editTitle !== (selectedTask.title || '')
    || editStatus !== (selectedTask.status || defaultStatus)
    || editPriority !== (selectedTask.priority || 'medium')
    || editDueDate !== (selectedTask.dueDate ? dateStrOf(selectedTask.dueDate) : '')
    || editDescription !== seededDescriptionRef.current
    || JSON.stringify(editChecklist) !== JSON.stringify(selectedTask.checklist || [])
    || editChecklistInput.trim() !== ''
  );

  const closeViewModal = () => {
    setShowViewModal(false);
    setIsEditing(false);
    setSelectedTask(null);
    editOnlyRef.current = false;
  };

  // X, Android back: ask first if the form has unsaved edits.
  const requestCloseViewModal = () => {
    if (isEditDirty) confirmDiscard(closeViewModal);
    else closeViewModal();
  };

  const handleCancelEdit = () => {
    const leave = () => {
      if (editOnlyRef.current) closeViewModal();
      else {
        setIsEditing(false);
        setShowStatusPicker(false);
        setShowPriorityPicker(false);
        setShowEditDatePicker(false);
      }
    };
    if (isEditDirty) confirmDiscard(leave);
    else leave();
  };

  const isCreateDirty =
    newTitle.trim() !== ''
    || newDescription.trim() !== ''
    || newDueDate !== ''
    || newStatus !== ''
    || newPriority !== 'medium'
    || newChecklist.length > 0
    || newChecklistInput.trim() !== '';

  const requestCloseCreateModal = () => {
    if (isCreateDirty) confirmDiscard(() => setShowCreateModal(false));
    else setShowCreateModal(false);
  };

  const handleSaveTask = async () => {
    if (!selectedTask || !editTitle.trim()) return;
    setSaving(true);
    try {
      const body: any = {
        title: editTitle.trim(),
        status: editStatus,
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
        checklist: editChecklist,
      };
      if (editDescription !== seededDescriptionRef.current) {
        body.content = editDescription;
      }
      await apiRequest(`/api/tasks/${selectedTask.id}`, 'PATCH', body);
      closeViewModal();
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = (task: Task | null = selectedTask) => {
    if (!task) return;
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await apiRequest(`/api/tasks/${task.id}`, 'DELETE');
            setShowViewModal(false);
            setSelectedTask(null);
            if (paneTaskId === task.id) closePane();
            await fetchData();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete task.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await apiRequest('/api/tasks', 'POST', {
        type: 'task',
        title: newTitle.trim(),
        priority: newPriority,
        status: newStatus || defaultStatus,
        content: newDescription,
        dueDate: newDueDate ? new Date(newDueDate).toISOString() : undefined,
        checklist: newChecklist,
        projectId,
        taskContextType: 'project',
        taskContextId: projectId,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewStatus('');
      setNewPriority('medium');
      setNewDueDate('');
      setNewDescription('');
      setNewChecklist([]);
      setNewChecklistInput('');
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create task.');
    } finally {
      setCreating(false);
    }
  };

  // Works for the modal's task and the right-hand panel's (read from `tasks`).
  const handleToggleChecklistItem = async (task: Task, itemId: string) => {
    const previous = task.checklist || [];
    const updated = previous.map((item: any) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    );
    const apply = (checklist: Task['checklist']) => {
      setSelectedTask(prev => (prev && prev.id === task.id ? { ...prev, checklist } : prev));
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, checklist } : t));
    };
    apply(updated);
    try {
      await apiRequest(`/api/tasks/${task.id}`, 'PATCH', { checklist: updated });
    } catch (e: any) {
      apply(previous);
      Alert.alert('Error', e?.message || 'Failed to update checklist item.');
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  /** "Today" · "Tomorrow" · "Tue 24 Nov" · "3d overdue" · "No due date". */
  const dueLabel = (task: Task, done: boolean): { text: string; overdue: boolean } => {
    if (!task.dueDate) return { text: 'No due date', overdue: false };
    const overdue = !done && isOverdue(task.dueDate);
    const rel = getRelativeDate(task.dueDate);
    if (overdue || rel === 'Today' || rel === 'Tomorrow') return { text: rel, overdue };
    return {
      text: new Date(task.dueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
      overdue: false,
    };
  };

  const assigneeInitials = (task: Task) =>
    (task.assigneeNames || []).map(n => getInitials(n)).filter(Boolean).join(', ');

  const taskMeta = (task: Task, done: boolean, inOtherGroup: boolean) => {
    const due = dueLabel(task, done);
    const rest = [inOtherGroup ? getStatusLabel(task.status) : null, assigneeInitials(task) || null].filter(Boolean);
    return (
      <Text style={[type.caption, { color: k.muted }]} numberOfLines={1}>
        <Text style={due.overdue ? { color: k.danger } : undefined}>{due.text}</Text>
        {rest.length ? ` · ${rest.join(' · ')}` : ''}
      </Text>
    );
  };

  // `inOtherGroup`: the row sits under "Other", whose header doesn't name
  // the task's status — so the row has to.
  const renderTaskRow = (task: Task, inOtherGroup = false) => {
    const done = isTaskDone(task.status);
    // Swipe right to complete / reopen — same action and permission (any
    // signed-in user) as the circle; the tap still opens the task.
    return (
      <SwipeRow
        key={task.id}
        left={{
          label: done ? 'Reopen' : 'Done',
          icon: done ? 'arrow-undo' : 'checkmark',
          color: done ? theme.textSecondary : theme.statusSuccessSolid,
          haptic: 'medium',
          onAction: () => handleToggleDone(task),
        }}
      >
        <ListRow
          style={[{ backgroundColor: k.surface, alignItems: 'flex-start' }, isWide && paneTaskId === task.id && { backgroundColor: k.tint }]}
          onPress={() => openViewTask(task)}
          lead={
            <View style={ks.circle}>
              <Checkbox
                round
                checked={done}
                onPress={() => handleToggleDone(task)}
                accessibilityLabel={`Mark ${task.title} ${done ? 'not done' : 'done'}`}
              />
            </View>
          }
          title={task.title}
          done={done}
          subtitle={taskMeta(task, done, inOtherGroup)}
        />
      </SwipeRow>
    );
  };

  const renderBoardCard = (task: Task) => {
    const done = isTaskDone(task.status);
    return (
      <Card key={task.id} variant="list">
        <ListRow
          onPress={() => openViewTask(task)}
          style={{ alignItems: 'flex-start' }}
          lead={
            <View style={ks.circle}>
              <Checkbox
                round
                checked={done}
                onPress={() => handleToggleDone(task)}
                accessibilityLabel={`Mark ${task.title} ${done ? 'not done' : 'done'}`}
              />
            </View>
          }
          title={task.title}
          done={done}
          subtitle={taskMeta(task, done, false)}
        />
      </Card>
    );
  };

  // Phone: ~68% of the screen so the next column peeks in. Big screen (Duo
  // unfolded): three columns side by side — width minus the content
  // padding each side and the two column gaps, split three ways. Only widths
  // change on fold/unfold, so the board's scroll views stay mounted.
  const columnWidth = isWide
    ? Math.floor((screenWidth - 2 * space.screenX - 2 * space.rowGap) / 3)
    : Math.max(screenWidth * 0.68, 240);

  const renderDeleteButton = (task: Task) => (
    <TouchableOpacity
      style={[styles.deleteBtn, { borderColor: theme.statusDanger + '40' }]}
      onPress={() => handleDeleteTask(task)}
      disabled={deleting}
    >
      {deleting ? (
        <ActivityIndicator size="small" color="#ef4444" />
      ) : (
        <>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.deleteBtnText, { color: theme.statusDanger }]}>Delete Task</Text>
        </>
      )}
    </TouchableOpacity>
  );

  // The task open in the right-hand panel, read live from the list so a tick
  // or a save shows straight away. Deleted → empty panel.
  const paneTask = paneTaskId ? tasks.find(t => t.id === paneTaskId) ?? null : null;

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: k.bg, paddingTop: insets.top + metrics.projectTasks.headerTop }]}>
        <View style={ks.header}>
          <TasksHeader title="Tasks" project={{ name: projectName, color: projectColor ?? null, id: projectId }} onBack={() => navigation.goBack()} />
        </View>
        <SkeletonList />
      </View>
    );
  }

  // ─── Status picker options (shared between edit and create) ──────────────────

  const pickerStatusOptions: StatusOption[] = statusOptions.length > 0
    ? statusOptions
    : [
        { key: 'todo', name: 'To Do', color: '#94a3b8', sortOrder: 0 },
        { key: 'in_progress', name: 'In Progress', color: '#3b82f6', sortOrder: 1 },
        { key: 'done', name: 'Done', color: '#22c55e', sortOrder: 2 },
      ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>

      {/* Header */}
      <View style={[ks.header, { paddingTop: insets.top + metrics.projectTasks.headerTop }]}>
        <TasksHeader
          title="Tasks"
          project={{ name: projectName, color: projectColor ?? null, id: projectId }}
          onBack={() => navigation.goBack()}
          actions={[
            {
              icon: hideDone ? EyeOff : Eye,
              label: hideDone ? 'Show done tasks' : 'Hide done tasks',
              onPress: () => setHideDone(v => !v),
            },
            {
              icon: viewMode === 'list' ? LayoutGrid : List,
              label: viewMode === 'list' ? 'Board view' : 'List view',
              onPress: () => { if (viewMode === 'list') closePane(); setViewMode(v => v === 'list' ? 'board' : 'list'); },
            },
          ]}
        />
      </View>

      {/* List view */}
      {viewMode === 'list' ? (
        // Always wrapped in TwoPane so the list keeps its place in the tree —
        // folding/unfolding never remounts it. The board stays full width.
        <TwoPane
          {...paneProps}
          // Slimmer list than the default 360 so the open task gets the room (Jed, 11-21).
          listWidth={300}
          emptyTitle="Select a task"
          emptyIcon="checkbox-outline"
          detail={paneTask ? (
            <TaskDetailPane
              key={paneTask.id}
              task={paneTask}
              statusLabel={getStatusLabel(paneTask.status)}
              statusColor={getStatusColor(paneTask.status)}
              descriptionLabel="Description"
              onToggleChecklistItem={itemId => handleToggleChecklistItem(paneTask, itemId)}
              colors={colors}
              isDark={isDark}
              currentUserId={user?.id}
              onEdit={() => openPaneEdit(paneTask)}
              footer={renderDeleteButton(paneTask)}
            />
          ) : null}
          list={
        <ScrollView
          style={styles.scroll}
          // Big screen: keep task rows to a readable width. Style only — no remount.
          contentContainerStyle={[ks.list, { paddingBottom: FAB_CLEARANCE + insets.bottom }, isWide && readableFrame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
        >
          {tasks.length === 0 ? (
            <View style={ks.empty}>
              <EmptyState icon={SquareCheck} title="No tasks yet" helper="Tap + to add the first task for this project." />
            </View>
          ) : (
            <>
              {groupedTasks
                .filter(group => group.tasks.length > 0 || showEmptyGroups)
                .map(group => {
                  const open = !collapsedSections[group.key];
                  return (
                    <View key={group.key} style={ks.group}>
                      <GroupHeader
                        title={group.label}
                        meta={group.tasks.length}
                        open={open}
                        onToggle={() => toggleSection(group.key)}
                      />
                      {open ? (
                        group.tasks.length === 0 ? (
                          <Text style={[type.meta, { color: k.muted }]}>No tasks</Text>
                        ) : (
                          <Card variant="list">
                            {group.tasks.map(t => renderTaskRow(t, group.key === 'other'))}
                          </Card>
                        )
                      ) : null}
                    </View>
                  );
                })}
              {emptyGroupNames.length > 0 ? (
                <Pressable
                  onPress={() => setShowEmptyGroups(v => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showEmptyGroups }}
                  style={ks.emptyGroups}
                >
                  <Text style={[type.meta, { color: k.muted }]}>{showEmptyGroups ? 'Hide empty groups' : 'Show empty groups'}</Text>
                  {!showEmptyGroups ? (
                    <Text style={[type.meta, { color: k.faint, flexShrink: 1 }]} numberOfLines={1}>
                      {emptyGroupNames.join(', ')}
                    </Text>
                  ) : null}
                  <ChevronRight size={metrics.projectTasks.emptyGroupsIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
          }
        />
      ) : (
        /* Board view */
        <ScrollView
          horizontal
          style={styles.boardScroll}
          contentContainerStyle={[ks.board, { paddingBottom: FAB_CLEARANCE + insets.bottom }]}
          showsHorizontalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
        >
          {groupedTasks.map(group => (
            <View key={group.key} style={[ks.boardColumn, { width: columnWidth }]}>
              <GroupHeader title={group.label} meta={group.tasks.length} open onToggle={() => {}} />
              {group.tasks.length === 0 ? (
                <Text style={[type.meta, { color: k.muted }]}>No tasks</Text>
              ) : (
                <View style={ks.boardCards}>{group.tasks.map(renderBoardCard)}</View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <FAB onPress={openCreate} label="New task" />

      {/* View / Edit Task Modal */}
      {/* Keyboard: viewing, the sheet hugs its content and the KeyboardAvoidingView
          lifts it (comment box). Editing, the sheet is a fixed 90% so its header
          — with Save — stays above the keyboard, and the ScrollView insets itself
          and scrolls the focused field into view. */}
      <Modal visible={showViewModal} animationType="slide" transparent onRequestClose={requestCloseViewModal}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.modalSheet, sheetFrame, { backgroundColor: colors.card }, isEditing && styles.modalSheetForm]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  onPress={requestCloseViewModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={24} color={colors.secondary} />
                </TouchableOpacity>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.modalHeaderTitle, { color: colors.text }]}>
                  {isEditing ? 'Edit Task' : 'Task Details'}
                </Text>
                {!isEditing ? (
                  <TouchableOpacity onPress={() => openEditTask()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: colors.accent, fontWeight: '600', fontSize: 15 }}>Edit</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleSaveTask}
                    disabled={saving || !editTitle.trim()}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Save task"
                  >
                    {saving
                      ? <ActivityIndicator size="small" color={colors.accent} />
                      : <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: editTitle.trim() ? colors.accent : colors.muted, fontWeight: '600', fontSize: 15 }}>Save</Text>}
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView
                {...editKb.scrollProps}
                style={styles.modalBody}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardDismissMode="interactive"
              >
                {!isEditing && selectedTask ? (
                  <TaskDetail
                    task={selectedTask}
                    statusLabel={getStatusLabel(selectedTask.status)}
                    statusColor={getStatusColor(selectedTask.status)}
                    descriptionLabel="Description"
                    onToggleChecklistItem={itemId => handleToggleChecklistItem(selectedTask, itemId)}
                    colors={colors}
                    isDark={isDark}
                    currentUserId={user?.id}
                    footer={renderDeleteButton(selectedTask)}
                  />
                ) : null}

                {isEditing ? (
                  <>
                    <View style={styles.editField}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Title</Text>
                      <TextInput
                        style={[styles.editInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder="Task title"
                        placeholderTextColor={colors.muted}
                        autoFocus
                        autoCapitalize="sentences"
                        returnKeyType="next"
                        submitBehavior="submit"
                        onSubmitEditing={() => editDescRef.current?.focus()}
                        onFocus={editKb.onInputFocus}
                      />
                    </View>
                    {/* Big screen: status + priority side by side. The wrapper is always
                        rendered (only its style changes) so folding never remounts the form. */}
                    <View style={isWide ? styles.fieldPair : undefined}>
                      <View style={[styles.editField, isWide && styles.fieldHalf]}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Status</Text>
                        <TouchableOpacity
                          style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: showStatusPicker ? colors.accent : colors.border }]}
                          onPress={() => { setShowStatusPicker(v => !v); setShowPriorityPicker(false); }}
                        >
                          <View style={[styles.selectDot, { backgroundColor: getStatusColor(editStatus) }]} />
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editSelectText, { color: colors.text }]}>{getStatusLabel(editStatus)}</Text>
                          <Ionicons name={showStatusPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                        </TouchableOpacity>
                        {showStatusPicker && (
                          <View style={[styles.inlinePickerList, { borderColor: colors.border, backgroundColor: colors.card }]}>
                            {pickerStatusOptions.map(opt => (
                              <TouchableOpacity
                                key={opt.key}
                                style={[styles.inlinePickerItem, { borderBottomColor: colors.border }, editStatus === opt.key ? { backgroundColor: colors.accent + '15' } : null]}
                                onPress={() => { setEditStatus(opt.key); setShowStatusPicker(false); }}
                              >
                                <View style={[styles.selectDot, { backgroundColor: opt.color || '#94a3b8' }]} />
                                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlinePickerText, { color: editStatus === opt.key ? colors.accent : colors.text }]}>{opt.name}</Text>
                                {editStatus === opt.key && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                      <View style={[styles.editField, isWide && styles.fieldHalf]}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Priority</Text>
                        <TouchableOpacity
                          style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: showPriorityPicker ? colors.accent : colors.border }]}
                          onPress={() => { setShowPriorityPicker(v => !v); setShowStatusPicker(false); }}
                        >
                          <View style={[styles.selectDot, { backgroundColor: getPriorityColor(editPriority) }]} />
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editSelectText, { color: colors.text }]}>{PRIORITY_LABELS[editPriority] || editPriority}</Text>
                          <Ionicons name={showPriorityPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                        </TouchableOpacity>
                        {showPriorityPicker && (
                          <View style={[styles.inlinePickerList, { borderColor: colors.border, backgroundColor: colors.card }]}>
                            {PRIORITY_ORDER.map(p => (
                              <TouchableOpacity
                                key={p}
                                style={[styles.inlinePickerItem, { borderBottomColor: colors.border }, editPriority === p ? { backgroundColor: colors.accent + '15' } : null]}
                                onPress={() => { setEditPriority(p); setShowPriorityPicker(false); }}
                              >
                                <View style={[styles.selectDot, { backgroundColor: getPriorityColor(p) }]} />
                                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlinePickerText, { color: editPriority === p ? colors.accent : colors.text }]}>{PRIORITY_LABELS[p]}</Text>
                                {editPriority === p && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.editField}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Due Date</Text>
                      <TouchableOpacity
                        style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: showEditDatePicker ? colors.accent : colors.border }]}
                        onPress={() => { setShowEditDatePicker(v => !v); setShowStatusPicker(false); setShowPriorityPicker(false); }}
                      >
                        <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editSelectText, { color: editDueDate ? colors.text : colors.muted }]}>
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
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Description</Text>
                      <TextInput
                        style={[styles.editTextArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                        ref={editDescRef}
                        onFocus={editKb.onInputFocus}
                        autoCapitalize="sentences"
                        value={editDescription}
                        onChangeText={setEditDescription}
                        placeholder="Add a description..."
                        placeholderTextColor={colors.muted}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                      />
                    </View>
                    <View style={styles.editField}>
                      <View style={styles.checklistHeader}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Checklist</Text>
                        {editChecklist.length > 0 ? (
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.checklistProgress, { color: colors.muted }]}>
                            {editChecklist.filter(i => i.completed).length}/{editChecklist.length}
                          </Text>
                        ) : null}
                      </View>
                      {editChecklist.map((item, idx) => (
                        <View key={item.id} style={[styles.editChecklistRow, { borderColor: colors.border }]}>
                          <TouchableOpacity onPress={() => setEditChecklist(prev => prev.map((it, i) => i === idx ? { ...it, completed: !it.completed } : it))} hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}>
                            <Ionicons name={item.completed ? 'checkbox' : 'square-outline'} size={22} color={item.completed ? theme.statusSuccess : colors.muted} />
                          </TouchableOpacity>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editChecklistItemText, { color: item.completed ? colors.muted : colors.text }, item.completed ? { textDecorationLine: 'line-through' } as any : null]} numberOfLines={2}>
                            {item.text}
                          </Text>
                          <TouchableOpacity onPress={() => setEditChecklist(prev => prev.filter((_, i) => i !== idx))} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Remove item">
                            <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <View style={[styles.checklistAddRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                        <TextInput
                          style={[styles.checklistAddInput, { color: colors.text }]}
                          value={editChecklistInput}
                          onChangeText={setEditChecklistInput}
                          placeholder="Add item..."
                          placeholderTextColor={colors.muted}
                          onFocus={editKb.onInputFocus}
                          autoCapitalize="sentences"
                          // Keep the keyboard up to add the next item.
                          submitBehavior="submit"
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            if (!editChecklistInput.trim()) return;
                            setEditChecklist(prev => [...prev, { id: Date.now().toString(), text: editChecklistInput.trim(), completed: false }]);
                            setEditChecklistInput('');
                          }}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            if (!editChecklistInput.trim()) return;
                            setEditChecklist(prev => [...prev, { id: Date.now().toString(), text: editChecklistInput.trim(), completed: false }]);
                            setEditChecklistInput('');
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                ) : null}
              </ScrollView>
              {/* Primary action at the bottom, in thumb reach and above the
                  keyboard; the header Save stays too. */}
              {isEditing ? (
                <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <TouchableOpacity
                    style={[styles.editCancelBtn, { borderColor: colors.border }]}
                    onPress={handleCancelEdit}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.editCancelText, { color: colors.secondary }]} maxFontSizeMultiplier={1.4}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editSaveBtn, { backgroundColor: colors.accent, opacity: saving || !editTitle.trim() ? 0.6 : 1 }]}
                    onPress={handleSaveTask}
                    disabled={saving || !editTitle.trim()}
                    accessibilityRole="button"
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.editSaveText} maxFontSizeMultiplier={1.4}>Save</Text>}
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>


      {/* Create Task Modal */}
      {/* A form: fixed 90% sheet, so the header's Add stays above the keyboard;
          the ScrollView insets itself and scrolls the focused field into view. */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={requestCloseCreateModal}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.modalSheet, sheetFrame, { backgroundColor: colors.card }, styles.modalSheetForm]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  onPress={requestCloseCreateModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={24} color={colors.secondary} />
                </TouchableOpacity>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.modalHeaderTitle, { color: colors.text }]}>New Task</Text>
                <TouchableOpacity onPress={handleCreateTask} disabled={!newTitle.trim() || creating} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  {creating
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: newTitle.trim() ? colors.accent : colors.muted, fontWeight: '600', fontSize: 15 }}>Add</Text>}
                </TouchableOpacity>
              </View>
              <ScrollView
                {...createKb.scrollProps}
                style={styles.modalBody}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardDismissMode="interactive"
              >
                <View style={styles.editField}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Title</Text>
                  <TextInput
                    style={[styles.editInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="Task title"
                    placeholderTextColor={colors.muted}
                    autoFocus
                    autoCapitalize="sentences"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => newDescRef.current?.focus()}
                    onFocus={createKb.onInputFocus}
                  />
                </View>
                {/* Big screen: status + priority side by side. The wrapper is always
                    rendered (only its style changes) so folding never remounts the form. */}
                <View style={isWide ? styles.fieldPair : undefined}>
                  <View style={[styles.editField, isWide && styles.fieldHalf]}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Status</Text>
                    <TouchableOpacity
                      style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: showNewStatusPicker ? colors.accent : colors.border }]}
                      onPress={() => { setShowNewStatusPicker(v => !v); setShowNewPriorityPicker(false); }}
                    >
                      <View style={[styles.selectDot, { backgroundColor: getStatusColor(newStatus || defaultStatus) }]} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editSelectText, { color: colors.text }]}>{getStatusLabel(newStatus || defaultStatus)}</Text>
                      <Ionicons name={showNewStatusPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                    </TouchableOpacity>
                    {showNewStatusPicker && (
                      <View style={[styles.inlinePickerList, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        {pickerStatusOptions.map(opt => {
                          const active = (newStatus || defaultStatus) === opt.key;
                          return (
                            <TouchableOpacity
                              key={opt.key}
                              style={[styles.inlinePickerItem, { borderBottomColor: colors.border }, active ? { backgroundColor: colors.accent + '15' } : null]}
                              onPress={() => { setNewStatus(opt.key); setShowNewStatusPicker(false); }}
                            >
                              <View style={[styles.selectDot, { backgroundColor: opt.color || '#94a3b8' }]} />
                              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlinePickerText, { color: active ? colors.accent : colors.text }]}>{opt.name}</Text>
                              {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                  <View style={[styles.editField, isWide && styles.fieldHalf]}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Priority</Text>
                    <TouchableOpacity
                      style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: showNewPriorityPicker ? colors.accent : colors.border }]}
                      onPress={() => { setShowNewPriorityPicker(v => !v); setShowNewStatusPicker(false); }}
                    >
                      <View style={[styles.selectDot, { backgroundColor: getPriorityColor(newPriority) }]} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editSelectText, { color: colors.text }]}>{PRIORITY_LABELS[newPriority] || newPriority}</Text>
                      <Ionicons name={showNewPriorityPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                    </TouchableOpacity>
                    {showNewPriorityPicker && (
                      <View style={[styles.inlinePickerList, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        {PRIORITY_ORDER.map(p => (
                          <TouchableOpacity
                            key={p}
                            style={[styles.inlinePickerItem, { borderBottomColor: colors.border }, newPriority === p ? { backgroundColor: colors.accent + '15' } : null]}
                            onPress={() => { setNewPriority(p); setShowNewPriorityPicker(false); }}
                          >
                            <View style={[styles.selectDot, { backgroundColor: getPriorityColor(p) }]} />
                            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlinePickerText, { color: newPriority === p ? colors.accent : colors.text }]}>{PRIORITY_LABELS[p]}</Text>
                            {newPriority === p && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.editField}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Due Date</Text>
                  <TouchableOpacity
                    style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: showNewDatePicker ? colors.accent : colors.border }]}
                    onPress={() => { setShowNewDatePicker(v => !v); setShowNewStatusPicker(false); setShowNewPriorityPicker(false); }}
                  >
                    <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editSelectText, { color: newDueDate ? colors.text : colors.muted }]}>
                      {newDueDate ? fromLocalDateStr(newDueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date'}
                    </Text>
                    {newDueDate ? (
                      <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setNewDueDate(''); setShowNewDatePicker(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name={showNewDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                    )}
                  </TouchableOpacity>
                  {showNewDatePicker && (
                    <DateTimePicker
                      value={newDueDate ? fromLocalDateStr(newDueDate) : new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      themeVariant={isDark ? 'dark' : 'light'}
                      onChange={(_event, date) => {
                        if (Platform.OS === 'android') setShowNewDatePicker(false);
                        if (date) setNewDueDate(toLocalDateStr(date));
                      }}
                      style={{ marginTop: 4 }}
                    />
                  )}
                </View>
                <View style={styles.editField}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Description</Text>
                  <TextInput
                    style={[styles.editTextArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    ref={newDescRef}
                    onFocus={createKb.onInputFocus}
                    autoCapitalize="sentences"
                    value={newDescription}
                    onChangeText={setNewDescription}
                    placeholder="Add a description..."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
                <View style={styles.editField}>
                  <View style={styles.checklistHeader}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editLabel, { color: colors.secondary }]}>Checklist</Text>
                    {newChecklist.length > 0 ? (
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.checklistProgress, { color: colors.muted }]}>
                        {newChecklist.filter(i => i.completed).length}/{newChecklist.length}
                      </Text>
                    ) : null}
                  </View>
                  {newChecklist.map((item, idx) => (
                    <View key={item.id} style={[styles.editChecklistRow, { borderColor: colors.border }]}>
                      <TouchableOpacity onPress={() => setNewChecklist(prev => prev.map((it, i) => i === idx ? { ...it, completed: !it.completed } : it))} hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}>
                        <Ionicons name={item.completed ? 'checkbox' : 'square-outline'} size={22} color={item.completed ? theme.statusSuccess : colors.muted} />
                      </TouchableOpacity>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.editChecklistItemText, { color: item.completed ? colors.muted : colors.text }, item.completed ? { textDecorationLine: 'line-through' } as any : null]} numberOfLines={2}>
                        {item.text}
                      </Text>
                      <TouchableOpacity onPress={() => setNewChecklist(prev => prev.filter((_, i) => i !== idx))} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Remove item">
                        <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={[styles.checklistAddRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                    <TextInput
                      style={[styles.checklistAddInput, { color: colors.text }]}
                      value={newChecklistInput}
                      onChangeText={setNewChecklistInput}
                      placeholder="Add item..."
                      placeholderTextColor={colors.muted}
                      onFocus={createKb.onInputFocus}
                      autoCapitalize="sentences"
                      // Keep the keyboard up to add the next item.
                      submitBehavior="submit"
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (!newChecklistInput.trim()) return;
                        setNewChecklist(prev => [...prev, { id: Date.now().toString(), text: newChecklistInput.trim(), completed: false }]);
                        setNewChecklistInput('');
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        if (!newChecklistInput.trim()) return;
                        setNewChecklist(prev => [...prev, { id: Date.now().toString(), text: newChecklistInput.trim(), completed: false }]);
                        setNewChecklistInput('');
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
              {/* Primary action at the bottom (the header Add stays too). */}
              <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TouchableOpacity
                  style={[styles.editSaveBtn, { backgroundColor: colors.accent, opacity: creating || !newTitle.trim() ? 0.6 : 1 }]}
                  onPress={handleCreateTask}
                  disabled={creating || !newTitle.trim()}
                  accessibilityRole="button"
                >
                  {creating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.editSaveText} maxFontSizeMultiplier={1.4}>Add task</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // List view
  scroll: { flex: 1 },

  // Board view
  boardScroll: { flex: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  // flex: 1 so the sheet's percentage heights resolve against the screen.
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  // Forms: a fixed height, so the header (Save / Add) sits well above the keyboard.
  modalSheetForm: { height: '90%' },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: { fontSize: 16, fontWeight: '700' },
  modalBody: { paddingHorizontal: 20, paddingTop: 20 },

  checklistHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  checklistProgress: { fontSize: 12, fontWeight: '600' },
  editChecklistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  editChecklistItemText: { flex: 1, fontSize: 14 },
  checklistAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  checklistAddInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, marginBottom: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  deleteBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },

  // Edit mode
  editField: { marginBottom: 16 },
  fieldPair: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fieldHalf: { flex: 1 },
  editLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  editInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  editSelect: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  editSelectText: { flex: 1, fontSize: 15 },
  selectDot: { width: 10, height: 10, borderRadius: 5 },
  editTextArea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 100 },
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 10, minHeight: 50, justifyContent: 'center', alignItems: 'center' },
  editCancelText: { fontSize: 15, fontWeight: '600' },
  editSaveBtn: { flex: 1, borderRadius: 10, minHeight: 50, justifyContent: 'center', alignItems: 'center' },
  editSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Inline pickers (accordion-style, no separate modal)
  inlinePickerList: { borderWidth: 1, borderRadius: 8, marginTop: 4, overflow: 'hidden' },
  inlinePickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  inlinePickerText: { flex: 1, fontSize: 15 },

});

const pt = metrics.projectTasks;

// Revamp v1 list / board styles (the modals below still use `styles`).
const ks = StyleSheet.create({
  header: { paddingHorizontal: space.screenX, paddingBottom: pt.headerBottom },
  list: { paddingHorizontal: space.screenX, paddingTop: pt.listTop, gap: pt.groupGap },
  group: {},
  // Circle sits 1dp lower so it lines up with the first line of the title.
  circle: { paddingTop: pt.circleOffset },
  emptyGroups: { flexDirection: 'row', alignItems: 'center', gap: space.inline, paddingVertical: space.inlineSm },
  empty: { minHeight: metrics.emptyState.circle * 6 },
  board: { paddingHorizontal: space.screenX, paddingTop: pt.listTop, gap: space.rowGap },
  boardColumn: { gap: 0 },
  boardCards: { gap: pt.boardCardGap },
});
