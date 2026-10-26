import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../services/api';
import { formatMoney } from '../../lib/selections';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { formatDay, invoiceStatus, type ClientInvoice } from '../../lib/clientPortal';
import { ClientCard, ClientEmpty, ClientHeader, ClientLoading, ClientStatusPill } from '../../components/client/ClientUI';

/**
 * A progress claim as the document the client was sent — the phone twin of
 * the web's ClientInvoiceDocument. The headline is BALANCE DUE, not the total:
 * on a part-paid claim they differ and the balance is what the client needs.
 *
 * Every figure is the server's: the saved line snapshot (lineBreakdown) plus
 * custom lines, and the invoice's own subtotal / GST / total / paid / balance.
 * Nothing is added up here.
 */

interface ClientInvoiceView {
  invoice: ClientInvoice & {
    introductionText?: string | null;
    closingText?: string | null;
    termsAndConditions?: string | null;
    subtotal?: number | null;
    gstAmount?: number | null;
    lineBreakdown?: Array<{ source: string; description: string; amountIncCents: number }> | null;
  };
  items: Array<{ id: string; name?: string | null; description: string; totalPrice: number }>;
  payments: Array<{ id: string; amount: number; paymentDate: string; paymentMethod?: string | null; reference?: string | null }>;
  project?: { name?: string | null; address?: string | null };
  company?: { name?: string | null; abn?: string | null };
}

export default function ClientInvoiceDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const invoiceId: string = route.params?.invoiceId;
  const [data, setData] = useState<ClientInvoiceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const view = await apiFetch<ClientInvoiceView>(`/api/client-invoices/${invoiceId}/client-view`);
      setData(view);
      setMissing(!view?.invoice);
    } catch {
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const inv = data?.invoice;
  const status = inv ? invoiceStatus(inv) : null;
  const balance = inv ? inv.balanceAmount ?? inv.totalAmount ?? 0 : 0;
  const lines = [
    ...(inv?.lineBreakdown ?? []).map((l, i) => ({ key: `${l.source}-${i}`, label: l.description, sub: null as string | null, cents: l.amountIncCents })),
    ...(data?.items ?? []).map((item) => ({
      key: item.id,
      label: item.name || item.description,
      sub: item.name ? item.description : null,
      cents: item.totalPrice,
    })),
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader title={inv?.invoiceNumber || 'Progress claim'} onBack={() => navigation.goBack()} />
      {loading ? (
        <ClientLoading />
      ) : missing || !inv || !status ? (
        <ClientEmpty icon="alert-circle-outline" title="This claim isn't available" body="Ask your builder if you think it should be." />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          <View style={[styles.hero, { backgroundColor: theme.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroCompany}>{data?.company?.name || 'Your builder'}</Text>
              {!!data?.company?.abn && <Text style={styles.heroSmall}>ABN {data.company.abn}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <ClientStatusPill label={status.label} tone={status.tone} />
              <Text style={styles.heroTotal}>{formatMoney(balance)}</Text>
              <Text style={styles.heroSmall}>{balance > 0 ? 'Balance due' : 'Paid in full'}</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>{inv.name}</Text>

          <ClientCard style={styles.facts}>
            {!!data?.project?.name && <Fact label="Project" value={data.project.name} sub={data.project.address} />}
            {!!inv.invoiceDate && <Fact label="Issued" value={formatDay(inv.invoiceDate)} />}
            {!!inv.dueDate && <Fact label="Due" value={formatDay(inv.dueDate)} />}
          </ClientCard>

          {!!inv.introductionText && <Text style={[styles.body, { color: theme.textSecondary }]}>{inv.introductionText}</Text>}

          {lines.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>THIS CLAIM</Text>
              <ClientCard style={{ paddingVertical: 4 }}>
                {lines.map((line, i) => (
                  <View key={line.key} style={[styles.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.lineTitle, { color: theme.textPrimary }]}>{line.label}</Text>
                      {!!line.sub && <Text style={[styles.lineSub, { color: theme.textSecondary }]}>{line.sub}</Text>}
                    </View>
                    <Text style={[styles.lineAmount, { color: theme.textPrimary }]}>{formatMoney(line.cents)}</Text>
                  </View>
                ))}
              </ClientCard>
            </>
          )}

          <ClientCard style={styles.totals}>
            {inv.subtotal != null && <TotalRow label="Subtotal (ex GST)" value={formatMoney(inv.subtotal)} />}
            {inv.gstAmount != null && <TotalRow label="GST (10%)" value={formatMoney(inv.gstAmount)} />}
            <TotalRow label="Total (inc GST)" value={formatMoney(inv.totalAmount ?? 0)} bold />
            {!!inv.paidAmount && <TotalRow label="Paid" value={`−${formatMoney(inv.paidAmount)}`} />}
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <TotalRow label="Balance due" value={formatMoney(balance)} strong />
          </ClientCard>

          {data!.payments.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PAYMENTS RECEIVED</Text>
              <ClientCard style={{ paddingVertical: 4 }}>
                {data!.payments.map((p, i) => (
                  <View key={p.id} style={[styles.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.lineTitle, { color: theme.textPrimary }]}>{formatDay(p.paymentDate)}</Text>
                      {!!(p.paymentMethod || p.reference) && (
                        <Text style={[styles.lineSub, { color: theme.textSecondary }]}>{[p.paymentMethod, p.reference].filter(Boolean).join(' · ')}</Text>
                      )}
                    </View>
                    <Text style={[styles.lineAmount, { color: theme.statusSuccess }]}>{formatMoney(p.amount)}</Text>
                  </View>
                ))}
              </ClientCard>
            </>
          )}

          {!!inv.closingText && <Text style={[styles.body, { color: theme.textSecondary, marginTop: 16 }]}>{inv.closingText}</Text>}

          {!!inv.termsAndConditions && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>TERMS & CONDITIONS</Text>
              <Text style={[styles.terms, { color: theme.textMuted }]}>{inv.termsAndConditions}</Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );

  function Fact({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
    return (
      <View style={styles.fact}>
        <Text style={[styles.factLabel, { color: theme.textMuted }]}>{label.toUpperCase()}</Text>
        <Text style={[styles.factValue, { color: theme.textPrimary }]}>{value}</Text>
        {!!sub && <Text style={[styles.lineSub, { color: theme.textSecondary }]}>{sub}</Text>}
      </View>
    );
  }

  function TotalRow({ label, value, bold, strong }: { label: string; value: string; bold?: boolean; strong?: boolean }) {
    const color = strong ? theme.primary : bold ? theme.textPrimary : theme.textSecondary;
    return (
      <View style={styles.totalRow}>
        <Text style={[strong ? styles.totalStrong : bold ? styles.totalBold : styles.totalLabel, { color }]}>{label}</Text>
        <Text style={[strong ? styles.totalStrongValue : bold ? styles.totalBold : styles.totalValue, { color: strong ? theme.primary : theme.textPrimary }]}>{value}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  lineTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  lineSub: { fontSize: fontSize.bodySm },
  lineAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  totals: { marginTop: 8, gap: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: fontSize.sm },
  totalValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  totalBold: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  totalStrong: { fontSize: fontSize.base, fontWeight: fontWeight.bold },
  totalStrongValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  terms: { fontSize: fontSize.xs, lineHeight: 18 },
});
