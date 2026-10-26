import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { haptic } from '../../lib/haptics';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { firstImage, getChosenOption, type Selection } from '../../lib/selections';
import {
  buildSelectionGallery,
  formatDay,
  selectionFilterOf,
  selectionStatus,
  type SelectionFilter,
} from '../../lib/clientPortal';
import CroppedImage from '../../components/selections/CroppedImage';
import { PressableScale } from '../../components/ui/PressableScale';
import { ClientEmpty, ClientHeader, ClientLoading, ClientOfflineNote, ClientStatusPill } from '../../components/client/ClientUI';

/**
 * The client's selections — a gallery, like the web portal's: the photo is
 * the card, waiting-on-you first. What a client may see (only options the
 * builder made visible, prices only with the role's tick AND the selection's
 * own setting) is decided server-side; this renders what arrives.
 */

export type ClientSelectionRow = Selection & {
  clientCanChange?: boolean | null;
  clientCanAddOption?: boolean | null;
};

const FILTERS: Array<{ key: SelectionFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'to-choose', label: 'To choose' },
  { key: 'sent', label: 'Choice sent' },
  { key: 'confirmed', label: 'Confirmed' },
];

export default function ClientSelectionsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { project } = useClientProject();
  const [selections, setSelections] = useState<ClientSelectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<SelectionFilter>('all');
  const [groupBy, setGroupBy] = useState<'room' | 'category'>('room');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const rows = await apiFetch<ClientSelectionRow[]>(`/api/selections/with-options?projectId=${project.id}`);
      setSelections(rows ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [project]);

  // On focus, not just mount: coming back from a selection after choosing
  // shows its new status. Also re-runs when the project changes.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const groups = useMemo(
    () => buildSelectionGallery(selections, { filter, query, groupBy }),
    [selections, filter, query, groupBy],
  );
  const toChoose = selections.filter((s) => selectionFilterOf(s) === 'to-choose').length;
  const tile = Math.floor((width - 32 - 12) / 2);

  const open = (s: ClientSelectionRow) => {
    haptic.select();
    navigation.navigate('ClientSelectionDetail', { selectionId: s.id, name: s.name });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader
        title="Selections"
        subtitle={selections.length === 0 ? project?.name : toChoose > 0 ? `${toChoose} to choose` : 'All chosen'}
      />
      {failed && selections.length > 0 && <ClientOfflineNote text="Couldn't refresh — showing the last selections loaded." />}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {selections.length > 0 && (
          <>
            <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="search" size={16} color={theme.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search selections"
                placeholderTextColor={theme.textMuted}
                style={[styles.searchInput, { color: theme.textPrimary }]}
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => { haptic.select(); setFilter(f.key); }}
                    style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primaryLight : theme.card }]}
                  >
                    <Text style={[styles.chipText, { color: active ? theme.primary : theme.textSecondary }]}>{f.label}</Text>
                  </Pressable>
                );
              })}
              <View style={[styles.chipDivider, { backgroundColor: theme.border }]} />
              <Pressable
                onPress={() => { haptic.select(); setGroupBy(groupBy === 'room' ? 'category' : 'room'); }}
                style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.card }]}
                accessibilityLabel={`Grouped by ${groupBy}. Tap to change.`}
              >
                <Ionicons name="layers-outline" size={13} color={theme.textSecondary} />
                <Text style={[styles.chipText, { color: theme.textSecondary }]}>By {groupBy}</Text>
              </Pressable>
            </ScrollView>
          </>
        )}

        {loading ? (
          <ClientLoading />
        ) : selections.length === 0 ? (
          failed ? (
            <ClientEmpty icon="cloud-offline-outline" title="Couldn't load selections" body="Check your connection and pull down to try again." />
          ) : (
            <ClientEmpty icon="color-palette-outline" title="No selections yet" body="Your builder will add the items you need to choose. They'll show up here." />
          )
        ) : groups.length === 0 ? (
          <ClientEmpty icon="search" title="Nothing matches that" body="Try a different search, or change the filter." />
        ) : (
          groups.map((group) => (
            <View key={group.title}>
              <View style={styles.groupHeader}>
                <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{group.title.toUpperCase()}</Text>
                <Text style={[styles.groupMeta, { color: theme.textMuted }]}>
                  {group.data.length} item{group.data.length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.grid}>
                {group.data.map((s) => {
                  const status = selectionStatus(s);
                  const chosen = getChosenOption(s);
                  const image = chosen ? firstImage(chosen) : (s.options ?? []).map(firstImage).find(Boolean);
                  const optionCount = s.options?.length ?? 0;
                  return (
                    <PressableScale key={s.id} onPress={() => open(s)} style={{ width: tile }}>
                      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={[styles.photo, { width: tile - 2, height: tile - 2, backgroundColor: theme.subtle }]}>
                          {image ? (
                            <CroppedImage
                              filePath={image.filePath}
                              x={image.thumbnailX}
                              y={image.thumbnailY}
                              zoom={image.thumbnailZoom}
                              style={StyleSheet.absoluteFill}
                            />
                          ) : (
                            <Ionicons name="image-outline" size={28} color={theme.textMuted} />
                          )}
                          <View style={styles.pillOver}>
                            <ClientStatusPill label={status.label} tone={status.tone} />
                          </View>
                          {optionCount > 0 && !chosen && (
                            <View style={styles.countOver}>
                              <Text style={styles.countText}>{optionCount} option{optionCount === 1 ? '' : 's'}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.cardBody}>
                          <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{s.name}</Text>
                          <Text style={[styles.cardMeta, { color: chosen ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>
                            {chosen ? chosen.name : s.deadline ? `Choose by ${formatDay(s.deadline)}` : 'Waiting on your choice'}
                          </Text>
                        </View>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 10, height: 40 },
  searchInput: { flex: 1, fontSize: fontSize.sm },
  chips: { gap: 8, paddingVertical: 10, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.medium },
  chipDivider: { width: 1, height: 20 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, marginBottom: 8 },
  groupTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  groupMeta: { fontSize: fontSize.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' },
  photo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pillOver: { position: 'absolute', top: 8, left: 8 },
  countOver: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: '#FFFFFF', fontSize: 10, fontWeight: fontWeight.semibold },
  cardBody: { padding: 10, gap: 4 },
  cardTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  cardMeta: { fontSize: fontSize.xs },
});
