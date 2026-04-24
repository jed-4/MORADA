import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch, apiRequest } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme';
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

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function getInitials(name: string): string {
  const parts = name.replace(/^#/, '').split(/[\s-]/);
  return parts
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('');
}

export default function MessagesScreen({ navigation, route }: Props) {
  const projectId = route?.params?.projectId;
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();
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

  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);

  const [showNewDmModal, setShowNewDmModal] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [creatingDm, setCreatingDm] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [chs, counts, allUsers] = await Promise.all([
        apiFetch<Channel[]>('/api/channels'),
        apiFetch<Record<string, number>>('/api/channels/unread/counts'),
        apiFetch<TeamUser[]>('/api/users/assignable').catch(() => [] as TeamUser[]),
      ]);
      setChannels(chs || []);
      setUnreadCounts(counts || {});
      const byId: Record<string, TeamUser> = {};
      for (const u of allUsers || []) byId[u.id] = u;
      setUsersById(byId);
    } catch {
      // silently fail on poll
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      pollRef.current = setInterval(fetchData, 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleSeedChannels = useCallback(async () => {
    setSeeding(true);
    try {
      const res = await apiRequest('/api/channels/seed-sample', 'POST');
      if (res.ok || res.status === 409) {
        await fetchData();
      } else {
        Alert.alert('Error', 'Could not create channels. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not create channels. Please check your connection.');
    } finally {
      setSeeding(false);
    }
  }, [fetchData]);

  const handleCreateChannel = useCallback(async () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    setCreatingChannel(true);
    try {
      const body: Record<string, unknown> = { name, type: 'channel' };
      if (projectId) body.projectId = projectId;
      const res = await apiRequest('/api/channels', 'POST', body);
      if (res.ok) {
        setShowNewChannelModal(false);
        setNewChannelName('');
        await fetchData();
      } else {
        const body = await res.json().catch(() => ({}));
        Alert.alert('Error', body.error || 'Could not create channel.');
      }
    } catch {
      Alert.alert('Error', 'Could not create channel. Please check your connection.');
    } finally {
      setCreatingChannel(false);
    }
  }, [newChannelName, fetchData, projectId]);

  const handleOpenDm = useCallback(async (otherUserId: string) => {
    setCreatingDm(true);
    try {
      const res = await apiRequest('/api/channels/dm', 'POST', { otherUserId });
      if (res.ok) {
        const channel: Channel = await res.json();
        setShowNewDmModal(false);
        await fetchData();
        const displayName = getDmDisplayName(channel, user?.id);
        navigation.navigate('MessageThread', { channelId: channel.id, channelName: displayName });
      } else {
        Alert.alert('Error', 'Could not start conversation.');
      }
    } catch {
      Alert.alert('Error', 'Could not start conversation.');
    } finally {
      setCreatingDm(false);
    }
  }, [fetchData, navigation, user?.id]);

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

  const channelList = channels.filter(c => c.type === 'channel');
  const dmList = channels.filter(c => c.type === 'dm');
  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  const renderChannelRow = ({ item }: { item: Channel }) => {
    const unread = unreadCounts[item.id] || 0;
    const displayName = item.type === 'dm' ? getDmDisplayName(item, user?.id) : item.name;
    return (
      <TouchableOpacity
        style={[styles.channelRow, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('MessageThread', { channelId: item.id, channelName: displayName })}
        activeOpacity={0.7}
      >
        <View style={[styles.channelAvatar, { backgroundColor: colors.accent + '30' }]}>
          {item.type === 'channel' ? (
            <Text style={[styles.channelAvatarIcon, { color: colors.accent }]}>#</Text>
          ) : (
            <Text style={[styles.channelAvatarIcon, { color: colors.accent }]}>
              {getInitials(displayName)}
            </Text>
          )}
        </View>
        <View style={styles.channelInfo}>
          <View style={styles.channelNameRow}>
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
              {item.lastMessageSender ? `${item.lastMessageSender}: ${item.lastMessageContent}` : item.lastMessageContent}
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
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={56} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No channels yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.secondary }]}>
            Set up your team channels to start communicating.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
            onPress={handleSeedChannels}
            activeOpacity={0.8}
            disabled={seeding}
          >
            {seeding ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.emptyBtnText}>Set Up Channels</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: colors.input }]}
            onPress={() => { loadTeamUsers(); setShowNewDmModal(true); }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: colors.input }]}
            onPress={() => setShowNewChannelModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={[]}
        renderItem={null}
        keyExtractor={() => 'header'}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <>
            {channelList.length > 0 && (
              <>
                <View style={[styles.sectionHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.secondary }]}>CHANNELS</Text>
                </View>
                {channelList.map(item => (
                  <View key={item.id}>{renderChannelRow({ item })}</View>
                ))}
              </>
            )}
            {dmList.length > 0 && (
              <>
                <View style={[styles.sectionHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.secondary }]}>DIRECT MESSAGES</Text>
                </View>
                {dmList.map(item => (
                  <View key={item.id}>{renderChannelRow({ item })}</View>
                ))}
              </>
            )}
          </>
        }
        ListEmptyComponent={null}
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ flex: 1 }}
      />

      {/* New Channel Modal */}
      <Modal visible={showNewChannelModal} animationType="slide" transparent onRequestClose={() => setShowNewChannelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>New Channel</Text>
              <TouchableOpacity onPress={() => setShowNewChannelModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalLabel, { color: colors.secondary }]}>Channel name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. site-updates"
              placeholderTextColor={colors.muted}
              value={newChannelName}
              onChangeText={setNewChannelName}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.accent }]}
              onPress={handleCreateChannel}
              activeOpacity={0.8}
              disabled={creatingChannel || !newChannelName.trim()}
            >
              {creatingChannel ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.modalBtnText}>Create Channel</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New DM Modal */}
      <Modal visible={showNewDmModal} animationType="slide" transparent onRequestClose={() => setShowNewDmModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>New Message</Text>
              <TouchableOpacity onPress={() => setShowNewDmModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            {teamUsers.length === 0 ? (
              <Text style={[styles.noUsersText, { color: colors.secondary }]}>No other team members found.</Text>
            ) : (
              <FlatList
                data={teamUsers}
                keyExtractor={u => u.id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => {
                  const name = [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email;
                  return (
                    <TouchableOpacity
                      style={[styles.dmUserRow, { borderBottomColor: colors.border }]}
                      onPress={() => handleOpenDm(item.id)}
                      activeOpacity={0.7}
                      disabled={creatingDm}
                    >
                      <View style={[styles.dmUserAvatar, { backgroundColor: colors.accent + '30' }]}>
                        <Text style={[styles.dmUserInitials, { color: colors.accent }]}>
                          {getInitials(name)}
                        </Text>
                      </View>
                      <Text style={[styles.dmUserName, { color: colors.text }]}>{name}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
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
  channelAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  channelAvatarIcon: { fontSize: 18, fontWeight: '700' },
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContainer: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottomWidth: 1, marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalLabel: { fontSize: 13, marginBottom: 6 },
  modalInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 16 },
  modalBtn: { paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  noUsersText: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  dmUserRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  dmUserAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dmUserInitials: { fontSize: 14, fontWeight: '700' },
  dmUserName: { fontSize: 15, fontWeight: '500' },
});
