import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest, ApiError } from '../services/api';
import { onSocketEvent, useSocketConnected } from '../services/socket';
import { useAuth } from '../contexts/AuthContext';
import { usePolling } from '../lib/usePolling';
import { usePresence } from '../lib/usePresence';
import { timeAgo, getInitials } from '../lib/format';
import { haptic } from '../lib/haptics';
import { PressableScale } from '../components/ui/PressableScale';
import { PresenceDot } from '../components/messages/PresenceDot';
import { markupToDisplay } from '../components/messages/mentions';
import { Sheet, SheetTextInput, type SheetRef } from '../components/ui/Sheet';
import { Skeleton, SkeletonRow } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useTheme } from '../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Channel {
  id: string;
  name: string;
  type: 'channel' | 'dm';
  projectId?: string | null;
  description?: string | null;
  isPinned?: boolean;
  lastMessageAt?: string | null;
  lastMessageContent?: string | null;
  lastMessageSender?: string | null;
  messageCount?: number;
  dmParticipants?: string[] | null;
}

interface TeamUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route?: { params?: { projectId?: string } };
};

export default function MessagesScreen({ navigation, route }: Props) {
  const projectId = route?.params?.projectId;
  const { user } = useAuth();
  const theme = useTheme();
  const toast = useToast();
  const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
    input: theme.background,
  };

  const [channels, setChannels] = useState<Channel[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [usersById, setUsersById] = useState<Record<string, TeamUser>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const newChannelSheetRef = useRef<SheetRef>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);

  const newDmSheetRef = useRef<SheetRef>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [creatingDm, setCreatingDm] = useState(false);

  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const socketConnected = useSocketConnected();
  const onlineUserIds = usePresence(isFocused);

  const fetchChannels = useCallback(async () => {
    try {
      const [chs, counts] = await Promise.all([
        apiFetch<Channel[]>('/api/channels'),
        apiFetch<Record<string, number>>('/api/channels/unread/counts'),
      ]);
      setChannels(chs || []);
      setUnreadCounts(counts || {});
    } catch {
      // silently fail on poll
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAssignableUsers = useCallback(async () => {
    try {
      const allUsers = await apiFetch<TeamUser[]>('/api/users/assignable');
      const byId: Record<string, TeamUser> = {};
      for (const u of allUsers || []) byId[u.id] = u;
      setUsersById(byId);
    } catch {
      // non-critical: DM names fall back to channel-name parsing
    }
  }, []);

  // Assignable users are static — fetch once per focus, not on every poll tick.
  useFocusEffect(
    useCallback(() => {
      fetchAssignableUsers();
    }, [fetchAssignableUsers])
  );

  // Channels + unread counts. While the socket is connected new_message events
  // refresh instantly and the poll is only a 60s safety net; when the socket
  // drops, polling returns to 10s. Polls only while focused and foregrounded.
  usePolling(fetchChannels, socketConnected ? 60000 : 10000, isFocused);

  useEffect(() => {
    if (!isFocused) return;
    return onSocketEvent('new_message', () => {
      fetchChannels();
    });
  }, [isFocused, fetchChannels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchChannels(), fetchAssignableUsers()]);
    setRefreshing(false);
  }, [fetchChannels, fetchAssignableUsers]);

  const handleSeedChannels = useCallback(async () => {
    setSeeding(true);
    try {
      await apiRequest('/api/channels/seed-sample', 'POST');
      await fetchChannels();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Channels already exist — just load them.
        await fetchChannels();
      } else {
        toast.error('Could not create channels. Check your connection.');
      }
    } finally {
      setSeeding(false);
    }
  }, [fetchChannels, toast]);

  const handleCreateChannel = useCallback(async () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    setCreatingChannel(true);
    try {
      const body: Record<string, unknown> = { name, type: 'channel' };
      if (projectId) body.projectId = projectId;
      await apiRequest('/api/channels', 'POST', body);
      newChannelSheetRef.current?.dismiss();
      setNewChannelName('');
      haptic.success();
      toast.success(`#${name} created`);
      await fetchChannels();
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : 'Could not create channel. Check your connection.';
      toast.error(message);
    } finally {
      setCreatingChannel(false);
    }
  }, [newChannelName, fetchChannels, projectId, toast]);

  const handleOpenDm = useCallback(async (otherUserId: string) => {
    setCreatingDm(true);
    try {
      const res = await apiRequest('/api/channels/dm', 'POST', { otherUserId });
      const channel: Channel = await res.json();
      newDmSheetRef.current?.dismiss();
      haptic.success();
      toast.success('Conversation started');
      await fetchChannels();
      const displayName = getDmDisplayName(channel, user?.id);
      navigation.navigate('MessageThread', { channelId: channel.id, channelName: displayName });
    } catch {
      toast.error('Could not start conversation.');
    } finally {
      setCreatingDm(false);
    }
  }, [fetchChannels, navigation, user?.id, toast]);

  const loadTeamUsers = useCallback(async () => {
    try {
      const users = await apiFetch<TeamUser[]>('/api/users/assignable');
      setTeamUsers((users || []).filter(u => u.id !== user?.id));
    } catch {
      setTeamUsers([]);
    }
  }, [user?.id]);

  function getDmDisplayName(ch: Channel, currentUserId?: string): string {
    // Prefer participant ID lookup — resolves actual names regardless of how the channel was named
    if (ch.dmParticipants && ch.dmParticipants.length > 0) {
      const otherId = ch.dmParticipants.find(id => id !== currentUserId) || ch.dmParticipants[0];
      const other = usersById[otherId];
      if (other) {
        const name = [other.firstName, other.lastName].filter(Boolean).join(' ');
        return name || other.email;
      }
    }
    // Fallback: strip the dm- prefix and attempt to humanise (handles firstName-based names)
    const stripped = ch.name.replace(/^dm-/, '');
    // If it looks like a UUID segment (8+ hex chars with no spaces), show generic label
    if (/^[0-9a-f]{8}/i.test(stripped)) return 'Direct Message';
    return stripped.replace(/-/g, ' ');
  }

  // GET /api/channels already returns isPinned (resolved per-user from
  // channel_members) and pre-sorts pinned-first-then-recent. This re-sort keeps
  // pinned at the top of each *section* regardless of payload order; Array.sort
  // is stable, so the server's recency ordering survives within each group.
  const pinnedFirst = (list: Channel[]) =>
    [...list].sort((a, b) => (a.isPinned ? 0 : 1) - (b.isPinned ? 0 : 1));

  const channelList = pinnedFirst(channels.filter(c => c.type === 'channel'));
  const dmList = pinnedFirst(channels.filter(c => c.type === 'dm'));

  const sections: { title: string; data: Channel[] }[] = [
    ...(channelList.length > 0 ? [{ title: 'CHANNELS', data: channelList }] : []),
    ...(dmList.length > 0 ? [{ title: 'DIRECT MESSAGES', data: dmList }] : []),
  ];

  const renderChannelRow = ({ item, index }: { item: Channel; index: number }) => {
    const unread = unreadCounts[item.id] || 0;
    const displayName = item.type === 'dm' ? getDmDisplayName(item, user?.id) : item.name;
    // Presence is only meaningful for a DM's counterpart — never for yourself,
    // and never for a multi-member channel.
    const dmOtherId =
      item.type === 'dm'
        ? (item.dmParticipants || []).find(id => id !== user?.id) || null
        : null;
    const dmOnline = !!dmOtherId && dmOtherId !== user?.id && onlineUserIds.has(dmOtherId);
    return (
      <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index * 40, 240))}>
        <PressableScale
          haptics
          style={[styles.channelRow, { borderBottomColor: colors.border }]}
          onPress={() => navigation.navigate('MessageThread', { channelId: item.id, channelName: displayName })}
        >
          <View style={styles.channelAvatarWrap}>
            <View style={[styles.channelAvatar, { backgroundColor: colors.accent + '30' }]}>
              <Text style={[styles.channelAvatarIcon, { color: colors.accent }]}>
                {item.type === 'channel' ? '#' : getInitials(displayName)}
              </Text>
            </View>
            {dmOnline && <PresenceDot theme={theme} ringColor={colors.bg} />}
          </View>
          <View style={styles.channelInfo}>
            <View style={styles.channelNameRow}>
              {item.isPinned && (
                <Ionicons name="pin" size={12} color={colors.muted} style={styles.pinIcon} />
              )}
              <Text style={[styles.channelName, { color: colors.text }, unread > 0 && styles.channelNameBold]} numberOfLines={1}>
                {displayName}
              </Text>
              {item.lastMessageAt && (
                <Text style={[styles.channelTime, { color: colors.secondary }]}>
                  {timeAgo(item.lastMessageAt)}
                </Text>
              )}
            </View>
            {item.lastMessageContent ? (
              <Text style={[styles.channelDesc, { color: colors.secondary }, unread > 0 && styles.channelDescBold]} numberOfLines={1}>
                {item.lastMessageSender
                  ? `${item.lastMessageSender}: ${markupToDisplay(item.lastMessageContent)}`
                  : markupToDisplay(item.lastMessageContent)}
              </Text>
            ) : item.description ? (
              <Text style={[styles.channelDesc, { color: colors.secondary }]} numberOfLines={1}>
                {item.description}
              </Text>
            ) : (
              <Text style={[styles.channelDesc, { color: colors.muted }]} numberOfLines={1}>
                No messages yet
              </Text>
            )}
          </View>
          {unread > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.unreadBadgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </PressableScale>
      </Animated.View>
    );
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
      <View style={styles.headerActions}>
        <PressableScale
          haptics
          style={[styles.headerBtn, { backgroundColor: colors.input }]}
          onPress={() => { loadTeamUsers(); newDmSheetRef.current?.present(); }}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.accent} />
        </PressableScale>
        <PressableScale
          haptics
          style={[styles.headerBtn, { backgroundColor: colors.input }]}
          onPress={() => newChannelSheetRef.current?.present()}
        >
          <Ionicons name="add" size={20} color={colors.accent} />
        </PressableScale>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {header}
        <View style={styles.skeletonList}>
          <Skeleton width={90} height={12} style={{ marginBottom: 4 }} />
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {header}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={56} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No channels yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.secondary }]}>
            Set up your team channels to start communicating.
          </Text>
          <PressableScale
            haptics
            style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
            onPress={handleSeedChannels}
            disabled={seeding}
          >
            {seeding ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.emptyBtnText}>Set Up Channels</Text>
            )}
          </PressableScale>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {header}

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={renderChannelRow}
        renderSectionHeader={({ section }) => (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={[styles.sectionHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}
          >
            <Text style={[styles.sectionTitle, { color: colors.secondary }]}>{section.title}</Text>
          </Animated.View>
        )}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ flex: 1 }}
      />

      {/* New Channel Sheet */}
      <Sheet ref={newChannelSheetRef} title="New Channel">
        <View style={styles.sheetBody}>
          <Text style={[styles.sheetLabel, { color: colors.secondary }]}>Channel name</Text>
          <SheetTextInput
            style={[styles.sheetInput, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
            placeholder="e.g. site-updates"
            placeholderTextColor={colors.muted}
            value={newChannelName}
            onChangeText={setNewChannelName}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <PressableScale
            style={[styles.sheetBtn, { backgroundColor: colors.accent, opacity: creatingChannel || !newChannelName.trim() ? 0.6 : 1 }]}
            onPress={handleCreateChannel}
            disabled={creatingChannel || !newChannelName.trim()}
          >
            {creatingChannel ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.sheetBtnText}>Create Channel</Text>
            )}
          </PressableScale>
        </View>
      </Sheet>

      {/* New DM Sheet */}
      <Sheet ref={newDmSheetRef} title="New Message" scrollable>
        <View style={styles.sheetBody}>
          {teamUsers.length === 0 ? (
            <Text style={[styles.noUsersText, { color: colors.secondary }]}>No other team members found.</Text>
          ) : (
            teamUsers.map(u => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
              return (
                <PressableScale
                  key={u.id}
                  haptics
                  style={[styles.dmUserRow, { borderBottomColor: colors.border }]}
                  onPress={() => handleOpenDm(u.id)}
                  disabled={creatingDm}
                >
                  <View style={[styles.dmUserAvatar, { backgroundColor: colors.accent + '30' }]}>
                    <Text style={[styles.dmUserInitials, { color: colors.accent }]}>
                      {getInitials(name)}
                    </Text>
                  </View>
                  <Text style={[styles.dmUserName, { color: colors.text }]}>{name}</Text>
                </PressableScale>
              );
            })
          )}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  skeletonList: { padding: 16, gap: 16 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  channelAvatarWrap: { width: 40, height: 40, flexShrink: 0 },
  channelAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  channelAvatarIcon: { fontSize: 18, fontWeight: '700' },
  pinIcon: { marginRight: -2 },
  channelInfo: { flex: 1, minWidth: 0 },
  channelNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  channelName: { fontSize: 15, fontWeight: '500', flex: 1 },
  channelNameBold: { fontWeight: '700' },
  channelTime: { fontSize: 12 },
  channelDesc: { fontSize: 13, marginTop: 1 },
  channelDescBold: { fontWeight: '600' },
  unreadBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
  unreadBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 8 },
  emptyBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  sheetBody: { paddingHorizontal: 20, paddingTop: 4 },
  sheetLabel: { fontSize: 13, marginBottom: 6 },
  sheetInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 16 },
  sheetBtn: { paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  sheetBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  noUsersText: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  dmUserRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  dmUserAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dmUserInitials: { fontSize: 14, fontWeight: '700' },
  dmUserName: { fontSize: 15, fontWeight: '500' },
});
