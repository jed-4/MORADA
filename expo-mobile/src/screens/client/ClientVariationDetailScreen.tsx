import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../lib/usePermission';
import { haptic } from '../../lib/haptics';
import { formatMoney } from '../../lib/selections';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { PORTAL_KEYS, formatDay, formatDaysChanged, variationStatus } from '../../lib/clientPortal';
import { ClientCard, ClientEmpty, ClientLoading, ClientStatusPill } from '../../components/client/ClientUI';
import DocumentViewer, { type ViewableDocument } from '../../components/DocumentViewer';

/**
 * One variation, as the document the client was sent, with the signature.
 *
 * Every figure on this screen comes from the server's `document` — the web
 * portal's and the PDF's own document model, run server-side over the same
 * client-safe payload (server/clientVariationDocument.ts). Nothing here adds
 * up money, so the rows always reconcile with the Total being signed, and a
 * column the builder hid was never sent.
 *
 * Signing posts to the session route (…/client-sign), which shares the
 * emailed link's guards: already signed, finalised, deadline passed. The
 * signature is the session's owner — the server takes the name from the
 * login, never from the request.
 */

interface DocLine {
  id: string;
  name?: string | null;
  description?: string | null;
  costCode?: string | null;
  quantity?: number;
  unitType?: string | null;
  unitPriceExCents?: number;
  unitPriceIncCents?: number;
  amountExCents?: number;
  amountIncCents?: number;
}

interface ClientVariationView {
  variation: {
    id: string;
    variationNumber: string;
    name: string;
    status: string;
    totalAmount: number;
    createdAt?: string | null;
    approvalDeadline?: string | null;
    daysChanged?: number | null;
    introductionText?: string | null;
    closingText?: string | null;
    termsAndConditions?: string | null;
    rejectionReason?: string | null;
    builderSignedName?: string | null;
    builderSignedDate?: string | null;
    clientSignedName?: string | null;
    clientSignedDate?: string | null;
  };
  attachments?: Array<{ index: number; name: string }>;
  project?: { name?: string | null; address?: string | null; clientName?: string | null };
  company?: { name?: string | null; phone?: string | null; email?: string | null; abn?: string | null };
  document?: {
    grouped: boolean;
    groups: Array<{ type: string; label: string; totalIncCents: number; lines: DocLine[] }>;
    lines: DocLine[];
    allowanceLines: Array<{ id: string; description: string; amountIncCents: number }>;
    bills: Array<{ id: string; billNumber?: string | null; supplierName?: string | null; totalIncCents: number }>;
    labourIncCents: number;
    notItemisedIncCents: number;
    globalMarkupIncCents: number;
    globalMarkupPercent?: number;
    subtotalCents: number;
    gstCents: number;
    totalCents: number;
  };
}

function formatTime(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

export default function ClientVariationDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const variationId: string = route.params?.variationId;
  const { user } = useAuth();
  const canSign = usePermission(PORTAL_KEYS.variations, 'approve');
  const signerName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || '';

  const [data, setData] = useState<ClientVariationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [openDoc, setOpenDoc] = useState<ViewableDocument | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const view = await apiFetch<ClientVariationView>(`/api/variations/${variationId}/client-view`);
      setData(view);
      setMissing(!view?.variation);
    } catch {
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [variationId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sign = async (action: 'approve' | 'reject', rejectionReason?: string) => {
    setSigning(true);
    try {
      await apiRequest(`/api/variations/${variationId}/client-sign`, 'POST', {
        action,
        ...(rejectionReason ? { rejectionReason } : {}),
      });
      haptic.success();
      setRejectOpen(false);
      await load();
      Alert.alert(
        action === 'approve' ? 'Variation approved' : 'Variation declined',
        action === 'approve'
          ? 'Your signature has been recorded and your builder has been notified.'
          : 'Your builder has been notified.',
      );
    } catch (err: any) {
      Alert.alert("Couldn't record that", err?.message || 'Please try again, or contact your builder.');
    } finally {
      setSigning(false);
    }
  };

  const confirmApprove = () => {
    if (!data) return;
    const v = data.variation;
    const total = formatMoney(data.document?.totalCents ?? v.totalAmount);
    Alert.alert(
      `Approve ${v.variationNumber}?`,
      `You're signing as ${signerName} to approve "${v.name}" for ${total} inc GST. Your builder will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve & sign', onPress: () => sign('approve') },
      ],
    );
  };

  const v = data?.variation;
  const doc = data?.document;
  const status = v ? variationStatus({ ...v, totalAmount: v.totalAmount }) : null;
  const awaiting = status?.tone === 'waiting';
  const daysChanged = formatDaysChanged(v?.daysChanged);

  const renderLine = (line: DocLine) => {
    const title = line.name || line.description || '—';
    const sub = line.name && line.description ? line.description : null;
    const qty = line.quantity != null ? `${line.quantity}${line.unitType ? ` ${line.unitType}` : ''}` : null;
    const unit = line.unitPriceIncCents != null
      ? `${formatMoney(line.unitPriceIncCents)} inc GST`
      : line.unitPriceExCents != null ? `${formatMoney(line.unitPriceExCents)} ex GST` : null;
    const meta = [line.costCode, qty && unit ? `${qty} × ${unit}` : qty || unit].filter(Boolean).join(' · ');
    const amount = line.amountIncCents != null
      ? formatMoney(line.amountIncCents)
      : line.amountExCents != null ? `${formatMoney(line.amountExCents)} ex` : null;
    return (
      <View key={line.id} style={[styles.line, { borderTopColor: theme.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.lineTitle, { color: theme.textPrimary }]}>{title}</Text>
          {!!sub && <Text style={[styles.lineSub, { color: theme.textSecondary }]}>{sub}</Text>}
          {!!meta && <Text style={[styles.lineSub, { color: theme.textMuted }]}>{meta}</Text>}
        </View>
        {!!amount && <Text style={[styles.lineAmount, { color: theme.textPrimary }]}>{amount}</Text>}
      </View>
    );
  };

  const SummaryRow = ({ label, cents }: { label: string; cents: number }) => (
    <View style={[styles.line, { borderTopColor: theme.border }]}>
      <Text style={[styles.lineTitle, { color: theme.textPrimary, flex: 1 }]}>{label}</Text>
      <Text style={[styles.lineAmount, { color: theme.textPrimary }]}>{formatMoney(cents)}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={theme.textSecondary} />
        </Pressable>
        <Text style={[styles.barTitle, { color: theme.textPrimary }]} numberOfLines={1}>{v?.variationNumber ?? 'Variation'}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ClientLoading />
      ) : missing || !v || !status ? (
        <ClientEmpty icon="alert-circle-outline" title="This variation isn't available" body="Your builder may not have sent it yet." />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (awaiting && canSign ? 120 : 32) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {/* Hero: who it's from, the total, and where it stands. */}
          <View style={[styles.hero, { backgroundColor: theme.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroCompany}>{data?.company?.name || 'Your builder'}</Text>
              {!!data?.company?.abn && <Text style={styles.heroSmall}>ABN {data.company.abn}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <ClientStatusPill label={status.label} tone={status.tone} />
              <Text style={styles.heroTotal}>{formatMoney(doc?.totalCents ?? v.totalAmount)}</Text>
              <Text style={styles.heroSmall}>inc GST</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>{v.name}</Text>

          <ClientCard style={styles.facts}>
            <Fact label="Project" value={data?.project?.name} sub={data?.project?.address} />
            <Fact label="Issued" value={v.createdAt ? formatDay(v.createdAt) : null} />
            {awaiting && <Fact label="Respond by" value={v.approvalDeadline ? formatDay(v.approvalDeadline) : null} />}
            <Fact label="Time on the job" value={daysChanged} />
          </ClientCard>

          {!!v.introductionText && <Text style={[styles.body, { color: theme.textSecondary }]}>{v.introductionText}</Text>}

          {doc && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>WHAT'S CHANGING</Text>
              <ClientCard style={styles.lines}>
                {doc.grouped
                  ? doc.groups.map((g) => (
                      <View key={g.type}>
                        <View style={styles.groupHead}>
                          <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{g.label}</Text>
                          <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{formatMoney(g.totalIncCents)}</Text>
                        </View>
                        {g.lines.map(renderLine)}
                      </View>
                    ))
                  : doc.lines.map(renderLine)}
                {doc.allowanceLines.map((a) => (
                  <SummaryRow key={a.id} label={a.description || 'Allowance'} cents={a.amountIncCents} />
                ))}
                {doc.bills.map((b) => (
                  <SummaryRow key={b.id} label={[b.supplierName, b.billNumber].filter(Boolean).join(' · ') || 'Bill'} cents={b.totalIncCents} />
                ))}
                {doc.labourIncCents > 0 && <SummaryRow label="Site labour" cents={doc.labourIncCents} />}
                {doc.notItemisedIncCents > 0 && <SummaryRow label="Additional works (not itemised)" cents={doc.notItemisedIncCents} />}
                {doc.globalMarkupIncCents !== 0 && <SummaryRow label={doc.globalMarkupPercent ? `Margin (${doc.globalMarkupPercent}%)` : 'Margin'} cents={doc.globalMarkupIncCents} />}
              </ClientCard>

              <ClientCard style={styles.totals}>
                <TotalRow label="Subtotal (ex GST)" value={formatMoney(doc.subtotalCents)} />
                <TotalRow label="GST (10%)" value={formatMoney(doc.gstCents)} />
                <View style={[styles.totalDivider, { backgroundColor: theme.border }]} />
                <TotalRow label="Total (inc GST)" value={formatMoney(doc.totalCents)} strong />
              </ClientCard>
            </>
          )}

          {!doc && (
            <ClientCard style={{ marginTop: 12 }}>
              <Text style={[styles.note, { color: theme.textSecondary, fontSize: fontSize.sm }]}>
                Open the web portal to see the full breakdown of this variation.
              </Text>
            </ClientCard>
          )}

          {v.status === 'rejected' && !!v.rejectionReason && (
            <ClientCard style={{ backgroundColor: theme.statusDangerBg, borderColor: theme.statusDangerBg }}>
              <Text style={[styles.factLabel, { color: theme.statusDanger }]}>REASON FOR DECLINING</Text>
              <Text style={[styles.body, { color: theme.textPrimary, marginTop: 4 }]}>{v.rejectionReason}</Text>
            </ClientCard>
          )}

          {/* The PDF they were emailed, served verbatim from the archive — after
              signing, the copy their signature belongs to. */}
          <Pressable
            onPress={() => setOpenDoc({
              path: `/api/variations/${variationId}/client-document`,
              name: `${v.variationNumber || 'Variation'}.pdf`,
              notFoundMessage: "There's no PDF for this variation yet — your builder hasn't emailed one. Everything in it is shown on this screen.",
            })}
            style={({ pressed }) => [styles.pdfButton, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Ionicons name="document-text-outline" size={18} color={theme.primary} />
            <Text style={[styles.pdfButtonText, { color: theme.primary }]}>
              {v.clientSignedName ? 'View signed copy (PDF)' : 'View PDF'}
            </Text>
          </Pressable>

          {!!data?.attachments?.length && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ATTACHMENTS</Text>
              <ClientCard style={{ gap: 4 }}>
                {data.attachments.map((a) => (
                  <Pressable
                    key={a.index}
                    onPress={() => setOpenDoc({ path: `/api/variations/${variationId}/client-attachments/${a.index}`, name: a.name })}
                    style={({ pressed }) => [styles.attachment, pressed && { opacity: 0.6 }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="document-outline" size={16} color={theme.primary} />
                    <Text style={[styles.body, { color: theme.primary, flex: 1, marginTop: 0 }]} numberOfLines={1}>{a.name}</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                  </Pressable>
                ))}
              </ClientCard>
            </>
          )}

          {!!v.closingText && <Text style={[styles.body, { color: theme.textSecondary, marginTop: 16 }]}>{v.closingText}</Text>}

          {!!v.termsAndConditions && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>TERMS & CONDITIONS</Text>
              <Text style={[styles.note, { color: theme.textMuted, lineHeight: 18 }]}>{v.termsAndConditions}</Text>
            </>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>SIGNATURES</Text>
          <ClientCard style={{ gap: 14 }}>
            <Signature title={`For ${data?.company?.name || 'the builder'}`} name={v.builderSignedName} date={v.builderSignedDate} />
            <View style={[styles.totalDivider, { backgroundColor: theme.border }]} />
            <Signature
              title="Client authorisation"
              name={v.clientSignedName}
              date={v.clientSignedDate}
              pending={awaiting ? (canSign ? `You'll sign as ${signerName}` : 'Waiting on the client') : undefined}
            />
          </ClientCard>
        </ScrollView>
      )}

      {v && awaiting && canSign && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Pressable
            onPress={() => setRejectOpen(true)}
            disabled={signing}
            style={[styles.decline, { borderColor: theme.statusDanger }]}
          >
            <Text style={[styles.declineText, { color: theme.statusDanger }]}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={confirmApprove}
            disabled={signing}
            style={({ pressed }) => [styles.approve, { backgroundColor: theme.statusSuccessSolid, opacity: pressed || signing ? 0.85 : 1 }]}
          >
            {signing ? <ActivityIndicator color="#FFFFFF" /> : (
              <>
                <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                <Text style={styles.approveText}>Approve & sign</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <DocumentViewer document={openDoc} onClose={() => setOpenDoc(null)} />

      <Modal visible={rejectOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRejectOpen(false)}>
        <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheetBar, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setRejectOpen(false)} hitSlop={10}>
              <Text style={[styles.sheetAction, { color: theme.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Decline variation</Text>
            <View style={{ width: 52 }} />
          </View>
          <View style={styles.sheetBody}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              You're declining {v?.variationNumber} as {signerName}. Let your builder know why, if you like.
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason (optional)"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.reason, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }]}
            />
            <Pressable
              onPress={() => sign('reject', reason.trim() || undefined)}
              disabled={signing}
              style={[styles.confirmDecline, { backgroundColor: theme.statusDangerSolid, opacity: signing ? 0.85 : 1 }]}
            >
              {signing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.approveText}>Decline variation</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );

  function Fact({ label, value, sub }: { label: string; value?: string | null; sub?: string | null }) {
    if (!value) return null;
    return (
      <View style={styles.fact}>
        <Text style={[styles.factLabel, { color: theme.textMuted }]}>{label.toUpperCase()}</Text>
        <Text style={[styles.factValue, { color: theme.textPrimary }]}>{value}</Text>
        {!!sub && <Text style={[styles.lineSub, { color: theme.textSecondary }]}>{sub}</Text>}
      </View>
    );
  }

  function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
      <View style={styles.totalRow}>
        <Text style={[strong ? styles.totalStrong : styles.totalLabel, { color: strong ? theme.primary : theme.textSecondary }]}>{label}</Text>
        <Text style={[strong ? styles.totalStrongValue : styles.totalValue, { color: strong ? theme.primary : theme.textPrimary }]}>{value}</Text>
      </View>
    );
  }

  function Signature({ title, name, date, pending }: { title: string; name?: string | null; date?: string | null; pending?: string }) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={[styles.factLabel, { color: theme.textMuted }]}>{title.toUpperCase()}</Text>
        {name && date ? (
          <>
            <View style={styles.signedRow}>
              <Ionicons name="checkmark-circle" size={16} color={theme.statusSuccess} />
              <Text style={[styles.factValue, { color: theme.textPrimary }]}>{name}</Text>
            </View>
            <Text style={[styles.lineSub, { color: theme.textMuted }]}>Signed {formatDay(date)} at {formatTime(date)}</Text>
          </>
        ) : (
          <Text style={[styles.lineSub, { color: theme.textMuted }]}>{pending ?? 'Not signed'}</Text>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  barTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, textAlign: 'center' },
  content: { paddingHorizontal: 16, gap: 4 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radius.xl, padding: 16 },
  heroCompany: { color: '#FFFFFF', fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  heroSmall: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs },
  heroTotal: { color: '#FFFFFF', fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginTop: 16, marginBottom: 8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  fact: { gap: 2, minWidth: '40%' },
  factLabel: { fontSize: 11, fontWeight: fontWeight.semibold, letterSpacing: 0.5 },
  factValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  body: { fontSize: fontSize.sm, lineHeight: 21, marginTop: 12 },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  lines: { paddingVertical: 4 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 4 },
  groupTitle: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  lineTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  lineSub: { fontSize: fontSize.bodySm },
  lineAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  totals: { marginTop: 8, gap: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: fontSize.sm },
  totalValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  totalStrong: { fontSize: fontSize.base, fontWeight: fontWeight.bold },
  totalStrongValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  totalDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  pdfButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, marginTop: 16 },
  pdfButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  note: { fontSize: fontSize.xs },
  signedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  decline: { borderWidth: 1.5, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  declineText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  approve: { flex: 1, flexDirection: 'row', gap: 8, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  approveText: { color: '#FFFFFF', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  sheetAction: { fontSize: fontSize.base },
  sheetBody: { padding: 16, gap: 12 },
  reason: { borderWidth: 1, borderRadius: radius.lg, padding: 12, minHeight: 110, textAlignVertical: 'top', fontSize: fontSize.base },
  confirmDecline: { borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
});
