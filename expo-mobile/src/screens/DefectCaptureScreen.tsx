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
import { Camera, Image as ImageIcon, Lock } from 'lucide-react-native';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { metrics, radii, size, space, type, useColors } from '../theme';
import { EmptyState, SaveActionBar, SheetHeader } from '../components/kit';
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
  const { projectId, projectName, projectColor, sharedUris } = (route.params ?? {}) as {
    projectId: string;
    projectName?: string;
    projectColor?: string | null;
    /** Photos shared into Morada (#44): start with these instead of the camera. */
    sharedUris?: string[];
  };
  const c = useColors();
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

  // Full-screen form with its own Cancel · New defect · Done header.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const project = projectName ? { name: projectName, color: projectColor ?? null, id: projectId } : null;
  const headerEl = (
    <View style={[cs.header, { paddingTop: insets.top + metrics.schedule.top }]}>
      <SheetHeader
        title="New defect"
        project={project}
        onCancel={() => navigation.goBack()}
        onDone={finish}
        doneDisabled={saving}
      />
    </View>
  );

  if (!canAdd) {
    return (
      <View style={[cs.screen, { backgroundColor: c.bg }]}>
        {headerEl}
        <EmptyState icon={Lock} title="Can't add defects" helper="You don't have permission to add defects on this project." />
      </View>
    );
  }

  const dm = metrics.defects;

  return (
    <KeyboardAvoidingView
      style={[cs.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {headerEl}
      <ScrollView {...kb.scrollProps} contentContainerStyle={[cs.content, readableFrame]} keyboardShouldPersistTaps="handled">
        <PendingUploadsBanner projectId={projectId} types={['create-defect']} noun="defect" />

        {/* Photo tiles: dashed, side by side */}
        {photos.length < MAX_PHOTOS && (
          <View style={cs.tiles}>
            <Pressable
              onPress={takePhoto}
              style={({ pressed }) => [cs.tile, { backgroundColor: c.surface, borderColor: c.dashedBorder, opacity: pressed ? metrics.pressedOpacity : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <Camera size={dm.photoTile.icon} color={c.accent} strokeWidth={metrics.iconStroke} />
              <Text style={[type.body, { color: c.text }]}>Take photo</Text>
            </Pressable>
            <Pressable
              onPress={pickFromLibrary}
              style={({ pressed }) => [cs.tile, { backgroundColor: c.surface, borderColor: c.dashedBorder, opacity: pressed ? metrics.pressedOpacity : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
            >
              <ImageIcon size={dm.photoTile.icon} color={c.accent} strokeWidth={metrics.iconStroke} />
              <Text style={[type.body, { color: c.text }]}>Library</Text>
            </Pressable>
          </View>
        )}

        {/* Captured photos: tap to mark up (where available) or remove */}
        {(photos.length > 0 || addedCount > 0) && (
          <View style={cs.captured}>
            {photos.map((uri, i) => (
              <Pressable
                key={`${uri}-${i}`}
                onPress={() =>
                  Alert.alert('Photo', undefined, [
                    ...(canMarkup ? [{ text: 'Mark up', onPress: () => markup(i) }] : []),
                    { text: 'Remove', style: 'destructive' as const, onPress: () => removePhoto(i) },
                    { text: 'Cancel', style: 'cancel' as const },
                  ])
                }
                accessibilityRole="button"
                accessibilityLabel={`Photo ${i + 1}. Mark up or remove`}
              >
                <Image source={{ uri }} style={[cs.thumb, { backgroundColor: c.greyFill }]} resizeMode="cover" />
              </Pressable>
            ))}
            <Text style={[type.body, { color: c.muted }]}>
              {[
                photos.length ? `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}` : null,
                addedCount ? `${addedCount} saved` : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {/* Title + notes: borderless, like writing on the page */}
        <View style={cs.fields}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onFocus={kb.onInputFocus}
            placeholder={defaultDefectTitle(sticky.location) || 'Defect title'}
            placeholderTextColor={c.placeholderLarge}
            style={[type.headingSemi, cs.input, { color: c.text }]}
            returnKeyType="next"
            maxLength={200}
            accessibilityLabel="Title (optional)"
          />
          <View style={cs.notesRow}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              onFocus={kb.onInputFocus}
              placeholder="Add notes (optional)"
              placeholderTextColor={c.placeholderLarge}
              style={[type.rowTitle, cs.input, { color: c.textLong, flex: 1 }]}
              multiline
              accessibilityLabel="Notes (optional)"
            />
            {/* Dictate the notes (#56). */}
            <VoiceInputButton value={description} onChangeText={setDescription} label="Dictate notes" compact />
          </View>
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

      <SaveActionBar
        onDone={finish}
        onPrimary={saveAndNext}
        primaryLabel="Save & next"
        primaryDisabled={saving || !hasContent}
      />
      {markupElement}
    </KeyboardAvoidingView>
  );
}

const DM = metrics.defects;

const cs = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space.screenX },
  content: { paddingHorizontal: space.screenX, paddingTop: space.inlineSm, paddingBottom: space.screenBottom, gap: DM.formGap },
  tiles: { flexDirection: 'row', gap: space.rowGap - 2 },
  tile: {
    flex: 1,
    minHeight: DM.photoTile.height,
    borderRadius: radii.card,
    borderWidth: size.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.inline,
  },
  captured: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: DM.capturedGap },
  thumb: { width: DM.capturedThumb, height: DM.capturedThumb, borderRadius: radii.lg },
  fields: { gap: DM.fieldGap },
  input: { paddingVertical: 0, paddingHorizontal: 0 },
  notesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.inline },
});
