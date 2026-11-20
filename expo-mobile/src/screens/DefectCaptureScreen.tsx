import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { useDirtyGuard, confirmDiscard } from '../lib/useDirtyGuard';
import { useKeyboardAwareScroll } from '../lib/useKeyboardAwareScroll';
import { usePersistedState } from '../lib/usePersistedState';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useToast } from '../components/ui/Toast';
import { usePhotoMarkup, PendingUploadsBanner } from '../components/photo';
import { isPhotoMarkupAvailable, persistPhoto } from '../lib/photos';
import { addToQueue, syncQueue, type DefectPayload } from '../services/offlineQueue';
import { usePermission } from '../lib/usePermission';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { DefectFieldRows, type DefectFieldValues } from '../components/defects/DefectFieldRows';
import {
  defaultDefectTitle,
  defaultDueDate,
  loadDefectRefs,
  readDefectRefs,
  type DefectRefs,
  type JobStage,
} from '../lib/defects';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

/** What stays set from one defect to the next on a walkthrough. */
interface StickyFields {
  locationId: string | null;
  location: string;
  trade: string | null;
  jobStage: JobStage;
  ownerUserId: string | null;
  ownerName: string | null;
}

const DEFAULT_STICKY: StickyFields = {
  locationId: null,
  location: '',
  trade: null,
  jobStage: 'construction',
  ownerUserId: null,
  ownerName: null,
};

const MAX_PHOTOS = 6;

/**
 * Walkthrough capture: photo first, then a few taps, then Save & next.
 *
 * Every defect goes through the offline queue ('create-defect'), online or
 * not — Save & next never waits on an upload, so a walkthrough of 30 defects
 * is 30 photos, not 30 progress bars. The queue sends it straight away when
 * there is signal (photos first, then the create with its clientRequestId),
 * and resumes step by step after a drop-out without making duplicates.
 *
 * Location, trade, job stage and owner are sticky: they carry over to the
 * next defect, and are remembered per project for the next walkthrough.
 */
export default function DefectCaptureScreen({ navigation, route }: Props) {
  const { projectId, projectName, sharedUris } = (route.params ?? {}) as {
    projectId: string;
    projectName?: string;
    /** Photos shared into Morada (#44): start with these instead of the camera. */
    sharedUris?: string[];
  };
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const kb = useKeyboardAwareScroll({ extraSpace: 90 });
  const canAdd = usePermission('projects.defects', 'add');
  const { markupPhoto, markupElement } = usePhotoMarkup();
  const canMarkup = useMemo(() => isPhotoMarkupAvailable(), []);

  const [sticky, setSticky] = usePersistedState<StickyFields>(`defects:sticky:${projectId}`, DEFAULT_STICKY);
  const [refs, setRefs] = useState<DefectRefs>({ locations: [], trades: [], users: [] });
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(() => defaultDueDate('construction'));
  const [dueDateSet, setDueDateSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // The sticky job stage loads from disk after the first render; follow it
  // with the default due date unless one was picked by hand.
  useEffect(() => {
    if (!dueDateSet) setDueDate(defaultDueDate(sticky.jobStage));
  }, [sticky.jobStage, dueDateSet]);

  useEffect(() => {
    let alive = true;
    readDefectRefs(projectId).then((cached) => {
      if (cached && alive) setRefs(cached);
    });
    loadDefectRefs(projectId).then((fresh) => {
      if (alive) setRefs(fresh);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // ── Photos ──────────────────────────────────────────────────────────────

  const addPhoto = useCallback((uri: string) => {
    setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, uri]));
    haptic.light();
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph defects, or choose from your library.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) addPhoto(result.assets[0].uri);
    } catch (e) {
      console.warn('Camera launch failed:', e);
      Alert.alert('Camera unavailable', 'Could not open the camera. You can choose a photo from your library instead.');
    }
  }, [addPhoto]);

  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to choose a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
    });
    if (!result.canceled) result.assets.forEach((a) => addPhoto(a.uri));
  }, [addPhoto]);

  const markup = useCallback(
    async (index: number) => {
      const edited = await markupPhoto(photos[index]);
      if (edited) setPhotos((prev) => prev.map((p, i) => (i === index ? edited : p)));
    },
    [markupPhoto, photos],
  );

  const removePhoto = (index: number) => {
    haptic.warning();
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Camera first: open it as soon as the screen appears — unless photos were
  // shared in, which are added after the first render so the dirty guard
  // counts them (leaving asks before throwing them away).
  useEffect(() => {
    if (sharedUris?.length) {
      setPhotos(sharedUris.slice(0, MAX_PHOTOS));
      return;
    }
    if (canAdd) takePhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Leaving with unsaved work ───────────────────────────────────────────

  // Dirty = a photo taken (or text typed) for a defect not yet saved. The
  // sticky fields don't count — they are kept anyway.
  const dirty = useDirtyGuard({ photos, title, description });
  // Done saves first, then leaves on the next render — once the guard below
  // has been switched off (it reads `leaving` at render, not a ref).
  useEffect(() => {
    if (leaving) navigation.goBack();
  }, [leaving, navigation]);
  usePreventRemove(dirty.isDirty && !leaving, ({ data }) => {
    confirmDiscard(
      () => navigation.dispatch(data.action),
      "This defect hasn't been saved. Leave without it?",
      'Discard this defect?',
    );
  });

  const fields: DefectFieldValues = { ...sticky, dueDate, dueDateSet };
  const changeFields = (patch: Partial<DefectFieldValues>) => {
    const { dueDate: d, dueDateSet: ds, ...rest } = patch;
    if (Object.keys(rest).length) setSticky((prev) => ({ ...prev, ...rest }));
    if (d !== undefined) setDueDate(d);
    if (ds !== undefined) setDueDateSet(ds);
  };

  // ── Save ────────────────────────────────────────────────────────────────

  const hasContent = photos.length > 0 || title.trim().length > 0 || description.trim().length > 0;

  const save = async (): Promise<boolean> => {
    if (!hasContent) {
      Alert.alert('Nothing to save', 'Take a photo or type a title first.');
      return false;
    }
    setSaving(true);
    try {
      const finalTitle = title.trim() || defaultDefectTitle(sticky.location);
      const payload: DefectPayload = {
        projectId,
        clientRequestId: Crypto.randomUUID(),
        label: finalTitle,
        defect: {
          title: finalTitle,
          description: description.trim() || undefined,
          stage: 'open',
          jobStage: sticky.jobStage,
          trade: sticky.trade || undefined,
          location: sticky.location || undefined,
          locationId: sticky.locationId || undefined,
          ownerUserId: sticky.ownerUserId || undefined,
          ownerName: sticky.ownerName || undefined,
          dueDate,
          dateIdentified: new Date().toISOString(),
        },
        // The camera's cache files can be cleared while the app is closed.
        photos: await Promise.all(photos.map(async (uri) => ({ uri: await persistPhoto(uri), kind: 'before' as const }))),
      };
      await addToQueue({ type: 'create-defect', payload });
      // Send now if there is signal. A drain already running won't pick this
      // one up, so ask again once it ends.
      syncQueue().finally(() => syncQueue());
      haptic.success();
      setAddedCount((n) => n + 1);
      return true;
    } catch (e: any) {
      haptic.error();
      Alert.alert("Couldn't save", e?.message || 'The defect could not be saved on this phone.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetForNext = () => {
    setPhotos([]);
    setTitle('');
    setDescription('');
    setDueDateSet(false);
    setDueDate(defaultDueDate(sticky.jobStage));
  };

  const saveAndNext = async () => {
    if (!(await save())) return;
    resetForNext();
    toast.success('Saved — next defect');
    takePhoto();
  };

  const finish = useCallback(async () => {
    if (hasContent && !(await save())) return;
    setLeaving(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContent, photos, title, description, sticky, dueDate]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: projectName ? `Defects · ${projectName}` : 'Add defects',
      headerRight: () => (
        <Pressable
          onPress={finish}
          disabled={saving}
          hitSlop={8}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={[styles.headerBtnText, { color: theme.primary }]}>Done</Text>
        </Pressable>
      ),
    });
  }, [navigation, finish, saving, projectName, theme.primary]);

  if (!canAdd) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <Ionicons name="lock-closed-outline" size={32} color={theme.textMuted} />
        <Text style={[styles.lockedText, { color: theme.textSecondary }]}>You don't have permission to add defects.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView {...kb.scrollProps} contentContainerStyle={[styles.content, readableFrame]}>
        <PendingUploadsBanner projectId={projectId} types={['create-defect']} noun="defect" />

        {addedCount > 0 && (
          <View style={[styles.countPill, { backgroundColor: theme.statusSuccessBg }]}>
            <Ionicons name="checkmark-circle" size={16} color={theme.statusSuccess} />
            <Text style={[styles.countText, { color: theme.statusSuccess }]}>{addedCount} added</Text>
          </View>
        )}

        {/* Photos */}
        {photos.length === 0 ? (
          <View style={styles.photoEmptyRow}>
            <Pressable
              onPress={takePhoto}
              style={[styles.bigBtn, { backgroundColor: theme.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <Ionicons name="camera" size={26} color="#fff" />
              <Text style={styles.bigBtnText}>Take photo</Text>
            </Pressable>
            <Pressable
              onPress={pickFromLibrary}
              style={[styles.bigBtnAlt, { backgroundColor: theme.card, borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
            >
              <Ionicons name="images-outline" size={22} color={theme.primary} />
              <Text style={[styles.bigBtnAltText, { color: theme.textPrimary }]}>Library</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {photos.map((uri, i) => (
              <View key={`${uri}-${i}`} style={[styles.thumb, { backgroundColor: theme.subtle }]}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={styles.thumbActions}>
                  {canMarkup && (
                    <Pressable
                      onPress={() => markup(i)}
                      style={styles.thumbBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Mark up photo"
                    >
                      <Ionicons name="brush-outline" size={18} color="#fff" />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => removePhoto(i)}
                    style={styles.thumbBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <View style={styles.addMoreCol}>
                <Pressable
                  onPress={takePhoto}
                  style={[styles.addMore, { borderColor: theme.border, backgroundColor: theme.card }]}
                  accessibilityRole="button"
                  accessibilityLabel="Take another photo"
                >
                  <Ionicons name="camera-outline" size={22} color={theme.primary} />
                </Pressable>
                <Pressable
                  onPress={pickFromLibrary}
                  style={[styles.addMore, { borderColor: theme.border, backgroundColor: theme.card }]}
                  accessibilityRole="button"
                  accessibilityLabel="Add from library"
                >
                  <Ionicons name="images-outline" size={22} color={theme.primary} />
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}

        <TextInput
          value={title}
          onChangeText={setTitle}
          onFocus={kb.onInputFocus}
          placeholder={defaultDefectTitle(sticky.location)}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]}
          returnKeyType="next"
          maxLength={200}
          accessibilityLabel="Title (optional)"
        />
        <View>
          <TextInput
            value={description}
            onChangeText={setDescription}
            onFocus={kb.onInputFocus}
            placeholder="Notes (optional)"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.multiline, styles.voiceInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]}
            multiline
            accessibilityLabel="Notes (optional)"
          />
          {/* Dictate the notes (#56) — sits in the box's bottom-right corner. */}
          <VoiceInputButton value={description} onChangeText={setDescription} label="Dictate notes" compact style={styles.voiceBtn} />
        </View>

        <DefectFieldRows
          projectId={projectId}
          value={fields}
          onChange={changeFields}
          refs={refs}
          onRefsChange={setRefs}
          sticky
        />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + 10 }]}>
        <View style={[styles.footerInner, readableFrame]}>
          <Pressable
            onPress={finish}
            disabled={saving}
            style={[styles.footerBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={[styles.footerBtnText, { color: theme.textPrimary }]}>Done</Text>
          </Pressable>
          <Pressable
            onPress={saveAndNext}
            disabled={saving || !hasContent}
            style={[
              styles.footerBtn,
              styles.footerPrimary,
              { backgroundColor: theme.primary, opacity: saving || !hasContent ? 0.5 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save and next"
          >
            <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
            <Text style={[styles.footerBtnText, { color: '#fff' }]}>Save & next</Text>
          </Pressable>
        </View>
      </View>
      {markupElement}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  lockedText: { fontSize: fontSize.base, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  headerBtn: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  headerBtnText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  countText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  photoEmptyRow: { flexDirection: 'row', gap: 10 },
  bigBtn: {
    flex: 2,
    minHeight: 120,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bigBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  bigBtnAlt: {
    flex: 1,
    minHeight: 120,
    borderRadius: radius.xxl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bigBtnAltText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  thumbRow: { gap: 10 },
  thumb: { width: 150, height: 150, borderRadius: radius.xl, overflow: 'hidden' },
  thumbActions: { position: 'absolute', top: 4, right: 4, flexDirection: 'row', gap: 4 },
  thumbBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreCol: { gap: 10 },
  addMore: {
    width: 70,
    height: 70,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: fontSize.base,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  voiceInput: { paddingRight: 52 },
  voiceBtn: { position: 'absolute', right: 8, bottom: 8 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingHorizontal: 16 },
  footerInner: { flexDirection: 'row', gap: 10 },
  footerBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  footerPrimary: { flex: 2, borderWidth: 0 },
  footerBtnText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
