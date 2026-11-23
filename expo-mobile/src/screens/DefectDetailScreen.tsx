import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { apiFetch, apiRequest, uploadFileFromUri } from '../services/api';
import { metrics, radii, size, space, tabular, type, useColors } from '../theme';
import { Camera, ChevronLeft, CircleAlert, Eye, EyeOff, Pencil, Send } from 'lucide-react-native';
import {
  ButtonRow, Card, CommentComposer, EmptyState, FieldHint, FieldLabel, ModalSheet, PhotoTile, PrimaryButton, PropertyRow,
  SecondaryButton, StatusDot, TextButton, TextField,
} from '../components/kit';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { useReturnToTwoPane } from '../lib/twoPane';
import { useTwoPaneDetail } from '../components/ui/TwoPane';
import { readableFrame } from '../components/ui/ReadableColumn';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useKeyboardAwareScroll } from '../lib/useKeyboardAwareScroll';
import { fromLocalDateStr, dateStrOf } from '../lib/dates';
import { DefectPhotoViewer } from '../components/defects/DefectPhotoViewer';
import { DefectEditModal } from '../components/defects/DefectEditModal';
import { PickerSheet, type PickerOption } from '../components/defects/PickerSheet';
import { isOnline } from '../services/offlineQueue';
import {
  JOB_STAGE_LABEL,
  SENDABLE_STAGES,
  STAGE_LABEL,
  DEFECT_DOT,
  activeMentionQuery,
  insertMention,
  loadTradeContacts,
  mentionIdsInText,
  mentionSuggestions,
  sendDefectToTrade,
  tradeStatusLine,
  userName,
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
  type TeamUser,
  type TradeContact,
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
      const via = data.via === 'trade_link' ? ' from their link' : '';
      return { icon: 'swap-horizontal-outline', text: `${who} moved it ${from ? `from ${from} ` : ''}to ${to}${via}`, body: data.note || undefined };
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
    case 'sent_to_trade':
      return { icon: 'paper-plane-outline', text: `${who} sent it to ${data.contactName || 'the trade'}${data.emailed ? ' (emailed)' : ''}` };
    case 'trade_viewed':
      return { icon: 'eye-outline', text: `${who} opened their link` };
    case 'link_revoked':
      return { icon: 'link-outline', text: 'Trade link turned off' };
    case 'backcharge':
      return { icon: 'receipt-outline', text: `${who} ${data.action === 'cleared' ? 'removed the backcharge' : 'recorded a backcharge'}` };
    case 'handover_signed':
      return { icon: 'checkmark-done-outline', text: `${who} signed off the handover list` };
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
  const k = useColors();
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
  // Send to trade (online only) and @mentions in comments.
  const [tradePicker, setTradePicker] = useState<TradeContact[] | null>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [mentioned, setMentioned] = useState<TeamUser[]>([]);

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
      const text = comment.trim();
      const mentions = mentionIdsInText(text, mentioned);
      await apiRequest(`/api/defects/${defect.id}/comments`, 'POST', { text, ...(mentions.length ? { mentions } : {}) });
      haptic.success();
      setComment('');
      setMentioned([]);
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
    const apply = (r: { trades: { key: string; name: string }[]; users?: TeamUser[] } | null) => {
      if (!alive || !r) return;
      setTradeNames(Object.fromEntries(r.trades.map((t) => [t.key, t.name])));
      if (r.users?.length) setTeamUsers(r.users);
    };
    // The pickers' cached lists are enough; fetch only when there are none.
    readDefectRefs(detailProjectId).then((cached) =>
      cached ? apply(cached) : loadDefectRefs(detailProjectId).then(apply),
    );
    return () => {
      alive = false;
    };
  }, [detailProjectId]);

  // ── Send to trade (stage 2) ────────────────────────────────────────────

  const canSendToTrade = !!defect && canEdit && SENDABLE_STAGES.includes(defect.stage);

  const startSendToTrade = async () => {
    if (!defect) return;
    haptic.light();
    if (!(await isOnline())) {
      Alert.alert('Needs signal', 'Sending to a trade needs a connection — try again when you have signal.');
      return;
    }
    setBusy('send');
    try {
      setTradePicker(await loadTradeContacts());
    } catch (e: any) {
      Alert.alert("Couldn't load contacts", e?.message || 'Try again shortly.');
    } finally {
      setBusy(null);
    }
  };

  const sendTo = (contact: TradeContact) => {
    if (!defect) return;
    const go = async (emailNow: boolean) => {
      setBusy('send');
      try {
        const r = await sendDefectToTrade(defect.id, { contactId: contact.id, emailNow });
        haptic.success();
        if (r.defect?.id) applyUpdate(r.defect);
        else load();
        if (r.emailError) Alert.alert(`Sent to ${r.contactName}`, r.emailError);
        else toast.success(r.emailed ? `Emailed ${r.contactName}` : `Sent to ${r.contactName} — in their 7am digest`);
      } catch (e: any) {
        haptic.error();
        Alert.alert("Couldn't send", e?.status ? e.message : 'No signal — try again when you are back online.');
      } finally {
        setBusy(null);
      }
    };
    const urgent = defect.priority === 'critical' || defect.priority === 'high';
    Alert.alert(
      `Send to ${contact.label}?`,
      contact.email
        ? `Email them their link now${urgent ? ' (urgent)' : ''}, or let it go in tomorrow's 7am digest.`
        : "They have no email address — it'll be on their link; send the link yourself from the web.",
      [
        ...(contact.email ? [{ text: 'Email now', onPress: () => go(true) }] : []),
        { text: contact.email ? 'In the digest' : 'Send', onPress: () => go(false) },
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const tradeOptions: PickerOption[] = useMemo(
    () => (tradePicker ?? []).map((c) => ({ value: c.id, label: c.label, hint: c.email ?? 'No email' })),
    [tradePicker],
  );

  const mentionQuery = activeMentionQuery(comment);
  const suggestions = mentionQuery !== null ? mentionSuggestions(teamUsers, mentionQuery) : [];
  const pickMention = (u: TeamUser) => {
    haptic.select();
    setComment((c) => insertMention(c, u));
    setMentioned((m) => (m.some((x) => x.id === u.id) ? m : [...m, u]));
  };

  const photos = useMemo(() => photosByKind(defect?.attachments), [defect?.attachments]);
  const events = useMemo(() => [...(defect?.events ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [defect?.events]);

  const actions = useMemo(() => {
    if (!defect) return [];
    // "Sent" is reached through Send to trade, which picks the trade and
    // stamps the send — not a bare stage move.
    return (TRANSITIONS[defect.stage] ?? []).filter((to) =>
      to !== 'sent' && (transitionAction(defect.stage, to) === 'close' ? canClose : canEdit),
    );
  }, [defect, canClose, canEdit]);

  // ── Render ──────────────────────────────────────────────────────────────

  const topPad = embedded ? (heldOnFold ? insets.top + 48 : 12) : insets.top + 6;

  if (loading && !defect) {
    return (
      <View style={[styles.screen, styles.loading, { backgroundColor: k.bg, paddingTop: topPad + space.screenBottom }]}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="80%" height={22} />
        <Skeleton height={200} borderRadius={16} />
        <Skeleton height={120} borderRadius={16} />
      </View>
    );
  }

  if (!defect) {
    return (
      <View style={[styles.centre, { backgroundColor: k.bg }]}>
        <EmptyState
          icon={CircleAlert}
          title={failed ? "Couldn't load this defect" : 'Defect unavailable'}
          helper="It may have been removed, you may not have access, or there's no signal."
        />
        <TextButton label="Try again" center onPress={() => { setLoading(true); load(); }} />
        {!embedded ? <TextButton label="Go back" tone="muted" center onPress={goBack} /> : null}
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
    { label: 'Due', value: fmtDate(defect.dueDate) + (dueOverdue ? ' · overdue' : ''), tone: dueOverdue ? k.danger : undefined },
    { label: 'Raised', value: [fmtDate(defect.dateIdentified || defect.createdAt), defect.createdByName].filter(Boolean).join(' · ') },
    ...(defect.closedAt ? [{ label: 'Closed', value: [fmtDate(defect.closedAt), defect.closedByName].filter(Boolean).join(' · ') }] : []),
  ].filter((r) => r.value);


  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: k.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header: back · "D-12 · project" · watch · edit */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        {!embedded ? (
          <Pressable onPress={goBack} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={metrics.pageHeader.back} color={k.accent} strokeWidth={metrics.iconStroke} />
          </Pressable>
        ) : null}
        <Text style={[type.meta, tabular, styles.topText, { color: k.muted }]} numberOfLines={1}>
          {defectRef(defect)}
          {defect.projectName ? ` · ${defect.projectName}` : ''}
        </Text>
        <Pressable
          onPress={toggleWatch}
          hitSlop={metrics.hitSlop}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!defect.isWatching }}
          accessibilityLabel={defect.isWatching ? 'Stop watching' : 'Watch'}
        >
          {defect.isWatching
            ? <Eye size={size.icon.header} color={k.accent} strokeWidth={metrics.iconStrokeActive} />
            : <EyeOff size={size.icon.header} color={k.icon} strokeWidth={metrics.iconStroke} />}
        </Pressable>
        {canEdit ? (
          <Pressable onPress={() => { haptic.light(); setEditing(true); }} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Edit">
            <Pencil size={size.icon.header} color={k.icon} strokeWidth={metrics.iconStroke} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        {...kb.scrollProps}
        contentContainerStyle={[styles.content, readableFrame]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
      >
        <View style={styles.titleBlock}>
          <Text style={[type.headingSemi, { color: k.text }]}>{defect.title}</Text>
          <View style={styles.statusLine}>
            <StatusDot status={DEFECT_DOT[defect.stage] ?? 'pending'} label={STAGE_LABEL[defect.stage] ?? defect.stage} />
            {dueOverdue ? <Text style={[type.meta, { color: k.danger }]}>· Overdue</Text> : null}
            {defect.watcherCount ? <Text style={[type.meta, tabular, { color: k.muted }]}>{`· ${defect.watcherCount} watching`}</Text> : null}
          </View>
          {tradeStatusLine(defect) ? (
            <Text style={[type.meta, { color: k.muted }]}>
              {[defect.assignedContactName, tradeStatusLine(defect)].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>

        {canSendToTrade || actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((to, i) => {
              const label = transitionLabel(defect.stage, to);
              if (to === 'rejected') {
                return <TextButton key={to} label={busy === to ? 'Working…' : label} tone="danger" center disabled={busy !== null} onPress={() => onAction(to)} />;
              }
              return i === 0 ? (
                <ButtonRow key={to}>
                  <PrimaryButton label={label} onPress={() => onAction(to)} loading={busy === to} disabled={busy !== null && busy !== to} />
                </ButtonRow>
              ) : (
                <ButtonRow key={to}>
                  <SecondaryButton label={label} onPress={() => onAction(to)} loading={busy === to} disabled={busy !== null && busy !== to} />
                </ButtonRow>
              );
            })}
            {canSendToTrade ? (
              <ButtonRow>
                <SecondaryButton
                  label={defect.stage === 'open' ? 'Send to trade' : 'Send to trade again'}
                  icon={Send}
                  onPress={startSendToTrade}
                  loading={busy === 'send'}
                  disabled={busy !== null && busy !== 'send'}
                />
              </ButtonRow>
            ) : null}
          </View>
        ) : null}

        {/* Photos */}
        <Card>
          <View style={styles.photos}>
            {([['Before', photos.before], ['After', photos.after], ['From trade', photos.trade]] as const).map(([label, list]) =>
              list.length ? (
                <View key={label} style={styles.group}>
                  <FieldLabel>{label}</FieldLabel>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                    {list.map((p, i) => (
                      <Pressable
                        key={`${p.url}-${i}`}
                        onPress={() => setViewer({ photos: list as DefectAttachment[], index: i })}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={`${label} photo ${i + 1}`}
                      >
                        <PhotoTile uri={p.url} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null,
            )}
            {!photos.before.length && !photos.after.length && !photos.trade.length ? (
              <Text style={[type.meta, { color: k.muted }]}>No photos yet</Text>
            ) : null}
            {canEdit ? (
              busy === 'photo'
                ? <ActivityIndicator color={k.accent} style={styles.start} />
                : <TextButton label="Add photo" icon={Camera} onPress={addPhoto} disabled={busy !== null} />
            ) : null}
          </View>
        </Card>

        {/* Fields */}
        <Card variant="list">
          {fieldRows.map((r) => (
            <PropertyRow key={r.label} label={r.label} labelWidth={metrics.defects.propLabel}>
              <Text style={[type.body, styles.flex, { color: r.tone ?? k.text }]}>{r.value}</Text>
            </PropertyRow>
          ))}
        </Card>

        {defect.description ? (
          <View style={styles.group}>
            <FieldLabel>Notes</FieldLabel>
            <Card variant="notes">
              <Text style={[type.bodyRead, { color: k.textLong }]}>{defect.description}</Text>
            </Card>
          </View>
        ) : null}

        {/* History */}
        <View style={styles.group}>
          <FieldLabel>History</FieldLabel>
          {events.length === 0 ? (
            <Text style={[type.meta, { color: k.muted }]}>Nothing yet</Text>
          ) : (
            <Card variant="list">
              {events.map((e) => {
                const d = describeEvent(e);
                return (
                  <View key={e.id} style={styles.event}>
                    <View style={[styles.eventIcon, { backgroundColor: k.greyFill }]}>
                      <Ionicons name={d.icon} size={size.icon.meta} color={k.icon} />
                    </View>
                    <View style={styles.eventText}>
                      <Text style={[type.body, { color: k.text }]}>
                        {d.text}
                        <Text style={[type.caption, { color: k.muted }]}>{`  ${fmtWhen(e.createdAt)}`}</Text>
                      </Text>
                      {d.body ? <Text style={[type.bodyPreview, { color: k.textBody }]}>{d.body}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Comment box */}
      <View style={[styles.composer, { backgroundColor: k.bg, borderTopColor: k.border, paddingBottom: embedded ? metrics.actionBar.padY : insets.bottom + space.inline }]}>
        {suggestions.length > 0 ? (
          <View style={[styles.mentionList, readableFrame]}>
            {suggestions.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => pickMention(u)}
                style={[styles.mentionChip, { backgroundColor: k.tint }]}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${userName(u)}`}
              >
                <Text style={[type.meta, { color: k.link }]}>@{userName(u)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={readableFrame}>
          <CommentComposer
            value={comment}
            onChangeText={setComment}
            onSend={sendComment}
            sending={sending}
            placeholder="Add a comment, @ to mention"
          />
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

      <PickerSheet
        visible={tradePicker !== null}
        title="Send to which trade?"
        options={tradeOptions}
        selected={defect.assignedContactId ?? null}
        searchable
        onSelect={(o) => {
          const c = o ? (tradePicker ?? []).find((x) => x.id === o.value) : null;
          setTradePicker(null);
          if (c) setTimeout(() => sendTo(c), metrics.sheetSwapMs);
        }}
        onClose={() => setTradePicker(null)}
      />

      {/* Reject needs a note: what's still wrong. */}
      <ModalSheet
        visible={rejecting}
        onRequestClose={() => setRejecting(false)}
        title="Reject"
        cancelLabel="Cancel"
        onCancel={() => setRejecting(false)}
      >
        <View style={styles.dialog}>
          <FieldHint>What's still wrong? It goes back to the trade with this note.</FieldHint>
          <TextField
            value={rejectNote}
            onChangeText={setRejectNote}
            autoFocus
            multilineBox
            placeholder="e.g. Paint still patchy behind the door"
            accessibilityLabel="Reject note"
          />
          <ButtonRow>
            <SecondaryButton label="Cancel" onPress={() => setRejecting(false)} />
            <View style={styles.rejectBtn}>
              <TextButton label="Reject" tone="danger" center disabled={!rejectNote.trim()} onPress={submitReject} />
            </View>
          </ButtonRow>
        </View>
      </ModalSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  loading: { paddingHorizontal: space.screenX, gap: space.rowGap },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.screenBottom },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: metrics.pageHeader.actionGap, paddingHorizontal: space.screenX, paddingBottom: space.inline },
  topText: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: space.screenX, paddingTop: space.inline, paddingBottom: space.screenBottom, gap: metrics.sheet.gap },
  titleBlock: { gap: metrics.form.labelGap },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: metrics.statusDot.gap, flexWrap: 'wrap' },
  actions: { gap: space.inline },
  photos: { gap: space.rowGap },
  group: { gap: metrics.form.labelGap },
  photoRow: { gap: space.inline },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowGap, paddingVertical: metrics.listRow.padY },
  eventIcon: { width: metrics.avatar.row.size, height: metrics.avatar.row.size, borderRadius: metrics.avatar.row.size / 2, alignItems: 'center', justifyContent: 'center' },
  eventText: { flex: 1, gap: metrics.listRow.bodyGap },
  composer: { borderTopWidth: size.border, paddingTop: space.inline, paddingHorizontal: space.screenX, gap: space.inline },
  mentionList: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inline },
  mentionChip: { paddingHorizontal: metrics.filterChip.padX, paddingVertical: metrics.filterChip.padY, borderRadius: radii.pill },
  dialog: { paddingHorizontal: space.screenX, paddingTop: space.inline, paddingBottom: space.screenBottom, gap: metrics.sheet.gap },
  rejectBtn: { flex: 1, justifyContent: 'center' },
});
