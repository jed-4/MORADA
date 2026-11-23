import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { apiFetch, getAuthedImageSource } from '../../services/api';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { useTheme, fontSize, fontWeight, radius, fonts } from '../../theme';
import { diaryPhotoUrls, diaryTextFields, formatDay, sortDiary, type ClientDiaryEntry } from '../../lib/clientPortal';
import { ClientCard, ClientEmpty, ClientHeader, ClientLoading, ClientOfflineNote } from '../../components/client/ClientUI';
import { READABLE_MAX_WIDTH, readableFrame } from '../../components/ui/ReadableColumn';
import { useLayout } from '../../lib/useLayout';

/**
 * Site diary entries the builder chose to share — "Updates" to a homeowner.
 * Only entries ticked "share with client" ever arrive (server-side, see
 * server/clientProjections.ts), and their photos are served to the client by
 * server/middleware/clientObjectAccess.ts on the same rule.
 */

/** Photos stored as /objects/… or absolute URLs load through the session; anything else can't be fetched by a client. */
const loadablePhoto = (url: string) => url.startsWith('/') || url.startsWith('http');

export default function ClientUpdatesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, isWide } = useLayout();
  const navigation = useNavigation<any>();
  const { project } = useClientProject();
  const [entries, setEntries] = useState<ClientDiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const rows = await apiFetch<ClientDiaryEntry[]>(`/api/projects/${project.id}/site-diary-entries`);
      setEntries(rows ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sorted = useMemo(() => sortDiary(entries), [entries]);
  // Two photos a row inside the card's padding; three on the Duo unfolded,
  // where the list is capped at the readable width (READABLE_MAX_WIDTH).
  const columnWidth = Math.min(width, READABLE_MAX_WIDTH);
  const photoColumns = isWide ? 3 : 2;
  const photoSize = Math.floor((columnWidth - 32 - 28 - 8 * (photoColumns - 1)) / photoColumns);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        title="Updates"
        subtitle={entries.length ? `${entries.length} update${entries.length === 1 ? '' : 's'} from site` : project?.name}
      />
      {failed && entries.length > 0 && <ClientOfflineNote text="Couldn't refresh — showing the last updates loaded." />}
      {loading ? (
        <ClientLoading />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[styles.content, readableFrame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            failed ? (
              <ClientEmpty icon="cloud-offline-outline" title="Couldn't load updates" body="Check your connection and pull down to try again." />
            ) : (
              <ClientEmpty icon="newspaper-outline" title="No site updates yet" body="When your builder shares a diary entry from site, it'll show up here." />
            )
          }
          renderItem={({ item }) => {
            const photos = diaryPhotoUrls(item).filter(loadablePhoto);
            return (
              <ClientCard>
                <View style={styles.entryHead}>
                  <Text style={[styles.entryTitle, { color: theme.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.entryDate, { color: theme.textMuted }]}>{formatDay(item.entryDateTime)}</Text>
                </View>
                {diaryTextFields(item).map(([label, value]) => (
                  <View key={label} style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label.toUpperCase()}</Text>
                    <Text style={[styles.fieldValue, { color: theme.textPrimary }]}>{value}</Text>
                  </View>
                ))}
                {photos.length > 0 && (
                  <View style={styles.photos}>
                    {photos.map((url, i) => (
                      <Pressable key={`${item.id}-${i}`} onPress={() => setViewer(url)} accessibilityRole="imagebutton">
                        <Image
                          source={getAuthedImageSource(url)}
                          style={[styles.photo, { width: photoSize, height: photoSize, backgroundColor: theme.subtle }]}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
                {!!item.createdByName && (
                  <Text style={[styles.byline, { color: theme.textMuted }]}>Posted by {item.createdByName}</Text>
                )}
              </ClientCard>
            );
          }}
        />
      )}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer && <Image source={getAuthedImageSource(viewer)} style={styles.viewerImage} resizeMode="contain" />}
          <Pressable onPress={() => setViewer(null)} hitSlop={12} style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 },
  entryHead: { gap: 2, marginBottom: 8 },
  entryTitle: { fontSize: fontSize.base, fontFamily: fonts.semibold },
  entryDate: { fontSize: fontSize.bodySm },
  field: { marginBottom: 8 },
  fieldLabel: { fontSize: 11, fontFamily: fonts.semibold, letterSpacing: 0.5, marginBottom: 2 },
  fieldValue: { fontSize: fontSize.sm, lineHeight: 20 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  photo: { borderRadius: radius.lg },
  byline: { fontSize: fontSize.xs, marginTop: 10 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', right: 16 },
});
