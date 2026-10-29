import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { haptic } from '../../lib/haptics';
import { timeAgo } from '../../lib/format';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { markupToDisplay } from '../../components/messages/mentions';
import { PressableScale } from '../../components/ui/PressableScale';
import { ClientEmpty, ClientHeader, ClientLoading, ClientOfflineNote } from '../../components/client/ClientUI';

/**
 * The conversations a client is in. The server lists only channels the
 * client is a MEMBER of, and a client can't start one — the builder adds
 * them — so there's no "new message" here, unlike the team's Messages tab.
 * Opening one uses the team's own thread screen (MessageThreadScreen), which
 * hides the actions the server refuses clients (edit, delete, pin).
 */

interface Channel {
  id: string;
  name: string;
  type: 'channel' | 'dm';
  projectId?: string | null;
  lastMessageAt?: string | null;
  lastMessageContent?: string | null;
  lastMessageSender?: string | null;
}

export default function ClientMessagesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { project } = useClientProject();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rows, counts] = await Promise.all([
        apiFetch<Channel[]>('/api/channels'),
        apiFetch<Record<string, number>>('/api/channels/unread/counts').catch(() => ({})),
      ]);
      setChannels(rows ?? []);
      setUnread(counts ?? {});
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // This project's conversations (and any not tied to a project), newest first.
  const shown = useMemo(
    () =>
      channels
        .filter((c) => !c.projectId || c.projectId === project?.id)
        .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')),
    [channels, project?.id],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader title="Messages" subtitle={project?.name} />
      {failed && channels.length > 0 && <ClientOfflineNote text="Couldn't refresh — showing the last messages loaded." />}
      {loading ? (
        <ClientLoading />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            failed ? (
              <ClientEmpty icon="cloud-offline-outline" title="Couldn't load messages" body="Check your connection and pull down to try again." />
            ) : (
              <ClientEmpty
                icon="chatbubbles-outline"
                title="No conversations yet"
                body="When your builder adds you to a conversation about your project, it'll appear here."
              />
            )
          }
          renderItem={({ item }) => {
            const count = unread[item.id] || 0;
            const preview = item.lastMessageContent ? markupToDisplay(item.lastMessageContent) : null;
            return (
              <PressableScale
                onPress={() => { haptic.select(); navigation.navigate('ClientMessageThread', { channelId: item.id, channelName: item.name }); }}
              >
                <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.avatar, { backgroundColor: theme.primaryLight }]}>
                    <Ionicons name="chatbubbles-outline" size={18} color={theme.primary} />
                  </View>
                  <View style={styles.body}>
                    <View style={styles.titleLine}>
                      <Text style={[styles.name, { color: theme.textPrimary, fontWeight: count ? fontWeight.bold : fontWeight.semibold }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.lastMessageAt && <Text style={[styles.time, { color: theme.textMuted }]}>{timeAgo(item.lastMessageAt)}</Text>}
                    </View>
                    <Text style={[styles.preview, { color: count ? theme.textPrimary : theme.textSecondary }]} numberOfLines={2}>
                      {preview ? `${item.lastMessageSender ? `${item.lastMessageSender}: ` : ''}${preview}` : 'No messages yet'}
                    </Text>
                  </View>
                  {count > 0 && (
                    <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                    </View>
                  )}
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
  content: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.xl, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontSize: fontSize.bodyLg },
  time: { fontSize: fontSize.xs },
  preview: { fontSize: fontSize.bodySm, lineHeight: 18 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: fontWeight.bold },
});
