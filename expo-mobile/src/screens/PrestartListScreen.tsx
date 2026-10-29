import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { PressableScale } from '../components/ui/PressableScale';

export interface PrestartAssetRow {
  id: string;
  name: string;
  assetType: string;
  rego: string | null;
  status: string;
  meterType: string;
  currentMeter: number | null;
  assignedUserId: string | null;
  templateKey: string;
  checkedToday: boolean;
  openDefects: number;
}

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  vehicle: 'car-outline',
  trailer: 'git-commit-outline',
  plant: 'construct-outline',
  tool: 'hammer-outline',
};

/**
 * Pick what you're about to drive or operate. Your own vehicle sits at the
 * top; a tick means someone has already done today's check.
 */
export default function PrestartListScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [rows, setRows] = useState<PrestartAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await apiFetch<PrestartAssetRow[]>('/api/asset-prestarts/assets')) ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Back from a check: refresh the ticks.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sorted = useMemo(() => {
    const mine = (r: PrestartAssetRow) => (r.assignedUserId && r.assignedUserId === user?.id ? 0 : 1);
    return [...rows].sort((a, b) => mine(a) - mine(b) || a.name.localeCompare(b.name));
  }, [rows, user?.id]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Pre-start check</Text>
      </View>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>What are you about to use?</Text>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {error ? 'Could not load the vehicles. Pull to try again.' : 'No vehicles or plant in the register yet.'}
            </Text>
          }
          renderItem={({ item }) => {
            const isMine = !!item.assignedUserId && item.assignedUserId === user?.id;
            const offRoad = item.status === 'off_road';
            return (
              <PressableScale
                onPress={() => navigation.navigate('Prestart', { assetId: item.id })}
                style={[styles.row, { backgroundColor: theme.card, borderColor: offRoad ? theme.statusDanger : theme.border }]}
                accessibilityLabel={`Pre-start for ${item.name}`}
              >
                <Ionicons name={TYPE_ICON[item.assetType] ?? 'car-outline'} size={22} color={offRoad ? theme.statusDanger : theme.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                    {[item.rego, isMine ? 'Your vehicle' : null, offRoad ? 'OFF ROAD' : null].filter(Boolean).join(' · ') || ' '}
                  </Text>
                </View>
                {item.checkedToday ? (
                  <View style={[styles.pill, { backgroundColor: theme.statusSuccessBg }]}>
                    <Ionicons name="checkmark" size={13} color={theme.statusSuccess} />
                    <Text style={[styles.pillText, { color: theme.statusSuccess }]}>Today</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                )}
              </PressableScale>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.sm, paddingHorizontal: 46, marginTop: 2 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 14,
  },
  name: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  meta: { fontSize: fontSize.xs, marginTop: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  pillText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  empty: { textAlign: 'center', marginTop: 40, fontSize: fontSize.sm },
});
