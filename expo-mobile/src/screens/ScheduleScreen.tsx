import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Switch,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { fromLocalDateStr, toLocalDateStr } from '../lib/dates';
import { ScheduleActivityFeedButton } from '../components/ScheduleActivityFeedButton';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, useColors, currentTheme, typeColors as themeTypeColors, MAX_FONT_SCALE, metrics, size, space, tabular, type } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Ellipsis, FolderOpen } from 'lucide-react-native';
import {
  CalendarBlock, Card, Checkbox, EmptyState, FAB, FAB_CLEARANCE, GanttBar, ListRow, NowLine, PageHeader, StatusDot,
  TodayMarker, UnderlineTabs, type DotStatus,
} from '../components/kit';
import { SkeletonList } from '../components/ui/Skeleton';
import { useLayout } from '../lib/useLayout';
import { sheetFrame } from '../components/ui/Sheet';
import type { ScrollViewInstance } from 'react-native';
import type { JSX } from 'react';
import { goBackOrHome } from '../navigation/back';
interface ScheduleItem {
  id: string;
  scheduleId: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  priority: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  duration: number;
  assignedToName: string | null;
  assignedToColor: string | null;
  groupName: string | null;
  progressPercent: number;
  notes: string | null;
  color: string | null;
  sortOrder: number;
  parentItemId: string | null;
  dependencies: { id: string; type: string }[];
  checklistIds: string[];
  taskIds: string[];
  useWorkingDaysOverride: boolean | null;
}

interface ScheduleItemStep {
  id: string;
  scheduleItemId: string;
  name: string;
  isCompleted: boolean;
  sortOrder: number;
}

interface LinkedChecklist {
  id: string;
  name: string;
}

interface LinkedTask {
  id: string;
  title: string;
}

interface ActivityNote {
  id: string;
  scheduleItemId: string;
  userId: string | null;
  userName: string | null;
  type: string;
  content: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  jobNumber?: string | null;
  currentSystemPhase?: string | null;
  color?: string | null;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route?: { params?: { projectId?: string; projectName?: string; projectColor?: string | null } };
};

type ViewMode = 'list' | 'gantt' | 'calendar';

const PHASE_ORDER: Record<string, number> = {
  construction: 0,
  pre_construction: 1,
  lead: 2,
  post_construction: 3,
};

const PHASE_LABELS: Record<string, string> = {
  construction: 'Construction',
  pre_construction: 'Pre-construction',
  lead: 'Lead',
  post_construction: 'Post-construction',
};

function getSortedProjectItems(projects: Project[]): { id: string; label: string; isHeader?: boolean }[] {
  const visible = projects.filter(p => p.currentSystemPhase !== 'archive');
  visible.sort((a, b) => {
    const phaseA = PHASE_ORDER[a.currentSystemPhase || 'lead'] ?? 99;
    const phaseB = PHASE_ORDER[b.currentSystemPhase || 'lead'] ?? 99;
    if (phaseA !== phaseB) return phaseA - phaseB;
    const jnCompare = (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true });
    if (jnCompare !== 0) return jnCompare;
    return a.name.localeCompare(b.name);
  });
  const items: { id: string; label: string; isHeader?: boolean }[] = [];
  let currentPhase = '';
  for (const p of visible) {
    const phase = p.currentSystemPhase || 'lead';
    if (phase !== currentPhase) {
      currentPhase = phase;
      items.push({ id: `__header_${phase}`, label: PHASE_LABELS[phase] || phase, isHeader: true });
    }
    const prefix = p.jobNumber ? `${p.jobNumber} - ` : '';
    items.push({ id: p.id, label: `${prefix}${p.name}` });
  }
  return items;
}

const TYPE_COLORS: Record<string, string> = {
  task: themeTypeColors.task,
  milestone: themeTypeColors.milestone,
  inspection: themeTypeColors.inspection,
  delivery: themeTypeColors.delivery,
  meeting: themeTypeColors.meeting,
};

// A getter, not a constant: the inks differ in dark mode and a module
// constant would freeze the light ones.
function statusColorFor(status?: string | null): string | undefined {
  const t = currentTheme();
  switch (status) {
    case 'not_started': return t.textMuted;
    case 'in_progress': return t.statusInfo;
    case 'completed': return t.statusSuccess;
    case 'on_hold': return t.statusWarning;
    case 'cancelled': return t.statusDanger;
    default: return undefined;
  }
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

const TYPE_LABELS: Record<string, string> = {
  task: 'Task',
  milestone: 'Milestone',
  inspection: 'Inspection',
  delivery: 'Delivery',
  meeting: 'Meeting',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sd = s.getDate();
  const sm = MONTHS[s.getMonth()];
  const ed = e.getDate();
  const em = MONTHS[e.getMonth()];
  if (s.getFullYear() !== e.getFullYear()) {
    return `${sd} ${sm} ${s.getFullYear()} - ${ed} ${em} ${e.getFullYear()}`;
  }
  if (s.getMonth() === e.getMonth() && sd === ed) {
    return `${sd} ${sm}`;
  }
  if (s.getMonth() === e.getMonth()) {
    return `${sd} - ${ed} ${sm}`;
  }
  return `${sd} ${sm} - ${ed} ${em}`;
}

function formatNoteDate(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${displayH}:${d.getMinutes().toString().padStart(2, '0')} ${period}`;
}

function getItemColor(item: ScheduleItem): string {
  return item.color || item.assignedToColor || currentTheme().textMuted;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}


export default function ScheduleScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { width: screenWidth, isWide } = useLayout();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isProjectContext = !!route?.params?.projectId;

  // Always a back chevron, top-left, wherever Schedule was opened from
  // (project page, More menu, home, a notification). The native one only
  // appears when there's a screen underneath in the same stack (Jed, 11-21:
  // "Schedule screen doesn't have a back button").
  // Revamp v1: the screen draws its own one-row header (‹ Schedule ■ Project),
  // so the stack header is off wherever Schedule is opened from.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Gantt is the default (Jed, 11-21). The remembered choice moved to a new
  // key so everyone starts on Gantt once, then their own pick sticks.
  const [viewMode, setViewMode] = useState<ViewMode>('gantt');
  const [statusOptions, setStatusOptions] = useState<{ key: string; name: string; color: string }[]>([]);

  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);

  const [detailStatus, setDetailStatus] = useState('');
  const [detailProgress, setDetailProgress] = useState('');
  const [detailNotes, setDetailNotes] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activityNotes, setActivityNotes] = useState<ActivityNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const [weekStartDate, setWeekStartDate] = useState<Date>(getMondayOfWeek(new Date()));

  const [checklistSteps, setChecklistSteps] = useState<ScheduleItemStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [addingStep, setAddingStep] = useState(false);
  const [linkedChecklists, setLinkedChecklists] = useState<LinkedChecklist[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [detailWeekendOverride, setDetailWeekendOverride] = useState<boolean>(false);
  const [detailName, setDetailName] = useState('');
  const [detailStartDate, setDetailStartDate] = useState('');
  const [detailEndDate, setDetailEndDate] = useState('');
  const [detailType, setDetailType] = useState('task');
  const [detailPriority, setDetailPriority] = useState('medium');
  const [detailDescription, setDetailDescription] = useState('');
  const [showDetailTypePicker, setShowDetailTypePicker] = useState(false);
  const [showDetailPriorityPicker, setShowDetailPriorityPicker] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState('task');
  const [addStartDate, setAddStartDate] = useState(() => toLocalDateStr(new Date()));
  const [addEndDate, setAddEndDate] = useState(() => toLocalDateStr(new Date()));
  const [addPriority, setAddPriority] = useState('medium');
  const [addDescription, setAddDescription] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addStatus, setAddStatus] = useState('not_started');
  const [showAddTypePicker, setShowAddTypePicker] = useState(false);
  const [showAddPriorityPicker, setShowAddPriorityPicker] = useState(false);
  const [showAddStatusPicker, setShowAddStatusPicker] = useState(false);

  const ganttScrollRef = useRef<ScrollViewInstance>(null);
  // Vertical body of the Gantt — opens scrolled down to today's tasks.
  const ganttBodyRef = useRef<ScrollViewInstance>(null);
  const ganttScrolledRef = useRef(false);
  const ganttHeaderScrollRef = useRef<ScrollViewInstance>(null);
  const isSyncingRef = useRef(false);
  const [showNamesCol, setShowNamesCol] = useState(true);
  const [showBarStatus, setShowBarStatus] = useState(false);
  const [showGanttMenu, setShowGanttMenu] = useState(false);
  // List: done items from before this week fold into one line.
  const [showEarlierDone, setShowEarlierDone] = useState(false);
  // Gantt: month shown in the corner, and where the timeline is scrolled to.
  const [ganttMonth, setGanttMonth] = useState(MONTHS[new Date().getMonth()]);
  const ganttXRef = useRef(0);
  // Calendar: the week's days scroll sideways; the time grid fills the rest.
  const calScrollRef = useRef<ScrollViewInstance>(null);
  const [calBodyHeight, setCalBodyHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const k = useColors();

  const theme = useTheme();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    inputBg: theme.card,
};

  const fetchProjects = useCallback(async () => {
    try {
      const prj = await apiFetch<Project[]>('/api/projects').catch(() => []);
      setProjects(prj || []);
    } catch {
      setProjects([]);
    }
  }, []);

  const fetchItems = useCallback(async (projectId: string) => {
    try {
      const data = await apiFetch<ScheduleItem[]>(`/api/projects/${projectId}/schedule-items`).catch(() => []);
      setItems(data || []);
    } catch {
      setItems([]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [, statusData] = await Promise.all([
        fetchProjects(),
        apiFetch<{ options: { key: string; name: string; color: string | null }[] }>(
          '/api/field-categories/by-key/schedule_item.status'
        ).catch(() => null),
      ]);
      if (statusData?.options) {
        setStatusOptions(statusData.options.map(o => ({ key: o.key, name: o.name, color: o.color || theme.textMuted })));
      }
    } finally {
      setLoading(false);
    }
  }, [fetchProjects, theme.textMuted]);

  useEffect(() => {
    const incoming = route?.params?.projectId;
    if (incoming) {
      setSelectedProjectId(incoming);
      return;
    }
    AsyncStorage.multiGet([
      '@buildpro/schedule_view_mode_v2',
      '@buildpro/schedule_project_id',
      '@buildpro/gantt_show_names',
      '@buildpro/gantt_show_status',
    ]).then(pairs => {
      const [modeVal, projVal, namesVal, statusVal] = pairs.map(p => p[1]);
      if (modeVal) setViewMode(modeVal as ViewMode);
      if (projVal) setSelectedProjectId(projVal);
      if (namesVal !== null) setShowNamesCol(namesVal === 'true');
      if (statusVal !== null) setShowBarStatus(statusVal === 'true');
    });
  }, []);

  useEffect(() => {
    if (viewMode) AsyncStorage.setItem('@buildpro/schedule_view_mode_v2', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (selectedProjectId) AsyncStorage.setItem('@buildpro/schedule_project_id', selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (selectedProjectId) {
      setLoading(true);
      fetchItems(selectedProjectId).finally(() => setLoading(false));
      apiFetch<{ id: string }>(`/api/projects/${selectedProjectId}/schedule`)
        .then((s) => setScheduleId(s?.id ?? null))
        .catch(() => setScheduleId(null));
    } else {
      setItems([]);
      setScheduleId(null);
    }
  }, [selectedProjectId, fetchItems]);

  useEffect(() => {
    if (viewMode !== 'gantt' || items.length === 0) return;
    ganttScrolledRef.current = false;
  }, [viewMode, selectedProjectId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    if (selectedProjectId) {
      await fetchItems(selectedProjectId);
    }
    setRefreshing(false);
  }, [fetchProjects, fetchItems, selectedProjectId]);

  const fetchActivityNotes = useCallback(async (itemId: string) => {
    setLoadingNotes(true);
    try {
      const res = await apiFetch<{ notes: ActivityNote[]; totalCount: number; hasMore: boolean }>(
        `/api/schedule-items/${itemId}/activity-notes`
      );
      setActivityNotes(res?.notes || []);
    } catch {
      setActivityNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  const fetchSteps = useCallback(async (itemId: string) => {
    setLoadingSteps(true);
    try {
      const res = await apiFetch<ScheduleItemStep[]>(`/api/schedule-items/${itemId}/steps`);
      setChecklistSteps(res || []);
    } catch {
      setChecklistSteps([]);
    } finally {
      setLoadingSteps(false);
    }
  }, []);

  const fetchLinkedItems = useCallback(async (item: ScheduleItem) => {
    const cIds = item.checklistIds || [];
    const tIds = item.taskIds || [];
    if (cIds.length > 0) {
      try {
        const allChecklists = await apiFetch<any[]>('/api/checklist-templates').catch(() => []);
        setLinkedChecklists((allChecklists || []).filter((c: any) => cIds.includes(String(c.id))).map((c: any) => ({ id: String(c.id), name: c.name || 'Untitled' })));
      } catch { setLinkedChecklists([]); }
    } else {
      setLinkedChecklists([]);
    }
    if (tIds.length > 0 && selectedProjectId) {
      try {
        const allTasks = await apiFetch<any[]>(`/api/tasks?projectId=${selectedProjectId}`).catch(() => []);
        setLinkedTasks((allTasks || []).filter((t: any) => tIds.includes(String(t.id))).map((t: any) => ({ id: String(t.id), title: t.title || 'Untitled' })));
      } catch { setLinkedTasks([]); }
    } else {
      setLinkedTasks([]);
    }
  }, [selectedProjectId]);

  const openDetail = useCallback((item: ScheduleItem) => {
    setSelectedItem(item);
    setDetailStatus(item.status);
    setDetailProgress(String(item.progressPercent || 0));
    setDetailNotes(item.notes || '');
    setDetailName(item.name || '');
    setDetailStartDate(item.startDate ? item.startDate.split('T')[0] : '');
    setDetailEndDate(item.endDate ? item.endDate.split('T')[0] : '');
    setDetailType(item.type || 'task');
    setDetailPriority(item.priority || 'medium');
    setDetailDescription(item.description || '');
    setShowDetailTypePicker(false);
    setShowDetailPriorityPicker(false);
    setActivityNotes([]);
    setNewNoteText('');
    setShowStatusPicker(false);
    setChecklistSteps([]);
    setNewStepName('');
    setLinkedChecklists([]);
    setLinkedTasks([]);
    setDetailWeekendOverride(item.useWorkingDaysOverride === true);
    setShowDetailSheet(true);
    fetchActivityNotes(item.id);
    fetchSteps(item.id);
    fetchLinkedItems(item);
  }, [fetchActivityNotes, fetchSteps, fetchLinkedItems]);

  const handleSave = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const body: any = {
        name: detailName.trim() || undefined,
        status: detailStatus,
        progressPercent: parseInt(detailProgress) || 0,
        notes: detailNotes,
        useWorkingDaysOverride: detailWeekendOverride,
        startDate: detailStartDate || undefined,
        endDate: detailEndDate || undefined,
        type: detailType || undefined,
        priority: detailPriority || undefined,
        description: detailDescription || null,
      };
      await apiRequest(`/api/schedule-items/${selectedItem.id}`, 'PATCH', body);
      if (selectedProjectId) {
        await fetchItems(selectedProjectId);
      }
      setShowDetailSheet(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedItem || !newNoteText.trim()) return;
    setAddingNote(true);
    try {
      await apiRequest(`/api/schedule-items/${selectedItem.id}/activity-notes`, 'POST', {
        content: newNoteText.trim(),
        type: 'user',
      });
      setNewNoteText('');
      await fetchActivityNotes(selectedItem.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleToggleStep = async (step: ScheduleItemStep) => {
    try {
      await apiRequest(`/api/schedule-item-steps/${step.id}`, 'PATCH', { isCompleted: !step.isCompleted });
      if (selectedItem) await fetchSteps(selectedItem.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update step.');
    }
  };

  const handleAddStep = async () => {
    if (!selectedItem || !newStepName.trim()) return;
    setAddingStep(true);
    try {
      await apiRequest(`/api/schedule-items/${selectedItem.id}/steps`, 'POST', { name: newStepName.trim() });
      setNewStepName('');
      await fetchSteps(selectedItem.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not add step.');
    } finally {
      setAddingStep(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      await apiRequest(`/api/schedule-item-steps/${stepId}`, 'DELETE');
      if (selectedItem) await fetchSteps(selectedItem.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not delete step.');
    }
  };

  const PRIORITY_LABELS: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  };

  const PRIORITY_COLORS: Record<string, string> = {
    low: theme.textMuted,
    medium: theme.statusInfo,
    high: theme.statusWarning,
    urgent: theme.statusDanger,
  };

  const resetAddForm = () => {
    setAddName('');
    setAddType('task');
    setAddStartDate(toLocalDateStr(new Date()));
    setAddEndDate(toLocalDateStr(new Date()));
    setAddPriority('medium');
    setAddDescription('');
    setAddNotes('');
    setAddStatus('not_started');
    setShowAddTypePicker(false);
    setShowAddPriorityPicker(false);
    setShowAddStatusPicker(false);
  };

  const handleAddItem = async () => {
    if (!addName.trim()) {
      Alert.alert('Missing Name', 'Please enter a name for the schedule item.');
      return;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(addStartDate) || !dateRegex.test(addEndDate)) {
      Alert.alert('Invalid Date', 'Please enter dates in YYYY-MM-DD format.');
      return;
    }
    const startD = new Date(addStartDate);
    const endD = new Date(addEndDate);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
      Alert.alert('Invalid Date', 'Please enter valid dates.');
      return;
    }
    if (endD < startD) {
      Alert.alert('Invalid Dates', 'End date must be on or after the start date.');
      return;
    }
    if (!selectedProjectId) return;
    setAddSaving(true);
    try {
      const schedule = await apiFetch<{ id: string; includeSaturday?: boolean; includeSunday?: boolean }>(`/api/projects/${selectedProjectId}/schedule`);
      if (!schedule?.id) {
        Alert.alert('Error', 'Could not find schedule for this project.');
        return;
      }
      // Duration in WORKING days, respecting the schedule's weekend flags.
      const inclSat = schedule.includeSaturday === true;
      const inclSun = schedule.includeSunday === true;
      const cursor = fromLocalDateStr(addStartDate);
      const endLocal = fromLocalDateStr(addEndDate);
      let workingDays = 0;
      while (cursor <= endLocal) {
        const dow = cursor.getDay();
        if (!((dow === 6 && !inclSat) || (dow === 0 && !inclSun))) workingDays++;
        cursor.setDate(cursor.getDate() + 1);
      }
      const duration = Math.max(1, workingDays);

      await apiRequest('/api/schedule-items', 'POST', {
        scheduleId: schedule.id,
        name: addName.trim(),
        description: addDescription.trim() || null,
        type: addType,
        startDate: addStartDate,
        endDate: addEndDate,
        priority: addPriority || undefined,
        notes: addNotes.trim() || null,
        status: addStatus,
        duration,
      });
      await fetchItems(selectedProjectId);
      setShowAddModal(false);
      resetAddForm();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create schedule item. Please try again.');
    } finally {
      setAddSaving(false);
    }
  };

  const getSelectedProjectLabel = () => {
    if (!selectedProjectId) return 'Select Project';
    const p = projects.find(p => p.id === selectedProjectId);
    if (!p) return 'Select Project';
    return p.jobNumber ? `${p.jobNumber} - ${p.name}` : p.name;
  };


  const getItemsForDate = useCallback((date: Date): ScheduleItem[] => {
    return items.filter(item => {
      const start = new Date(item.startDate);
      const end = new Date(item.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  }, [items]);


  const parseLocalMidnight = (d: string | null | undefined): Date => {
    if (!d) return new Date();
    const s = typeof d === 'string' ? d : (d as any).toISOString?.() ?? String(d);
    return new Date(s.substring(0, 10) + 'T00:00:00');
  };

  const ganttData = useCallback(() => {
    const plm = (d: string | null | undefined) => {
      if (!d) return new Date();
      const s = typeof d === 'string' ? d : (d as any).toISOString?.() ?? String(d);
      return new Date(s.substring(0, 10) + 'T00:00:00');
    };

    if (items.length === 0) return { minDate: new Date(), maxDate: new Date(), days: 0, sortedItems: [] };

    let minDate = plm(items[0].startDate);
    let maxDate = plm(items[0].endDate);
    items.forEach(item => {
      const s = plm(item.startDate);
      const e = plm(item.endDate);
      if (s < minDate) minDate = s;
      if (e > maxDate) maxDate = e;
    });

    minDate.setMonth(minDate.getMonth() - 2);
    maxDate.setMonth(maxDate.getMonth() + 2);
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(0, 0, 0, 0);

    const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const sortedItems = [...items].sort((a, b) => {
      const sa = plm(a.startDate).getTime();
      const sb = plm(b.startDate).getTime();
      if (sa !== sb) return sa - sb;
      return a.sortOrder - b.sortOrder;
    });

    return { minDate, maxDate, days, sortedItems };
  }, [items]);

  const getWeekDays = useCallback((): Date[] => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStartDate]);

  const getStatusOption = (key: string) => {
    const opt = statusOptions.find(s => s.key === key);
    return opt || { name: STATUS_LABELS[key] || key, color: statusColorFor(key) || theme.textMuted };
  };

  // Server-defined statuses drive the pickers (same source as the cards);
  // the hardcoded five are only a fallback while options haven't loaded.
  const pickerStatusOptions = statusOptions.length > 0
    ? statusOptions
    : Object.entries(STATUS_LABELS).map(([key, label]) => ({ key, name: label, color: statusColorFor(key) || theme.textMuted }));

  // ── Status → dot ──────────────────────────────────────────────────────────
  const dotFor = (status?: string | null): DotStatus => {
    switch (status) {
      case 'completed': return 'done';
      case 'in_progress': return 'inProgress';
      case 'on_hold': return 'pending';
      case 'cancelled': return 'rejected';
      default: return 'upcoming';
    }
  };

  const itemMeta = (item: ScheduleItem) =>
    [formatDateRange(item.startDate, item.endDate), item.assignedToName].filter(Boolean).join(' · ');

  const sc = metrics.schedule;

  // ── List: one card per start day; older done items folded away ─────────────
  const renderListView = () => {
    const sorted = [...items].sort((a, b) =>
      parseLocalMidnight(a.startDate).getTime() - parseLocalMidnight(b.startDate).getTime()
    );
    if (sorted.length === 0) {
      return (
        <View style={styles.flex1}>
          <EmptyState icon={CalendarIcon} title="Nothing scheduled yet" helper="Tap + to add the first schedule item." />
        </View>
      );
    }

    const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
    // "Earlier": done items that finished before this week started.
    const weekStartMs = getMondayOfWeek(new Date()).getTime();
    const isEarlierDone = (it: ScheduleItem) =>
      it.status === 'completed' && parseLocalMidnight(it.endDate).getTime() < weekStartMs;
    const earlierCount = sorted.filter(isEarlierDone).length;
    const visible = showEarlierDone ? sorted : sorted.filter(it => !isEarlierDone(it));

    const days: { key: string; date: Date; items: ScheduleItem[] }[] = [];
    visible.forEach(item => {
      const d = parseLocalMidnight(item.startDate);
      const key = toLocalDateStr(d);
      const last = days[days.length - 1];
      if (last && last.key === key) last.items.push(item);
      else days.push({ key, date: d, items: [item] });
    });
    const todayIdx = days.findIndex(d => d.date.getTime() >= todayMs);
    const now = new Date();
    const todayLabel = `Today · ${DAY_NAMES[now.getDay()]} ${now.getDate()}`;

    return (
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[ss.list, { paddingBottom: FAB_CLEARANCE + space.screenBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
      >
        {earlierCount > 0 ? (
          <Pressable
            onPress={() => setShowEarlierDone(v => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showEarlierDone }}
            style={ss.earlier}
          >
            <Text style={[type.meta, tabular, { color: k.muted }]}>
              {showEarlierDone ? 'Hide earlier done items' : `${earlierCount} earlier ${earlierCount === 1 ? 'item' : 'items'} done`}
            </Text>
            {showEarlierDone
              ? <ChevronDown size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />
              : <ChevronRight size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />}
          </Pressable>
        ) : null}
        {days.map((day, i) => (
          <View key={day.key} style={ss.dayGroup}>
            {i === todayIdx ? <View style={ss.todayMarker}><TodayMarker label={todayLabel} /></View> : null}
            <Text style={[type.meta, { color: k.muted, marginBottom: sc.dayLabelGap }]}>
              {`${DAY_NAMES[day.date.getDay()]} ${day.date.getDate()} ${MONTHS[day.date.getMonth()]}`}
            </Text>
            <Card variant="list">
              {day.items.map(item => {
                const status = getStatusOption(item.status);
                const done = item.status === 'completed';
                return (
                  <ListRow
                    key={item.id}
                    onPress={() => openDetail(item)}
                    title={item.name}
                    done={done}
                    subtitle={itemMeta(item)}
                    trailing={<StatusDot status={dotFor(item.status)} label={status.name} />}
                  />
                );
              })}
            </Card>
          </View>
        ))}
        {todayIdx < 0 ? <View style={ss.todayMarker}><TodayMarker label={todayLabel} /></View> : null}
      </ScrollView>
    );
  };

  // ── Gantt ──────────────────────────────────────────────────────────────────
  const g = sc.gantt;
  const nameColWidth = showNamesCol ? (isWide ? g.nameColWide : g.nameCol) : 0;
  const visibleDays = isWide ? g.visibleDaysWide : g.visibleDays;
  // Day columns size so a week (two on a big screen) fills the width.
  const dayW = Math.max(
    (screenWidth - 2 * space.screenX - nameColWidth) / visibleDays,
    metrics.minHit * 0.6,
  );

  const syncGanttHeader = (x: number) => {
    ganttXRef.current = x;
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    ganttHeaderScrollRef.current?.scrollTo({ x, animated: false });
    setTimeout(() => { isSyncingRef.current = false; }, 30);
  };

  const scrollGanttTo = (x: number, animated = true) => {
    const nx = Math.max(0, x);
    ganttXRef.current = nx;
    ganttScrollRef.current?.scrollTo({ x: nx, animated });
    ganttHeaderScrollRef.current?.scrollTo({ x: nx, animated });
    updateGanttMonth(nx);
  };

  const updateGanttMonth = (x: number) => {
    const { minDate } = ganttData();
    const d = new Date(minDate);
    d.setDate(d.getDate() + Math.round(x / dayW));
    const label = MONTHS[d.getMonth()];
    setGanttMonth(prev => (prev === label ? prev : label));
  };

  const ganttTodayX = () => {
    const { minDate } = ganttData();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Week containing today, starting Monday.
    const monday = getMondayOfWeek(today);
    return Math.round((monday.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) * dayW;
  };

  const renderGanttView = () => {
    const { minDate, days, sortedItems } = ganttData();

    if (sortedItems.length === 0) {
      return (
        <View style={styles.flex1}>
          <EmptyState icon={CalendarIcon} title="Nothing scheduled yet" helper="Tap + to add the first schedule item." />
        </View>
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const todayDayIndex = Math.floor((today.getTime() - minDate.getTime()) / MS_PER_DAY);
    const todayX = todayDayIndex * dayW + dayW / 2 - g.todayLine / 2;

    const dateHeaders: { date: Date; isWeekend: boolean }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(minDate);
      d.setDate(d.getDate() + i);
      const dow = d.getDay();
      dateHeaders.push({ date: d, isWeekend: dow === 0 || dow === 6 });
    }

    const totalWidth = days * dayW;
    const barAreaHeight = sortedItems.length * g.rowHeight;

    const headerDateRow = (
      <View style={{ width: totalWidth, height: g.headerHeight, flexDirection: 'row' }}>
        {dateHeaders.map((dh, i) => {
          const isTodayCol = isToday(dh.date);
          return (
            <View key={i} style={[ss.ganttDateCell, { width: dayW }, dh.isWeekend && { backgroundColor: k.greyFill }]}>
              <Text style={[type.tiny, { color: isTodayCol ? k.accent : k.muted }]}>
                {DAY_NAMES[dh.date.getDay()].charAt(0)}
              </Text>
              <View style={[ss.ganttDateNum, isTodayCol && { backgroundColor: k.accent }]}>
                <Text style={[type.caption, tabular, { color: isTodayCol ? k.onAccent : k.text }]}>{dh.date.getDate()}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );

    return (
      <View style={styles.flex1}>
        {/* Date header: month in the corner, weekday + date per column */}
        <View style={[ss.ganttHeader, { borderBottomColor: k.border }]}>
          {showNamesCol && (
            <View style={[ss.ganttCorner, { width: nameColWidth }]}>
              <Text style={[type.meta, { color: k.text }]}>{ganttMonth}</Text>
            </View>
          )}
          <ScrollView
            horizontal
            ref={ganttHeaderScrollRef}
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={styles.flex1}
          >
            {headerDateRow}
          </ScrollView>
        </View>

        {/* Body */}
        <ScrollView
          ref={ganttBodyRef}
          style={styles.flex1}
          contentContainerStyle={{ paddingBottom: FAB_CLEARANCE + space.screenBottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
        >
          <View style={ss.ganttContainer}>
            {showNamesCol && (
              <View style={{ width: nameColWidth }}>
                {sortedItems.map(item => (
                  <Pressable
                    key={item.id}
                    style={[ss.ganttNameRow, { borderBottomColor: k.hairline }]}
                    onPress={() => openDetail(item)}
                    accessibilityRole="button"
                  >
                    <Text style={[type.ganttName, { color: k.text }]} numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              ref={ganttScrollRef}
              scrollEventThrottle={16}
              onScroll={(e) => {
                syncGanttHeader(e.nativeEvent.contentOffset.x);
                if (showGanttMenu) setShowGanttMenu(false);
              }}
              onMomentumScrollEnd={(e) => updateGanttMonth(e.nativeEvent.contentOffset.x)}
              onScrollEndDrag={(e) => updateGanttMonth(e.nativeEvent.contentOffset.x)}
              onLayout={() => {
                if (ganttScrolledRef.current) return;
                ganttScrolledRef.current = true;
                // Open on this week (Monday first), scrolled down to today's work:
                // the first row running today, else the next to start, else the last.
                scrollGanttTo(ganttTodayX(), false);
                const todayMs = today.getTime();
                let row = sortedItems.findIndex(it => {
                  const s0 = parseLocalMidnight(it.startDate).getTime();
                  const e0 = parseLocalMidnight(it.endDate).getTime();
                  return s0 <= todayMs && todayMs <= e0;
                });
                if (row < 0) row = sortedItems.findIndex(it => parseLocalMidnight(it.startDate).getTime() >= todayMs);
                if (row < 0) row = sortedItems.length - 1;
                const scrollY = Math.max(0, (row - 2) * g.rowHeight);
                ganttBodyRef.current?.scrollTo({ y: scrollY, animated: false });
              }}
            >
              <View style={{ width: totalWidth, height: barAreaHeight, position: 'relative' }}>
                {/* Weekend columns */}
                {dateHeaders.map((dh, ci) =>
                  dh.isWeekend ? (
                    <View key={`wk-${ci}`} style={{ position: 'absolute', left: ci * dayW, top: 0, width: dayW, height: barAreaHeight, backgroundColor: k.greyFill }} />
                  ) : null
                )}

                {/* Day gridlines */}
                {dateHeaders.map((_, ci) => (
                  <View key={`gl-${ci}`} style={[ss.ganttGridLine, { left: ci * dayW, height: barAreaHeight, backgroundColor: k.hairline }]} />
                ))}

                {/* Bar rows */}
                {sortedItems.map((item, idx) => {
                  const itemStart = parseLocalMidnight(item.startDate);
                  const itemEnd = parseLocalMidnight(item.endDate);
                  const startDay = Math.max(0, Math.floor((itemStart.getTime() - minDate.getTime()) / MS_PER_DAY));
                  const durationDays = Math.max(1, Math.round((itemEnd.getTime() - itemStart.getTime()) / MS_PER_DAY) + 1);
                  const barLeft = startDay * dayW + g.barInset;
                  const barWidth = Math.max(durationDays * dayW - 2 * g.barInset, dayW - 2 * g.barInset);
                  const status = getStatusOption(item.status);
                  const range = (() => {
                    const sd = itemStart.getDate();
                    const ed = itemEnd.getDate();
                    return durationDays > 1 ? `${sd} – ${ed}` : `${sd}`;
                  })();
                  return (
                    <View
                      key={item.id}
                      style={[ss.ganttBarRow, { top: idx * g.rowHeight, height: g.rowHeight, borderBottomColor: k.hairline }]}
                    >
                      {showBarStatus && barLeft > dayW ? (
                        <View style={[ss.ganttStatus, { right: totalWidth - barLeft + space.inline }]}>
                          <StatusDot status={dotFor(item.status)} label={status.name} small />
                        </View>
                      ) : null}
                      <Pressable
                        style={{ position: 'absolute', left: barLeft }}
                        onPress={() => openDetail(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name}, ${formatDateRange(item.startDate, item.endDate)}`}
                      >
                        <GanttBar color={item.color || item.assignedToColor} width={barWidth} label={range} />
                      </Pressable>
                    </View>
                  );
                })}

                {/* Dependency lines */}
                {sortedItems.map((item, idx) => {
                  const deps = item.dependencies || [];
                  if (deps.length === 0) return null;
                  const itemStart = parseLocalMidnight(item.startDate);
                  const depStartDay = Math.max(0, Math.floor((itemStart.getTime() - minDate.getTime()) / MS_PER_DAY));
                  const depBarLeft = depStartDay * dayW + g.barInset;
                  const depRowTop = idx * g.rowHeight + g.rowHeight / 2;

                  return deps.map(dep => {
                    const predIdx = sortedItems.findIndex(si => String(si.id) === String(dep.id));
                    if (predIdx < 0) return null;
                    const pred = sortedItems[predIdx];
                    const predEnd = parseLocalMidnight(pred.endDate);
                    const predEndDay = Math.max(1, Math.round((predEnd.getTime() - minDate.getTime()) / MS_PER_DAY) + 1);
                    const predBarRight = predEndDay * dayW - g.barInset;
                    const predRowMid = predIdx * g.rowHeight + g.rowHeight / 2;
                    const lineColor = k.accentLine;
                    const cornerX = Math.min(predBarRight + 8, depBarLeft);
                    const hLineWidth = Math.abs(cornerX - predBarRight);
                    const vTop = Math.min(predRowMid, depRowTop);
                    const vHeight = Math.abs(depRowTop - predRowMid);
                    const hLineToDepWidth = Math.abs(depBarLeft - cornerX);

                    return (
                      <View key={`dep-${item.id}-${dep.id}`} pointerEvents="none">
                        <View style={[styles.depLineH, { left: predBarRight, top: predRowMid - 1, width: hLineWidth, backgroundColor: lineColor }]} />
                        {vHeight > 0 && <View style={[styles.depLineV, { left: cornerX - 1, top: vTop, height: vHeight, backgroundColor: lineColor }]} />}
                        {hLineToDepWidth > 0 && <View style={[styles.depLineH, { left: cornerX, top: depRowTop - 1, width: hLineToDepWidth, backgroundColor: lineColor }]} />}
                        <View style={[styles.depArrow, { left: depBarLeft - g.depArrow, top: depRowTop - 3, borderLeftColor: lineColor }]} />
                      </View>
                    );
                  });
                })}

                {/* Today line */}
                {todayDayIndex >= 0 && todayDayIndex < days && (
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: todayX, top: 0, width: g.todayLine, height: barAreaHeight, backgroundColor: k.ganttToday }}
                  />
                )}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  };

  // ── Calendar: week time grid, days scroll sideways ────────────────────────
  const cal = sc.calendar;
  const timeOf = (t?: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return Number.isFinite(h) ? h + (Number.isFinite(m) ? m / 60 : 0) : null;
  };
  const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
  const shortTime = (t?: string | null) => {
    const v = timeOf(t);
    if (v == null) return '';
    const h = Math.floor(v);
    const m = Math.round((v - h) * 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')}`;
  };

  const renderCalendarView = () => {
    const weekDays = getWeekDays();
    const timed = items.filter(it => timeOf(it.startTime) != null);
    let startHour: number = cal.startHour;
    let endHour: number = cal.endHour;
    timed.forEach(it => {
      const s0 = timeOf(it.startTime) ?? cal.startHour;
      const e0 = timeOf(it.endTime) ?? s0 + 1;
      startHour = Math.min(startHour, Math.floor(s0));
      endHour = Math.max(endHour, Math.ceil(e0));
    });
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
    const gridHeight = (endHour - startHour) * cal.hourHeight;
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    const nowY = (nowH - startHour) * cal.hourHeight;
    const showNow = nowH >= startHour && nowH <= endHour;
    const nowLabel = shortTime(`${now.getHours()}:${now.getMinutes()}`);
    const allDayRows = weekDays.map(day => getItemsForDate(day).filter(it => timeOf(it.startTime) == null));
    const hasAllDay = allDayRows.some(r => r.length > 0);

    return (
      <View style={styles.flex1}>
        <ScrollView
          horizontal
          ref={calScrollRef}
          showsHorizontalScrollIndicator={false}
          onLayout={() => {
            // Show today (or the week's start) in view.
            const idx = weekDays.findIndex(d => isToday(d));
            calScrollRef.current?.scrollTo({ x: Math.max(0, (idx - 2) * cal.dayWidth), animated: false });
          }}
        >
          {/* A fixed-height column: header on top, the time grid scrolls below it. */}
          <View style={calBodyHeight ? { height: calBodyHeight } : styles.flex1}>
            {/* Day header */}
            <View style={[ss.calHeader, { borderBottomColor: k.border }]}>
              <View style={[ss.calGutter, { justifyContent: 'flex-end' }]}>
                <Text style={[type.meta, { color: k.text }]}>{MONTHS[weekDays[0].getMonth()]}</Text>
              </View>
              {weekDays.map((day, i) => {
                const isTodayCol = isToday(day);
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <View key={i} style={[ss.calDayHead, { width: cal.dayWidth }, weekend && { backgroundColor: k.greyFill }]}>
                    <Text style={[type.tiny, { color: isTodayCol ? k.accent : k.muted }]}>{DAY_NAMES[day.getDay()].toUpperCase()}</Text>
                    <View style={[ss.calDateCircle, isTodayCol && { backgroundColor: k.accent }]}>
                      <Text style={[type.body, tabular, { color: isTodayCol ? k.onAccent : k.text }]}>{day.getDate()}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* All-day items (schedule items without a time) */}
            {hasAllDay ? (
              <View style={[ss.calAllDay, { borderBottomColor: k.border }]}>
                <View style={ss.calGutter} />
                {allDayRows.map((row, i) => (
                  <View key={i} style={[ss.calAllDayCol, { width: cal.dayWidth }]}>
                    {row.map(it => (
                      <Pressable key={it.id} onPress={() => openDetail(it)} accessibilityRole="button" accessibilityLabel={it.name}>
                        <CalendarBlock variant="allDay" title={it.name} color={getItemColor(it)} />
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}

            {/* Time grid */}
            <ScrollView
              style={styles.flex1}
              contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
            >
              <View style={{ flexDirection: 'row', height: gridHeight + cal.hourHeight / 2 }}>
                <View style={ss.calGutter}>
                  {hours.map(h => (
                    <Text key={h} style={[type.micro, ss.calHour, { top: (h - startHour) * cal.hourHeight, color: k.muted }]}>{hourLabel(h)}</Text>
                  ))}
                  {showNow ? (
                    <Text style={[type.micro, ss.calHour, { top: nowY, color: k.accent, backgroundColor: k.bg }]}>{nowLabel}</Text>
                  ) : null}
                </View>
                {weekDays.map((day, i) => {
                  const weekend = day.getDay() === 0 || day.getDay() === 6;
                  const dayTimed = getItemsForDate(day).filter(it => timeOf(it.startTime) != null);
                  const isTodayCol = isToday(day);
                  return (
                    <View key={i} style={[ss.calDayCol, { width: cal.dayWidth, borderLeftColor: k.hairline }, weekend && { backgroundColor: k.greyFill }]}>
                      {hours.map(h => (
                        <View key={h} style={[ss.calHourLine, { top: (h - startHour) * cal.hourHeight, backgroundColor: k.hairline }]} />
                      ))}
                      {dayTimed.map(it => {
                        const s0 = timeOf(it.startTime) ?? startHour;
                        const e0 = Math.max(timeOf(it.endTime) ?? s0 + 1, s0 + 0.5);
                        const top = (s0 - startHour) * cal.hourHeight;
                        const height = (e0 - s0) * cal.hourHeight - cal.blockInset;
                        return (
                          <Pressable
                            key={it.id}
                            onPress={() => openDetail(it)}
                            accessibilityRole="button"
                            accessibilityLabel={it.name}
                            style={{ position: 'absolute', top, left: cal.blockInset, right: cal.blockInset }}
                          >
                            <CalendarBlock
                              title={it.name}
                              time={`${shortTime(it.startTime)} – ${shortTime(it.endTime)}`}
                              color={getItemColor(it)}
                              height={height}
                            />
                          </Pressable>
                        );
                      })}
                      {showNow ? (
                        <View pointerEvents="none" style={{ position: 'absolute', top: nowY - metrics.divider.nowDot / 2, left: 0, right: 0 }}>
                          <NowLine faint={!isTodayCol} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  };

  // ‹ Today › in the tab row: a week at a time.
  const navPrev = () => {
    if (viewMode === 'gantt') scrollGanttTo(ganttXRef.current - visibleDays * dayW);
    else { const d = new Date(weekStartDate); d.setDate(d.getDate() - 7); setWeekStartDate(d); }
  };
  const navNext = () => {
    if (viewMode === 'gantt') scrollGanttTo(ganttXRef.current + visibleDays * dayW);
    else { const d = new Date(weekStartDate); d.setDate(d.getDate() + 7); setWeekStartDate(d); }
  };
  const navToday = () => {
    if (viewMode === 'gantt') scrollGanttTo(ganttTodayX());
    else setWeekStartDate(getMondayOfWeek(new Date()));
  };

  const closeDetail = () => {
    setShowDetailSheet(false);
    setShowStatusPicker(false);
    setSelectedItem(null);
  };

  const renderDetailSheet = () => {
    if (!selectedItem) return null;
    const detailStatusOpt = getStatusOption(detailStatus);
    const statusColor = detailStatusOpt.color;

    return (
      <Modal visible={showDetailSheet} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity hitSlop={10} onPress={closeDetail}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.modalHeaderTitle, { color: colors.text }]} numberOfLines={1}>Schedule Item</Text>
            <View style={{ width: 24 }} />
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
            <ScrollView style={styles.flex1} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Name</Text>
              <TextInput
                style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, minHeight: 44, fontSize: 16, fontWeight: '600' }]}
                value={detailName}
                autoCapitalize="sentences"
                returnKeyType="done"
                onChangeText={setDetailName}
                placeholder="Item name"
                placeholderTextColor={colors.secondary}
              />

              {selectedItem.assignedToName && (
                <View style={[styles.detailInfoSection, { borderColor: colors.border }]}>
                  <View style={styles.detailInfoRow}>
                    <Ionicons name="person-outline" size={16} color={colors.secondary} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailInfoLabel, { color: colors.secondary }]}>Assigned</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailInfoValue, { color: colors.text }]}>{selectedItem.assignedToName}</Text>
                  </View>
                </View>
              )}
              {selectedItem.groupName && (
                <View style={[styles.detailInfoSection, { borderColor: colors.border }]}>
                  <View style={styles.detailInfoRow}>
                    <Ionicons name="layers-outline" size={16} color={colors.secondary} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailInfoLabel, { color: colors.secondary }]}>Group</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailInfoValue, { color: colors.text }]}>{selectedItem.groupName}</Text>
                  </View>
                </View>
              )}

              <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailSectionTitle, { color: colors.text }]}>Details</Text>

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Type</Text>
                <TouchableOpacity
                  style={[styles.fieldPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={() => { setShowDetailTypePicker(!showDetailTypePicker); setShowDetailPriorityPicker(false); setShowStatusPicker(false); }}
                >
                  <View style={[styles.statusDot, { backgroundColor: TYPE_COLORS[detailType] || colors.accent }]} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldPickerText, { color: colors.text }]}>{TYPE_LABELS[detailType] || detailType}</Text>
                  <Ionicons name={showDetailTypePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                </TouchableOpacity>
                {showDetailTypePicker && (
                  <View style={[styles.inlineStatusList, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    {Object.entries(TYPE_LABELS).map(([key, label]) => {
                      const tc = TYPE_COLORS[key] || colors.accent;
                      const isSelected = detailType === key;
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[styles.inlineStatusOption, { borderBottomColor: colors.border }, isSelected && { backgroundColor: tc + '15' }]}
                          onPress={() => { setDetailType(key); setShowDetailTypePicker(false); }}
                        >
                          <View style={[styles.statusDot, { backgroundColor: tc }]} />
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlineStatusText, { color: colors.text }]}>{label}</Text>
                          {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Start Date</Text>
                <TextInput
                  style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, minHeight: 44 }]}
                  value={detailStartDate}
                  returnKeyType="done"
                  autoCorrect={false}
                  onChangeText={setDetailStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.secondary}
                  keyboardType="numbers-and-punctuation"
                />

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>End Date</Text>
                <TextInput
                  style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, minHeight: 44 }]}
                  value={detailEndDate}
                  returnKeyType="done"
                  autoCorrect={false}
                  onChangeText={setDetailEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.secondary}
                  keyboardType="numbers-and-punctuation"
                />

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Priority</Text>
                <TouchableOpacity
                  style={[styles.fieldPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={() => { setShowDetailPriorityPicker(!showDetailPriorityPicker); setShowDetailTypePicker(false); setShowStatusPicker(false); }}
                >
                  <View style={[styles.statusDot, { backgroundColor: PRIORITY_COLORS[detailPriority] || colors.accent }]} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldPickerText, { color: colors.text }]}>{PRIORITY_LABELS[detailPriority] || detailPriority}</Text>
                  <Ionicons name={showDetailPriorityPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                </TouchableOpacity>
                {showDetailPriorityPicker && (
                  <View style={[styles.inlineStatusList, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    {Object.entries(PRIORITY_LABELS).map(([key, label]) => {
                      const pc = PRIORITY_COLORS[key] || colors.accent;
                      const isSelected = detailPriority === key;
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[styles.inlineStatusOption, { borderBottomColor: colors.border }, isSelected && { backgroundColor: pc + '15' }]}
                          onPress={() => { setDetailPriority(key); setShowDetailPriorityPicker(false); }}
                        >
                          <View style={[styles.statusDot, { backgroundColor: pc }]} />
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlineStatusText, { color: colors.text }]}>{label}</Text>
                          {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Description</Text>
                <TextInput
                  style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                  value={detailDescription}
                  autoCapitalize="sentences"
                  onChangeText={setDetailDescription}
                  multiline
                  numberOfLines={2}
                  placeholder="Optional description..."
                  placeholderTextColor={colors.secondary}
                />
              </View>

              <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailSectionTitle, { color: colors.text }]}>Update</Text>

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Status</Text>
                <TouchableOpacity
                  style={[styles.fieldPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={() => setShowStatusPicker(!showStatusPicker)}
                >
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldPickerText, { color: colors.text }]}>{detailStatusOpt.name}</Text>
                  <Ionicons name={showStatusPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                </TouchableOpacity>

                {showStatusPicker && (
                  <View style={[styles.inlineStatusList, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    {pickerStatusOptions.map(opt => {
                      const sc = opt.color;
                      const isSelected = detailStatus === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.inlineStatusOption,
                            { borderBottomColor: colors.border },
                            isSelected && { backgroundColor: sc + '15' },
                          ]}
                          onPress={() => {
                            setDetailStatus(opt.key);
                            setShowStatusPicker(false);
                          }}
                        >
                          <View style={[styles.statusDot, { backgroundColor: sc }]} />
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlineStatusText, { color: colors.text }]}>{opt.name}</Text>
                          {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Progress ({detailProgress}%)</Text>
                <View style={styles.progressInputRow}>
                  <View style={[styles.progressTrackLarge, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFillLarge, { width: `${Math.min(parseInt(detailProgress) || 0, 100)}%`, backgroundColor: statusColor }]} />
                  </View>
                  <TextInput
                    style={[styles.progressInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    value={detailProgress}
                    returnKeyType="done"
                    onChangeText={t => { const n = t.replace(/[^0-9]/g, ''); setDetailProgress(n ? String(Math.min(parseInt(n), 100)) : '0'); }}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Notes</Text>
                <TextInput
                  style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                  value={detailNotes}
                  autoCapitalize="sentences"
                  onChangeText={setDetailNotes}
                  multiline
                  numberOfLines={3}
                  placeholder="Add notes..."
                  placeholderTextColor={colors.secondary}
                />
              </View>

              <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                <View style={styles.switchRow}>
                  <View style={styles.switchLabelRow}>
                    <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.switchLabel, { color: colors.text }]}>Allow on weekends</Text>
                  </View>
                  <Switch
                    value={detailWeekendOverride}
                    onValueChange={setDetailWeekendOverride}
                    trackColor={{ false: colors.border, true: colors.accent + '80' }}
                    thumbColor={detailWeekendOverride ? colors.accent : '#f4f3f4'}
                  />
                </View>
              </View>

              <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailSectionTitle, { color: colors.text }]}>Checklist Steps</Text>
                {loadingSteps ? (
                  <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 12 }} />
                ) : (
                  checklistSteps.map(step => (
                    <View key={step.id} style={[styles.stepRow, { borderBottomColor: colors.border }]}>
                      <TouchableOpacity hitSlop={10} onPress={() => handleToggleStep(step)} style={styles.stepCheckbox}>
                        <Ionicons
                          name={step.isCompleted ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={step.isCompleted ? colors.accent : colors.secondary}
                        />
                      </TouchableOpacity>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.stepName, { color: colors.text }, step.isCompleted && styles.stepCompleted]}>{step.name}</Text>
                      <TouchableOpacity hitSlop={12} onPress={() => handleDeleteStep(step.id)} style={styles.stepDeleteBtn}>
                        <Ionicons name="trash-outline" size={16} color={theme.statusDanger} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                {checklistSteps.length === 0 && !loadingSteps && (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.noNotesText, { color: colors.secondary }]}>No checklist steps yet</Text>
                )}
                <View style={styles.addNoteRow}>
                  <TextInput
                    style={[styles.addNoteInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    value={newStepName}
                    autoCapitalize="sentences"
                    returnKeyType="done"
                    submitBehavior="submit"
                    onSubmitEditing={() => { if (newStepName.trim() && !addingStep) handleAddStep(); }}
                    onChangeText={setNewStepName}
                    placeholder="Add a step..."
                    placeholderTextColor={colors.secondary}
                  />
                  <TouchableOpacity hitSlop={4}
                    style={[styles.addNoteBtn, { backgroundColor: colors.accent, opacity: !newStepName.trim() || addingStep ? 0.5 : 1 }]}
                    onPress={handleAddStep}
                    disabled={!newStepName.trim() || addingStep}
                  >
                    {addingStep ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="add" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {linkedChecklists.length > 0 && (
                <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailSectionTitle, { color: colors.text }]}>Linked Checklists</Text>
                  {linkedChecklists.map(cl => (
                    <View key={cl.id} style={[styles.linkedItemRow, { borderBottomColor: colors.border }]}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.linkedItemName, { color: colors.text }]}>{cl.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {linkedTasks.length > 0 && (
                <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailSectionTitle, { color: colors.text }]}>Linked Tasks</Text>
                  {linkedTasks.map(t => (
                    <View key={t.id} style={[styles.linkedItemRow, { borderBottomColor: colors.border }]}>
                      <Ionicons name="checkbox-outline" size={16} color={colors.accent} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.linkedItemName, { color: colors.text }]}>{t.title}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.detailSectionTitle, { color: colors.text }]}>Activity Notes</Text>
                {loadingNotes ? (
                  <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 12 }} />
                ) : (
                  activityNotes.map(note => (
                    <View key={note.id} style={[styles.activityNote, { borderColor: colors.border }]}>
                      <View style={styles.noteHeader}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.noteUser, { color: colors.text }]}>{note.userName || 'System'}</Text>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.noteDate, { color: colors.secondary }]}>{formatNoteDate(note.createdAt)}</Text>
                      </View>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.noteContent, { color: note.type === 'system' ? colors.secondary : colors.text }]}>{note.content}</Text>
                    </View>
                  ))
                )}
                {activityNotes.length === 0 && !loadingNotes && (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.noNotesText, { color: colors.secondary }]}>No activity notes yet</Text>
                )}
                <View style={styles.addNoteRow}>
                  <TextInput
                    style={[styles.addNoteInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    value={newNoteText}
                    autoCapitalize="sentences"
                    returnKeyType="send"
                    onSubmitEditing={() => { if (newNoteText.trim() && !addingNote) handleAddNote(); }}
                    onChangeText={setNewNoteText}
                    placeholder="Add a note..."
                    placeholderTextColor={colors.secondary}
                  />
                  <TouchableOpacity hitSlop={4}
                    style={[styles.addNoteBtn, { backgroundColor: colors.accent, opacity: !newNoteText.trim() || addingNote ? 0.5 : 1 }]}
                    onPress={handleAddNote}
                    disabled={!newNoteText.trim() || addingNote}
                  >
                    {addingNote ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="send" size={16} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.detailActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.border }]}
                  onPress={closeDetail}
                >
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.actionBtnText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.actionBtnText, { color: '#fff' }]}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  const renderAddModal = () => (
    <Modal visible={showAddModal} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
        <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity hitSlop={12} onPress={() => { setShowAddModal(false); resetAddForm(); }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: colors.accent, fontSize: 15, fontWeight: '500' }}>Cancel</Text>
          </TouchableOpacity>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.modalHeaderTitle, { color: colors.text }]}>New Schedule Item</Text>
          <TouchableOpacity hitSlop={12} onPress={handleAddItem} disabled={addSaving} style={{ opacity: addSaving ? 0.5 : 1 }}>
            {addSaving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
          <ScrollView style={styles.flex1} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Name *</Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, minHeight: 44 }]}
              value={addName}
              autoCapitalize="sentences"
              returnKeyType="done"
              onChangeText={setAddName}
              placeholder="Schedule item name"
              placeholderTextColor={colors.secondary}
            />

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Type</Text>
            <TouchableOpacity
              style={[styles.fieldPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              onPress={() => { setShowAddTypePicker(!showAddTypePicker); setShowAddPriorityPicker(false); setShowAddStatusPicker(false); }}
            >
              <View style={[styles.statusDot, { backgroundColor: TYPE_COLORS[addType] || colors.accent }]} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldPickerText, { color: colors.text }]}>{TYPE_LABELS[addType] || addType}</Text>
              <Ionicons name={showAddTypePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
            </TouchableOpacity>
            {showAddTypePicker && (
              <View style={[styles.inlineStatusList, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                {Object.entries(TYPE_LABELS).map(([key, label]) => {
                  const tc = TYPE_COLORS[key] || colors.accent;
                  const isSelected = addType === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.inlineStatusOption, { borderBottomColor: colors.border }, isSelected && { backgroundColor: tc + '15' }]}
                      onPress={() => { setAddType(key); setShowAddTypePicker(false); }}
                    >
                      <View style={[styles.statusDot, { backgroundColor: tc }]} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlineStatusText, { color: colors.text }]}>{label}</Text>
                      {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Start Date</Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, minHeight: 44 }]}
              value={addStartDate}
              returnKeyType="done"
              autoCorrect={false}
              onChangeText={setAddStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.secondary}
              keyboardType="numbers-and-punctuation"
            />

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>End Date</Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, minHeight: 44 }]}
              value={addEndDate}
              returnKeyType="done"
              autoCorrect={false}
              onChangeText={setAddEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.secondary}
              keyboardType="numbers-and-punctuation"
            />

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Priority</Text>
            <TouchableOpacity
              style={[styles.fieldPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              onPress={() => { setShowAddPriorityPicker(!showAddPriorityPicker); setShowAddTypePicker(false); setShowAddStatusPicker(false); }}
            >
              <View style={[styles.statusDot, { backgroundColor: PRIORITY_COLORS[addPriority] || colors.accent }]} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldPickerText, { color: colors.text }]}>{PRIORITY_LABELS[addPriority] || addPriority}</Text>
              <Ionicons name={showAddPriorityPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
            </TouchableOpacity>
            {showAddPriorityPicker && (
              <View style={[styles.inlineStatusList, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                {Object.entries(PRIORITY_LABELS).map(([key, label]) => {
                  const pc = PRIORITY_COLORS[key] || colors.accent;
                  const isSelected = addPriority === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.inlineStatusOption, { borderBottomColor: colors.border }, isSelected && { backgroundColor: pc + '15' }]}
                      onPress={() => { setAddPriority(key); setShowAddPriorityPicker(false); }}
                    >
                      <View style={[styles.statusDot, { backgroundColor: pc }]} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlineStatusText, { color: colors.text }]}>{label}</Text>
                      {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Status</Text>
            <TouchableOpacity
              style={[styles.fieldPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              onPress={() => { setShowAddStatusPicker(!showAddStatusPicker); setShowAddTypePicker(false); setShowAddPriorityPicker(false); }}
            >
              <View style={[styles.statusDot, { backgroundColor: getStatusOption(addStatus).color }]} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldPickerText, { color: colors.text }]}>{getStatusOption(addStatus).name}</Text>
              <Ionicons name={showAddStatusPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
            </TouchableOpacity>
            {showAddStatusPicker && (
              <View style={[styles.inlineStatusList, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                {pickerStatusOptions.map(opt => {
                  const sc = opt.color;
                  const isSelected = addStatus === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.inlineStatusOption, { borderBottomColor: colors.border }, isSelected && { backgroundColor: sc + '15' }]}
                      onPress={() => { setAddStatus(opt.key); setShowAddStatusPicker(false); }}
                    >
                      <View style={[styles.statusDot, { backgroundColor: sc }]} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.inlineStatusText, { color: colors.text }]}>{opt.name}</Text>
                      {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Description</Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={addDescription}
              autoCapitalize="sentences"
              onChangeText={setAddDescription}
              multiline
              numberOfLines={2}
              placeholder="Optional description..."
              placeholderTextColor={colors.secondary}
            />

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.fieldLabel, { color: colors.secondary }]}>Notes</Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={addNotes}
              autoCapitalize="sentences"
              onChangeText={setAddNotes}
              multiline
              numberOfLines={3}
              placeholder="Optional notes..."
              placeholderTextColor={colors.secondary}
            />
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderProjectPickerModal = () => (
    <Modal visible={showProjectPicker} animationType="slide" transparent>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerContainer, sheetFrame, { backgroundColor: colors.card }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.pickerTitle, { color: colors.text }]}>Select Project</Text>
            <TouchableOpacity hitSlop={10} onPress={() => setShowProjectPicker(false)}>
              <Ionicons name="close" size={24} color={colors.secondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={getSortedProjectItems(projects)}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              if (item.isHeader) {
                return (
                  <View style={[styles.pickerSectionHeader, { backgroundColor: theme.nav }]}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.pickerSectionText, { color: colors.secondary }]}>{item.label}</Text>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => { setSelectedProjectId(item.id); setShowProjectPicker(false); }}
                >
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.pickerItemText, { color: colors.text }]}>{item.label}</Text>
                  {selectedProjectId === item.id && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const headerProject = selectedProject
    ? { name: selectedProject.name, color: selectedProject.color ?? null, id: selectedProject.id }
    : route?.params?.projectName
      ? { name: route.params.projectName, color: route.params.projectColor ?? null, id: route.params.projectId ?? null }
      : !isProjectContext
        ? { name: 'Choose project', color: null, id: null }
        : null;

  const header = (
    <View style={[ss.top, { paddingTop: insets.top + sc.top, gap: viewMode === 'list' ? sc.gapList : sc.gapOther }]}>
      <PageHeader
        title="Schedule"
        project={headerProject}
        onBack={() => goBackOrHome(navigation as any)}
        onProjectPress={!isProjectContext ? () => setShowProjectPicker(true) : undefined}
        actions={viewMode === 'gantt' ? [{ icon: Ellipsis, label: 'Gantt options', onPress: () => setShowGanttMenu(v => !v) }] : undefined}
        right={scheduleId ? (
          <ScheduleActivityFeedButton
            scheduleId={scheduleId}
            userId={user?.id ?? null}
            onSelectItem={(id) => {
              const target = items.find(i => i.id === id);
              if (target) openDetail(target);
            }}
          />
        ) : undefined}
      />
      <UnderlineTabs
        tabs={[{ key: 'list', label: 'List' }, { key: 'gantt', label: 'Gantt' }, { key: 'calendar', label: 'Calendar' }]}
        value={viewMode}
        onChange={(m) => { setViewMode(m); if (m !== 'gantt') ganttScrolledRef.current = false; }}
        nav={viewMode === 'list' ? undefined : { onPrev: navPrev, onToday: navToday, onNext: navNext }}
      />
      {showGanttMenu && viewMode === 'gantt' && (
        <View style={ss.ganttMenu}>
          <Card variant="list">
            <ListRow
              lead={<Checkbox checked={showNamesCol} />}
              title="Show names column"
              titleLines={1}
              onPress={() => {
                const next = !showNamesCol;
                setShowNamesCol(next);
                AsyncStorage.setItem('@buildpro/gantt_show_names', String(next));
                setShowGanttMenu(false);
              }}
            />
            <ListRow
              lead={<Checkbox checked={showBarStatus} />}
              title="Show status"
              titleLines={1}
              onPress={() => {
                const next = !showBarStatus;
                setShowBarStatus(next);
                AsyncStorage.setItem('@buildpro/gantt_show_status', String(next));
                setShowGanttMenu(false);
              }}
            />
          </Card>
        </View>
      )}
    </View>
  );

  if (loading && projects.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: k.bg }]}>
        {header}
        <SkeletonList />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: k.bg }]}>
      {header}

      {!selectedProjectId && !isProjectContext ? (
        <View style={styles.flex1}>
          <EmptyState icon={FolderOpen} title="Choose a project" helper="Tap the project name at the top to see its schedule." />
        </View>
      ) : loading ? (
        <SkeletonList />
      ) : (
        <View style={styles.flex1} onLayout={(e) => setCalBodyHeight(e.nativeEvent.layout.height)}>
          {viewMode === 'list' && renderListView()}
          {viewMode === 'gantt' && renderGanttView()}
          {viewMode === 'calendar' && renderCalendarView()}
        </View>
      )}

      {selectedProjectId && !loading && (
        <FAB onPress={() => setShowAddModal(true)} label="Add schedule item" />
      )}

      {renderProjectPickerModal()}
      {renderDetailSheet()}
      {renderAddModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },

  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 12, borderBottomWidth: 1 },
  modalHeaderTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  detailInfoSection: { borderTopWidth: 1, paddingTop: 12, marginBottom: 16 },
  detailInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  detailInfoLabel: { fontSize: 12, fontWeight: '500', width: 70 },
  detailInfoValue: { fontSize: 13, fontWeight: '500' },
  detailEditSection: { borderTopWidth: 1, paddingTop: 12, marginBottom: 16 },
  detailSectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4, marginTop: 8 },
  fieldPicker: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  fieldPickerText: { flex: 1, fontSize: 14 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  inlineStatusList: { borderWidth: 1, borderRadius: 8, marginTop: 4, overflow: 'hidden' },
  inlineStatusOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  inlineStatusText: { flex: 1, fontSize: 14, fontWeight: '500' },
  progressInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrackLarge: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFillLarge: { height: '100%', borderRadius: 3 },
  progressInput: { width: 56, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, textAlign: 'center', fontSize: 14 },
  notesInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, minHeight: 60, textAlignVertical: 'top' },

  activityNote: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  noteUser: { fontSize: 12, fontWeight: '600' },
  noteDate: { fontSize: 10 },
  noteContent: { fontSize: 13 },
  noNotesText: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  addNoteRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  addNoteInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  addNoteBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  switchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 14, fontWeight: '500' },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  stepCheckbox: { padding: 2 },
  stepName: { flex: 1, fontSize: 13, fontWeight: '500' },
  stepCompleted: { textDecorationLine: 'line-through', opacity: 0.6 },
  stepDeleteBtn: { padding: 4 },
  linkedItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  linkedItemName: { flex: 1, fontSize: 13, fontWeight: '500' },
  depLineH: { position: 'absolute', height: 2 },
  depLineV: { position: 'absolute', width: 2 },
  depArrow: { position: 'absolute', width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent' },

  detailActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  actionBtnText: { fontWeight: '600', fontSize: 14 },

  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerContainer: { maxHeight: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  pickerTitle: { fontSize: 16, fontWeight: '700' },
  pickerSectionHeader: { paddingHorizontal: 16, paddingVertical: 6 },
  pickerSectionText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerItemText: { fontSize: 14, fontWeight: '500' },
});

const S = metrics.schedule;

// Revamp v1 header + list / gantt / calendar styles (sheets below use `styles`).
const ss = StyleSheet.create({
  top: { paddingHorizontal: space.screenX, paddingBottom: S.gapOther, zIndex: 10 },
  list: { paddingHorizontal: space.screenX, gap: S.dayGroupGap },
  earlier: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  dayGroup: {},
  todayMarker: { marginBottom: S.dayGroupGap },
  ganttMenu: { position: 'absolute', right: space.screenX, top: '100%', width: metrics.workspace.menuWidth, zIndex: 20 },
  ganttHeader: { flexDirection: 'row', borderBottomWidth: size.border, marginHorizontal: space.screenX },
  ganttCorner: { justifyContent: 'flex-end', paddingBottom: space.inline },
  ganttDateCell: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: space.inlineSm, gap: space.inlineSm / 2 },
  ganttDateNum: {
    width: S.gantt.todayCircle,
    height: S.gantt.todayCircle,
    borderRadius: S.gantt.todayCircle / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ganttContainer: { flexDirection: 'row', marginHorizontal: space.screenX },
  ganttNameRow: { height: S.gantt.rowHeight, justifyContent: 'center', borderBottomWidth: size.border, paddingRight: space.inline },
  ganttGridLine: { position: 'absolute', top: 0, width: size.border },
  ganttBarRow: { position: 'absolute', left: 0, right: 0, justifyContent: 'center', borderBottomWidth: size.border },
  ganttStatus: { position: 'absolute' },
  calHeader: { flexDirection: 'row', height: S.calendar.headerHeight, borderBottomWidth: size.border, paddingLeft: space.screenX },
  calGutter: { width: S.calendar.gutter, paddingBottom: space.inline },
  calDayHead: { alignItems: 'center', justifyContent: 'center', gap: space.inlineSm / 2 },
  calDateCircle: {
    width: S.calendar.dateCircle,
    height: S.calendar.dateCircle,
    borderRadius: S.calendar.dateCircle / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calAllDay: { flexDirection: 'row', borderBottomWidth: size.border, paddingLeft: space.screenX, paddingVertical: space.inlineSm },
  calAllDayCol: { gap: space.inlineSm / 2, paddingHorizontal: S.calendar.blockInset },
  calHour: { position: 'absolute', left: 0, marginTop: -space.inline },
  calDayCol: { borderLeftWidth: size.border },
  calHourLine: { position: 'absolute', left: 0, right: 0, height: size.border },
});
