import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  useColorScheme,
  Alert,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest } from '../services/api';
import { dateStrOf } from '../lib/dates';
import { doneStatusKey, defaultStatusKey, isDoneStatus, type TaskStatusOption } from '../lib/taskStatus';
import { useAuth } from '../contexts/AuthContext';
import { TaskDetail, TaskDetailPane, stripHtml } from '../components/tasks/TaskDetail';
import { TaskForm } from '../components/tasks/TaskForm';
import { useTaskPane, confirmDiscard } from '../components/tasks/useTaskPane';
import { TwoPane } from '../components/ui/TwoPane';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme, useColors, currentTheme, metrics, space, tabular, type } from '../theme';
import { ChevronDown, ChevronRight, Eye, EyeOff, LayoutGrid, List, SquareCheck, Trash2 } from 'lucide-react-native';
import { usePersistedState } from '../lib/usePersistedState';
import { Card, Checkbox, EmptyState, FAB, ModalSheet, FAB_CLEARANCE, GroupHeader, ListRow, PrimaryButton, SecondaryButton, TasksHeader, TextButton } from '../components/kit';
import { SkeletonList } from '../components/ui/Skeleton';
import { getInitials } from '../lib/format';
import { SwipeRow } from '../components/ui/SwipeRow';
import { useLayout } from '../lib/useLayout';
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
  const [collapsedSections, setCollapsedSections] = usePersistedState<Record<string, boolean>>(`projectTasks.collapsed.${projectId}`, {});

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
  const [hideDone, setHideDone] = usePersistedState<boolean>('projectTasks.hideDone', true);
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
    setCollapsedSections({ ...collapsedSections, [key]: !collapsedSections[key] });
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
    : Math.max(screenWidth * metrics.projectTasks.boardColumnShare, metrics.projectTasks.boardColumnMin);

  // Plain red text, never a red outlined button (design D03).
  const renderDeleteButton = (task: Task) => (
    <TextButton
      label={deleting ? 'Deleting…' : 'Delete task'}
      icon={Trash2}
      tone="danger"
      disabled={deleting}
      onPress={() => handleDeleteTask(task)}
    />
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
              onPress: () => setHideDone(!hideDone),
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
          listWidth={metrics.projectTasks.listPaneWidth}
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
              {hideDone && groupedTasks.every(g => g.tasks.length === 0) ? (
                <Text style={[type.body, { color: k.muted }]}>All tasks done. Tap the eye to show them.</Text>
              ) : null}
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
                  {showEmptyGroups ? (
                    <ChevronDown size={metrics.projectTasks.emptyGroupsIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
                  ) : (
                    <ChevronRight size={metrics.projectTasks.emptyGroupsIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
                  )}
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
              {/* Board columns don't fold, so a plain title + count (no caret). */}
              <View style={ks.boardHead}>
                <Text style={[type.rowTitle, { color: k.text, flexShrink: 1 }]} numberOfLines={1}>{group.label}</Text>
                <Text style={[type.meta, tabular, { color: k.muted }]}>{group.tasks.length}</Text>
              </View>
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
      <ModalSheet
        visible={showViewModal}
        onRequestClose={requestCloseViewModal}
        title={isEditing ? 'Edit task' : 'Task'}
        cancelLabel={isEditing ? 'Cancel' : 'Close'}
        onCancel={requestCloseViewModal}
        doneLabel={isEditing ? 'Save' : 'Edit'}
        onDone={isEditing ? handleSaveTask : () => openEditTask()}
        doneDisabled={isEditing && (saving || !editTitle.trim())}
        doneLoading={isEditing && saving}
        form={isEditing}
        // Primary action at the bottom too, in thumb reach above the keyboard.
        bottomBar={isEditing ? (
          <>
            <SecondaryButton label="Cancel" onPress={handleCancelEdit} />
            <PrimaryButton label="Save" onPress={handleSaveTask} loading={saving} disabled={!editTitle.trim()} />
          </>
        ) : undefined}
      >
        <ScrollView
          {...editKb.scrollProps}
          style={ks.modalBody}
          contentContainerStyle={ks.modalContent}
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
            <TaskForm
              isDark={isDark}
              title={editTitle}
              onTitle={setEditTitle}
              titleAutoFocus
              status={editStatus}
              statusOptions={pickerStatusOptions}
              onStatus={setEditStatus}
              priority={editPriority}
              onPriority={setEditPriority}
              dueDate={editDueDate}
              onDueDate={setEditDueDate}
              description={editDescription}
              onDescription={setEditDescription}
              descRef={editDescRef}
              checklist={editChecklist}
              onChecklist={setEditChecklist}
              onInputFocus={editKb.onInputFocus}
            />
          ) : null}
        </ScrollView>
      </ModalSheet>

      {/* New task: a form, so a fixed 90% sheet keeps the header's Add above the keyboard. */}
      <ModalSheet
        visible={showCreateModal}
        onRequestClose={requestCloseCreateModal}
        title="New task"
        cancelLabel="Cancel"
        onCancel={requestCloseCreateModal}
        doneLabel="Add"
        onDone={handleCreateTask}
        doneDisabled={!newTitle.trim() || creating}
        doneLoading={creating}
        form
        bottomBar={<PrimaryButton label="Add task" onPress={handleCreateTask} loading={creating} disabled={!newTitle.trim()} />}
      >
        <ScrollView
          {...createKb.scrollProps}
          style={ks.modalBody}
          contentContainerStyle={ks.modalContent}
          keyboardDismissMode="interactive"
        >
          <TaskForm
            isDark={isDark}
            title={newTitle}
            onTitle={setNewTitle}
            titleAutoFocus
            status={newStatus || defaultStatus}
            statusOptions={pickerStatusOptions}
            onStatus={setNewStatus}
            priority={newPriority}
            onPriority={setNewPriority}
            dueDate={newDueDate}
            onDueDate={setNewDueDate}
            description={newDescription}
            onDescription={setNewDescription}
            descRef={newDescRef}
            checklist={newChecklist}
            onChecklist={setNewChecklist}
            onInputFocus={createKb.onInputFocus}
          />
        </ScrollView>
      </ModalSheet>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // List view
  scroll: { flex: 1 },

  // Board view
  boardScroll: { flex: 1 },

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
  empty: { minHeight: metrics.emptyState.areaMinHeight },
  board: { paddingHorizontal: space.screenX, paddingTop: pt.listTop, gap: space.rowGap },
  modalBody: { paddingHorizontal: space.screenX },
  modalContent: { paddingTop: space.inline, paddingBottom: space.screenBottom },
  boardColumn: { gap: 0 },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.gap, minHeight: metrics.groupHeader.height, marginBottom: space.groupHeaderToCard },
  boardCards: { gap: pt.boardCardGap },
});
