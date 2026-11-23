import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Pressable,
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

import { metrics, radii, size, space, tabular, type, useColors, useTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, Camera, Check, ChevronLeft, ChevronRight, CloudOff, Pencil, Search, SlidersHorizontal, Trash2, X } from 'lucide-react-native';
import {
  Card, DetailHeader, EmptyState, FAB, FAB_CLEARANCE, ListRow, ModalSheet, PageHeader, ProjectSquare, PropertyRow, Segmented, SheetHeader,
} from '../components/kit';
import { useLayout } from '../lib/useLayout';
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
import { VoiceInputButton } from '../components/VoiceInputButton';
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
  color?: string | null;
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
  const k = useColors();
  const insets = useSafeAreaInsets();
  // Revamp tokens for the form's inline colours.
  const colors = {
    bg: k.bg,
    card: k.surface,
    text: k.text,
    secondary: k.muted,
    border: k.border,
    accent: k.accent,
    muted: k.muted,
    inputBg: k.surface,
    danger: k.danger,
    success: k.status.done,
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
    { formTitle, formProjectId, formDateTime, formFieldValues: weatherPrefill.withoutAutoFilled(formFieldValues), formOverallPhotos, templateId: activeTemplate?.id },
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
            <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              {...chainProps}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={k.faint}
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
            <View style={styles.voiceLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.secondary, flexShrink: 1 }]}>
                {field.title}{field.required ? ' *' : ''}
              </Text>
              <VoiceInputButton
                value={value || ''}
                onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
                label={`Dictate ${field.title}`}
              />
            </View>
            <TextInput
              ref={focusChain.ref(field.id)}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, styles.textArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={k.faint}
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
            <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              {...chainProps}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value?.toString() || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder={field.title}
              placeholderTextColor={k.faint}
              keyboardType="decimal-pad"
            />
          </View>
        );

      case 'date':
        return (
          <View key={field.id} style={[styles.fieldContainer, halfField]}>
            <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              {...chainProps}
              onFocus={entryKb.onInputFocus}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={value || ''}
              onChangeText={text => setFormFieldValues(prev => ({ ...prev, [field.id]: text }))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={k.faint}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        );

      case 'select':
        return (
          <View key={field.id} style={[styles.fieldContainer, fullField]}>
            <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
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
                        backgroundColor: selected ? k.tint : k.surface,
                        borderColor: selected ? k.accent : k.border,
                      },
                    ]}
                    onPress={() => setFormFieldValues(prev => ({ ...prev, [field.id]: opt.value }))}
                  >
                    <Text style={[styles.chipText, { color: selected ? k.link : k.text }]}>
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
            <Text style={[styles.fieldLabel, { color: colors.secondary, flex: 1, marginBottom: 0 }]}>
              {field.title}
            </Text>
            <Switch
              value={!!value}
              onValueChange={val => setFormFieldValues(prev => ({ ...prev, [field.id]: val }))}
              trackColor={{ false: k.track, true: k.accent }}
              thumbColor={k.surface}
              ios_backgroundColor={k.track}
            />
          </View>
        );

      case 'photo-gallery':
        const photos: string[] = Array.isArray(value) ? value : [];
        const maxPhotos = field.maxPhotos || 3;
        return (
          <View key={field.id} style={[styles.fieldContainer, fullField]}>
            <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
              {field.title} ({photos.length}/{maxPhotos})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.map((uri, idx) => renderFormPhoto(field.id, uri, idx))}
              {photos.length < maxPhotos && (
                <TouchableOpacity
                  style={[styles.addPhotoBtn, { backgroundColor: k.surface, borderColor: k.dashedBorder }]}
                  onPress={() => pickPhoto(field.id)}
                  disabled={submitting}
                >
                  <Camera size={metrics.diary.addPhotoIcon} color={k.accent} strokeWidth={metrics.iconStroke} />
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

  /** One content block: small muted label, then the value. Empty values hide. */
  const renderDetailFieldValue = (field: TemplateField, value: any) => {
    if (value === undefined || value === null || value === '') return null;
    if (Array.isArray(value) && value.length === 0) return null;
    if (field.type === 'photo-gallery') {
      if (!Array.isArray(value)) return null;
      return (
        <View key={field.id} style={lx.block}>
          <Text style={[type.caption, { color: k.muted }]}>{`${field.title} · ${value.length}`}</Text>
          <DiaryPhotoGallery
            uris={value}
            getUrl={getPhotoUrl}
            onOpen={index => setViewer({ uris: value, index })}
            thumbStyle={lx.photo}
            scrollStyle={styles.photoScroll}
          />
        </View>
      );
    }
    const text =
      field.type === 'checkbox'
        ? value ? 'Yes' : 'No'
        : field.type === 'select'
          ? field.options?.find(o => o.value === value)?.label || String(value)
          : String(value);
    return (
      <View key={field.id} style={lx.block}>
        <Text style={[type.caption, { color: k.muted }]}>{field.title}</Text>
        <Text style={[type.bodyRead, { color: k.textLong }]}>{text}</Text>
      </View>
    );
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
    const d = new Date(selectedEntry.entryDateTime);
    const w = selectedEntry.weather;
    const hasWeather = !!w && (!!w.condition || w.temp != null);
    const tplName = detailTemplate?.name;
    return (
      <ScrollView contentContainerStyle={[lx.detail, readableFrame, { paddingBottom: space.screenBottom + insets.bottom }]}>
        <DetailHeader
          onBack={closeDetail}
          actions={[
            { icon: Pencil, label: 'Edit entry', onPress: () => openEditModal(selectedEntry) },
            { icon: Trash2, label: 'Delete entry', onPress: () => handleDeleteEntry(selectedEntry) },
          ]}
        />
        {selectedEntry._isOffline ? (
          <View style={lx.pending}>
            <CloudOff size={size.icon.meta} color={k.status.pendingText} strokeWidth={metrics.iconStroke} />
            <Text style={[type.caption, { color: k.status.pendingText }]}>Waiting to sync</Text>
          </View>
        ) : null}
        <View style={lx.titleBlock}>
          <Text style={[type.title, { color: k.text }]}>
            {d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}
          </Text>
          <View style={lx.subLine}>
            <Text style={[type.meta, { color: k.muted, flexShrink: 1 }]} numberOfLines={1}>
              {[formatTime(selectedEntry.entryDateTime), tplName].filter(Boolean).join(' · ')}
              {' · '}
            </Text>
            <ProjectSquare color={projectMap.get(selectedEntry.projectId)?.color ?? null} fallbackKey={selectedEntry.projectId} size="header" />
            <Text style={[type.meta, lx.shrink, { color: k.muted }]} numberOfLines={1}>{getProjectLabel(selectedEntry.projectId)}</Text>
          </View>
          {selectedEntry.title && selectedEntry.title !== tplName && !/\b\d{2}\/\d{2}$/.test(selectedEntry.title.trim()) ? (
            <Text style={[type.body, { color: k.textPreview }]}>{selectedEntry.title}</Text>
          ) : null}
        </View>

        {(hasWeather || !!selectedEntry.createdByName) ? (
          <Card variant="list">
            {hasWeather ? (
              <PropertyRow key="weather" label="Weather" labelWidth={metrics.diary.propLabel}>
                <Ionicons name={getWeatherIcon(w?.condition) as any} size={metrics.propertyRow.valueIcon} color={k.icon} />
                <Text style={[type.body, tabular, { color: k.text }]}>
                  {[w?.condition, w?.temp != null ? `${w?.temp}°` : null].filter(Boolean).join(', ')}
                </Text>
              </PropertyRow>
            ) : null}
            {selectedEntry.createdByName ? (
              <PropertyRow key="by" label="Written by" labelWidth={metrics.diary.propLabel} value={selectedEntry.createdByName} />
            ) : null}
          </Card>
        ) : null}

        {detailTemplate && detailTemplate.fields.length > 0 ? (
          <Card variant="notes">
            <View style={lx.blocks}>
              {[...detailTemplate.fields]
                .sort((a, b) => a.order - b.order)
                .map(field => renderDetailFieldValue(field, selectedEntry.fieldValues?.[field.id]))}
            </View>
          </Card>
        ) : null}

        {selectedEntry.overallPhotos && selectedEntry.overallPhotos.length > 0 ? (
          <View style={lx.block}>
            <Text style={[type.caption, { color: k.muted }]}>{`Photos · ${selectedEntry.overallPhotos.length}`}</Text>
            <DiaryPhotoGallery
              uris={selectedEntry.overallPhotos}
              getUrl={getPhotoUrl}
              onOpen={index => setViewer({ uris: selectedEntry.overallPhotos || [], index })}
              thumbStyle={lx.photo}
              scrollStyle={styles.photoScroll}
            />
          </View>
        ) : null}
      </ScrollView>
    );
  };

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

  /** One entry row (P13 style): title · time / project · author · weather · photos. */
  const renderEntryRow = (entry: SiteDiaryEntry, showProject: boolean) => {
    const open = isOpenInPane(entry);
    const photoCount = countPhotos(entry);
    const metaIcon = { size: size.icon.meta, color: k.muted, strokeWidth: metrics.iconStroke };
    return (
      <Pressable
        key={entry.id}
        onPress={() => openDetailModal(entry)}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}, ${formatTime(entry.entryDateTime)}`}
        style={({ pressed }) => [lx.row, open && { backgroundColor: k.tint }, pressed && { opacity: metrics.pressedOpacity }]}
      >
        <View style={lx.rowTop}>
          <Text style={[type.rowTitle, lx.flex, { color: k.text }]} numberOfLines={2}>{entry.title}</Text>
          {entry._isOffline ? <Text style={[type.caption, { color: k.status.pendingText }]}>Offline</Text> : null}
          <Text style={[type.meta, tabular, { color: k.muted }]}>{formatTime(entry.entryDateTime)}</Text>
        </View>
        <View style={lx.rowMeta}>
          {showProject && entry.projectId ? (
            <View style={lx.metaItem}>
              <ProjectSquare color={projectMap.get(entry.projectId)?.color ?? null} fallbackKey={entry.projectId} size="header" />
              <Text style={[type.caption, lx.shrink, { color: k.muted }]} numberOfLines={1}>{getProjectLabel(entry.projectId)}</Text>
            </View>
          ) : null}
          {entry.createdByName ? <Text style={[type.caption, { color: k.muted }]} numberOfLines={1}>{entry.createdByName}</Text> : null}
          {entry.weather?.condition ? (
            <View style={lx.metaItem}>
              <Ionicons name={getWeatherIcon(entry.weather.condition) as any} size={size.icon.meta} color={k.muted} />
              {entry.weather.temp != null ? <Text style={[type.caption, tabular, { color: k.muted }]}>{`${entry.weather.temp}°`}</Text> : null}
            </View>
          ) : null}
          {photoCount > 0 ? (
            <View style={lx.metaItem}>
              <Camera {...metaIcon} />
              <Text style={[type.caption, tabular, { color: k.muted }]}>{photoCount}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  // Feed: the flat header/entry items, folded into one card per day.
  const feedDays: { dateKey: string; entries: SiteDiaryEntry[] }[] = [];
  filteredFeedItems.forEach(item => {
    if (item.type === 'header') feedDays.push({ dateKey: item.dateKey, entries: [] });
    else feedDays[feedDays.length - 1]?.entries.push((item as any).entry);
  });

  const emptyState = (day: boolean) => (
    <View style={lx.empty}>
      <EmptyState
        icon={BookOpen}
        title={searchQuery || filterProjectId ? 'No matching entries' : day ? 'No entries this day' : 'No diary entries yet'}
        helper={searchQuery || filterProjectId ? 'Try a different search or project.' : day ? 'Nothing was recorded on this day.' : 'Tap + to write the first one.'}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: k.bg }]}>
      {/* Entries on the left, the open entry on the right when wide. The list
          (search text, filters, scroll) stays the first child at every size,
          so folding never remounts it. */}
      <TwoPane
        emptyTitle="Select an entry"
        emptyIcon="book-outline"
        detail={showDetailModal && selectedEntry ? (
          <View style={[styles.modalContainer, { backgroundColor: k.bg }]}>
            {renderDetailBody()}
          </View>
        ) : null}
        list={
      <>
      <View style={[lx.top, { paddingTop: insets.top + metrics.schedule.top }]}>
        <PageHeader
          title="Site diary"
          onBack={() => navigation.goBack()}
          actions={[
            { icon: SlidersHorizontal, label: filterProjectId ? 'Project filter on' : 'Filter by project', onPress: () => setShowFilterPicker(true), active: !!filterProjectId },
          ]}
        />
        <View style={lx.navRow}>
          <Segmented
            options={[{ key: 'feed', label: 'Feed' }, { key: 'day', label: 'Day' }]}
            value={viewMode}
            onChange={m => setViewMode(m as typeof viewMode)}
          />
          {viewMode === 'day' ? (
            <View style={lx.dayNav}>
              <Pressable onPress={() => goToDay(-1)} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Previous day">
                <ChevronLeft size={metrics.calendar.arrow} color={k.muted} strokeWidth={metrics.iconStroke} />
              </Pressable>
              <Pressable onPress={openCalendar} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Pick a day">
                <Text style={[type.body, { color: k.text }]}>
                  {isToday(currentDate) ? 'Today' : currentDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}
                </Text>
              </Pressable>
              <Pressable onPress={() => goToDay(1)} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Next day">
                <ChevronRight size={metrics.calendar.arrow} color={k.muted} strokeWidth={metrics.iconStroke} />
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={[lx.search, { backgroundColor: k.surface, borderColor: k.border }]}>
          <Search size={metrics.projects.searchIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
          <TextInput
            style={[type.body, lx.searchInput, { color: k.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search entries"
            placeholderTextColor={k.faint}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={metrics.hitSlop} accessibilityLabel="Clear search">
              <X size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />
            </Pressable>
          ) : null}
        </View>
        {filterProjectId ? (
          <Pressable
            onPress={() => setFilterProjectId(null)}
            style={[lx.filterPill, { backgroundColor: k.tint }]}
            accessibilityRole="button"
            accessibilityLabel={`Clear project filter ${getProjectLabel(filterProjectId)}`}
          >
            <ProjectSquare color={projectMap.get(filterProjectId)?.color ?? null} fallbackKey={filterProjectId} size="header" />
            <Text style={[type.meta, lx.shrink, { color: k.link }]} numberOfLines={1}>{getProjectLabel(filterProjectId)}</Text>
            <X size={size.icon.caret} color={k.link} strokeWidth={metrics.iconStrokeActive} />
          </Pressable>
        ) : null}
        {!networkOnline ? (
          <View style={lx.offline}>
            <CloudOff size={size.icon.meta} color={k.status.pendingText} strokeWidth={metrics.iconStroke} />
            <Text style={[type.caption, { color: k.status.pendingText }]}>
              {`Offline${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`}
            </Text>
          </View>
        ) : null}
      </View>

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
            <ActivityIndicator size="large" color={k.accent} />
          </View>
        ) : (
          <FlatList
            style={styles.scrollView}
            contentContainerStyle={[lx.list, { paddingBottom: space.screenBottom + FAB_CLEARANCE }, feedDays.length === 0 && { flex: 1 }]}
            data={feedDays}
            // Re-render rows when the entry open in the right pane changes (tint).
            extraData={showDetailModal ? selectedEntry?.id : null}
            keyExtractor={item => item.dateKey}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
            ListEmptyComponent={emptyState(false)}
            renderItem={({ item }) => {
              const d = new Date(item.dateKey + 'T12:00:00');
              const label = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
              return (
                <View style={lx.day}>
                  <Text style={[type.meta, { color: k.muted }]}>{isToday(d) ? `Today · ${label}` : label}</Text>
                  <Card variant="list">{item.entries.map(e => renderEntryRow(e, true))}</Card>
                </View>
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
            <ActivityIndicator size="large" color={k.accent} />
          </View>
        ) : (
          <>
          {dayLoading ? <ActivityIndicator size="small" color={k.accent} style={lx.dayLoading} /> : null}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[lx.list, { paddingBottom: space.screenBottom + FAB_CLEARANCE }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
          >
            {filteredEntries.length === 0 ? emptyState(true) : (
              <>
                <Text style={[type.meta, tabular, { color: k.muted }]}>
                  {`${filteredEntries.length} ${filteredEntries.length === 1 ? 'entry' : 'entries'} across ${sortedProjectIds.length} ${sortedProjectIds.length === 1 ? 'project' : 'projects'}`}
                </Text>
                {sortedProjectIds.map(projectId => {
                  const projectEntries = groupedByProject.get(projectId) || [];
                  return (
                    <View key={projectId} style={lx.day}>
                      <View style={lx.projectHead}>
                        <ProjectSquare color={projectMap.get(projectId)?.color ?? null} fallbackKey={projectId} />
                        <Text style={[type.rowTitle, lx.shrink, { color: k.text }]} numberOfLines={1}>{getProjectLabel(projectId)}</Text>
                        <Text style={[type.meta, tabular, { color: k.muted }]}>{projectEntries.length}</Text>
                      </View>
                      <Card variant="list">{projectEntries.map(e => renderEntryRow(e, false))}</Card>
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
      <FAB onPress={() => openCreateModal()} label="New diary entry" />
      </>
        }
      />

      <Modal visible={showEntryModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancelEntryModal}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[lx.formHeader, { paddingTop: insets.top }]}>
            <SheetHeader
              title={isEditMode ? 'Edit entry' : 'New entry'}
              onCancel={cancelEntryModal}
              doneLabel="Save"
              onDone={handleSaveEntry}
              doneLoading={submitting}
            />
          </View>

          {/* readableFrame keeps the full-screen form to a sensible column on
              the Duo unfolded; a phone is narrower than its cap. */}
          <ScrollView {...entryKb.scrollProps} contentContainerStyle={[styles.formContent, readableFrame]}>
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.secondary }]}>Title *</Text>
              <TextInput
                ref={focusChain.ref('title')}
                onFocus={entryKb.onInputFocus}
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Entry title"
                placeholderTextColor={k.faint}
                autoCapitalize="sentences"
                autoCorrect
                returnKeyType={focusChain.isLast('title') ? 'done' : 'next'}
                submitBehavior={focusChain.isLast('title') ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => focusChain.next('title')}
              />
            </View>

            <View style={styles.fieldContainer}>
              <Card variant="list">
                <PropertyRow
                  key="project"
                  form
                  label="Project"
                  value={formProjectId ? getProjectLabel(formProjectId) : undefined}
                  placeholder="Choose"
                  onPress={() => setShowProjectPicker(true)}
                />
                {allTemplates.length > 1 ? (
                  <PropertyRow
                    key="template"
                    form
                    label="Type"
                    value={activeTemplate?.name || 'Default template'}
                    onPress={() => setShowTemplatePicker(true)}
                  />
                ) : null}
                <PropertyRow key="when" label="Date / time" value={formatDateTime(formDateTime)} />
              </Card>
            </View>

            {activeTemplate && activeTemplate.fields.length > 0 && (
              <>
                <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.secondary }]}>
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
              <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Overall Photos</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {formOverallPhotos.map((uri, idx) => renderFormPhoto(null, uri, idx))}
              <TouchableOpacity
                style={[styles.addPhotoBtn, { backgroundColor: k.surface, borderColor: k.dashedBorder }]}
                onPress={() => pickPhoto()}
                disabled={submitting}
              >
                <Camera size={metrics.diary.addPhotoIcon} color={k.accent} strokeWidth={metrics.iconStroke} />
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

          <ModalSheet visible={showProjectPicker} onRequestClose={() => setShowProjectPicker(false)} title="Project" doneLabel="Done" onDone={() => setShowProjectPicker(false)} fill>
            <FlatList
              data={getSortedProjectItems(projects)}
              keyExtractor={item => item.id}
              style={lx.pickList}
              contentContainerStyle={lx.pickContent}
              renderItem={({ item }) => item.isHeader ? (
                <Text style={[type.meta, lx.pickHeader, { color: k.muted }]}>{item.label}</Text>
              ) : (
                <Pressable
                  style={({ pressed }) => [lx.pickRow, { borderBottomColor: k.border, backgroundColor: formProjectId === item.id ? k.tint : k.surface, opacity: pressed ? metrics.pressedOpacity : 1 }]}
                  onPress={() => {
                    setFormProjectId(item.id);
                    if (!isEditMode) {
                      setFormTitle(buildDefaultTitle(activeTemplate, item.id));
                      // New entry: that site's forecast into the weather fields.
                      weatherPrefill.prefill(item.id, activeTemplate?.fields);
                    }
                    setShowProjectPicker(false);
                  }}
                  accessibilityRole="button"
                >
                  <ProjectSquare color={projectMap.get(item.id)?.color ?? null} fallbackKey={item.id} />
                  <Text style={[type.rowTitle, lx.flex, { color: k.text }]} numberOfLines={1}>{item.label}</Text>
                  {formProjectId === item.id ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : null}
                </Pressable>
              )}
            />
          </ModalSheet>

          <ModalSheet visible={showTemplatePicker} onRequestClose={() => setShowTemplatePicker(false)} title="Entry type" doneLabel="Done" onDone={() => setShowTemplatePicker(false)}>
            <ScrollView contentContainerStyle={lx.pickContent} style={lx.pickList}>
              <Card variant="list">
                {[...allTemplates].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(item => {
                  const active = activeTemplate?.id === item.id;
                  return (
                    <ListRow
                      key={item.id}
                      title={item.name}
                      titleLines={1}
                      subtitle={item.isDefault ? 'Default' : undefined}
                      selected={active}
                      trailing={active ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                      onPress={() => switchTemplate(item)}
                    />
                  );
                })}
              </Card>
            </ScrollView>
          </ModalSheet>
        </KeyboardAvoidingView>
      </Modal>

      {/* Hidden while wide: the right pane shows the entry instead. */}
      <Modal visible={showDetailModal && !isWide} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeDetail}>
        <View style={[styles.modalContainer, { backgroundColor: k.bg, paddingTop: insets.top }]}>
          {renderDetailBody()}
          {/* Phone-side copy of the viewer: iOS can't present a root-level
              modal over this one, so it lives inside. Wide uses the root copy. */}
          {renderViewer(!isWide)}
        </View>
      </Modal>

      {renderViewer(isWide)}

      <ModalSheet visible={showFilterPicker} onRequestClose={() => setShowFilterPicker(false)} title="Project" doneLabel="Done" onDone={() => setShowFilterPicker(false)} fill>
        <FlatList
          data={[{ id: '__all', label: 'All projects', isHeader: false } as any, ...getSortedProjectItems(projects)]}
          keyExtractor={item => item.id}
          style={lx.pickList}
          contentContainerStyle={lx.pickContent}
          renderItem={({ item }) => {
            if (item.isHeader) return <Text style={[type.meta, lx.pickHeader, { color: k.muted }]}>{item.label}</Text>;
            const all = item.id === '__all';
            const active = all ? !filterProjectId : filterProjectId === item.id;
            return (
              <Pressable
                style={({ pressed }) => [lx.pickRow, { borderBottomColor: k.border, backgroundColor: active ? k.tint : k.surface, opacity: pressed ? metrics.pressedOpacity : 1 }]}
                onPress={() => { setFilterProjectId(all ? null : item.id); setShowFilterPicker(false); }}
                accessibilityRole="button"
              >
                {all ? null : <ProjectSquare color={projectMap.get(item.id)?.color ?? null} fallbackKey={item.id} />}
                <Text style={[type.rowTitle, lx.flex, { color: k.text }]} numberOfLines={1}>{item.label}</Text>
                {active ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : null}
              </Pressable>
            );
          }}
        />
      </ModalSheet>

      <ModalSheet visible={showCalendar} onRequestClose={() => setShowCalendar(false)} title="Pick a day" doneLabel="Today" onDone={calendarGoToToday} onCancel={() => setShowCalendar(false)}>
        <View style={lx.cal}>
          <View style={lx.calNav}>
            <Pressable onPress={calendarPrevMonth} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Previous month">
              <ChevronLeft size={metrics.calendar.arrow} color={k.muted} strokeWidth={metrics.iconStroke} />
            </Pressable>
            <Text style={[type.sectionTitle, { color: k.text }]}>
              {new Date(calendarYear, calendarMonth).toLocaleString('en-AU', { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable onPress={calendarNextMonth} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Next month">
              <ChevronRight size={metrics.calendar.arrow} color={k.muted} strokeWidth={metrics.iconStroke} />
            </Pressable>
          </View>
          {(() => {
            const { orderedDayNames, rows } = getCalendarGrid();
            const todayStr = toLocalDateStr(new Date());
            const selectedStr = toLocalDateStr(currentDate);
            return (
              <View>
                <View style={lx.calRow}>
                  {orderedDayNames.map(dn => (
                    <View key={dn} style={lx.calCell}>
                      <Text style={[type.micro, { color: k.muted }]}>{dn.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
                {rows.map((row, ri) => (
                  <View key={ri} style={lx.calRow}>
                    {row.map((cell, ci) => {
                      const cellDateStr = `${cell.year}-${(cell.month + 1).toString().padStart(2, '0')}-${cell.day.toString().padStart(2, '0')}`;
                      const isSelected = cellDateStr === selectedStr;
                      const isTodayCell = cellDateStr === todayStr;
                      const count = entryCounts[cellDateStr] || 0;
                      return (
                        <Pressable
                          key={ci}
                          style={lx.calCell}
                          onPress={() => selectCalendarDate(cell.day, cell.month, cell.year)}
                          accessibilityRole="button"
                          accessibilityLabel={`${cellDateStr}, ${count} entries`}
                        >
                          <View style={[lx.calDay, isSelected && { backgroundColor: k.accent }, !isSelected && isTodayCell && { borderWidth: size.border, borderColor: k.accent }]}>
                            <Text style={[type.meta, tabular, { color: isSelected ? k.onAccent : cell.isCurrentMonth ? k.text : k.faint }]}>{cell.day}</Text>
                          </View>
                          <View style={lx.calDots}>
                            {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                              <View key={di} style={[lx.calDot, { backgroundColor: k.accent }]} />
                            ))}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
      </ModalSheet>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  modalContainer: {
    flex: 1,
  },
  formContent: { padding: space.screenX },
  fieldContainer: { marginBottom: metrics.sheet.gap },
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
  // Field label with the dictation mic on the right (#56).
  voiceLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fieldLabel: { ...type.meta, marginBottom: metrics.form.labelGap },
  input: { ...type.rowTitle, borderRadius: radii.lg, borderWidth: size.border, paddingHorizontal: metrics.form.inputPadX, paddingVertical: metrics.form.inputPadY, minHeight: metrics.form.inputHeight },
  textArea: { minHeight: metrics.form.multilineHeight, paddingTop: metrics.form.inputPadY },
  sectionDivider: { paddingTop: space.inline, paddingBottom: metrics.form.labelGap },
  sectionTitle: { ...type.meta },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: { borderRadius: radii.pill, paddingHorizontal: metrics.filterChip.padX, paddingVertical: metrics.filterChip.padY, borderWidth: size.border, marginRight: space.inline },
  chipText: { ...type.meta },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoScroll: {
    marginTop: 4,
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
  addPhotoText: { ...type.caption, marginTop: metrics.listRow.bodyGap },
});

const lx = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  top: { paddingHorizontal: space.screenX, gap: metrics.sheet.gap - 2, paddingBottom: space.inline },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.inline },
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    minHeight: metrics.projects.searchHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
    paddingHorizontal: metrics.projects.cardPad,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.inline,
    maxWidth: '100%',
    paddingHorizontal: metrics.filterChip.padX,
    paddingVertical: metrics.filterChip.padY,
    borderRadius: radii.pill,
  },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  list: { paddingHorizontal: space.screenX, paddingTop: space.inline, gap: metrics.sheet.gap },
  day: { gap: space.groupHeaderToCard },
  dayLoading: { paddingVertical: space.inline },
  projectHead: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  empty: { flex: 1, justifyContent: 'center', paddingTop: space.screenBottom },
  row: { paddingVertical: metrics.listRow.padY, gap: metrics.listRow.bodyGap + 2 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.inline },
  rowMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.rowGap },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm, flexShrink: 1 },
  detail: { paddingHorizontal: space.screenX, paddingTop: space.inline, gap: metrics.scope.gap },
  pending: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  titleBlock: { gap: metrics.form.labelGap },
  subLine: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  blocks: { gap: metrics.sheet.gap },
  block: { gap: metrics.form.labelGap },
  photo: { width: metrics.thumb.diary, height: metrics.thumb.diary, borderRadius: radii.lg },
  formHeader: { paddingHorizontal: space.screenX },
  pickList: { marginHorizontal: space.screenX },
  pickContent: { paddingBottom: space.screenBottom },
  pickHeader: { paddingTop: space.section, paddingBottom: space.inline, paddingHorizontal: space.inlineSm },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, minHeight: metrics.minHit + space.inline, paddingHorizontal: space.cardX, borderBottomWidth: size.border },
  cal: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom, gap: space.rowGap },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, alignItems: 'center', paddingVertical: space.inlineSm },
  calDay: { width: metrics.calendar.dateCircle, height: metrics.calendar.dateCircle, borderRadius: metrics.calendar.dateCircle / 2, alignItems: 'center', justifyContent: 'center' },
  calDots: { flexDirection: 'row', gap: 2, height: space.inlineSm, marginTop: 2 },
  calDot: { width: space.inlineSm, height: space.inlineSm, borderRadius: space.inlineSm / 2 },
});
