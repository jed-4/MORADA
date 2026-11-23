import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, Camera, Check, ChevronDown, Cloud, CloudLightning, CloudOff, CloudRain, CloudSun, Ellipsis, Pencil, Search, Snowflake, Sun, Wind, X, type LucideIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest, API_BASE_URL, isPermanentError } from '../services/api';
import { isOnline, addToQueue, getQueue, saveQueue, syncQueue, addSyncListener } from '../services/offlineQueue';
import {
  getOfflineDiaryEntries,
  saveOfflineDiaryEntries,
  removeOfflineDiaryEntry,
  DIARY_PROJECT_OFFLINE_KEY,
} from '../services/diaryOffline';
import { localDayISOString } from '../lib/dates';
import { plural } from '../lib/format';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme, useColors, metrics, radii, size, space, tabular, type } from '../theme';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { SkeletonList } from '../components/ui/Skeleton';
import { usePersistedState } from '../lib/usePersistedState';
import {
  Card, DetailHeader, EmptyState, FAB, FAB_CLEARANCE, GroupHeader, ListRow, ModalSheet, PageHeader, ProjectSquare, PropertyRow, SheetHeader,
} from '../components/kit';
import { TwoPane } from '../components/ui/TwoPane';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useLayout } from '../lib/useLayout';
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
import DailyReportButton from '../components/diary/DailyReportButton';
import { VoiceInputButton } from '../components/VoiceInputButton';

const DIARY_QUEUE_TYPES = ['create-diary-entry', 'edit-diary-entry'] as const;

interface TemplateField {
  id: string;
  title: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'file' | 'photo-gallery';
  required?: boolean;
  options?: { label: string; value: string }[];
  order: number;
  maxPhotos?: number;
}

interface SiteDiaryTemplate {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  fields: TemplateField[];
  isDefault: boolean;
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
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getHours();
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${displayH}:${d.getMinutes().toString().padStart(2, '0')} ${period}`;
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

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 20 Nov" */
function dayLabel(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "7:30 am" */
function timeLabel(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function weatherIcon(condition?: string): LucideIcon {
  const c = (condition || '').toLowerCase();
  if (c.includes('storm') || c.includes('thunder')) return CloudLightning;
  if (c.includes('rain') || c.includes('shower')) return CloudRain;
  if (c.includes('snow') || c.includes('hail')) return Snowflake;
  if (c.includes('wind')) return Wind;
  if (c.includes('cloud') || c.includes('overcast')) return Cloud;
  if (c.includes('sun') || c.includes('clear') || c.includes('fine')) return Sun;
  return CloudSun;
}

/** The first filled text field, in template order — the row's 2-line preview. */
function previewOf(entry: SiteDiaryEntry, tpl: SiteDiaryTemplate | null | undefined): string {
  const values = entry.fieldValues || {};
  const fields = tpl ? [...tpl.fields].sort((a, b) => a.order - b.order) : [];
  for (const f of fields) {
    if (f.type !== 'text' && f.type !== 'textarea') continue;
    const v = values[f.id];
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/\s+/g, ' ');
  }
  for (const [key, v] of Object.entries(values)) {
    if (key.startsWith('_')) continue;
    if (typeof v === 'string' && v.trim() && !/^(https?:|file:|\/)/.test(v)) return v.trim().replace(/\s+/g, ' ');
  }
  return '';
}

/** Monday 00:00 of the week containing `d`. */
function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** Entries (newest first) → week groups: This week, Last week, then "Week of 2 Nov". */
function groupByWeek<T extends SiteDiaryEntry>(entries: T[]) {
  const thisWeek = mondayOf(new Date()).getTime();
  // Calendar arithmetic (not ms) so a daylight-saving week still lines up.
  const lastWeek = mondayOf(new Date(Date.now() - 7 * 86400000)).getTime();
  const nextWeek = mondayOf(new Date(Date.now() + 7 * 86400000)).getTime();
  const groups: { key: string; title: string; range: string; entries: T[] }[] = [];
  for (const e of entries) {
    const mon = mondayOf(new Date(e.entryDateTime));
    const key = String(mon.getTime());
    let g = groups.find(x => x.key === key);
    if (!g) {
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      const range = mon.getMonth() === sun.getMonth()
        ? `${mon.getDate()} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`
        : `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
      const title = mon.getTime() === thisWeek
        ? 'This week'
        : mon.getTime() === lastWeek
          ? 'Last week'
          : mon.getTime() === nextWeek
            ? 'Next week'
            : `Week of ${mon.getDate()} ${MONTHS[mon.getMonth()]}${mon.getFullYear() !== new Date().getFullYear() ? ` ${mon.getFullYear()}` : ''}`;
      g = { key, title, range, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}

/** True for the title the app builds by default: "[Project - ]Template - dd/mm". */
function isAutoTitle(title: string, tplName?: string | null): boolean {
  return /\b\d{2}\/\d{2}$/.test(title.trim()) && (!tplName || title.includes(tplName));
}

export default function SiteDiaryScreen({ navigation, route }: Props) {
  const { projectId, projectName, projectColor } = route.params as { projectId: string; projectName: string; projectColor?: string | null };
  const k = useColors();
  const insets = useSafeAreaInsets();
  const typeSheetRef = useRef<SheetRef>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [collapsedWeeks, setCollapsedWeeks] = usePersistedState<string[]>(`diary.collapsed.${projectId}`, []);

  // The list draws its own one-row header.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  const { user } = useAuth();

  const [entries, setEntries] = useState<SiteDiaryEntry[]>([]);
  const [offlineEntries, setOfflineEntries] = useState<SiteDiaryEntry[]>([]);
  const [template, setTemplate] = useState<SiteDiaryTemplate | null>(null);
  const [allTemplates, setAllTemplates] = useState<SiteDiaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SiteDiaryEntry | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<SiteDiaryTemplate | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDateTime, setFormDateTime] = useState(localDayISOString());
  const [formFieldValues, setFormFieldValues] = useState<Record<string, any>>({});
  const [formOverallPhotos, setFormOverallPhotos] = useState<string[]>([]);

  // Per-photo upload progress / Retry / "Waiting to send" + Mark up.
  const diaryPhotos = useDiaryPhotos();
  // New entries: fill the template's weather fields from the site forecast.
  const weatherPrefill = useDiaryWeatherPrefill(setFormFieldValues);
  // Return key "Next": title, then the template's typed fields in order.
  const focusChain = useFieldFocusChain([
    'title',
    ...[...(activeTemplate?.fields || [])]
      .sort((a, b) => a.order - b.order)
      .filter(f => f.type === 'text' || f.type === 'textarea' || f.type === 'number' || f.type === 'date')
      .map(f => f.id),
  ]);

  // Full-screen photo viewer (phone and big screen). Kept here, not in the
  // gallery, so it survives the detail moving between the right pane and the
  // full-screen modal when the phone folds or unfolds.
  const [viewer, setViewer] = useState<{ uris: string[]; index: number } | null>(null);

  // New/edit entry form: everything the user can change, so leaving with a
  // half-written entry (Cancel, Android back) asks before throwing it away.
  const entryDirty = useDirtyGuard(
    { formTitle, formDateTime, formFieldValues: weatherPrefill.withoutAutoFilled(formFieldValues), formOverallPhotos, templateId: activeTemplate?.id },
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

  const { isWide } = useLayout();
  // Duo unfolded: short form fields pair up two per row. Only these styles
  // change with the fold — the tree doesn't — so half-typed fields survive it.
  const halfField = isWide ? styles.halfField : null;
  const fullField = isWide ? styles.fullField : null;

  const theme = useTheme();
  // Revamp tokens for the entry form's inline colours.
  const colors = {
    bg: k.bg,
    card: k.surface,
    text: k.text,
    secondary: k.muted,
    border: k.border,
    accent: k.accent,
    danger: k.danger,
    success: k.status.done,
    inputBg: k.surface,
  };

  const offlineKey = `${DIARY_PROJECT_OFFLINE_KEY}_${projectId}`;

  const loadOfflineEntries = useCallback(async () => {
    setOfflineEntries(await getOfflineDiaryEntries(offlineKey));
  }, [offlineKey]);

  const saveOfflineEntries = useCallback(async (items: SiteDiaryEntry[]) => {
    await saveOfflineDiaryEntries(offlineKey, items);
    setOfflineEntries(items);
  }, [offlineKey]);

  const fetchData = useCallback(async () => {
    try {
      const [entriesData, templateData, templatesData] = await Promise.all([
        apiFetch<SiteDiaryEntry[]>(`/api/projects/${projectId}/site-diary-entries`).catch(() => []),
        user?.companyId
          ? apiFetch<SiteDiaryTemplate>(`/api/site-diary-templates/default/${user.companyId}`).catch(() => null)
          : Promise.resolve(null),
        user?.companyId
          ? apiFetch<SiteDiaryTemplate[]>(`/api/site-diary-templates?companyId=${user.companyId}`).catch(() => [])
          : Promise.resolve([]),
      ]);
      setEntries(entriesData || []);
      if (templateData) setTemplate(templateData);
      setAllTemplates(templatesData || []);
    } catch (e) {
      console.error('Failed to fetch diary data:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.companyId]);

  useEffect(() => {
    fetchData();
    loadOfflineEntries();
  }, [fetchData, loadOfflineEntries]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setNetworkOnline(online);
    });
    return () => unsubscribe();
  }, []);

  // Migrate any locally saved entries that were never enqueued (legacy — the
  // screen used to POST them itself on refresh) into the offline queue, so the
  // app-level sync service uploads their assets and syncs them.
  useEffect(() => {
    (async () => {
      const items: SiteDiaryEntry[] = await getOfflineDiaryEntries(offlineKey);
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
            _storageKey: offlineKey,
          },
        });
      }
    })();
  }, [offlineKey]);

  // Refresh after the app-level sync service drains the queue.
  useEffect(() => {
    const unsubscribe = addSyncListener(() => {
      loadOfflineEntries();
      isOnline().then(online => {
        if (online) fetchData();
      });
    });
    return unsubscribe;
  }, [loadOfflineEntries, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const online = await isOnline();
    if (online) {
      await syncQueue();
    }
    await fetchData();
    await loadOfflineEntries();
    setRefreshing(false);
  }, [fetchData, loadOfflineEntries]);

  const resetForm = () => {
    setFormTitle('');
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

  const buildDefaultTitle = (t: SiteDiaryTemplate | null): string => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = `${day}/${month}`;
    const templateName = t?.name || '';
    return projectName ? `${projectName} - ${templateName} - ${dateStr}` : `${templateName} - ${dateStr}`;
  };

  const switchTemplate = (t: SiteDiaryTemplate) => {
    setActiveTemplate(t);
    applyTemplateDefaults(t);
    if (!isEditMode) {
      setFormTitle(buildDefaultTitle(t));
      // The defaults above cleared the fields: fill the new template's weather.
      weatherPrefill.prefill(projectId, t.fields);
    }
    setShowTemplatePicker(false);
  };

  const openCreateModal = () => {
    // Wide: "+" is reachable while an entry is open on the right. Close it,
    // or folding later would show an empty detail modal (resetForm clears it).
    setShowDetailModal(false);
    resetForm();
    setActiveTemplate(template);
    applyTemplateDefaults(template);
    setFormTitle(buildDefaultTitle(template));
    setShowEntryModal(true);
    weatherPrefill.prefill(projectId, template?.fields);
  };

  // Home screen "Photo to diary": the camera photo arrives as a param and
  // opens a new entry with it attached. Waits for the templates to load.
  // Share into Morada sends several as `captureUris` (same flow).
  const captureParams = route.params as { captureUri?: string; captureUris?: string[] } | undefined;
  const captureUri = captureParams?.captureUri;
  const captureUris = captureParams?.captureUris;
  const captureKey = captureUri ?? (captureUris?.length ? captureUris.join('|') : undefined);
  const handledCapture = useRef<string | null>(null);
  const pendingCapture = useRef<string[] | null>(null);
  useEffect(() => {
    if (loading || !captureKey || handledCapture.current === captureKey) return;
    handledCapture.current = captureKey;
    navigation.setParams({ captureUri: undefined, captureUris: undefined });
    pendingCapture.current = captureUri ? [captureUri] : [...(captureUris ?? [])];
    openCreateModal();
    // openCreateModal reads the loaded templates; it isn't memoised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, captureKey]);
  // Attached once the form is open — after the dirty guard has taken its
  // baseline, so Cancel asks before throwing the photo away.
  useEffect(() => {
    const uris = pendingCapture.current;
    if (!showEntryModal || !uris?.length) return;
    pendingCapture.current = null;
    setFormOverallPhotos(prev => [...prev, ...uris.filter(u => !prev.includes(u))]);
    diaryPhotos.track(uris);
  }, [showEntryModal, diaryPhotos.track]);

  const openEditModal = (entry: SiteDiaryEntry) => {
    setIsEditMode(true);
    setSelectedEntry(entry);
    setFormTitle(entry.title);
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
        const field = (activeTemplate || template)?.fields.find(f => f.id === fieldId);
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

  const removePhoto = (fieldId: string | null, index: number) => {
    const list = fieldId ? formFieldValues[fieldId] : formOverallPhotos;
    const uri = Array.isArray(list) ? list[index] : undefined;
    if (typeof uri === 'string') diaryPhotos.untrack(uri);
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

  // Build the entry payload from the current form state.
  const buildEntryPayload = () => {
    const fieldValues = { ...formFieldValues };
    const payload: any = {
      projectId,
      title: formTitle.trim(),
      entryDateTime: formDateTime,
      fieldValues,
      overallPhotos: formOverallPhotos,
    };
    const resolvedTemplateId = activeTemplate?.id || template?.id;
    if (resolvedTemplateId) payload.templateId = resolvedTemplateId;
    return payload;
  };

  // Update the still-pending queued create for a local-only entry in place.
  // Returns false if the queue no longer holds it (already synced).
  const updateQueuedCreate = async (offlineId: string, payload: any): Promise<boolean> => {
    const queue = await getQueue();
    const action = queue.find(
      a => a.type === 'create-diary-entry' && a.payload?._offlineId === offlineId,
    );
    if (!action) return false;
    action.payload = { ...payload, _offlineId: offlineId, _storageKey: offlineKey };
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
              ? { ...e, ...payload, updatedAt: new Date().toISOString() }
              : e,
          );
          await saveOfflineEntries(updated);
          setShowEntryModal(false);
          resetForm();
          syncQueue().then(() => {
            fetchData();
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
          await removeOfflineDiaryEntry(offlineKey, selectedEntry.id);
          await loadOfflineEntries();
        }
      }

      haptic.success();
      setShowEntryModal(false);
      resetForm();
      await fetchData();
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
  const payloadForQueue = async (formPayload: any) => {
    const { map, persisted } = await diaryPhotos.prepareForQueue(collectLocalPhotoUris(formPayload));
    const payload: any = mapPhotoUris(formPayload, map);
    if (persisted.length) payload._persistedPhotos = persisted;
    return payload;
  };

  // Keep the entry on the phone and queue it; the app-level sync sends it
  // when there's signal (and the "waiting to send" banner shows it meanwhile).
  const saveOffline = async (formPayload: any) => {
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
        projectId,
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
          payload: { ...payload, _offlineId: entryId, _storageKey: offlineKey },
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

  const getPhotoUrl = (path: string): string => {
    if (path.startsWith('http') || path.startsWith('file://') || path.startsWith('content://')) return path;
    return `${API_BASE_URL}/api/uploads/serve/${encodeURIComponent(path)}`;
  };

  const allEntries = [
    ...offlineEntries.map(e => ({ ...e, _isOffline: true })),
    ...entries.map(e => ({ ...e, _isOffline: false })),
  ].sort((a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime());

  // The detail modal must render the fields of the ENTRY's template, not the
  // company default — entries created from other templates were showing the
  // wrong (or no) fields.
  const detailTemplate = selectedEntry
    ? allTemplates.find(t => t.id === selectedEntry.templateId) || template
    : null;

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
        <View key={field.id} style={dd.block}>
          <Text style={[type.caption, { color: k.muted }]}>{`${field.title} · ${value.length}`}</Text>
          <DiaryPhotoGallery
            uris={value}
            getUrl={getPhotoUrl}
            onOpen={index => setViewer({ uris: value, index })}
            thumbStyle={dd.photo}
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
      <View key={field.id} style={dd.block}>
        <Text style={[type.caption, { color: k.muted }]}>{field.title}</Text>
        <Text style={[type.bodyLong, { color: k.text }]}>{text}</Text>
      </View>
    );
  };

  // The open entry's body — shared by the phone's full-screen modal and the
  // right pane on the Duo unfolded. Long diary text is capped at a readable
  // width (no effect on a phone; it only bites in a wide full-screen view).
  const renderDetailBody = () => {
    if (!selectedEntry) return null;
    const d = new Date(selectedEntry.entryDateTime);
    const tplName = selectedEntry.templateName || detailTemplate?.name;
    const weather = selectedEntry.weather;
    const W = weatherIcon(weather?.condition);
    const hasWeather = !!weather && (!!weather.condition || weather.temp != null);
    // D06: on the Duo unfolded the entry gets its own header row (date, Edit,
    // More) and two columns — the content blocks, and a side column with the
    // property card and the photo grid. The phone layout is unchanged.
    const duo = isWide;
    const pendingBadge = selectedEntry.id.startsWith('_offline_') ? (
      <View style={dd.pending}>
        <CloudOff size={size.icon.meta} color={k.status.pendingText} strokeWidth={metrics.iconStroke} />
        <Text style={[type.caption, { color: k.status.pendingText }]}>Waiting to sync</Text>
      </View>
    ) : null;
    const titleBlock = (
      <View style={[dd.titleBlock, duo && dd.flex]}>
        <Text style={[type.title, { color: k.text }]}>{dayLabel(d)}</Text>
        <View style={dd.subLine}>
          <Text style={[type.meta, { color: k.muted, flexShrink: 1 }]} numberOfLines={1}>
            {[timeLabel(d), tplName].filter(Boolean).join(' · ')}
            {projectName ? ' · ' : ''}
          </Text>
          {projectName ? (
            <View style={dd.project}>
              <ProjectSquare color={projectColor ?? null} fallbackKey={projectId} size="header" />
              <Text style={[type.meta, { color: k.muted }]} numberOfLines={1}>{projectName}</Text>
            </View>
          ) : null}
        </View>
        {/* Hide the auto title ("Project - Template - dd/mm"): it repeats the line above. */}
        {!!selectedEntry.title && selectedEntry.title !== tplName && !isAutoTitle(selectedEntry.title, tplName) && (
          <Text style={[type.body, { color: k.textPreview }]}>{selectedEntry.title}</Text>
        )}
      </View>
    );
    const propLabel = duo ? DY.duoPropLabel : DY.propLabel;
    const propsCard = (hasWeather || !!selectedEntry.createdByName) ? (
      <Card variant="list">
        {hasWeather ? (
          <PropertyRow key="weather" label="Weather" labelWidth={propLabel}>
            <W size={metrics.propertyRow.valueIcon} color={k.icon} strokeWidth={metrics.iconStroke} />
            <Text style={[type.body, { color: k.text }]}>
              {[weather?.condition, weather?.temp != null ? `${weather?.temp}°` : null].filter(Boolean).join(', ')}
            </Text>
          </PropertyRow>
        ) : null}
        {selectedEntry.createdByName ? (
          <PropertyRow key="by" label="Logged by" labelWidth={propLabel} value={selectedEntry.createdByName} />
        ) : null}
      </Card>
    ) : null;
    const blocks = detailTemplate && detailTemplate.fields.length > 0 ? (
      <View style={dd.blocks}>
        {[...detailTemplate.fields]
          .sort((a, b) => a.order - b.order)
          .map(field => renderDetailFieldValue(field, selectedEntry.fieldValues?.[field.id]))}
      </View>
    ) : null;
    const photos = selectedEntry.overallPhotos && selectedEntry.overallPhotos.length > 0 ? (
      <View style={dd.block}>
        <Text style={[type.caption, { color: k.muted }]}>{`Photos · ${selectedEntry.overallPhotos.length}`}</Text>
        <DiaryPhotoGallery
          uris={selectedEntry.overallPhotos}
          getUrl={getPhotoUrl}
          onOpen={index => setViewer({ uris: selectedEntry.overallPhotos || [], index })}
          thumbStyle={dd.photo}
        />
      </View>
    ) : null;

    if (duo) {
      const entry = selectedEntry;
      return (
        <ScrollView contentContainerStyle={[dd.contentDuo, { paddingTop: insets.top + metrics.schedule.top, paddingBottom: FAB_CLEARANCE + space.screenBottom }]}>
          <View style={dd.duoHeader}>
            {titleBlock}
            <Pressable onPress={() => openEditModal(entry)} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Edit entry">
              <Pencil size={DY.duoEditIcon} color={k.icon} strokeWidth={metrics.iconStroke} />
            </Pressable>
            <Pressable onPress={entryActions} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Entry actions">
              <Ellipsis size={DY.duoMoreIcon} color={k.icon} strokeWidth={metrics.iconStroke} />
            </Pressable>
          </View>
          {pendingBadge}
          <View style={dd.duoCols}>
            <View style={dd.flex}>{blocks}</View>
            {propsCard || photos ? (
              <View style={dd.duoSide}>
                {propsCard}
                {photos}
              </View>
            ) : null}
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView contentContainerStyle={[dd.content, readableFrame, { paddingBottom: space.screenBottom + insets.bottom }]}>
        <DetailHeader
          onBack={closeDetail}
          actions={[{ icon: Ellipsis, label: 'Entry actions', onPress: entryActions }]}
        />
        {pendingBadge}
        {titleBlock}
        {propsCard}
        {blocks}
        {photos}
      </ScrollView>
    );
  };

  // ••• on an entry: Edit, Delete.
  const entryActions = () => {
    if (!selectedEntry) return;
    const entry = selectedEntry;
    Alert.alert(dayLabel(new Date(entry.entryDateTime)), undefined, [
      { text: 'Edit', onPress: () => openEditModal(entry) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteEntry(entry) },
      { text: 'Cancel', style: 'cancel' },
    ]);
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

  // Quiet "All types" filter + search, both client-side over the loaded entries.
  const q = search.trim().toLowerCase();
  const visibleEntries = allEntries.filter(e => {
    if (typeFilter && e.templateId !== typeFilter) return false;
    if (!q) return true;
    const hay = [e.title, e.templateName, ...Object.values(e.fieldValues || {}).filter(v => typeof v === 'string')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
  const weeks = groupByWeek(visibleEntries);
  const typeName = typeFilter ? allTemplates.find(t => t.id === typeFilter)?.name ?? 'Type' : 'All types';

  const listHeader = (
    <View style={dd.listHeader}>
      <PageHeader
        title="Site diary"
        project={projectName ? { name: projectName, color: projectColor ?? null, id: projectId } : null}
        onBack={() => navigation.goBack()}
        actions={[
          searchVisible
            ? { icon: X, label: 'Close search', onPress: () => { setSearch(''); setSearchVisible(false); } }
            : { icon: Search, label: 'Search diary', onPress: () => setSearchVisible(true) },
        ]}
        // One-page PDF of the day for the client (diary, photos, crew hours).
        right={<DailyReportButton projectId={projectId} projectName={projectName} />}
      />
      {searchVisible && (
        <View style={[dd.search, { backgroundColor: k.surface, borderColor: k.border }]}>
          <Search size={metrics.projects.searchIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search entries"
            placeholderTextColor={k.faint}
            autoFocus
            style={[type.body, dd.searchInput, { color: k.text }]}
          />
        </View>
      )}
      {!networkOnline && (
        <View style={dd.pending}>
          <CloudOff size={size.icon.meta} color={k.status.pendingText} strokeWidth={metrics.iconStroke} />
          <Text style={[type.caption, { color: k.status.pendingText }]}>You're offline. Changes sync when you reconnect.</Text>
        </View>
      )}
      {/* Diary photos sitting in the offline queue, with Send now / Retry. */}
      <PendingUploadsBanner projectId={projectId} types={[...DIARY_QUEUE_TYPES]} noun="diary upload" />
      {offlineEntries.length > 0 && (
        <Text style={[type.caption, { color: k.status.pendingText }]}>
          {offlineEntries.length} {plural(offlineEntries.length, 'entry', 'entries')} waiting to sync
        </Text>
      )}
      <View style={dd.countRow}>
        <Text style={[type.meta, tabular, { color: k.muted }]}>
          {visibleEntries.length} {plural(visibleEntries.length, 'entry', 'entries')}
        </Text>
        {allTemplates.length > 1 && (
          <Pressable onPress={() => typeSheetRef.current?.present()} hitSlop={metrics.hitSlop} accessibilityRole="button" style={dd.typeFilter}>
            <Text style={[type.meta, { color: typeFilter ? k.accent : k.muted }]}>{typeName}</Text>
            <ChevronDown size={size.icon.caret} color={k.muted} strokeWidth={metrics.iconStrokeActive} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderEntryRow = (item: SiteDiaryEntry & { _isOffline?: boolean }) => {
    const d = new Date(item.entryDateTime);
    const tpl = allTemplates.find(t => t.id === item.templateId);
    const tplName = item.templateName || tpl?.name;
    const preview = previewOf(item, tpl ?? (item.templateId === template?.id ? template : null));
    const photoCount = countPhotos(item);
    const W = weatherIcon(item.weather?.condition);
    const hasWeather = !!item.weather && (!!item.weather.condition || item.weather.temp != null);
    // Wide only: tint the entry that's open in the right pane.
    const isOpen = isWide && showDetailModal && selectedEntry?.id === item.id;
    const metaIcon = { size: size.icon.meta, color: k.muted, strokeWidth: metrics.iconStroke };
    return (
      <Pressable
        key={item.id}
        onPress={() => openDetailModal(item)}
        accessibilityRole="button"
        accessibilityLabel={`${dayLabel(d)}, ${tplName ?? 'entry'}`}
        style={({ pressed }) => [dd.row, isOpen && [dd.rowSelected, { backgroundColor: k.tint }], pressed && { opacity: metrics.pressedOpacity }]}
      >
        <View style={dd.rowTop}>
          <Text style={[type.rowTitle, { color: k.text }]}>{dayLabel(d)}</Text>
          <Text style={[type.meta, tabular, { color: k.muted }]}>{timeLabel(d)}</Text>
          <View style={{ flex: 1 }} />
          {item._isOffline ? (
            <Text style={[type.caption, { color: k.status.pendingText }]}>Offline</Text>
          ) : null}
          {tplName ? (
            <Text style={[type.caption, { color: tpl?.isDefault === false ? k.accent : k.muted, flexShrink: 1 }]} numberOfLines={1}>{tplName}</Text>
          ) : null}
        </View>
        {preview ? (
          <Text style={[type.bodyPreview, { color: k.textPreview }]} numberOfLines={2}>{preview}</Text>
        ) : null}
        {(hasWeather || photoCount > 0) && (
          <View style={dd.rowMeta}>
            {hasWeather ? (
              <View style={dd.metaItem}>
                <W {...metaIcon} />
                {item.weather?.temp != null ? <Text style={[type.caption, tabular, { color: k.muted }]}>{`${item.weather.temp}°`}</Text> : null}
              </View>
            ) : null}
            {photoCount > 0 ? (
              <View style={dd.metaItem}>
                <Camera {...metaIcon} />
                <Text style={[type.caption, tabular, { color: k.muted }]}>{photoCount}</Text>
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: k.bg, paddingTop: insets.top + metrics.schedule.top }]}>
        <View style={dd.pad}>{listHeader}</View>
        <SkeletonList />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: k.bg }]}>
      {/* Entries on the left, the open entry on the right when wide. The list
          stays the first child at every size, so folding never remounts it. */}
      <TwoPane
        listWidth={size.listPane.diary}
        empty={<EmptyState icon={BookOpen} title="Select an entry" />}
        detail={showDetailModal && selectedEntry ? (
          <View style={[styles.modalContainer, { backgroundColor: k.bg }]}>
            {renderDetailBody()}
          </View>
        ) : null}
        list={
      <>
      <ScrollView
        contentContainerStyle={[dd.list, { paddingTop: insets.top + metrics.schedule.top, paddingBottom: FAB_CLEARANCE + space.screenBottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
      >
        {listHeader}
        {allEntries.length === 0 ? (
          <View style={dd.empty}>
            <EmptyState icon={BookOpen} title="No diary entries yet" helper="Tap + to write today's entry." />
          </View>
        ) : weeks.length === 0 ? (
          <Text style={[type.body, { color: k.muted }]}>Nothing matches</Text>
        ) : (
          weeks.map(week => {
            const open = !collapsedWeeks.includes(week.key);
            return (
              <View key={week.key}>
                <GroupHeader
                  title={week.title}
                  meta={[week.range, String(week.entries.length)]}
                  open={open}
                  onToggle={() => setCollapsedWeeks(open ? [...collapsedWeeks, week.key] : collapsedWeeks.filter(x => x !== week.key))}
                />
                {open ? <Card variant="list">{week.entries.map(renderEntryRow)}</Card> : null}
              </View>
            );
          })
        )}
      </ScrollView>
      </>
        }
      />

      {/* Outside TwoPane so it sits bottom-right of the whole screen when wide. */}
      <FAB onPress={() => openCreateModal()} label="New diary entry" />

      <Sheet ref={typeSheetRef} title="Entry type">
        <View style={dd.sheetBody}>
          <Card variant="list">
            <ListRow
              key="all"
              title="All types"
              titleLines={1}
              trailing={!typeFilter ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
              onPress={() => { setTypeFilter(null); typeSheetRef.current?.dismiss(); }}
            />
            {[...allTemplates].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(t => (
              <ListRow
                key={t.id}
                title={t.name}
                titleLines={1}
                trailing={typeFilter === t.id ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                onPress={() => { setTypeFilter(t.id); typeSheetRef.current?.dismiss(); }}
              />
            ))}
          </Card>
        </View>
      </Sheet>

      <Modal visible={showEntryModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancelEntryModal}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.formHeader, { paddingTop: insets.top }]}>
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
            {/* Wrapper is always here (no style on a phone) so the inputs sit at
                the same place in the tree folded or unfolded. */}
            <View style={isWide ? styles.fieldGrid : undefined}>
            <View style={[styles.fieldContainer, halfField]}>
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

            <View style={[styles.fieldContainer, halfField]}>
              <Card variant="list">
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
        </KeyboardAvoidingView>
        {/* Inside the form's modal: iOS can't present a root modal over it. */}
        {diaryPhotos.markupElement}
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

      <ModalSheet visible={showTemplatePicker} onRequestClose={() => setShowTemplatePicker(false)} title="Entry type" doneLabel="Done" onDone={() => setShowTemplatePicker(false)}>
        <ScrollView contentContainerStyle={styles.tpList}>
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
    </View>
  );
}

const DY = metrics.diary;

const dd = StyleSheet.create({
  pad: { paddingHorizontal: space.screenX },
  list: { paddingHorizontal: space.screenX, gap: metrics.scope.gap },
  listHeader: { gap: metrics.scope.gap },
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
  pending: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeFilter: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  row: { paddingVertical: metrics.listRow.padY, gap: space.inlineSm },
  // Duo: the open entry is a tint block (radius 8) set in from the card edge, as in Tasks.
  rowSelected: {
    marginHorizontal: -(space.cardX - metrics.card.duoPad),
    paddingHorizontal: space.cardX - metrics.card.duoPad,
    borderRadius: radii.lg,
  },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.inline + 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, paddingTop: DY.metaTop },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  empty: { minHeight: metrics.emptyState.circle * 6 },
  sheetBody: { paddingHorizontal: space.screenX, paddingTop: space.inline },
  // Entry view
  content: { paddingHorizontal: space.screenX, paddingTop: space.screenTop, paddingBottom: space.screenBottom, gap: metrics.scope.gap },
  titleBlock: { gap: space.inlineSm },
  subLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  project: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  blocks: { gap: DY.blockGap },
  block: { gap: DY.labelGap },
  flex: { flex: 1 },
  // D06 Duo entry pane
  contentDuo: { paddingHorizontal: DY.duoPadX, gap: DY.duoGap },
  duoHeader: { flexDirection: 'row', alignItems: 'center', gap: metrics.pageHeader.actionGap },
  duoCols: { flexDirection: 'row', alignItems: 'flex-start', gap: DY.duoColGap },
  duoSide: { width: DY.duoSide, gap: DY.duoGap },
  photo: { width: metrics.thumb.diary, height: metrics.thumb.diary, borderRadius: radii.lg, marginRight: DY.photoGap },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalContainer: {
    flex: 1,
  },
  formHeader: { paddingHorizontal: space.screenX },
  tpList: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom },
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
  addPhotoBtn: {
    // Matches DiaryFormPhoto (thumbnail size, and its top room for the remove button).
    width: DIARY_FORM_THUMB,
    height: DIARY_FORM_THUMB,
    marginTop: 6,
    borderRadius: radii.lg,
    borderWidth: size.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  addPhotoText: { ...type.caption, marginTop: metrics.listRow.bodyGap },
  sectionDivider: { paddingTop: space.inline, paddingBottom: metrics.form.labelGap },
  sectionTitle: { ...type.meta },
});
