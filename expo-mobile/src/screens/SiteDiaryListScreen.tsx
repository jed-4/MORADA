import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest, API_BASE_URL, isPermanentError } from '../services/api';
import { isOnline, addToQueue, getQueue, saveQueue, syncQueue, addSyncListener } from '../services/offlineQueue';
import {
  getOfflineDiaryEntries,
  saveOfflineDiaryEntries,
  removeOfflineDiaryEntry,
  DIARY_LIST_OFFLINE_KEY,
} from '../services/diaryOffline';
import { toLocalDateStr, dateStrOf, localDayISOString } from '../lib/dates';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme';
import { useLayout } from '../lib/useLayout';
import { sheetFrame } from '../components/ui/Sheet';
import { TwoPane, LIST_PANE_WIDTH } from '../components/ui/TwoPane';
import { readableFrame } from '../components/ui/ReadableColumn';
import { DiaryPhotoGallery, DiaryPhotoViewer } from '../components/diary/DiaryPhotos';
import { useDirtyGuard } from '../lib/useDirtyGuard';
import { useKeyboardAwareScroll } from '../lib/useKeyboardAwareScroll';
import { haptic } from '../lib/haptics';
import { PhotoUploadError } from '../lib/photosUpload';
import { useDiaryPhotos, collectLocalPhotoUris, mapPhotoUris, isLocalPhotoUri } from '../components/diary/useDiaryPhotos';
import { DiaryFormPhoto, DIARY_FORM_THUMB } from '../components/diary/DiaryFormPhoto';
import { useDiaryWeatherPrefill } from '../components/diary/diaryWeather';
import { useFieldFocusChain } from '../components/diary/useFieldFocusChain';
import { PendingUploadsBanner } from '../components/photo/PendingUploadsBanner';
import { BottomActionBar, BOTTOM_ACTION_BAR_HEIGHT } from '../components/form/BottomActionBar';
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
    Object.entries(entry.fieldValues).forEach(([key, val]) => {
      if (key.startsWith('_')) return; // internal keys are not photos
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && (val[0].startsWith('http') || val[0].startsWith('file') || val[0].startsWith('/'))) {
        count += val.length;
      }
    });
  }
  return count;
}

type FeedItem =
  | { type: 'header'; dateKey: string }
  | { type: 'entry'; entry: SiteDiaryEntry };

const SWIPE_THRESHOLD = 50;

export default function SiteDiaryListScreen({ navigation }: Props) {
  const { user } = useAuth();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<SiteDiaryEntry[]>([]);
  const [offlineEntries, setOfflineEntries] = useState<SiteDiaryEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [template, setTemplate] = useState<SiteDiaryTemplate | null>(null);
  const [allTemplates, setAllTemplates] = useState<SiteDiaryTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<SiteDiaryTemplate | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);
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
  const [formDateTime, setFormDateTime] = useState(localDayISOString());
  const [formFieldValues, setFormFieldValues] = useState<Record<string, any>>({});
  const [formOverallPhotos, setFormOverallPhotos] = useState<string[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // Per-photo upload progress / Retry / "Waiting to send" + Mark up.
  const diaryPhotos = useDiaryPhotos();
  // New entries: fill the template's weather fields from the site forecast
  // once a project is picked.
  const weatherPrefill = useDiaryWeatherPrefill(setFormFieldValues);
  // Return key "Next": title, then the template's typed fields in order.
  const focusChain = useFieldFocusChain([
    'title',
    ...[...(activeTemplate?.fields || [])]
      .sort((a, b) => a.order - b.order)
      .filter(f => f.type === 'text' || f.type === 'textarea' || f.type === 'number' || f.type === 'date')
      .map(f => f.id),
  ]);

  const translateX = useRef(new Animated.Value(0)).current;

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
    danger: theme.statusDanger,
    success: theme.statusSuccess,
};

  // The pan responder below is created once and keeps the first goToDay it
  // saw, so the width is read through a ref — otherwise a fold/unfold would
  // leave the slide animation using the old screen width.
  const { width: screenWidth, isWide } = useLayout();
  const screenWidthRef = useRef(screenWidth);
  // Unfolded, the day list is the left pane, so slide it by the pane's width.
  screenWidthRef.current = isWide ? LIST_PANE_WIDTH : screenWidth;

  // Full-screen photo viewer (phone and big screen). Kept here, not in the
  // gallery, so it survives the detail moving between the right pane and the
  // full-screen modal when the phone folds or unfolds.
  const [viewer, setViewer] = useState<{ uris: string[]; index: number } | null>(null);

  // New/edit entry form: everything the user can change, so leaving with a
  // half-written entry (Cancel, Android back) asks before throwing it away.
  const entryDirty = useDirtyGuard(
    { formTitle, formProjectId, formDateTime, formFieldValues, formOverallPhotos, templateId: activeTemplate?.id },
    showEntryModal,
  );
  const closeEntryModal = () => {
    setShowEntryModal(false);
    resetForm();
  };
  const cancelEntryModal = () => entryDirty.guard(closeEntryModal);
  // Scrolls the focused field back above the keyboard (the KeyboardAvoidingView
  // shrinks the form but doesn't scroll to the field you tapped).
  // Extra room for the Save bar pinned above the keyboard.
  const entryKb = useKeyboardAwareScroll({ extraSpace: 24 + BOTTOM_ACTION_BAR_HEIGHT });

  // Duo unfolded: short form fields pair up two per row. Only these styles
  // change with the fold — the tree doesn't — so half-typed fields survive it.
  const halfField = isWide ? styles.halfField : null;
  const fullField = isWide ? styles.fullField : null;

  const goToDay = useCallback((direction: number) => {
    const SCREEN_WIDTH = screenWidthRef.current;
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
    setOfflineEntries(await getOfflineDiaryEntries(DIARY_LIST_OFFLINE_KEY));
  }, []);

  const saveOfflineEntries = useCallback(async (items: SiteDiaryEntry[]) => {
    await saveOfflineDiaryEntries(DIARY_LIST_OFFLINE_KEY, items);
    setOfflineEntries(items);
  }, []);

  // Projects and templates rarely change — fetch them once (previously they
  // were refetched on every focus and every day swipe).
  const fetchStaticData = useCallback(async () => {
    try {
      const [projectsData, templatesData] = await Promise.all([
        apiFetch<Project[]>('/api/projects').catch(() => []),
        user?.companyId
          ? apiFetch<SiteDiaryTemplate[]>(`/api/site-diary-templates?companyId=${user.companyId}`).catch(() => [])
          : Promise.resolve([]),
      ]);
      setProjects(projectsData || []);
      if (templatesData && templatesData.length > 0) {
        setAllTemplates(templatesData);
        const defaultTpl = templatesData.find(t => t.isDefault) || templatesData[0];
        setTemplate(prev => prev || defaultTpl);
        setActiveTemplate(prev => prev || defaultTpl);
      } else if (user?.companyId) {
        apiFetch<SiteDiaryTemplate>(`/api/site-diary-templates/default/${user.companyId}`)
          .then(t => { if (t) setTemplate(prev => prev || t); })
          .catch(() => {});
      }
    } catch (e) {
      console.error('Failed to fetch diary data:', e);
    }
  }, [user?.companyId]);

  const fetchEntries = useCallback(async () => {
    setDayLoading(true);
    try {
      const dateStr = toLocalDateStr(currentDate);
      const entriesData = await apiFetch<SiteDiaryEntry[]>(
        `/api/company/site-diary-entries?date=${dateStr}`
      ).catch(() => []);
      setEntries(entriesData || []);
    } finally {
      setLoading(false);
      setDayLoading(false);
    }
  }, [currentDate]);

  const fetchData = useCallback(async () => {
    await Promise.all([fetchStaticData(), fetchEntries()]);
  }, [fetchStaticData, fetchEntries]);

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
    fetchStaticData();
    loadOfflineEntries();
    fetchFeedData();
  }, [fetchStaticData, loadOfflineEntries, fetchFeedData]);

  // Refetch the day's entries only when the selected day changes (and on mount).
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Migrate any locally saved entries that were never enqueued (legacy bug —
  // offline creates used to be stored but never queued, so they never synced).
  useEffect(() => {
    (async () => {
      const items: SiteDiaryEntry[] = await getOfflineDiaryEntries(DIARY_LIST_OFFLINE_KEY);
      if (items.length === 0) return;
      const queue = await getQueue();
      const queuedIds = new Set(
        queue
          .filter(a => a.type === 'create-diary-entry')
          .map(a => a.payload?._offlineId)
          .filter(Boolean),
      );
      for (const entry of items) {
        if (queuedIds.has(entry.id)) continue;
        await addToQueue({
          type: 'create-diary-entry',
          payload: {
            templateId: entry.templateId || null,
            projectId: entry.projectId,
            title: entry.title,
            entryDateTime: entry.entryDateTime,
            fieldValues: entry.fieldValues,
            overallPhotos: entry.overallPhotos || [],
            weather: entry.weather,
            _offlineId: entry.id,
            _storageKey: DIARY_LIST_OFFLINE_KEY,
          },
        });
      }
    })();
  }, []);

  // Refresh after the app-level sync service drains the queue.
  useEffect(() => {
    const unsubscribe = addSyncListener(() => {
      loadOfflineEntries();
      isOnline().then(online => {
        if (online) {
          fetchEntries();
          fetchFeedData();
        }
      });
    });
    return unsubscribe;
  }, [loadOfflineEntries, fetchEntries, fetchFeedData]);

  // Only jump back to "today" on focus when the calendar day actually differs —
  // a new Date object on every focus used to force a full refetch each time.
  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (toLocalDateStr(new Date()) !== toLocalDateStr(currentDateRef.current)) {
        setCurrentDate(new Date());
      }
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

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach(p => map.set(p.id, p));
    return map;
  }, [projects]);

  const getProjectLabel = useCallback((projectId: string): string => {
    const p = projectMap.get(projectId);
    if (!p) return 'Unknown Project';
    return p.jobNumber ? `${p.jobNumber} - ${p.name}` : p.name;
  }, [projectMap]);

  // Shared by the day view and the feed so both search the same fields.
  const entryMatchesSearch = useCallback((entry: SiteDiaryEntry, q: string): boolean => {
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
    return !!(titleMatch || creatorMatch || projectMatch || weatherMatch || fieldMatch);
  }, [getProjectLabel]);

  const { filteredEntries, groupedByProject, sortedProjectIds } = useMemo(() => {
    const dateStr = toLocalDateStr(currentDate);
    const offlineForDay = offlineEntries.filter(e => dateStrOf(e.entryDateTime) === dateStr);

    const all: SiteDiaryEntry[] = [
      ...offlineForDay.map(e => ({ ...e, _isOffline: true })),
      ...entries.map(e => ({ ...e, _isOffline: false })),
    ];

    const q = searchQuery.trim().toLowerCase();
    const filtered = all.filter(entry => {
      if (filterProjectId && entry.projectId !== filterProjectId) return false;
      if (q && !entryMatchesSearch(entry, q)) return false;
      return true;
    });

    const grouped = new Map<string, SiteDiaryEntry[]>();
    filtered.forEach(entry => {
      const key = entry.projectId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    });

    const sorted = Array.from(grouped.keys()).sort((a, b) =>
      getProjectLabel(a).localeCompare(getProjectLabel(b))
    );

    return { filteredEntries: filtered, groupedByProject: grouped, sortedProjectIds: sorted };
  }, [entries, offlineEntries, searchQuery, filterProjectId, currentDate, entryMatchesSearch, getProjectLabel]);

  const resetForm = () => {
    setFormTitle('');
    setFormProjectId('');
    setFormDateTime(localDayISOString());
    setFormFieldValues({});
    setFormOverallPhotos([]);
    setIsEditMode(false);
    setSelectedEntry(null);
    diaryPhotos.reset();
    weatherPrefill.cancel();
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

  const buildDefaultTitle = (t: SiteDiaryTemplate | null, projectId: string): string => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = `${day}/${month}`;
    const templateName = t?.name || '';
    const projName = projectId ? (projectMap.get(projectId)?.name || '') : '';
    return projName ? `${projName} - ${templateName} - ${dateStr}` : `${templateName} - ${dateStr}`;
  };

  const switchTemplate = (t: SiteDiaryTemplate) => {
    setActiveTemplate(t);
    applyTemplateDefaults(t);
    if (!isEditMode) {
      setFormTitle(buildDefaultTitle(t, formProjectId));
      // The defaults above cleared the fields: fill the new template's weather.
      weatherPrefill.prefill(formProjectId, t.fields);
    }
    setShowTemplatePicker(false);
  };

  const openCreateModal = () => {
    // Wide: "+" is reachable while an entry is open on the right. Close it,
    // or folding later would show an empty detail modal (resetForm clears it).
    setShowDetailModal(false);
    resetForm();
    const defaultTpl = allTemplates.find(t => t.isDefault) || allTemplates[0] || template;
    setActiveTemplate(defaultTpl);
    applyTemplateDefaults(defaultTpl);
    setFormTitle(buildDefaultTitle(defaultTpl, ''));
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
    // Photos still on this device (an entry saved offline) get upload state;
    // an entry already in the queue shows them as "Waiting to send".
    diaryPhotos.reset();
    diaryPhotos.track(collectLocalPhotoUris(entry), { queued: entry.id.startsWith('_offline_') });
    const entryTemplate = allTemplates.find(t => t.id === entry.templateId) || template;
    setActiveTemplate(entryTemplate);
    setShowDetailModal(false);
    setShowEntryModal(true);
  };

  // On the Duo unfolded the open entry shows in the right pane instead of the
  // modal (the modal is hidden while wide). Both read the same two flags, so
  // folding with an entry open brings up its modal, and unfolding with the
  // modal up moves it to the pane — you keep your place either way.
  const openDetailModal = (entry: SiteDiaryEntry) => {
    setSelectedEntry(entry);
    setShowDetailModal(true);
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    setSelectedEntry(null);
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
    // Upload state for its thumbnail (a photo over the field's limit is
    // tracked but never in the form, so it is never sent).
    diaryPhotos.track([uri]);
  };

  // Mark up a photo still on this device; the edited copy takes its place.
  const markupPhotoAt = async (fieldId: string | null, index: number, uri: string) => {
    const edited = await diaryPhotos.markup(uri);
    if (!edited) return;
    const swap = (list: string[]) => list.map((u, i) => (i === index && u === uri ? edited : u));
    if (fieldId) {
      setFormFieldValues(prev => ({
        ...prev,
        [fieldId]: Array.isArray(prev[fieldId]) ? swap(prev[fieldId]) : prev[fieldId],
      }));
    } else {
      setFormOverallPhotos(prev => swap(prev));
    }
  };

  const renderFormPhoto = (fieldId: string | null, uri: string, idx: number) => (
    <DiaryFormPhoto
      key={`${idx}:${uri}`}
      index={idx}
      imageUri={getPhotoUrl(uri)}
      item={diaryPhotos.itemFor(uri)}
      busy={submitting}
      dangerColor={colors.danger}
      onRemove={() => removePhoto(fieldId, idx)}
      onRetry={() => { haptic.light(); diaryPhotos.retry(uri); }}
      onMarkup={diaryPhotos.canMarkup && isLocalPhotoUri(uri) ? () => markupPhotoAt(fieldId, idx, uri) : undefined}
    />
  );

  const removePhoto = (fieldId: string | null, index: number) => {
    const list = fieldId ? formFieldValues[fieldId] : formOverallPhotos;
    const removed = Array.isArray(list) ? list[index] : undefined;
    if (typeof removed === 'string') diaryPhotos.untrack(removed);
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

  const getPhotoUrl = (path: string): string => {
    if (path.startsWith('http') || path.startsWith('file://') || path.startsWith('content://')) return path;
    return `${API_BASE_URL}/api/uploads/serve/${encodeURIComponent(path)}`;
  };

  // Build the entry payload from the current form state.
  const buildEntryPayload = () => {
    const fieldValues = { ...formFieldValues };
    return {
      templateId: activeTemplate?.id || template?.id || null,
      projectId: formProjectId,
      title: formTitle.trim(),
      entryDateTime: formDateTime,
      fieldValues,
      overallPhotos: formOverallPhotos,
    };
  };

  // Update the still-pending queued create for a local-only entry in place.
  // Returns false if the queue no longer holds it (already synced).
  const updateQueuedCreate = async (offlineId: string, payload: any): Promise<boolean> => {
    const queue = await getQueue();
    const action = queue.find(
      a => a.type === 'create-diary-entry' && a.payload?._offlineId === offlineId,
    );
    if (!action) return false;
    action.payload = { ...payload, _offlineId: offlineId, _storageKey: DIARY_LIST_OFFLINE_KEY };
    action.status = 'pending';
    action.retryCount = 0;
    action.error = undefined;
    await saveQueue(queue);
    return true;
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

    const missingRequired = (activeTemplate?.fields || [])
      .filter(f => f.required)
      .filter(f => {
        const v = formFieldValues[f.id];
        if (f.type === 'checkbox') return false;
        if (f.type === 'photo-gallery') return !Array.isArray(v) || v.length === 0;
        return v === undefined || v === null || String(v).trim() === '';
      });
    if (missingRequired.length > 0) {
      Alert.alert(
        'Missing Required Fields',
        `Please fill in: ${missingRequired.map(f => f.title).join(', ')}`,
      );
      return;
    }

    setSubmitting(true);
    const formPayload = buildEntryPayload();
    try {
      const online = await isOnline();

      if (!online) {
        await saveOffline(formPayload);
        return;
      }

      // ONLINE. Editing an entry that only exists locally: if its queued
      // create is still pending, update it in place (the queue handles the
      // uploads) and drain the queue now.
      if (isEditMode && selectedEntry?.id.startsWith('_offline_')) {
        const payload = await payloadForQueue(formPayload);
        const updatedInQueue = await updateQueuedCreate(selectedEntry.id, payload);
        if (updatedInQueue) {
          const updated = offlineEntries.map(e =>
            e.id === selectedEntry.id
              // payload.templateId is string | null; SiteDiaryEntry.templateId is
              // string, so keep the existing id when payload has none (mirrors the
              // `payload.templateId || ''` coercion used when creating the entry).
              ? { ...e, ...payload, templateId: payload.templateId || e.templateId, updatedAt: new Date().toISOString() }
              : e,
          );
          await saveOfflineEntries(updated);
          setShowEntryModal(false);
          resetForm();
          syncQueue().then(() => {
            fetchData();
            fetchFeedData();
            loadOfflineEntries();
          });
          return;
        }
        // No queued create (already synced or legacy) — fall through and POST
        // it now, removing the local copy on success so it doesn't duplicate.
      }

      // Photos go up one at a time with a ring on each thumbnail. One that
      // already went up on an earlier attempt isn't sent again. Throws
      // (PhotoUploadError) before anything is saved if a photo fails — a
      // device-local URI must never reach the server.
      const uploadedMap = await diaryPhotos.uploadLocal(collectLocalPhotoUris(formPayload));
      const body: any = mapPhotoUris(formPayload, uploadedMap);

      if (isEditMode && selectedEntry && !selectedEntry.id.startsWith('_offline_')) {
        await apiRequest(`/api/site-diary-entries/${selectedEntry.id}`, 'PATCH', body);
      } else {
        await apiRequest('/api/site-diary-entries', 'POST', body);
        if (isEditMode && selectedEntry?.id.startsWith('_offline_')) {
          await removeOfflineDiaryEntry(DIARY_LIST_OFFLINE_KEY, selectedEntry.id);
          await loadOfflineEntries();
        }
      }

      haptic.success();
      setShowEntryModal(false);
      resetForm();
      await fetchData();
      fetchFeedData();
    } catch (e: any) {
      const cause = e instanceof PhotoUploadError ? e.cause : e;
      haptic.error();
      if (isPermanentError(cause)) {
        // The server said no — keeping it for later won't change that.
        Alert.alert('Error', (cause as Error)?.message || 'Failed to save diary entry. Please try again.');
      } else {
        // Most likely patchy signal on site: offer to keep it and send later.
        Alert.alert(
          "Couldn't Send",
          `${e instanceof PhotoUploadError ? e.message : 'The diary entry could not be sent.'} Check your connection, or save it and it will send by itself when you're back online.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => { handleSaveEntry(); } },
            {
              text: 'Send Later',
              onPress: () => {
                saveOffline(formPayload).catch((err: any) =>
                  Alert.alert('Error', err?.message || 'Could not save the entry for later.'),
                );
              },
            },
          ],
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  // The form's photos, made ready to wait in the offline queue: photos that
  // already uploaded become their server path (never sent twice), the rest
  // are copied somewhere permanent (and deleted by the queue once sent).
  const payloadForQueue = async <T extends ReturnType<typeof buildEntryPayload>>(formPayload: T) => {
    const { map, persisted } = await diaryPhotos.prepareForQueue(collectLocalPhotoUris(formPayload));
    const payload = mapPhotoUris(formPayload, map) as T & { _persistedPhotos?: string[] };
    if (persisted.length) payload._persistedPhotos = persisted;
    return payload;
  };

  // Keep the entry on the phone and queue it; the app-level sync sends it
  // when there's signal (and the "waiting to send" banner shows it meanwhile).
  const saveOffline = async (formPayload: ReturnType<typeof buildEntryPayload>) => {
    const payload = await payloadForQueue(formPayload);
    if (isEditMode && selectedEntry && !selectedEntry.id.startsWith('_offline_')) {
      // Offline edit of a server entry — queue a PATCH. The queue uploads
      // any local photo assets before sending.
      await addToQueue({
        type: 'edit-diary-entry',
        payload: { id: selectedEntry.id, ...payload },
      });
      Alert.alert('Queued for Sync', 'Your edit will be synced when you reconnect.');
    } else {
      const isOfflineEdit = !!(isEditMode && selectedEntry?.id.startsWith('_offline_'));
      const entryId = isOfflineEdit
        ? selectedEntry!.id
        : `_offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const offlineEntry: SiteDiaryEntry = {
        id: entryId,
        templateId: payload.templateId || '',
        projectId: payload.projectId,
        title: payload.title,
        entryDateTime: payload.entryDateTime,
        fieldValues: payload.fieldValues,
        overallPhotos: payload.overallPhotos,
        createdBy: user?.id,
        createdByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : undefined,
        createdAt: selectedEntry?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updated = isOfflineEdit
        ? offlineEntries.map(e => (e.id === entryId ? offlineEntry : e))
        : [...offlineEntries, offlineEntry];
      await saveOfflineEntries(updated);

      // Keep the queued create in step with the local copy.
      const updatedInQueue = isOfflineEdit && (await updateQueuedCreate(entryId, payload));
      if (!updatedInQueue) {
        await addToQueue({
          type: 'create-diary-entry',
          payload: { ...payload, _offlineId: entryId, _storageKey: DIARY_LIST_OFFLINE_KEY },
        });
      }
      Alert.alert('Saved Offline', 'Your diary entry has been saved locally and will sync when you have a connection.');
    }

    haptic.success();
    setShowEntryModal(false);
    resetForm();
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
              // Drop the queued create too, or the queue would still POST it.
              const queue = await getQueue();
              await saveQueue(
                queue.filter(
                  a => !(a.type === 'create-diary-entry' && a.payload?._offlineId === entry.id),
                ),
              );
              const updated = offlineEntries.filter(e => e.id !== entry.id);
              await saveOfflineEntries(updated);
            } else {
              const online = await isOnline();
              if (online) {
                await apiRequest(`/api/site-diary-entries/${entry.id}`, 'DELETE', {});
                await fetchData();
                fetchFeedData();
              } else {
                await addToQueue({ type: 'delete-diary-entry', payload: { id: entry.id } });
                setEntries(prev => prev.filter(e => e.id !== entry.id));
                Alert.alert('Queued', 'Deletion will sync when you reconnect.');
              }
            }
            setShowDetailModal(false);
            setSelectedEntry(null);
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not delete entry.');
          }
        },
      },
    ]);
  };

  const renderFieldInput = (field: TemplateField) => {
    const value = formFieldValues[field.id];
    const last = focusChain.isLast(field.id);
    // Single-line fields: Return moves to the next field, "done" on the last.
    const chainProps = {
      ref: focusChain.ref(field.id),
      returnKeyType: last ? ('done' as const) : ('next' as const),
      submitBehavior: last ? ('blurAndSubmit' as const) : ('submit' as const),
      onSubmitEditing: () => focusChain.next(field.id),
    };

    switch (field.type) {
      case 'text':
        return (
          <View key={field.id} style={[styles.fieldContainer, halfField]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              {...chainProps}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={colors.secondary}
              autoCapitalize="sentences"
              autoCorrect
            />
          </View>
        );

      case 'textarea':
        // Long prose: multiline with autocorrect so the keyboard's dictation
        // mic works. Return adds a new line (no "next" here).
        return (
          <View key={field.id} style={[styles.fieldContainer, fullField]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              ref={focusChain.ref(field.id)}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, styles.textArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={colors.secondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoCapitalize="sentences"
              autoCorrect
            />
          </View>
        );

      case 'number':
        return (
          <View key={field.id} style={[styles.fieldContainer, halfField]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              {...chainProps}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value?.toString() || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={colors.secondary}
              keyboardType="decimal-pad"
            />
          </View>
        );

      case 'date':
        return (
          <View key={field.id} style={[styles.fieldContainer, halfField]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              {...chainProps}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.secondary}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        );

      case 'select':
        return (
          <View key={field.id} style={[styles.fieldContainer, fullField]}>
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
          <View key={field.id} style={[styles.fieldContainer, styles.switchRow, halfField]}>
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
          <View key={field.id} style={[styles.fieldContainer, fullField]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title} ({photos.length}/{maxPhotos})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.map((uri, idx) => renderFormPhoto(field.id, uri, idx))}
              {photos.length < maxPhotos && (
                <TouchableOpacity
                  style={[styles.addPhotoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={() => pickPhoto(field.id)}
                  disabled={submitting}
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
            <DiaryPhotoGallery
              uris={value}
              getUrl={getPhotoUrl}
              onOpen={index => setViewer({ uris: value, index })}
              thumbStyle={styles.detailPhoto}
              scrollStyle={styles.photoScroll}
            />
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

  const filteredFeedItems = useMemo(() => {
    const allFeedEntries: SiteDiaryEntry[] = [
      ...feedEntries,
      ...offlineEntries.map(e => ({ ...e, _isOffline: true })),
    ];
    const feedByDate = new Map<string, SiteDiaryEntry[]>();
    allFeedEntries.forEach(entry => {
      const dateKey = dateStrOf(entry.entryDateTime) || 'unknown';
      if (!feedByDate.has(dateKey)) feedByDate.set(dateKey, []);
      feedByDate.get(dateKey)!.push(entry);
    });
    const feedDateKeys = Array.from(feedByDate.keys()).sort((a, b) => b.localeCompare(a));

    const q = searchQuery.trim().toLowerCase();
    const items: FeedItem[] = [];
    feedDateKeys.forEach(dateKey => {
      const dayEntries = (feedByDate.get(dateKey) || [])
        .filter(e => {
          if (filterProjectId && e.projectId !== filterProjectId) return false;
          if (q && !entryMatchesSearch(e, q)) return false;
          return true;
        })
        .sort((a, b) => b.entryDateTime.localeCompare(a.entryDateTime));
      if (dayEntries.length > 0) {
        items.push({ type: 'header', dateKey });
        dayEntries.forEach(entry => items.push({ type: 'entry', entry }));
      }
    });
    return items;
  }, [feedEntries, offlineEntries, searchQuery, filterProjectId, entryMatchesSearch]);

  // The detail modal must render the fields of the ENTRY's template, not the
  // one currently active in the form.
  const detailTemplate = selectedEntry
    ? allTemplates.find(t => t.id === selectedEntry.templateId) || template
    : null;

  // The open entry's body — shared by the phone's full-screen modal and the
  // right pane on the Duo unfolded. Long diary text is capped at a readable
  // width (no effect on a phone; it only bites in a wide full-screen view).
  const renderDetailBody = () => {
    if (!selectedEntry) return null;
    return (
      <ScrollView contentContainerStyle={[styles.detailContent, readableFrame]}>
        {selectedEntry._isOffline && (
          <View style={[styles.offlineDetailTag, { backgroundColor: theme.statusWarningBg, borderColor: theme.statusWarning }]}>
            <Ionicons name="cloud-offline-outline" size={16} color={theme.statusWarning} />
            <Text style={{ color: theme.statusWarning, marginLeft: 6, fontWeight: '500' }}>Pending sync</Text>
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

        {detailTemplate && detailTemplate.fields.length > 0 && (
          <View style={[styles.detailSection, { borderTopColor: colors.border }]}>
            {[...detailTemplate.fields]
              .sort((a, b) => a.order - b.order)
              .map(field => renderDetailFieldValue(field, selectedEntry.fieldValues?.[field.id]))}
          </View>
        )}

        {selectedEntry.overallPhotos && selectedEntry.overallPhotos.length > 0 && (
          <View style={[styles.detailSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Photos</Text>
            <DiaryPhotoGallery
              uris={selectedEntry.overallPhotos}
              getUrl={getPhotoUrl}
              onOpen={index => setViewer({ uris: selectedEntry.overallPhotos || [], index })}
              thumbStyle={styles.detailPhoto}
              scrollStyle={styles.photoScroll}
            />
          </View>
        )}
      </ScrollView>
    );
  };

  const renderDetailActions = () => (
    <View style={styles.detailActions}>
      <TouchableOpacity onPress={() => selectedEntry && openEditModal(selectedEntry)} style={[styles.detailEditBtn, { backgroundColor: colors.accent }]}>
        <Ionicons name="create-outline" size={18} color="#ffffff" />
        <Text style={styles.detailEditBtnText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => selectedEntry && handleDeleteEntry(selectedEntry)} style={styles.detailActionBtn}>
        <Ionicons name="trash-outline" size={22} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  // One viewer per place it can be presented from; `show` picks the one for
  // the current size, and the open photo + index live in `viewer` above.
  const renderViewer = (show: boolean) => (
    <DiaryPhotoViewer
      visible={show && !!viewer}
      uris={viewer?.uris ?? []}
      index={viewer?.index ?? 0}
      getUrl={getPhotoUrl}
      onIndexChange={index => setViewer(v => (v ? { ...v, index } : v))}
      onClose={() => setViewer(null)}
    />
  );

  // Wide only: outline the entry that's open in the right pane.
  const isOpenInPane = (entry: SiteDiaryEntry) =>
    isWide && showDetailModal && selectedEntry?.id === entry.id;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Entries on the left, the open entry on the right when wide. The list
          (search text, filters, scroll) stays the first child at every size,
          so folding never remounts it. */}
      <TwoPane
        emptyTitle="Select an entry"
        emptyIcon="book-outline"
        detail={showDetailModal && selectedEntry ? (
          <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
            <View style={[styles.modalHeader, styles.paneHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={closeDetail} accessibilityLabel="Close entry">
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]} numberOfLines={1}>Entry Details</Text>
              {renderDetailActions()}
            </View>
            {renderDetailBody()}
          </View>
        ) : null}
        list={
      <>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Site Diary</Text>
        <TouchableOpacity
          onPress={() => openCreateModal()}
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
          <View style={[styles.viewToggle, { backgroundColor: theme.nav, borderColor: colors.border }]}>
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
            returnKeyType="search"
            autoCapitalize="none"
            clearButtonMode="never"
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
        <View style={[styles.activeFilter, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.activeFilterText, { color: colors.accent }]} numberOfLines={1}>
            {getProjectLabel(filterProjectId)}
          </Text>
          <TouchableOpacity onPress={() => setFilterProjectId(null)}>
            <Ionicons name="close-circle" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      {!networkOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: theme.statusWarningBg }]}>
          <Ionicons name="cloud-offline" size={14} color={theme.statusWarning} />
          <Text style={[styles.offlineBannerText, { color: theme.statusWarning }]}>
            Offline{pendingCount > 0 ? ` \u00B7 ${pendingCount} pending` : ''}
          </Text>
        </View>
      )}

      {/* Diary photos sitting in the offline queue (every project, or the
          filtered one), with Send now / Retry. */}
      <PendingUploadsBanner
        projectId={filterProjectId || undefined}
        types={['create-diary-entry', 'edit-diary-entry']}
        noun="diary upload"
        style={styles.pendingBanner}
      />

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
            // Re-render rows when the entry open in the right pane changes (outline).
            extraData={showDetailModal ? selectedEntry?.id : null}
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
                  style={[styles.entryCard, { backgroundColor: colors.card, borderColor: entry._isOffline ? theme.statusWarning : isOpenInPane(entry) ? colors.accent : colors.border, marginHorizontal: 16 }]}
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
                          <Ionicons name="cloud-offline" size={14} color={theme.statusWarning} style={{ marginRight: 4 }} />
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
          <>
          {dayLoading && (
            <View style={{ paddingVertical: 6, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          )}
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
                      <View style={[styles.projectHeader, { backgroundColor: theme.nav }]}>
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
                          style={[styles.entryCard, { backgroundColor: colors.card, borderColor: entry._isOffline ? theme.statusWarning : isOpenInPane(entry) ? colors.accent : colors.border }]}
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
                                  <Ionicons name="cloud-offline" size={14} color={theme.statusWarning} style={{ marginRight: 4 }} />
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
          </>
        )}
      </Animated.View>
      )}
      </>
        }
      />

      <Modal visible={showEntryModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancelEntryModal}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={cancelEntryModal}>
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
              style={[styles.templateBar, { backgroundColor: theme.nav, borderBottomColor: colors.border }]}
              onPress={() => setShowTemplatePicker(true)}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.accent} />
              <Text style={[styles.templateBarText, { color: colors.text }]} numberOfLines={1}>
                {activeTemplate?.name || 'Default Template'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondary} />
            </TouchableOpacity>
          )}

          {/* readableFrame keeps the full-screen form to a sensible column on
              the Duo unfolded; a phone is narrower than its cap. */}
          <ScrollView {...entryKb.scrollProps} contentContainerStyle={[styles.formContent, readableFrame]}>
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Title *</Text>
              <TextInput
                ref={focusChain.ref('title')}
                onFocus={entryKb.onInputFocus}
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Entry title"
                placeholderTextColor={colors.secondary}
                autoCapitalize="sentences"
                autoCorrect
                returnKeyType={focusChain.isLast('title') ? 'done' : 'next'}
                submitBehavior={focusChain.isLast('title') ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => focusChain.next('title')}
              />
            </View>

            {/* Project + Date / Time side by side when wide. The wrapper is
                always here (unstyled on a phone) so the tree doesn't change. */}
            <View style={isWide ? styles.fieldGrid : undefined}>
            <View style={[styles.fieldContainer, halfField]}>
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

            <View style={[styles.fieldContainer, halfField]}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Date / Time</Text>
              <View style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, justifyContent: 'center' }]}>
                <Text style={{ color: colors.text }}>{formatDateTime(formDateTime)}</Text>
              </View>
            </View>
            </View>

            {activeTemplate && activeTemplate.fields.length > 0 && (
              <>
                <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {activeTemplate.name || 'Template Fields'}
                  </Text>
                </View>
                <View style={isWide ? styles.fieldGrid : undefined}>
                  {[...activeTemplate.fields]
                    .sort((a, b) => a.order - b.order)
                    .map(field => renderFieldInput(field))}
                </View>
              </>
            )}

            <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Overall Photos</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {formOverallPhotos.map((uri, idx) => renderFormPhoto(null, uri, idx))}
              <TouchableOpacity
                style={[styles.addPhotoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => pickPhoto()}
                disabled={submitting}
              >
                <Ionicons name="camera-outline" size={28} color={colors.accent} />
                <Text style={[styles.addPhotoText, { color: colors.secondary }]}>Add</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Save in thumb reach, riding above the keyboard. The header Save
              stays too. */}
          <BottomActionBar
            label={isEditMode ? 'Save Changes' : 'Save Entry'}
            busyLabel={diaryPhotos.isUploading ? 'Uploading photos…' : 'Saving…'}
            onPress={handleSaveEntry}
            busy={submitting}
          />

          {/* Inside the form's modal: iOS can't present a root modal over it. */}
          {diaryPhotos.markupElement}

          <Modal visible={showProjectPicker} transparent animationType="slide">
            <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
              <View style={[styles.pickerSheet, sheetFrame, { backgroundColor: colors.card }]}>
                <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.pickerHeaderTitle, { color: colors.text }]}>
                    Select Project
                  </Text>
                  <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
                    <Ionicons name="close" size={24} color={colors.secondary} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={getSortedProjectItems(projects)}
                  keyExtractor={item => item.id}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  renderItem={({ item }) => {
                    if (item.isHeader) {
                      return (
                        <View style={[styles.phaseSectionHeader, { backgroundColor: theme.nav }]}>
                          <Text style={[styles.phaseSectionText, { color: colors.secondary }]}>{item.label}</Text>
                        </View>
                      );
                    }
                    return (
                      <TouchableOpacity
                        style={[styles.projectPickerRow, { borderBottomColor: colors.border }]}
                        onPress={() => {
                          setFormProjectId(item.id);
                          if (!isEditMode) {
                            setFormTitle(buildDefaultTitle(activeTemplate, item.id));
                            // New entry: that site's forecast into the weather fields.
                            weatherPrefill.prefill(item.id, activeTemplate?.fields);
                          }
                          setShowProjectPicker(false);
                        }}
                      >
                        <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                        <Text style={[styles.projectPickerName, { color: colors.text }]} numberOfLines={1}>
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
              <View style={[styles.tpSheet, sheetFrame, { backgroundColor: colors.card }]}>
                <View style={[styles.tpHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.tpHeaderTitle, { color: colors.text }]}>
                    Select Template
                  </Text>
                  <TouchableOpacity onPress={() => setShowTemplatePicker(false)}>
                    <Ionicons name="close" size={24} color={colors.secondary} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={[...allTemplates].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))}
                  keyExtractor={item => item.id}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.tpRow, { borderBottomColor: colors.border }]}
                      onPress={() => switchTemplate(item)}
                    >
                      <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                      <View style={styles.tpRowContent}>
                        <Text style={[styles.tpRowName, { color: colors.text }]} numberOfLines={1}>
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

      {/* Hidden while wide: the right pane shows the entry instead. */}
      <Modal visible={showDetailModal && !isWide} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={closeDetail}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]} numberOfLines={1}>Entry Details</Text>
            {renderDetailActions()}
          </View>

          {renderDetailBody()}
          {/* Phone-side copy of the viewer: iOS can't present a root-level
              modal over this one, so it lives inside. Wide uses the root copy. */}
          {renderViewer(!isWide)}
        </View>
      </Modal>

      {renderViewer(isWide)}

      <Modal visible={showFilterPicker} transparent animationType="slide">
        <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
          <View style={[styles.pickerSheet, sheetFrame, { backgroundColor: colors.card }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerHeaderTitle, { color: colors.text }]}>
                Filter by Project
              </Text>
              <TouchableOpacity onPress={() => setShowFilterPicker(false)}>
                <Ionicons name="close" size={24} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.projectPickerRow, { borderBottomColor: colors.border }]}
              onPress={() => { setFilterProjectId(null); setShowFilterPicker(false); }}
            >
              <Ionicons name="apps-outline" size={18} color={colors.secondary} />
              <Text style={[styles.projectPickerName, { color: colors.text }]}>
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
                    <View style={[styles.phaseSectionHeader, { backgroundColor: theme.nav }]}>
                      <Text style={[styles.phaseSectionText, { color: colors.secondary }]}>{item.label}</Text>
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    style={[styles.projectPickerRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      setFilterProjectId(item.id);
                      setShowFilterPicker(false);
                    }}
                  >
                    <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                    <Text style={[styles.projectPickerName, { color: colors.text }]} numberOfLines={1}>
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
          <View style={[styles.calendarSheet, sheetFrame, { backgroundColor: colors.card }]}>
            <View style={[styles.calendarHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerHeaderTitle, { color: colors.text }]}>
                Select Date
              </Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <Ionicons name="close" size={24} color={colors.secondary} />
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
              const todayStr = toLocalDateStr(new Date());
              const selectedStr = toLocalDateStr(currentDate);
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
  // The right-pane copy of the detail header sits under the app header, not
  // the status bar, so it doesn't need the modal's top inset.
  paneHeader: {
    paddingTop: 12,
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
  // Duo unfolded only: short fields two per row. A short field followed by a
  // long one grows to the full row, so nothing is left half-empty.
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
  },
  halfField: {
    flexBasis: '40%',
    flexGrow: 1,
  },
  fullField: {
    width: '100%',
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
  pendingBanner: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  addPhotoBtn: {
    // Matches DiaryFormPhoto (thumbnail size, and its top room for the remove button).
    width: DIARY_FORM_THUMB,
    height: DIARY_FORM_THUMB,
    marginTop: 6,
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
  detailActions: {
    flexDirection: 'row',
    gap: 12,
  },
  detailActionBtn: {
    padding: 4,
  },
  detailEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  detailEditBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: '#87749A',
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
