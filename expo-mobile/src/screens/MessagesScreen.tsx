import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest, ApiError } from '../services/api';
import { onSocketEvent, useSocketConnected } from '../services/socket';
import { useAuth } from '../contexts/AuthContext';
import { usePolling } from '../lib/usePolling';
import { usePresence } from '../lib/usePresence';
import { shortWhen } from '../lib/format';
import { usePersistedState } from '../lib/usePersistedState';
import { ClientBadge } from '../components/messages/ClientBadge';
import { MessageSearchResults, type MessageSearchHit } from '../components/messages/MessageSearchResults';
import { Eye, Hash, Lock, MessagesSquare, Search, SquarePen, User, X } from 'lucide-react-native';
import { Avatar, ButtonRow, Card, EmptyState, FieldHint, FieldLabel, GroupHeader, ListRow, PrimaryButton, ProjectSquare, RootTitle, SheetBody, TextField, ToggleRow, UnreadBadge } from '../components/kit';
import { readableFrame } from '../components/ui/ReadableColumn';
import { haptic } from '../lib/haptics';
import { PresenceDot } from '../components/messages/PresenceDot';
import { markupToDisplay } from '../components/messages/mentions';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { TwoPane } from '../components/ui/TwoPane';
import { useTwoPaneSelection } from '../lib/twoPane';
import MessageThreadScreen from './MessageThreadScreen';
import { SkeletonRow } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useTheme, useColors, metrics, radii, size, space, tabular, type } from '../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Channel {
  id: string;
  name: string;
  type: 'channel' | 'dm';
  projectId?: string | null;
  description?: string | null;
  isPinned?: boolean;
  /** Clients can read this channel — drives the amber eye/CLIENT signals. */
  isClientFacing?: boolean;
  /** Optional channel emoji, chosen on the web. */
  emoji?: string | null;
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

  const [channels, setChannels] = useState<Channel[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [usersById, setUsersById] = useState<Record<string, TeamUser>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  // Set when the channel list couldn't be fetched (offline, server error), so an
  // empty list isn't mistaken for "no channels" — that offers to create samples.
  const [loadFailed, setLoadFailed] = useState(false);
  const [pinnedOpen, setPinnedOpen] = usePersistedState<boolean>('messages.pinnedOpen', true);
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [projectsById, setProjectsById] = useState<Record<string, { color?: string | null }>>({});
  const composeSheetRef = useRef<SheetRef>(null);
  const k = useColors();

  const newChannelSheetRef = useRef<SheetRef>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelClientFacing, setNewChannelClientFacing] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);

  const newDmSheetRef = useRef<SheetRef>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [creatingDm, setCreatingDm] = useState(false);

  // D07: on the Duo unfolded the open conversation sits on the right; on a
  // phone a tap still pushes MessageThread. Names are looked up through a ref
  // so a just-created DM (not yet in `channels`) still gets its title.
  const namesRef = useRef<Record<string, string>>({});
  // Message search → open a thread at a message. The phone push reads the ref;
  // the Duo pane reads `focus` (channel + message) for the embedded thread.
  const focusRef = useRef<string | null>(null);
  const [focus, setFocus] = useState<{ channelId: string; messageId: string } | null>(null);
  const { selectedId, open: openThread, isWide, paneProps } = useTwoPaneSelection({
    navigation,
    route,
    detailRoute: 'MessageThread',
    paramsFor: (id: string) => ({
      channelId: id,
      channelName: namesRef.current[id] ?? '',
      ...(focusRef.current ? { focusMessageId: focusRef.current } : {}),
    }),
  });

  // A search jump belongs to one conversation: drop it once another is open,
  // so coming back later doesn't jump (and tint) all over again.
  useEffect(() => {
    if (focus && selectedId !== focus.channelId) setFocus(null);
  }, [focus, selectedId]);

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
      setLoadFailed(false);
    } catch {
      // Polls fail quietly; only an empty screen needs to say so.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Duo two-pane: the open thread marks itself read on open and on leave, but
  // that never reached this list, so a thread's badge came back once you left
  // it. Zero it locally the moment the selection moves, and again when the
  // thread's read POST lands. No list refetch here: mark-read also fires on
  // every incoming message, and the socket already refreshes the list then.
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = isWide ? selectedId : null;
    const ids = [prev, isWide ? selectedId : null].filter((id): id is string => !!id);
    if (!ids.length) return;
    setUnreadCounts(c => (ids.every(id => !c[id]) ? c : { ...c, ...Object.fromEntries(ids.map(id => [id, 0])) }));
  }, [isWide, selectedId]);
  const handleMarkedRead = useCallback((id: string) => {
    setUnreadCounts(c => (c[id] ? { ...c, [id]: 0 } : c));
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
    try {
      // Project threads lead with the project's colour square.
      const projects = await apiFetch<{ id: string; color?: string | null }[]>('/api/projects');
      const map: Record<string, { color?: string | null }> = {};
      for (const pr of projects || []) map[pr.id] = { color: pr.color };
      setProjectsById(map);
    } catch {
      // non-critical: squares fall back to the stable tint
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
      const body: Record<string, unknown> = {
        name,
        type: 'channel',
        isClientFacing: newChannelClientFacing,
      };
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
  }, [newChannelName, newChannelClientFacing, fetchChannels, projectId, toast]);

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
      namesRef.current[channel.id] = displayName;
      openThread(channel.id);
    } catch {
      toast.error('Could not start conversation.');
    } finally {
      setCreatingDm(false);
    }
  }, [fetchChannels, openThread, user?.id, toast]);

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

  const projectColor = (id?: string | null) => (id ? projectsById[id]?.color ?? null : null);

  /** Preview prefixed with the sender's first name, or "You". */
  const previewOf = (ch: Channel): string | null => {
    if (!ch.lastMessageContent) return ch.description || null;
    const body = markupToDisplay(ch.lastMessageContent);
    const sender = ch.lastMessageSender?.trim();
    if (!sender) return body;
    const mine = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    const who = mine && sender === mine ? 'You' : sender.split(/\s+/)[0];
    return `${who}: ${body}`;
  };

  const nameOf = (ch: Channel) => (ch.type === 'dm' ? getDmDisplayName(ch, user?.id) : ch.name);
  for (const ch of channels) namesRef.current[ch.id] = nameOf(ch);
  // The open conversation is being read on the right: don't badge it.
  const unreadOf = (id: string) => (isWide && selectedId === id ? 0 : unreadCounts[id] || 0);
  const q = search.trim().toLowerCase();
  const visible = q ? channels.filter(ch => nameOf(ch).toLowerCase().includes(q)) : channels;
  const byRecent = (a: Channel, b: Channel) =>
    (b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0) - (a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0);
  // Only Pinned is grouped; everything else is one list, newest first.
  const pinned = visible.filter(ch => ch.isPinned);
  const recent = visible.filter(ch => !ch.isPinned).sort(byRecent);
  const totalUnread = channels.reduce((sum, ch) => sum + unreadOf(ch.id), 0);

  const renderLead = (item: Channel, displayName: string) => {
    if (item.type === 'dm' && !item.emoji) {
      const otherId = (item.dmParticipants || []).find(id => id !== user?.id) || null;
      const online = !!otherId && onlineUserIds.has(otherId);
      return (
        <View>
          <Avatar name={displayName} />
          {online ? <PresenceDot theme={theme} ringColor={k.surface} /> : null}
        </View>
      );
    }
    if (item.emoji) return <Text style={{ fontSize: M.emoji, lineHeight: M.lead }}>{item.emoji}</Text>;
    if (item.projectId) return <ProjectSquare color={projectColor(item.projectId)} fallbackKey={item.projectId} />;
    return <Text style={[type.price, { color: k.muted }]}>#</Text>;
  };

  // Message search hits reuse the list's own naming and lead icons.
  const channelById = (id: string) => channels.find(ch => ch.id === id);
  const hitName = (h: MessageSearchHit) => {
    const ch = channelById(h.channelId);
    if (ch) return nameOf(ch);
    return h.channelType === 'dm' ? 'Direct message' : h.channelName || 'Channel';
  };
  const hitLead = (h: MessageSearchHit) => {
    const ch = channelById(h.channelId);
    if (ch) return renderLead(ch, nameOf(ch));
    return h.channelEmoji ? <Text style={{ fontSize: M.emoji, lineHeight: M.lead }}>{h.channelEmoji}</Text> : <Text style={[type.price, { color: k.muted }]}>#</Text>;
  };
  const openHit = (h: MessageSearchHit) => {
    focusRef.current = h.id;
    setFocus({ channelId: h.channelId, messageId: h.id });
    openThread(h.channelId);
    focusRef.current = null;
  };

  const renderRow = (item: Channel) => {
    const unread = unreadOf(item.id);
    const displayName = nameOf(item);
    const isOpen = isWide && selectedId === item.id;
    const preview = previewOf(item);
    // Only channels can be client-facing; a DM is never one, whatever the row says.
    const clientFacing = item.type === 'channel' && !!item.isClientFacing;
    return (
      <Pressable
        key={item.id}
        onPress={() => {
          haptic.light();
          namesRef.current[item.id] = displayName;
          openThread(item.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}${unread ? `, ${unread} unread` : ''}${clientFacing ? ', client can see this channel' : ''}`}
        style={({ pressed }) => [mx.row, isOpen && [mx.rowSelected, { backgroundColor: k.tint }], { opacity: pressed ? metrics.pressedOpacity : 1 }]}
      >
        <View style={mx.lead}>{renderLead(item, displayName)}</View>
        <View style={mx.body}>
          <View style={mx.line}>
            <Text style={[unread ? type.rowTitleStrong : type.rowTitle, mx.name, { color: k.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {clientFacing ? <ClientBadge /> : null}
            {item.lastMessageAt ? (
              <Text style={[type.caption, tabular, mx.time, { color: unread ? k.accent : k.muted }]}>{shortWhen(item.lastMessageAt)}</Text>
            ) : null}
          </View>
          <View style={mx.line}>
            <Text style={[type.meta, mx.name, { color: k.muted }]} numberOfLines={1}>
              {preview ?? 'No messages yet'}
            </Text>
            <UnreadBadge count={unread} />
          </View>
        </View>
      </Pressable>
    );
  };

  const header = (
    <View style={mx.top}>
      <RootTitle
        title="Messages"
        count={totalUnread ? `${totalUnread} unread` : null}
        countSize="small"
        accentActions
        actions={[
          {
            icon: searchVisible ? X : Search,
            label: searchVisible ? 'Close search' : 'Search messages',
            onPress: () => {
              if (searchVisible) setSearch('');
              setSearchVisible(v => !v);
            },
          },
          { icon: SquarePen, label: 'New message or channel', onPress: () => composeSheetRef.current?.present() },
        ]}
      />
      {searchVisible ? (
        <View style={[mx.searchBar, { backgroundColor: k.surface, borderColor: k.border }]}>
          <Search size={metrics.projects.searchIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search messages"
            placeholderTextColor={k.faint}
            autoFocus
            style={[type.body, mx.searchInput, { color: k.text }]}
          />
        </View>
      ) : null}
    </View>
  );

  const pad = { paddingTop: insets.top + metrics.messages.top };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: k.bg }]}>
        <View style={[mx.frame, pad]}>{header}</View>
        <View style={[mx.frame, mx.skeleton]}>
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: k.bg }]}>
      <TwoPane
        {...paneProps}
        listWidth={size.listPane.messages}
        empty={<EmptyState icon={MessagesSquare} title="Select a conversation" />}
        detail={
          selectedId ? (
            <MessageThreadScreen
              key={selectedId}
              embedded
              onChannelChanged={fetchChannels}
              onMarkedRead={handleMarkedRead}
              navigation={navigation}
              route={{
                params: {
                  channelId: selectedId,
                  channelName: namesRef.current[selectedId] ?? '',
                  ...(focus?.channelId === selectedId ? { focusMessageId: focus.messageId } : {}),
                },
              }}
            />
          ) : null
        }
        list={
      <ScrollView
        contentContainerStyle={[mx.frame, mx.list, pad, readableFrame]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
      >
        {header}
        {channels.length === 0 && loadFailed ? (
          <View style={mx.empty}>
            <EmptyState icon={MessagesSquare} title="Couldn't load messages" helper="Check your connection, then pull down to try again." />
          </View>
        ) : channels.length === 0 ? (
          <View style={mx.empty}>
            <EmptyState icon={MessagesSquare} title="No channels yet" helper="Set up your team channels to start communicating." />
            <Pressable
              onPress={handleSeedChannels}
              disabled={seeding}
              accessibilityRole="button"
              style={({ pressed }) => [mx.seedBtn, { backgroundColor: k.accent, opacity: pressed ? metrics.solidPressedOpacity : 1 }]}
            >
              {seeding ? <ActivityIndicator color={k.onAccent} size="small" /> : <Text style={[type.rowTitleMedium, { color: k.onAccent }]}>Set up channels</Text>}
            </Pressable>
          </View>
        ) : visible.length === 0 ? (
          // 2+ characters: the Messages section below says whether anything matched.
          q.length >= 2 ? null : <Text style={[type.body, { color: k.muted }]}>Nothing matches your search</Text>
        ) : (
          <>
            {pinned.length > 0 ? (
              <View>
                <GroupHeader title="Pinned" meta={pinned.length} open={pinnedOpen} onToggle={() => setPinnedOpen(!pinnedOpen)} />
                {pinnedOpen ? <Card variant="list">{pinned.map(renderRow)}</Card> : null}
              </View>
            ) : null}
            {recent.length > 0 ? (
              <View style={mx.recent}>
                {pinned.length > 0 ? <Text style={[type.meta, { color: k.muted }]}>Recent</Text> : null}
                <Card variant="list">{recent.map(renderRow)}</Card>
              </View>
            ) : null}
          </>
        )}
        {searchVisible && channels.length > 0 ? (
          <MessageSearchResults
            query={search}
            conversationName={hitName}
            renderLead={hitLead}
            onOpen={openHit}
          />
        ) : null}
      </ScrollView>
        }
      />

      {/* Compose: choose a direct message or a new channel. */}
      <Sheet ref={composeSheetRef} title="New">
        <SheetBody>
          <Card variant="list">
            <ListRow
              key="dm"
              lead={<User size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
              title="New message"
              subtitle="Message someone on your team"
              chevron
              onPress={() => {
                composeSheetRef.current?.dismiss();
                loadTeamUsers();
                setTimeout(() => newDmSheetRef.current?.present(), metrics.sheetSwapMs);
              }}
            />
            <ListRow
              key="channel"
              lead={<Hash size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
              title="New channel"
              subtitle="A shared thread for a topic or team"
              chevron
              onPress={() => {
                composeSheetRef.current?.dismiss();
                setTimeout(() => newChannelSheetRef.current?.present(), metrics.sheetSwapMs);
              }}
            />
          </Card>
        </SheetBody>
      </Sheet>

      {/* New channel */}
      <Sheet
        ref={newChannelSheetRef}
        title="New channel"
        // Client-facing is a consequential default — never let it carry over
        // from a previous open. Covers both cancel and post-create dismiss.
        onDismiss={() => {
          setNewChannelName('');
          setNewChannelClientFacing(false);
        }}
      >
        <SheetBody>
          <View style={mx.field}>
            <FieldLabel>Channel name</FieldLabel>
            <TextField
              inSheet
              placeholder="e.g. site-updates"
              value={newChannelName}
              returnKeyType="done"
              onChangeText={setNewChannelName}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Channel name"
            />
          </View>

          {/* Client-facing: a consequence, so its helper turns amber when on. */}
          <Card variant="list">
            <ToggleRow
              key="client"
              icon={newChannelClientFacing ? Eye : Lock}
              label="Client-facing channel"
              helper={newChannelClientFacing ? 'The client can see this channel' : 'Only your team can see this channel'}
              value={newChannelClientFacing}
              onValueChange={v => {
                haptic.select();
                setNewChannelClientFacing(v);
              }}
            />
          </Card>
          {newChannelClientFacing ? <FieldHint tone="warning">Anything posted here is visible to the client.</FieldHint> : null}

          <ButtonRow>
            <PrimaryButton
              label="Create channel"
              onPress={handleCreateChannel}
              loading={creatingChannel}
              disabled={!newChannelName.trim()}
            />
          </ButtonRow>
        </SheetBody>
      </Sheet>

      {/* New message: pick a team member */}
      <Sheet ref={newDmSheetRef} title="New message" scrollable>
        <SheetBody>
          {teamUsers.length === 0 ? (
            <Text style={[type.body, mx.center, { color: k.muted }]}>No other team members found.</Text>
          ) : (
            <Card variant="list">
              {teamUsers.map(u => {
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
                return (
                  <ListRow
                    key={u.id}
                    lead={<Avatar name={name} />}
                    title={name}
                    titleLines={1}
                    onPress={creatingDm ? undefined : () => { haptic.light(); handleOpenDm(u.id); }}
                  />
                );
              })}
            </Card>
          )}
        </SheetBody>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

const M = metrics.messages;

const mx = StyleSheet.create({
  frame: { paddingHorizontal: space.screenX },
  list: { gap: M.gap, paddingBottom: space.screenBottom },
  top: { gap: M.topGap },
  recent: { gap: space.groupHeaderToCard },
  empty: { paddingTop: space.screenBottom, alignItems: 'center', gap: M.topGap },
  seedBtn: { minHeight: metrics.minHit, paddingHorizontal: M.seedPadX, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    minHeight: metrics.projects.searchHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
    paddingHorizontal: metrics.projects.cardPad,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  field: { gap: metrics.form.labelGap },
  center: { textAlign: 'center', paddingVertical: space.screenBottom },
  skeleton: { gap: M.gap, paddingTop: M.topGap },
  // Duo: the open conversation is a tint block (radius 8) set in from the card edge.
  rowSelected: {
    marginHorizontal: -(space.cardX - metrics.card.duoPad),
    paddingHorizontal: space.cardX - metrics.card.duoPad,
    borderRadius: radii.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: metrics.listRow.gap, paddingVertical: metrics.listRow.padY, minHeight: M.rowMin },
  lead: { width: M.lead, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: metrics.listRow.bodyGap },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  name: { flex: 1 },
  time: { flexShrink: 0 },
});
