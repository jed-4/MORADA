import { useState, useEffect, useCallback, useRef } from 'react';
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
  DIARY_PROJECT_OFFLINE_KEY,
} from '../services/diaryOffline';
import { localDayISOString } from '../lib/dates';
import { plural } from '../lib/format';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme } from '../theme';
import { sheetFrame } from '../components/ui/Sheet';
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

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
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

export default function SiteDiaryScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params as { projectId: string; projectName: string };
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
    { formTitle, formDateTime, formFieldValues, formOverallPhotos, templateId: activeTemplate?.id },
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
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    danger: theme.statusDanger,
    success: theme.statusSuccess,
    inputBg: theme.card,
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
  const captureUri = (route.params as { captureUri?: string } | undefined)?.captureUri;
  const handledCapture = useRef<string | null>(null);
  const pendingCapture = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !captureUri || handledCapture.current === captureUri) return;
    handledCapture.current = captureUri;
    navigation.setParams({ captureUri: undefined });
    pendingCapture.current = captureUri;
    openCreateModal();
    // openCreateModal reads the loaded templates; it isn't memoised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, captureUri]);
  // Attached once the form is open — after the dirty guard has taken its
  // baseline, so Cancel asks before throwing the photo away.
  useEffect(() => {
    const uri = pendingCapture.current;
    if (!showEntryModal || !uri) return;
    pendingCapture.current = null;
    setFormOverallPhotos(prev => (prev.includes(uri) ? prev : [...prev, uri]));
    diaryPhotos.track([uri]);
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

  // The open entry's body — shared by the phone's full-screen modal and the
  // right pane on the Duo unfolded. Long diary text is capped at a readable
  // width (no effect on a phone; it only bites in a wide full-screen view).
  const renderDetailBody = () => {
    if (!selectedEntry) return null;
    return (
      <ScrollView contentContainerStyle={[styles.detailContent, readableFrame]}>
        {selectedEntry.id.startsWith('_offline_') && (
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
      <TouchableOpacity onPress={() => selectedEntry && openEditModal(selectedEntry)} style={styles.detailActionBtn}>
        <Ionicons name="create-outline" size={22} color={colors.accent} />
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

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {!networkOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: theme.statusWarning }]}>
          <Ionicons name="cloud-offline-outline" size={16} color="#ffffff" />
          <Text style={styles.offlineBannerText}>You are offline. Changes will sync when reconnected.</Text>
        </View>
      )}

      {/* Diary photos sitting in the offline queue, with Send now / Retry. */}
      <PendingUploadsBanner
        projectId={projectId}
        types={[...DIARY_QUEUE_TYPES]}
        noun="diary upload"
        style={styles.pendingBanner}
      />

      {offlineEntries.length > 0 && (
        <View style={[styles.syncBanner, { backgroundColor: theme.statusInfoBg }]}>
          <Ionicons name="sync-outline" size={16} color={colors.accent} />
          <Text style={[styles.syncBannerText, { color: colors.accent }]}>
            {offlineEntries.length} {plural(offlineEntries.length, 'entry', 'entries')} pending sync
          </Text>
        </View>
      )}

      {/* Entries on the left, the open entry on the right when wide. The list
          stays the first child at every size, so folding never remounts it. */}
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
      <View style={[styles.headerArea, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Site Diary</Text>
        <Text style={[styles.headerCount, { color: colors.secondary }]}>
          {allEntries.length} {plural(allEntries.length, 'entry', 'entries')}
        </Text>
      </View>

      {allEntries.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          <Ionicons name="book-outline" size={64} color={colors.secondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No site diary entries yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
            Tap the + button to create your first entry
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={allEntries}
          // Re-render rows when the entry open in the right pane changes (outline).
          extraData={showDetailModal ? selectedEntry?.id : null}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderItem={({ item }) => {
            const photoCount = countPhotos(item as SiteDiaryEntry);
            // Wide only: outline the entry that's open in the right pane.
            const isOpen = isWide && showDetailModal && selectedEntry?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.entryCard, { backgroundColor: colors.card, borderColor: isOpen ? colors.accent : colors.border }]}
                onPress={() => openDetailModal(item as SiteDiaryEntry)}
                activeOpacity={0.7}
              >
                {(item as any)._isOffline && (
                  <View style={[styles.offlineTag, { backgroundColor: theme.statusWarningBg }]}>
                    <Ionicons name="cloud-offline-outline" size={12} color={theme.statusWarning} />
                    <Text style={[styles.offlineTagText, { color: theme.statusWarning }]}>Offline</Text>
                  </View>
                )}
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                </View>
                <Text style={[styles.cardDate, { color: colors.secondary }]}>
                  {formatDateShort(item.entryDateTime)}
                </Text>
                <View style={styles.cardFooter}>
                  {item.weather?.condition && (
                    <View style={styles.cardMeta}>
                      <Ionicons name={getWeatherIcon(item.weather.condition) as any} size={14} color={colors.secondary} />
                      <Text style={[styles.cardMetaText, { color: colors.secondary }]}>
                        {item.weather.condition}
                        {item.weather.temp !== undefined ? ` ${item.weather.temp}°C` : ''}
                      </Text>
                    </View>
                  )}
                  {photoCount > 0 && (
                    <View style={styles.cardMeta}>
                      <Ionicons name="image-outline" size={14} color={colors.secondary} />
                      <Text style={[styles.cardMetaText, { color: colors.secondary }]}>{photoCount}</Text>
                    </View>
                  )}
                  {item.createdByName && (
                    <View style={styles.cardMeta}>
                      <Ionicons name="person-outline" size={14} color={colors.secondary} />
                      <Text style={[styles.cardMetaText, { color: colors.secondary }]} numberOfLines={1}>
                        {item.createdByName}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent }]}
        onPress={() => openCreateModal()}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>
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
            {/* Wrapper is always here (no style on a phone) so the inputs sit at
                the same place in the tree folded or unfolded. */}
            <View style={isWide ? styles.fieldGrid : undefined}>
            <View style={[styles.fieldContainer, halfField]}>
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
        </KeyboardAvoidingView>
        {/* Inside the form's modal: iOS can't present a root modal over it. */}
        {diaryPhotos.markupElement}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  offlineBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  syncBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  headerArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerCount: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 120,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  entryCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  offlineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginBottom: 8,
  },
  offlineTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  cardDate: {
    fontSize: 13,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    fontSize: 12,
  },
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
  pendingBanner: { marginHorizontal: 16, marginTop: 10, marginBottom: 0 },
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
  weatherRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  weatherField: {},
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
});
