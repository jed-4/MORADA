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
import { Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiRequest } from '../../services/api';
import { metrics, space, type, useColors } from '../../theme';
import { SheetHeader, TextButton } from '../kit';
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
  const c = useColors();
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
        style={[styles.screen, { backgroundColor: c.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Same look as Add defect (P12): Cancel · title · Save, borderless fields, one property card. */}
        <View style={styles.header}>
          <SheetHeader
            title="Edit defect"
            onCancel={() => dirty.guard(onClose)}
            doneLabel="Save"
            onDone={save}
            doneLoading={saving}
          />
        </View>
        {fields && defect ? (
          <ScrollView {...kb.scrollProps} contentContainerStyle={[styles.content, readableFrame, { paddingBottom: insets.bottom + space.screenBottom }]}>
            <View style={styles.fields}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onFocus={kb.onInputFocus}
                placeholder="Defect title"
                placeholderTextColor={c.placeholderLarge}
                style={[type.headingSemi, styles.input, { color: c.text }]}
                maxLength={200}
                accessibilityLabel="Title"
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                onFocus={kb.onInputFocus}
                placeholder="Add notes (optional)"
                placeholderTextColor={c.placeholderLarge}
                multiline
                style={[type.rowTitle, styles.input, { color: c.textLong }]}
                accessibilityLabel="Notes"
              />
            </View>
            <DefectFieldRows
              projectId={defect.projectId}
              value={fields}
              onChange={(patch) => setFields((prev) => (prev ? { ...prev, ...patch } : prev))}
              refs={refs}
              onRefsChange={setRefs}
            />
            {canDelete ? (
              <TextButton label={deleting ? 'Deleting…' : 'Delete defect'} icon={Trash2} tone="danger" center disabled={deleting} onPress={confirmDelete} />
            ) : null}
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space.screenX, paddingTop: metrics.sheet.grabberTop },
  content: { paddingHorizontal: space.screenX, paddingTop: space.inlineSm, gap: metrics.defects.formGap },
  fields: { gap: metrics.defects.fieldGap },
  input: { paddingVertical: 0, paddingHorizontal: 0 },
});
