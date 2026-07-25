import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, apiRequest } from '../services/api';
import { useTheme, fontSize, fontWeight, radius, type Theme } from '../theme';

// Create a GST-correct invoice from a job's unbilled hours, then send it by email.
// Sending hits the existing /send-email endpoint, which stamps sent_date — the
// signal the reward sweep looks for. The server decides GST behaviour from the
// subbie's registration flag; this screen just chooses hour vs day billing.

type Job = { id: string; name: string };
type RateType = 'hour' | 'day';

type GeneratedInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  subtotal: number;
  gst: number;
  total: number;
  count: number;
  pdfBase64: string;
  pdfFilename: string;
};

function formatAud(cents: number): string {
  const dollars = (cents || 0) / 100;
  const s = dollars.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${s}`;
}

export default function SubbieCreateInvoiceScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [billingUnit, setBillingUnit] = useState<RateType>('hour');
  const [dayRate, setDayRate] = useState('');
  const [description, setDescription] = useState('Carpentry');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedInvoice | null>(null);

  const [recipient, setRecipient] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    apiFetch<Job[]>('/api/projects')
      .then((p) => {
        setJobs(p || []);
        if (p && p.length === 1) setJobId(p[0].id);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  const generate = async () => {
    setError(null);
    if (!jobId) return setError('Pick a job');
    if (!clientName.trim()) return setError("Enter who you're billing");
    if (billingUnit === 'day' && !dayRate.trim()) return setError('Enter your day rate');

    setBusy(true);
    try {
      const res = await apiRequest(`/api/projects/${jobId}/subbie-invoice`, 'POST', {
        billingUnit,
        dayRateCents: billingUnit === 'day' ? Math.round(Number(dayRate) * 100) : undefined,
        clientName: clientName.trim(),
        description: description.trim() || undefined,
      });
      const data = await res.json();
      const inv = data.invoice;
      setResult({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        subtotal: inv.subtotal ?? 0,
        gst: inv.gstAmount ?? 0,
        total: inv.totalAmount ?? 0,
        count: (data.timesheetIds || []).length,
        pdfBase64: data.pdfBase64,
        pdfFilename: data.pdfFilename || 'invoice.pdf',
      });
    } catch (e: any) {
      setError(e?.message || 'Could not create the invoice');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!result) return;
    setError(null);
    if (!recipient.trim()) return setError("Enter the builder's email");
    setSending(true);
    try {
      await apiRequest(`/api/client-invoices/${result.invoiceId}/send-email`, 'POST', {
        to: recipient.trim(),
        subject: `Invoice ${result.invoiceNumber}`,
        body: `Hi,\n\nPlease find attached invoice ${result.invoiceNumber} for ${formatAud(result.total)}.\n\nThanks.`,
        pdfBase64: result.pdfBase64,
        pdfFilename: result.pdfFilename,
      });
      setSent(true);
    } catch (e: any) {
      setError(e?.message || 'Could not send the invoice');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!result ? (
            <>
              <Text style={styles.h1}>Create invoice</Text>
              <Text style={styles.sub}>From your unbilled hours on a job.</Text>

              <Text style={styles.label}>Job</Text>
              {loadingJobs ? (
                <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />
              ) : jobs.length === 0 ? (
                <Text style={styles.empty}>No jobs yet — add one first.</Text>
              ) : (
                <View style={styles.jobList}>
                  {jobs.map((j) => (
                    <TouchableOpacity key={j.id} onPress={() => setJobId(j.id)}
                      style={[styles.jobRow, jobId === j.id && styles.jobRowActive]}>
                      <Text style={[styles.jobText, jobId === j.id && styles.jobTextActive]} numberOfLines={1}>
                        {j.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Bill to</Text>
              <TextInput style={styles.input} value={clientName} onChangeText={setClientName}
                placeholder="BuildCo Pty Ltd" placeholderTextColor={theme.textMuted} autoCapitalize="words" />

              <Text style={styles.label}>Bill by</Text>
              <View style={styles.segment}>
                {(['hour', 'day'] as RateType[]).map((t) => (
                  <TouchableOpacity key={t} onPress={() => setBillingUnit(t)}
                    style={[styles.segmentBtn, billingUnit === t && styles.segmentBtnActive]}>
                    <Text style={[styles.segmentText, billingUnit === t && styles.segmentTextActive]}>
                      {t === 'hour' ? 'Hours' : 'Day rate'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {billingUnit === 'day' && (
                <>
                  <Text style={styles.hint}>Days are worked out from your tracked hours — ≤4h a day is half a day, more is a full day.</Text>
                  <TextInput style={styles.input} value={dayRate} onChangeText={setDayRate}
                    placeholder="Day rate (ex GST), e.g. 600" placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad" />
                </>
              )}

              <Text style={styles.label}>Description</Text>
              <TextInput style={styles.input} value={description} onChangeText={setDescription}
                placeholder="Carpentry" placeholderTextColor={theme.textMuted} />

              {error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity style={[styles.primary, busy && styles.busy]} onPress={generate} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create invoice</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.h1}>{result.invoiceNumber}</Text>
              <Text style={styles.sub}>{result.count} timesheet{result.count === 1 ? '' : 's'} billed.</Text>

              <View style={styles.totals}>
                <Row label="Subtotal" value={formatAud(result.subtotal)} styles={styles} />
                {result.gst > 0 && <Row label="GST (10%)" value={formatAud(result.gst)} styles={styles} />}
                <Row label="Total" value={formatAud(result.total)} bold styles={styles} />
              </View>

              {!sent ? (
                <>
                  <Text style={styles.label}>Send to</Text>
                  <TextInput style={styles.input} value={recipient} onChangeText={setRecipient}
                    placeholder="builder@example.com" placeholderTextColor={theme.textMuted}
                    keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

                  {error && <Text style={styles.error}>{error}</Text>}

                  <TouchableOpacity style={[styles.primary, sending && styles.busy]} onPress={send} disabled={sending}>
                    {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send invoice</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.sentCard}>
                  <Text style={styles.sentText}>Invoice sent ✓</Text>
                  <Text style={styles.sentHint}>Send one within 3 days of signing up and your first month is free.</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold, styles }: {
  label: string; value: string; bold?: boolean; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[styles.row, bold && styles.rowGrand]}>
      <Text style={[styles.rowLabel, bold && styles.rowLabelGrand]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueGrand]}>{value}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    scroll: { padding: 20, paddingBottom: 40 },
    h1: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: theme.textPrimary },
    sub: { fontSize: fontSize.sm, color: theme.textSecondary, marginTop: 4, marginBottom: 18 },
    label: { fontSize: fontSize.xs, color: theme.textSecondary, marginBottom: 6, marginTop: 14, fontWeight: fontWeight.medium },
    hint: { fontSize: fontSize.xs, color: theme.textMuted, marginBottom: 8, lineHeight: 16 },
    empty: { fontSize: fontSize.sm, color: theme.textMuted, paddingVertical: 12 },
    input: {
      backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: fontSize.base, color: theme.textPrimary,
    },
    jobList: { gap: 8 },
    jobRow: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 13 },
    jobRowActive: { borderColor: theme.primary, backgroundColor: theme.primaryLight },
    jobText: { fontSize: fontSize.base, color: theme.textPrimary },
    jobTextActive: { color: theme.primary, fontWeight: fontWeight.semibold },
    segment: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, padding: 3 },
    segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.md },
    segmentBtnActive: { backgroundColor: theme.primary },
    segmentText: { fontSize: fontSize.sm, color: theme.textSecondary, fontWeight: fontWeight.medium },
    segmentTextActive: { color: '#fff', fontWeight: fontWeight.semibold },
    totals: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: radius.xl, padding: 16, marginBottom: 20 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    rowGrand: { borderTopWidth: 1, borderTopColor: theme.border, marginTop: 6, paddingTop: 12 },
    rowLabel: { fontSize: fontSize.sm, color: theme.textSecondary },
    rowLabelGrand: { fontSize: fontSize.base, color: theme.textPrimary, fontWeight: fontWeight.semibold },
    rowValue: { fontSize: fontSize.sm, color: theme.textPrimary },
    rowValueGrand: { fontSize: fontSize.lg, color: theme.textPrimary, fontWeight: fontWeight.bold },
    primary: { backgroundColor: theme.primary, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
    busy: { opacity: 0.7 },
    primaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
    error: { color: theme.statusDanger, fontSize: fontSize.sm, marginTop: 12 },
    sentCard: { backgroundColor: theme.statusSuccessBg, borderRadius: radius.xl, padding: 18, marginTop: 8 },
    sentText: { color: theme.statusSuccess, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
    sentHint: { color: theme.textSecondary, fontSize: fontSize.sm, marginTop: 6, lineHeight: 20 },
  });
}
