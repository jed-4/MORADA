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
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';

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
  return { start: monday, end: sunday };
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

  const [showLogSheet, setShowLogSheet] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formProjectId, setFormProjectId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('07:00');
  const [formEndTime, setFormEndTime] = useState('15:30');
  const [formBreakDuration, setFormBreakDuration] = useState('0.5');
  const [formHourlyRate, setFormHourlyRate] = useState('');
  const [formCostCodeId, setFormCostCodeId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [timeEntryMode, setTimeEntryMode] = useState<'time' | 'duration'>('time');
  const [formDuration, setFormDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showTimePicker, setShowTimePicker] = useState<'start' | 'end' | null>(null);
  const [showFormProjectPicker, setShowFormProjectPicker] = useState(false);
  const [showCostCodePicker, setShowCostCodePicker] = useState(false);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6', green: '#22c55e', red: '#ef4444', inputBg: '#0f172a' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb', green: '#16a34a', red: '#dc2626', inputBg: '#f1f5f9' };

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleClockIn = async () => {
    if (!clockInProjectId || !clockInCostCodeId) {
      Alert.alert('Missing Fields', 'Please select a project and cost code to clock in.');
      return;
    }
    setClockingIn(true);
    try {
      await apiRequest('/api/timesheets/clock-in', 'POST', { projectId: clockInProjectId, costCodeId: clockInCostCodeId || undefined });
      await fetchData();
      setClockInProjectId('');
      setClockInCostCodeId('');
    } catch (e: any) {
      Alert.alert('Error', 'Could not clock in. Please try again.');
    } finally {
      setClockingIn(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeTimesheet) return;
    setClockingOut(true);
    try {
      await apiRequest('/api/timesheets/clock-out', 'POST', { timesheetId: activeTimesheet.id });
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', 'Could not clock out. Please try again.');
    } finally {
      setClockingOut(false);
    }
  };

  const resetForm = () => {
    setFormProjectId('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormStartTime('07:00');
    setFormEndTime('15:30');
    setFormBreakDuration('0.5');
    setFormHourlyRate('');
    setFormCostCodeId('');
    setFormDescription('');
    setTimeEntryMode('time');
    setFormDuration('');
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
    setFormBreakDuration(ts.breakDuration || '0.5');
    setFormHourlyRate(ts.hourlyRate || '');
    setFormDescription(ts.description || '');
    setFormDuration(ts.duration || '');
    setTimeEntryMode(ts.startTime ? 'time' : 'duration');

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
      const duration = timeEntryMode === 'time'
        ? calculateDuration(formStartTime, formEndTime, formBreakDuration)
        : formDuration;

      const body: any = {
        projectId: formProjectId,
        date: new Date(formDate).toISOString(),
        startTime: timeEntryMode === 'time' ? formStartTime : null,
        endTime: timeEntryMode === 'time' ? formEndTime : null,
        duration,
        breakDuration: formBreakDuration,
        hourlyRate: formHourlyRate,
        description: formDescription,
        status: 'draft',
      };

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
      Alert.alert('Error', 'Could not save timesheet. Please try again.');
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

  const { start: weekStart, end: weekEnd } = getWeekBounds(weekOffset);
  const filteredTimesheets = timesheets
    .filter(ts => {
      const d = new Date(ts.date);
      return d >= weekStart && d <= weekEnd;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalHours = filteredTimesheets.reduce((sum, ts) => sum + parseFloat(ts.duration || '0'), 0);

  const getProjectName = (pid: string) => projects.find(p => p.id === pid)?.name || 'Unknown';
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
    items: { id: string; label: string }[],
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
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(item.id); onClose(); }}
              >
                <Text style={[styles.pickerItemText, { color: colors.text }]}>{item.label}</Text>
                {selectedId === item.id && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            )}
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
        <TouchableOpacity onPress={openLogSheet} style={[styles.addButton, { backgroundColor: colors.accent }]}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

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

      {/* Project Picker for Clock In */}
      {renderPickerModal(
        showProjectPicker,
        () => setShowProjectPicker(false),
        'Select Project',
        projects.map(p => ({ id: p.id, label: p.name })),
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

              {/* Date */}
              <Text style={[styles.formLabel, { color: colors.secondary }]}>Date</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={formDate}
                onChangeText={setFormDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.secondary}
              />

              {/* Time Entry Mode Toggle */}
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeButton, timeEntryMode === 'time' && { backgroundColor: colors.accent }]}
                  onPress={() => setTimeEntryMode('time')}
                >
                  <Text style={[styles.modeButtonText, { color: timeEntryMode === 'time' ? '#fff' : colors.secondary }]}>Start/End Time</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, timeEntryMode === 'duration' && { backgroundColor: colors.accent }]}
                  onPress={() => setTimeEntryMode('duration')}
                >
                  <Text style={[styles.modeButtonText, { color: timeEntryMode === 'duration' ? '#fff' : colors.secondary }]}>Total Hours</Text>
                </TouchableOpacity>
              </View>

              {timeEntryMode === 'time' ? (
                <>
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
                  <Text style={[styles.formLabel, { color: colors.secondary }]}>Break (hours)</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    value={formBreakDuration}
                    onChangeText={setFormBreakDuration}
                    keyboardType="decimal-pad"
                    placeholder="0.5"
                    placeholderTextColor={colors.secondary}
                  />
                  <Text style={[styles.calcDuration, { color: colors.accent }]}>
                    Calculated: {calculateDuration(formStartTime, formEndTime, formBreakDuration)} hours
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.formLabel, { color: colors.secondary }]}>Total Hours</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    value={formDuration}
                    onChangeText={setFormDuration}
                    keyboardType="decimal-pad"
                    placeholder="8.0"
                    placeholderTextColor={colors.secondary}
                  />
                </>
              )}

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

              {/* Hourly Rate */}
              <Text style={[styles.formLabel, { color: colors.secondary }]}>Hourly Rate ($)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={formHourlyRate}
                onChangeText={setFormHourlyRate}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.secondary}
              />

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
        projects.map(p => ({ id: p.id, label: p.name })),
        formProjectId,
        setFormProjectId,
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
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

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
  modeToggle: {
    flexDirection: 'row',
    marginTop: 14,
    borderRadius: 8,
    overflow: 'hidden',
    gap: 0,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 8,
  },
  modeButtonText: { fontSize: 13, fontWeight: '500' },
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
