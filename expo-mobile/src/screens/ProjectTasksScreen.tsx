import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

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

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

const STATUS_ORDER = ['todo', 'in_progress', 'in-progress', 'done', 'completed'];

const STATUS_LABELS: Record<string, string> = {
  'todo': 'To Do',
  'in_progress': 'In Progress',
  'in-progress': 'In Progress',
  'done': 'Done',
  'completed': 'Completed',
};

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];
const PRIORITY_LABELS: Record<string, string> = {
  'urgent': 'Urgent',
  'high': 'High',
  'medium': 'Medium',
  'low': 'Low',
};

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'urgent': return '#ef4444';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    case 'low': return '#22c55e';
    default: return '#94a3b8';
  }
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'todo': return '#94a3b8';
    case 'in_progress':
    case 'in-progress': return '#3b82f6';
    case 'done':
    case 'completed': return '#22c55e';
    default: return '#94a3b8';
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
  const { projectId, projectName } = route.params as { projectId: string; projectName: string };
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', inputBg: '#0f172a' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1', inputBg: '#f1f5f9' };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // View/edit modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNewPriorityPicker, setShowNewPriorityPicker] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await apiFetch<Task[]>(`/api/tasks?projectId=${projectId}`);
      setTasks((data || []).filter(t => t.type === 'task'));
    } catch (e) {
      console.error('Failed to fetch project tasks:', e);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  const groupedTasks = useMemo(() => {
    const groups: { key: string; label: string; color: string; tasks: Task[] }[] = [];
    const seen = new Set<string>();
    for (const statusKey of STATUS_ORDER) {
      if (seen.has(statusKey)) continue;
      // Normalise in_progress / in-progress
      const normalised = statusKey === 'in-progress' ? 'in_progress' : statusKey;
      if (seen.has(normalised)) continue;
      seen.add(normalised);
      const items = tasks.filter(t => {
        const s = t.status || 'todo';
        return s === normalised || s === (normalised === 'in_progress' ? 'in-progress' : normalised);
      });
      if (items.length === 0) continue;
      groups.push({
        key: normalised,
        label: STATUS_LABELS[normalised] || normalised,
        color: getStatusColor(normalised),
        tasks: items,
      });
    }
    // Catch any unknown statuses
    const handled = new Set(STATUS_ORDER.concat(['in_progress']));
    const others = tasks.filter(t => !handled.has(t.status || 'todo'));
    if (others.length > 0) {
      groups.push({ key: 'other', label: 'Other', color: '#94a3b8', tasks: others });
    }
    return groups;
  }, [tasks]);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleDone = async (task: Task) => {
    const isDone = task.status === 'done' || task.status === 'completed';
    const newStatus = isDone ? 'todo' : 'done';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      await apiRequest(`/api/tasks/${task.id}`, 'PATCH', { status: newStatus });
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      Alert.alert('Error', 'Failed to update task.');
    }
  };

  const openViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(false);
    setShowViewModal(true);
  };

  const openEditTask = () => {
    if (!selectedTask) return;
    setEditTitle(selectedTask.title || '');
    setEditStatus(selectedTask.status || 'todo');
    setEditPriority(selectedTask.priority || 'medium');
    setEditDueDate(selectedTask.dueDate ? selectedTask.dueDate.slice(0, 10) : '');
    setEditDescription(selectedTask.contentText || selectedTask.content || '');
    setIsEditing(true);
  };

  const handleSaveTask = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      const body: any = {
        title: editTitle.trim(),
        status: editStatus,
        priority: editPriority,
        content: editDescription,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
      };
      await apiRequest(`/api/tasks/${selectedTask.id}`, 'PATCH', body);
      setShowViewModal(false);
      setIsEditing(false);
      setSelectedTask(null);
      await fetchTasks();
    } catch {
      Alert.alert('Error', 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = () => {
    if (!selectedTask) return;
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await apiRequest(`/api/tasks/${selectedTask.id}`, 'DELETE');
            setShowViewModal(false);
            setSelectedTask(null);
            await fetchTasks();
          } catch {
            Alert.alert('Error', 'Failed to delete task.');
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
        status: 'todo',
        dueDate: newDueDate ? new Date(newDueDate).toISOString() : undefined,
        projectId,
        taskContextType: 'project',
        taskContextId: projectId,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewPriority('medium');
      setNewDueDate('');
      await fetchTasks();
    } catch {
      Alert.alert('Error', 'Failed to create task.');
    } finally {
      setCreating(false);
    }
  };

  const renderTaskRow = (task: Task) => {
    const isDone = task.status === 'done' || task.status === 'completed';
    const overdue = !isDone && isOverdue(task.dueDate);
    return (
      <TouchableOpacity
        key={task.id}
        style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => openViewTask(task)}
        activeOpacity={0.7}
      >
        <View style={[styles.priorityStrip, { backgroundColor: getPriorityColor(task.priority) }]} />
        <TouchableOpacity
          style={styles.checkArea}
          onPress={() => handleToggleDone(task)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={[
            styles.checkCircle,
            { borderColor: isDone ? '#22c55e' : colors.muted },
            isDone && { backgroundColor: '#22c55e' },
          ]}>
            {isDone && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
        </TouchableOpacity>
        <View style={styles.taskContent}>
          <Text
            style={[styles.taskTitle, { color: isDone ? colors.muted : colors.text }, isDone && styles.strikethrough]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
          <View style={styles.taskMeta}>
            <View style={[styles.priorityPill, { backgroundColor: getPriorityColor(task.priority) + '20' }]}>
              <Text style={[styles.priorityPillText, { color: getPriorityColor(task.priority) }]}>
                {PRIORITY_LABELS[task.priority || 'low'] || 'Low'}
              </Text>
            </View>
            {task.dueDate && (
              <Text style={[styles.dueText, { color: overdue ? '#ef4444' : colors.secondary }]}>
                {getRelativeDate(task.dueDate)}
              </Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.accent + '25', borderBottomColor: colors.accent + '40' }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Tasks</Text>
          <Text style={[styles.headerSubtitle, { color: colors.secondary }]} numberOfLines={1}>{projectName}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.accent }]}
          onPress={() => { setNewTitle(''); setNewPriority('medium'); setNewDueDate(''); setShowCreateModal(true); }}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {tasks.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkbox-outline" size={44} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No tasks yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>Tap + to add the first task</Text>
          </View>
        ) : (
          groupedTasks.map(group => (
            <View key={group.key} style={styles.section}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(group.key)} activeOpacity={0.7}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionDot, { backgroundColor: group.color }]} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{group.label}</Text>
                  <View style={[styles.sectionCount, { backgroundColor: group.color + '20' }]}>
                    <Text style={[styles.sectionCountText, { color: group.color }]}>{group.tasks.length}</Text>
                  </View>
                </View>
                <Ionicons
                  name={collapsedSections[group.key] ? 'chevron-forward' : 'chevron-down'}
                  size={18}
                  color={colors.secondary}
                />
              </TouchableOpacity>
              {!collapsedSections[group.key] && group.tasks.map(renderTaskRow)}
            </View>
          ))
        )}
      </ScrollView>

      {/* View / Edit Task Modal */}
      <Modal visible={showViewModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContainer}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => { setShowViewModal(false); setIsEditing(false); setSelectedTask(null); }}>
                  <Ionicons name="close" size={24} color={colors.secondary} />
                </TouchableOpacity>
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>
                  {isEditing ? 'Edit Task' : 'Task Details'}
                </Text>
                {!isEditing ? (
                  <TouchableOpacity onPress={openEditTask}>
                    <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 15 }}>Edit</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 40 }} />
                )}
              </View>

              <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
                {!isEditing && selectedTask && (
                  <>
                    <Text style={[styles.viewTitle, { color: colors.text }]}>{selectedTask.title}</Text>
                    <View style={styles.viewBadgeRow}>
                      <View style={[styles.viewBadge, { backgroundColor: getStatusColor(selectedTask.status) + '20' }]}>
                        <Text style={[styles.viewBadgeText, { color: getStatusColor(selectedTask.status) }]}>
                          {STATUS_LABELS[selectedTask.status || 'todo'] || selectedTask.status}
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
                    {(selectedTask.contentText || selectedTask.content) ? (
                      <View style={styles.viewSection}>
                        <Text style={[styles.viewSectionLabel, { color: colors.secondary }]}>Description</Text>
                        <Text style={[styles.viewDescription, { color: colors.text }]}>
                          {selectedTask.contentText || selectedTask.content}
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
                            <Text style={[styles.checklistText, { color: colors.text }, item.completed && { textDecorationLine: 'line-through', color: colors.muted }]}>
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
                    <TouchableOpacity
                      style={[styles.deleteBtn, { borderColor: '#ef444440' }]}
                      onPress={handleDeleteTask}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <ActivityIndicator size="small" color="#ef4444" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          <Text style={styles.deleteBtnText}>Delete Task</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {isEditing && (
                  <>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Title</Text>
                      <TextInput
                        style={[styles.editInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder="Task title"
                        placeholderTextColor={colors.muted}
                        autoFocus
                      />
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Status</Text>
                      <TouchableOpacity
                        style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                        onPress={() => setShowStatusPicker(true)}
                      >
                        <View style={[styles.selectDot, { backgroundColor: getStatusColor(editStatus) }]} />
                        <Text style={[styles.editSelectText, { color: colors.text }]}>{STATUS_LABELS[editStatus] || editStatus}</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.secondary} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Priority</Text>
                      <TouchableOpacity
                        style={[styles.editSelect, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                        onPress={() => setShowPriorityPicker(true)}
                      >
                        <View style={[styles.selectDot, { backgroundColor: getPriorityColor(editPriority) }]} />
                        <Text style={[styles.editSelectText, { color: colors.text }]}>{PRIORITY_LABELS[editPriority] || editPriority}</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.secondary} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Due Date (YYYY-MM-DD)</Text>
                      <TextInput
                        style={[styles.editInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                        value={editDueDate}
                        onChangeText={setEditDueDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.muted}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Description</Text>
                      <TextInput
                        style={[styles.editTextArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
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
                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.editSaveText}>Save</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Status picker */}
      <Modal visible={showStatusPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowStatusPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Status</Text>
            {['todo', 'in_progress', 'done'].map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.pickerOption, editStatus === s && { backgroundColor: colors.accent + '15' }]}
                onPress={() => { setEditStatus(s); setShowStatusPicker(false); }}
              >
                <View style={[styles.selectDot, { backgroundColor: getStatusColor(s) }]} />
                <Text style={[styles.pickerOptionText, { color: editStatus === s ? colors.accent : colors.text }]}>{STATUS_LABELS[s]}</Text>
                {editStatus === s && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Priority picker */}
      <Modal visible={showPriorityPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowPriorityPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Priority</Text>
            {PRIORITY_ORDER.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.pickerOption, editPriority === p && { backgroundColor: colors.accent + '15' }]}
                onPress={() => { setEditPriority(p); setShowPriorityPicker(false); }}
              >
                <View style={[styles.selectDot, { backgroundColor: getPriorityColor(p) }]} />
                <Text style={[styles.pickerOptionText, { color: editPriority === p ? colors.accent : colors.text }]}>{PRIORITY_LABELS[p]}</Text>
                {editPriority === p && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create Task Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContainer}>
            <View style={[styles.createSheet, { backgroundColor: colors.card }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                  <Ionicons name="close" size={24} color={colors.secondary} />
                </TouchableOpacity>
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>New Task</Text>
                <TouchableOpacity onPress={handleCreateTask} disabled={!newTitle.trim() || creating}>
                  {creating ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={{ color: newTitle.trim() ? colors.accent : colors.muted, fontWeight: '600', fontSize: 15 }}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.createBody}>
                <TextInput
                  style={[styles.createTitleInput, { color: colors.text, borderBottomColor: colors.border }]}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="Task title"
                  placeholderTextColor={colors.muted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateTask}
                />
                <View style={styles.createMeta}>
                  <TouchableOpacity
                    style={[styles.createMetaChip, { backgroundColor: getPriorityColor(newPriority) + '20', borderColor: getPriorityColor(newPriority) + '40' }]}
                    onPress={() => setShowNewPriorityPicker(true)}
                  >
                    <View style={[styles.selectDot, { backgroundColor: getPriorityColor(newPriority) }]} />
                    <Text style={[styles.createMetaChipText, { color: getPriorityColor(newPriority) }]}>{PRIORITY_LABELS[newPriority]}</Text>
                    <Ionicons name="chevron-down" size={14} color={getPriorityColor(newPriority)} />
                  </TouchableOpacity>
                  <View style={[styles.createMetaChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Ionicons name="calendar-outline" size={14} color={colors.secondary} />
                    <TextInput
                      style={[styles.dueDateInput, { color: colors.text }]}
                      value={newDueDate}
                      onChangeText={setNewDueDate}
                      placeholder="Due date (YYYY-MM-DD)"
                      placeholderTextColor={colors.muted}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* New task priority picker */}
      <Modal visible={showNewPriorityPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowNewPriorityPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Priority</Text>
            {PRIORITY_ORDER.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.pickerOption, newPriority === p && { backgroundColor: colors.accent + '15' }]}
                onPress={() => { setNewPriority(p); setShowNewPriorityPicker(false); }}
              >
                <View style={[styles.selectDot, { backgroundColor: getPriorityColor(p) }]} />
                <Text style={[styles.pickerOptionText, { color: newPriority === p ? colors.accent : colors.text }]}>{PRIORITY_LABELS[p]}</Text>
                {newPriority === p && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 2 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  priorityPillText: { fontSize: 11, fontWeight: '600' },
  dueText: { fontSize: 12 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: { justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  createSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
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
  viewTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  viewBadgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  viewBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  viewBadgeText: { fontSize: 13, fontWeight: '600' },
  viewField: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  viewFieldText: { fontSize: 14 },
  viewSection: { marginBottom: 16 },
  viewSectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  viewDescription: { fontSize: 14, lineHeight: 20 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  assigneeAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  assigneeAvatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  assigneeName: { fontSize: 14 },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  checklistText: { fontSize: 14 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 13, fontWeight: '500' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  deleteBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  editField: { marginBottom: 16 },
  editLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  editSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editSelectText: { flex: 1, fontSize: 15 },
  selectDot: { width: 10, height: 10, borderRadius: 5 },
  editTextArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 100,
  },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  editCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editCancelText: { fontSize: 15, fontWeight: '600' },
  editSaveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Pickers
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 32,
  },
  pickerSheet: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerOptionText: { flex: 1, fontSize: 15 },
  // Create modal
  createBody: { padding: 20 },
  createTitleInput: {
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 8,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  createMeta: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  createMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  createMetaChipText: { fontSize: 13, fontWeight: '600' },
  dueDateInput: { fontSize: 13, minWidth: 130 },
});
