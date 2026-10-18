import { useCallback, useEffect, useState } from 'react';
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiFetch } from '../services/api';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { PressableScale } from '../components/ui/PressableScale';

interface ProjectRow {
  id: string;
  name: string;
  address?: string | null;
  isArchived?: boolean;
  isBusiness?: boolean;
}

/**
 * Selections from the More panel: pick a job, land on its selections. Saves
 * going Projects → job → Selections tile when all you want is "what's going in
 * at Smith St". Selections themselves stay per project — this is only a way in.
 */
export default function SelectionsProjectsScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch<ProjectRow[]>('/api/projects');
      // Same filter as the Projects tab: no archived or business projects.
      setProjects((rows ?? []).filter((p) => !p.isArchived && !p.isBusiness));
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

  const open = (project: ProjectRow) => {
    // Selections live in the Projects stack, so the back button returns to the
    // job's list of selections and from there to the project.
    navigation.getParent()?.navigate('Projects', {
      screen: 'Selections',
      params: { projectId: project.id, projectName: project.name },
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Selections</Text>
      </View>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Choose a job</Text>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
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
              {error ? 'Could not load your projects. Pull to try again.' : 'No active projects.'}
            </Text>
          }
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => open(item)}
              style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
              accessibilityLabel={`${item.name} selections`}
            >
              <Ionicons name="color-palette-outline" size={20} color={theme.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                {!!item.address && (
                  <Text style={[styles.address, { color: theme.textSecondary }]} numberOfLines={1}>{item.address}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </PressableScale>
          )}
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
  address: { fontSize: fontSize.xs, marginTop: 1 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: fontSize.sm },
});
