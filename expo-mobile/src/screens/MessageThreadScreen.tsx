import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest, uploadPhoto, ApiError } from '../services/api';
import { onSocketEvent, useSocketConnected } from '../services/socket';
import { usePresence } from '../lib/usePresence';
import { useTypingEmitter, useTypingUsers } from '../lib/useTypingIndicator';
import { useThreadMessages, byCreatedAsc } from '../lib/useThreadMessages';
import { haptic } from '../lib/haptics';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '../components/ui/Skeleton';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { useToast } from '../components/ui/Toast';
import { MessageBubble } from '../components/messages/MessageBubble';
import { MessageActionsSheet } from '../components/messages/MessageActionsSheet';
import { ImageViewerModal } from '../components/messages/ImageViewerModal';
import { TypingIndicator } from '../components/messages/TypingIndicator';
import { ScrollToBottomPill } from '../components/messages/ScrollToBottomPill';
import { PinnedBanner } from '../components/messages/PinnedBanner';
import { ThreadHeader } from '../components/messages/ThreadHeader';
import { MessageContent } from '../components/messages/MessageContent';
import {
  MessageComposer,
  type PendingImage,
  type MentionUser,
} from '../components/messages/MessageComposer';
import { markupToDisplay, extractMentionIds } from '../components/messages/mentions';
import type {
  Message,
  MessageAttachment,
  MessageReaction,
  ChannelMember,
} from '../components/messages/types';
import { useTheme } from '../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ MessageThread: { channelId: string; channelName: string } }, 'MessageThread'>;
};

/** Below this scroll offset the inverted list counts as "at the newest". */
const AT_BOTTOM_PX = 120;

/**
 * The slice of GET /api/channels/:id this screen reads. isClientFacing is
 * deliberately sourced from this fetch rather than a route param: the thread is
 * also opened by deep links from notifications and mentions, which carry no such
 * param, and a missing param would silently render an internal-looking header on
 * a channel the client can read. The fetch is authoritative and already happens.
 */
type ChannelMeta = {
  type?: string;
  dmParticipants?: string[] | null;
  isClientFacing?: boolean;
};

function getSenderName(msg: Message): string {
  if (msg.userFirstName || msg.userLastName) {
    return [msg.userFirstName, msg.userLastName].filter(Boolean).join(' ');
  }
  return msg.userEmail || 'Unknown';
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDateDivider(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

type ListItem =
  | { kind: 'message'; id: string; msg: Message; isFirstFromSender: boolean }
  | { kind: 'divider'; id: string; date: string }
  | { kind: 'seen'; id: string; label: string };

export default function MessageThreadScreen({ navigation, route }: Props) {
  const { channelId, channelName } = route.params;
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

  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [viewerAttachment, setViewerAttachment] = useState<MessageAttachment | null>(null);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [readState, setReadState] = useState<Record<string, string>>({});
  const [channelMeta, setChannelMeta] = useState<ChannelMeta | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedPreview, setPinnedPreview] = useState<Message | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  const flatListRef = useRef<FlatList<ListItem>>(null);
  const menuSheetRef = useRef<SheetRef>(null);
  const pinnedSheetRef = useRef<SheetRef>(null);
  // Local image assets per optimistic temp id, kept for retries.
  const tempImagesRef = useRef<Record<string, PendingImage[]>>({});
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const socketConnected = useSocketConnected();

  // Mirrors state for socket callbacks, which capture their closure at
  // subscribe time and would otherwise read a stale value.
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;

  const onlineUserIds = usePresence(isFocused);
  const typingUserIds = useTypingUsers(channelId, user?.id);
  const { setTyping, stopTyping } = useTypingEmitter(channelId);

  const scrollToNewest = useCallback((animated = true) => {
    // Inverted list: the newest message lives at offset 0, NOT scrollToEnd()
    // (which would jump to the oldest loaded message).
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
    setHasNew(false);
  }, []);

  const markRead = useCallback(async () => {
    try {
      await apiRequest(`/api/channels/${channelId}/read`, 'POST');
    } catch {
      // silently fail
    }
  }, [channelId]);

  // A newer message landed. Your own send always follows the message down;
  // someone else's only steals the viewport if you were already at the newest.
  const onNewest = useCallback(({ isOwn }: { isOwn: boolean }) => {
    if (isOwn || atBottomRef.current) scrollToNewest();
    else setHasNew(true);
  }, [scrollToNewest]);

  const {
    messages,
    setMessages,
    reactionsMap,
    setReactionsMap,
    loading,
    loadingOlder,
    loadOlder,
    fetchMessages,
  } = useThreadMessages({ channelId, userId: user?.id, isFocused, socketConnected, markRead, onNewest });

  const fetchMentionUsers = useCallback(async () => {
    try {
      const users = await apiFetch<MentionUser[]>('/api/users/assignable');
      // You can't usefully mention yourself — drop self from the suggestions.
      setMentionUsers((users || []).filter(u => u.id !== user?.id));
    } catch {
      // non-critical: autocomplete just won't offer suggestions
    }
  }, [user?.id]);

  // Members carry lastReadAt (read receipts) and role (pin permissions).
  const fetchMembers = useCallback(async () => {
    try {
      const ms = await apiFetch<ChannelMember[]>(`/api/channels/${channelId}/members`);
      setMembers(ms || []);
      const seeded: Record<string, string> = {};
      for (const m of ms || []) if (m.lastReadAt) seeded[m.userId] = m.lastReadAt;
      setReadState(seeded);
    } catch {
      // non-critical: no receipts rather than a broken thread
    }
  }, [channelId]);

  const fetchChannelMeta = useCallback(async () => {
    try {
      setChannelMeta(await apiFetch<ChannelMeta>(`/api/channels/${channelId}`));
    } catch {
      // non-critical: presence dot and the CLIENT badge just won't render
    }
  }, [channelId]);

  const fetchPinned = useCallback(async () => {
    try {
      setPinnedMessages((await apiFetch<Message[]>(`/api/channels/${channelId}/pinned`)) || []);
    } catch {
      // non-critical: banner just won't render
    }
  }, [channelId]);

  useFocusEffect(
    useCallback(() => {
      fetchMessages(true).then(markRead);
      fetchMentionUsers();
      fetchMembers();
      fetchChannelMeta();
      fetchPinned();
      return () => {
        markRead();
        stopTyping();
      };
    }, [fetchMessages, markRead, fetchMentionUsers, fetchMembers, fetchChannelMeta, fetchPinned, stopTyping])
  );

  // Read receipts: emitted to the channel room from the REST read endpoint and
  // the socket mark_read handler (server/socketManager.ts emitMessagesRead).
  // The rest of the socket feed lives in useThreadMessages.
  useEffect(() => {
    return onSocketEvent('messages_read', (payload: { channelId?: string; userId?: string; lastReadAt?: string }) => {
      if (payload?.channelId !== channelId || !payload?.userId || !payload?.lastReadAt) return;
      setReadState(prev => ({ ...prev, [payload.userId!]: payload.lastReadAt! }));
    });
  }, [channelId]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Inverted: offset 0 == newest message.
    const nearNewest = e.nativeEvent.contentOffset.y < AT_BOTTOM_PX;
    setAtBottom(nearNewest);
    if (nearNewest) setHasNew(false);
  }, []);

  // ── Send / retry (optimistic temps, unchanged from Phase 1; images upload
  // via the presigned flow first, then ride the POST as pendingAttachmentPaths) ──

  const deliver = useCallback(async (tempId: string, text: string, images: PendingImage[], isRetry: boolean) => {
    try {
      const pendingAttachmentPaths: { objectPath: string; fileName: string; fileSize?: number; mimeType: string }[] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        setMessages(prev => prev.map(m => (
          m.id === tempId ? { ...m, uploadStatus: `Uploading ${i + 1} of ${images.length}…` } : m
        )));
        const { objectPath } = await uploadPhoto(img.uri);
        pendingAttachmentPaths.push({
          objectPath,
          fileName: img.fileName || `photo-${Date.now()}.jpg`,
          ...(typeof img.fileSize === 'number' ? { fileSize: img.fileSize } : {}),
          mimeType: img.mimeType || 'image/jpeg',
        });
      }
      if (images.length > 0) {
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, uploadStatus: 'Sending…' } : m)));
      }

      const body: Record<string, unknown> = { content: text, mentions: extractMentionIds(text) };
      if (pendingAttachmentPaths.length > 0) body.pendingAttachmentPaths = pendingAttachmentPaths;
      const res = await apiRequest(`/api/channels/${channelId}/messages`, 'POST', body);
      const saved: Message = await res.json();
      delete tempImagesRef.current[tempId];
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempId);
        if (withoutTemp.some(m => m.id === saved.id)) return withoutTemp; // socket delivered it first
        return [...withoutTemp, saved];
      });
    } catch {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, pending: false, failed: true, uploadStatus: undefined } : m)));
      if (isRetry) toast.error('Message failed to send');
    }
  }, [channelId, toast]);

  // The composer hands up the already-resolved markup + staged images.
  const handleSend = useCallback((markup: string, images: PendingImage[]) => {
    if (!markup && images.length === 0) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const temp: Message = {
      id: tempId,
      channelId,
      userId: user?.id || '',
      content: markup,
      createdAt: new Date().toISOString(),
      userFirstName: user?.firstName ?? null,
      userLastName: user?.lastName ?? null,
      userEmail: user?.email ?? null,
      pending: true,
      localUris: images.map(i => i.uri),
    };
    tempImagesRef.current[tempId] = images;
    setMessages(prev => [...prev, temp]);
    haptic.light();
    stopTyping();
    scrollToNewest();
    deliver(tempId, markup, images, false);
  }, [channelId, user, deliver, scrollToNewest, stopTyping]);

  const retrySend = useCallback((msg: Message) => {
    haptic.light();
    setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, pending: true, failed: false } : m)));
    deliver(msg.id, msg.content, tempImagesRef.current[msg.id] || [], true);
  }, [deliver]);

  const discardFailed = useCallback((id: string) => {
    haptic.select();
    delete tempImagesRef.current[id];
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── Reactions ──

  const toggleReaction = useCallback(async (msg: Message, emoji: string) => {
    if (msg.pending || msg.failed) return;
    haptic.select();
    const before = reactionsMap[msg.id] || [];
    const mine = before.find(r => r.userId === user?.id && r.emoji === emoji);
    const optimistic = mine
      ? before.filter(r => r !== mine)
      : [...before, {
          id: `temp-reaction-${Date.now()}`,
          messageId: msg.id,
          userId: user?.id || '',
          emoji,
          userFirstName: user?.firstName ?? null,
          userLastName: user?.lastName ?? null,
        }];
    setReactionsMap(prev => ({ ...prev, [msg.id]: optimistic }));
    try {
      const res = await apiRequest(`/api/messages/${msg.id}/reactions`, 'POST', { emoji });
      const { reactions }: { reactions: MessageReaction[] } = await res.json();
      setReactionsMap(prev => ({ ...prev, [msg.id]: reactions }));
    } catch {
      setReactionsMap(prev => ({ ...prev, [msg.id]: before }));
      toast.error('Could not update reaction');
    }
  }, [reactionsMap, user, toast]);

  // ── Long-press message menu ──

  const openMenu = useCallback((msg: Message) => {
    setMenuMessage(msg);
    setConfirmingDelete(false);
    menuSheetRef.current?.present();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!menuMessage) return;
    try {
      await Clipboard.setStringAsync(markupToDisplay(menuMessage.content));
      haptic.select();
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy message');
    }
    menuSheetRef.current?.dismiss();
  }, [menuMessage, toast]);

  const handleMenuReaction = useCallback((emoji: string) => {
    if (menuMessage) toggleReaction(menuMessage, emoji);
    menuSheetRef.current?.dismiss();
  }, [menuMessage, toggleReaction]);

  const startEdit = useCallback(() => {
    if (!menuMessage) return;
    // The composer prefills itself from editingMessage.
    setEditingMessage(menuMessage);
    menuSheetRef.current?.dismiss();
  }, [menuMessage]);

  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleSaveEdit = useCallback(async (markup: string) => {
    if (!editingMessage || !markup) return;
    const id = editingMessage.id;
    const original = editingMessage;
    // Optimistic local update; PATCH /api/messages/:id is author-only.
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: markup, isEdited: true } : m)));
    cancelEdit();
    try {
      await apiRequest(`/api/messages/${id}`, 'PATCH', { content: markup, isEdited: true });
      haptic.success();
    } catch {
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: original.content, isEdited: original.isEdited } : m)));
      // Roll back the bubble, but drop the user back into edit mode holding the
      // text they tried to save rather than discarding their work.
      setEditingMessage({ ...original, content: markup });
      toast.error('Could not save changes');
    }
  }, [editingMessage, cancelEdit, toast]);

  const handleDelete = useCallback(async () => {
    if (!menuMessage) return;
    const target = menuMessage;
    menuSheetRef.current?.dismiss();
    haptic.warning();
    // Optimistic removal — the server has no undo, so failures restore in place.
    setMessages(prev => prev.filter(m => m.id !== target.id));
    try {
      await apiRequest(`/api/messages/${target.id}`, 'DELETE');
      toast.success('Message deleted');
      if (target.isPinned) fetchPinned();
    } catch {
      setMessages(prev => [...prev, target].sort(byCreatedAsc));
      toast.error('Could not delete message');
    }
  }, [menuMessage, toast, fetchPinned]);

  // ── Pinning ──

  const handleTogglePin = useCallback(async () => {
    if (!menuMessage) return;
    const target = menuMessage;
    menuSheetRef.current?.dismiss();
    try {
      const res = await apiRequest(`/api/messages/${target.id}/pin`, 'POST');
      const updated: Message = await res.json();
      setMessages(prev => prev.map(m => (
        m.id === target.id
          ? { ...m, isPinned: updated.isPinned, pinnedAt: updated.pinnedAt, pinnedByUserId: updated.pinnedByUserId }
          : m
      )));
      haptic.success();
      toast.success(updated.isPinned ? 'Message pinned' : 'Message unpinned');
      fetchPinned();
    } catch (err) {
      // The server rejects unpinning someone else's pin unless you're an
      // owner/admin — surface its reason rather than a generic failure.
      toast.error(err instanceof ApiError ? err.message : 'Could not update pin');
    }
  }, [menuMessage, toast, fetchPinned]);

  // ── Derived: read receipts, typing names, presence ──

  const lastOwnMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.userId === user?.id && !m.pending && !m.failed) return m.id;
    }
    return null;
  }, [messages, user?.id]);

  const seenLabel = useMemo(() => {
    if (!lastOwnMessageId) return '';
    const own = messages.find(m => m.id === lastOwnMessageId);
    if (!own) return '';
    const sentAt = new Date(own.createdAt).getTime();
    const others = members.filter(m => m.userId !== user?.id);
    if (others.length === 0) return '';
    const seenBy = others.filter(m => {
      const at = readState[m.userId];
      return !!at && new Date(at).getTime() >= sentAt;
    });
    if (seenBy.length === 0) return '';
    // A DM has exactly one other member, so a bare "Seen" is unambiguous.
    return others.length === 1 ? 'Seen' : `Seen by ${seenBy.length}`;
  }, [lastOwnMessageId, messages, members, readState, user?.id]);

  const typingNames = useMemo(() => {
    return typingUserIds.map(id => {
      const u = mentionUsers.find(mu => mu.id === id);
      if (!u) return 'Someone';
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
      // First name alone keeps the row short enough to never wrap.
      return (u.firstName || name || u.email || 'Someone') as string;
    });
  }, [typingUserIds, mentionUsers]);

  const dmOtherUserId = useMemo(() => {
    if (channelMeta?.type !== 'dm') return null;
    const ids = channelMeta.dmParticipants || [];
    return ids.find(id => id !== user?.id) || null;
  }, [channelMeta, user?.id]);
  // Never show presence for yourself.
  const dmOtherOnline = !!dmOtherUserId && dmOtherUserId !== user?.id && onlineUserIds.has(dmOtherUserId);

  // ── List data ──
  //
  // Ordering, spelled out because an inverted list makes it easy to get wrong:
  //   1. `messages` is ascending (oldest -> newest).
  //   2. `rows` is built ascending, exactly as the non-inverted list did: a day
  //      divider immediately BEFORE the first message of each day, and the
  //      "Seen" row immediately AFTER my latest delivered message.
  //   3. `rows.reverse()` produces the descending array the inverted list wants.
  //
  // An inverted FlatList renders index 0 at the BOTTOM and increasing indices
  // upward. Reversing therefore maps "immediately before X in ascending order"
  // to "immediately above X on screen", so dividers still head their day and the
  // Seen row still sits under my message. Worked example — ascending
  //   [Div(Mon), M1, M2, Div(Tue), M3]
  // reverses to
  //   [M3, Div(Tue), M2, M1, Div(Mon)]
  // which paints bottom-up as M3, Div(Tue), M2, M1, Div(Mon) — i.e. top-down:
  // Div(Mon), M1, M2, Div(Tue), M3. Correct.
  const listData = useMemo(() => {
    const rows: ListItem[] = [];
    messages.forEach((msg, idx) => {
      const prev = messages[idx - 1];
      const newDay = !prev || !isSameDay(prev.createdAt, msg.createdAt);
      if (newDay) rows.push({ kind: 'divider', id: `divider-${msg.id}`, date: msg.createdAt });
      // Matches the previous logic: a divider between two messages also breaks
      // the sender grouping (the old code tested `'type' in prevMsg`).
      const isFirstFromSender = !prev || newDay || prev.userId !== msg.userId;
      rows.push({ kind: 'message', id: msg.id, msg, isFirstFromSender });
      if (seenLabel && msg.id === lastOwnMessageId) {
        rows.push({ kind: 'seen', id: `seen-${msg.id}`, label: seenLabel });
      }
    });
    rows.reverse();
    return rows;
  }, [messages, seenLabel, lastOwnMessageId]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.kind === 'divider') {
      return (
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.secondary, backgroundColor: colors.bg }]}>
            {formatDateDivider(item.date)}
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>
      );
    }

    if (item.kind === 'seen') {
      return (
        <View style={styles.seenRow}>
          <Ionicons name="checkmark-done" size={12} color={colors.muted} />
          <Text style={[styles.seenText, { color: colors.muted }]}>{item.label}</Text>
        </View>
      );
    }

    const msg = item.msg;
    return (
      <MessageBubble
        msg={msg}
        isMe={msg.userId === user?.id}
        isFirstFromSender={item.isFirstFromSender}
        senderName={getSenderName(msg)}
        reactions={reactionsMap[msg.id] || []}
        currentUserId={user?.id}
        theme={theme}
        onLongPress={openMenu}
        onToggleReaction={toggleReaction}
        onRetry={retrySend}
        onDiscard={discardFailed}
        onPressImage={setViewerAttachment}
      />
    );
  }, [colors.border, colors.secondary, colors.bg, colors.muted, user?.id, reactionsMap, theme, openMenu, toggleReaction, retrySend, discardFailed]);

  // ── Pinned banner ──

  const topPinned = pinnedMessages[0] || null;

  const handlePressPinned = useCallback(() => {
    if (!topPinned) return;
    const idx = listData.findIndex(r => r.kind === 'message' && r.id === topPinned.id);
    if (idx >= 0) {
      haptic.light();
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      return;
    }
    // Not in the loaded window — show the text rather than paging back to it.
    setPinnedPreview(topPinned);
    pinnedSheetRef.current?.present();
  }, [topPinned, listData]);

  const isOwnMenuMessage = !!menuMessage && menuMessage.userId === user?.id;
  const menuReactions = menuMessage ? reactionsMap[menuMessage.id] || [] : [];
  const myRole = members.find(m => m.userId === user?.id)?.role;
  const isChannelAdmin = myRole === 'owner' || myRole === 'admin';
  // Server rule (storage.toggleMessagePin): anyone may pin; only the pinner or
  // an owner/admin may unpin. Hide the action instead of offering a sure 403.
  const canPinMenuMessage =
    !!menuMessage &&
    !menuMessage.pending &&
    !menuMessage.failed &&
    (!menuMessage.isPinned || menuMessage.pinnedByUserId === user?.id || isChannelAdmin);

  const typingVisible = typingNames.length > 0;
  // A DM is never client-facing, whatever the row happens to carry.
  const clientFacingChannel = channelMeta?.type !== 'dm' && !!channelMeta?.isClientFacing;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ThreadHeader
        channelName={channelName}
        isDm={channelMeta?.type === 'dm'}
        showPresence={dmOtherOnline}
        isClientFacing={!!channelMeta?.isClientFacing}
        theme={theme}
        paddingTop={insets.top + 8}
        onBack={() => navigation.goBack()}
      />

      {/* Pinned banner */}
      {topPinned && (
        <PinnedBanner
          message={topPinned}
          count={pinnedMessages.length}
          theme={theme}
          onPress={handlePressPinned}
        />
      )}

      {loading ? (
        <View style={styles.skeletonThread}>
          {([['flex-start', '58%'], ['flex-start', '42%'], ['flex-end', '50%'], ['flex-start', '64%'], ['flex-end', '36%'], ['flex-start', '48%']] as const).map(([side, width], i) => (
            <Skeleton key={i} width={width} height={38} borderRadius={16} style={{ alignSelf: side }} />
          ))}
        </View>
      ) : (
        <View style={styles.listWrap}>
          <FlatList
            ref={flatListRef}
            data={listData}
            inverted
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.messageList}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            // Inverted: the footer renders at the TOP, which is exactly where a
            // "loading older history" spinner belongs. RN un-flips header/footer
            // and the empty component for us.
            ListFooterComponent={
              loadingOlder ? (
                <View style={styles.olderSpinner}>
                  <ActivityIndicator size="small" color={colors.muted} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyThread}>
                <Text style={[styles.emptyThreadText, { color: colors.secondary }]}>
                  No messages yet. Say hello!
                </Text>
              </View>
            }
            // Keeps the viewport steady when a new message is inserted at index
            // 0 (the bottom) while the user is reading history further up.
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScrollToIndexFailed={() => {
              // Target hasn't been measured yet — fall back to the text preview.
              if (topPinned) {
                setPinnedPreview(topPinned);
                pinnedSheetRef.current?.present();
              }
            }}
          />

          <ScrollToBottomPill
            visible={!atBottom || hasNew}
            hasNew={hasNew}
            theme={theme}
            onPress={() => {
              haptic.light();
              scrollToNewest();
            }}
            bottomOffset={typingVisible ? 34 : 12}
          />

          {/* Absolute overlay: showing/hiding it never reflows the list. */}
          <TypingIndicator names={typingNames} theme={theme} />
        </View>
      )}

      {/* Client-facing hint, at the point of consequence: right above the input.
          Safe next to the typing overlay — that overlay is absolutely positioned
          within listWrap, so this sibling row stacks under it, never over it. */}
      {clientFacingChannel && !loading && (
        <View style={[styles.clientHint, { backgroundColor: theme.statusWarningBg }]}>
          <Ionicons name="eye" size={12} color={theme.statusWarning} />
          <Text style={[styles.clientHintText, { color: theme.statusWarning }]} numberOfLines={1}>
            The client can see this channel
          </Text>
        </View>
      )}

      {/* Composer: mention autocomplete + edit bar + staged images + input bar */}
      <MessageComposer
        theme={theme}
        editingMessage={editingMessage}
        mentionUsers={mentionUsers}
        onSend={handleSend}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={cancelEdit}
        onTypingChange={setTyping}
      />

      {/* Long-press message menu */}
      <MessageActionsSheet
        ref={menuSheetRef}
        message={menuMessage}
        reactions={menuReactions}
        currentUserId={user?.id}
        isOwn={isOwnMenuMessage}
        canPin={canPinMenuMessage}
        confirmingDelete={confirmingDelete}
        theme={theme}
        onReact={handleMenuReaction}
        onCopy={handleCopy}
        onEdit={startEdit}
        onTogglePin={handleTogglePin}
        onRequestDelete={() => setConfirmingDelete(true)}
        onConfirmDelete={handleDelete}
        onCancelDelete={() => setConfirmingDelete(false)}
        onDismiss={() => {
          setMenuMessage(null);
          setConfirmingDelete(false);
        }}
      />

      {/* Pinned message preview (when the message isn't in the loaded window) */}
      <Sheet ref={pinnedSheetRef} title="Pinned message" scrollable onDismiss={() => setPinnedPreview(null)}>
        <View style={styles.pinnedSheetBody}>
          {pinnedPreview && (
            <>
              <Text style={[styles.pinnedSheetSender, { color: colors.secondary }]}>
                {getSenderName(pinnedPreview)}
              </Text>
              <MessageContent content={pinnedPreview.content} isOwn={false} theme={theme} />
            </>
          )}
        </View>
      </Sheet>

      {/* Full-screen attachment viewer */}
      <ImageViewerModal attachment={viewerAttachment} onClose={() => setViewerAttachment(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skeletonThread: { flex: 1, paddingHorizontal: 16, paddingTop: 24, gap: 14 },
  listWrap: { flex: 1 },
  messageList: { paddingHorizontal: 12, paddingVertical: 12, gap: 4 },
  olderSpinner: { paddingVertical: 14, alignItems: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontWeight: '500', paddingHorizontal: 8 },
  seenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 1, marginBottom: 2 },
  seenText: { fontSize: 11, fontWeight: '500' },
  emptyThread: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyThreadText: { fontSize: 14 },
  pinnedSheetBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, gap: 6 },
  clientHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  clientHintText: { fontSize: 11, fontWeight: '600' },
  pinnedSheetSender: { fontSize: 12, fontWeight: '600' },
});
