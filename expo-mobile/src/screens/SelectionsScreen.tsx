import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import { readCachedSelections, writeCachedSelections, describeAge } from '../services/selectionsOffline';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { PressableScale } from '../components/ui/PressableScale';
import SpecRow from '../components/selections/SpecRow';
import {
  getSelectionState,
  groupByCategory,
  groupByRoom,
  isSettled,
  matchesSearch,
  type Selection,
  type SelectionGroup,
} from '../lib/selections';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

type GroupMode = 'room' | 'category';

/**
 * The spec sheet — "what is going in this room?".
 *
 * Grouped by room by default because that is the question asked on site; a
 * carpenter in the ensuite does not think in trade categories. What each role
 * may see (unapproved selections, costs) is decided SERVER-side by
 * server/selectionVisibility.ts, so this screen renders whatever arrived
 * without second-guessing it.
 */
export default function SelectionsScreen({ navigation, route }: Props) {
  const { projectId, projectName } = (route.params ?? {}) as {
    projectId: string;
    projectName?: string;
  };
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('room');
  const [query, setQuery] = useState('');
  /** Set when the list on screen came from disk because the network failed. */
  const [staleSince, setStaleSince] = useState<Date | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      try {
        const data = await apiFetch<Selection[]>(
          `/api/selections/with-options?projectId=${projectId}`,
        );
        const rows = data ?? [];
        setSelections(rows);
        setStaleSince(null);
        writeCachedSelections(user?.id, projectId, rows);
      } catch (err) {
        // No signal is the normal case on site, not an error state: fall back
        // to the last payload written to disk and say how old it is.
        const cached = await readCachedSelections(user?.id, projectId);
        if (cached) {
          setSelections(cached.selections);
          setStaleSince(cached.savedAt);
        } else if (mode === 'initial') {
          console.error('Failed to load selections:', err);
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId, user?.id],
  );

  // Paint from disk immediately, then let the network overwrite it. Opening
  // the screen underground shows the spec instead of a spinner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCachedSelections(user?.id, projectId);
      if (cached && !cancelled) {
        setSelections(cached.selections);
        setStaleSince(cached.savedAt);
        setLoading(false);
      }
      if (!cancelled) await load('initial');
    })();
    return () => {
      cancelled = true;
    };
  }, [load, projectId, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load('refresh');
    setRefreshing(false);
  }, [load]);

  const groups: SelectionGroup[] = useMemo(() => {
    const filtered = selections.filter((s) => matchesSearch(s, query));
    return groupMode === 'room' ? groupByRoom(filtered) : groupByCategory(filtered);
  }, [selections, query, groupMode]);

  const settledTotal = useMemo(
    () => selections.filter((s) => isSettled(getSelectionState(s))).length,
    [selections],
  );

  const openSelection = useCallback(
    (selection: Selection) => {
      // The detail screen lands in the next PR; until then the row is inert
      // rather than navigating somewhere that doesn't exist.
      if (!selection.restricted) haptic.select();
    },
    [],
  );

  const switchMode = (mode: GroupMode) => {
    haptic.select();
    setGroupMode(mode);
  };

  if (loading) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: insets.top + 8 },
        ]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Selections</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
              {projectName ? `${projectName} · ` : ''}
              {settledTotal} of {selections.length} selected
            </Text>
          </View>
        </View>

        <View style={[styles.search, { backgroundColor: theme.subtle }]}>
          <Ionicons name="search" size={15} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Room, product, brand or code"
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.textPrimary }]}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        <View style={[styles.segment, { backgroundColor: theme.subtle }]}>
          {(['room', 'category'] as GroupMode[]).map((mode) => {
            const active = groupMode === mode;
            return (
              <PressableScale
                key={mode}
                onPress={() => switchMode(mode)}
                style={[styles.segmentItem, active && { backgroundColor: theme.card }]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? theme.textPrimary : theme.textSecondary },
                  ]}
                >
                  {mode === 'room' ? 'By room' : 'By category'}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {staleSince && (
          <View style={[styles.offline, { backgroundColor: theme.amberLight }]}>
            <Ionicons name="cloud-offline-outline" size={13} color={theme.statusWarning} />
            <Text style={[styles.offlineText, { color: theme.statusWarning }]}>
              Offline — showing the spec saved {describeAge(staleSince)}
            </Text>
          </View>
        )}
      </View>

      <SectionList
        sections={groups.map((g) => ({ title: g.title, settledCount: g.settledCount, data: g.data }))}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.groupHeader}>
            <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>{section.title}</Text>
            <View style={[styles.groupRule, { backgroundColor: theme.border }]} />
            <Text style={[styles.groupCount, { color: theme.textMuted }]}>
              {(section as any).settledCount} of {section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item }) => <SpecRow selection={item} onPress={openSelection} />}
        SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={34} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              {query ? 'Nothing matches' : 'No selections yet'}
            </Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              {query
                ? 'Try a room, a brand or a product code.'
                : 'Selections added to this project will appear here.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { marginLeft: -6 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  subtitle: { fontSize: fontSize.xs, marginTop: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.lg,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, padding: 0 },
  segment: { flexDirection: 'row', borderRadius: radius.lg, padding: 2, gap: 2 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: radius.md,
  },
  segmentText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  offlineText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, flex: 1 },
  listContent: { padding: 14, paddingBottom: 40 },
  separator: { height: 9 },
  sectionGap: { height: 4 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    paddingBottom: 8,
  },
  groupTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  groupRule: { flex: 1, height: StyleSheet.hairlineWidth },
  groupCount: { fontSize: fontSize.data, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', paddingTop: 70, gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  emptyBody: { fontSize: fontSize.bodySm, textAlign: 'center', lineHeight: 19 },
});
