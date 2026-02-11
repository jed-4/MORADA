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
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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
  assigneeIds?: string[];
  assigneeNames?: string[];
  checklist?: { id: string; text: string; completed: boolean }[];
  tags?: string[];
  companyId?: string;
}

interface Project {
  id: string;
  name: string;
}

type ViewMode = 'list' | 'board';
type GroupBy = 'status' | 'priority' | 'project' | 'dueDate';

type Props = {
  navigation: NativeStackNavigationProp<any>;
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
    case 'in-progress': return '#3b82f6';
    case 'done':
    case 'completed': return '#22c55e';
    default: return '#94a3b8';
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
    case 'Overdue': return '#ef4444';
    case 'Today': return '#3b82f6';
    case 'This Week': return '#f97316';
    case 'Later': return '#22c55e';
    default: return '#94a3b8';
  }
}

export default function TasksScreen({ navigation }: Props) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [showGroupByModal, setShowGroupByModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6', muted: '#475569' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb', muted: '#cbd5e1' };

  const fetchData = useCallback(async () => {
    try {
      const [tasksData, projectsData] = await Promise.all([
        apiFetch<Task[]>('/api/tasks').catch(() => []),
        apiFetch<Project[]>('/api/projects').catch(() => []),
      ]);

      const filtered = (tasksData || []).filter(t => {
        if (t.type !== 'task') return false;
        const ids = t.assigneeIds || [];
        const isAssigned = ids.includes(user?.id || '') || t.assigneeId === user?.id;
        const isOwner = t.ownerId === user?.id;
        return isAssigned || isOwner;
      });

      setTasks(filtered);
      setProjects(projectsData || []);
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const groupedTasks = useMemo(() => {
    const groups: { key: string; label: string; color: string; tasks: Task[] }[] = [];

    if (groupBy === 'status') {
      for (const status of STATUS_ORDER) {
        const items = tasks.filter(t => (t.status || 'todo') === status);
        groups.push({ key: status, label: STATUS_LABELS[status] || status, color: getStatusColor(status), tasks: items });
      }
    } else if (groupBy === 'priority') {
      for (const priority of PRIORITY_ORDER) {
        const items = tasks.filter(t => (t.priority || 'low') === priority);
        groups.push({ key: priority, label: PRIORITY_LABELS[priority] || priority, color: getPriorityColor(priority), tasks: items });
      }
    } else if (groupBy === 'project') {
      const projectMap: Record<string, Task[]> = {};
      const noProject: Task[] = [];
      for (const t of tasks) {
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
        const items = tasks.filter(t => getDueDateGroup(t.dueDate) === group);
        groups.push({ key: group, label: group, color: getDueDateColor(group), tasks: items });
      }
    }

    return groups.filter(g => g.tasks.length > 0);
  }, [tasks, groupBy, getProjectName, colors.accent, colors.muted]);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(false);
    setShowViewModal(true);
  };

  const handleEditTask = () => {
    if (!selectedTask) return;
    setEditTitle(selectedTask.title || '');
    setEditStatus(selectedTask.status || 'todo');
    setEditPriority(selectedTask.priority || 'low');
    setEditDueDate(selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().split('T')[0] : '');
    setEditDescription(selectedTask.contentText || selectedTask.content || '');
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
        content: editDescription,
      };
      if (editDueDate) {
        body.dueDate = new Date(editDueDate).toISOString();
      } else {
        body.dueDate = null;
      }
      await apiRequest(`/api/tasks/${selectedTask.id}`, 'PATCH', body);
      setIsEditing(false);
      setShowViewModal(false);
      setSelectedTask(null);
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to save task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDone = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      await apiRequest(`/api/tasks/${task.id}`, 'PATCH', { status: newStatus });
      await fetchData();
    } catch {
      Alert.alert('Error', 'Failed to update task status.');
    }
  };

  const groupByOptions: { key: GroupBy; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'status', label: 'Status', icon: 'list-outline' },
    { key: 'priority', label: 'Priority', icon: 'flag-outline' },
    { key: 'project', label: 'Project', icon: 'briefcase-outline' },
    { key: 'dueDate', label: 'Due Date', icon: 'calendar-outline' },
  ];

  const renderTaskRow = (task: Task) => (
    <TouchableOpacity
      key={task.id}
      style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => handleViewTask(task)}
      activeOpacity={0.7}
    >
      <View style={[styles.priorityStrip, { backgroundColor: getPriorityColor(task.priority) }]} />
      <TouchableOpacity
        style={styles.checkbox}
        onPress={() => handleToggleDone(task)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[
          styles.checkCircle,
          { borderColor: task.status === 'done' ? '#22c55e' : colors.muted },
          task.status === 'done' && { backgroundColor: '#22c55e' },
        ]}>
          {task.status === 'done' && (
            <Ionicons name="checkmark" size={12} color="#ffffff" />
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.taskContent}>
        <Text
          style={[
            styles.taskTitle,
            { color: colors.text },
            task.status === 'done' && { textDecorationLine: 'line-through', color: colors.muted },
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
          { color: getDueDateGroup(task.dueDate) === 'Overdue' ? '#ef4444' : colors.secondary },
        ]}>
          {getRelativeDate(task.dueDate)}
        </Text>
      )}
    </TouchableOpacity>
  );

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
            { color: getDueDateGroup(task.dueDate) === 'Overdue' ? '#ef4444' : colors.secondary },
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

  const screenWidth = Dimensions.get('window').width;
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
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Tasks</Text>
        <View style={styles.headerControls}>
          <View style={[styles.segmentedControl, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.segmentBtn, viewMode === 'list' && { backgroundColor: colors.accent }]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? '#ffffff' : colors.secondary} />
              <Text style={[styles.segmentText, { color: viewMode === 'list' ? '#ffffff' : colors.secondary }]}>List</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, viewMode === 'board' && { backgroundColor: colors.accent }]}
              onPress={() => setViewMode('board')}
            >
              <Ionicons name="grid-outline" size={16} color={viewMode === 'board' ? '#ffffff' : colors.secondary} />
              <Text style={[styles.segmentText, { color: viewMode === 'board' ? '#ffffff' : colors.secondary }]}>Board</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.groupByBtn, { borderColor: colors.border }]}
            onPress={() => setShowGroupByModal(true)}
          >
            <Ionicons name="funnel-outline" size={16} color={colors.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'list' ? (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {groupedTasks.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="checkbox-outline" size={40} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No tasks found</Text>
            </View>
          )}
          {groupedTasks.map(group => (
            <View key={group.key} style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(group.key)}
                activeOpacity={0.7}
              >
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
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          horizontal
          style={styles.boardScroll}
          contentContainerStyle={styles.boardContent}
          showsHorizontalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
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
              <ScrollView style={styles.boardColumnScroll} nestedScrollEnabled>
                {group.tasks.map(renderBoardCard)}
                {group.tasks.length === 0 && (
                  <View style={[styles.boardEmptyCol, { borderColor: colors.border }]}>
                    <Text style={[styles.boardEmptyText, { color: colors.muted }]}>No tasks</Text>
                  </View>
                )}
              </ScrollView>
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

      <Modal visible={showGroupByModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowGroupByModal(false)}
        >
          <View style={[styles.groupBySheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.groupByTitle, { color: colors.text }]}>Group by</Text>
            {groupByOptions.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.groupByOption, groupBy === opt.key && { backgroundColor: colors.accent + '15' }]}
                onPress={() => { setGroupBy(opt.key); setShowGroupByModal(false); }}
              >
                <Ionicons name={opt.icon} size={20} color={groupBy === opt.key ? colors.accent : colors.secondary} />
                <Text style={[styles.groupByOptionText, { color: groupBy === opt.key ? colors.accent : colors.text }]}>
                  {opt.label}
                </Text>
                {groupBy === opt.key && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showViewModal} animationType="slide" transparent>
        <View style={styles.taskModalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.taskModalContainer}
          >
            <View style={[styles.taskModalSheet, { backgroundColor: colors.card }]}>
              <View style={[styles.taskModalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => { setShowViewModal(false); setIsEditing(false); setSelectedTask(null); }}>
                  <Ionicons name="close" size={24} color={colors.secondary} />
                </TouchableOpacity>
                <Text style={[styles.taskModalHeaderTitle, { color: colors.text }]}>
                  {isEditing ? 'Edit Task' : 'Task Details'}
                </Text>
                {!isEditing ? (
                  <TouchableOpacity onPress={handleEditTask}>
                    <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 15 }}>Edit</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 40 }} />
                )}
              </View>

              <ScrollView style={styles.taskModalBody} contentContainerStyle={{ paddingBottom: 40 }}>
                {!isEditing && selectedTask && (
                  <>
                    <Text style={[styles.viewTitle, { color: colors.text }]}>{selectedTask.title}</Text>

                    <View style={styles.viewBadgeRow}>
                      <View style={[styles.viewBadge, { backgroundColor: getStatusColor(selectedTask.status) + '20' }]}>
                        <Text style={[styles.viewBadgeText, { color: getStatusColor(selectedTask.status) }]}>
                          {STATUS_LABELS[selectedTask.status || 'todo'] || 'To Do'}
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
                  </>
                )}

                {isEditing && (
                  <>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Title</Text>
                      <TextInput
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
                        onPress={() => setShowStatusPicker(true)}
                      >
                        <View style={[styles.selectDot, { backgroundColor: getStatusColor(editStatus) }]} />
                        <Text style={[styles.editSelectText, { color: colors.text }]}>
                          {STATUS_LABELS[editStatus] || editStatus}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={colors.secondary} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Priority</Text>
                      <TouchableOpacity
                        style={[styles.editSelect, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: colors.border }]}
                        onPress={() => setShowPriorityPicker(true)}
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
                      <TextInput
                        style={[styles.editInput, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: colors.text, borderColor: colors.border }]}
                        value={editDueDate}
                        onChangeText={setEditDueDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.muted}
                      />
                    </View>

                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.secondary }]}>Description</Text>
                      <TextInput
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
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showStatusPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowStatusPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerSheetTitle, { color: colors.text }]}>Status</Text>
            {STATUS_ORDER.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.pickerOption, editStatus === s && { backgroundColor: colors.accent + '15' }]}
                onPress={() => { setEditStatus(s); setShowStatusPicker(false); }}
              >
                <View style={[styles.selectDot, { backgroundColor: getStatusColor(s) }]} />
                <Text style={[styles.pickerOptionText, { color: editStatus === s ? colors.accent : colors.text }]}>
                  {STATUS_LABELS[s]}
                </Text>
                {editStatus === s && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showPriorityPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPriorityPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerSheetTitle, { color: colors.text }]}>Priority</Text>
            {PRIORITY_ORDER.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.pickerOption, editPriority === p && { backgroundColor: colors.accent + '15' }]}
                onPress={() => { setEditPriority(p); setShowPriorityPicker(false); }}
              >
                <View style={[styles.selectDot, { backgroundColor: getPriorityColor(p) }]} />
                <Text style={[styles.pickerOptionText, { color: editPriority === p ? colors.accent : colors.text }]}>
                  {PRIORITY_LABELS[p]}
                </Text>
                {editPriority === p && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
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
    width: 4,
    alignSelf: 'stretch',
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
  boardColumnScroll: {
    maxHeight: Dimensions.get('window').height - 240,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupBySheet: {
    width: '80%',
    borderRadius: 14,
    padding: 16,
  },
  groupByTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
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
  taskModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  taskModalContainer: {
    maxHeight: '92%',
  },
  taskModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: Dimensions.get('window').height * 0.9,
  },
  taskModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  taskModalHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  taskModalBody: {
    padding: 16,
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
  pickerSheet: {
    width: '80%',
    borderRadius: 14,
    padding: 16,
  },
  pickerSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
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
});
