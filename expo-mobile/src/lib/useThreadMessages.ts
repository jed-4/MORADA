import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../services/api';
import { onSocketEvent, emitSocketEvent } from '../services/socket';
import { usePolling } from './usePolling';
import type { Message, MessageAttachment, MessageReaction } from '../components/messages/types';

// The message data layer for MessageThreadScreen: initial load, history
// pagination, the socket feed, and the polling fallback. Extracted so the screen
// can stay focused on actions and rendering.
//
// INVARIANT: `messages` is always ascending (oldest -> newest). Every merge path
// here maintains it — socket/optimistic messages append, older pages prepend —
// and the screen reverses once when building the inverted list's data.

/** History page size. Also the `limit` the poll uses for its recent window. */
export const PAGE_SIZE = 50;

export const byCreatedAsc = (a: Message, b: Message) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

interface Options {
  channelId: string;
  userId?: string;
  isFocused: boolean;
  socketConnected: boolean;
  /** Marks the channel read; called when a message lands while focused. */
  markRead: () => void;
  /**
   * A newer message arrived (socket or poll) after the first load. The screen
   * decides whether to follow it down or raise the "New messages" pill.
   */
  onNewest: (info: { isOwn: boolean }) => void;
}

export function useThreadMessages({
  channelId,
  userId,
  isFocused,
  socketConnected,
  markRead,
  onNewest,
}: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const latestMessageIdRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const loadingOlderRef = useRef(false);
  // Mirrors state for socket callbacks, which capture their closure at
  // subscribe time and would otherwise read stale values.
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const onNewestRef = useRef(onNewest);
  onNewestRef.current = onNewest;
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const fetchMessages = useCallback(async (initial = false) => {
    try {
      const [msgs, reactions] = await Promise.all([
        apiFetch<Message[]>(`/api/channels/${channelId}/messages?limit=${PAGE_SIZE}`),
        apiFetch<Record<string, MessageReaction[]>>(`/api/channels/${channelId}/reactions`).catch(() => null),
      ]);
      const sorted = (msgs || []).sort(byCreatedAsc);
      if (reactions) setReactionsMap(reactions);
      // A short first page means there is no history behind it.
      if (initial) hasMoreRef.current = sorted.length >= PAGE_SIZE;

      setMessages(prev => {
        // Preserve optimistic messages the server doesn't know about yet
        // (in-flight or failed sends), dropping any the server now returns.
        // Image-only temps (empty content) are never matched by content — they
        // are removed by id when their own POST resolves.
        const locals = prev.filter(
          m => (m.pending || m.failed) &&
            !(m.content && sorted.some(s => s.userId === m.userId && s.content === m.content))
        );
        // This request only returns the most recent PAGE_SIZE messages, so any
        // older pages the user has scrolled back through must be retained —
        // otherwise a poll tick would silently discard their loaded history.
        const freshIds = new Set(sorted.map(s => s.id));
        const freshOldest = sorted.length > 0 ? new Date(sorted[0].createdAt).getTime() : Infinity;
        const older = prev.filter(
          m => !m.pending && !m.failed && !freshIds.has(m.id) &&
            new Date(m.createdAt).getTime() < freshOldest
        );
        const next = [...older, ...sorted, ...locals];
        if (!initial && next.length === prev.length && next[next.length - 1]?.id === prev[prev.length - 1]?.id) {
          return prev;
        }
        return next;
      });

      if (sorted.length > 0) {
        const last = sorted[sorted.length - 1];
        if (last.id !== latestMessageIdRef.current) {
          const firstLoad = latestMessageIdRef.current === null;
          latestMessageIdRef.current = last.id;
          // Inverted lists already sit at the newest, so there is no initial
          // scroll to choreograph — only the "you're reading history" case.
          if (!initial && !firstLoad) onNewestRef.current({ isOwn: last.userId === userId });
        }
      }
    } catch {
      // silently fail on poll
    } finally {
      if (initial) setLoading(false);
    }
  }, [channelId, userId]);

  // Older history. On an inverted list onEndReached fires when the user scrolls
  // UP past the oldest loaded message. The server's `before` param takes a
  // message ID (storage.getMessages resolves its created_at via subquery) and
  // returns the page ascending.
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current.find(m => !m.pending && !m.failed);
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await apiFetch<Message[]>(
        `/api/channels/${channelId}/messages?limit=${PAGE_SIZE}&before=${oldest.id}`
      );
      const sorted = (page || []).sort(byCreatedAsc);
      // A short page means we've reached the start of the channel.
      if (sorted.length < PAGE_SIZE) hasMoreRef.current = false;
      if (sorted.length > 0) {
        setMessages(prev => {
          const existing = new Set(prev.map(m => m.id));
          const add = sorted.filter(m => !existing.has(m.id));
          if (add.length === 0) return prev;
          // Older messages are ascending and all predate `prev` — prepend.
          return [...add, ...prev];
        });
      }
    } catch {
      // silent — scrolling up again retries
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [channelId]);

  const upsertMessage = useCallback((incoming: Message) => {
    setMessages(prev => {
      if (prev.some(m => m.id === incoming.id)) return prev;
      // Replace a matching optimistic temp (same sender + content) if present.
      const tempIdx = prev.findIndex(
        m => m.pending && m.userId === incoming.userId && !!m.content && m.content === incoming.content
      );
      if (tempIdx >= 0) {
        const next = [...prev];
        next[tempIdx] = incoming;
        return next;
      }
      // Socket messages are newer than everything loaded — append (ascending).
      return [...prev, incoming];
    });
  }, []);

  // The server only relays typing events from sockets already in the channel
  // room (socketManager.ts guards on socket.rooms). Connect auto-joins every
  // channel the user belongs to, but a channel created after connect wouldn't
  // be — this join is idempotent and closes that gap.
  useEffect(() => {
    if (!socketConnected) return;
    emitSocketEvent('join_channel', channelId);
  }, [socketConnected, channelId]);

  // Real-time delivery. While the socket is connected the poll is only a 60s
  // safety net; when it drops, polling returns to 5s. (usePolling skips
  // overlapping ticks and pauses while backgrounded.)
  usePolling(() => fetchMessages(false), socketConnected ? 60000 : 5000, isFocused);

  useEffect(() => {
    const unsubNew = onSocketEvent('new_message', (msg: Message) => {
      if (!msg || msg.channelId !== channelId) return;
      upsertMessage(msg);
      latestMessageIdRef.current = msg.id;
      if (isFocusedRef.current) markReadRef.current();
      onNewestRef.current({ isOwn: msg.userId === userId });
    });
    const unsubUpdated = onSocketEvent('message_updated', (msg: Message) => {
      if (!msg || msg.channelId !== channelId) return;
      setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, ...msg } : m)));
    });
    // Live reactions: server emits { messageId, reactions } to the channel room
    // (server/socketManager.ts emitReactionUpdated).
    const unsubReactions = onSocketEvent('reaction_updated', (payload: { messageId?: string; reactions?: MessageReaction[] }) => {
      if (!payload?.messageId || !Array.isArray(payload.reactions)) return;
      setReactionsMap(prev => ({ ...prev, [payload.messageId!]: payload.reactions! }));
    });
    const unsubAttachments = onSocketEvent('message_attachments_updated', (payload: { messageId?: string; attachment?: MessageAttachment }) => {
      if (!payload?.messageId || !payload.attachment) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== payload.messageId) return m;
        const existing = m.attachments || [];
        if (existing.some(a => a.id === payload.attachment!.id)) return m;
        return { ...m, attachments: [...existing, payload.attachment!] };
      }));
    });
    return () => {
      unsubNew();
      unsubUpdated();
      unsubReactions();
      unsubAttachments();
    };
  }, [channelId, upsertMessage, userId]);

  return {
    messages,
    setMessages,
    reactionsMap,
    setReactionsMap,
    loading,
    loadingOlder,
    loadOlder,
    fetchMessages,
  };
}
