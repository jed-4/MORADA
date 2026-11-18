import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { apiFetch, apiRequest, getAuthedImageSource, uploadFileFromUri } from '../services/api';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { useReturnToTwoPane } from '../lib/twoPane';
import { useTwoPaneDetail } from '../components/ui/TwoPane';
import { readableFrame } from '../components/ui/ReadableColumn';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useKeyboardAwareScroll } from '../lib/useKeyboardAwareScroll';
import { fromLocalDateStr, dateStrOf } from '../lib/dates';
import { StageChip } from '../components/defects/StageChip';
import { DefectPhotoViewer } from '../components/defects/DefectPhotoViewer';
import { DefectEditModal } from '../components/defects/DefectEditModal';
import {
  JOB_STAGE_LABEL,
  STAGE_LABEL,
  TRANSITIONS,
  defectRef,
  loadDefectRefs,
  photosByKind,
  readDefectRefs,
  transitionAction,
  transitionLabel,
  type Defect,
  type DefectAttachment,
  type DefectDetail,
  type DefectEvent,
  type DefectStage,
  type PhotoKind,
} from '../lib/defects';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
  /** Rendered in the right panel of DefectsListScreen: no back button, never pops. */
  embedded?: boolean;
  /** Embedded only: tell the list a defect changed (or was deleted → null). */
  onChanged?: (defect: Defect | null) => void;
};

const fmtDate = (v?: string | null) => {
  const s = dateStrOf(v ?? null);
  return s ? fromLocalDateStr(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

const fmtWhen = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

function describeEvent(e: DefectEvent): { icon: keyof typeof Ionicons.glyphMap; text: string; body?: string } {
  const who = e.actorName || 'Someone';
  const data = e.data || {};
  switch (e.type) {
    case 'created':
      return { icon: 'add-circle-outline', text: `${who} raised this defect` };
    case 'transition': {
      const to = STAGE_LABEL[data.to as DefectStage] ?? data.to;
      const from = STAGE_LABEL[data.from as DefectStage] ?? data.from;
      return { icon: 'swap-horizontal-outline', text: `${who} moved it ${from ? `from ${from} ` : ''}to ${to}`, body: data.note || undefined };
    }
    case 'comment':
      return { icon: 'chatbubble-outline', text: who, body: data.text };
    case 'updated': {
      const names = Object.keys(data.fields || {});
      return { icon: 'create-outline', text: `${who} changed ${names.length ? names.join(', ') : 'details'}` };
    }
    case 'photo':
      return { icon: 'image-outline', text: `${who} added a photo` };
    case 'watcher_added':
      return { icon: 'eye-outline', text: `${who} started watching` };
    case 'watcher_removed':
      return { icon: 'eye-off-outline', text: `${who} stopped watching` };
    default:
      return { icon: 'ellipse-outline', text: who };
  }
}

/** Take (or choose) one photo. Resolves with a local URI or null. */
async function capturePhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    const fromCamera = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return resolve(null);
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      resolve(!r.canceled && r.assets[0] ? r.assets[0].uri : null);
    };
    const fromLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return resolve(null);
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      resolve(!r.canceled && r.assets[0] ? r.assets[0].uri : null);
    };
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: () => fromCamera().catch(() => resolve(null)) },
      { text: 'Choose from library', onPress: () => fromLibrary().catch(() => resolve(null)) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

async function uploadOne(uri: string, kind: PhotoKind): Promise<DefectAttachment> {
  const name = `defect_${kind}_${Date.now()}.jpg`;
  const { objectPath } = await uploadFileFromUri(uri, name, 'image/jpeg');
  return { url: objectPath, name, type: 'image/jpeg', kind };
}

export default function DefectDetailScreen({ navigation, route, embedded = false, onChanged }: Props) {
  const { defectId, listRoute = 'DefectsList', projectId: routeProjectId } = (route.params ?? {}) as {
    defectId: string;
    projectId?: string;
    listRoute?: string;
  };
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { heldOnFold } = useTwoPaneDetail();
  const kb = useKeyboardAwareScroll({ extraSpace: 70 });

  const canEdit = usePermission('projects.defects', 'edit');
  const canClose = usePermission('projects.defects', 'close');
  const canDelete = usePermission('projects.defects', 'delete');

  const [defect, setDefect] = useState<DefectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState<{ photos: DefectAttachment[]; index: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  // Unfolding on this pushed screen pops back to the list with this defect
  // on the right — unless that would lose something (a typed comment, an
  // open form or photo).
  useReturnToTwoPane({
    navigation,
    listRoute,
    id: defectId,
    embedded: embedded || editing || rejecting || viewer !== null || comment.trim().length > 0,
  });

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<DefectDetail>(`/api/defects/${defectId}`);
      setDefect(d);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [defectId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /** Apply a server answer and tell the list. */
  const applyUpdate = (next: DefectDetail) => {
    setDefect(next);
    onChanged?.(next);
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace(listRoute, { projectId: defect?.projectId ?? routeProjectId });
  };

  // ── Transitions ─────────────────────────────────────────────────────────

  const transition = async (to: DefectStage, extra: { note?: string; photos?: DefectAttachment[] } = {}) => {
    if (!defect) return;
    setBusy(to);
    try {
      const res = await apiRequest(`/api/defects/${defect.id}/transition`, 'POST', { to, ...extra });
      const next = (await res.json()) as DefectDetail;
      haptic.success();
      applyUpdate(next?.id ? next : { ...defect, stage: to });
      toast.success(`${defectRef(defect)} · ${STAGE_LABEL[to]}`);
      if (!next?.id) load();
    } catch (e: any) {
      haptic.error();
      Alert.alert("Couldn't update", e?.status ? e.message : 'No signal — try again when you are back online.');
    } finally {
      setBusy(null);
    }
  };

  const onAction = (to: DefectStage) => {
    if (!defect) return;
    haptic.light();
    if (to === 'rejected') {
      setRejectNote('');
      setRejecting(true);
      return;
    }
    if (to === 'closed') {
      Alert.alert('Close this defect?', 'An after-photo shows it was fixed. Add one now?', [
        {
          text: 'Add after-photo',
          onPress: async () => {
            const uri = await capturePhoto();
            if (!uri) return;
            setBusy('closed');
            try {
              const photo = await uploadOne(uri, 'after');
              await transition('closed', { photos: [photo] });
            } catch (e: any) {
              setBusy(null);
              haptic.error();
              Alert.alert("Couldn't upload the photo", e?.message || 'Try again, or close without it.');
            }
          },
        },
        { text: 'Close without photo', onPress: () => transition('closed') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    transition(to);
  };

  const submitReject = async () => {
    if (!rejectNote.trim()) return;
    setRejecting(false);
    await transition('rejected', { note: rejectNote.trim() });
  };

  // ── Watch / photos / comments ──────────────────────────────────────────

  const toggleWatch = async () => {
    if (!defect) return;
    haptic.select();
    const watching = !defect.isWatching;
    const optimistic = {
      ...defect,
      isWatching: watching,
      watcherCount: Math.max(0, (defect.watcherCount ?? 0) + (watching ? 1 : -1)),
    };
    setDefect(optimistic);
    try {
      await apiRequest(`/api/defects/${defect.id}/watch`, watching ? 'POST' : 'DELETE');
      onChanged?.(optimistic);
    } catch {
      setDefect(defect);
      haptic.error();
      toast.error("Couldn't change watching — check your signal.");
    }
  };

  const addPhoto = async () => {
    if (!defect) return;
    const uri = await capturePhoto();
    if (!uri) return;
    const kind: PhotoKind = defect.stage === 'fixed' || defect.stage === 'closed' ? 'after' : 'before';
    setBusy('photo');
    try {
      const photo = await uploadOne(uri, kind);
      const res = await apiRequest(`/api/defects/${defect.id}/photos`, 'POST', { photos: [photo] });
      const next = (await res.json().catch(() => null)) as DefectDetail | null;
      haptic.success();
      if (next?.id) applyUpdate(next);
      else load();
    } catch (e: any) {
      haptic.error();
      Alert.alert("Couldn't add the photo", e?.message || 'Try again when you have signal.');
    } finally {
      setBusy(null);
    }
  };

  const sendComment = async () => {
    if (!defect || !comment.trim()) return;
    setSending(true);
    try {
      await apiRequest(`/api/defects/${defect.id}/comments`, 'POST', { text: comment.trim() });
      haptic.success();
      setComment('');
      await load();
    } catch (e: any) {
      haptic.error();
      Alert.alert("Couldn't post", e?.status ? e.message : 'No signal — your comment is still here, try again shortly.');
    } finally {
      setSending(false);
    }
  };

  // Trade is stored as a Field Settings option key; show its name.
  const [tradeNames, setTradeNames] = useState<Record<string, string>>({});
  const detailProjectId = defect?.projectId;
  useEffect(() => {
    if (!detailProjectId) return;
    let alive = true;
    const apply = (r: { trades: { key: string; name: string }[] } | null) => {
      if (alive && r) setTradeNames(Object.fromEntries(r.trades.map((t) => [t.key, t.name])));
    };
    // The pickers' cached lists are enough; fetch only when there are none.
    readDefectRefs(detailProjectId).then((cached) =>
      cached ? apply(cached) : loadDefectRefs(detailProjectId).then(apply),
    );
    return () => {
      alive = false;
    };
  }, [detailProjectId]);

  const photos = useMemo(() => photosByKind(defect?.attachments), [defect?.attachments]);
  const events = useMemo(() => [...(defect?.events ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [defect?.events]);

  const actions = useMemo(() => {
    if (!defect) return [];
    return (TRANSITIONS[defect.stage] ?? []).filter((to) =>
      transitionAction(defect.stage, to) === 'close' ? canClose : canEdit,
    );
  }, [defect, canClose, canEdit]);

  // ── Render ──────────────────────────────────────────────────────────────

  const topPad = embedded ? (heldOnFold ? insets.top + 48 : 12) : insets.top + 6;

  if (loading && !defect) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: topPad + 40, paddingHorizontal: 16, gap: 12 }]}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="80%" height={22} />
        <Skeleton height={200} borderRadius={16} />
        <Skeleton height={120} borderRadius={16} />
      </View>
    );
  }

  if (!defect) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={34} color={theme.textMuted} />
        <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
          {failed ? "Couldn't load this defect" : 'Defect unavailable'}
        </Text>
        <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
          It may have been removed, you may not have access, or there's no signal.
        </Text>
        <Pressable onPress={() => { setLoading(true); load(); }} style={styles.linkBtn} accessibilityRole="button">
          <Text style={[styles.linkText, { color: theme.primary }]}>Try again</Text>
        </Pressable>
        {!embedded && (
          <Pressable onPress={goBack} style={styles.linkBtn} accessibilityRole="button">
            <Text style={[styles.linkText, { color: theme.primary }]}>Go back</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const dueOverdue = !!defect.overdue && defect.stage !== 'closed';
  const fieldRows: { label: string; value: string; tone?: string }[] = [
    { label: 'Location', value: defect.location || '' },
    {
      label: 'Trade',
      value: [defect.assignedContactName, defect.trade ? tradeNames[defect.trade] ?? defect.trade : null].filter(Boolean).join(' · '),
    },
    { label: 'Job stage', value: JOB_STAGE_LABEL[defect.jobStage] ?? defect.jobStage ?? '' },
    { label: 'Owner', value: defect.ownerName || '' },
    { label: 'Due', value: fmtDate(defect.dueDate) + (dueOverdue ? ' · overdue' : ''), tone: dueOverdue ? theme.statusDanger : undefined },
    { label: 'Raised', value: [fmtDate(defect.dateIdentified || defect.createdAt), defect.createdByName].filter(Boolean).join(' · ') },
    ...(defect.closedAt ? [{ label: 'Closed', value: [fmtDate(defect.closedAt), defect.closedByName].filter(Boolean).join(' · ') }] : []),
  ].filter((r) => r.value);

  const photoStrip = (label: string, list: DefectAttachment[]) =>
    list.length ? (
      <View style={styles.photoGroup}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
          {list.map((p, i) => (
            <Pressable
              key={`${p.url}-${i}`}
              onPress={() => setViewer({ photos: list, index: i })}
              style={[styles.photo, { backgroundColor: theme.subtle }]}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${label} photo ${i + 1}`}
            >
              <Image source={getAuthedImageSource(p.url)} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    ) : null;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topPad, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        {!embedded && (
          <Pressable onPress={goBack} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </Pressable>
        )}
        <View style={styles.topText}>
          <Text style={[styles.ref, { color: theme.textMuted }]} numberOfLines={1}>
            {defectRef(defect)}
            {defect.projectName ? ` · ${defect.projectName}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={toggleWatch}
          style={styles.iconBtn}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!defect.isWatching }}
          accessibilityLabel={defect.isWatching ? 'Stop watching' : 'Watch'}
        >
          <Ionicons name={defect.isWatching ? 'eye' : 'eye-outline'} size={22} color={defect.isWatching ? theme.primary : theme.textSecondary} />
        </Pressable>
        {canEdit && (
          <Pressable onPress={() => { haptic.light(); setEditing(true); }} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Edit">
            <Ionicons name="create-outline" size={22} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        {...kb.scrollProps}
        contentContainerStyle={[styles.content, readableFrame]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <Text style={[styles.title, { color: theme.textPrimary }]}>{defect.title}</Text>
        <View style={styles.chipRow}>
          <StageChip stage={defect.stage} />
          {dueOverdue && (
            <View style={[styles.overdue, { backgroundColor: theme.statusDangerBg }]}>
              <Text style={[styles.overdueText, { color: theme.statusDanger }]}>Overdue</Text>
            </View>
          )}
          {defect.watcherCount ? (
            <Text style={[styles.watchers, { color: theme.textMuted }]}>
              {defect.watcherCount} watching
            </Text>
          ) : null}
        </View>

        {/* Actions — only transitions this person may make from here. */}
        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.map((to, i) => {
              const primary = i === 0;
              return (
                <Pressable
                  key={to}
                  onPress={() => onAction(to)}
                  disabled={busy !== null}
                  style={[
                    styles.actionBtn,
                    primary
                      ? { backgroundColor: to === 'rejected' ? theme.statusDangerSolid : theme.primary, borderColor: 'transparent' }
                      : { backgroundColor: theme.card, borderColor: to === 'rejected' ? theme.statusDanger : theme.border },
                    busy !== null && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                >
                  {busy === to ? (
                    <ActivityIndicator color={primary ? '#fff' : theme.primary} />
                  ) : (
                    <Text
                      style={[
                        styles.actionText,
                        { color: primary ? '#fff' : to === 'rejected' ? theme.statusDanger : theme.textPrimary },
                      ]}
                    >
                      {transitionLabel(defect.stage, to)}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Photos */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {photoStrip('Before', photos.before)}
          {photoStrip('After', photos.after)}
          {photoStrip('From trade', photos.trade)}
          {!photos.before.length && !photos.after.length && !photos.trade.length && (
            <Text style={[styles.muted, { color: theme.textMuted }]}>No photos yet.</Text>
          )}
          {canEdit && (
            <Pressable onPress={addPhoto} disabled={busy !== null} style={styles.addPhoto} accessibilityRole="button">
              {busy === 'photo' ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={18} color={theme.primary} />
                  <Text style={[styles.linkText, { color: theme.primary }]}>Add photo</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* Fields */}
        <View style={[styles.card, styles.cardFlush, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {fieldRows.map((r, i) => (
            <View
              key={r.label}
              style={[styles.fieldRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
            >
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{r.label}</Text>
              <Text style={[styles.fieldValue, { color: r.tone ?? theme.textPrimary }]}>{r.value}</Text>
            </View>
          ))}
        </View>

        {defect.description ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Notes</Text>
            <Text style={[styles.body, { color: theme.textPrimary }]}>{defect.description}</Text>
          </View>
        ) : null}

        {/* History */}
        <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>History</Text>
        <View style={styles.timeline}>
          {events.length === 0 && <Text style={[styles.muted, { color: theme.textMuted }]}>Nothing yet.</Text>}
          {events.map((e) => {
            const d = describeEvent(e);
            const isComment = e.type === 'comment';
            return (
              <View key={e.id} style={styles.event}>
                <View style={[styles.eventDot, { backgroundColor: isComment ? theme.primaryLight : theme.subtle }]}>
                  <Ionicons name={d.icon} size={14} color={isComment ? theme.primary : theme.textSecondary} />
                </View>
                <View style={styles.eventText}>
                  <Text style={[styles.eventTitle, { color: theme.textPrimary }]}>
                    {d.text}
                    <Text style={{ color: theme.textMuted, fontWeight: fontWeight.regular }}>  {fmtWhen(e.createdAt)}</Text>
                  </Text>
                  {d.body ? (
                    <Text
                      style={[
                        styles.eventBody,
                        { color: theme.textPrimary },
                        isComment && { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      {d.body}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Comment box */}
      <View style={[styles.composer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: embedded ? 10 : insets.bottom + 8 }]}>
        <View style={[styles.composerInner, readableFrame]}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            onFocus={kb.onInputFocus}
            placeholder="Add a comment"
            placeholderTextColor={theme.textMuted}
            multiline
            style={[styles.composerInput, { color: theme.textPrimary, backgroundColor: theme.background, borderColor: theme.border }]}
            accessibilityLabel="Comment"
          />
          <Pressable
            onPress={sendComment}
            disabled={sending || !comment.trim()}
            style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: sending || !comment.trim() ? 0.4 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <DefectPhotoViewer photos={viewer?.photos ?? []} index={viewer?.index ?? null} onClose={() => setViewer(null)} />

      <DefectEditModal
        defect={defect}
        visible={editing}
        canDelete={canDelete}
        onClose={() => setEditing(false)}
        onSaved={(next) => {
          setEditing(false);
          applyUpdate(next);
          toast.success('Saved');
          load();
        }}
        onDeleted={() => {
          setEditing(false);
          onChanged?.(null);
          toast.success(`${defectRef(defect)} deleted`);
          if (!embedded) goBack();
        }}
      />

      {/* Reject needs a note: what's still wrong. */}
      <Modal
        visible={rejecting}
        transparent
        animationType="fade"
        onRequestClose={() => setRejecting(false)}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.dialogBackdrop}>
          <View style={[styles.dialog, { backgroundColor: theme.card }]}>
            <Text style={[styles.dialogTitle, { color: theme.textPrimary }]}>Reject — what's still wrong?</Text>
            <Text style={[styles.muted, { color: theme.textSecondary }]}>
              It goes back to the trade with this note.
            </Text>
            <TextInput
              value={rejectNote}
              onChangeText={setRejectNote}
              autoFocus
              multiline
              placeholder="e.g. Paint still patchy behind the door"
              placeholderTextColor={theme.textMuted}
              style={[styles.dialogInput, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.background }]}
            />
            <View style={styles.dialogButtons}>
              <Pressable onPress={() => setRejecting(false)} style={styles.dialogBtn} accessibilityRole="button">
                <Text style={[styles.dialogBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitReject}
                disabled={!rejectNote.trim()}
                style={[styles.dialogBtn, { opacity: rejectNote.trim() ? 1 : 0.4 }]}
                accessibilityRole="button"
              >
                <Text style={[styles.dialogBtnText, { color: theme.statusDanger, fontWeight: fontWeight.semibold }]}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, textAlign: 'center' },
  emptyBody: { fontSize: fontSize.bodySm, textAlign: 'center', lineHeight: 19 },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  linkText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topText: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  ref: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, fontVariant: ['tabular-nums'] },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  overdue: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  overdueText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  watchers: { fontSize: fontSize.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flexGrow: 1,
    minWidth: 130,
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  card: { borderRadius: radius.xxl, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  cardFlush: { padding: 0, gap: 0, overflow: 'hidden' },
  photoGroup: { gap: 6 },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  photoRow: { gap: 8 },
  photo: { width: 120, height: 120, borderRadius: radius.xl, overflow: 'hidden' },
  addPhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  muted: { fontSize: fontSize.sm },
  fieldRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 },
  fieldLabel: { width: 84, fontSize: fontSize.sm },
  fieldValue: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  body: { fontSize: fontSize.bodyLg, lineHeight: 22 },
  sectionHeading: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginTop: 8 },
  timeline: { gap: 12 },
  event: { flexDirection: 'row', gap: 10 },
  eventDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eventText: { flex: 1, gap: 4, paddingTop: 4 },
  eventTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  eventBody: { fontSize: fontSize.sm, lineHeight: 20, borderRadius: radius.lg, padding: 8 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingHorizontal: 12 },
  composerInner: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: fontSize.base,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: radius.xxl, padding: 18, gap: 10, width: '100%', maxWidth: 480, alignSelf: 'center' },
  dialogTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  dialogInput: {
    minHeight: 90,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: 12,
    fontSize: fontSize.base,
    textAlignVertical: 'top',
  },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  dialogBtn: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  dialogBtnText: { fontSize: fontSize.base },
});
