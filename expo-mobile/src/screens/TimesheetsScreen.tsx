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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest, API_BASE_URL } from '../services/api';
import { addToQueue, syncQueue, getQueueCount, isOnline, getQueue, clearFailedActions, addSyncListener } from '../services/offlineQueue';

interface Timesheet {
  id: string;
  projectId: string;
  userId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  duration: string;
  breakDuration: string;
  description: string | null;
  hourlyRate: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  isActive: boolean;
  clockInTime: string | null;
  createdAt: string;
  costCodeId: string | null;
}

interface Project {
  id: string;
  name: string;
  jobNumber?: string | null;
  currentSystemPhase?: string | null;
}

interface CostCode {
  id: string;
  code: string;
  title: string;
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekBounds(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday, startStr: toLocalDateStr(monday), endStr: toLocalDateStr(sunday) };
}

function formatShortDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDayDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function generateTimeOptions() {
  const times: { value: string; label: string }[] = [];
  for (let i = 0; i < 96; i++) {
    const adjustedIndex = (i + 26) % 96;
    const totalMinutes = adjustedIndex * 15;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const value = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const label = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    times.push({ value, label });
  }
  return times;
}

const TIME_OPTIONS = generateTimeOptions();

const BREAK_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'None' },
  { value: '0.25', label: '15 min' },
  { value: '0.5', label: '30 min' },
  { value: '0.75', label: '45 min' },
  { value: '1', label: '1 hr' },
  { value: '1.25', label: '1 hr 15 min' },
  { value: '1.5', label: '1 hr 30 min' },
  { value: '1.75', label: '1 hr 45 min' },
  { value: '2', label: '2 hrs' },
  { value: '2.5', label: '2 hrs 30 min' },
  { value: '3', label: '3 hrs' },
  { value: '3.5', label: '3 hrs 30 min' },
  { value: '4', label: '4 hrs' },
];

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

function calculateDuration(start: string, end: string, breakDur: string): string {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let minutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (minutes < 0) minutes += 24 * 60;
  const hours = (minutes / 60) - parseFloat(breakDur || '0');
  return Math.max(0, Math.round(hours * 4) / 4).toString();
}

export default function TimesheetsScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [activeTimesheet, setActiveTimesheet] = useState<Timesheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');

  const [clockInProjectId, setClockInProjectId] = useState('');
  const [clockInCostCodeId, setClockInCostCodeId] = useState('');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showClockInCostCodePicker, setShowClockInCostCodePicker] = useState(false);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const [showLogSheet, setShowLogSheet] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formProjectId, setFormProjectId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('07:00');
  const [formEndTime, setFormEndTime] = useState('15:30');
  const [formBreakDuration, setFormBreakDuration] = useState('0');
  const [formHourlyRate, setFormHourlyRate] = useState('');
  const [formCostCodeId, setFormCostCodeId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showTimePicker, setShowTimePicker] = useState<'start' | 'end' | null>(null);
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [showFormProjectPicker, setShowFormProjectPicker] = useState(false);
  const [showCostCodePicker, setShowCostCodePicker] = useState(false);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', green: '#22c55e', red: '#ef4444', inputBg: '#0f172a' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', green: '#16a34a', red: '#dc2626', inputBg: '#f1f5f9' };

  const fetchData = useCallback(async () => {
    try {
      const [ts, prj, cc, active] = await Promise.all([
        apiFetch<Timesheet[]>('/api/timesheets').catch(() => []),
        apiFetch<Project[]>('/api/projects').catch(() => []),
        apiFetch<CostCode[]>('/api/cost-codes?timesheets=true').catch(() => []),
        apiFetch<Timesheet | null>('/api/timesheets/active').catch(() => null),
      ]);
      setTimesheets(ts || []);
      setProjects(prj || []);
      setCostCodes(cc || []);
      setActiveTimesheet(active || null);
    } catch (e) {
      console.error('Failed to fetch timesheet data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!activeTimesheet?.clockInTime) {
      setElapsedTime('00:00:00');
      return;
    }
    const updateElapsed = () => {
      const clockIn = new Date(activeTimesheet.clockInTime!);
      const now = new Date();
      const seconds = Math.floor((now.getTime() - clockIn.getTime()) / 1000);
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      setElapsedTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeTimesheet?.clockInTime]);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setNetworkOnline(online);
      if (online) {
        handleSync();
      }
    });
    const unsubscribeQueue = addSyncListener(() => {
      getQueueCount().then(setPendingQueueCount);
    });
    getQueueCount().then(setPendingQueueCount);
    return () => {
      unsubscribeNet();
      unsubscribeQueue();
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { synced, failed } = await syncQueue();
      if (synced > 0) {
        await fetchData();
      }
      if (failed > 0) {
        Alert.alert('Sync Issue', `${failed} action(s) could not be synced. They may need to be re-entered.`);
        await clearFailedActions();
      }
    } catch {
    } finally {
      setSyncing(false);
      getQueueCount().then(setPendingQueueCount);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    if (await isOnline()) {
      await handleSync();
    }
    setRefreshing(false);
  }, [fetchData]);

  const handleClockIn = async () => {
    if (!clockInProjectId || !clockInCostCodeId) {
      Alert.alert('Missing Fields', 'Please select a project and cost code to clock in.');
      return;
    }
    setClockingIn(true);
    let networkError = false;
    try {
      const online = await isOnline();
      if (!online) {
        await addToQueue({
          type: 'clock-in',
          payload: { projectId: clockInProjectId, costCodeId: clockInCostCodeId },
        });
        Alert.alert('Saved Offline', 'Your clock-in has been queued and will sync when you have a connection.');
        setClockInProjectId('');
        setClockInCostCodeId('');
        return;
      }

      let res: Response;
      try {
        res = await apiRequest('/api/timesheets/clock-in', 'POST', { projectId: clockInProjectId, costCodeId: clockInCostCodeId });
      } catch {
        networkError = true;
        throw new Error('Network error');
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as any).error || (errData as any).message || `Server error (${res.status})`;
        throw new Error(msg);
      }

      await fetchData();
      setClockInProjectId('');
      setClockInCostCodeId('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'An unknown error occurred';
      if (networkError) {
        await addToQueue({
          type: 'clock-in',
          payload: { projectId: clockInProjectId, costCodeId: clockInCostCodeId },
        });
        Alert.alert('Saved Offline', 'Clock-in saved and will sync when connection is restored.');
        setClockInProjectId('');
        setClockInCostCodeId('');
      } else {
        Alert.alert('Clock-in Failed', msg);
      }
    } finally {
      setClockingIn(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeTimesheet) return;
    setClockingOut(true);
    let networkError = false;
    try {
      const online = await isOnline();
      if (!online) {
        await addToQueue({
          type: 'clock-out',
          payload: { timesheetId: activeTimesheet.id },
        });
        Alert.alert('Saved Offline', 'Your clock-out has been queued and will sync when you have a connection.');
        return;
      }

      let res: Response;
      try {
        res = await apiRequest('/api/timesheets/clock-out', 'POST', { timesheetId: activeTimesheet.id });
      } catch {
        networkError = true;
        throw new Error('Network error');
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as any).error || (errData as any).message || `Server error (${res.status})`;
        throw new Error(msg);
      }

      await fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'An unknown error occurred';
      if (networkError) {
        await addToQueue({
          type: 'clock-out',
          payload: { timesheetId: activeTimesheet.id },
        });
        Alert.alert('Saved Offline', 'Clock-out saved and will sync when connection is restored.');
      } else {
        Alert.alert('Clock-out Failed', msg);
      }
    } finally {
      setClockingOut(false);
    }
  };

  const resetForm = () => {
    setFormProjectId('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormStartTime('07:00');
    setFormEndTime('15:30');
    setFormBreakDuration('0');
    setFormHourlyRate('');
    setFormCostCodeId('');
    setFormDescription('');
    setIsEditMode(false);
    setEditingId(null);
  };

  const openLogSheet = () => {
    resetForm();
    setShowLogSheet(true);
  };

  const openEditSheet = async (ts: Timesheet) => {
    setShowDetail(false);
    setIsEditMode(true);
    setEditingId(ts.id);
    setFormProjectId(ts.projectId);
    setFormDate(new Date(ts.date).toISOString().split('T')[0]);
    setFormStartTime(ts.startTime || '07:00');
    setFormEndTime(ts.endTime || '15:30');
    setFormBreakDuration(ts.breakDuration || '0');
    setFormHourlyRate(ts.hourlyRate || '');
    setFormDescription(ts.description || '');

    try {
      const existingCostCodes = await apiFetch<any[]>(`/api/timesheets/${ts.id}/cost-codes`);
      if (existingCostCodes && existingCostCodes.length > 0) {
        setFormCostCodeId(existingCostCodes[0].costCodeId || '');
      } else {
        setFormCostCodeId(ts.costCodeId || '');
      }
    } catch {
      setFormCostCodeId(ts.costCodeId || '');
    }

    setShowLogSheet(true);
  };

  const handleSubmitTimesheet = async () => {
    if (!formProjectId) {
      Alert.alert('Missing Project', 'Please select a project.');
      return;
    }
    if (!formCostCodeId) {
      Alert.alert('Missing Cost Code', 'Please select a cost code.');
      return;
    }

    setSubmitting(true);
    try {
      const duration = calculateDuration(formStartTime, formEndTime, formBreakDuration);

      const body: any = {
        projectId: formProjectId,
        date: new Date(formDate).toISOString(),
        startTime: formStartTime,
        endTime: formEndTime,
        duration,
        breakDuration: formBreakDuration,
        hourlyRate: formHourlyRate,
        description: formDescription,
        costCodeId: formCostCodeId,
        status: 'draft',
      };

      const online = await isOnline();

      if (!online && !isEditMode) {
        await addToQueue({ type: 'log-hours', payload: body });
        Alert.alert('Saved Offline', 'Your timesheet entry has been queued and will sync when you have a connection.');
        setShowLogSheet(false);
        resetForm();
        return;
      }

      if (isEditMode && editingId) {
        await apiRequest(`/api/timesheets/${editingId}`, 'PATCH', body);
        if (formCostCodeId) {
          try {
            const existing = await apiFetch<any[]>(`/api/timesheets/${editingId}/cost-codes`);
            for (const cc of (existing || [])) {
              await apiRequest(`/api/timesheets/cost-codes/${cc.id}`, 'DELETE', {});
            }
          } catch {}
          await apiRequest(`/api/timesheets/${editingId}/cost-codes`, 'POST', {
            costCodeId: formCostCodeId,
            duration,
            hourlyRate: formHourlyRate,
            total: (parseFloat(duration) * parseFloat(formHourlyRate || '0')).toFixed(2),
          });
        }
      } else {
        const res = await apiRequest('/api/timesheets', 'POST', body);
        const created = await res.json();
        if (formCostCodeId && created.id) {
          await apiRequest(`/api/timesheets/${created.id}/cost-codes`, 'POST', {
            costCodeId: formCostCodeId,
            duration,
            hourlyRate: formHourlyRate,
            total: (parseFloat(duration) * parseFloat(formHourlyRate || '0')).toFixed(2),
          });
        }
      }

      setShowLogSheet(false);
      resetForm();
      await fetchData();
    } catch (e: any) {
      if (!isEditMode) {
        const duration = calculateDuration(formStartTime, formEndTime, formBreakDuration);
        await addToQueue({
          type: 'log-hours',
          payload: {
            projectId: formProjectId,
            date: new Date(formDate).toISOString(),
            startTime: formStartTime,
            endTime: formEndTime,
            duration,
            breakDuration: formBreakDuration,
            hourlyRate: formHourlyRate,
            description: formDescription,
            costCodeId: formCostCodeId,
            status: 'draft',
          },
        });
        Alert.alert('Saved Offline', 'Timesheet saved and will sync when connection is restored.');
        setShowLogSheet(false);
        resetForm();
      } else {
        Alert.alert('Error', 'Could not save timesheet. Please try again when online.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTimesheet = async (id: string) => {
    Alert.alert('Delete Timesheet', 'Are you sure you want to delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiRequest(`/api/timesheets/${id}`, 'DELETE', {});
            setShowDetail(false);
            setSelectedTimesheet(null);
            await fetchData();
          } catch {
            Alert.alert('Error', 'Could not delete timesheet.');
          }
        },
      },
    ]);
  };

  const { start: weekStart, end: weekEnd, startStr: weekStartStr, endStr: weekEndStr } = getWeekBounds(weekOffset);
  const filteredTimesheets = timesheets
    .filter(ts => {
      // Compare using local calendar dates to avoid UTC timezone boundary mismatches.
      // A timesheet created Sunday evening AEST must not fall into the previous week
      // just because its UTC timestamp crosses midnight into Saturday/Sunday UTC.
      const localDateStr = toLocalDateStr(new Date(ts.date));
      return localDateStr >= weekStartStr && localDateStr <= weekEndStr;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalHours = filteredTimesheets.reduce((sum, ts) => sum + parseFloat(ts.duration || '0'), 0);

  const getProjectName = (pid: string) => {
    const p = projects.find(p => p.id === pid);
    if (!p) return 'Unknown';
    return p.jobNumber ? `${p.jobNumber} - ${p.name}` : p.name;
  };
  const getCostCodeName = (ccId: string | null) => {
    if (!ccId) return null;
    const cc = costCodes.find(c => c.id === ccId);
    return cc ? `${cc.code} - ${cc.title}` : null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return { bg: isDark ? '#374151' : '#f3f4f6', text: isDark ? '#d1d5db' : '#4b5563' };
      case 'submitted': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: isDark ? '#93c5fd' : '#1d4ed8' };
      case 'approved': return { bg: isDark ? '#14532d' : '#dcfce7', text: isDark ? '#86efac' : '#15803d' };
      case 'rejected': return { bg: isDark ? '#7f1d1d' : '#fee2e2', text: isDark ? '#fca5a5' : '#b91c1c' };
      default: return { bg: colors.border, text: colors.secondary };
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const renderPickerModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    items: { id: string; label: string; isHeader?: boolean }[],
    selectedId: string,
    onSelect: (id: string) => void,
  ) => (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.pickerOverlay]}>
        <View style={[styles.pickerContainer, { backgroundColor: colors.card }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.secondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
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
                  onPress={() => { onSelect(item.id); onClose(); }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>{item.label}</Text>
                  {selectedId === item.id && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.secondary }]}>No options available</Text>}
          />
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Timesheets</Text>
      </View>

      {!networkOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: '#fef3c7' }]}>
          <Ionicons name="cloud-offline" size={16} color="#92400e" />
          <Text style={{ color: '#92400e', fontSize: 13, marginLeft: 6, flex: 1 }}>
            You're offline. Actions will be saved and synced when connected.
          </Text>
        </View>
      )}

      {pendingQueueCount > 0 && networkOnline && (
        <TouchableOpacity
          style={[styles.offlineBanner, { backgroundColor: '#dbeafe' }]}
          onPress={handleSync}
          disabled={syncing}
        >
          <Ionicons name={syncing ? 'sync' : 'cloud-upload'} size={16} color="#1e40af" />
          <Text style={{ color: '#1e40af', fontSize: 13, marginLeft: 6, flex: 1 }}>
            {syncing ? 'Syncing...' : `${pendingQueueCount} pending action(s) to sync`}
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Clock In/Out */}
        <View style={[
          styles.clockCard,
          {
            backgroundColor: activeTimesheet ? (isDark ? '#052e16' : '#f0fdf4') : colors.card,
            borderColor: activeTimesheet ? colors.green : colors.border,
            borderWidth: activeTimesheet ? 2 : 1,
          },
        ]}>
          {activeTimesheet ? (
            <>
              <View style={styles.clockHeader}>
                <View style={styles.clockStatusRow}>
                  <View style={[styles.pulseDot, { backgroundColor: colors.green }]} />
                  <Text style={[styles.clockLabel, { color: colors.green }]}>Clocked In</Text>
                </View>
                <Text style={[styles.clockProject, { color: colors.secondary }]}>
                  {getProjectName(activeTimesheet.projectId)}
                </Text>
              </View>
              <Text style={[styles.timerText, { color: colors.green }]}>{elapsedTime}</Text>
              <Text style={[styles.clockStarted, { color: colors.secondary }]}>
                Started {activeTimesheet.clockInTime ? formatTime12h(new Date(activeTimesheet.clockInTime).toTimeString().slice(0, 5)) : ''}
              </Text>
              <TouchableOpacity
                style={[styles.clockButton, { backgroundColor: colors.red, opacity: clockingOut ? 0.7 : 1 }]}
                onPress={handleClockOut}
                disabled={clockingOut}
              >
                {clockingOut ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="stop" size={22} color="#fff" />
                    <Text style={styles.clockButtonText}>Clock Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.clockInRow}>
                <Ionicons name="time-outline" size={18} color={colors.secondary} />
                <Text style={[styles.clockInLabel, { color: colors.secondary }]}>Select a project and clock in</Text>
              </View>
              <TouchableOpacity
                style={[styles.projectSelector, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => setShowProjectPicker(true)}
              >
                <Text style={[styles.projectSelectorText, { color: clockInProjectId ? colors.text : colors.secondary }]}>
                  {clockInProjectId ? getProjectName(clockInProjectId) : 'Select a project...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.secondary} />
              </TouchableOpacity>
              {clockInProjectId ? (
                <TouchableOpacity
                  style={[styles.projectSelector, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={() => setShowClockInCostCodePicker(true)}
                >
                  <Text style={[styles.projectSelectorText, { color: clockInCostCodeId ? colors.text : colors.secondary }]}>
                    {clockInCostCodeId ? getCostCodeName(clockInCostCodeId) : 'Select cost code...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.secondary} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.clockButton, { backgroundColor: (clockInProjectId && clockInCostCodeId) ? colors.green : colors.border, opacity: clockingIn ? 0.7 : 1 }]}
                onPress={handleClockIn}
                disabled={!clockInProjectId || !clockInCostCodeId || clockingIn}
              >
                {clockingIn ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="play" size={22} color={(clockInProjectId && clockInCostCodeId) ? '#fff' : colors.secondary} />
                    <Text style={[styles.clockButtonText, { color: (clockInProjectId && clockInCostCodeId) ? '#fff' : colors.secondary }]}>Clock In</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Week Navigation */}
        <View style={[styles.weekNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={styles.weekArrow}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.weekCenter}>
            <Text style={[styles.weekRange, { color: colors.text }]}>
              {formatShortDate(weekStart)} - {formatShortDate(weekEnd)}
            </Text>
            <Text style={[styles.weekHours, { color: colors.secondary }]}>
              {totalHours.toFixed(1)} hours this week
            </Text>
          </View>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={styles.weekArrow}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Timesheet Entries */}
        {filteredTimesheets.map(ts => {
          const statusColor = getStatusColor(ts.status);
          return (
            <TouchableOpacity
              key={ts.id}
              style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedTimesheet(ts); setShowDetail(true); }}
              activeOpacity={0.7}
            >
              <View style={styles.entryTop}>
                <View style={styles.entryLeft}>
                  <Text style={[styles.entryDate, { color: colors.text }]}>{formatDayDate(ts.date)}</Text>
                  <Text style={[styles.entryProject, { color: colors.secondary }]} numberOfLines={1}>
                    {getProjectName(ts.projectId)}
                  </Text>
                </View>
                <View style={styles.entryRight}>
                  <Text style={[styles.entryHours, { color: colors.accent }]}>{parseFloat(ts.duration || '0').toFixed(1)}h</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                    <Text style={[styles.statusText, { color: statusColor.text }]}>
                      {ts.status.charAt(0).toUpperCase() + ts.status.slice(1)}
                    </Text>
                  </View>
                </View>
              </View>
              {ts.startTime && ts.endTime && (
                <Text style={[styles.entryTime, { color: colors.secondary }]}>
                  {formatTime12h(ts.startTime)} - {formatTime12h(ts.endTime)}
                </Text>
              )}
              {ts.description && (
                <Text style={[styles.entryDesc, { color: colors.secondary }]} numberOfLines={1}>
                  {ts.description}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        {filteredTimesheets.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.secondary }]}>No timesheets this week</Text>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent }]}
        onPress={openLogSheet}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Project Picker for Clock In */}
      {renderPickerModal(
        showProjectPicker,
        () => setShowProjectPicker(false),
        'Select Project',
        getSortedProjectItems(projects),
        clockInProjectId,
        setClockInProjectId,
      )}

      {/* Detail Modal */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={[styles.detailContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Timesheet Detail</Text>
              <TouchableOpacity onPress={() => setShowDetail(false)}>
                <Ionicons name="close" size={24} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            {selectedTimesheet && (
              <ScrollView style={styles.detailScroll}>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.secondary }]}>Date</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formatDayDate(selectedTimesheet.date)}</Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.secondary }]}>Project</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{getProjectName(selectedTimesheet.projectId)}</Text>
                </View>
                {selectedTimesheet.startTime && selectedTimesheet.endTime && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, { color: colors.secondary }]}>Time</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatTime12h(selectedTimesheet.startTime)} - {formatTime12h(selectedTimesheet.endTime)}
                    </Text>
                  </View>
                )}
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.secondary }]}>Duration</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{parseFloat(selectedTimesheet.duration || '0').toFixed(1)} hours</Text>
                </View>
                {selectedTimesheet.breakDuration && parseFloat(selectedTimesheet.breakDuration) > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, { color: colors.secondary }]}>Break</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTimesheet.breakDuration} hours</Text>
                  </View>
                )}
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.secondary }]}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedTimesheet.status).bg, alignSelf: 'flex-start' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(selectedTimesheet.status).text }]}>
                      {selectedTimesheet.status.charAt(0).toUpperCase() + selectedTimesheet.status.slice(1)}
                    </Text>
                  </View>
                </View>
                {selectedTimesheet.description && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, { color: colors.secondary }]}>Description</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTimesheet.description}</Text>
                  </View>
                )}

                <View style={styles.detailActions}>
                  {selectedTimesheet.status === 'draft' && (
                    <>
                      <TouchableOpacity
                        style={[styles.detailButton, { backgroundColor: colors.accent }]}
                        onPress={() => openEditSheet(selectedTimesheet)}
                      >
                        <Ionicons name="pencil" size={18} color="#fff" />
                        <Text style={styles.detailButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.detailButton, { backgroundColor: colors.red }]}
                        onPress={() => handleDeleteTimesheet(selectedTimesheet.id)}
                      >
                        <Ionicons name="trash" size={18} color="#fff" />
                        <Text style={styles.detailButtonText}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Log Hours / Edit Modal */}
      <Modal visible={showLogSheet} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.pickerOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.logSheetContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                {isEditMode ? 'Edit Timesheet' : 'Log Hours'}
              </Text>
              <TouchableOpacity onPress={() => { setShowLogSheet(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
              {/* Project */}
              <Text style={[styles.formLabel, { color: colors.secondary }]}>Project</Text>
              <TouchableOpacity
                style={[styles.formPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => setShowFormProjectPicker(true)}
              >
                <Text style={[styles.formPickerText, { color: formProjectId ? colors.text : colors.secondary }]}>
                  {formProjectId ? getProjectName(formProjectId) : 'Select project...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.secondary} />
              </TouchableOpacity>

              {/* Date + Break row */}
              <View style={styles.dateBreakRow}>
                <View style={styles.dateCol}>
                  <Text style={[styles.formLabel, { color: colors.secondary }]}>Date</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    value={formDate}
                    onChangeText={setFormDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.secondary}
                  />
                </View>
                <View style={styles.breakCol}>
                  <Text style={[styles.formLabel, { color: colors.secondary }]}>Break</Text>
                  <TouchableOpacity
                    style={[styles.formPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    onPress={() => setShowBreakPicker(true)}
                  >
                    <Text style={[styles.formPickerText, { color: colors.text }]}>
                      {BREAK_OPTIONS.find(o => o.value === formBreakDuration)?.label ?? 'None'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.secondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Start / End time */}
              <View style={styles.timeRow}>
                <View style={styles.timeCol}>
                  <Text style={[styles.formLabel, { color: colors.secondary }]}>Start</Text>
                  <TouchableOpacity
                    style={[styles.formPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    onPress={() => setShowTimePicker('start')}
                  >
                    <Text style={[styles.formPickerText, { color: colors.text }]}>{formatTime12h(formStartTime)}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.timeCol}>
                  <Text style={[styles.formLabel, { color: colors.secondary }]}>End</Text>
                  <TouchableOpacity
                    style={[styles.formPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    onPress={() => setShowTimePicker('end')}
                  >
                    <Text style={[styles.formPickerText, { color: colors.text }]}>{formatTime12h(formEndTime)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.calcDuration, { color: colors.accent }]}>
                Calculated: {calculateDuration(formStartTime, formEndTime, formBreakDuration)} hours
              </Text>

              {/* Cost Code */}
              <Text style={[styles.formLabel, { color: colors.secondary }]}>Cost Code</Text>
              <TouchableOpacity
                style={[styles.formPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => setShowCostCodePicker(true)}
              >
                <Text style={[styles.formPickerText, { color: formCostCodeId ? colors.text : colors.secondary }]}>
                  {formCostCodeId ? getCostCodeName(formCostCodeId) || 'Selected' : 'Select cost code...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.secondary} />
              </TouchableOpacity>

              {/* Description */}
              <Text style={[styles.formLabel, { color: colors.secondary }]}>Description</Text>
              <TextInput
                style={[styles.formTextarea, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={3}
                placeholder="What did you work on?"
                placeholderTextColor={colors.secondary}
                textAlignVertical="top"
              />

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.accent, opacity: submitting ? 0.7 : 1 }]}
                onPress={handleSubmitTimesheet}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>{isEditMode ? 'Update' : 'Save Timesheet'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Time Picker Modal */}
      {renderPickerModal(
        showTimePicker !== null,
        () => setShowTimePicker(null),
        showTimePicker === 'start' ? 'Start Time' : 'End Time',
        TIME_OPTIONS.map(t => ({ id: t.value, label: t.label })),
        showTimePicker === 'start' ? formStartTime : formEndTime,
        (val) => {
          if (showTimePicker === 'start') setFormStartTime(val);
          else setFormEndTime(val);
        },
      )}

      {/* Form Project Picker */}
      {renderPickerModal(
        showFormProjectPicker,
        () => setShowFormProjectPicker(false),
        'Select Project',
        getSortedProjectItems(projects),
        formProjectId,
        setFormProjectId,
      )}

      {/* Break Picker */}
      {renderPickerModal(
        showBreakPicker,
        () => setShowBreakPicker(false),
        'Break Duration',
        BREAK_OPTIONS.map(o => ({ id: o.value, label: o.label })),
        formBreakDuration,
        setFormBreakDuration,
      )}

      {/* Cost Code Picker */}
      {renderPickerModal(
        showCostCodePicker,
        () => setShowCostCodePicker(false),
        'Select Cost Code',
        costCodes.map(cc => ({ id: cc.id, label: `${cc.code} - ${cc.title}` })),
        formCostCodeId,
        setFormCostCodeId,
      )}

      {/* Clock-In Cost Code Picker */}
      {renderPickerModal(
        showClockInCostCodePicker,
        () => setShowClockInCostCodePicker(false),
        'Select Cost Code',
        costCodes.map(cc => ({ id: cc.id, label: `${cc.code} - ${cc.title}` })),
        clockInCostCodeId,
        setClockInCostCodeId,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  clockCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  clockHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clockStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseDot: { width: 10, height: 10, borderRadius: 5 },
  clockLabel: { fontSize: 14, fontWeight: '600' },
  clockProject: { fontSize: 12 },
  timerText: { fontSize: 40, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginVertical: 8 },
  clockStarted: { fontSize: 13, marginBottom: 12 },
  clockButton: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  clockButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  clockInRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginBottom: 10 },
  clockInLabel: { fontSize: 13 },
  projectSelector: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  projectSelectorText: { fontSize: 15 },

  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  weekArrow: { padding: 6 },
  weekCenter: { flex: 1, alignItems: 'center' },
  weekRange: { fontSize: 14, fontWeight: '500' },
  weekHours: { fontSize: 12, marginTop: 2 },

  entryCard: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  entryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryLeft: { flex: 1 },
  entryRight: { alignItems: 'flex-end', gap: 4 },
  entryDate: { fontSize: 14, fontWeight: '600' },
  entryProject: { fontSize: 13, marginTop: 2 },
  entryHours: { fontSize: 16, fontWeight: '700' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '500' },
  entryTime: { fontSize: 12, marginTop: 6 },
  entryDesc: { fontSize: 12, marginTop: 4 },

  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 32 },

  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: { fontSize: 17, fontWeight: '600' },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerItemText: { fontSize: 15 },
  pickerSectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pickerSectionText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  detailContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  detailScroll: { padding: 16 },
  detailSection: { marginBottom: 16 },
  detailLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  detailValue: { fontSize: 15 },
  detailActions: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 },
  detailButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  logSheetContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  formScroll: {},
  formContent: { padding: 16, paddingBottom: 40 },
  formLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 14 },
  formInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  formTextarea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 80,
  },
  formPicker: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formPickerText: { fontSize: 15 },
  dateBreakRow: { flexDirection: 'row', gap: 12 },
  dateCol: { flex: 3 },
  breakCol: { flex: 2 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  calcDuration: { fontSize: 13, fontWeight: '500', marginTop: 8 },
  submitButton: {
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
