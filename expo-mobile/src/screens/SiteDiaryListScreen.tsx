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
  Image,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest, uploadPhoto, uploadAudio, API_BASE_URL } from '../services/api';
import VoiceToTextButton from '../components/VoiceToTextButton';
import { isOnline, addToQueue } from '../services/offlineQueue';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface TemplateField {
  id: string;
  title: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'file' | 'photo-gallery';
  required?: boolean;
  options?: { label: string; value: string }[];
  order: number;
  maxPhotos?: number;
}

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
  fields: TemplateField[];
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
  const visible = projects.filter(p => p.isActive && !p.isArchived && !p.isBusiness && p.currentSystemPhase !== 'archive');

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

function localISOString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

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

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getHours();
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${displayH}:${d.getMinutes().toString().padStart(2, '0')} ${period}`;
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
  const [allTemplates, setAllTemplates] = useState<SiteDiaryTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<SiteDiaryTemplate | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);

  const [viewMode, setViewMode] = useState<'day' | 'feed'>('feed');
  const [feedEntries, setFeedEntries] = useState<SiteDiaryEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [weekStartDay, setWeekStartDay] = useState(1);

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SiteDiaryEntry | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formTitle, setFormTitle] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formDateTime, setFormDateTime] = useState(localISOString());
  const [formFieldValues, setFormFieldValues] = useState<Record<string, any>>({});
  const [formOverallPhotos, setFormOverallPhotos] = useState<string[]>([]);
  const [formVoiceNotes, setFormVoiceNotes] = useState<string[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const [playingVoiceNote, setPlayingVoiceNote] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  const translateX = useRef(new Animated.Value(0)).current;

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', inputBg: '#0f172a', danger: '#ef4444', success: '#22c55e' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1', inputBg: '#f1f5f9', danger: '#ef4444', success: '#22c55e' };

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

  const saveOfflineEntries = useCallback(async (items: SiteDiaryEntry[]) => {
    try {
      await AsyncStorage.setItem(OFFLINE_DIARY_KEY, JSON.stringify(items));
      setOfflineEntries(items);
    } catch (e) {
      console.warn('Failed to save offline entries:', e);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const dateStr = getDateStr(currentDate);
      const [entriesData, projectsData, templatesData] = await Promise.all([
        apiFetch<SiteDiaryEntry[]>(`/api/company/site-diary-entries?date=${dateStr}`).catch(() => []),
        apiFetch<Project[]>('/api/projects').catch(() => []),
        user?.companyId
          ? apiFetch<SiteDiaryTemplate[]>(`/api/site-diary-templates?companyId=${user.companyId}`).catch(() => [])
          : Promise.resolve([]),
      ]);
      setEntries(entriesData || []);
      setProjects(projectsData || []);
      if (templatesData && templatesData.length > 0) {
        setAllTemplates(templatesData);
        const defaultTpl = templatesData.find(t => t.isDefault) || templatesData[0];
        if (!template) setTemplate(defaultTpl);
        if (!activeTemplate) setActiveTemplate(defaultTpl);
      } else if (!template && user?.companyId) {
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

  const fetchFeedData = useCallback(async () => {
    setFeedLoading(true);
    try {
      const data = await apiFetch<SiteDiaryEntry[]>('/api/company/site-diary-entries').catch(() => []);
      setFeedEntries(data || []);
    } catch (e) {
      console.error('Failed to fetch feed data:', e);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
    loadOfflineEntries();
    fetchFeedData();
  }, [fetchData, loadOfflineEntries, fetchFeedData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setCurrentDate(new Date());
    });
    return unsubscribe;
  }, [navigation]);

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
    await Promise.all([fetchData(), loadOfflineEntries(), fetchFeedData()]);
    setRefreshing(false);
  }, [fetchData, loadOfflineEntries, fetchFeedData]);

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
      let fieldMatch = false;
      if (entry.fieldValues) {
        for (const value of Object.values(entry.fieldValues)) {
          if (!value) continue;
          if (typeof value === 'string' || typeof value === 'number') {
            if (String(value).toLowerCase().includes(q)) { fieldMatch = true; break; }
          } else if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'string' && item.toLowerCase().includes(q)) { fieldMatch = true; break; }
              if (typeof item === 'number' && String(item).includes(q)) { fieldMatch = true; break; }
              if (typeof item === 'object' && item !== null) {
                const label = item.label || item.value || item.name || '';
                if (String(label).toLowerCase().includes(q)) { fieldMatch = true; break; }
              }
            }
            if (fieldMatch) break;
          } else if (typeof value === 'object' && value !== null) {
            if ('checkedByName' in value && value.checkedByName && String(value.checkedByName).toLowerCase().includes(q)) { fieldMatch = true; break; }
            if ('value' in value && typeof value.value === 'string' && value.value.toLowerCase().includes(q)) { fieldMatch = true; break; }
          }
        }
      }
      if (!titleMatch && !creatorMatch && !projectMatch && !weatherMatch && !fieldMatch) return false;
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

  const resetForm = () => {
    setFormTitle('');
    setFormProjectId('');
    setFormDateTime(localISOString());
    setFormFieldValues({});
    setFormOverallPhotos([]);
    setFormVoiceNotes([]);
    setIsEditMode(false);
    setSelectedEntry(null);
  };

  const applyTemplateDefaults = (t: SiteDiaryTemplate | null) => {
    if (t?.fields) {
      const defaults: Record<string, any> = {};
      t.fields.forEach(f => {
        if (f.type === 'checkbox') defaults[f.id] = false;
        else if (f.type === 'photo-gallery') defaults[f.id] = [];
        else defaults[f.id] = '';
      });
      setFormFieldValues(defaults);
    } else {
      setFormFieldValues({});
    }
  };

  const switchTemplate = (t: SiteDiaryTemplate) => {
    setActiveTemplate(t);
    applyTemplateDefaults(t);
    setShowTemplatePicker(false);
  };

  const openCreateModal = () => {
    resetForm();
    const defaultTpl = allTemplates.find(t => t.isDefault) || allTemplates[0] || template;
    setActiveTemplate(defaultTpl);
    applyTemplateDefaults(defaultTpl);
    setShowEntryModal(true);
  };

  const openEditModal = (entry: SiteDiaryEntry) => {
    setIsEditMode(true);
    setSelectedEntry(entry);
    setFormTitle(entry.title);
    setFormProjectId(entry.projectId);
    setFormDateTime(entry.entryDateTime);
    setFormFieldValues(entry.fieldValues || {});
    setFormOverallPhotos(entry.overallPhotos || []);
    setFormVoiceNotes(entry.fieldValues?._voiceNotes || []);
    const entryTemplate = allTemplates.find(t => t.id === entry.templateId) || template;
    setActiveTemplate(entryTemplate);
    setShowDetailModal(false);
    setShowEntryModal(true);
  };

  const openDetailModal = (entry: SiteDiaryEntry) => {
    setSelectedEntry(entry);
    setShowDetailModal(true);
  };

  const pickPhoto = async (fieldId?: string) => {
    const actionSheet = () => {
      Alert.alert('Add Photo', 'Choose an option', [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Camera access is needed to take photos.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
            });
            if (!result.canceled && result.assets[0]) {
              addPhotoUri(result.assets[0].uri, fieldId);
            }
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Photo library access is needed.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              allowsMultipleSelection: true,
              selectionLimit: 5,
            });
            if (!result.canceled && result.assets.length > 0) {
              result.assets.forEach(asset => addPhotoUri(asset.uri, fieldId));
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    };
    actionSheet();
  };

  const addPhotoUri = (uri: string, fieldId?: string) => {
    if (fieldId) {
      setFormFieldValues(prev => {
        const current = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
        const field = activeTemplate?.fields.find(f => f.id === fieldId);
        const maxPhotos = field?.maxPhotos || 3;
        if (current.length >= maxPhotos) {
          Alert.alert('Limit Reached', `Maximum ${maxPhotos} photos allowed for this field.`);
          return prev;
        }
        return { ...prev, [fieldId]: [...current, uri] };
      });
    } else {
      setFormOverallPhotos(prev => [...prev, uri]);
    }
  };

  const removePhoto = (fieldId: string | null, index: number) => {
    if (fieldId) {
      setFormFieldValues(prev => {
        const current = Array.isArray(prev[fieldId]) ? [...prev[fieldId]] : [];
        current.splice(index, 1);
        return { ...prev, [fieldId]: current };
      });
    } else {
      setFormOverallPhotos(prev => {
        const copy = [...prev];
        copy.splice(index, 1);
        return copy;
      });
    }
  };

  const uploadAllPhotos = async (photos: string[]): Promise<string[]> => {
    const uploaded: string[] = [];
    for (const uri of photos) {
      if (uri.startsWith('file://') || uri.startsWith('content://')) {
        try {
          const { objectPath } = await uploadPhoto(uri);
          uploaded.push(objectPath);
        } catch {
          uploaded.push(uri);
        }
      } else {
        uploaded.push(uri);
      }
    }
    return uploaded;
  };

  const formatRecordingTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim2, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim2, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim2.stopAnimation();
    pulseAnim2.setValue(1);
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed to record voice notes.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      startPulseAnimation();
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      stopPulseAnimation();
      setIsRecording(false);
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        if (uri) {
          setFormVoiceNotes(prev => [...prev, uri]);
        }
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setIsRecording(false);
    }
  };

  const cleanupRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    stopPulseAnimation();
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    setPlayingVoiceNote(null);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
  };

  const removeVoiceNote = (index: number) => {
    setFormVoiceNotes(prev => {
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const getPhotoUrl = (path: string): string => {
    if (path.startsWith('http') || path.startsWith('file://') || path.startsWith('content://')) return path;
    return `${API_BASE_URL}/api/uploads/serve/${encodeURIComponent(path)}`;
  };

  const playVoiceNote = async (uri: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingVoiceNote === uri) {
        setPlayingVoiceNote(null);
        setPlaybackPosition(0);
        setPlaybackDuration(0);
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const audioUri = uri.startsWith('file://') || uri.startsWith('content://') ? uri : getPhotoUrl(uri);
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      soundRef.current = sound;
      setPlayingVoiceNote(uri);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setPlaybackPosition(status.positionMillis || 0);
          setPlaybackDuration(status.durationMillis || 0);
          if (status.didJustFinish) {
            setPlayingVoiceNote(null);
            setPlaybackPosition(0);
          }
        }
      });
      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play voice note:', err);
      Alert.alert('Error', 'Could not play voice note.');
    }
  };

  const handleSaveEntry = async () => {
    if (!formTitle.trim()) {
      Alert.alert('Missing Title', 'Please enter a title for this diary entry.');
      return;
    }
    if (!formProjectId) {
      Alert.alert('Missing Project', 'Please select a project for this diary entry.');
      return;
    }

    setSubmitting(true);
    try {
      const online = await isOnline();
      if (!online) {
        const entryId = (isEditMode && selectedEntry?.id.startsWith('_offline_'))
          ? selectedEntry.id
          : `_offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const offlineFieldValues = { ...formFieldValues };
        if (formVoiceNotes.length > 0) {
          offlineFieldValues._voiceNotes = formVoiceNotes;
        }

        const offlineEntry: SiteDiaryEntry = {
          id: entryId,
          templateId: activeTemplate?.id || template?.id || '',
          projectId: formProjectId,
          title: formTitle.trim(),
          entryDateTime: formDateTime,
          fieldValues: offlineFieldValues,
          overallPhotos: formOverallPhotos,
          createdBy: user?.id,
          createdByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : undefined,
          createdAt: selectedEntry?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (isEditMode && selectedEntry?.id.startsWith('_offline_')) {
          const updated = offlineEntries.map(e => e.id === selectedEntry.id ? offlineEntry : e);
          await saveOfflineEntries(updated);
        } else if (isEditMode && selectedEntry && !selectedEntry.id.startsWith('_offline_')) {
          await addToQueue({
            type: 'edit-diary-entry',
            payload: {
              id: selectedEntry.id,
              title: formTitle.trim(),
              entryDateTime: formDateTime,
              fieldValues: formFieldValues,
              overallPhotos: formOverallPhotos,
            },
          });
          Alert.alert('Queued for Sync', 'Your edit will be synced when you reconnect.');
        } else {
          await saveOfflineEntry(offlineEntry);
        }

        setShowEntryModal(false);
        resetForm();
        if (!isEditMode || selectedEntry?.id.startsWith('_offline_')) {
          Alert.alert('Saved Offline', 'Your diary entry has been saved locally and will sync when you have a connection.');
        }
        return;
      }

      const uploadedFieldValues = { ...formFieldValues };
      for (const [key, val] of Object.entries(uploadedFieldValues)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {
          uploadedFieldValues[key] = await uploadAllPhotos(val);
        }
      }

      const uploadedOverallPhotos = await uploadAllPhotos(formOverallPhotos);

      const uploadedVoiceNotes: string[] = [];
      for (const uri of formVoiceNotes) {
        if (uri.startsWith('file://') || uri.startsWith('content://')) {
          try {
            const { objectPath } = await uploadAudio(uri);
            uploadedVoiceNotes.push(objectPath);
          } catch {
            uploadedVoiceNotes.push(uri);
          }
        } else {
          uploadedVoiceNotes.push(uri);
        }
      }
      if (uploadedVoiceNotes.length > 0) {
        uploadedFieldValues._voiceNotes = uploadedVoiceNotes;
      }

      const body: any = {
        templateId: activeTemplate?.id || template?.id || null,
        projectId: formProjectId,
        title: formTitle.trim(),
        entryDateTime: formDateTime,
        fieldValues: uploadedFieldValues,
        overallPhotos: uploadedOverallPhotos,
      };

      if (isEditMode && selectedEntry && !selectedEntry.id.startsWith('_offline_')) {
        const res = await apiRequest(`/api/site-diary-entries/${selectedEntry.id}`, 'PATCH', body);
        if (!res.ok) throw new Error('Failed to update entry');
      } else {
        const res = await apiRequest('/api/site-diary-entries', 'POST', body);
        if (!res.ok) throw new Error('Failed to create entry');
      }

      setShowEntryModal(false);
      resetForm();
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save diary entry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = (entry: SiteDiaryEntry) => {
    Alert.alert('Delete Entry', 'Are you sure you want to delete this diary entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (entry.id.startsWith('_offline_')) {
              const updated = offlineEntries.filter(e => e.id !== entry.id);
              await saveOfflineEntries(updated);
            } else {
              const online = await isOnline();
              if (online) {
                await apiRequest(`/api/site-diary-entries/${entry.id}`, 'DELETE', {});
                await fetchData();
              } else {
                await addToQueue({ type: 'delete-diary-entry', payload: { id: entry.id } });
                setEntries(prev => prev.filter(e => e.id !== entry.id));
                Alert.alert('Queued', 'Deletion will sync when you reconnect.');
              }
            }
            setShowDetailModal(false);
            setSelectedEntry(null);
          } catch {
            Alert.alert('Error', 'Could not delete entry.');
          }
        },
      },
    ]);
  };

  const renderFieldInput = (field: TemplateField) => {
    const value = formFieldValues[field.id];

    switch (field.type) {
      case 'text':
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 0 }]}>
                {field.title}{field.required ? ' *' : ''}
              </Text>
              <VoiceToTextButton
                onTranscription={(text) => setFormFieldValues(prev => ({
                  ...prev,
                  [field.id]: (prev[field.id] || '') + (prev[field.id] ? ' ' : '') + text,
                }))}
              />
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={colors.secondary}
            />
          </View>
        );

      case 'textarea':
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 0 }]}>
                {field.title}{field.required ? ' *' : ''}
              </Text>
              <VoiceToTextButton
                onTranscription={(text) => setFormFieldValues(prev => ({
                  ...prev,
                  [field.id]: (prev[field.id] || '') + (prev[field.id] ? ' ' : '') + text,
                }))}
              />
            </View>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={colors.secondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        );

      case 'number':
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value?.toString() || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={colors.secondary}
              keyboardType="numeric"
            />
          </View>
        );

      case 'date':
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.secondary}
            />
          </View>
        );

      case 'select':
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {(field.options || []).map(opt => {
                const selected = value === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.accent : colors.inputBg,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => setFormFieldValues(prev => ({ ...prev, [field.id]: opt.value }))}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#ffffff' : colors.text }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        );

      case 'checkbox':
        return (
          <View key={field.id} style={[styles.fieldContainer, styles.switchRow]}>
            <Text style={[styles.fieldLabel, { color: colors.text, flex: 1, marginBottom: 0 }]}>
              {field.title}
            </Text>
            <Switch
              value={!!value}
              onValueChange={val => setFormFieldValues(prev => ({ ...prev, [field.id]: val }))}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#ffffff"
            />
          </View>
        );

      case 'photo-gallery':
        const photos: string[] = Array.isArray(value) ? value : [];
        const maxPhotos = field.maxPhotos || 3;
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title} ({photos.length}/{maxPhotos})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.map((uri, idx) => (
                <View key={idx} style={styles.photoThumbContainer}>
                  <Image source={{ uri: getPhotoUrl(uri) }} style={styles.photoThumb} />
                  <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removePhoto(field.id, idx)}>
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < maxPhotos && (
                <TouchableOpacity
                  style={[styles.addPhotoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={() => pickPhoto(field.id)}
                >
                  <Ionicons name="camera-outline" size={28} color={colors.accent} />
                  <Text style={[styles.addPhotoText, { color: colors.secondary }]}>Add</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        );

      default:
        return null;
    }
  };

  const renderDetailFieldValue = (field: TemplateField, value: any) => {
    if (value === undefined || value === null || value === '') return null;

    switch (field.type) {
      case 'checkbox':
        return (
          <View key={field.id} style={styles.detailField}>
            <Text style={[styles.detailFieldLabel, { color: colors.secondary }]}>{field.title}</Text>
            <View style={styles.checkboxDisplay}>
              <Ionicons
                name={value ? 'checkbox-outline' : 'square-outline'}
                size={20}
                color={value ? colors.success : colors.secondary}
              />
              <Text style={[styles.detailFieldValue, { color: colors.text, marginLeft: 6 }]}>
                {value ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        );

      case 'photo-gallery':
        if (!Array.isArray(value) || value.length === 0) return null;
        return (
          <View key={field.id} style={styles.detailField}>
            <Text style={[styles.detailFieldLabel, { color: colors.secondary }]}>{field.title}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {value.map((uri: string, idx: number) => (
                <Image key={idx} source={{ uri: getPhotoUrl(uri) }} style={styles.detailPhoto} />
              ))}
            </ScrollView>
          </View>
        );

      case 'select':
        const opt = field.options?.find(o => o.value === value);
        return (
          <View key={field.id} style={styles.detailField}>
            <Text style={[styles.detailFieldLabel, { color: colors.secondary }]}>{field.title}</Text>
            <Text style={[styles.detailFieldValue, { color: colors.text }]}>{opt?.label || value}</Text>
          </View>
        );

      default:
        return (
          <View key={field.id} style={styles.detailField}>
            <Text style={[styles.detailFieldLabel, { color: colors.secondary }]}>{field.title}</Text>
            <Text style={[styles.detailFieldValue, { color: colors.text }]}>{String(value)}</Text>
          </View>
        );
    }
  };

  const pendingCount = offlineEntries.length;
  const filterProject = filterProjectId ? projectMap.get(filterProjectId) : null;

  const allFeedEntries = [...feedEntries, ...offlineEntries];
  const feedByDate = new Map<string, SiteDiaryEntry[]>();
  allFeedEntries.forEach(entry => {
    let dateKey = 'unknown';
    if (entry.entryDateTime) {
      const d = new Date(entry.entryDateTime);
      const pad = (n: number) => String(n).padStart(2, '0');
      dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    if (!feedByDate.has(dateKey)) feedByDate.set(dateKey, []);
    feedByDate.get(dateKey)!.push(entry);
  });
  const feedDateKeys = Array.from(feedByDate.keys()).sort((a, b) => b.localeCompare(a));
  type FeedItem =
    | { type: 'header'; dateKey: string }
    | { type: 'entry'; entry: SiteDiaryEntry };
  const feedItems: FeedItem[] = [];
  feedDateKeys.forEach(dateKey => {
    feedItems.push({ type: 'header', dateKey });
    const dayEntries = (feedByDate.get(dateKey) || [])
      .filter(e => {
        if (searchQuery && !e.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (filterProjectId && e.projectId !== filterProjectId) return false;
        return true;
      })
      .sort((a, b) => b.entryDateTime.localeCompare(a.entryDateTime));
    dayEntries.forEach(entry => feedItems.push({ type: 'entry', entry }));
  });
  const filteredFeedItems = feedItems.filter((item, idx) => {
    if (item.type === 'entry') return true;
    const next = feedItems[idx + 1];
    return next && next.type === 'entry';
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Site Diary</Text>
        <TouchableOpacity
          onPress={openCreateModal}
          style={[styles.addBtn, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="add" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.dayNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {viewMode === 'day' ? (
          <TouchableOpacity onPress={() => goToDay(-1)} style={styles.navArrow}>
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={styles.navArrow} />
        )}
        <View style={styles.dayInfo}>
          {viewMode === 'day' ? (
            <TouchableOpacity onPress={openCalendar} style={{ alignItems: 'center' }}>
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
          ) : (
            <Text style={[styles.dayLabel, { color: colors.text }]}>All Entries</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={[styles.viewToggle, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9', borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === 'feed' && { backgroundColor: colors.accent }]}
              onPress={() => setViewMode('feed')}
            >
              <Text style={[styles.viewToggleBtnText, { color: viewMode === 'feed' ? '#fff' : colors.secondary }]}>Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === 'day' && { backgroundColor: colors.accent }]}
              onPress={() => setViewMode('day')}
            >
              <Text style={[styles.viewToggleBtnText, { color: viewMode === 'day' ? '#fff' : colors.secondary }]}>Day</Text>
            </TouchableOpacity>
          </View>
          {viewMode === 'day' ? (
            <TouchableOpacity onPress={() => goToDay(1)} style={styles.navArrow}>
              <Ionicons name="chevron-forward" size={22} color={colors.accent} />
            </TouchableOpacity>
          ) : (
            <View style={styles.navArrow} />
          )}
        </View>
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

      {viewMode === 'feed' ? (
        feedLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, filteredFeedItems.length === 0 && { flex: 1 }]}
            data={filteredFeedItems}
            keyExtractor={(item, idx) =>
              item.type === 'header' ? `hdr-${item.dateKey}` : `entry-${(item as any).entry.id}-${idx}`
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={56} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.secondary }]}>
                  {searchQuery || filterProjectId ? 'No matching entries' : 'No diary entries yet'}
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.muted }]}>
                  {searchQuery || filterProjectId
                    ? 'Try adjusting your search or filter.'
                    : 'Create your first site diary entry by tapping the + button.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.type === 'header') {
                const d = new Date(item.dateKey + 'T12:00:00');
                return (
                  <View style={[styles.feedDateHeader, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.feedDateHeaderText, { color: colors.accent }]}>
                      {formatDayHeader(d)}
                    </Text>
                  </View>
                );
              }
              const entry = item.entry;
              return (
                <TouchableOpacity
                  style={[styles.entryCard, { backgroundColor: colors.card, borderColor: entry._isOffline ? '#f59e0b' : colors.border, marginHorizontal: 16 }]}
                  activeOpacity={0.7}
                  onPress={() => openDetailModal(entry)}
                >
                  <View style={styles.entryRow}>
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
                        {entry.projectId && (
                          <Text style={[styles.creatorName, { color: colors.secondary }]} numberOfLines={1}>
                            {getProjectLabel(entry.projectId)}
                          </Text>
                        )}
                        {entry.createdByName && (
                          <Text style={[styles.creatorName, { color: colors.muted }]} numberOfLines={1}>
                            {entry.createdByName}
                          </Text>
                        )}
                        {entry.weather?.condition && (
                          <View style={styles.metaItem}>
                            <Ionicons name={getWeatherIcon(entry.weather.condition) as any} size={13} color={colors.secondary} />
                            <Text style={[styles.metaText, { color: colors.secondary }]}>
                              {entry.weather.condition}{entry.weather.temp != null ? ` ${entry.weather.temp}\u00B0C` : ''}
                            </Text>
                          </View>
                        )}
                        {countPhotos(entry) > 0 && (
                          <View style={styles.metaItem}>
                            <Ionicons name="camera-outline" size={13} color={colors.secondary} />
                            <Text style={[styles.metaText, { color: colors.secondary }]}>{countPhotos(entry)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )
      ) : (
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
                          onPress={() => openDetailModal(entry)}
                        >
                          <View style={styles.entryRow}>
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
      )}

      <Modal visible={showEntryModal} animationType="slide" presentationStyle="fullScreen">
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { cleanupRecording(); setShowEntryModal(false); resetForm(); }}>
              <Text style={[styles.modalHeaderBtn, { color: colors.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>
              {isEditMode ? 'Edit Entry' : 'New Entry'}
            </Text>
            <TouchableOpacity onPress={handleSaveEntry} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[styles.modalHeaderBtn, { color: colors.accent, fontWeight: '600' }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {allTemplates.length > 1 && (
            <TouchableOpacity
              style={[styles.templateBar, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9', borderBottomColor: colors.border }]}
              onPress={() => setShowTemplatePicker(true)}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.accent} />
              <Text style={[styles.templateBarText, { color: colors.text }]} numberOfLines={1}>
                {activeTemplate?.name || 'Default Template'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondary} />
            </TouchableOpacity>
          )}

          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Entry title"
                placeholderTextColor={colors.secondary}
              />
            </View>

            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Project *</Text>
              <TouchableOpacity
                style={[styles.pickerTrigger, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => setShowProjectPicker(true)}
              >
                <Text style={[styles.pickerTriggerText, { color: formProjectId ? colors.text : colors.muted }]} numberOfLines={1}>
                  {formProjectId ? getProjectLabel(formProjectId) : 'Select project...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.secondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Date / Time</Text>
              <View style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, justifyContent: 'center' }]}>
                <Text style={{ color: colors.text }}>{formatDateTime(formDateTime)}</Text>
              </View>
            </View>

            {activeTemplate && activeTemplate.fields.length > 0 && (
              <>
                <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {activeTemplate.name || 'Template Fields'}
                  </Text>
                </View>
                {activeTemplate.fields
                  .sort((a, b) => a.order - b.order)
                  .map(field => renderFieldInput(field))}
              </>
            )}

            <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Voice Notes</Text>
            </View>

            <View style={styles.voiceNotesSection}>
              {!isRecording ? (
                <TouchableOpacity
                  style={[styles.recordBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={startRecording}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mic-outline" size={24} color={colors.accent} />
                  <Text style={[styles.recordBtnText, { color: colors.text }]}>Record Voice Note</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.recordingRow, { backgroundColor: '#ef444415', borderColor: '#ef4444' }]}>
                  <Animated.View style={[styles.recordingIndicator, { transform: [{ scale: pulseAnim2 }] }]}>
                    <View style={styles.recordingDot} />
                  </Animated.View>
                  <Text style={[styles.recordingTime, { color: colors.danger }]}>
                    {formatRecordingTime(recordingDuration)}
                  </Text>
                  <Text style={[styles.recordingLabel, { color: colors.danger }]}>Recording...</Text>
                  <TouchableOpacity
                    style={[styles.stopBtn, { backgroundColor: colors.danger }]}
                    onPress={stopRecording}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="stop" size={18} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}

              {formVoiceNotes.map((uri, idx) => (
                <View key={idx} style={[styles.voiceNoteItem, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.vnPlayBtn, { backgroundColor: colors.accent }]}
                    onPress={() => playVoiceNote(uri)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={playingVoiceNote === uri ? 'pause' : 'play'} size={16} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.vnInfo}>
                    <Text style={[styles.vnTitle, { color: colors.text }]}>Voice Note {idx + 1}</Text>
                    {playingVoiceNote === uri && playbackDuration > 0 && (
                      <Text style={[styles.vnDuration, { color: colors.secondary }]}>
                        {formatRecordingTime(Math.floor(playbackPosition / 1000))} / {formatRecordingTime(Math.floor(playbackDuration / 1000))}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => removeVoiceNote(idx)}>
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Overall Photos</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {formOverallPhotos.map((uri, idx) => (
                <View key={idx} style={styles.photoThumbContainer}>
                  <Image source={{ uri: getPhotoUrl(uri) }} style={styles.photoThumb} />
                  <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removePhoto(null, idx)}>
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.addPhotoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => pickPhoto()}
              >
                <Ionicons name="camera-outline" size={28} color={colors.accent} />
                <Text style={[styles.addPhotoText, { color: colors.secondary }]}>Add</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={{ height: 40 }} />
          </ScrollView>

          <Modal visible={showProjectPicker} transparent animationType="slide">
            <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
              <View style={[styles.pickerSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
                <View style={[styles.pickerHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
                  <Text style={[styles.pickerHeaderTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                    Select Project
                  </Text>
                  <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
                    <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={getSortedProjectItems(projects)}
                  keyExtractor={item => item.id}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  renderItem={({ item }) => {
                    if (item.isHeader) {
                      return (
                        <View style={[styles.phaseSectionHeader, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                          <Text style={[styles.phaseSectionText, { color: colors.secondary }]}>{item.label}</Text>
                        </View>
                      );
                    }
                    return (
                      <TouchableOpacity
                        style={[styles.projectPickerRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }]}
                        onPress={() => {
                          setFormProjectId(item.id);
                          setShowProjectPicker(false);
                        }}
                      >
                        <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                        <Text style={[styles.projectPickerName, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>
                          {item.label}
                        </Text>
                        {formProjectId === item.id && (
                          <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </View>
          </Modal>

          <Modal visible={showTemplatePicker} transparent animationType="slide">
            <View style={[styles.tpOverlay, { justifyContent: 'flex-end' }]}>
              <View style={[styles.tpSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
                <View style={[styles.tpHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
                  <Text style={[styles.tpHeaderTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                    Select Template
                  </Text>
                  <TouchableOpacity onPress={() => setShowTemplatePicker(false)}>
                    <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={[...allTemplates].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))}
                  keyExtractor={item => item.id}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.tpRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }]}
                      onPress={() => switchTemplate(item)}
                    >
                      <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                      <View style={styles.tpRowContent}>
                        <Text style={[styles.tpRowName, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.isDefault && (
                          <Text style={[styles.tpRowBadge, { color: colors.accent }]}>Default</Text>
                        )}
                      </View>
                      {activeTemplate?.id === item.id && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                      )}
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showDetailModal} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { cleanupRecording(); setShowDetailModal(false); setSelectedEntry(null); }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]} numberOfLines={1}>Entry Details</Text>
            <View style={styles.detailActions}>
              <TouchableOpacity onPress={() => selectedEntry && openEditModal(selectedEntry)} style={styles.detailActionBtn}>
                <Ionicons name="create-outline" size={22} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => selectedEntry && handleDeleteEntry(selectedEntry)} style={styles.detailActionBtn}>
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>

          {selectedEntry && (
            <ScrollView contentContainerStyle={styles.detailContent}>
              {selectedEntry._isOffline && (
                <View style={[styles.offlineDetailTag, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b' }]}>
                  <Ionicons name="cloud-offline-outline" size={16} color="#f59e0b" />
                  <Text style={{ color: '#f59e0b', marginLeft: 6, fontWeight: '500' }}>Pending sync</Text>
                </View>
              )}

              <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedEntry.title}</Text>
              <Text style={[styles.detailDate, { color: colors.secondary }]}>
                {formatDateTime(selectedEntry.entryDateTime)}
              </Text>

              {selectedEntry.createdByName && (
                <View style={styles.detailMeta}>
                  <Ionicons name="person-outline" size={16} color={colors.secondary} />
                  <Text style={[styles.detailMetaText, { color: colors.secondary }]}>{selectedEntry.createdByName}</Text>
                </View>
              )}

              <View style={styles.detailMeta}>
                <Ionicons name="briefcase-outline" size={16} color={colors.secondary} />
                <Text style={[styles.detailMetaText, { color: colors.secondary }]}>{getProjectLabel(selectedEntry.projectId)}</Text>
              </View>

              {selectedEntry.weather && (selectedEntry.weather.condition || selectedEntry.weather.temp !== undefined) && (
                <View style={[styles.weatherCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name={getWeatherIcon(selectedEntry.weather.condition) as any} size={24} color={colors.accent} />
                  <View style={styles.weatherCardInfo}>
                    {selectedEntry.weather.condition && (
                      <Text style={[styles.weatherCardText, { color: colors.text }]}>{selectedEntry.weather.condition}</Text>
                    )}
                    {selectedEntry.weather.temp !== undefined && (
                      <Text style={[styles.weatherCardTemp, { color: colors.secondary }]}>{selectedEntry.weather.temp}°C</Text>
                    )}
                  </View>
                </View>
              )}

              {activeTemplate && activeTemplate.fields.length > 0 && (
                <View style={[styles.detailSection, { borderTopColor: colors.border }]}>
                  {activeTemplate.fields
                    .sort((a, b) => a.order - b.order)
                    .map(field => renderDetailFieldValue(field, selectedEntry.fieldValues?.[field.id]))}
                </View>
              )}

              {selectedEntry.fieldValues?._voiceNotes && selectedEntry.fieldValues._voiceNotes.length > 0 && (
                <View style={[styles.detailSection, { borderTopColor: colors.border }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Voice Notes</Text>
                  {selectedEntry.fieldValues._voiceNotes.map((uri: string, idx: number) => (
                    <View key={idx} style={[styles.voiceNoteItem, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <TouchableOpacity
                        style={[styles.vnPlayBtn, { backgroundColor: colors.accent }]}
                        onPress={() => playVoiceNote(uri)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={playingVoiceNote === uri ? 'pause' : 'play'} size={16} color="#ffffff" />
                      </TouchableOpacity>
                      <View style={styles.vnInfo}>
                        <Text style={[styles.vnTitle, { color: colors.text }]}>Voice Note {idx + 1}</Text>
                        {playingVoiceNote === uri && playbackDuration > 0 && (
                          <Text style={[styles.vnDuration, { color: colors.secondary }]}>
                            {formatRecordingTime(Math.floor(playbackPosition / 1000))} / {formatRecordingTime(Math.floor(playbackDuration / 1000))}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {selectedEntry.overallPhotos && selectedEntry.overallPhotos.length > 0 && (
                <View style={[styles.detailSection, { borderTopColor: colors.border }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Photos</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                    {selectedEntry.overallPhotos.map((uri, idx) => (
                      <Image key={idx} source={{ uri: getPhotoUrl(uri) }} style={styles.detailPhoto} />
                    ))}
                  </ScrollView>
                </View>
              )}
            </ScrollView>
          )}
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
              data={getSortedProjectItems(projects)}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => {
                if (item.isHeader) {
                  return (
                    <View style={[styles.phaseSectionHeader, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                      <Text style={[styles.phaseSectionText, { color: colors.secondary }]}>{item.label}</Text>
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    style={[styles.projectPickerRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }]}
                    onPress={() => {
                      setFilterProjectId(item.id);
                      setShowFilterPicker(false);
                    }}
                  >
                    <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                    <Text style={[styles.projectPickerName, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {filterProjectId === item.id && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              }}
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
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalHeaderBtn: {
    fontSize: 16,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  formContent: {
    padding: 16,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 10,
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
  sectionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoScroll: {
    marginTop: 4,
  },
  photoThumbContainer: {
    marginRight: 10,
    position: 'relative',
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  addPhotoText: {
    fontSize: 11,
    marginTop: 2,
  },
  voiceNotesSection: {
    marginBottom: 16,
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  recordBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  recordingIndicator: {
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordingLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  stopBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceNoteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    gap: 10,
  },
  vnPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vnInfo: {
    flex: 1,
  },
  vnTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  vnDuration: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  detailActions: {
    flexDirection: 'row',
    gap: 12,
  },
  detailActionBtn: {
    padding: 4,
  },
  detailContent: {
    padding: 16,
    paddingBottom: 32,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailDate: {
    fontSize: 14,
    marginBottom: 12,
  },
  detailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  detailMetaText: {
    fontSize: 14,
  },
  offlineDetailTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 12,
  },
  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  weatherCardInfo: {},
  weatherCardText: {
    fontSize: 15,
    fontWeight: '500',
  },
  weatherCardTemp: {
    fontSize: 13,
    marginTop: 2,
  },
  detailSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    marginTop: 8,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailField: {
    marginBottom: 14,
  },
  detailFieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  detailFieldValue: {
    fontSize: 15,
  },
  checkboxDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailPhoto: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 10,
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
  phaseSectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  phaseSectionText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    backgroundColor: '#b196d2',
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
  templateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  templateBarText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  tpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  tpSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    minHeight: 200,
  },
  tpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  tpHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  tpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  tpRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tpRowName: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  tpRowBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  viewToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  viewToggleBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  feedDateHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  feedDateHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
