import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { haptic } from '../../lib/haptics';
import { formatMoney } from '../../lib/selections';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import {
  approvedVariationTotal,
  formatDay,
  groupVariations,
  variationStatus,
  type ClientVariation,
} from '../../lib/clientPortal';
import { PressableScale } from '../../components/ui/PressableScale';
import { ClientEmpty, ClientHeader, ClientLoading, ClientOfflineNote, ClientStatusPill } from '../../components/client/ClientUI';

/**
 * Variations a client has been sent — the server hides drafts. Waiting on
 * you first; open one to read the document and sign it.
 */
export default function ClientVariationsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { project } = useClientProject();
  const [variations, setVariations] = useState<ClientVariation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const rows = await apiFetch<ClientVariation[]>(`/api/variations?projectId=${project.id}`);
      setVariations(rows ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [project]);

  // On focus: back from signing shows the new status.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sections = useMemo(() => groupVariations(variations, query), [variations, query]);
  const awaiting = variations.filter((v) => variationStatus(v).tone === 'waiting').length;
  const approved = approvedVariationTotal(variations);
  const subtitle = variations.length
    ? [awaiting ? `${awaiting} to approve` : null, `${formatMoney(approved)} approved`].filter(Boolean).join(' · ')
    : project?.name;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader title="Variations" subtitle={subtitle} />
      {failed && variations.length > 0 && <ClientOfflineNote text="Couldn't refresh — showing the last variations loaded." />}
      {loading ? (
        <ClientLoading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(v) => v.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListHeaderComponent={
            variations.length > 3 ? (
              <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="search" size={16} color={theme.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search variations"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                  clearButtonMode="while-editing"
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            failed ? (
              <ClientEmpty icon="cloud-offline-outline" title="Couldn't load variations" body="Check your connection and pull down to try again." />
            ) : variations.length ? (
              <ClientEmpty icon="search" title="Nothing matches that" body="Try a different search." />
            ) : (
              <ClientEmpty
                icon="document-text-outline"
                title="No variations yet"
                body="If something changes on your job, your builder will send you a variation to approve. It'll appear here."
              />
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
            const status = variationStatus(item);
            const decided = status.tone !== 'waiting';
            const meta = [
              item.variationNumber,
              item.clientSignedDate ? `Signed ${formatDay(item.clientSignedDate)}` : item.portalSentAt ? `Sent ${formatDay(item.portalSentAt)}` : null,
            ].filter(Boolean).join(' · ');
            return (
              <PressableScale
                onPress={() => { haptic.select(); navigation.navigate('ClientVariationDetail', { variationId: item.id, name: item.name }); }}
              >
                <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: decided ? theme.textSecondary : theme.textPrimary }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {!!meta && <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{meta}</Text>}
                    <ClientStatusPill label={status.label} tone={status.tone} />
                  </View>
                  <Text style={[styles.amount, { color: theme.textPrimary }]}>{formatMoney(item.totalAmount ?? 0)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </View>
              </PressableScale>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 10, height: 40, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: fontSize.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  sectionMeta: { fontSize: fontSize.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.xl, padding: 14 },
  rowBody: { flex: 1, gap: 5 },
  rowTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium },
  rowMeta: { fontSize: fontSize.bodySm },
  amount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
