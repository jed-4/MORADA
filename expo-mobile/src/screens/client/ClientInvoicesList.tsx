import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { haptic } from '../../lib/haptics';
import { formatMoney } from '../../lib/selections';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { formatDay, groupInvoices, invoiceStatus, outstandingBalance, type ClientInvoice } from '../../lib/clientPortal';
import { PressableScale } from '../../components/ui/PressableScale';
import { ClientEmpty, ClientLoading, ClientOfflineNote, ClientStatusPill } from '../../components/client/ClientUI';

/**
 * Progress claims the client has actually been sent — the server hides
 * drafts and approved-but-unsent claims. Read only: no payments, no Xero.
 * The other section of the Money tab.
 */
export default function ClientInvoicesList() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { project } = useClientProject();
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const rows = await apiFetch<ClientInvoice[]>(`/api/client-invoices?projectId=${project.id}`);
      setInvoices(rows ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [project]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sections = useMemo(() => groupInvoices(invoices), [invoices]);
  const balance = outstandingBalance(invoices);

  if (loading) return <ClientLoading />;

  return (
    <View style={styles.container}>
      {failed && invoices.length > 0 && <ClientOfflineNote text="Couldn't refresh — showing the last claims loaded." />}
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          invoices.length ? (
            <Text style={[styles.summary, { color: theme.textSecondary }]}>
              {balance > 0 ? `${formatMoney(balance)} to pay` : 'Everything is paid'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          failed ? (
            <ClientEmpty icon="cloud-offline-outline" title="Couldn't load claims" body="Check your connection and pull down to try again." />
          ) : (
            <ClientEmpty icon="receipt-outline" title="No progress claims yet" body="When your builder sends you a progress claim, it'll appear here." />
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{section.title.toUpperCase()}</Text>
            <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>{section.data.length}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const status = invoiceStatus(item);
          const paid = status.tone === 'done';
          const amount = paid ? item.totalAmount : item.balanceAmount ?? item.totalAmount;
          const meta = [item.invoiceNumber, paid ? null : item.dueDate ? `Due ${formatDay(item.dueDate)}` : null]
            .filter(Boolean).join(' · ');
          return (
            <PressableScale onPress={() => { haptic.select(); navigation.navigate('ClientInvoiceDetail', { invoiceId: item.id }); }}>
              <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: paid ? theme.textSecondary : theme.textPrimary }]} numberOfLines={2}>{item.name}</Text>
                  {!!meta && <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{meta}</Text>}
                  <ClientStatusPill label={status.label} tone={status.tone} />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.amount, { color: theme.textPrimary }]}>{formatMoney(amount ?? 0)}</Text>
                  {!paid && item.balanceAmount != null && item.balanceAmount !== item.totalAmount && (
                    <Text style={[styles.rowMeta, { color: theme.textMuted }]}>of {formatMoney(item.totalAmount)}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </View>
            </PressableScale>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  summary: { fontSize: fontSize.bodySm, marginTop: 4, marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  sectionMeta: { fontSize: fontSize.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.xl, padding: 14 },
  rowBody: { flex: 1, gap: 5 },
  rowTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium },
  rowMeta: { fontSize: fontSize.bodySm },
  amount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
