import { useState, useEffect, useCallback, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

type ViewMode = 'list' | 'gantt' | 'calendar';
type CalendarMode = 'month' | 'week' | 'day';

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
  task: '#3b82f6',
  milestone: '#f59e0b',
  inspection: '#8b5cf6',
  delivery: '#10b981',
  meeting: '#ef4444',
};

const STATUS_COLORS: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#10b981',
  on_hold: '#f59e0b',
  cancelled: '#ef4444',
};

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
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  return item.color || item.assignedToColor || TYPE_COLORS[item.type] || '#3b82f6';
}

function isFutureDate(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) > today;
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

function parseTimeToHour(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m || 0) / 60;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_COL_WIDTH = 40;
const NAME_COL_WIDTH = 140;
const GANTT_ROW_HEIGHT = 36;
const HOUR_HEIGHT = 60;

export default function ScheduleScreen({ navigation }: Props) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

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

  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [weekStartDate, setWeekStartDate] = useState<Date>(getMondayOfWeek(new Date()));
  const [dayViewDate, setDayViewDate] = useState<Date>(new Date());

  const ganttScrollRef = useRef<ScrollView>(null);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6', inputBg: '#0f172a' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb', inputBg: '#f1f5f9' };

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
      await fetchProjects();
      if (selectedProjectId) {
        await fetchItems(selectedProjectId);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchProjects, fetchItems, selectedProjectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (selectedProjectId) {
      setLoading(true);
      fetchItems(selectedProjectId).finally(() => setLoading(false));
    } else {
      setItems([]);
    }
  }, [selectedProjectId, fetchItems]);

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

  const openDetail = useCallback((item: ScheduleItem) => {
    setSelectedItem(item);
    setDetailStatus(item.status);
    setDetailProgress(String(item.progressPercent || 0));
    setDetailNotes(item.notes || '');
    setActivityNotes([]);
    setNewNoteText('');
    setShowStatusPicker(false);
    setShowDetailSheet(true);
    fetchActivityNotes(item.id);
  }, [fetchActivityNotes]);

  const handleSave = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const body: any = {
        status: detailStatus,
        progressPercent: parseInt(detailProgress) || 0,
        notes: detailNotes,
      };
      await apiRequest(`/api/schedule-items/${selectedItem.id}`, 'PATCH', body);
      if (selectedProjectId) {
        await fetchItems(selectedProjectId);
      }
      setShowDetailSheet(false);
    } catch (e: any) {
      Alert.alert('Error', 'Could not save changes. Please try again.');
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
    } catch {
      Alert.alert('Error', 'Could not add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const getSelectedProjectLabel = () => {
    if (!selectedProjectId) return 'Select Project';
    const p = projects.find(p => p.id === selectedProjectId);
    if (!p) return 'Select Project';
    return p.jobNumber ? `${p.jobNumber} - ${p.name}` : p.name;
  };

  const groupedItems = useCallback(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const groups: { title: string; data: ScheduleItem[] }[] = [
      { title: 'In Progress', data: [] },
      { title: 'Not Started', data: [] },
      { title: 'Upcoming', data: [] },
      { title: 'Completed', data: [] },
      { title: 'On Hold / Cancelled', data: [] },
    ];

    items.forEach(item => {
      if (item.status === 'in_progress') {
        groups[0].data.push(item);
      } else if (item.status === 'not_started' && !isFutureDate(item.startDate)) {
        groups[1].data.push(item);
      } else if (item.status === 'not_started' && isFutureDate(item.startDate)) {
        groups[2].data.push(item);
      } else if (item.status === 'completed') {
        groups[3].data.push(item);
      } else if (item.status === 'on_hold' || item.status === 'cancelled') {
        groups[4].data.push(item);
      } else {
        groups[1].data.push(item);
      }
    });

    return groups.filter(g => g.data.length > 0);
  }, [items]);

  const getCalendarGrid = useCallback(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    let startOffset = firstDay.getDay();

    const prevMonthLastDay = new Date(calendarYear, calendarMonth, 0).getDate();
    const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

    const prevMonth = calendarMonth === 0 ? 11 : calendarMonth - 1;
    const prevYear = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: prevMonthLastDay - i, month: prevMonth, year: prevYear, isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: calendarMonth, year: calendarYear, isCurrentMonth: true });
    }
    const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
    const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        cells.push({ day: d, month: nextMonth, year: nextYear, isCurrentMonth: false });
      }
    }

    const rows: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [calendarYear, calendarMonth]);

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

  const getDotsForDate = useCallback((date: Date): string[] => {
    const dayItems = getItemsForDate(date);
    const dotColors: string[] = [];
    const seen = new Set<string>();
    dayItems.forEach(item => {
      const c = STATUS_COLORS[item.status] || '#3b82f6';
      if (!seen.has(c) && dotColors.length < 3) {
        seen.add(c);
        dotColors.push(c);
      }
    });
    return dotColors;
  }, [getItemsForDate]);

  const ganttData = useCallback(() => {
    if (items.length === 0) return { minDate: new Date(), maxDate: new Date(), days: 0, sortedItems: [] };

    let minDate = new Date(items[0].startDate);
    let maxDate = new Date(items[0].endDate);
    items.forEach(item => {
      const s = new Date(item.startDate);
      const e = new Date(item.endDate);
      if (s < minDate) minDate = s;
      if (e > maxDate) maxDate = e;
    });

    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 1);
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(0, 0, 0, 0);

    const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const sortedItems = [...items].sort((a, b) => {
      const sa = new Date(a.startDate).getTime();
      const sb = new Date(b.startDate).getTime();
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

  const renderItemCard = (item: ScheduleItem) => {
    const itemColor = getItemColor(item);
    const typeColor = TYPE_COLORS[item.type] || '#3b82f6';
    const statusColor = STATUS_COLORS[item.status] || '#94a3b8';
    const isHighPriority = item.priority === 'high' || item.priority === 'urgent';

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.itemColorBar, { backgroundColor: itemColor }]} />
        <View style={styles.itemContent}>
          <View style={styles.itemTopRow}>
            <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            {isHighPriority && (
              <View style={[styles.priorityBadge, { backgroundColor: item.priority === 'urgent' ? '#ef4444' : '#f59e0b' }]}>
                <Ionicons name="alert-circle" size={10} color="#fff" />
                <Text style={styles.priorityText}>{item.priority === 'urgent' ? 'Urgent' : 'High'}</Text>
              </View>
            )}
          </View>
          <View style={styles.itemMetaRow}>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '20' }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>{TYPE_LABELS[item.type] || item.type}</Text>
            </View>
            <Text style={[styles.itemDateText, { color: colors.secondary }]}>
              {formatDateRange(item.startDate, item.endDate)}
            </Text>
          </View>
          {item.assignedToName && (
            <View style={styles.itemAssignRow}>
              <Ionicons name="person-outline" size={12} color={colors.secondary} />
              <Text style={[styles.itemAssignText, { color: colors.secondary }]}>{item.assignedToName}</Text>
            </View>
          )}
          {item.progressPercent > 0 && (
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${Math.min(item.progressPercent, 100)}%`, backgroundColor: statusColor }]} />
              </View>
              <Text style={[styles.progressText, { color: colors.secondary }]}>{item.progressPercent}%</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderListView = () => {
    const groups = groupedItems();
    if (groups.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={colors.secondary} />
          <Text style={[styles.emptyText, { color: colors.secondary }]}>No schedule items found</Text>
        </View>
      );
    }
    return (
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {groups.map(group => (
          <View key={group.title} style={styles.groupSection}>
            <View style={styles.groupHeader}>
              <View style={[styles.groupDot, { backgroundColor: getGroupColor(group.title) }]} />
              <Text style={[styles.groupTitle, { color: colors.text }]}>{group.title}</Text>
              <Text style={[styles.groupCount, { color: colors.secondary }]}>{group.data.length}</Text>
            </View>
            {group.data.map(renderItemCard)}
          </View>
        ))}
      </ScrollView>
    );
  };

  const getGroupColor = (title: string): string => {
    switch (title) {
      case 'In Progress': return STATUS_COLORS.in_progress;
      case 'Not Started': return STATUS_COLORS.not_started;
      case 'Upcoming': return '#6366f1';
      case 'Completed': return STATUS_COLORS.completed;
      case 'On Hold / Cancelled': return STATUS_COLORS.on_hold;
      default: return '#94a3b8';
    }
  };

  const renderGanttView = () => {
    const { minDate, days, sortedItems } = ganttData();

    if (sortedItems.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={48} color={colors.secondary} />
          <Text style={[styles.emptyText, { color: colors.secondary }]}>No schedule items to display</Text>
        </View>
      );
    }

    const dateHeaders: { date: Date; label: string }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(minDate);
      d.setDate(d.getDate() + i);
      dateHeaders.push({ date: d, label: `${d.getDate()}` });
    }

    const showMonthHeaders = days > 14;
    const monthBreaks: { month: string; startIdx: number; count: number }[] = [];
    if (showMonthHeaders) {
      let curMonth = '';
      dateHeaders.forEach((dh, idx) => {
        const m = `${MONTHS[dh.date.getMonth()]} ${dh.date.getFullYear()}`;
        if (m !== curMonth) {
          curMonth = m;
          monthBreaks.push({ month: m, startIdx: idx, count: 1 });
        } else {
          monthBreaks[monthBreaks.length - 1].count++;
        }
      });
    }

    const totalWidth = days * DAY_COL_WIDTH;

    return (
      <View style={styles.flex1}>
        <ScrollView style={styles.flex1}>
          <View style={styles.ganttContainer}>
            <View style={styles.ganttNamesCol}>
              <View style={[styles.ganttHeaderCell, { backgroundColor: colors.card, borderBottomColor: colors.border, height: showMonthHeaders ? 52 : 32 }]}>
                <Text style={[styles.ganttHeaderText, { color: colors.secondary }]}>Item</Text>
              </View>
              {sortedItems.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.ganttNameRow, { backgroundColor: idx % 2 === 0 ? colors.bg : colors.card, borderBottomColor: colors.border }]}
                  onPress={() => openDetail(item)}
                >
                  <Text style={[styles.ganttNameText, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={true} ref={ganttScrollRef}>
              <View style={{ width: totalWidth }}>
                {showMonthHeaders && (
                  <View style={[styles.ganttMonthRow, { borderBottomColor: colors.border }]}>
                    {monthBreaks.map((mb, i) => (
                      <View key={i} style={[styles.ganttMonthCell, { width: mb.count * DAY_COL_WIDTH, backgroundColor: colors.card, borderRightColor: colors.border }]}>
                        <Text style={[styles.ganttMonthText, { color: colors.text }]}>{mb.month}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={[styles.ganttDateRow, { borderBottomColor: colors.border }]}>
                  {dateHeaders.map((dh, i) => {
                    const todayHighlight = isToday(dh.date);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.ganttDateCell,
                          { backgroundColor: todayHighlight ? (isDark ? '#1e3a5f' : '#dbeafe') : colors.card, borderRightColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.ganttDateText, { color: todayHighlight ? colors.accent : colors.secondary }]}>{dh.label}</Text>
                      </View>
                    );
                  })}
                </View>
                {sortedItems.map((item, idx) => {
                  const startDay = Math.max(0, Math.floor((new Date(item.startDate).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
                  const endDay = Math.max(startDay + 1, Math.ceil((new Date(item.endDate).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                  const barLeft = startDay * DAY_COL_WIDTH;
                  const barWidth = Math.max((endDay - startDay) * DAY_COL_WIDTH - 4, 8);
                  const barColor = STATUS_COLORS[item.status] || '#3b82f6';

                  return (
                    <View key={item.id} style={[styles.ganttBarRow, { backgroundColor: idx % 2 === 0 ? colors.bg : colors.card, borderBottomColor: colors.border }]}>
                      {dateHeaders.map((_, ci) => (
                        <View key={ci} style={[styles.ganttGridLine, { left: ci * DAY_COL_WIDTH, borderRightColor: colors.border }]} />
                      ))}
                      <TouchableOpacity
                        style={[styles.ganttBar, { left: barLeft + 2, width: barWidth, backgroundColor: barColor }]}
                        onPress={() => openDetail(item)}
                        activeOpacity={0.7}
                      >
                        {barWidth > 50 && (
                          <Text style={styles.ganttBarText} numberOfLines={1}>{item.name}</Text>
                        )}
                      </TouchableOpacity>
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

  const renderCalendarModeToggle = () => (
    <View style={[styles.calModeToggle, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
      {(['month', 'week', 'day'] as CalendarMode[]).map(mode => (
        <TouchableOpacity
          key={mode}
          style={[styles.calModeBtn, calendarMode === mode && { backgroundColor: colors.accent }]}
          onPress={() => {
            setCalendarMode(mode);
            if (mode === 'week') {
              setWeekStartDate(getMondayOfWeek(selectedDate));
            } else if (mode === 'day') {
              setDayViewDate(new Date(selectedDate));
            }
          }}
        >
          <Text style={[styles.calModeText, { color: calendarMode === mode ? '#fff' : colors.secondary }]}>
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderMonthView = () => {
    const rows = getCalendarGrid();
    const selectedDayItems = getItemsForDate(selectedDate);

    return (
      <>
        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calendarNav}>
            <TouchableOpacity onPress={() => {
              if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); }
              else setCalendarMonth(m => m - 1);
            }}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setCalendarMonth(new Date().getMonth()); setCalendarYear(new Date().getFullYear()); setSelectedDate(new Date()); }}>
              <Text style={[styles.calendarTitle, { color: colors.text }]}>
                {MONTHS_FULL[calendarMonth]} {calendarYear}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); }
              else setCalendarMonth(m => m + 1);
            }}>
              <Ionicons name="chevron-forward" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarDayNames}>
            {DAY_NAMES.map(d => (
              <View key={d} style={styles.calendarDayNameCell}>
                <Text style={[styles.calendarDayNameText, { color: colors.secondary }]}>{d}</Text>
              </View>
            ))}
          </View>

          {rows.map((row, ri) => (
            <View key={ri} style={styles.calendarRow}>
              {row.map((cell, ci) => {
                const cellDate = new Date(cell.year, cell.month, cell.day);
                const today = isToday(cellDate);
                const selected = isSameDay(cellDate, selectedDate);
                const dots = cell.isCurrentMonth ? getDotsForDate(cellDate) : [];

                return (
                  <TouchableOpacity
                    key={ci}
                    style={[
                      styles.calendarCell,
                      today && !selected && { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' },
                      selected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => setSelectedDate(cellDate)}
                  >
                    <Text style={[
                      styles.calendarDayText,
                      { color: cell.isCurrentMonth ? colors.text : colors.secondary },
                      !cell.isCurrentMonth && { opacity: 0.4 },
                      selected && { color: '#fff' },
                      today && !selected && { color: colors.accent, fontWeight: '700' },
                    ]}>
                      {cell.day}
                    </Text>
                    {dots.length > 0 && (
                      <View style={styles.dotsRow}>
                        {dots.map((color, di) => (
                          <View key={di} style={[styles.dot, { backgroundColor: selected ? '#fff' : color }]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.selectedDaySection}>
          <Text style={[styles.selectedDayTitle, { color: colors.text }]}>
            {selectedDate.getDate()} {MONTHS_FULL[selectedDate.getMonth()]} {selectedDate.getFullYear()}
          </Text>
          {selectedDayItems.length === 0 ? (
            <Text style={[styles.noDayItems, { color: colors.secondary }]}>No items scheduled for this day</Text>
          ) : (
            selectedDayItems.map(renderItemCard)
          )}
        </View>
      </>
    );
  };

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    const selectedDayItems = getItemsForDate(selectedDate);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    return (
      <>
        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calendarNav}>
            <TouchableOpacity onPress={() => {
              const prev = new Date(weekStartDate);
              prev.setDate(prev.getDate() - 7);
              setWeekStartDate(prev);
            }}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              const today = new Date();
              setWeekStartDate(getMondayOfWeek(today));
              setSelectedDate(today);
            }}>
              <Text style={[styles.calendarTitle, { color: colors.text }]}>
                {weekStartDate.getDate()} {MONTHS[weekStartDate.getMonth()]} - {weekEndDate.getDate()} {MONTHS[weekEndDate.getMonth()]} {weekEndDate.getFullYear()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              const next = new Date(weekStartDate);
              next.setDate(next.getDate() + 7);
              setWeekStartDate(next);
            }}>
              <Ionicons name="chevron-forward" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map((day, i) => {
              const today = isToday(day);
              const selected = isSameDay(day, selectedDate);
              const dots = getDotsForDate(day);

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.weekDayCol,
                    today && !selected && { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' },
                    selected && { backgroundColor: colors.accent },
                  ]}
                  onPress={() => setSelectedDate(new Date(day))}
                >
                  <Text style={[
                    styles.weekDayName,
                    { color: selected ? '#fff' : colors.secondary },
                    today && !selected && { color: colors.accent },
                  ]}>
                    {DAY_NAMES_MON[i]}
                  </Text>
                  <Text style={[
                    styles.weekDayNum,
                    { color: selected ? '#fff' : colors.text },
                    today && !selected && { color: colors.accent, fontWeight: '700' },
                  ]}>
                    {day.getDate()}
                  </Text>
                  {dots.length > 0 && (
                    <View style={styles.dotsRow}>
                      {dots.map((color, di) => (
                        <View key={di} style={[styles.dot, { backgroundColor: selected ? '#fff' : color }]} />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.selectedDaySection}>
          <Text style={[styles.selectedDayTitle, { color: colors.text }]}>
            {DAY_NAMES_FULL[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTHS_FULL[selectedDate.getMonth()]} {selectedDate.getFullYear()}
          </Text>
          {selectedDayItems.length === 0 ? (
            <Text style={[styles.noDayItems, { color: colors.secondary }]}>No items scheduled for this day</Text>
          ) : (
            selectedDayItems.map(renderItemCard)
          )}
        </View>
      </>
    );
  };

  const renderDayView = () => {
    const dayItems = getItemsForDate(dayViewDate);
    const allDayItems = dayItems.filter(item => !item.startTime || !item.endTime);
    const timedItems = dayItems.filter(item => item.startTime && item.endTime);

    const startHour = 6;
    const endHour = 20;
    const hours: number[] = [];
    for (let h = startHour; h <= endHour; h++) {
      hours.push(h);
    }

    const formatHourLabel = (h: number): string => {
      if (h === 0) return '12 AM';
      if (h < 12) return `${h} AM`;
      if (h === 12) return '12 PM';
      return `${h - 12} PM`;
    };

    return (
      <>
        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calendarNav}>
            <TouchableOpacity onPress={() => {
              const prev = new Date(dayViewDate);
              prev.setDate(prev.getDate() - 1);
              setDayViewDate(prev);
              setSelectedDate(prev);
            }}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              const today = new Date();
              setDayViewDate(today);
              setSelectedDate(today);
            }}>
              <Text style={[styles.calendarTitle, { color: colors.text }]}>
                {DAY_NAMES_FULL[dayViewDate.getDay()]}, {dayViewDate.getDate()} {MONTHS_FULL[dayViewDate.getMonth()]} {dayViewDate.getFullYear()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              const next = new Date(dayViewDate);
              next.setDate(next.getDate() + 1);
              setDayViewDate(next);
              setSelectedDate(next);
            }}>
              <Ionicons name="chevron-forward" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {allDayItems.length > 0 && (
          <View style={styles.allDaySection}>
            <Text style={[styles.allDayLabel, { color: colors.secondary }]}>All Day</Text>
            {allDayItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.allDayItem, { backgroundColor: (getItemColor(item)) + '20', borderLeftColor: getItemColor(item) }]}
                onPress={() => openDetail(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.allDayItemText, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <View style={[styles.typeBadge, { backgroundColor: (TYPE_COLORS[item.type] || '#3b82f6') + '20' }]}>
                  <Text style={[styles.typeBadgeText, { color: TYPE_COLORS[item.type] || '#3b82f6' }]}>{TYPE_LABELS[item.type] || item.type}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[styles.timelineContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {hours.map(h => (
            <View key={h} style={[styles.hourRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.hourLabel, { color: colors.secondary }]}>{formatHourLabel(h)}</Text>
              <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
            </View>
          ))}

          {timedItems.map(item => {
            const itemStartHour = parseTimeToHour(item.startTime!);
            const itemEndHour = parseTimeToHour(item.endTime!);
            const clampedStart = Math.max(itemStartHour, startHour);
            const clampedEnd = Math.min(itemEndHour, endHour + 1);
            if (clampedEnd <= clampedStart) return null;

            const top = (clampedStart - startHour) * HOUR_HEIGHT;
            const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT - 2, 20);
            const itemColor = getItemColor(item);

            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.timeBlock, { top, height, backgroundColor: itemColor + '30', borderLeftColor: itemColor, left: 56 }]}
                onPress={() => openDetail(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timeBlockName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                {height > 30 && (
                  <Text style={[styles.timeBlockTime, { color: colors.secondary }]}>
                    {item.startTime} - {item.endTime}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  };

  const renderCalendarView = () => {
    return (
      <ScrollView
        style={styles.flex1}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {renderCalendarModeToggle()}
        </View>
        {calendarMode === 'month' && renderMonthView()}
        {calendarMode === 'week' && renderWeekView()}
        {calendarMode === 'day' && renderDayView()}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderDetailSheet = () => {
    if (!selectedItem) return null;
    const typeColor = TYPE_COLORS[selectedItem.type] || '#3b82f6';
    const statusColor = STATUS_COLORS[detailStatus] || '#94a3b8';

    return (
      <Modal visible={showDetailSheet} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
          <View style={styles.detailOverlay}>
            <View style={[styles.detailContainer, { backgroundColor: colors.card }]}>
              <View style={[styles.detailHandle, { backgroundColor: colors.border }]} />
              <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false}>
                <View style={styles.detailHeaderRow}>
                  <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedItem.name}</Text>
                  <TouchableOpacity onPress={() => setShowDetailSheet(false)}>
                    <Ionicons name="close-circle" size={28} color={colors.secondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailBadgesRow}>
                  <View style={[styles.typeBadge, { backgroundColor: typeColor + '20' }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor }]}>{TYPE_LABELS[selectedItem.type] || selectedItem.type}</Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[styles.typeBadgeText, { color: statusColor }]}>{STATUS_LABELS[detailStatus] || detailStatus}</Text>
                  </View>
                  {selectedItem.priority && (
                    <View style={[styles.typeBadge, { backgroundColor: selectedItem.priority === 'urgent' ? '#ef444420' : selectedItem.priority === 'high' ? '#f59e0b20' : colors.border }]}>
                      <Text style={[styles.typeBadgeText, { color: selectedItem.priority === 'urgent' ? '#ef4444' : selectedItem.priority === 'high' ? '#f59e0b' : colors.secondary }]}>
                        {selectedItem.priority.charAt(0).toUpperCase() + selectedItem.priority.slice(1)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={[styles.detailInfoSection, { borderColor: colors.border }]}>
                  <View style={styles.detailInfoRow}>
                    <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                    <Text style={[styles.detailInfoLabel, { color: colors.secondary }]}>Dates</Text>
                    <Text style={[styles.detailInfoValue, { color: colors.text }]}>{formatDateRange(selectedItem.startDate, selectedItem.endDate)}</Text>
                  </View>
                  {selectedItem.assignedToName && (
                    <View style={styles.detailInfoRow}>
                      <Ionicons name="person-outline" size={16} color={colors.secondary} />
                      <Text style={[styles.detailInfoLabel, { color: colors.secondary }]}>Assigned</Text>
                      <Text style={[styles.detailInfoValue, { color: colors.text }]}>{selectedItem.assignedToName}</Text>
                    </View>
                  )}
                  {selectedItem.groupName && (
                    <View style={styles.detailInfoRow}>
                      <Ionicons name="layers-outline" size={16} color={colors.secondary} />
                      <Text style={[styles.detailInfoLabel, { color: colors.secondary }]}>Group</Text>
                      <Text style={[styles.detailInfoValue, { color: colors.text }]}>{selectedItem.groupName}</Text>
                    </View>
                  )}
                  {selectedItem.description && (
                    <View style={[styles.detailInfoRow, { alignItems: 'flex-start' }]}>
                      <Ionicons name="document-text-outline" size={16} color={colors.secondary} style={{ marginTop: 2 }} />
                      <Text style={[styles.detailInfoLabel, { color: colors.secondary }]}>Description</Text>
                      <Text style={[styles.detailInfoValue, { color: colors.text, flex: 1 }]}>{selectedItem.description}</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Update</Text>

                  <Text style={[styles.fieldLabel, { color: colors.secondary }]}>Status</Text>
                  <TouchableOpacity
                    style={[styles.fieldPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    onPress={() => setShowStatusPicker(!showStatusPicker)}
                  >
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.fieldPickerText, { color: colors.text }]}>{STATUS_LABELS[detailStatus] || detailStatus}</Text>
                    <Ionicons name={showStatusPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary} />
                  </TouchableOpacity>

                  {showStatusPicker && (
                    <View style={[styles.inlineStatusList, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      {Object.entries(STATUS_LABELS).map(([key, label]) => {
                        const sc = STATUS_COLORS[key] || '#94a3b8';
                        const isSelected = detailStatus === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.inlineStatusOption,
                              { borderBottomColor: colors.border },
                              isSelected && { backgroundColor: sc + '15' },
                            ]}
                            onPress={() => {
                              setDetailStatus(key);
                              setShowStatusPicker(false);
                            }}
                          >
                            <View style={[styles.statusDot, { backgroundColor: sc }]} />
                            <Text style={[styles.inlineStatusText, { color: colors.text }]}>{label}</Text>
                            {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  <Text style={[styles.fieldLabel, { color: colors.secondary }]}>Progress ({detailProgress}%)</Text>
                  <View style={styles.progressInputRow}>
                    <View style={[styles.progressTrackLarge, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFillLarge, { width: `${Math.min(parseInt(detailProgress) || 0, 100)}%`, backgroundColor: statusColor }]} />
                    </View>
                    <TextInput
                      style={[styles.progressInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                      value={detailProgress}
                      onChangeText={t => { const n = t.replace(/[^0-9]/g, ''); setDetailProgress(n ? String(Math.min(parseInt(n), 100)) : '0'); }}
                      keyboardType="number-pad"
                      maxLength={3}
                    />
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.secondary }]}>Notes</Text>
                  <TextInput
                    style={[styles.notesInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    value={detailNotes}
                    onChangeText={setDetailNotes}
                    multiline
                    numberOfLines={3}
                    placeholder="Add notes..."
                    placeholderTextColor={colors.secondary}
                  />
                </View>

                <View style={[styles.detailEditSection, { borderColor: colors.border }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Activity Notes</Text>
                  {loadingNotes ? (
                    <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 12 }} />
                  ) : (
                    activityNotes.map(note => (
                      <View key={note.id} style={[styles.activityNote, { borderColor: colors.border }]}>
                        <View style={styles.noteHeader}>
                          <Text style={[styles.noteUser, { color: colors.text }]}>{note.userName || 'System'}</Text>
                          <Text style={[styles.noteDate, { color: colors.secondary }]}>{formatNoteDate(note.createdAt)}</Text>
                        </View>
                        <Text style={[styles.noteContent, { color: note.type === 'system' ? colors.secondary : colors.text }]}>{note.content}</Text>
                      </View>
                    ))
                  )}
                  {activityNotes.length === 0 && !loadingNotes && (
                    <Text style={[styles.noNotesText, { color: colors.secondary }]}>No activity notes yet</Text>
                  )}
                  <View style={styles.addNoteRow}>
                    <TextInput
                      style={[styles.addNoteInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                      value={newNoteText}
                      onChangeText={setNewNoteText}
                      placeholder="Add a note..."
                      placeholderTextColor={colors.secondary}
                    />
                    <TouchableOpacity
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
                    onPress={() => setShowDetailSheet(false)}
                  >
                    <Text style={[styles.actionBtnText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.actionBtnText, { color: '#fff' }]}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderProjectPickerModal = () => (
    <Modal visible={showProjectPicker} animationType="slide" transparent>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerContainer, { backgroundColor: colors.card }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Select Project</Text>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
              <Ionicons name="close" size={24} color={colors.secondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={getSortedProjectItems(projects)}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              if (item.isHeader) {
                return (
                  <View style={[styles.pickerSectionHeader, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                    <Text style={[styles.pickerSectionText, { color: colors.secondary }]}>{item.label}</Text>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => { setSelectedProjectId(item.id); setShowProjectPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>{item.label}</Text>
                  {selectedProjectId === item.id && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  if (loading && projects.length === 0) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.projectPickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
          onPress={() => setShowProjectPicker(true)}
        >
          <Ionicons name="business-outline" size={16} color={colors.accent} />
          <Text style={[styles.projectPickerText, { color: selectedProjectId ? colors.text : colors.secondary }]} numberOfLines={1}>
            {getSelectedProjectLabel()}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.secondary} />
        </TouchableOpacity>

        <View style={[styles.viewToggle, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          {(['list', 'gantt', 'calendar'] as ViewMode[]).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[styles.viewToggleBtn, viewMode === mode && { backgroundColor: colors.accent }]}
              onPress={() => setViewMode(mode)}
            >
              <Ionicons
                name={mode === 'list' ? 'list-outline' : mode === 'gantt' ? 'bar-chart-outline' : 'calendar-outline'}
                size={16}
                color={viewMode === mode ? '#fff' : colors.secondary}
              />
              <Text style={[styles.viewToggleText, { color: viewMode === mode ? '#fff' : colors.secondary }]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!selectedProjectId ? (
        <View style={[styles.flex1, styles.center]}>
          <Ionicons name="folder-open-outline" size={56} color={colors.secondary} />
          <Text style={[styles.promptText, { color: colors.secondary }]}>Select a project to view its schedule</Text>
          <TouchableOpacity
            style={[styles.selectProjectBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowProjectPicker(true)}
          >
            <Text style={styles.selectProjectBtnText}>Select Project</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={[styles.flex1, styles.center]}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <>
          {viewMode === 'list' && renderListView()}
          {viewMode === 'gantt' && renderGanttView()}
          {viewMode === 'calendar' && renderCalendarView()}
        </>
      )}

      {renderProjectPickerModal()}
      {renderDetailSheet()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1 },
  projectPickerBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, gap: 8 },
  projectPickerText: { flex: 1, fontSize: 14, fontWeight: '500' },

  viewToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  viewToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 4 },
  viewToggleText: { fontSize: 12, fontWeight: '600' },

  promptText: { fontSize: 16, marginTop: 12, textAlign: 'center' },
  selectProjectBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  selectProjectBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  listContent: { padding: 16, paddingBottom: 40 },
  groupSection: { marginBottom: 20 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { fontSize: 15, fontWeight: '700' },
  groupCount: { fontSize: 12, fontWeight: '500' },

  itemCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  itemColorBar: { width: 4 },
  itemContent: { flex: 1, padding: 12 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemName: { fontSize: 14, fontWeight: '600', flex: 1 },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  priorityText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },
  itemDateText: { fontSize: 12 },
  itemAssignRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 4 },
  itemAssignText: { fontSize: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 11, fontWeight: '500', width: 32, textAlign: 'right' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, marginTop: 12 },

  ganttContainer: { flexDirection: 'row' },
  ganttNamesCol: { width: NAME_COL_WIDTH, zIndex: 1 },
  ganttHeaderCell: { justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1 },
  ganttHeaderText: { fontSize: 11, fontWeight: '600' },
  ganttNameRow: { height: GANTT_ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  ganttNameText: { fontSize: 11, fontWeight: '500' },
  ganttMonthRow: { flexDirection: 'row', height: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  ganttMonthCell: { justifyContent: 'center', alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth },
  ganttMonthText: { fontSize: 10, fontWeight: '600' },
  ganttDateRow: { flexDirection: 'row', height: 32, borderBottomWidth: 1 },
  ganttDateCell: { width: DAY_COL_WIDTH, justifyContent: 'center', alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth },
  ganttDateText: { fontSize: 9, fontWeight: '500' },
  ganttBarRow: { height: GANTT_ROW_HEIGHT, position: 'relative', borderBottomWidth: StyleSheet.hairlineWidth },
  ganttGridLine: { position: 'absolute', top: 0, bottom: 0, width: 0, borderRightWidth: StyleSheet.hairlineWidth },
  ganttBar: { position: 'absolute', top: 6, height: GANTT_ROW_HEIGHT - 12, borderRadius: 4, justifyContent: 'center', paddingHorizontal: 4 },
  ganttBarText: { color: '#fff', fontSize: 9, fontWeight: '600' },

  calModeToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 4 },
  calModeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 },
  calModeText: { fontSize: 12, fontWeight: '600' },

  calendarCard: { margin: 16, marginBottom: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  calendarNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarTitle: { fontSize: 16, fontWeight: '700' },
  calendarDayNames: { flexDirection: 'row' },
  calendarDayNameCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  calendarDayNameText: { fontSize: 11, fontWeight: '600' },
  calendarRow: { flexDirection: 'row' },
  calendarCell: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, minHeight: 40, justifyContent: 'center' },
  calendarDayText: { fontSize: 13, fontWeight: '500' },
  dotsRow: { flexDirection: 'row', marginTop: 2, gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  selectedDaySection: { paddingHorizontal: 16, paddingBottom: 40 },
  selectedDayTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  noDayItems: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  weekRow: { flexDirection: 'row', gap: 2 },
  weekDayCol: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, minHeight: 64, justifyContent: 'center' },
  weekDayName: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
  weekDayNum: { fontSize: 16, fontWeight: '600' },

  allDaySection: { marginHorizontal: 16, marginBottom: 8 },
  allDayLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  allDayItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 3, borderRadius: 6, marginBottom: 4 },
  allDayItemText: { fontSize: 13, fontWeight: '500', flex: 1, marginRight: 8 },

  timelineContainer: { marginHorizontal: 16, borderWidth: 1, borderRadius: 12, padding: 0, position: 'relative', overflow: 'hidden' },
  hourRow: { height: HOUR_HEIGHT, flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth },
  hourLabel: { width: 52, fontSize: 10, fontWeight: '500', paddingTop: 4, paddingLeft: 8 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, marginTop: 12 },
  timeBlock: { position: 'absolute', right: 8, borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center' },
  timeBlockName: { fontSize: 12, fontWeight: '600' },
  timeBlockTime: { fontSize: 10, marginTop: 1 },

  detailOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  detailContainer: { maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20 },
  detailHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 },
  detailTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  detailBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
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
