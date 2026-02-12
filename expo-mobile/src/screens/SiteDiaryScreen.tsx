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
  Image,
  Switch,
  Animated,
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
import type { RouteProp } from '@react-navigation/native';

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
    Object.values(entry.fieldValues).forEach((val) => {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && (val[0].startsWith('http') || val[0].startsWith('file') || val[0].startsWith('/'))) {
        count += val.length;
      }
    });
  }
  return count;
}

const OFFLINE_KEY_PREFIX = 'buildpro_diary_offline_';

export default function SiteDiaryScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params as { projectId: string; projectName: string };
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
  const [formDateTime, setFormDateTime] = useState(new Date().toISOString());
  const [formFieldValues, setFormFieldValues] = useState<Record<string, any>>({});
  const [formOverallPhotos, setFormOverallPhotos] = useState<string[]>([]);
  const [formVoiceNotes, setFormVoiceNotes] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [playingVoiceNote, setPlayingVoiceNote] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6', danger: '#ef4444', success: '#22c55e', inputBg: '#0f172a' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb', danger: '#ef4444', success: '#22c55e', inputBg: '#f1f5f9' };

  const offlineKey = `${OFFLINE_KEY_PREFIX}${projectId}`;

  const loadOfflineEntries = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(offlineKey);
      if (data) {
        setOfflineEntries(JSON.parse(data));
      } else {
        setOfflineEntries([]);
      }
    } catch {
      setOfflineEntries([]);
    }
  }, [offlineKey]);

  const saveOfflineEntries = useCallback(async (items: SiteDiaryEntry[]) => {
    try {
      await AsyncStorage.setItem(offlineKey, JSON.stringify(items));
      setOfflineEntries(items);
    } catch (e) {
      console.warn('Failed to save offline entries:', e);
    }
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

  const syncOfflineEntries = useCallback(async () => {
    if (offlineEntries.length === 0) return;
    const online = await isOnline();
    if (!online) return;

    const remaining: SiteDiaryEntry[] = [];
    for (const entry of offlineEntries) {
      try {
        const photoUris: string[] = [];
        const fieldValues = { ...entry.fieldValues };

        for (const [key, val] of Object.entries(fieldValues)) {
          if (Array.isArray(val)) {
            const uploaded: string[] = [];
            const isAudio = key === '_voiceNotes';
            for (const uri of val) {
              if (typeof uri === 'string' && (uri.startsWith('file://') || uri.startsWith('content://'))) {
                try {
                  const { objectPath } = isAudio ? await uploadAudio(uri) : await uploadPhoto(uri);
                  uploaded.push(objectPath);
                } catch {
                  uploaded.push(uri);
                }
              } else {
                uploaded.push(uri);
              }
            }
            fieldValues[key] = uploaded;
          }
        }

        let overallPhotos: string[] = [];
        if (entry.overallPhotos && entry.overallPhotos.length > 0) {
          for (const uri of entry.overallPhotos) {
            if (uri.startsWith('file://') || uri.startsWith('content://')) {
              try {
                const { objectPath } = await uploadPhoto(uri);
                overallPhotos.push(objectPath);
              } catch {
                overallPhotos.push(uri);
              }
            } else {
              overallPhotos.push(uri);
            }
          }
        }

        const body: any = {
          templateId: entry.templateId,
          projectId,
          title: entry.title,
          entryDateTime: entry.entryDateTime,
          fieldValues,
          overallPhotos,
          weather: entry.weather,
        };

        const res = await apiRequest('/api/site-diary-entries', 'POST', body);
        if (!res.ok) throw new Error('Failed to sync entry');
      } catch {
        remaining.push(entry);
      }
    }

    await saveOfflineEntries(remaining);
  }, [offlineEntries, projectId, saveOfflineEntries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const online = await isOnline();
    if (online) {
      await syncOfflineEntries();
    }
    await fetchData();
    await loadOfflineEntries();
    setRefreshing(false);
  }, [fetchData, loadOfflineEntries, syncOfflineEntries]);

  const resetForm = () => {
    setFormTitle('');
    setFormDateTime(new Date().toISOString());
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
    setActiveTemplate(template);
    applyTemplateDefaults(template);
    setShowEntryModal(true);
  };

  const openEditModal = (entry: SiteDiaryEntry) => {
    setIsEditMode(true);
    setSelectedEntry(entry);
    setFormTitle(entry.title);
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
        const field = template?.fields.find(f => f.id === fieldId);
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
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
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
          projectId,
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
          await saveOfflineEntries([...offlineEntries, offlineEntry]);
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
        projectId,
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

  const getPhotoUrl = (path: string): string => {
    if (path.startsWith('http') || path.startsWith('file://') || path.startsWith('content://')) return path;
    return `${API_BASE_URL}/api/uploads/serve/${encodeURIComponent(path)}`;
  };

  const allEntries = [
    ...offlineEntries.map(e => ({ ...e, _isOffline: true })),
    ...entries.map(e => ({ ...e, _isOffline: false })),
  ].sort((a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime());

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
        <View style={[styles.offlineBanner, { backgroundColor: '#f59e0b' }]}>
          <Ionicons name="cloud-offline-outline" size={16} color="#ffffff" />
          <Text style={styles.offlineBannerText}>You are offline. Changes will sync when reconnected.</Text>
        </View>
      )}

      {offlineEntries.length > 0 && (
        <View style={[styles.syncBanner, { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' }]}>
          <Ionicons name="sync-outline" size={16} color={colors.accent} />
          <Text style={[styles.syncBannerText, { color: colors.accent }]}>
            {offlineEntries.length} entry{offlineEntries.length > 1 ? 'ies' : ''} pending sync
          </Text>
        </View>
      )}

      <View style={[styles.headerArea, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Site Diary</Text>
        <Text style={[styles.headerCount, { color: colors.secondary }]}>
          {allEntries.length} entr{allEntries.length === 1 ? 'y' : 'ies'}
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
                  <View style={[styles.offlineTag, { backgroundColor: '#f59e0b20' }]}>
                    <Ionicons name="cloud-offline-outline" size={12} color="#f59e0b" />
                    <Text style={[styles.offlineTagText, { color: '#f59e0b' }]}>Offline</Text>
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
                  <Animated.View style={[styles.recordingIndicator, { transform: [{ scale: pulseAnim }] }]}>
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
              {selectedEntry.id.startsWith('_offline_') && (
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

              {template && template.fields.length > 0 && (
                <View style={[styles.detailSection, { borderTopColor: colors.border }]}>
                  {template.fields
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
});
