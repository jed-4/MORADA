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
  FlatList,
  SectionList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
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

import { useTheme, currentTheme, MAX_FONT_SCALE } from '../theme';
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
  const { projectId, projectName } = route.params as { projectId: string; projectName: string };
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

  // ─── Actions ─────────────────────────────────────────────────────────────────

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

  // `inOtherGroup`: the row sits under "Other", whose header doesn't name
  // the task's status — so the row has to.
  const renderTaskRow = (task: Task, inOtherGroup = false) => {
    const done = isTaskDone(task.status);
    const overdue = !done && isOverdue(task.dueDate);
    const statusColor = getStatusColor(task.status);
    // Phone: the list is grouped by status, so the row's status pill repeats
    // its section header — show it only where the header doesn't say it.
    // The chevron goes too (the whole row is the tap). Big screen unchanged.
    const showStatus = isWide || inOtherGroup;
    const hasMeta = showStatus || !!task.dueDate;
    // Swipe right to complete / reopen — same action and permission (any
    // signed-in user) as the checkbox; the tap still opens the task.
    return (
      <SwipeRow
        key={task.id}
        containerStyle={styles.taskRowSwipe}
        left={{
          label: done ? 'Reopen' : 'Done',
          icon: done ? 'arrow-undo' : 'checkmark',
          color: done ? theme.textSecondary : theme.statusSuccessSolid,
          haptic: 'medium',
          onAction: () => handleToggleDone(task),
        }}
      >
      <TouchableOpacity
        style={[
          styles.taskRow,
          { backgroundColor: colors.card, borderColor: colors.border },
          isWide && paneTaskId === task.id && { borderColor: colors.accent },
        ]}
        onPress={() => openViewTask(task)}
        activeOpacity={0.7}
      >
        <View style={[styles.priorityStrip, { backgroundColor: getPriorityColor(task.priority) }]} />
        <TouchableOpacity
          style={styles.checkArea}
          onPress={() => handleToggleDone(task)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Mark ${task.title} ${done ? 'not done' : 'done'}`}
        >
          <View style={[
            styles.checkCircle,
            { borderColor: done ? statusColor : colors.muted },
            done ? { backgroundColor: statusColor } : null,
          ]}>
            {done && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
        </TouchableOpacity>
        <View style={styles.taskContent}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[
              styles.taskTitle,
              { color: done ? colors.muted : colors.text },
              done ? styles.strikethrough : null,
            ]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
          {hasMeta ? (
            <View style={styles.taskMeta}>
              {showStatus ? (
                <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.statusPillText, { color: statusColor }]}>
                    {getStatusLabel(task.status)}
                  </Text>
                </View>
              ) : null}
              {task.dueDate ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.dueText, { color: overdue ? theme.statusDanger : colors.secondary }]}>
                  {getRelativeDate(task.dueDate)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {isWide ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
      </TouchableOpacity>
      </SwipeRow>
    );
  };

  const renderBoardCard = (task: Task) => {
    const overdue = isOverdue(task.dueDate);
    return (
      <TouchableOpacity
        key={task.id}
        style={[styles.boardCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => openViewTask(task)}
        activeOpacity={0.7}
      >
        <View style={[styles.boardCardPriorityStrip, { backgroundColor: getPriorityColor(task.priority) }]} />
        <View style={styles.boardCardInner}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardCardTitle, { color: colors.text }]} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.boardCardMeta}>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) + '20' }]}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.priorityBadgeText, { color: getPriorityColor(task.priority) }]}>
                {PRIORITY_LABELS[task.priority || 'low'] || 'Low'}
              </Text>
            </View>
            {task.dueDate ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardCardDate, { color: overdue ? theme.statusDanger : colors.secondary }]}>
                {getRelativeDate(task.dueDate)}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.boardCardDoneBtn}
            onPress={() => handleToggleDone(task)}
            // 18pt icon + 13 each side = 44pt.
            hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isTaskDone(task.status) }}
          >
            <Ionicons
              name={isTaskDone(task.status) ? 'checkbox' : 'square-outline'}
              size={18}
              color={isTaskDone(task.status) ? getStatusColor(task.status) : colors.muted}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Phone: ~68% of the screen so the next column peeks in. Big screen (Duo
  // unfolded): three columns side by side — width minus the 16pt content
  // padding each side and the two 12pt gaps, split three ways. Only widths
  // change on fold/unfold, so the board's scroll views stay mounted.
  const columnWidth = isWide
    ? Math.floor((screenWidth - 32 - 2 * 12) / 3)
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
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
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
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.accent + '25',
        borderBottomColor: colors.accent + '40',
      }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Tasks</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.headerSubtitle, { color: colors.secondary }]} numberOfLines={1}>{projectName}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerIconBtn, {
              borderColor: hideDone ? colors.accent + '60' : colors.border,
              backgroundColor: hideDone ? colors.accent + '15' : 'transparent',
            }]}
            onPress={() => setHideDone(v => !v)}
            hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }}
            accessibilityLabel={hideDone ? 'Show done tasks' : 'Hide done tasks'}
          >
            <Ionicons name={hideDone ? 'eye-off-outline' : 'eye-outline'} size={18} color={hideDone ? colors.accent : colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerIconBtn, { borderColor: colors.accent + '60', backgroundColor: colors.accent + '15' }]}
            onPress={() => { if (viewMode === 'list') closePane(); setViewMode(v => v === 'list' ? 'board' : 'list'); }}
            hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }}
            accessibilityLabel={viewMode === 'list' ? 'Board view' : 'List view'}
          >
            <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={() => { setNewTitle(''); setNewStatus(''); setNewPriority('medium'); setNewDueDate(''); setNewDescription(''); setNewChecklist([]); setNewChecklistInput(''); setShowCreateModal(true); }}
            hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }}
            accessibilityLabel="New task"
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* List view */}
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
        <SectionList
          style={styles.scroll}
          // Big screen: keep task rows to a readable width. Style only — no remount.
          contentContainerStyle={[styles.scrollContent, { gap: undefined, paddingBottom: insets.bottom + 24 }, isWide && readableFrame]}
          sections={tasks.length === 0 ? [] : groupedTasks.map(group => ({
            ...group,
            data: collapsedSections[group.key] ? [] : group.tasks,
          }))}
          keyExtractor={t => t.id}
          renderItem={({ item, section }) => <View style={styles.sectionRowGap}>{renderTaskRow(item, section.key === 'other')}</View>}
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
          renderSectionFooter={() => <View style={styles.sectionFooterGap} />}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="checkbox-outline" size={44} color={colors.muted} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.emptyTitle, { color: colors.text }]}>No tasks yet</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.emptySubtitle, { color: colors.secondary }]}>Tap + to add the first task</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        />
          }
        />
      ) : (
        /* Board view */
        <ScrollView
          horizontal
          style={styles.boardScroll}
          contentContainerStyle={[styles.boardContent, { paddingBottom: insets.bottom + 24 }]}
          showsHorizontalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {groupedTasks.map(group => (
            <View key={group.key} style={[styles.boardColumn, { width: columnWidth }]}>
              <View style={[styles.boardColumnHeader, { borderBottomColor: group.color }]}>
                <View style={[styles.sectionDot, { backgroundColor: group.color }]} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardColumnTitle, { color: colors.text }]}>{group.label}</Text>
                <View style={[styles.sectionCount, { backgroundColor: group.color + '20' }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.sectionCountText, { color: group.color }]}>{group.tasks.length}</Text>
                </View>
              </View>
              <FlatList
                data={group.tasks}
                keyExtractor={t => t.id}
                renderItem={({ item }) => renderBoardCard(item)}
                scrollEnabled={false}
                contentContainerStyle={{ gap: 8 }}
                ListEmptyComponent={
                  <View style={[styles.boardEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.boardEmptyText, { color: colors.muted }]}>No tasks</Text>
                  </View>
                }
              />
            </View>
          ))}
        </ScrollView>
      )}

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
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 2 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // List view
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { fontSize: 14 },

  section: { gap: 6 },
  sectionRowGap: { marginBottom: 6 },
  sectionFooterGap: { height: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '600' },
  sectionCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  sectionCountText: { fontSize: 12, fontWeight: '600' },

  taskRowSwipe: { borderRadius: 10, overflow: 'hidden' },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 52,
    gap: 10,
    paddingRight: 12,
  },
  priorityStrip: { width: 3, alignSelf: 'stretch' },
  checkArea: { padding: 8 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskContent: { flex: 1, paddingVertical: 10 },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  strikethrough: { textDecorationLine: 'line-through' },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  dueText: { fontSize: 12 },

  // Board view
  boardScroll: { flex: 1 },
  boardContent: { padding: 16, gap: 12, flexDirection: 'row', alignItems: 'flex-start' },
  boardColumn: { gap: 8 },
  boardColumnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 2,
    marginBottom: 4,
  },
  boardColumnTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  boardCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  boardCardPriorityStrip: { height: 3, width: '100%' },
  boardCardInner: { padding: 12, gap: 8 },
  boardCardTitle: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  boardCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  priorityBadgeText: { fontSize: 11, fontWeight: '600' },
  boardCardDate: { fontSize: 12 },
  boardCardDoneBtn: { alignSelf: 'flex-start' },
  boardEmptyCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  boardEmptyText: { fontSize: 13 },

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
  editActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
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
