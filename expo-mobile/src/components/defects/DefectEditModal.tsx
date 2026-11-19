import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiRequest } from '../../services/api';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { haptic } from '../../lib/haptics';
import { useDirtyGuard } from '../../lib/useDirtyGuard';
import { useKeyboardAwareScroll } from '../../lib/useKeyboardAwareScroll';
import { dateStrOf } from '../../lib/dates';
import { readableFrame } from '../ui/ReadableColumn';
import { DefectFieldRows, type DefectFieldValues } from './DefectFieldRows';
import {
  defaultDueDate,
  loadDefectRefs,
  readDefectRefs,
  type DefectDetail,
  type DefectRefs,
} from '../../lib/defects';

interface Props {
  defect: DefectDetail | null;
  visible: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: (updated: DefectDetail) => void;
  onDeleted: () => void;
}

/** Edit a defect's fields (not its stage — that's the action buttons). */
export function DefectEditModal({ defect, visible, canDelete, onClose, onSaved, onDeleted }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardAwareScroll({ extraSpace: 40 });
  const [refs, setRefs] = useState<DefectRefs>({ locations: [], trades: [], users: [] });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<DefectFieldValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fill the form each time it opens (same handler-time rule useDirtyGuard asks for).
  useEffect(() => {
    if (!visible || !defect) return;
    setTitle(defect.title || '');
    setDescription(defect.description || '');
    setFields({
      locationId: defect.locationId ?? null,
      location: defect.location || '',
      trade: defect.trade ?? null,
      jobStage: defect.jobStage || 'construction',
      ownerUserId: defect.ownerUserId ?? null,
      ownerName: defect.ownerName ?? null,
      dueDate: dateStrOf(defect.dueDate) || defaultDueDate(defect.jobStage || 'construction'),
      // An existing date is the person's choice — don't move it with the job stage.
      dueDateSet: !!defect.dueDate,
    });
    let alive = true;
    readDefectRefs(defect.projectId).then((c) => c && alive && setRefs(c));
    loadDefectRefs(defect.projectId).then((r) => alive && setRefs(r));
    return () => {
      alive = false;
    };
  }, [visible, defect]);

  const ready = visible && !!fields;
  const dirty = useDirtyGuard({ title, description, fields }, ready);

  const save = async () => {
    if (!defect || !fields) return;
    if (!title.trim()) {
      Alert.alert('Title needed', 'Give the defect a title.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest(`/api/defects/${defect.id}`, 'PATCH', {
        title: title.trim(),
        description: description.trim() || null,
        location: fields.location || null,
        locationId: fields.locationId,
        trade: fields.trade,
        jobStage: fields.jobStage,
        ownerUserId: fields.ownerUserId,
        ownerName: fields.ownerName,
        dueDate: fields.dueDate || null,
      });
      const updated = (await res.json().catch(() => null)) as DefectDetail | null;
      haptic.success();
      onSaved(updated && updated.id ? { ...defect, ...updated } : { ...defect, title: title.trim(), description, ...fields });
    } catch (e: any) {
      haptic.error();
      Alert.alert("Couldn't save", e?.message || 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!defect) return;
    haptic.warning();
    Alert.alert('Delete this defect?', `${defect.ref || 'This defect'} and its history will be removed. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await apiRequest(`/api/defects/${defect.id}`, 'DELETE');
            haptic.success();
            onDeleted();
          } catch (e: any) {
            haptic.error();
            Alert.alert("Couldn't delete", e?.message || 'Try again.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => dirty.guard(onClose)}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <Pressable onPress={() => dirty.guard(onClose)} style={styles.headerBtn} accessibilityRole="button">
            <Text style={[styles.headerBtnText, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Edit defect</Text>
          <Pressable onPress={save} disabled={saving} style={[styles.headerBtn, styles.headerRight]} accessibilityRole="button">
            {saving ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={[styles.headerBtnText, { color: theme.primary, fontWeight: fontWeight.semibold }]}>Save</Text>
            )}
          </Pressable>
        </View>
        {fields && defect ? (
          <ScrollView {...kb.scrollProps} contentContainerStyle={[styles.content, readableFrame, { paddingBottom: insets.bottom + 32 }]}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onFocus={kb.onInputFocus}
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]}
              maxLength={200}
            />
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Notes</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              onFocus={kb.onInputFocus}
              multiline
              style={[styles.input, styles.multiline, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]}
            />
            <DefectFieldRows
              projectId={defect.projectId}
              value={fields}
              onChange={(patch) => setFields((prev) => (prev ? { ...prev, ...patch } : prev))}
              refs={refs}
              onRefsChange={setRefs}
            />
            {canDelete && (
              <Pressable
                onPress={confirmDelete}
                disabled={deleting}
                style={[styles.deleteBtn, { borderColor: theme.statusDanger }]}
                accessibilityRole="button"
              >
                {deleting ? (
                  <ActivityIndicator color={theme.statusDanger} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={theme.statusDanger} />
                    <Text style={[styles.deleteText, { color: theme.statusDanger }]}>Delete defect</Text>
                  </>
                )}
              </Pressable>
            )}
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { minHeight: 44, minWidth: 64, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerBtnText: { fontSize: fontSize.base },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  content: { padding: 16, gap: 8 },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, marginTop: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: fontSize.base,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top', marginBottom: 8 },
  deleteBtn: {
    marginTop: 24,
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
