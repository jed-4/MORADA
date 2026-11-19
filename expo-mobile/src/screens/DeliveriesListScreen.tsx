import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { addSyncListener, getPendingDeliveries } from '../services/offlineQueue';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { fromLocalDateStr, dateStrOf } from '../lib/dates';
import { SkeletonList } from '../components/ui/Skeleton';
import { PendingUploadsBanner } from '../components/photo';
import { DeliveryStatusChip } from '../components/deliveries/DeliveryStatusChip';
import {
  STATUS_LABEL,
  applyPendingDeliveries,
  loadDeliveries,
  readDeliveriesCache,
  sortPOs,
  type DeliveryPO,
} from '../lib/deliveries';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

/**
 * A job's purchase orders to check deliveries against — outstanding first,
 * delivered at the bottom. Tap one to check a delivery in.
 *
 * The list is cached per project (lib/deliveries) and painted from the cache
 * first, so it opens with no signal. Check-ins still waiting in the offline
 * queue are laid over it, so outstanding drops as soon as one is submitted.
 * No prices — the API sends none.
 */
export default function DeliveriesListScreen({ navigation, route }: Props) {
  const { projectId, projectName } = (route.params ?? {}) as { projectId: string; projectName?: string };
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const canView = usePermission('projects.deliveries', 'view');

  const [pos, setPos] = useState<DeliveryPO[]>([]);
  const [pendingByPo, setPendingByPo] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedOnly, setCachedOnly] = useState(false);

  const show = useCallback(async (list: DeliveryPO[]) => {
    const pending = await getPendingDeliveries(projectId);
    const counts: Record<string, number> = {};
    pending.filter((p) => !p.deliveryId).forEach((p) => {
      counts[p.poId] = (counts[p.poId] ?? 0) + 1;
    });
    setPendingByPo(counts);
    setPos(sortPOs(applyPendingDeliveries(list, pending)));
  }, [projectId]);

  const load = useCallback(async () => {
    const cached = await readDeliveriesCache(projectId);
    if (cached) {
      await show(cached.purchaseOrders);
      setLoading(false);
    }
    try {
      const fresh = await loadDeliveries(projectId);
      await show(fresh.purchaseOrders);
      setError(null);
      setCachedOnly(false);
    } catch (e: any) {
      if (cached) setCachedOnly(true);
      setError(e?.status ? e.message : 'No signal — showing the last copy saved on this phone.');
    } finally {
      setLoading(false);
    }
  }, [projectId, show]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (canView) loadRef.current();
    else setLoading(false);
  }, [canView, projectId]);

  // Back from a check-in, or a queued one reaching the server → refresh.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      loadRef.current();
    }, []),
  );
  useEffect(() => addSyncListener(() => loadRef.current()), []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const outstandingCount = useMemo(() => pos.filter((p) => p.deliveryStatus !== 'delivered').length, [pos]);

  const header = (
    <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: insets.top + 8 }]}>
      <View style={styles.headerTop}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Deliveries</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
            {projectName ? `${projectName} · ` : ''}
            {outstandingCount} to receive
          </Text>
        </View>
      </View>
      <PendingUploadsBanner projectId={projectId} types={['create-delivery']} noun="delivery" />
      {error && pos.length > 0 ? (
        <Text style={[styles.errorLine, { color: theme.statusWarning }]}>
          {cachedOnly ? 'No signal — showing the last copy saved on this phone.' : error}
        </Text>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: DeliveryPO }) => {
    const due = dateStrOf(item.requiredByDate ?? null);
    const waiting = pendingByPo[item.id] ?? 0;
    const delivered = item.deliveryStatus === 'delivered';
    return (
      <Pressable
        onPress={() => {
          haptic.select();
          navigation.navigate('DeliveryCheckIn', { projectId, poId: item.id, poNumber: item.poNumber });
        }}
        style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border, opacity: delivered ? 0.75 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${item.poNumber} ${item.supplierName ?? ''} ${STATUS_LABEL[item.deliveryStatus]}`}
      >
        <View style={[styles.icon, { backgroundColor: theme.subtle }]}>
          <Ionicons name={delivered ? 'checkmark-done' : 'cube-outline'} size={22} color={theme.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowRef, { color: theme.textMuted }]} numberOfLines={1}>
            {item.poNumber}
          </Text>
          <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.supplierName || 'No supplier'}
          </Text>
          {item.title ? (
            <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.title}
            </Text>
          ) : null}
          <View style={styles.rowFoot}>
            <DeliveryStatusChip status={item.deliveryStatus} />
            {!delivered && item.lineCount > 0 ? (
              <Text style={[styles.rowSmall, { color: theme.textMuted }]}>
                {item.outstandingLineCount} of {item.lineCount} {item.lineCount === 1 ? 'line' : 'lines'} to come
              </Text>
            ) : null}
            {due && !delivered ? (
              <Text style={[styles.rowSmall, { color: theme.textMuted }]}>
                Due {fromLocalDateStr(due).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </Text>
            ) : null}
          </View>
          {waiting > 0 ? (
            <Text style={[styles.rowSmall, { color: theme.statusWarning }]}>
              {waiting === 1 ? 'Check-in waiting to send' : `${waiting} check-ins waiting to send`}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} style={styles.chevron} />
      </Pressable>
    );
  };

  if (!canView) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        {header}
        <View style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={32} color={theme.textMuted} />
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>You don't have permission to view deliveries.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {header}
      {loading && pos.length === 0 ? (
        <SkeletonList count={6} style={styles.skeleton} />
      ) : (
        <FlatList
          data={pos}
          keyExtractor={(p) => p.id}
          renderItem={renderRow}
          extraData={pendingByPo}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'cube-outline'} size={36} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                {error ? "Couldn't load deliveries" : 'No purchase orders'}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {error
                  ? `${error} Open this screen once with signal and it will work offline after that.`
                  : 'Purchase orders sent to suppliers for this job show here to check deliveries against.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 44, height: 44, marginLeft: -12, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  subtitle: { fontSize: fontSize.xs, marginTop: 1 },
  errorLine: { fontSize: fontSize.xs },
  skeleton: { padding: 16, gap: 16 },
  listContent: { padding: 14 },
  separator: { height: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 80,
  },
  icon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowRef: { fontSize: fontSize.table, fontWeight: fontWeight.semibold, fontVariant: ['tabular-nums'] },
  rowTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold },
  rowMeta: { fontSize: fontSize.xs },
  rowFoot: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  rowSmall: { fontSize: fontSize.table, fontWeight: fontWeight.medium },
  chevron: { marginLeft: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  emptyBody: { fontSize: fontSize.bodySm, textAlign: 'center', lineHeight: 19 },
});
