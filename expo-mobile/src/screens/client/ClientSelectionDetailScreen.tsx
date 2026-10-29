import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest } from '../../services/api';
import { usePermission } from '../../lib/usePermission';
import { haptic } from '../../lib/haptics';
import { timeAgo } from '../../lib/format';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { firstImage, formatMoney, type SelectionOption } from '../../lib/selections';
import { PORTAL_KEYS, canClientChoose, formatDay, selectionStatus } from '../../lib/clientPortal';
import CroppedImage from '../../components/selections/CroppedImage';
import { PressableScale } from '../../components/ui/PressableScale';
import { ClientCard, ClientEmpty, ClientLoading, ClientStatusPill } from '../../components/client/ClientUI';
import ClientOptionSheet from '../../components/client/ClientOptionSheet';
import ClientSuggestOptionSheet, { type SuggestedOption } from '../../components/client/ClientSuggestOptionSheet';
import type { ClientSelectionRow } from './ClientSelectionsScreen';

/**
 * One selection, for a client deciding — the phone twin of the web portal's
 * ClientSelectionDetail. Open an option to see every photo and the specs, and
 * choose it there. A pick is a pick, not an approval: the builder confirms it.
 *
 * Choosing, suggesting and commenting go through the session routes the web
 * portal uses (…/client-select, …/client-options, …/client-comments), which
 * share the emailed link's guards — locked once confirmed, clientCanChange,
 * the decision log and the builder's notification.
 */

type ClientOption = SelectionOption & { clientSuggested?: boolean | null; suggestedBy?: string | null };

interface SelectionComment {
  id: string;
  content: string;
  createdByName?: string | null;
  isClientComment?: boolean | null;
  createdAt: string;
}

export default function ClientSelectionDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const selectionId: string = route.params?.selectionId;

  const canChoosePerm = usePermission(PORTAL_KEYS.selections, 'edit');
  const canComment = usePermission(PORTAL_KEYS.selections, 'add');

  const [selection, setSelection] = useState<ClientSelectionRow | null>(null);
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [comments, setComments] = useState<SelectionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [openOptionId, setOpenOptionId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sel, opts, thread] = await Promise.all([
        apiFetch<ClientSelectionRow & { options?: ClientOption[] }>(`/api/selections/${selectionId}`),
        apiFetch<ClientOption[]>(`/api/selections/${selectionId}/options`).catch(() => [] as ClientOption[]),
        canComment
          ? apiFetch<SelectionComment[]>(`/api/selections/${selectionId}/client-comments`).catch(() => [] as SelectionComment[])
          : Promise.resolve([] as SelectionComment[]),
      ]);
      setSelection(sel);
      setOptions(sel?.options?.length ? sel.options : opts ?? []);
      setComments(thread ?? []);
      setMissing(false);
    } catch {
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [selectionId, canComment]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const merged = useMemo(() => (selection ? { ...selection, options } : null), [selection, options]);
  const status = merged ? selectionStatus(merged) : null;
  const confirmed = options.find((o) => o.approvedAt);
  const chosen = confirmed ?? options.find((o) => o.isSelectedByClient);
  const showMoney = options.some((o) => o.totalCost != null);
  const allowanceCents = showMoney ? selection?.allowance ?? null : null;
  const canChoose = canChoosePerm && !!merged && canClientChoose(merged);
  const openOption = options.find((o) => o.id === openOptionId) ?? null;

  const choose = async (option: ClientOption) => {
    setChoosing(true);
    try {
      await apiRequest(`/api/selections/${selectionId}/options/${option.id}/client-select`, 'PATCH', {});
      haptic.success();
      setOpenOptionId(null);
      await load();
      Alert.alert('Choice sent', 'Your builder has been notified. They will confirm it with you.');
    } catch (err: any) {
      Alert.alert("We couldn't save that", err?.message || 'Please try again, or contact your builder.');
    } finally {
      setChoosing(false);
    }
  };

  const suggest = async (value: SuggestedOption) => {
    setSuggesting(true);
    try {
      await apiRequest(`/api/selections/${selectionId}/client-options`, 'POST', value);
      haptic.success();
      setSuggestOpen(false);
      await load();
      Alert.alert('Suggestion sent', 'Your builder will take a look and price it.');
    } catch (err: any) {
      Alert.alert("We couldn't send that", err?.message || 'Please try again.');
    } finally {
      setSuggesting(false);
    }
  };

  const postComment = async () => {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
    try {
      await apiRequest(`/api/selections/${selectionId}/client-comments`, 'POST', { content });
      setDraft('');
      const thread = await apiFetch<SelectionComment[]>(`/api/selections/${selectionId}/client-comments`);
      setComments(thread ?? []);
    } catch (err: any) {
      Alert.alert("We couldn't post that", err?.message || 'Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={theme.textSecondary} />
        </Pressable>
        <Text style={[styles.barTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {selection?.name ?? route.params?.name ?? 'Selection'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ClientLoading />
      ) : missing || !selection || !status ? (
        <ClientEmpty icon="alert-circle-outline" title="This selection isn't available" body="Ask your builder if you think it should be." />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          <ClientCard style={styles.summary}>
            <ClientStatusPill label={status.label} tone={status.tone} />
            <View style={styles.facts}>
              <Fact label="Category" value={selection.category || '—'} />
              <Fact label="Location" value={selection.room || '—'} />
              {!confirmed && <Fact label="Choose by" value={selection.deadline ? formatDay(selection.deadline) : '—'} />}
            </View>
            {!!selection.description && (
              <Text style={[styles.description, { color: theme.textPrimary }]}>{selection.description}</Text>
            )}
            {showMoney && (
              <View style={[styles.money, { borderTopColor: theme.border }]}>
                {allowanceCents != null && allowanceCents > 0 && <Fact label="Allowance" value={formatMoney(allowanceCents)} />}
                <Fact label="Selected" value={chosen?.totalCost != null ? formatMoney(chosen.totalCost) : '—'} strong />
              </View>
            )}
          </ClientCard>

          {canChoose && options.length > 0 && (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Open an option to see the photos and details, then choose the one you'd like.
            </Text>
          )}

          {canChoose && selection.clientCanAddOption && (
            <Pressable
              onPress={() => setSuggestOpen(true)}
              style={[styles.suggest, { borderColor: theme.borderStrong }]}
            >
              <Ionicons name="bulb-outline" size={18} color={theme.primary} />
              <Text style={[styles.suggestText, { color: theme.textSecondary }]}>
                Seen something you'd prefer? <Text style={{ color: theme.primary, fontWeight: fontWeight.semibold }}>Suggest an option</Text>
              </Text>
            </Pressable>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            OPTIONS{options.length ? ` · ${options.length}` : ''}
          </Text>
          {options.length === 0 ? (
            <ClientCard>
              <Text style={{ color: theme.textSecondary, fontSize: fontSize.sm }}>Your builder hasn't added options to choose from yet.</Text>
            </ClientCard>
          ) : (
            <View style={styles.stack}>
              {options.map((option) => {
                const image = firstImage(option);
                const isChosen = chosen?.id === option.id;
                return (
                  <PressableScale key={option.id} onPress={() => { haptic.select(); setOpenOptionId(option.id); }}>
                    <ClientCard style={[styles.option, isChosen && { borderColor: theme.primary, borderWidth: 1.5 }]}>
                      <View style={[styles.optionThumb, { backgroundColor: theme.subtle }]}>
                        {image ? (
                          <CroppedImage filePath={image.filePath} x={image.thumbnailX} y={image.thumbnailY} zoom={image.thumbnailZoom} style={StyleSheet.absoluteFill} />
                        ) : (
                          <Ionicons name="image-outline" size={22} color={theme.textMuted} />
                        )}
                      </View>
                      <View style={styles.optionBody}>
                        <Text style={[styles.optionName, { color: theme.textPrimary }]} numberOfLines={2}>{option.name}</Text>
                        {!!(option.brand || option.sku) && (
                          <Text style={[styles.optionMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                            {[option.brand, option.sku].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                        <View style={styles.optionTags}>
                          {option.approvedAt ? (
                            <ClientStatusPill label="Confirmed" tone="done" />
                          ) : option.isSelectedByClient ? (
                            <ClientStatusPill label="Your choice" tone="info" />
                          ) : null}
                          {option.clientSuggested && (
                            <ClientStatusPill label={option.suggestedBy ? `Suggested by ${option.suggestedBy}` : 'Suggested'} tone="waiting" />
                          )}
                        </View>
                      </View>
                      {option.totalCost != null && (
                        <Text style={[styles.optionPrice, { color: theme.textPrimary }]}>{formatMoney(option.totalCost)}</Text>
                      )}
                    </ClientCard>
                  </PressableScale>
                );
              })}
            </View>
          )}

          {canComment && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                COMMENTS{comments.length ? ` · ${comments.length}` : ''}
              </Text>
              <ClientCard style={styles.comments}>
                <Text style={[styles.hintSmall, { color: theme.textMuted }]}>
                  Anything you post here goes to your builder on this selection.
                </Text>
                {comments.map((c) => (
                  <View
                    key={c.id}
                    style={[styles.comment, { backgroundColor: c.isClientComment ? theme.primaryLight : theme.subtle }]}
                  >
                    <Text style={[styles.commentMeta, { color: theme.textMuted }]}>
                      {c.createdByName || (c.isClientComment ? 'You' : 'Your builder')} · {timeAgo(c.createdAt)}
                    </Text>
                    <Text style={[styles.commentText, { color: theme.textPrimary }]}>{c.content}</Text>
                  </View>
                ))}
                <View style={[styles.composer, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Ask a question or leave a note"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    style={[styles.composerInput, { color: theme.textPrimary }]}
                  />
                  <Pressable
                    onPress={postComment}
                    disabled={!draft.trim() || posting}
                    accessibilityLabel="Send comment"
                    style={[styles.send, { backgroundColor: draft.trim() ? theme.primary : theme.border }]}
                  >
                    {posting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={18} color="#FFFFFF" />}
                  </Pressable>
                </View>
              </ClientCard>
            </>
          )}
        </ScrollView>
      )}

      <ClientOptionSheet
        option={openOption}
        onClose={() => setOpenOptionId(null)}
        showPrice={showMoney}
        isChosen={!!openOption && chosen?.id === openOption.id}
        canChoose={canChoose}
        choosing={choosing}
        onChoose={() => openOption && choose(openOption)}
        onOpenLink={(url) => Linking.openURL(url)}
      />

      <ClientSuggestOptionSheet
        visible={suggestOpen}
        submitting={suggesting}
        onClose={() => setSuggestOpen(false)}
        onSubmit={suggest}
      />
    </KeyboardAvoidingView>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: theme.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.factValue, { color: strong ? theme.primary : theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  barTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, textAlign: 'center' },
  content: { paddingHorizontal: 16, gap: 4 },
  summary: { gap: 12 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  fact: { gap: 2 },
  factLabel: { fontSize: 11, fontWeight: fontWeight.semibold, letterSpacing: 0.5 },
  factValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  description: { fontSize: fontSize.sm, lineHeight: 20 },
  money: { flexDirection: 'row', gap: 24, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  hint: { fontSize: fontSize.sm, marginTop: 12 },
  hintSmall: { fontSize: fontSize.bodySm },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.xl, padding: 12, marginTop: 12 },
  suggestText: { flex: 1, fontSize: fontSize.sm },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  stack: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  optionThumb: { width: 72, height: 72, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  optionBody: { flex: 1, gap: 3 },
  optionName: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium },
  optionMeta: { fontSize: fontSize.bodySm },
  optionTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  optionPrice: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  comments: { gap: 10 },
  comment: { borderRadius: radius.lg, padding: 10, gap: 4 },
  commentMeta: { fontSize: fontSize.xs },
  commentText: { fontSize: fontSize.sm, lineHeight: 20 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: radius.xl, paddingLeft: 12, paddingRight: 6, paddingVertical: 6 },
  composerInput: { flex: 1, fontSize: fontSize.sm, maxHeight: 120, paddingVertical: 6 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
