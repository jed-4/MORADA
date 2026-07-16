import { useState, useEffect, useCallback } from 'react';
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
import { apiFetch, apiRequest, uploadPhoto, API_BASE_URL } from '../services/api';
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
    }
    setShowTemplatePicker(false);
  };

  const openCreateModal = () => {
    resetForm();
    setActiveTemplate(template);
    applyTemplateDefaults(template);
    setFormTitle(buildDefaultTitle(template));
    setShowEntryModal(true);
  };

  const openEditModal = (entry: SiteDiaryEntry) => {
    setIsEditMode(true);
    setSelectedEntry(entry);
    setFormTitle(entry.title);
    setFormDateTime(entry.entryDateTime);
    setFormFieldValues(entry.fieldValues || {});
    setFormOverallPhotos(entry.overallPhotos || []);
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

  // Throws on upload failure — a device-local URI must never reach the server
  // (it can't render on any other device). The caller aborts the save and
  // surfaces the error, keeping the form state intact.
  const uploadAllPhotos = async (photos: string[]): Promise<string[]> => {
    const uploaded: string[] = [];
    for (const uri of photos) {
      if (uri.startsWith('file://') || uri.startsWith('content://')) {
        const { objectPath } = await uploadPhoto(uri);
        uploaded.push(objectPath);
      } else {
        uploaded.push(uri);
      }
    }
    return uploaded;
  };

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
    try {
      const payload = buildEntryPayload();
      const online = await isOnline();

      if (!online) {
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

        setShowEntryModal(false);
        resetForm();
        return;
      }

      // ONLINE. Editing an entry that only exists locally: if its queued
      // create is still pending, update it in place (the queue handles the
      // uploads) and drain the queue now.
      if (isEditMode && selectedEntry?.id.startsWith('_offline_')) {
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

      const uploadedFieldValues = { ...payload.fieldValues };
      for (const [key, val] of Object.entries(uploadedFieldValues)) {
        if (key.startsWith('_')) continue; // internal keys are not photo arrays
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {
          uploadedFieldValues[key] = await uploadAllPhotos(val as string[]);
        }
      }

      const uploadedOverallPhotos = await uploadAllPhotos(formOverallPhotos);

      const body: any = {
        ...payload,
        fieldValues: uploadedFieldValues,
        overallPhotos: uploadedOverallPhotos,
      };

      if (isEditMode && selectedEntry && !selectedEntry.id.startsWith('_offline_')) {
        await apiRequest(`/api/site-diary-entries/${selectedEntry.id}`, 'PATCH', body);
      } else {
        await apiRequest('/api/site-diary-entries', 'POST', body);
        if (isEditMode && selectedEntry?.id.startsWith('_offline_')) {
          await removeOfflineDiaryEntry(offlineKey, selectedEntry.id);
          await loadOfflineEntries();
        }
      }

      setShowEntryModal(false);
      resetForm();
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save diary entry. Please try again.');
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

    switch (field.type) {
      case 'text':
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
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
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              {field.title}{field.required ? ' *' : ''}
            </Text>
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

      {offlineEntries.length > 0 && (
        <View style={[styles.syncBanner, { backgroundColor: theme.statusInfoBg }]}>
          <Ionicons name="sync-outline" size={16} color={colors.accent} />
          <Text style={[styles.syncBannerText, { color: colors.accent }]}>
            {offlineEntries.length} {plural(offlineEntries.length, 'entry', 'entries')} pending sync
          </Text>
        </View>
      )}

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
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderItem={({ item }) => {
            const photoCount = countPhotos(item as SiteDiaryEntry);
            return (
              <TouchableOpacity
                style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
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
        onPress={openCreateModal}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

      <Modal visible={showEntryModal} animationType="slide" presentationStyle="fullScreen">
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setShowEntryModal(false); resetForm(); }}>
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
                {[...activeTemplate.fields]
                  .sort((a, b) => a.order - b.order)
                  .map(field => renderFieldInput(field))}
              </>
            )}

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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showDetailModal} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setShowDetailModal(false); setSelectedEntry(null); }}>
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

      <Modal visible={showTemplatePicker} transparent animationType="slide">
        <View style={[styles.tpOverlay, { justifyContent: 'flex-end' }]}>
          <View style={[styles.tpSheet, { backgroundColor: colors.card }]}>
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
