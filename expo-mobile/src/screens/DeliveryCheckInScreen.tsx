import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { useDirtyGuard, confirmDiscard } from '../lib/useDirtyGuard';
import { useKeyboardAwareScroll } from '../lib/useKeyboardAwareScroll';
import { fromLocalDateStr, dateStrOf } from '../lib/dates';
import { isDocumentScannerAvailable, isPhotoMarkupAvailable, persistPhoto, scanDocument } from '../lib/photos';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useToast } from '../components/ui/Toast';
import { SkeletonList } from '../components/ui/Skeleton';
import { PendingUploadsBanner, usePhotoMarkup } from '../components/photo';
import { apiFetch, getAuthedImageSource } from '../services/api';
import { addToQueue, getPendingDeliveries, syncQueue } from '../services/offlineQueue';
import {
  CONDITIONS,
  CONDITION_LABEL,
  applyPendingDeliveries,
  formatQty,
  readDeliveriesCache,
  storeDeliveryPO,
  type DeliveryCondition,
  type DeliveryLine,
  type DeliveryPayload,
  type DeliveryPO,
  type DeliveryRecord,
  type PODeliveriesResponse,
} from '../lib/deliveries';
import { DeliveryStatusChip } from '../components/deliveries/DeliveryStatusChip';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

interface LineEntry {
  /** Typed quantity; blank = nothing received on this line. */
  qty: string;
  condition: DeliveryCondition;
  note: string;
  photos: string[];
  /** Note/photo area open. */
  open: boolean;
}

const BLANK_ENTRY: LineEntry = { qty: '', condition: 'ok', note: '', photos: [], open: false };
const MAX_LINE_PHOTOS = 4;
const MAX_DOCKET_PHOTOS = 4;

/** "2.5" → 2.5; blank → 0; junk → NaN. Accepts a comma decimal. */
const parseQty = (s: string): number => {
  const t = s.trim().replace(',', '.');
  if (!t) return 0;
  return /^\d*\.?\d*$/.test(t) ? Number(t) : NaN;
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

/**
 * Check a delivery in against one purchase order.
 *
 * "All received" is the fast path: it fills every line with what is still to
 * come, condition OK. Otherwise each line takes a quantity, a condition and
 * an optional note/photos. The docket photo is required when the company says
 * so (`docketPhotoRequired`); Submit is blocked with a clear message.
 *
 * Every check-in goes through the offline queue ('create-delivery'), online or
 * not. The clientRequestId is made on the first Submit tap and reused for any
 * re-tap and every queue retry, so the server can never save it twice. The PO
 * comes from the per-project cache when there's no signal; past deliveries
 * show only when the fresh copy loads.
 */
export default function DeliveryCheckInScreen({ navigation, route }: Props) {
  const { projectId, poId } = (route.params ?? {}) as { projectId: string; poId: string; poNumber?: string };
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const kb = useKeyboardAwareScroll({ extraSpace: 90 });
  const canView = usePermission('projects.deliveries', 'view');
  const canAdd = usePermission('projects.deliveries', 'add');
  const { markupPhoto, markupElement } = usePhotoMarkup();
  const canMarkup = useMemo(() => isPhotoMarkupAvailable(), []);
  const canScan = useMemo(() => isDocumentScannerAvailable(), []);

  const [po, setPo] = useState<DeliveryPO | null>(null);
  const [docketRequired, setDocketRequired] = useState(true);
  const [history, setHistory] = useState<DeliveryRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const [entries, setEntries] = useState<Record<string, LineEntry>>({});
  const [docketNumber, setDocketNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [docketPhotos, setDocketPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Made on the first Submit tap; reused by any re-tap after a local failure.
  const submitIdentity = useRef<{ clientRequestId: string; receivedAt: string } | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────

  const withPending = useCallback(async (p: DeliveryPO) => {
    const pending = await getPendingDeliveries(projectId);
    return applyPendingDeliveries([p], pending)[0];
  }, [projectId]);

  const load = useCallback(async () => {
    const cached = await readDeliveriesCache(projectId);
    const fromCache = cached?.purchaseOrders.find((p) => p.id === poId);
    if (fromCache) {
      setPo(await withPending(fromCache));
      setDocketRequired(cached!.docketPhotoRequired !== false);
      setLoading(false);
    }
    try {
      const res = await apiFetch<PODeliveriesResponse>(`/api/deliveries/pos/${poId}`);
      if (res?.po) {
        setPo(await withPending(res.po));
        storeDeliveryPO(projectId, res.po, res.docketPhotoRequired).catch(() => {});
      }
      setDocketRequired(res?.docketPhotoRequired !== false);
      setHistory(Array.isArray(res?.deliveries) ? res.deliveries : []);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, poId, withPending]);

  useEffect(() => {
    if (canView) load();
    else setLoading(false);
  }, [canView, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Entry editing ───────────────────────────────────────────────────────

  const entryFor = (lineId: string) => entries[lineId] ?? BLANK_ENTRY;
  const patchEntry = (lineId: string, patch: Partial<LineEntry>) =>
    setEntries((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] ?? BLANK_ENTRY), ...patch } }));

  const allReceived = () => {
    if (!po) return;
    haptic.success();
    setEntries((prev) => {
      const next = { ...prev };
      for (const line of po.lines) {
        if (line.qtyOutstanding <= 0) continue;
        next[line.id] = { ...(prev[line.id] ?? BLANK_ENTRY), qty: formatQty(line.qtyOutstanding), condition: 'ok' };
      }
      return next;
    });
  };

  const step = (line: DeliveryLine, delta: number) => {
    haptic.select();
    const cur = parseQty(entryFor(line.id).qty);
    const next = Math.max(0, (Number.isFinite(cur) ? cur : 0) + delta);
    patchEntry(line.id, { qty: next === 0 ? '' : formatQty(next) });
  };

  const setCondition = (lineId: string, c: DeliveryCondition) => {
    haptic.select();
    // A problem usually needs a note or photo: open that area.
    patchEntry(lineId, c === 'ok' ? { condition: c } : { condition: c, open: true });
  };

  // ── Photos ──────────────────────────────────────────────────────────────

  const takePhoto = useCallback(async (): Promise<string | null> => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera access needed', 'Allow camera access in Settings, or choose from your library.');
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      return !result.canceled && result.assets[0] ? result.assets[0].uri : null;
    } catch (e) {
      console.warn('Camera launch failed:', e);
      Alert.alert('Camera unavailable', 'Could not open the camera. You can choose a photo from your library instead.');
      return null;
    }
  }, []);

  const pickFromLibrary = useCallback(async (limit: number): Promise<string[]> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to choose a photo.');
      return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: limit,
    });
    return result.canceled ? [] : result.assets.map((a) => a.uri);
  }, []);

  const addDocket = (uris: string[]) => {
    if (!uris.length) return;
    haptic.light();
    setDocketPhotos((prev) => [...prev, ...uris].slice(0, MAX_DOCKET_PHOTOS));
  };

  const captureDocket = async () => {
    if (canScan) {
      try {
        const pages = await scanDocument({ maxPages: MAX_DOCKET_PHOTOS - docketPhotos.length });
        if (pages) addDocket(pages);
        return;
      } catch (e) {
        console.warn('Docket scan failed, falling back to camera:', e);
      }
    }
    const uri = await takePhoto();
    if (uri) addDocket([uri]);
  };

  const addLinePhotos = (lineId: string, uris: string[]) => {
    if (!uris.length) return;
    haptic.light();
    setEntries((prev) => {
      const cur = prev[lineId] ?? BLANK_ENTRY;
      return { ...prev, [lineId]: { ...cur, photos: [...cur.photos, ...uris].slice(0, MAX_LINE_PHOTOS) } };
    });
  };

  const markupLinePhoto = async (lineId: string, index: number) => {
    const cur = entryFor(lineId);
    const edited = await markupPhoto(cur.photos[index]);
    if (edited) patchEntry(lineId, { photos: cur.photos.map((p, i) => (i === index ? edited : p)) });
  };

  // ── Leaving with unsaved work ───────────────────────────────────────────

  const dirty = useDirtyGuard({ entries, docketNumber, notes, docketPhotos });
  useEffect(() => {
    if (leaving) navigation.goBack();
  }, [leaving, navigation]);
  usePreventRemove(dirty.isDirty && !leaving, ({ data }) => {
    confirmDiscard(
      () => navigation.dispatch(data.action),
      "This delivery hasn't been checked in. Leave without it?",
      'Discard this check-in?',
    );
  });

  // ── Submit ──────────────────────────────────────────────────────────────

  const submit = async () => {
    if (!po || saving) return;
    const items: DeliveryPayload['items'] = [];
    for (const line of po.lines) {
      const e = entries[line.id];
      if (!e) continue;
      const qty = parseQty(e.qty);
      if (!Number.isFinite(qty) || qty < 0) {
        haptic.error();
        Alert.alert('Check the quantity', `"${e.qty}" isn't a quantity for ${line.description}.`);
        return;
      }
      const note = e.note.trim();
      // Nothing received, nothing wrong, nothing to say: leave the line out.
      if (qty === 0 && e.condition === 'ok' && !note && e.photos.length === 0) continue;
      items.push({ purchaseOrderItemId: line.id, qtyReceived: qty, condition: e.condition, note: note || null, photos: e.photos.map((uri) => ({ uri })) });
    }

    if (items.length === 0) {
      haptic.error();
      Alert.alert('Nothing to check in', 'Tap "All received", or enter what arrived on each line.');
      return;
    }
    if (docketRequired && docketPhotos.length === 0) {
      haptic.error();
      Alert.alert('Docket photo needed', 'Take a photo of the delivery docket before submitting.');
      return;
    }

    if (!submitIdentity.current) {
      submitIdentity.current = { clientRequestId: Crypto.randomUUID(), receivedAt: new Date().toISOString() };
    }
    setSaving(true);
    try {
      // Camera/picker files live in the cache dir, which iOS may clear while
      // the app is closed — copy them somewhere permanent for the queue.
      const persisted = await Promise.all(
        items.map(async (item) => ({
          ...item,
          photos: await Promise.all(item.photos.map(async (p) => ({ uri: await persistPhoto(p.uri) }))),
        })),
      );
      const payload: DeliveryPayload = {
        projectId,
        poId: po.id,
        clientRequestId: submitIdentity.current.clientRequestId,
        receivedAt: submitIdentity.current.receivedAt,
        docketNumber: docketNumber.trim() || null,
        notes: notes.trim() || null,
        docketPhotos: await Promise.all(docketPhotos.map(async (uri) => ({ uri: await persistPhoto(uri) }))),
        items: persisted,
        label: `Delivery · ${po.poNumber}`,
      };
      await addToQueue({ type: 'create-delivery', payload });
      // Send now if there is signal. A drain already running won't pick this
      // one up, so ask again once it ends.
      syncQueue().finally(() => syncQueue());
      haptic.success();
      toast.success(offline ? 'Checked in — sends when you have signal' : 'Delivery checked in');
      setLeaving(true);
    } catch (e: any) {
      haptic.error();
      Alert.alert("Couldn't save", e?.message || 'The check-in could not be saved on this phone.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <Ionicons name="lock-closed-outline" size={32} color={theme.textMuted} />
        <Text style={[styles.mutedText, { color: theme.textSecondary }]}>You don't have permission to view deliveries.</Text>
      </View>
    );
  }

  if (loading && !po) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <SkeletonList count={5} style={styles.skeleton} />
      </View>
    );
  }

  if (!po) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <Ionicons name="cloud-offline-outline" size={32} color={theme.textMuted} />
        <Text style={[styles.mutedText, { color: theme.textSecondary }]}>
          {offline
            ? "No signal, and this purchase order isn't saved on this phone yet. Open Deliveries once with signal."
            : "This purchase order couldn't be found."}
        </Text>
      </View>
    );
  }

  const outstandingLines = po.lines.filter((l) => l.qtyOutstanding > 0);
  const filledCount = po.lines.filter((l) => {
    const e = entries[l.id];
    return e && (parseQty(e.qty) > 0 || e.condition !== 'ok');
  }).length;
  const card = { backgroundColor: theme.card, borderColor: theme.border };
  const inputStyle = [styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }];

  const thumb = (uri: string, onRemove: () => void, onMarkup?: () => void, key?: string) => (
    <View key={key ?? uri} style={[styles.thumb, { backgroundColor: theme.subtle }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.thumbActions}>
        {onMarkup && canMarkup ? (
          <Pressable onPress={onMarkup} style={styles.thumbBtn} accessibilityRole="button" accessibilityLabel="Mark up photo">
            <Ionicons name="brush-outline" size={16} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            haptic.warning();
            onRemove();
          }}
          style={styles.thumbBtn}
          accessibilityRole="button"
          accessibilityLabel="Remove photo"
        >
          <Ionicons name="close" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );

  const renderLine = (line: DeliveryLine) => {
    const e = entryFor(line.id);
    const qty = parseQty(e.qty);
    const over = Number.isFinite(qty) && qty > line.qtyOutstanding && line.qtyOutstanding >= 0 && qty > 0;
    const done = line.qtyOutstanding <= 0;
    const unit = line.unit ? ` ${line.unit}` : '';
    return (
      <View key={line.id} style={[styles.lineCard, card, done && !entries[line.id] && { opacity: 0.6 }]}>
        <Text style={[styles.lineTitle, { color: theme.textPrimary }]}>{line.description}</Text>
        <Text style={[styles.lineMeta, { color: theme.textMuted }]}>
          Ordered {formatQty(line.qtyOrdered)}{unit} · Received {formatQty(line.qtyReceived)} ·{' '}
          <Text style={{ color: done ? theme.statusSuccess : theme.textPrimary, fontWeight: fontWeight.semibold }}>
            {done ? 'All in' : `${formatQty(line.qtyOutstanding)}${unit} to come`}
          </Text>
        </Text>

        {canAdd ? (
          <>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => step(line, -1)}
                style={[styles.stepBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                accessibilityRole="button"
                accessibilityLabel={`Less ${line.description}`}
              >
                <Ionicons name="remove" size={22} color={theme.textPrimary} />
              </Pressable>
              <TextInput
                value={e.qty}
                onChangeText={(t) => patchEntry(line.id, { qty: t })}
                onFocus={kb.onInputFocus}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={[styles.qtyInput, { borderColor: over ? theme.statusWarning : theme.border, color: theme.textPrimary, backgroundColor: theme.card }]}
                accessibilityLabel={`Quantity received, ${line.description}`}
                selectTextOnFocus
              />
              <Pressable
                onPress={() => step(line, 1)}
                style={[styles.stepBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                accessibilityRole="button"
                accessibilityLabel={`More ${line.description}`}
              >
                <Ionicons name="add" size={22} color={theme.textPrimary} />
              </Pressable>
              {!done ? (
                <Pressable
                  onPress={() => {
                    haptic.select();
                    patchEntry(line.id, { qty: formatQty(line.qtyOutstanding) });
                  }}
                  style={[styles.allBtn, { backgroundColor: theme.primaryLight }]}
                  accessibilityRole="button"
                  accessibilityLabel={`All of ${line.description} received`}
                >
                  <Text style={[styles.allBtnText, { color: theme.primary }]}>All {formatQty(line.qtyOutstanding)}</Text>
                </Pressable>
              ) : null}
            </View>
            {over ? (
              <Text style={[styles.hint, { color: theme.statusWarning }]}>More than is still to come — check the docket.</Text>
            ) : null}

            <View style={styles.conditionRow}>
              {CONDITIONS.map((c) => {
                const active = e.condition === c;
                const tone = c === 'ok' ? theme.statusSuccess : theme.statusDanger;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCondition(line.id, c)}
                    style={[styles.condChip, { backgroundColor: active ? tone : theme.card, borderColor: active ? tone : theme.border }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.condText, { color: active ? '#fff' : theme.textSecondary }]}>{CONDITION_LABEL[c]}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => {
                  haptic.select();
                  patchEntry(line.id, { open: !e.open });
                }}
                style={styles.moreBtn}
                accessibilityRole="button"
                accessibilityLabel="Note or photo"
              >
                <Ionicons
                  name={e.note || e.photos.length ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'}
                  size={20}
                  color={theme.primary}
                />
              </Pressable>
            </View>

            {e.open ? (
              <View style={styles.lineExtra}>
                <TextInput
                  value={e.note}
                  onChangeText={(t) => patchEntry(line.id, { note: t })}
                  onFocus={kb.onInputFocus}
                  placeholder={e.condition === 'ok' ? 'Note (optional)' : `What's ${e.condition === 'wrong' ? 'wrong' : e.condition}?`}
                  placeholderTextColor={theme.textMuted}
                  style={[...inputStyle, styles.multiline]}
                  multiline
                  maxLength={1000}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                  {e.photos.map((uri, i) =>
                    thumb(
                      uri,
                      () => patchEntry(line.id, { photos: e.photos.filter((_, j) => j !== i) }),
                      () => markupLinePhoto(line.id, i),
                      `${uri}-${i}`,
                    ),
                  )}
                  {e.photos.length < MAX_LINE_PHOTOS ? (
                    <View style={styles.addCol}>
                      <Pressable
                        onPress={async () => {
                          const uri = await takePhoto();
                          if (uri) addLinePhotos(line.id, [uri]);
                        }}
                        style={[styles.addMore, { borderColor: theme.border, backgroundColor: theme.card }]}
                        accessibilityRole="button"
                        accessibilityLabel="Photograph this line"
                      >
                        <Ionicons name="camera-outline" size={20} color={theme.primary} />
                      </Pressable>
                      <Pressable
                        onPress={async () => addLinePhotos(line.id, await pickFromLibrary(MAX_LINE_PHOTOS - e.photos.length))}
                        style={[styles.addMore, { borderColor: theme.border, backgroundColor: theme.card }]}
                        accessibilityRole="button"
                        accessibilityLabel="Add a photo from library"
                      >
                        <Ionicons name="images-outline" size={20} color={theme.primary} />
                      </Pressable>
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  const due = dateStrOf(po.requiredByDate ?? null);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        {...kb.scrollProps}
        contentContainerStyle={[styles.content, readableFrame]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <PendingUploadsBanner projectId={projectId} types={['create-delivery']} noun="delivery" />
        {offline ? (
          <Text style={[styles.hint, { color: theme.statusWarning }]}>
            No signal — working from the copy saved on this phone. The check-in sends when signal comes back.
          </Text>
        ) : null}

        {/* Header */}
        <View style={[styles.headerCard, card]}>
          <View style={styles.headerTop}>
            <Text style={[styles.poNumber, { color: theme.textMuted }]}>{po.poNumber}</Text>
            <DeliveryStatusChip status={po.deliveryStatus} />
          </View>
          <Text style={[styles.supplier, { color: theme.textPrimary }]}>{po.supplierName || 'No supplier'}</Text>
          {po.title ? <Text style={[styles.headerLine, { color: theme.textSecondary }]}>{po.title}</Text> : null}
          {due ? (
            <Text style={[styles.headerLine, { color: theme.textSecondary }]}>
              Required by {fromLocalDateStr(due).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          ) : null}
          {po.deliveryAddress ? (
            <View style={styles.iconLine}>
              <Ionicons name="location-outline" size={16} color={theme.textMuted} />
              <Text style={[styles.headerLine, styles.flex, { color: theme.textSecondary }]}>{po.deliveryAddress}</Text>
            </View>
          ) : null}
          {po.deliveryInstructions ? (
            <View style={styles.iconLine}>
              <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
              <Text style={[styles.headerLine, styles.flex, { color: theme.textSecondary }]}>{po.deliveryInstructions}</Text>
            </View>
          ) : null}
        </View>

        {canAdd && outstandingLines.length > 0 ? (
          <Pressable
            onPress={allReceived}
            style={[styles.bigBtn, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
            accessibilityLabel="All received"
          >
            <Ionicons name="checkmark-done" size={24} color="#fff" />
            <Text style={styles.bigBtnText}>All received</Text>
          </Pressable>
        ) : null}
        {!canAdd ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>You can view this order but not check deliveries in.</Text>
        ) : null}

        {/* Lines */}
        <Text style={[styles.section, { color: theme.textPrimary }]}>
          Items{filledCount ? ` · ${filledCount} entered` : ''}
        </Text>
        {po.lines.length === 0 ? (
          <Text style={[styles.mutedText, { color: theme.textMuted }]}>This order has no lines.</Text>
        ) : (
          po.lines.map(renderLine)
        )}

        {/* Docket */}
        {canAdd ? (
          <>
            <Text style={[styles.section, { color: theme.textPrimary }]}>
              Docket{docketRequired ? '' : ' (optional)'}
            </Text>
            <TextInput
              value={docketNumber}
              onChangeText={setDocketNumber}
              onFocus={kb.onInputFocus}
              placeholder="Docket number"
              placeholderTextColor={theme.textMuted}
              style={inputStyle}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={100}
              accessibilityLabel="Docket number"
            />
            {docketPhotos.length === 0 ? (
              <View style={styles.photoEmptyRow}>
                <Pressable
                  onPress={captureDocket}
                  style={[styles.docketBtn, { backgroundColor: theme.card, borderColor: docketRequired ? theme.primary : theme.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={canScan ? 'Scan docket' : 'Photograph docket'}
                >
                  <Ionicons name={canScan ? 'scan-outline' : 'camera'} size={24} color={theme.primary} />
                  <Text style={[styles.docketBtnText, { color: theme.textPrimary }]}>
                    {canScan ? 'Scan docket' : 'Photograph docket'}
                    {docketRequired ? ' (required)' : ''}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={async () => addDocket(await pickFromLibrary(MAX_DOCKET_PHOTOS))}
                  style={[styles.docketAlt, { backgroundColor: theme.card, borderColor: theme.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Choose docket photo from library"
                >
                  <Ionicons name="images-outline" size={22} color={theme.primary} />
                </Pressable>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                {docketPhotos.map((uri, i) =>
                  thumb(uri, () => setDocketPhotos((prev) => prev.filter((_, j) => j !== i)), undefined, `${uri}-${i}`),
                )}
                {docketPhotos.length < MAX_DOCKET_PHOTOS ? (
                  <View style={styles.addCol}>
                    <Pressable
                      onPress={captureDocket}
                      style={[styles.addMore, { borderColor: theme.border, backgroundColor: theme.card }]}
                      accessibilityRole="button"
                      accessibilityLabel="Add another docket page"
                    >
                      <Ionicons name={canScan ? 'scan-outline' : 'camera-outline'} size={20} color={theme.primary} />
                    </Pressable>
                    <Pressable
                      onPress={async () => addDocket(await pickFromLibrary(MAX_DOCKET_PHOTOS - docketPhotos.length))}
                      style={[styles.addMore, { borderColor: theme.border, backgroundColor: theme.card }]}
                      accessibilityRole="button"
                      accessibilityLabel="Add docket page from library"
                    >
                      <Ionicons name="images-outline" size={20} color={theme.primary} />
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
            )}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onFocus={kb.onInputFocus}
              placeholder="Delivery notes (optional)"
              placeholderTextColor={theme.textMuted}
              style={[...inputStyle, styles.multiline]}
              multiline
              maxLength={2000}
              accessibilityLabel="Delivery notes"
            />
          </>
        ) : null}

        {/* Past deliveries — online only */}
        {history && history.length > 0 ? (
          <>
            <Text style={[styles.section, { color: theme.textPrimary }]}>Past deliveries</Text>
            {history.map((d) => (
              <View key={d.id} style={[styles.pastCard, card]}>
                <View style={styles.headerTop}>
                  <Text style={[styles.pastTitle, { color: theme.textPrimary }]}>{fmtDateTime(d.receivedAt)}</Text>
                  {d.hasIssues ? <DeliveryStatusChip status="issues" /> : null}
                </View>
                <Text style={[styles.lineMeta, { color: theme.textMuted }]}>
                  {[d.receivedByName, d.docketNumber ? `Docket ${d.docketNumber}` : null].filter(Boolean).join(' · ') || 'Checked in'}
                </Text>
                {d.items.map((it) => (
                  <Text key={it.id} style={[styles.pastItem, { color: theme.textSecondary }]}>
                    {formatQty(it.qtyReceived)} × {it.description}
                    {it.condition !== 'ok' ? (
                      <Text style={{ color: theme.statusDanger }}> · {CONDITION_LABEL[it.condition]}</Text>
                    ) : null}
                    {it.note ? ` — ${it.note}` : ''}
                  </Text>
                ))}
                {d.notes ? <Text style={[styles.pastItem, { color: theme.textSecondary }]}>{d.notes}</Text> : null}
                {d.docketPhotoUrls.length + d.items.reduce((n, it) => n + it.photoUrls.length, 0) > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                    {[...d.docketPhotoUrls, ...d.items.flatMap((it) => it.photoUrls)].map((url, i) => (
                      <Image
                        key={`${url}-${i}`}
                        source={getAuthedImageSource(url)}
                        style={[styles.pastThumb, { backgroundColor: theme.subtle }]}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {canAdd ? (
        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + 10 }]}>
          <View style={readableFrame}>
            <Pressable
              onPress={submit}
              disabled={saving}
              style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Submit check-in"
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.submitText}>{saving ? 'Saving…' : 'Submit check-in'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {markupElement}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  mutedText: { fontSize: fontSize.base, textAlign: 'center' },
  skeleton: { padding: 16, gap: 16 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hint: { fontSize: fontSize.xs },
  headerCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: 14, gap: 4 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  poNumber: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, fontVariant: ['tabular-nums'] },
  supplier: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  headerLine: { fontSize: fontSize.bodySm, lineHeight: 19 },
  iconLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  bigBtn: {
    minHeight: 64,
    borderRadius: radius.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bigBtnText: { color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  section: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  lineCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: 12, gap: 8 },
  lineTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold },
  lineMeta: { fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 48, height: 48, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  qtyInput: {
    width: 80,
    height: 48,
    borderWidth: 1,
    borderRadius: radius.lg,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  allBtn: { height: 48, paddingHorizontal: 12, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  allBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  conditionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  condChip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.full, borderWidth: 1, justifyContent: 'center' },
  condText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  moreBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  lineExtra: { gap: 8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: fontSize.base,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  thumbRow: { gap: 10 },
  thumb: { width: 110, height: 110, borderRadius: radius.xl, overflow: 'hidden' },
  thumbActions: { position: 'absolute', top: 4, right: 4, flexDirection: 'row', gap: 4 },
  thumbBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCol: { gap: 10 },
  addMore: {
    width: 50,
    height: 50,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyRow: { flexDirection: 'row', gap: 10 },
  docketBtn: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.xxl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  docketBtnText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  docketAlt: { width: 72, minHeight: 72, borderRadius: radius.xxl, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pastCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: 12, gap: 4 },
  pastTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  pastItem: { fontSize: fontSize.bodySm, lineHeight: 19 },
  pastThumb: { width: 64, height: 64, borderRadius: radius.lg, marginTop: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingHorizontal: 16 },
  submitBtn: {
    minHeight: 52,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
