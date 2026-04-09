import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSocket, useChannelMessages, useTypingIndicator, useAllNewMessages, useReactionUpdated, useMessageUpdated } from "@/lib/socket";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hash, Plus, Send, Loader2, Sparkles, MoreVertical, Bell, BellOff, Lock, Eye, Settings, User, Pin, PinOff, Filter, EyeOff, Clock, Trash2, ThumbsUp, Check, Heart, Smile, Flame, MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import type { Channel, Message, ChannelMember, MessageReaction } from "@shared/schema";

// Fixed reaction set — icon-based (no emoji per design guidelines)
const REACTION_OPTIONS = [
  { id: "thumbs_up", Icon: ThumbsUp, label: "Thumbs up" },
  { id: "check",     Icon: Check,    label: "Got it" },
  { id: "eyes",      Icon: Eye,      label: "Looking" },
  { id: "heart",     Icon: Heart,    label: "Love" },
  { id: "smile",     Icon: Smile,    label: "Haha" },
  { id: "fire",      Icon: Flame,    label: "Fire" },
] as const;

type ReactionId = typeof REACTION_OPTIONS[number]["id"];

function ReactionIcon({ id, className }: { id: string; className?: string }) {
  const opt = REACTION_OPTIONS.find(r => r.id === id);
  if (!opt) return null;
  const { Icon } = opt;
  return <Icon className={className} />;
}

// Extended channel type with isPinned, lastMessageAt, and messageCount from API
interface ChannelWithMeta extends Channel {
  isPinned?: boolean;
  lastMessageAt?: Date | string | null;
  messageCount?: number;
}
import {
  initFavicon,
  updateFaviconBadge,
  showMessageNotification,
  isNotificationSupported,
  requestNotificationPermission,
  areNotificationsGranted,
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";

// Helper to parse and render mentions in messages
function renderMessageWithMentions(content: string, currentUserId?: string) {
  const mentionRegex = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }
    
    const name = match[1];
    const userId = match[2];
    const isCurrentUser = userId === currentUserId;
    
    parts.push(
      <span 
        key={match.index}
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
          isCurrentUser 
            ? 'bg-primary/20 text-primary border border-primary/20' 
            : 'bg-muted/60 text-foreground'
        }`}
        data-testid={`mention-${userId}`}
      >
        @{name}
      </span>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : content;
}

interface MessagesProps {
  channelTypeFilter?: "channel" | "dm" | "all";
  projectId?: string;
}

// Stable empty-collection constants so inline `= []` / `= {}` defaults
// don't create a new reference on every render (which would make any
// useEffect that lists them as deps fire on every single render,
// causing infinite setState → "Maximum update depth exceeded" crashes).
const EMPTY_MESSAGES: Message[] = [];
const EMPTY_CHANNELS: ChannelWithMeta[] = [];
const EMPTY_UNREAD: Record<string, number> = {};
const EMPTY_USERS: any[] = [];

export default function Messages({ channelTypeFilter = "all", projectId }: MessagesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { socket, isConnected, isReconnecting, joinChannel, leaveChannel, startTyping, stopTyping, markAsRead } = useSocket();

  // Keep stable refs for socket functions so the channel-join useEffect
  // doesn't have joinChannel/leaveChannel/markAsRead as deps — those change
  // identity whenever the socket reconnects and would cause the effect to
  // loop infinitely under rapid connect→disconnect cycles.
  const joinChannelRef = useRef(joinChannel);
  const leaveChannelRef = useRef(leaveChannel);
  const markAsReadRef = useRef(markAsRead);
  // Also track selectedChannelId in a ref so the auto-select effect doesn't
  // include it as a dep (setSelectedChannelId inside that effect would otherwise
  // trigger a re-run and risk an infinite loop).
  const selectedChannelIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    joinChannelRef.current = joinChannel;
    leaveChannelRef.current = leaveChannel;
    markAsReadRef.current = markAsRead;
    selectedChannelIdRef.current = selectedChannelId;
  });
  
  useEffect(() => {
    document.title = "BuildPro";
  }, []);

  // Read ?channel= URL param on mount to support navigation from dropdown/notifications
  const channelFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("channel");
  }, []);
  
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(channelFromUrl);
  const [messageInput, setMessageInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [isClientFacing, setIsClientFacing] = useState(false);
  
  const [isCreateDmOpen, setIsCreateDmOpen] = useState(false);
  const [selectedDmUserId, setSelectedDmUserId] = useState<string>("");
  
  const [isChannelPanelOpen, setIsChannelPanelOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [channelRenameValue, setChannelRenameValue] = useState("");
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(getNotificationPreferences);

  useEffect(() => {
    if (isChannelPanelOpen) setNotifPrefs(getNotificationPreferences());
  }, [isChannelPanelOpen]);

  const updateNotifPref = (key: keyof NotificationPreferences, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    saveNotificationPreferences(updated);
  };
  
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [pendingMentions, setPendingMentions] = useState<{ name: string; userId: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reactions: messageId -> reactions array
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  // Open reply threads: Set of parent messageIds whose thread is expanded
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());
  // Thread replies: messageId -> array of reply messages
  const [threadMessages, setThreadMessages] = useState<Record<string, Message[]>>({});
  // Thread reply inputs: messageId -> text
  const [threadInputs, setThreadInputs] = useState<Record<string, string>>({});
  // Which threads are currently sending
  const [sendingThreads, setSendingThreads] = useState<Set<string>>(new Set());
  // Which thread is loading replies
  const [loadingThreads, setLoadingThreads] = useState<Set<string>>(new Set());
  // Reaction picker open state: messageId or null
  const [reactionPickerOpen, setReactionPickerOpen] = useState<string | null>(null);
  
  // Channel filter settings (persisted in localStorage)
  const [hideEmptyChats, setHideEmptyChats] = useState(() => {
    return localStorage.getItem("messages-hide-empty") === "true";
  });
  const [hideInactiveChats, setHideInactiveChats] = useState(() => {
    return localStorage.getItem("messages-hide-inactive") === "true";
  });
  const [inactiveDaysThreshold, setInactiveDaysThreshold] = useState(() => {
    return parseInt(localStorage.getItem("messages-inactive-days") || "30", 10);
  });
  const [showFilterSettings, setShowFilterSettings] = useState(false);

  // Build query params for channel filtering
  const channelQueryParams = new URLSearchParams();
  if (channelTypeFilter !== "all") {
    channelQueryParams.append("type", channelTypeFilter);
  }
  if (projectId) {
    channelQueryParams.append("projectId", projectId);
  }
  const channelQueryString = channelQueryParams.toString();

  const { data: channels = EMPTY_CHANNELS, isLoading: channelsLoading } = useQuery<ChannelWithMeta[]>({
    queryKey: ["/api/channels", channelQueryString],
    queryFn: async () => {
      const url = `/api/channels${channelQueryString ? `?${channelQueryString}` : ''}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch channels");
      return response.json();
    },
  });

  // Fetch unread counts - must be before filteredChannels useMemo
  const { data: unreadCounts = EMPTY_UNREAD, isLoading: unreadLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
  });

  // Persist filter settings to localStorage
  useEffect(() => {
    localStorage.setItem("messages-hide-empty", String(hideEmptyChats));
  }, [hideEmptyChats]);

  useEffect(() => {
    localStorage.setItem("messages-hide-inactive", String(hideInactiveChats));
  }, [hideInactiveChats]);

  useEffect(() => {
    localStorage.setItem("messages-inactive-days", String(inactiveDaysThreshold));
  }, [inactiveDaysThreshold]);

  // Filter channels based on settings
  const filteredChannels = useMemo(() => {
    let result = [...channels];
    
    // Hide empty chats (no messages), but always keep the currently selected channel visible
    if (hideEmptyChats) {
      result = result.filter(channel => (channel.messageCount || 0) > 0 || channel.id === selectedChannelId);
    }
    
    // Hide inactive chats (no activity in X days)
    if (hideInactiveChats) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - inactiveDaysThreshold);
      
      result = result.filter(channel => {
        // Always show pinned channels
        if (channel.isPinned) return true;
        // Always show channels with unread messages
        if (unreadCounts[channel.id] > 0) return true;
        // Always show the currently selected channel
        if (channel.id === selectedChannelId) return true;
        // Filter by last message date
        if (!channel.lastMessageAt) return false;
        const lastMessageDate = new Date(channel.lastMessageAt);
        return lastMessageDate >= thresholdDate;
      });
    }
    
    return result;
  }, [channels, hideEmptyChats, hideInactiveChats, inactiveDaysThreshold, unreadCounts, selectedChannelId]);

  // Pin/unpin channel mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({ channelId, isPinned }: { channelId: string; isPinned: boolean }) => {
      const response = await fetch(`/api/channels/${channelId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned }),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to toggle pin");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    }
  });

  const { data: messages = EMPTY_MESSAGES, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/channels", selectedChannelId, "messages"],
    enabled: !!selectedChannelId,
  });

  const { data: channelMembers = [] } = useQuery<ChannelMember[]>({
    queryKey: ["/api/channels", selectedChannelId, "members"],
    enabled: !!selectedChannelId && isChannelPanelOpen,
  });

  useEffect(() => {
    // Only top-level messages (no threadParentId) go into the main feed
    setLocalMessages(messages.filter((m: Message) => !m.threadParentId));
  }, [messages]);

  useChannelMessages(selectedChannelId, (message) => {
    if (message.threadParentId) {
      // This is a threaded reply — route into the thread list if the thread is open
      let isNewToThread = false;
      setThreadMessages(prev => {
        if (!prev[message.threadParentId!]) return prev; // thread not loaded; skip
        if (prev[message.threadParentId!].some(r => r.id === message.id)) return prev;
        isNewToThread = true;
        return { ...prev, [message.threadParentId!]: [...prev[message.threadParentId!], message] };
      });
      // Bump threadCount on the parent only if it wasn't already in the thread list
      // (avoids double-counting when the sender's own REST response already updated it)
      if (isNewToThread) {
        setLocalMessages(prev => prev.map(m =>
          m.id === message.threadParentId
            ? { ...m, threadCount: (m.threadCount || 0) + 1 }
            : m
        ));
      }
      return;
    }
    setLocalMessages(prev => {
      // Deduplicate: skip if this real ID is already in the list
      // (can happen when sender receives their own REST-sent message via socket)
      if (prev.some(m => m.id === message.id)) return prev;
      return [...prev, message];
    });
    scrollToBottom();
    
    if (selectedChannelId) {
      markAsRead(selectedChannelId);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      }, 100);
    }
  });

  const typingUserIds = useTypingIndicator(selectedChannelId);

  const { data: allUsers = EMPTY_USERS } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Bulk-load reactions for all messages in the selected channel
  const { data: channelReactionsData } = useQuery<Record<string, MessageReaction[]>>({
    queryKey: ["/api/channels", selectedChannelId, "reactions"],
    queryFn: async () => {
      const res = await fetch(`/api/channels/${selectedChannelId}/reactions`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!selectedChannelId,
  });

  // Sync bulk reactions into local map when query data arrives
  useEffect(() => {
    if (channelReactionsData) {
      setReactionsMap(prev => ({ ...prev, ...channelReactionsData }));
    }
  }, [channelReactionsData]);

  // Also reset reactions when switching channels
  useEffect(() => {
    setReactionsMap({});
    setOpenThreads(new Set());
    setThreadMessages({});
    setThreadInputs({});
  }, [selectedChannelId]);

  // Real-time reaction updates from other users
  useReactionUpdated((messageId, reactions) => {
    setReactionsMap(prev => ({ ...prev, [messageId]: reactions }));
  });

  // Real-time message_updated (e.g. threadCount incremented after a reply)
  useMessageUpdated(selectedChannelId, (updated) => {
    setLocalMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
    // Also update thread messages if the updated message is a thread parent
    setThreadMessages(prev => {
      const updated2: Record<string, Message[]> = {};
      for (const [parentId, replies] of Object.entries(prev)) {
        updated2[parentId] = replies.map(r => r.id === updated.id ? updated : r);
      }
      return updated2;
    });
  });

  // Load replies for a thread
  const loadThreadReplies = useCallback(async (messageId: string) => {
    setLoadingThreads(prev => new Set(prev).add(messageId));
    try {
      const res = await fetch(`/api/messages/${messageId}/replies`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const replies: Message[] = await res.json();
      setThreadMessages(prev => ({ ...prev, [messageId]: replies }));
    } catch {
      // silent — thread stays closed
    } finally {
      setLoadingThreads(prev => { const next = new Set(prev); next.delete(messageId); return next; });
    }
  }, []);

  const toggleThread = useCallback((messageId: string) => {
    setOpenThreads(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
        if (!threadMessages[messageId]) {
          loadThreadReplies(messageId);
        }
      }
      return next;
    });
  }, [threadMessages, loadThreadReplies]);

  const sendReply = useCallback(async (parentMessageId: string, channelId: string) => {
    const content = (threadInputs[parentMessageId] || "").trim();
    if (!content) return;
    setSendingThreads(prev => new Set(prev).add(parentMessageId));
    setThreadInputs(prev => ({ ...prev, [parentMessageId]: "" }));
    try {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, threadParentId: parentMessageId }),
      });
      if (!res.ok) throw new Error("Failed");
      const reply: Message = await res.json();
      setThreadMessages(prev => ({
        ...prev,
        [parentMessageId]: [...(prev[parentMessageId] || []), reply],
      }));
      // Increment threadCount on the local parent message
      setLocalMessages(prev => prev.map(m =>
        m.id === parentMessageId ? { ...m, threadCount: (m.threadCount || 0) + 1 } : m
      ));
    } catch {
      setThreadInputs(prev => ({ ...prev, [parentMessageId]: content }));
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setSendingThreads(prev => { const next = new Set(prev); next.delete(parentMessageId); return next; });
    }
  }, [threadInputs, toast]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    // Optimistic update
    const currentReactions = reactionsMap[messageId] || [];
    const myReaction = currentReactions.find(r => r.userId === user?.id && r.emoji === emoji);
    if (myReaction) {
      setReactionsMap(prev => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter(r => !(r.userId === user?.id && r.emoji === emoji)),
      }));
    } else {
      const optimistic: MessageReaction = {
        id: `opt-${Date.now()}`,
        messageId,
        userId: user?.id || "",
        emoji,
        userFirstName: user?.firstName || null,
        userLastName: user?.lastName || null,
        createdAt: new Date(),
      };
      setReactionsMap(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), optimistic],
      }));
    }
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("Failed");
      const { reactions }: { reactions: MessageReaction[] } = await res.json();
      setReactionsMap(prev => ({ ...prev, [messageId]: reactions }));
    } catch {
      // Revert optimistic update on failure
      setReactionsMap(prev => ({ ...prev, [messageId]: currentReactions }));
    }
  }, [reactionsMap, user]);

  useEffect(() => {
    if (!selectedChannelId || !socket) return;

    // Join immediately if already connected; otherwise the "connect" listener below handles it.
    const doJoin = () => {
      joinChannelRef.current(selectedChannelId);
      markAsReadRef.current(selectedChannelId);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      }, 100);
    };

    if (socket.connected) {
      doJoin();
    }

    // Re-join after every reconnect (socket.io fires "connect" on initial connect
    // AND after reconnects, so this handles both cases).
    socket.on("connect", doJoin);

    return () => {
      socket.off("connect", doJoin);
      leaveChannelRef.current(selectedChannelId);
    };
  // socket changes only when the user changes (new Socket instance created).
  // isConnected is intentionally omitted — the socket "connect" event handles
  // reconnection without causing a React state cascade.
  }, [selectedChannelId, socket]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [localMessages]);

  useEffect(() => {
    initFavicon();
    
    if (isNotificationSupported()) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "default") {
        setShowNotificationBanner(true);
      }
    }
  }, []);

  useEffect(() => {
    const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
    updateFaviconBadge(totalUnread);
  }, [unreadCounts]);

  useAllNewMessages((message: Message) => {
    queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
    
    if (message.userId === user?.id) return;
    if (selectedChannelId === message.channelId) return;
    
    const channel = channels.find(c => c.id === message.channelId);
    if (!channel) return;
    
    setNewMessageIds(prev => new Set(prev).add(message.id));
    
    const mentions = Array.isArray(message.mentions) ? message.mentions : [];
    const isMention = mentions.includes(user?.id || "");
    
    const senderName = message.userFirstName && message.userLastName
      ? `${message.userFirstName} ${message.userLastName}`
      : message.userEmail || "Someone";
    
    showMessageNotification({
      channelName: channel.name,
      senderName,
      messageContent: message.content,
      isMention,
      onClickChannel: () => {
        setSelectedChannelId(channel.id);
        window.focus();
      },
    });
  });

  const handleRequestNotificationPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      setShowNotificationBanner(false);
    }
  };

  const createChannelMutation = useMutation({
    mutationFn: async ({ name, isClientFacing }: { name: string; isClientFacing: boolean }) => {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "channel", isClientFacing }),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to create channel");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    }
  });

  const createDmMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user?.id) throw new Error("User not found");
      
      // Generate DM name from user IDs (sorted for consistency)
      const userIds = [user.id, otherUserId].sort();
      const dmName = `dm-${userIds.join('-')}`;
      
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: dmName,
          type: "dm",
          dmParticipants: userIds,
        }),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to create DM");
      return response.json();
    },
    onSuccess: (newChannel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setSelectedChannelId(newChannel.id);
    }
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      setSelectedChannelId(null);
      setIsChannelPanelOpen(false);
      setIsDeleteConfirmOpen(false);
    }
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ channelId, userId }: { channelId: string; userId: string }) => {
      const response = await fetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: "member" }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to add member");
      return response.json();
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", channelId, "members"] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ channelId, userId }: { channelId: string; userId: string }) => {
      const response = await fetch(`/api/channels/${channelId}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to remove member");
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", channelId, "members"] });
    },
  });

  const renameChannelMutation = useMutation({
    mutationFn: async ({ channelId, name }: { channelId: string; name: string }) => {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to rename channel");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    },
  });

  const seedSampleDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/channels/seed-sample", {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to seed sample data");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
    }
  });

  const handleMessageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessageInput(value);

    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtPos !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtPos + 1);
      const isValidPosition = lastAtPos === 0 || value[lastAtPos - 1] === ' ';
      const isValidSearch = /^[a-zA-Z0-9]*$/.test(textAfterAt);
      
      if (isValidPosition && isValidSearch) {
        setShowMentionPicker(true);
        setMentionSearch(textAfterAt.toLowerCase());
        setMentionStartPos(lastAtPos);
      } else {
        setShowMentionPicker(false);
      }
    } else {
      setShowMentionPicker(false);
    }

    if (!selectedChannelId) return;

    if (value.trim() && !typingTimeoutRef.current) {
      startTyping(selectedChannelId);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (value.trim()) {
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(selectedChannelId);
        typingTimeoutRef.current = null;
      }, 2000);
    } else {
      stopTyping(selectedChannelId);
      typingTimeoutRef.current = null;
    }
  };
  
  const insertMention = (userId: string, firstName: string | null, lastName: string | null, email: string | null) => {
    const name = firstName && lastName
      ? `${firstName} ${lastName}`
      : email || 'Unknown';

    const beforeMention = messageInput.substring(0, mentionStartPos);
    const afterMention = messageInput.substring(inputRef.current?.selectionStart || messageInput.length);

    setMessageInput(beforeMention + `@${name} ` + afterMention);
    setPendingMentions(prev => [...prev, { name, userId }]);
    setShowMentionPicker(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const sendViaRest = async (channelId: string, content: string, mentions: string[] = []) => {
    const response = await fetch(`/api/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content, mentions }),
    });
    if (!response.ok) throw new Error("Failed to send message");
    return response.json() as Promise<Message>;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannelId || isSending) return;

    stopTyping(selectedChannelId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Save display value so we can restore it if send fails
    const originalInput = messageInput;

    // Convert display-format @Name back to storage format @[Name](userId:xxx).
    // Sort by descending name length first to avoid prefix-collision (e.g. @Ann vs @Anna).
    let content = messageInput;
    const mentionIds: string[] = [];
    const sortedMentions = [...pendingMentions].sort((a, b) => b.name.length - a.name.length);
    for (const m of sortedMentions) {
      // Escape any regex special characters in the name, then match @Name at a word boundary
      // (followed by whitespace, end-of-string, or a non-word character) to avoid partial matches.
      const escapedName = m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tokenRegex = new RegExp(`@${escapedName}(?=\\s|$|[^\\w])`, "g");
      if (tokenRegex.test(content)) {
        content = content.replace(
          new RegExp(`@${escapedName}(?=\\s|$|[^\\w])`, "g"),
          `@[${m.name}](userId:${m.userId})`
        );
        mentionIds.push(m.userId);
      }
    }
    // Also parse any pre-existing @[Name](userId:xxx) tokens (e.g. restored after send failure)
    const mentionRegex = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      if (!mentionIds.includes(match[2])) mentionIds.push(match[2]);
    }
    const mentions = mentionIds;

    setMessageInput("");
    setShowMentionPicker(false);
    setIsSending(true);

    // Optimistically add the message so the sender sees it immediately
    const tempId = `temp-${Date.now()}`;
    const now = new Date();
    const optimistic: Message = {
      id: tempId,
      channelId: selectedChannelId,
      userId: user!.id,
      content,
      mentions,
      threadParentId: null,
      threadCount: 0,
      hasCommand: content.startsWith('/'),
      commandType: content.startsWith('/') ? content.split(' ')[0].substring(1) : null,
      isEdited: false,
      isDeleted: false,
      userFirstName: user!.firstName || null,
      userLastName: user!.lastName || null,
      userEmail: user!.email || null,
      createdAt: now,
      updatedAt: now,
    };
    setLocalMessages(prev => [...prev, optimistic]);
    scrollToBottom();

    try {
      const saved = await sendViaRest(selectedChannelId, content, mentions);
      // Remove the temp placeholder; if socket already delivered the real message, don't add a dup
      setLocalMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempId);
        if (withoutTemp.some(m => m.id === saved.id)) return withoutTemp;
        return [...withoutTemp, saved];
      });
      // Mentions consumed — clear tracking
      setPendingMentions([]);
      // Mark as read since we just sent
      markAsRead(selectedChannelId);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      }, 100);
    } catch (err) {
      // Remove optimistic message, restore original display input AND pending mentions
      setLocalMessages(prev => prev.filter(m => m.id !== tempId));
      setMessageInput(originalInput);
      setPendingMentions(pendingMentions);
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string | null) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  // Get DM display name - shows other participant's name
  const getDmDisplayName = (channel: Channel) => {
    if (channel.type !== "dm" || !channel.dmParticipants) return channel.name;
    
    const otherUserId = (channel.dmParticipants as string[]).find(id => id !== user?.id);
    if (!otherUserId) return channel.name;
    
    const otherUser = allUsers.find((u: any) => u.id === otherUserId);
    if (!otherUser) return channel.name;
    
    return otherUser.firstName && otherUser.lastName 
      ? `${otherUser.firstName} ${otherUser.lastName}` 
      : otherUser.email || channel.name;
  };

  useEffect(() => {
    if (channels.length === 0) return;
    // Use the ref (kept current by useLayoutEffect) instead of the state value
    // directly, so this effect doesn't list selectedChannelId as a dep.
    // Listing it would mean setSelectedChannelId() triggers a re-run which
    // calls setSelectedChannelId() again — a self-feeding loop.
    const currentId = selectedChannelIdRef.current;
    if (!currentId) {
      // No channel selected — auto-select first available
      setSelectedChannelId(channels[0].id);
    } else if (!channels.find(c => c.id === currentId)) {
      // Previously selected channel is no longer accessible — fall back to first
      setSelectedChannelId(channels[0].id);
    }
  }, [channels]);

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  const filteredMentionUsers = useMemo(() => allUsers.filter((u: any) => {
    if (!mentionSearch) return true;
    const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
    return fullName.includes(mentionSearch) || (u.email || '').toLowerCase().includes(mentionSearch);
  }), [allUsers, mentionSearch]);

  const typingUsers = (Array.isArray(typingUserIds) ? typingUserIds : [])
    .map((id: string) => allUsers.find((u: any) => u.id === id))
    .filter(Boolean)
    .map((u: any) => u.firstName || u.email || 'Someone');

  return (
    <div className="h-full flex flex-col">
      {/* Notification Banner */}
      {showNotificationBanner && isNotificationSupported() && notificationPermission === "default" && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-primary/10" data-testid="notification-banner">
          <Bell className="h-4 w-4 text-primary" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-sm">Enable notifications to get alerts for new messages and @mentions</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleRequestNotificationPermission}
                data-testid="button-enable-notifications"
              >
                Enable Notifications
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowNotificationBanner(false)}
                data-testid="button-dismiss-banner"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar - Channels List */}
        <div className="w-60 border-r flex flex-col bg-muted/20">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channels</span>
            <div className="flex items-center gap-1">
              <Popover open={showFilterSettings} onOpenChange={setShowFilterSettings}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-6 w-6 p-0 ${(hideEmptyChats || hideInactiveChats) ? 'text-primary' : ''}`}
                    title="Filter settings"
                    data-testid="button-filter-settings"
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Filter Channels</h4>
                      <p className="text-xs text-muted-foreground">
                        Control which conversations appear in the list
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="hide-empty" className="text-sm">Hide empty chats</Label>
                        </div>
                        <Switch
                          id="hide-empty"
                          checked={hideEmptyChats}
                          onCheckedChange={setHideEmptyChats}
                          data-testid="switch-hide-empty"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="hide-inactive" className="text-sm">Auto-hide inactive</Label>
                        </div>
                        <Switch
                          id="hide-inactive"
                          checked={hideInactiveChats}
                          onCheckedChange={setHideInactiveChats}
                          data-testid="switch-hide-inactive"
                        />
                      </div>
                      {hideInactiveChats && (
                        <div className="pl-6 space-y-2">
                          <Label htmlFor="inactive-days" className="text-xs text-muted-foreground">
                            Hide after days of inactivity
                          </Label>
                          <Select
                            value={String(inactiveDaysThreshold)}
                            onValueChange={(val) => setInactiveDaysThreshold(parseInt(val, 10))}
                          >
                            <SelectTrigger className="h-8" data-testid="select-inactive-days">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="7">7 days</SelectItem>
                              <SelectItem value="14">14 days</SelectItem>
                              <SelectItem value="30">30 days</SelectItem>
                              <SelectItem value="60">60 days</SelectItem>
                              <SelectItem value="90">90 days</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Pinned and unread chats always remain visible
                          </p>
                        </div>
                      )}
                    </div>
                    {(hideEmptyChats || hideInactiveChats) && channels.length !== filteredChannels.length && (
                      <p className="text-xs text-muted-foreground border-t pt-2">
                        Showing {filteredChannels.length} of {channels.length} channels
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => seedSampleDataMutation.mutate()}
                disabled={seedSampleDataMutation.isPending || channels.length > 0}
                title="Load sample channels"
                data-testid="button-seed-sample"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => channelTypeFilter === "dm" ? setIsCreateDmOpen(true) : setIsCreateChannelOpen(true)}
                data-testid="button-new-channel"
                title={channelTypeFilter === "dm" ? "Start DM" : "Create Channel"}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {channelsLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground p-4">
                  {channels.length > 0 
                    ? "All channels are hidden by filters" 
                    : channelTypeFilter === "dm" ? "No direct messages yet" : channelTypeFilter === "channel" ? "No channels yet" : "No channels yet"}
                </div>
              ) : (
                filteredChannels.map((channel) => {
                  const unreadCount = unreadCounts[channel.id] || 0;
                  const isActive = selectedChannelId === channel.id;
                  const isPinned = channel.isPinned || false;
                  
                  return (
                    <div
                      key={channel.id}
                      className={`
                        group w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm
                        transition-all cursor-pointer
                        ${isActive 
                          ? 'bg-primary/20 text-primary font-semibold ring-1 ring-primary/50' 
                          : 'hover-elevate text-foreground'
                        }
                      `}
                      onClick={() => setSelectedChannelId(channel.id)}
                      data-testid={`channel-${channel.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isPinned && (
                          <Pin className="h-3 w-3 shrink-0 text-primary rotate-45" />
                        )}
                        {channel.type === "dm" ? (
                          <User className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : channel.isClientFacing ? (
                          <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{getDmDisplayName(channel)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {unreadCount > 0 && !isActive && (
                          <Badge variant="default" className="h-4 text-[10px] px-1.5" data-testid={`unread-${channel.id}`}>
                            {unreadCount}
                          </Badge>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinMutation.mutate({ channelId: channel.id, isPinned: !isPinned });
                          }}
                          className={`
                            p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity
                            ${isPinned 
                              ? 'text-primary hover:bg-primary/10' 
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                            }
                          `}
                          title={isPinned ? "Unpin conversation" : "Pin conversation"}
                          data-testid={`pin-${channel.id}`}
                        >
                          {isPinned ? (
                            <PinOff className="h-3.5 w-3.5" />
                          ) : (
                            <Pin className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Panel - Messages */}
        <div className="flex-1 flex flex-col">
          {selectedChannel ? (
            <>
              {/* Channel Header - aligned with conversation panel */}
              <div className="shrink-0 h-11 px-4 flex items-center justify-between border-b bg-background">
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-base font-semibold truncate">{selectedChannel.name}</span>
                  {selectedChannel.isClientFacing && (
                    <Badge variant="secondary" className="h-5 text-[10px] shrink-0">
                      <Eye className="h-3 w-3 mr-1" />
                      Client
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : isReconnecting ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
                    <span>{isConnected ? 'Connected' : isReconnecting ? 'Reconnecting…' : 'Disconnected'}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setChannelRenameValue(selectedChannel?.name ?? "");
                      setIsDeleteConfirmOpen(false);
                      setIsChannelPanelOpen(true);
                    }}
                    data-testid="button-channel-settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* Messages Area */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-4xl">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : localMessages.length === 0 ? (
                    <div className="text-center p-8">
                      <Hash className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    localMessages.map((message) => {
                      const isOwn = message.userId === user?.id;
                      const isBot = message.isBot;
                      const isHighlighted = newMessageIds.has(message.id);
                      const msgReactions = reactionsMap[message.id] || [];
                      const threadOpen = openThreads.has(message.id);
                      const threadCount = message.threadCount || 0;

                      // Group reactions by emoji id
                      const reactionGroups: Record<string, { count: number; myReaction: boolean; users: string[] }> = {};
                      for (const r of msgReactions) {
                        if (!reactionGroups[r.emoji]) {
                          reactionGroups[r.emoji] = { count: 0, myReaction: false, users: [] };
                        }
                        reactionGroups[r.emoji].count++;
                        if (r.userId === user?.id) reactionGroups[r.emoji].myReaction = true;
                        const name = r.userFirstName && r.userLastName
                          ? `${r.userFirstName} ${r.userLastName}`
                          : r.userId;
                        reactionGroups[r.emoji].users.push(name);
                      }
                      
                      return (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'animate-pulse' : ''} group/msg`}
                          data-testid={`message-${message.id}`}
                        >
                          {!isOwn && !isBot && (
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="text-xs bg-muted/60">
                                {getInitials(message.userFirstName, message.userLastName, message.userEmail)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          {isBot && (
                            <div className="h-8 w-8 shrink-0 rounded-full bg-primary flex items-center justify-center">
                              <Sparkles className="h-4 w-4 text-white" />
                            </div>
                          )}
                          <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                            {!isOwn && (
                              <span className="text-xs font-medium text-foreground">
                                {message.userFirstName && message.userLastName
                                  ? `${message.userFirstName} ${message.userLastName}`
                                  : message.userEmail || 'Unknown'}
                              </span>
                            )}

                            {/* Message bubble + hover toolbar */}
                            <div className="relative">
                              <div
                                className={`
                                  px-3 py-2 rounded-xl text-sm
                                  ${isOwn 
                                    ? 'bg-primary/10 text-foreground border border-primary/20' 
                                    : isBot
                                      ? 'bg-primary/5 text-foreground border border-primary/20'
                                      : 'bg-muted/30 text-foreground'
                                  }
                                `}
                              >
                                <div className="break-words whitespace-pre-wrap">
                                  {renderMessageWithMentions(message.content, user?.id)}
                                </div>
                              </div>

                              {/* Hover toolbar — visibility toggled (no layout shift) */}
                              <div
                                className={`
                                  absolute top-1/2 -translate-y-1/2 flex items-center gap-0.5
                                  bg-background border rounded-lg shadow-sm p-0.5 z-10
                                  invisible group-hover/msg:visible
                                  ${isOwn ? 'right-full mr-2' : 'left-full ml-2'}
                                `}
                              >
                                {/* Single reaction picker trigger */}
                                <Popover
                                  open={reactionPickerOpen === message.id}
                                  onOpenChange={(open) => setReactionPickerOpen(open ? message.id : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      title="Add reaction"
                                      className="p-1 rounded hover-elevate text-muted-foreground"
                                    >
                                      <Smile className="h-3.5 w-3.5" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-auto p-1.5"
                                    side={isOwn ? "left" : "right"}
                                    align="center"
                                  >
                                    <div className="flex items-center gap-1">
                                      {REACTION_OPTIONS.map(({ id: emojiId, Icon, label }) => {
                                        const myReaction = (reactionsMap[message.id] || []).some(
                                          r => r.userId === user?.id && r.emoji === emojiId
                                        );
                                        return (
                                          <button
                                            key={emojiId}
                                            type="button"
                                            title={label}
                                            onClick={() => {
                                              toggleReaction(message.id, emojiId);
                                              setReactionPickerOpen(null);
                                            }}
                                            className={`p-1.5 rounded hover-elevate ${
                                              myReaction ? 'text-primary' : 'text-muted-foreground'
                                            }`}
                                          >
                                            <Icon className="h-4 w-4" />
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <div className="w-px h-4 bg-border mx-0.5" />
                                <button
                                  type="button"
                                  title="Reply in thread"
                                  onClick={() => toggleThread(message.id)}
                                  className="p-1 rounded hover-elevate text-muted-foreground"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Reaction pills */}
                            {Object.keys(reactionGroups).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {Object.entries(reactionGroups).map(([emojiId, group]) => (
                                  <button
                                    key={emojiId}
                                    type="button"
                                    title={group.users.join(", ")}
                                    onClick={() => toggleReaction(message.id, emojiId)}
                                    className={`
                                      inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border
                                      hover-elevate transition-colors
                                      ${group.myReaction
                                        ? 'bg-primary/15 border-primary/30 text-primary'
                                        : 'bg-muted/30 border-border text-muted-foreground'
                                      }
                                    `}
                                  >
                                    <ReactionIcon id={emojiId} className="h-3 w-3" />
                                    <span>{group.count}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Thread replies toggle */}
                            {threadCount > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleThread(message.id)}
                                className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                              >
                                {threadOpen
                                  ? <ChevronDown className="h-3 w-3" />
                                  : <ChevronRight className="h-3 w-3" />
                                }
                                {threadCount} {threadCount === 1 ? 'reply' : 'replies'}
                              </button>
                            )}

                            {/* Inline thread expansion */}
                            {threadOpen && (
                              <div className="mt-1 ml-2 border-l-2 border-border pl-3 w-full space-y-2">
                                {/* "Replying to [name]" context header */}
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />
                                  <span>
                                    Replying to{" "}
                                    <span className="font-medium text-foreground">
                                      {message.userFirstName && message.userLastName
                                        ? `${message.userFirstName} ${message.userLastName}`
                                        : message.userEmail || "Unknown"}
                                    </span>
                                  </span>
                                </div>
                                {loadingThreads.has(message.id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                  (threadMessages[message.id] || []).map((reply) => {
                                    const replyIsOwn = reply.userId === user?.id;
                                    const parentName = message.userFirstName && message.userLastName
                                      ? `${message.userFirstName} ${message.userLastName}`
                                      : message.userEmail || "Unknown";
                                    return (
                                      <div key={reply.id} className="flex gap-2 items-start">
                                        <Avatar className="h-6 w-6 shrink-0">
                                          <AvatarFallback className="text-[10px] bg-muted/60">
                                            {getInitials(reply.userFirstName, reply.userLastName, reply.userEmail)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col gap-0.5 flex-1">
                                          <span className="text-[11px] font-medium text-foreground">
                                            {reply.userFirstName && reply.userLastName
                                              ? `${reply.userFirstName} ${reply.userLastName}`
                                              : reply.userEmail || 'Unknown'}
                                          </span>
                                          <div className={`
                                            px-2.5 pt-1 pb-1.5 rounded-lg text-sm
                                            ${replyIsOwn
                                              ? 'bg-primary/10 text-foreground border border-primary/20'
                                              : 'bg-muted/20 text-foreground'
                                            }
                                          `}>
                                            {/* "Reply to [name]" label inside each reply bubble */}
                                            <div className="text-[10px] text-muted-foreground mb-1">
                                              Replying to <span className="font-medium text-foreground/70">{parentName}</span>
                                            </div>
                                            <div className="break-words whitespace-pre-wrap">
                                              {renderMessageWithMentions(reply.content, user?.id)}
                                            </div>
                                          </div>
                                          <span className="text-[10px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                                {/* Reply input */}
                                <div className="flex items-center gap-2 pt-1">
                                  <Input
                                    value={threadInputs[message.id] || ""}
                                    onChange={(e) => setThreadInputs(prev => ({ ...prev, [message.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        sendReply(message.id, message.channelId);
                                      }
                                    }}
                                    placeholder="Reply..."
                                    className="h-8 text-sm flex-1"
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    disabled={!threadInputs[message.id]?.trim() || sendingThreads.has(message.id)}
                                    onClick={() => sendReply(message.id, message.channelId)}
                                  >
                                    {sendingThreads.has(message.id)
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <Send className="h-3.5 w-3.5" />
                                    }
                                  </Button>
                                </div>
                              </div>
                            )}

                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Typing Indicator */}
              {typingUsers.length > 0 && (
                <div className="px-4 py-1 text-xs text-muted-foreground">
                  {typingUsers.length === 1 
                    ? `${typingUsers[0]} is typing...`
                    : `${typingUsers.join(', ')} are typing...`
                  }
                </div>
              )}

              {/* Message Input - Compact h-9 design */}
              <div className="p-3 border-t bg-background">
                <form onSubmit={handleSendMessage} className="relative">
                  {showMentionPicker && filteredMentionUsers.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-lg shadow-lg max-h-48 overflow-auto z-50">
                      <div className="p-1">
                        {filteredMentionUsers.slice(0, 5).map((u: any) => (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover-elevate text-left"
                            onClick={() => insertMention(u.id, u.firstName, u.lastName, u.email)}
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {getInitials(u.firstName, u.lastName, u.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate">
                              {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      ref={inputRef}
                      value={messageInput}
                      onChange={handleMessageInputChange}
                      onKeyDown={(e) => {
                        if (!showMentionPicker) return;
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setShowMentionPicker(false);
                        } else if (e.key === "Enter" && filteredMentionUsers.length > 0) {
                          e.preventDefault();
                          const first = filteredMentionUsers[0];
                          insertMention(first.id, first.firstName, first.lastName, first.email);
                        }
                      }}
                      placeholder="Type a message... (@ to mention, /task to create task)"
                      className="h-9 flex-1"
                      data-testid="input-message"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!messageInput.trim() || isSending}
                      className="h-9"
                      data-testid="button-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Hash className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">Select a channel to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Channel Dialog */}
      <Dialog open={isCreateChannelOpen} onOpenChange={setIsCreateChannelOpen}>
        <DialogContent data-testid="dialog-create-channel">
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
            <DialogDescription>
              Create a new channel for team communication
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="channel-name">Channel Name *</Label>
              <Input
                id="channel-name"
                placeholder="e.g., General, Project Updates"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                data-testid="input-channel-name"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="client-facing"
                checked={isClientFacing}
                onCheckedChange={setIsClientFacing}
                data-testid="switch-client-facing"
              />
              <Label htmlFor="client-facing" className="cursor-pointer">
                Client-facing channel (visible to clients)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateChannelOpen(false);
                setNewChannelName("");
                setIsClientFacing(false);
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newChannelName.trim()) {
                  createChannelMutation.mutate({ 
                    name: newChannelName, 
                    isClientFacing 
                  });
                  setIsCreateChannelOpen(false);
                  setNewChannelName("");
                  setIsClientFacing(false);
                }
              }}
              disabled={!newChannelName.trim() || createChannelMutation.isPending}
              data-testid="button-create"
            >
              {createChannelMutation.isPending ? "Creating..." : "Create Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start DM Dialog */}
      <Dialog open={isCreateDmOpen} onOpenChange={setIsCreateDmOpen}>
        <DialogContent data-testid="dialog-start-dm">
          <DialogHeader>
            <DialogTitle>Start Direct Message</DialogTitle>
            <DialogDescription>
              Choose a team member to start a conversation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dm-user">Select User *</Label>
              <select
                id="dm-user"
                value={selectedDmUserId}
                onChange={(e) => setSelectedDmUserId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                data-testid="select-dm-user"
              >
                <option value="">Choose a user...</option>
                {allUsers
                  .filter((u: any) => u.id !== user?.id)
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreateDmOpen(false);
                setSelectedDmUserId("");
              }}
              data-testid="button-cancel-dm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedDmUserId) {
                  createDmMutation.mutate(selectedDmUserId);
                  setIsCreateDmOpen(false);
                  setSelectedDmUserId("");
                }
              }}
              disabled={!selectedDmUserId || createDmMutation.isPending}
              data-testid="button-start-dm"
            >
              {createDmMutation.isPending ? "Starting..." : "Start Conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Combined Channel Panel — Sheet */}
      <Sheet
        open={isChannelPanelOpen}
        onOpenChange={(open) => {
          setIsChannelPanelOpen(open);
          if (!open) setIsDeleteConfirmOpen(false);
        }}
      >
        <SheetContent
          side="right"
          className="w-80 p-0 flex flex-col"
          data-testid="sheet-channel-panel"
        >
          <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
            <SheetTitle className="text-base">
              {selectedChannel?.type === "dm"
                ? "Conversation"
                : `#${selectedChannel?.name}`}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-5 py-4 space-y-6">

              {/* ── Members ── */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Members
                </p>

                {/* Current members */}
                <div className="space-y-1">
                  {channelMembers.map((member) => {
                    const memberUser = allUsers.find((u: any) => u.id === member.userId);
                    const displayName = memberUser
                      ? (memberUser.firstName && memberUser.lastName
                          ? `${memberUser.firstName} ${memberUser.lastName}`
                          : memberUser.email)
                      : member.userId;
                    const isCurrentUser = member.userId === user?.id;
                    const isOwner = member.role === "owner";
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-2 py-1.5 rounded-md"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[11px]">
                              {getInitials(memberUser?.firstName, memberUser?.lastName, memberUser?.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate">{displayName}</span>
                          {isOwner && (
                            <Badge variant="secondary" className="text-[10px] shrink-0 px-1.5">
                              owner
                            </Badge>
                          )}
                        </div>
                        {!isCurrentUser && !isOwner && selectedChannel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive shrink-0"
                            disabled={removeMemberMutation.isPending}
                            onClick={() => removeMemberMutation.mutate({ channelId: selectedChannel.id, userId: member.userId })}
                            data-testid={`button-remove-member-${member.userId}`}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add non-members */}
                {(() => {
                  const nonMembers = allUsers.filter(
                    (u: any) => !channelMembers.some(m => m.userId === u.id)
                  );
                  if (nonMembers.length === 0) return null;
                  return (
                    <div className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground px-0 pb-0.5">Add people</p>
                      {nonMembers.map((u: any) => {
                        const displayName = u.firstName && u.lastName
                          ? `${u.firstName} ${u.lastName}`
                          : u.email;
                        return (
                          <div
                            key={u.id}
                            className="flex items-center justify-between gap-2 py-1.5 rounded-md"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className="text-[11px]">
                                  {getInitials(u.firstName, u.lastName, u.email)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate text-muted-foreground">{displayName}</span>
                            </div>
                            {selectedChannel && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs shrink-0"
                                disabled={addMemberMutation.isPending}
                                onClick={() => addMemberMutation.mutate({ channelId: selectedChannel.id, userId: u.id })}
                                data-testid={`button-add-member-${u.id}`}
                              >
                                Add
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* ── Channel Settings (rename — non-DM only) ── */}
              {selectedChannel?.type !== "dm" && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Settings
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="channel-rename" className="text-xs">Channel name</Label>
                      <div className="flex gap-2">
                        <Input
                          id="channel-rename"
                          value={channelRenameValue}
                          onChange={(e) => setChannelRenameValue(e.target.value)}
                          placeholder="Channel name"
                          className="h-9 text-sm"
                          data-testid="input-channel-rename"
                        />
                        <Button
                          size="sm"
                          disabled={
                            !channelRenameValue.trim() ||
                            channelRenameValue.trim() === selectedChannel?.name ||
                            renameChannelMutation.isPending
                          }
                          onClick={() => selectedChannel && renameChannelMutation.mutate({
                            channelId: selectedChannel.id,
                            name: channelRenameValue.trim(),
                          })}
                          data-testid="button-rename-channel"
                        >
                          {renameChannelMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── Notifications ── */}
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Notifications
                </p>
                {[
                  { key: "push" as const, label: "Browser notifications", description: "Desktop alerts for new messages" },
                  { key: "sound" as const, label: "Notification sound", description: "Play a sound on new messages" },
                  { key: "highlights" as const, label: "Message highlights", description: "Highlight new messages in chat" },
                  { key: "mentionSound" as const, label: "@Mention alert", description: "Extra alert when you're mentioned" },
                ].map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                    <Switch
                      checked={notifPrefs[key]}
                      onCheckedChange={(v) => updateNotifPref(key, v)}
                      data-testid={`switch-${key}`}
                    />
                  </div>
                ))}
              </div>

              {/* ── Danger zone ── */}
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {selectedChannel?.type === "dm" ? "Danger" : "Danger zone"}
                </p>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      {selectedChannel?.type === "dm" ? "Delete conversation" : "Delete channel"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedChannel?.type === "dm"
                        ? "Permanently removes this conversation and all messages."
                        : "Permanently removes this channel and all messages."}
                    </p>
                  </div>
                  {!isDeleteConfirmOpen ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:border-destructive/50"
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      data-testid="button-delete-channel-prompt"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {selectedChannel?.type === "dm" ? "Delete conversation" : "Delete channel"}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteChannelMutation.isPending}
                        onClick={() => selectedChannel && deleteChannelMutation.mutate(selectedChannel.id)}
                        data-testid="button-delete-channel-confirm"
                      >
                        {deleteChannelMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                        Confirm delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        data-testid="button-delete-channel-cancel"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
