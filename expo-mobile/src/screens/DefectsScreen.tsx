import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, apiRequest, uploadFileFromUri, getAuthedImageSource } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme } from '../theme';

interface DefectAttachment {
  url: string;
  name?: string;
  type?: string;
}

interface Defect {
  id: string;
  projectId: string;
  attachments?: DefectAttachment[] | null;
  title: string;
  description?: string | null;
  location?: string | null;
  type: string;
  priority: string;
  status: string;
  trade?: string | null;
  assignedContactName?: string | null;
  dateIdentified?: string | null;
  dueDate?: string | null;
}

interface FieldOption {
  key: string;
  name: string;
  color?: string | null;
}

interface FieldCategory {
  key: string;
  options?: FieldOption[];
}

// Mirrors client/src/hooks/useDefectPriorityOptions.ts, which falls back to
// these when the field category has not been configured.
const DEFAULT_PRIORITIES: Record<string, { name: string; color: string }> = {
  critical: { name: 'Critical', color: '#DC2626' },
  high: { name: 'High', color: '#EF4444' },
  medium: { name: 'Medium', color: '#F59E0B' },
  low: { name: 'Low', color: '#10B981' },
};

const STATUS_FLOW = ['open', 'in_progress', 'resolved', 'closed'] as const;

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: '#C0453F' },
  in_progress: { label: 'In progress', color: '#C79A3C' },
  resolved: { label: 'Resolved', color: '#3F9A6A' },
  closed: { label: 'Closed', color: '#8A8A8A' },
};

const TYPES = ['builder', 'subcontractor', 'client', 'warranty'];

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
}

export default function DefectsScreen({ route }: Props) {
  const projectId = (route.params as any)?.projectId as string | undefined;
  const theme = useTheme();

  const [defects, setDefects] = useState<Defect[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftLocation, setDraftLocation] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftPriority, setDraftPriority] = useState('medium');
  const [draftType, setDraftType] = useState('builder');
  const [titleError, setTitleError] = useState(false);
  // Local URIs until save — uploading on capture would strand files in object
  // storage whenever someone backs out of the sheet.
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);

  const addPhoto = async (source: 'camera' | 'library') => {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Permission needed',
          source === 'camera'
            ? 'Camera access is needed to photograph the defect.'
            : 'Photo library access is needed.',
        );
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (!result.canceled && result.assets?.length) {
        setDraftPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
      }
    } catch {
      Alert.alert('Camera unavailable', 'Could not open the camera. Try choosing from your library instead.');
    }
  };

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      // The live GET has no status filter — the one that appeared to support it
      // was a shadowed duplicate — so filtering happens client-side.
      const [rows, categories] = await Promise.all([
        apiFetch<Defect[]>(`/api/defects?projectId=${projectId}`).catch(() => []),
        apiFetch<FieldCategory[]>('/api/field-categories').catch(() => []),
      ]);
      setDefects(rows || []);
      setPriorityOptions(
        (categories || []).find(c => c.key === 'defect.priority')?.options ?? [],
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const priorityMeta = useCallback(
    (key: string) => {
      const configured = priorityOptions.find(o => o.key === key);
      if (configured) return { name: configured.name, color: configured.color || '#8A8A8A' };
      return DEFAULT_PRIORITIES[key] ?? { name: titleCase(key), color: '#8A8A8A' };
    },
    [priorityOptions],
  );

  const visible = useMemo(() => {
    const rows = filter === 'open'
      ? defects.filter(d => d.status === 'open' || d.status === 'in_progress')
      : defects;
    const rank = (d: Defect) => STATUS_FLOW.indexOf(d.status as any);
    const pRank = (d: Defect) => ['critical', 'high', 'medium', 'low'].indexOf(d.priority);
    // Outstanding first, then most urgent — the walking-the-job order.
    return [...rows].sort((a, b) => rank(a) - rank(b) || pRank(a) - pRank(b));
  }, [defects, filter]);

  const openCount = defects.filter(d => d.status === 'open' || d.status === 'in_progress').length;

  const resetDraft = () => {
    setDraftTitle('');
    setDraftLocation('');
    setDraftDescription('');
    setDraftPriority('medium');
    setDraftType('builder');
    setTitleError(false);
    setDraftPhotos([]);
  };

  const submitDraft = async () => {
    if (!draftTitle.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      const attachments: DefectAttachment[] = [];
      for (let i = 0; i < draftPhotos.length; i++) {
        const { objectPath } = await uploadFileFromUri(
          draftPhotos[i],
          `defect_${Date.now()}_${i}.jpg`,
          'image/jpeg',
        );
        attachments.push({ url: objectPath, name: `Photo ${i + 1}`, type: 'image/jpeg' });
      }

      // apiRequest resolves to the raw Response; apiFetch is GET-only, so the
      // body is parsed here.
      const response = await apiRequest('/api/defects', 'POST', {
        projectId,
        title: draftTitle.trim(),
        location: draftLocation.trim() || undefined,
        description: draftDescription.trim() || undefined,
        priority: draftPriority,
        type: draftType,
        status: 'open',
        attachments,
      });
      const created: Defect = await response.json();
      setDefects(prev => [created, ...prev]);
      setComposerOpen(false);
      resetDraft();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'The defect was not created. Your photos have not been lost — try again.');
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = (defect: Defect) => {
    const options = STATUS_FLOW.filter(s => s !== defect.status);
    Alert.alert(
      defect.title,
      `Currently ${STATUS_META[defect.status]?.label ?? defect.status}`,
      [
        ...options.map(s => ({
          text: `Mark ${STATUS_META[s].label}`,
          onPress: async () => {
            const previous = defect.status;
            // Optimistic: the row is in front of the user on site, so it should
            // move the moment they tap, and roll back if the write fails.
            setDefects(prev => prev.map(d => (d.id === defect.id ? { ...d, status: s } : d)));
            try {
              await apiRequest(`/api/defects/${defect.id}`, 'PATCH', { status: s });
            } catch {
              setDefects(prev => prev.map(d => (d.id === defect.id ? { ...d, status: previous } : d)));
              Alert.alert('Could not update', 'The status was not changed.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.filterBar, { borderColor: theme.border, backgroundColor: theme.card }]}>
        {([
          { key: 'open' as const, label: `Outstanding${openCount ? ` (${openCount})` : ''}` },
          { key: 'all' as const, label: `All (${defects.length})` },
        ]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setFilter(tab.key)}
            style={[
              styles.filterTab,
              filter === tab.key && { backgroundColor: theme.primary + '22' },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === tab.key ? theme.primary : theme.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={d => d.id}
        contentContainerStyle={visible.length === 0 ? styles.emptyWrap : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="checkmark-circle-outline" size={40} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              {filter === 'open' ? 'Nothing outstanding' : 'No defects yet'}
            </Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              Tap the button below to log one while you are on site.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const p = priorityMeta(item.priority);
          const s = STATUS_META[item.status] ?? { label: titleCase(item.status), color: '#8A8A8A' };
          return (
            <TouchableOpacity
              onPress={() => advanceStatus(item)}
              activeOpacity={0.7}
              style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <View style={[styles.priorityRail, { backgroundColor: p.color }]} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {(item.location || item.trade) && (
                  <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                    {[item.location, item.trade].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {item.assignedContactName && (
                  <Text style={[styles.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.assignedContactName}
                  </Text>
                )}
                {!!item.attachments?.length && (
                  <View style={styles.thumbRow}>
                    {item.attachments.slice(0, 4).map((a, i) => (
                      <Image
                        key={`${a.url}-${i}`}
                        source={getAuthedImageSource(a.url)}
                        style={[styles.thumb, { borderColor: theme.border }]}
                      />
                    ))}
                    {item.attachments.length > 4 && (
                      <Text style={[styles.rowMeta, { color: theme.textMuted, alignSelf: 'center' }]}>
                        +{item.attachments.length - 4}
                      </Text>
                    )}
                  </View>
                )}
              </View>
              <View style={styles.rowRight}>
                <View style={[styles.chip, { backgroundColor: s.color + '22' }]}>
                  <Text style={[styles.chipText, { color: s.color }]}>{s.label}</Text>
                </View>
                <Text style={[styles.priorityText, { color: p.color }]}>{p.name}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        onPress={() => setComposerOpen(true)}
        style={[styles.fab, { backgroundColor: theme.primary }]}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={22} color="#ffffff" />
        <Text style={styles.fabText}>Log defect</Text>
      </TouchableOpacity>

      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={[styles.sheetHeader, { borderColor: theme.border }]}>
              <TouchableOpacity onPress={() => { setComposerOpen(false); resetDraft(); }}>
                <Text style={[styles.sheetAction, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>New defect</Text>
              <TouchableOpacity onPress={submitDraft} disabled={saving}>
                <Text style={[styles.sheetAction, { color: theme.primary, opacity: saving ? 0.5 : 1 }]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.textSecondary }]}>What is wrong</Text>
              <TextInput
                value={draftTitle}
                onChangeText={t => { setDraftTitle(t); if (titleError) setTitleError(false); }}
                placeholder="Cracked tile in ensuite"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.input,
                  { backgroundColor: theme.card, borderColor: titleError ? '#C0453F' : theme.border, color: theme.textPrimary },
                ]}
              />
              {titleError && <Text style={styles.errorText}>Give the defect a title first</Text>}

              <Text style={[styles.label, { color: theme.textSecondary }]}>Where</Text>
              <TextInput
                value={draftLocation}
                onChangeText={setDraftLocation}
                placeholder="Ensuite, level 1"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]}
              />

              <Text style={[styles.label, { color: theme.textSecondary }]}>Priority</Text>
              <View style={styles.pillRow}>
                {['critical', 'high', 'medium', 'low'].map(key => {
                  const meta = priorityMeta(key);
                  const active = draftPriority === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setDraftPriority(key)}
                      style={[
                        styles.pill,
                        { borderColor: active ? meta.color : theme.border, backgroundColor: active ? meta.color + '22' : theme.card },
                      ]}
                    >
                      <Text style={[styles.pillText, { color: active ? meta.color : theme.textSecondary }]}>
                        {meta.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: theme.textSecondary }]}>Responsibility</Text>
              <View style={styles.pillRow}>
                {TYPES.map(key => {
                  const active = draftType === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setDraftType(key)}
                      style={[
                        styles.pill,
                        { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '22' : theme.card },
                      ]}
                    >
                      <Text style={[styles.pillText, { color: active ? theme.primary : theme.textSecondary }]}>
                        {titleCase(key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: theme.textSecondary }]}>Photos</Text>
              <View style={styles.photoRow}>
                {draftPhotos.map((uri, i) => (
                  <View key={`${uri}-${i}`}>
                    <Image source={{ uri }} style={[styles.draftThumb, { borderColor: theme.border }]} />
                    <TouchableOpacity
                      onPress={() => setDraftPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      style={styles.removePhoto}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#C0453F" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() => addPhoto('camera')}
                  style={[styles.photoButton, { borderColor: theme.border, backgroundColor: theme.card }]}
                >
                  <Ionicons name="camera-outline" size={20} color={theme.primary} />
                  <Text style={[styles.photoButtonText, { color: theme.textSecondary }]}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => addPhoto('library')}
                  style={[styles.photoButton, { borderColor: theme.border, backgroundColor: theme.card }]}
                >
                  <Ionicons name="images-outline" size={20} color={theme.primary} />
                  <Text style={[styles.photoButtonText, { color: theme.textSecondary }]}>Library</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: theme.textSecondary }]}>Detail</Text>
              <TextInput
                value={draftDescription}
                onChangeText={setDraftDescription}
                placeholder="Anything the trade needs to know"
                placeholderTextColor={theme.textMuted}
                multiline
                style={[
                  styles.input,
                  styles.textarea,
                  { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary },
                ]}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  filterBar: { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  filterText: { fontSize: 13, fontWeight: '600' },

  listContent: { padding: 12, paddingBottom: 96 },
  row: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  priorityRail: { width: 4 },
  rowBody: { flex: 1, padding: 12, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12 },
  rowRight: { padding: 12, alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 11, fontWeight: '600' },
  priorityText: { fontSize: 11, fontWeight: '600' },

  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
  },
  fabText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 15, fontWeight: '600' },
  sheetAction: { fontSize: 15, fontWeight: '500' },
  sheetBody: { padding: 16, paddingBottom: 40, gap: 6 },

  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  errorText: { color: '#C0453F', fontSize: 12, marginTop: 4 },

  thumbRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  thumb: { width: 40, height: 40, borderRadius: 6, borderWidth: 1 },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  draftThumb: { width: 64, height: 64, borderRadius: 8, borderWidth: 1 },
  removePhoto: { position: 'absolute', top: -6, right: -6, backgroundColor: 'transparent' },
  photoButton: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  photoButtonText: { fontSize: 10 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: 13, fontWeight: '500' },
});
