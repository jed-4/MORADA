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
  Animated,
  PanResponder,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { isOnline } from '../services/offlineQueue';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface SiteDiaryEntry {
  id: string;
  templateId: string;
  templateName?: string;
  projectId: string;
  title: string;
  entryDateTime: string;
  fieldValues: Record<string, any>;
  attachments?: any[];
  overallPhotos?: string[];
  weather?: { temp?: number; condition?: string; humidity?: number; wind?: number; icon?: string };
  labels?: string[];
  createdBy?: string;
  createdByName?: string;
  shareWithClient?: boolean;
  createdAt: string;
  updatedAt: string;
  _isOffline?: boolean;
}

interface SiteDiaryTemplate {
  id: string;
  companyId: string;
  name: string;
  fields: any[];
  isDefault: boolean;
}

interface Project {
  id: string;
  name: string;
  jobNumber?: string;
  currentSystemPhase?: string;
  isActive?: boolean;
  isArchived?: boolean;
  isBusiness?: boolean;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

function formatDayHeader(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${d.getMinutes().toString().padStart(2, '0')} ${period}`;
}

function getDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function getWeatherIcon(condition?: string): string {
  if (!condition) return 'partly-sunny-outline';
  const c = condition.toLowerCase();
  if (c.includes('rain') || c.includes('shower')) return 'rainy-outline';
  if (c.includes('cloud') || c.includes('overcast')) return 'cloudy-outline';
  if (c.includes('sun') || c.includes('clear') || c.includes('fine')) return 'sunny-outline';
  if (c.includes('storm') || c.includes('thunder')) return 'thunderstorm-outline';
  if (c.includes('wind')) return 'flag-outline';
  if (c.includes('snow') || c.includes('hail')) return 'snow-outline';
  return 'partly-sunny-outline';
}

function countPhotos(entry: SiteDiaryEntry): number {
  let count = 0;
  if (entry.overallPhotos) count += entry.overallPhotos.length;
  if (entry.fieldValues) {
    Object.values(entry.fieldValues).forEach((val) => {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && (val[0].startsWith('http') || val[0].startsWith('file') || val[0].startsWith('/'))) {
        count += val.length;
      }
    });
  }
  return count;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0][0] || '?').toUpperCase();
}

function getAvatarColor(name?: string): string {
  const avatarColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#6366f1'];
  if (!name) return avatarColors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

const SWIPE_THRESHOLD = 50;
const SCREEN_WIDTH = Dimensions.get('window').width;
const OFFLINE_DIARY_KEY = 'buildpro_diary_list_offline';

export default function SiteDiaryListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<SiteDiaryEntry[]>([]);
  const [offlineEntries, setOfflineEntries] = useState<SiteDiaryEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [template, setTemplate] = useState<SiteDiaryTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [weekStartDay, setWeekStartDay] = useState(1);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddProjectId, setQuickAddProjectId] = useState('');
  const [quickAddWeatherCondition, setQuickAddWeatherCondition] = useState('');
  const [quickAddWeatherTemp, setQuickAddWeatherTemp] = useState('');
  const [quickAddNotes, setQuickAddNotes] = useState('');
  const [showQuickAddProjectPicker, setShowQuickAddProjectPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6', muted: '#475569', inputBg: '#0f172a', danger: '#ef4444' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb', muted: '#cbd5e1', inputBg: '#f1f5f9', danger: '#ef4444' };

  const goToDay = useCallback((direction: number) => {
    const toValue = direction > 0 ? -SCREEN_WIDTH : SCREEN_WIDTH;
    Animated.timing(translateX, { toValue, duration: 150, useNativeDriver: true }).start(() => {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() + direction);
        return next;
      });
      translateX.setValue(direction > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH);
      Animated.timing(translateX, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    });
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          goToDay(-1);
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          goToDay(1);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const loadOfflineEntries = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_DIARY_KEY);
      if (data) setOfflineEntries(JSON.parse(data));
      else setOfflineEntries([]);
    } catch {
      setOfflineEntries([]);
    }
  }, []);

  const saveOfflineEntry = useCallback(async (entry: SiteDiaryEntry) => {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_DIARY_KEY);
      const current: SiteDiaryEntry[] = data ? JSON.parse(data) : [];
      current.push(entry);
      await AsyncStorage.setItem(OFFLINE_DIARY_KEY, JSON.stringify(current));
      setOfflineEntries(current);
    } catch (e) {
      console.warn('Failed to save offline entry:', e);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const dateStr = getDateStr(currentDate);
      const [entriesData, projectsData] = await Promise.all([
        apiFetch<SiteDiaryEntry[]>(`/api/company/site-diary-entries?date=${dateStr}`).catch(() => []),
        apiFetch<Project[]>('/api/projects').catch(() => []),
      ]);
      setEntries(entriesData || []);
      setProjects(projectsData || []);

      if (!template && user?.companyId) {
        apiFetch<SiteDiaryTemplate>(`/api/site-diary-templates/default/${user.companyId}`)
          .then(t => { if (t) setTemplate(t); })
          .catch(() => {});
      }
    } catch (e) {
      console.error('Failed to fetch diary data:', e);
    } finally {
      setLoading(false);
    }
  }, [currentDate, user?.companyId, template]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    loadOfflineEntries();
  }, [fetchData, loadOfflineEntries]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetworkOnline(!!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    apiFetch<{ weekStartDay?: number }>('/api/company-settings')
      .then(settings => {
        if (settings && typeof settings.weekStartDay === 'number') {
          setWeekStartDay(settings.weekStartDay);
        }
      })
      .catch(() => {});
  }, []);

  const fetchEntryCounts = useCallback(async (year: number, month: number) => {
    try {
      const data = await apiFetch<Record<string, number>>(
        `/api/company/site-diary-counts?year=${year}&month=${month + 1}`
      );
      setEntryCounts(data || {});
    } catch {
      setEntryCounts({});
    }
  }, []);

  useEffect(() => {
    if (showCalendar) {
      fetchEntryCounts(calendarYear, calendarMonth);
    }
  }, [showCalendar, calendarYear, calendarMonth, fetchEntryCounts]);

  const openCalendar = useCallback(() => {
    setCalendarMonth(currentDate.getMonth());
    setCalendarYear(currentDate.getFullYear());
    setShowCalendar(true);
  }, [currentDate]);

  const calendarPrevMonth = useCallback(() => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(y => y - 1);
    } else {
      setCalendarMonth(m => m - 1);
    }
  }, [calendarMonth]);

  const calendarNextMonth = useCallback(() => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(y => y + 1);
    } else {
      setCalendarMonth(m => m + 1);
    }
  }, [calendarMonth]);

  const selectCalendarDate = useCallback((day: number, month: number, year: number) => {
    setCurrentDate(new Date(year, month, day));
    setShowCalendar(false);
  }, []);

  const calendarGoToToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setShowCalendar(false);
  }, []);

  const getCalendarGrid = useCallback(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const orderedDayNames: string[] = [];
    for (let i = 0; i < 7; i++) {
      orderedDayNames.push(dayNames[(weekStartDay + i) % 7]);
    }

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startOffset = firstDay.getDay() - weekStartDay;
    if (startOffset < 0) startOffset += 7;

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

    return { orderedDayNames, rows };
  }, [calendarYear, calendarMonth, weekStartDay]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    await loadOfflineEntries();
    setRefreshing(false);
  }, [fetchData, loadOfflineEntries]);

  const activeProjects = projects.filter(p => p.isActive && !p.isArchived && !p.isBusiness);

  const projectMap = new Map<string, Project>();
  projects.forEach(p => projectMap.set(p.id, p));

  const getProjectLabel = (projectId: string): string => {
    const p = projectMap.get(projectId);
    if (!p) return 'Unknown Project';
    return p.jobNumber ? `${p.jobNumber} - ${p.name}` : p.name;
  };

  const dateStr = getDateStr(currentDate);
  const offlineForDay = offlineEntries.filter(e => {
    const entryDate = e.entryDateTime.split('T')[0];
    return entryDate === dateStr;
  });

  const allEntries: SiteDiaryEntry[] = [
    ...offlineForDay.map(e => ({ ...e, _isOffline: true })),
    ...entries.map(e => ({ ...e, _isOffline: false })),
  ];

  const filteredEntries = allEntries.filter(entry => {
    if (filterProjectId && entry.projectId !== filterProjectId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = entry.title?.toLowerCase().includes(q);
      const creatorMatch = entry.createdByName?.toLowerCase().includes(q);
      const projectMatch = getProjectLabel(entry.projectId).toLowerCase().includes(q);
      const weatherMatch = entry.weather?.condition?.toLowerCase().includes(q);
      if (!titleMatch && !creatorMatch && !projectMatch && !weatherMatch) return false;
    }
    return true;
  });

  const groupedByProject = new Map<string, SiteDiaryEntry[]>();
  filteredEntries.forEach(entry => {
    const key = entry.projectId;
    if (!groupedByProject.has(key)) groupedByProject.set(key, []);
    groupedByProject.get(key)!.push(entry);
  });

  const sortedProjectIds = Array.from(groupedByProject.keys()).sort((a, b) => {
    return getProjectLabel(a).localeCompare(getProjectLabel(b));
  });

  const resetQuickAdd = () => {
    setQuickAddTitle('');
    setQuickAddProjectId('');
    setQuickAddWeatherCondition('');
    setQuickAddWeatherTemp('');
    setQuickAddNotes('');
  };

  const handleQuickAdd = async () => {
    if (!quickAddTitle.trim()) {
      Alert.alert('Missing Title', 'Please enter a title for this diary entry.');
      return;
    }
    if (!quickAddProjectId) {
      Alert.alert('Missing Project', 'Please select a project for this diary entry.');
      return;
    }

    setSubmitting(true);
    try {
      const online = await isOnline();
      const weather: any = {};
      if (quickAddWeatherTemp) weather.temp = parseFloat(quickAddWeatherTemp);
      if (quickAddWeatherCondition) weather.condition = quickAddWeatherCondition;

      const entryDateTime = new Date().toISOString();
      const fieldValues: Record<string, any> = {};

      if (quickAddNotes.trim()) {
        fieldValues._quickNotes = quickAddNotes.trim();
      }

      if (!online) {
        const offlineEntry: SiteDiaryEntry = {
          id: `_offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          templateId: template?.id || '',
          projectId: quickAddProjectId,
          title: quickAddTitle.trim(),
          entryDateTime,
          fieldValues,
          weather: Object.keys(weather).length > 0 ? weather : undefined,
          createdBy: user?.id,
          createdByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : undefined,
          createdAt: entryDateTime,
          updatedAt: entryDateTime,
        };
        await saveOfflineEntry(offlineEntry);
        setShowQuickAdd(false);
        resetQuickAdd();
        Alert.alert('Saved Offline', 'Your diary entry has been saved locally and will sync when you have a connection.');
        return;
      }

      const body: any = {
        templateId: template?.id || null,
        projectId: quickAddProjectId,
        title: quickAddTitle.trim(),
        entryDateTime,
        fieldValues,
        weather: Object.keys(weather).length > 0 ? weather : undefined,
      };

      const res = await apiRequest('/api/site-diary-entries', 'POST', body);
      if (!res.ok) throw new Error('Failed to create entry');

      setShowQuickAdd(false);
      resetQuickAdd();
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save diary entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = offlineEntries.length;
  const filterProject = filterProjectId ? projectMap.get(filterProjectId) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Site Diary</Text>
        <TouchableOpacity
          onPress={() => { resetQuickAdd(); setShowQuickAdd(true); }}
          style={[styles.addBtn, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="add" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.dayNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => goToDay(-1)} style={styles.navArrow}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openCalendar} style={styles.dayInfo}>
          <View style={styles.dayInfoRow}>
            <Text style={[styles.dayLabel, { color: colors.text }]}>
              {isToday(currentDate) ? 'Today' : formatDayHeader(currentDate)}
            </Text>
            <Ionicons name="calendar-outline" size={16} color={colors.secondary} style={{ marginLeft: 6 }} />
          </View>
          {isToday(currentDate) && (
            <Text style={[styles.dayDate, { color: colors.secondary }]}>
              {formatDayHeader(currentDate)}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goToDay(1)} style={styles.navArrow}>
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.secondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search entries..."
            placeholderTextColor={colors.muted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.secondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowFilterPicker(true)}
          style={[
            styles.filterBtn,
            {
              backgroundColor: filterProjectId ? colors.accent : 'transparent',
              borderColor: filterProjectId ? colors.accent : colors.border,
            },
          ]}
        >
          <Ionicons name="funnel" size={16} color={filterProjectId ? '#ffffff' : colors.secondary} />
        </TouchableOpacity>
      </View>

      {filterProjectId && (
        <View style={[styles.activeFilter, { backgroundColor: isDark ? '#1e293b' : '#eff6ff' }]}>
          <Text style={[styles.activeFilterText, { color: colors.accent }]} numberOfLines={1}>
            {getProjectLabel(filterProjectId)}
          </Text>
          <TouchableOpacity onPress={() => setFilterProjectId(null)}>
            <Ionicons name="close-circle" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      {!networkOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: '#fef3c7' }]}>
          <Ionicons name="cloud-offline" size={14} color="#92400e" />
          <Text style={styles.offlineBannerText}>
            Offline{pendingCount > 0 ? ` \u00B7 ${pendingCount} pending` : ''}
          </Text>
        </View>
      )}

      <Animated.View
        style={[styles.content, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
          >
            {filteredEntries.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={56} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.secondary }]}>
                  {searchQuery || filterProjectId ? 'No matching entries' : 'No diary entries'}
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.muted }]}>
                  {searchQuery || filterProjectId
                    ? 'Try adjusting your search or filter.'
                    : 'No site diary entries were recorded on this day.'}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.summaryBar}>
                  <Text style={[styles.summaryText, { color: colors.secondary }]}>
                    {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} across {sortedProjectIds.length} {sortedProjectIds.length === 1 ? 'project' : 'projects'}
                  </Text>
                </View>

                {sortedProjectIds.map(projectId => {
                  const projectEntries = groupedByProject.get(projectId) || [];
                  return (
                    <View key={projectId} style={styles.projectGroup}>
                      <View style={[styles.projectHeader, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                        <Ionicons name="briefcase-outline" size={16} color={colors.accent} />
                        <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                          {getProjectLabel(projectId)}
                        </Text>
                        <View style={[styles.countBadge, { backgroundColor: colors.accent }]}>
                          <Text style={styles.countBadgeText}>{projectEntries.length}</Text>
                        </View>
                      </View>

                      {projectEntries.map(entry => (
                        <TouchableOpacity
                          key={entry.id}
                          style={[styles.entryCard, { backgroundColor: colors.card, borderColor: entry._isOffline ? '#f59e0b' : colors.border }]}
                          activeOpacity={0.7}
                          onPress={() => {
                            navigation.navigate('Projects', {
                              screen: 'SiteDiary',
                              params: { projectId: entry.projectId, projectName: getProjectLabel(entry.projectId) },
                            });
                          }}
                        >
                          <View style={styles.entryRow}>
                            <View style={[styles.creatorAvatar, { backgroundColor: getAvatarColor(entry.createdByName) }]}>
                              <Text style={styles.creatorAvatarText}>
                                {getInitials(entry.createdByName)}
                              </Text>
                            </View>
                            <View style={styles.entryContent}>
                              <View style={styles.entryTop}>
                                <Text style={[styles.entryTitle, { color: colors.text }]} numberOfLines={1}>
                                  {entry.title}
                                </Text>
                                {entry._isOffline && (
                                  <Ionicons name="cloud-offline" size={14} color="#f59e0b" style={{ marginRight: 4 }} />
                                )}
                                <Text style={[styles.entryTime, { color: colors.secondary }]}>
                                  {formatTime(entry.entryDateTime)}
                                </Text>
                              </View>

                              <View style={styles.entryMeta}>
                                {entry.createdByName && (
                                  <Text style={[styles.creatorName, { color: colors.secondary }]} numberOfLines={1}>
                                    {entry.createdByName}
                                  </Text>
                                )}

                                {entry.weather?.condition && (
                                  <View style={styles.metaItem}>
                                    <Ionicons
                                      name={getWeatherIcon(entry.weather.condition) as any}
                                      size={13}
                                      color={colors.secondary}
                                    />
                                    <Text style={[styles.metaText, { color: colors.secondary }]}>
                                      {entry.weather.condition}
                                      {entry.weather.temp != null ? ` ${entry.weather.temp}\u00B0C` : ''}
                                    </Text>
                                  </View>
                                )}

                                {countPhotos(entry) > 0 && (
                                  <View style={styles.metaItem}>
                                    <Ionicons name="camera-outline" size={13} color={colors.secondary} />
                                    <Text style={[styles.metaText, { color: colors.secondary }]}>
                                      {countPhotos(entry)}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </Animated.View>

      <Modal visible={showQuickAdd} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.quickAddSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={[styles.quickAddHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Text style={[styles.quickAddTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                New Diary Entry
              </Text>
              <TouchableOpacity onPress={() => { setShowQuickAdd(false); resetQuickAdd(); }}>
                <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.quickAddBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={quickAddTitle}
                onChangeText={setQuickAddTitle}
                placeholder="Entry title"
                placeholderTextColor={colors.muted}
              />

              <Text style={[styles.fieldLabel, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>Project *</Text>
              <TouchableOpacity
                style={[styles.pickerTrigger, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => setShowQuickAddProjectPicker(true)}
              >
                <Text style={[styles.pickerTriggerText, { color: quickAddProjectId ? colors.text : colors.muted }]} numberOfLines={1}>
                  {quickAddProjectId ? getProjectLabel(quickAddProjectId) : 'Select project...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.secondary} />
              </TouchableOpacity>

              <View style={styles.weatherRow}>
                <View style={styles.weatherField}>
                  <Text style={[styles.fieldLabel, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>Weather</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    value={quickAddWeatherCondition}
                    onChangeText={setQuickAddWeatherCondition}
                    placeholder="e.g. Sunny"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={styles.tempField}>
                  <Text style={[styles.fieldLabel, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>Temp</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    value={quickAddWeatherTemp}
                    onChangeText={setQuickAddWeatherTemp}
                    placeholder="\u00B0C"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={quickAddNotes}
                onChangeText={setQuickAddNotes}
                placeholder="Quick notes..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.accent, opacity: submitting ? 0.6 : 1 }]}
                onPress={handleQuickAdd}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Entry</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showQuickAddProjectPicker} transparent animationType="slide">
        <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
          <View style={[styles.pickerSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Text style={[styles.pickerHeaderTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                Select Project
              </Text>
              <TouchableOpacity onPress={() => setShowQuickAddProjectPicker(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={activeProjects}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.projectPickerRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }]}
                  onPress={() => {
                    setQuickAddProjectId(item.id);
                    setShowQuickAddProjectPicker(false);
                  }}
                >
                  <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                  <Text style={[styles.projectPickerName, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>
                    {item.jobNumber ? `${item.jobNumber} - ${item.name}` : item.name}
                  </Text>
                  {quickAddProjectId === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showFilterPicker} transparent animationType="slide">
        <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
          <View style={[styles.pickerSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Text style={[styles.pickerHeaderTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                Filter by Project
              </Text>
              <TouchableOpacity onPress={() => setShowFilterPicker(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.projectPickerRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }]}
              onPress={() => { setFilterProjectId(null); setShowFilterPicker(false); }}
            >
              <Ionicons name="apps-outline" size={18} color={colors.secondary} />
              <Text style={[styles.projectPickerName, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                All Projects
              </Text>
              {!filterProjectId && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
            </TouchableOpacity>
            <FlatList
              data={activeProjects}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.projectPickerRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }]}
                  onPress={() => {
                    setFilterProjectId(item.id);
                    setShowFilterPicker(false);
                  }}
                >
                  <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                  <Text style={[styles.projectPickerName, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>
                    {item.jobNumber ? `${item.jobNumber} - ${item.name}` : item.name}
                  </Text>
                  {filterProjectId === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showCalendar} transparent animationType="slide">
        <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
          <View style={[styles.calendarSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={[styles.calendarHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Text style={[styles.pickerHeaderTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                Select Date
              </Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarMonthNav}>
              <TouchableOpacity onPress={calendarPrevMonth} style={styles.calendarMonthArrow}>
                <Ionicons name="chevron-back" size={22} color={colors.accent} />
              </TouchableOpacity>
              <Text style={[styles.calendarMonthLabel, { color: colors.text }]}>
                {new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={calendarNextMonth} style={styles.calendarMonthArrow}>
                <Ionicons name="chevron-forward" size={22} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {(() => {
              const { orderedDayNames, rows } = getCalendarGrid();
              const todayStr = getDateStr(new Date());
              const selectedStr = getDateStr(currentDate);
              return (
                <View style={styles.calendarGrid}>
                  <View style={styles.calendarDayHeaderRow}>
                    {orderedDayNames.map(dn => (
                      <View key={dn} style={styles.calendarDayHeaderCell}>
                        <Text style={[styles.calendarDayHeaderText, { color: colors.secondary }]}>{dn}</Text>
                      </View>
                    ))}
                  </View>
                  {rows.map((row, ri) => (
                    <View key={ri} style={styles.calendarWeekRow}>
                      {row.map((cell, ci) => {
                        const cellDateStr = `${cell.year}-${(cell.month + 1).toString().padStart(2, '0')}-${cell.day.toString().padStart(2, '0')}`;
                        const isSelected = cellDateStr === selectedStr;
                        const isTodayCell = cellDateStr === todayStr;
                        const count = entryCounts[cellDateStr] || 0;
                        const dotCount = Math.min(count, 3);
                        return (
                          <TouchableOpacity
                            key={ci}
                            style={styles.calendarDayCell}
                            activeOpacity={0.6}
                            onPress={() => selectCalendarDate(cell.day, cell.month, cell.year)}
                          >
                            <View
                              style={[
                                styles.calendarDayCircle,
                                isSelected && { backgroundColor: colors.accent },
                                !isSelected && isTodayCell && { borderWidth: 2, borderColor: colors.accent },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.calendarDayText,
                                  { color: isSelected ? '#ffffff' : cell.isCurrentMonth ? colors.text : colors.muted },
                                ]}
                              >
                                {cell.day}
                              </Text>
                            </View>
                            <View style={styles.calendarDotRow}>
                              {Array.from({ length: dotCount }).map((_, di) => (
                                <View key={di} style={styles.calendarDot} />
                              ))}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })()}

            <TouchableOpacity
              style={[styles.calendarTodayBtn, { backgroundColor: colors.accent }]}
              onPress={calendarGoToToday}
            >
              <Ionicons name="today-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.calendarTodayBtnText}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  navArrow: {
    padding: 8,
  },
  dayInfo: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  dayDate: {
    fontSize: 12,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  activeFilterText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  offlineBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  projectGroup: {
    marginBottom: 4,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  entryCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  entryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorAvatarText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  entryContent: {
    flex: 1,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  entryTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  creatorName: {
    fontSize: 12,
    fontWeight: '500',
  },
  entryMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  quickAddSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  quickAddHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  quickAddTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  quickAddBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerTriggerText: {
    fontSize: 14,
    flex: 1,
  },
  weatherRow: {
    flexDirection: 'row',
    gap: 12,
  },
  weatherField: {
    flex: 2,
  },
  tempField: {
    flex: 1,
  },
  submitBtn: {
    marginTop: 20,
    marginBottom: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    minHeight: 200,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pickerHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  projectPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  projectPickerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  dayInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  calendarMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  calendarMonthArrow: {
    padding: 8,
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  calendarGrid: {
    paddingHorizontal: 8,
  },
  calendarDayHeaderRow: {
    flexDirection: 'row',
  },
  calendarDayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  calendarDayHeaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  calendarWeekRow: {
    flexDirection: 'row',
  },
  calendarDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  calendarDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  calendarDotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
    height: 8,
    marginTop: 2,
  },
  calendarDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3b82f6',
  },
  calendarTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  calendarTodayBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
