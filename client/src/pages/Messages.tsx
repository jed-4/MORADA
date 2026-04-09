import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSocket, useChannelMessages, useTypingIndicator, useAllNewMessages, useReactionUpdated, useMessageUpdated } from "@/lib/socket";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Hash, Plus, Send, Loader2, Sparkles, MoreVertical, Bell, BellOff, Lock, Eye, Settings, User, Pin, PinOff, Filter, EyeOff, Clock, Trash2, ThumbsUp, Check, Heart, Smile, Flame, MessageSquare, ChevronDown, ChevronRight, ListTodo, Calendar, Megaphone, X } from "lucide-react";
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
  { id: "smile",     Icon: Smile,    label: "Laugh" },
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

// Render plain-text segments, highlighting @channel and @here tokens
function renderTextWithBroadcasts(text: string, keyPrefix: string): (string | JSX.Element)[] {
  const broadcastRegex = /@(channel|here)\b/g;
  const result: (string | JSX.Element)[] = [];
  let last = 0;
  let bm;
  while ((bm = broadcastRegex.exec(text)) !== null) {
    if (bm.index > last) result.push(text.substring(last, bm.index));
    result.push(
      <span
        key={`${keyPrefix}-bc-${bm.index}`}
        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground"
      >
        @{bm[1]}
      </span>
    );
    last = bm.index + bm[0].length;
  }
  if (last < text.length) result.push(text.substring(last));
  return result;
}

// Helper to parse and render mentions in messages
function renderMessageWithMentions(content: string, currentUserId?: string) {
  const mentionRegex = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let segmentIdx = 0;
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderTextWithBroadcasts(content.substring(lastIndex, match.index), `seg-${segmentIdx++}`));
    }
    
    const name = match[1];
    const userId = match[2];
    const isCurrentUser = userId === currentUserId;
    
    parts.push(
      <span 
        key={`user-${match.index}`}
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
    parts.push(...renderTextWithBroadcasts(content.substring(lastIndex), `seg-${segmentIdx++}`));
  }
  
  return parts.length > 0 ? parts : content;
}

// Extract a task UUID from message content (e.g. "/tasks/abc-123")
const TASK_LINK_REGEX = /\/tasks\/([a-zA-Z0-9_-]{8,})/;

function extractTaskLink(content: string): string | null {
  const m = content.match(TASK_LINK_REGEX);
  return m ? m[1] : null;
}

// Strip @[Name](userId:xxx) markup to plain text for pre-filling the task title
function stripMentionMarkup(content: string): string {
  return content.replace(/@\[([^\]]+)\]\(userId:[^)]+\)/g, "@$1");
}

// Compact task preview card rendered below messages containing /tasks/UUID links
function TaskLinkPreview({ taskId }: { taskId: string }) {
  const { data: task, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/tasks", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}`, { credentials: "include" });
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="mt-1.5 rounded-md border bg-muted/20 p-2.5 w-56 animate-pulse">
        <div className="h-3 bg-muted rounded w-3/4 mb-1.5" />
        <div className="h-2.5 bg-muted rounded w-1/2" />
      </div>
    );
  }
  if (isError || !task) return null;

  const title = task.title || "(Untitled)";
  const status: string = task.status || "todo";
  const assigneeName: string = task.assigneeName || (task.assigneeIds?.length ? "Assigned" : "Unassigned");
  const dueDate: string | null = task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : null;
  const statusColor: string =
    status === "done" ? "text-green-600 dark:text-green-400" :
    status === "in-progress" ? "text-blue-600 dark:text-blue-400" :
    "text-muted-foreground";

  return (
    <a
      href={`/tasks?taskId=${taskId}`}
      className="mt-1.5 flex flex-col gap-1 rounded-md border bg-card p-2.5 w-64 hover-elevate no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-1.5">
        <ListTodo className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
        <span className="text-xs font-medium text-foreground leading-tight line-clamp-2">{title}</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={`capitalize font-medium ${statusColor}`}>{status.replace("-", " ")}</span>
        {assigneeName && (
          <>
            <span>·</span>
            <span>{assigneeName}</span>
          </>
        )}
        {dueDate && (
          <>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Calendar className="h-2.5 w-2.5" />
              {dueDate}
            </span>
          </>
        )}
      </div>
    </a>
  );
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Highlighted message (scroll-to from pinned panel)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Pinned messages panel collapsible state
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(true);

  // Create task from message dialog state
  const [createTaskFromMsg, setCreateTaskFromMsg] = useState<{ id: string; content: string } | null>(null);
  const [taskFormTitle, setTaskFormTitle] = useState("");
  const [taskFormProjectId, setTaskFormProjectId] = useState("");
  const [taskFormAssigneeId, setTaskFormAssigneeId] = useState("");
  const [taskFormDueDate, setTaskFormDueDate] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  
  // Scheduled message state
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledSectionOpen, setScheduledSectionOpen] = useState(true);

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

  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    enabled: createTaskFromMsg !== null,
    staleTime: 60_000,
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

  // Pinned messages for the selected channel (loaded when panel is open)
  const { data: pinnedMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/channels", selectedChannelId, "pinned"],
    queryFn: async () => {
      const res = await fetch(`/api/channels/${selectedChannelId}/pinned`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedChannelId && isChannelPanelOpen,
    staleTime: 30_000,
  });

  // Scheduled messages for current user in the selected channel
  const scheduledQueryKey = ["/api/channels", selectedChannelId, "scheduled"];
  const { data: scheduledMessages = [] } = useQuery<Message[]>({
    queryKey: scheduledQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/channels/${selectedChannelId}/scheduled`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedChannelId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Toggle pin mutation — optimistic update applied immediately with rollback on failure
  const pinnedQueryKey = ["/api/channels", selectedChannelId, "pinned"];

  const pinMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await apiRequest(`/api/messages/${messageId}/pin`, "POST");
      return res as Message;
    },
    onMutate: async (messageId: string) => {
      // Snapshot previous state for rollback
      const previousMessages = localMessages;
      const previousPinned = queryClient.getQueryData<Message[]>(pinnedQueryKey) ?? [];
      const targetMsg = localMessages.find(m => m.id === messageId);

      // Optimistically toggle isPinned on the message in the main list
      setLocalMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? { ...m, isPinned: !m.isPinned, pinnedAt: m.isPinned ? null : new Date(), pinnedByUserId: m.isPinned ? null : (user?.id ?? null) }
            : m
        )
      );
      // Optimistically update the pinned panel cache
      if (targetMsg) {
        if (targetMsg.isPinned) {
          // Remove from pinned list
          queryClient.setQueryData<Message[]>(pinnedQueryKey, prev => (prev ?? []).filter(p => p.id !== messageId));
        } else {
          // Add to pinned list at the top
          const optimistic: Message = { ...targetMsg, isPinned: true, pinnedAt: new Date(), pinnedByUserId: user?.id ?? null };
          queryClient.setQueryData<Message[]>(pinnedQueryKey, prev => [optimistic, ...(prev ?? [])]);
        }
      }
      return { previousMessages, previousPinned };
    },
    onSuccess: (updated: Message) => {
      // Sync with authoritative server data
      setLocalMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      // Sync pinned panel with authoritative server data
      if (updated.isPinned) {
        queryClient.setQueryData<Message[]>(pinnedQueryKey, prev =>
          [updated, ...(prev ?? []).filter(p => p.id !== updated.id)]
        );
      } else {
        queryClient.setQueryData<Message[]>(pinnedQueryKey, prev =>
          (prev ?? []).filter(p => p.id !== updated.id)
        );
      }
    },
    onError: (_err, _messageId, context) => {
      // Rollback on failure
      if (context?.previousMessages) {
        setLocalMessages(context.previousMessages);
      }
      if (context?.previousPinned !== undefined) {
        queryClient.setQueryData<Message[]>(pinnedQueryKey, context.previousPinned);
      }
      toast({ title: "Failed to update pin", variant: "destructive" });
    },
  });

  // Cancel scheduled message mutation (optimistic removal)
  const cancelScheduledMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await fetch(`/api/messages/${messageId}/scheduled`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to cancel");
    },
    onMutate: async (messageId: string) => {
      const prev = queryClient.getQueryData<Message[]>(scheduledQueryKey) ?? [];
      queryClient.setQueryData<Message[]>(scheduledQueryKey, old => (old ?? []).filter(m => m.id !== messageId));
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData<Message[]>(scheduledQueryKey, context.prev);
      toast({ title: "Failed to cancel scheduled message", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: scheduledQueryKey });
    },
  });

  // Edit scheduled message state: messageId -> { content, date, time }
  const [editingScheduled, setEditingScheduled] = useState<Record<string, { content: string; date: string; time: string }>>({});

  const updateScheduledMutation = useMutation({
    mutationFn: async ({ messageId, content, scheduledAt }: { messageId: string; content?: string; scheduledAt?: string }) => {
      const res = await fetch(`/api/messages/${messageId}/scheduled`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, scheduledAt }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json() as Promise<Message>;
    },
    onSuccess: (updated: Message) => {
      queryClient.setQueryData<Message[]>(scheduledQueryKey, old =>
        (old ?? []).map(m => m.id === updated.id ? updated : m)
      );
      setEditingScheduled(prev => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
    },
    onError: () => {
      toast({ title: "Failed to update scheduled message", variant: "destructive" });
    },
  });

  // Handle scheduling a message
  const handleScheduleMessage = async () => {
    if (!messageInput.trim() || !selectedChannelId || !scheduleDate || !scheduleTime) return;
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
    if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      toast({ title: "Please choose a future date and time", variant: "destructive" });
      return;
    }

    // Build content + mentions same as handleSendMessage
    let content = messageInput;
    const mentionIds: string[] = [];
    const sortedMentions = [...pendingMentions].sort((a, b) => b.name.length - a.name.length);
    for (const m of sortedMentions) {
      const escapedName = m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tokenRegex = new RegExp(`@${escapedName}(?=\\s|$|[^\\w])`, "g");
      if (tokenRegex.test(content)) {
        content = content.replace(new RegExp(`@${escapedName}(?=\\s|$|[^\\w])`, "g"), `@[${m.name}](userId:${m.userId})`);
        mentionIds.push(m.userId);
      }
    }
    const mentionRegex2 = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;
    let mm;
    while ((mm = mentionRegex2.exec(content)) !== null) {
      if (!mentionIds.includes(mm[2])) mentionIds.push(mm[2]);
    }

    setIsScheduling(true);
    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, mentions: mentionIds, scheduledAt: scheduledAt.toISOString() }),
      });
      if (!res.ok) throw new Error("Failed");
      setMessageInput("");
      setPendingMentions([]);
      setSchedulePopoverOpen(false);
      setScheduleDate("");
      setScheduleTime("");
      queryClient.invalidateQueries({ queryKey: scheduledQueryKey });
      toast({ title: "Message scheduled", description: `Will be sent on ${scheduledAt.toLocaleString("en-AU")}` });
    } catch {
      toast({ title: "Failed to schedule message", variant: "destructive" });
    } finally {
      setIsScheduling(false);
    }
  };

  // Scroll to a message in the main feed and briefly highlight it
  const scrollToMessage = useCallback((messageId: string) => {
    setIsChannelPanelOpen(false);
    setTimeout(() => {
      const el = messageRefs.current[messageId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedMessageId(messageId);
        setTimeout(() => setHighlightedMessageId(null), 2000);
      }
    }, 150);
  }, []);

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
      setThreadMessages(prev => {
        const existing = prev[parentMessageId] || [];
        // Deduplicate: if socket already delivered this reply, don't add twice
        if (existing.some(r => r.id === reply.id)) return prev;
        return { ...prev, [parentMessageId]: [...existing, reply] };
      });
      // threadCount is NOT updated here — the server emits message_updated via socket
      // with the authoritative count, which useMessageUpdated handles.
      // Doing a local increment here risks double-counting when socket arrives first.
    } catch {
      setThreadInputs(prev => ({ ...prev, [parentMessageId]: content }));
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setSendingThreads(prev => { const next = new Set(prev); next.delete(parentMessageId); return next; });
    }
  }, [threadInputs, toast]);

  const handleCreateTaskFromMessage = async () => {
    if (!taskFormTitle.trim() || !selectedChannelId) return;
    setIsCreatingTask(true);
    try {
      const effectiveProjectId = taskFormProjectId && taskFormProjectId !== "__none__" ? taskFormProjectId : undefined;
      const effectiveAssigneeId = taskFormAssigneeId && taskFormAssigneeId !== "__none__" ? taskFormAssigneeId : undefined;
      const taskBody: Record<string, unknown> = {
        type: "task",
        title: taskFormTitle.trim(),
        scope: effectiveProjectId ? "project" : "business",
      };
      if (effectiveProjectId) taskBody.projectId = effectiveProjectId;
      if (effectiveAssigneeId) taskBody.assigneeId = effectiveAssigneeId;
      if (taskFormDueDate) taskBody.dueDate = taskFormDueDate;
      // Pass channelId so the server creates a trusted bot message server-side
      if (selectedChannelId) taskBody.channelId = selectedChannelId;

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(taskBody),
      });
      if (!res.ok) throw new Error("Failed to create task");

      // Refresh messages (bot message was created server-side)
      queryClient.invalidateQueries({ queryKey: ["/api/channels", selectedChannelId, "messages"] });

      toast({ title: "Task created", description: `"${taskBody.title}" has been added to tasks.` });
      setCreateTaskFromMsg(null);
      setTaskFormTitle("");
      setTaskFormProjectId("");
      setTaskFormAssigneeId("");
      setTaskFormDueDate("");
    } catch {
      toast({ title: "Failed to create task", variant: "destructive" });
    } finally {
      setIsCreatingTask(false);
    }
  };

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
      const body: Record<string, unknown> = { name, type: "channel", isClientFacing };
      if (projectId) body.projectId = projectId;
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const handleMessageInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
    if (inputRef.current) { inputRef.current.style.height = "auto"; }

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
      isBot: false,
      isPinned: false,
      pinnedAt: null,
      pinnedByUserId: null,
      scheduledAt: null,
      scheduledStatus: null,
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

  // Broadcast mention options (@channel / @here) that appear above users in the picker
  const broadcastMentionOptions = useMemo(() => {
    const all = [
      { id: 'channel' as const, label: 'channel', description: 'Notify all channel members' },
      { id: 'here' as const, label: 'here', description: 'Notify active members' },
    ];
    if (!mentionSearch) return all;
    return all.filter(o => o.id.startsWith(mentionSearch));
  }, [mentionSearch]);

  const insertBroadcastMention = (token: 'channel' | 'here') => {
    const beforeMention = messageInput.substring(0, mentionStartPos);
    const afterMention = messageInput.substring(inputRef.current?.selectionStart || messageInput.length);
    setMessageInput(beforeMention + `@${token} ` + afterMention);
    setShowMentionPicker(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

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
                      const isBot = !!message.isBot;
                      const isOwn = !isBot && message.userId === user?.id;
                      const isHighlighted = newMessageIds.has(message.id);
                      const isPinnedHighlight = highlightedMessageId === message.id;
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
                          ref={(el) => { messageRefs.current[message.id] = el; }}
                          className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'animate-pulse' : ''} ${isPinnedHighlight ? 'rounded-lg ring-2 ring-primary/40 bg-primary/5' : ''} group/msg`}
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
                                {/* Pinned indicator inside bubble */}
                                {message.isPinned && (
                                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                    <Pin className="h-2.5 w-2.5" />
                                    <span>Pinned</span>
                                  </div>
                                )}
                              </div>

                              {/* Hover toolbar — visibility toggled (no layout shift); hidden for bot messages */}
                              {!isBot && (
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
                                <div className="w-px h-4 bg-border mx-0.5" />
                                <button
                                  type="button"
                                  title="Create task from message"
                                  onClick={() => {
                                    const plain = stripMentionMarkup(message.content).trim();
                                    const shortened = plain.length > 120 ? plain.substring(0, 120) + "…" : plain;
                                    setCreateTaskFromMsg({ id: message.id, content: message.content });
                                    setTaskFormTitle(shortened);
                                    setTaskFormProjectId(projectId || "");
                                    setTaskFormAssigneeId("");
                                    setTaskFormDueDate("");
                                  }}
                                  className="p-1 rounded hover-elevate text-muted-foreground"
                                  data-testid={`button-create-task-${message.id}`}
                                >
                                  <ListTodo className="h-3.5 w-3.5" />
                                </button>
                                <div className="w-px h-4 bg-border mx-0.5" />
                                <button
                                  type="button"
                                  title={message.isPinned ? "Unpin message" : "Pin message"}
                                  onClick={() => pinMessageMutation.mutate(message.id)}
                                  disabled={pinMessageMutation.isPending}
                                  className={`p-1 rounded hover-elevate ${message.isPinned ? 'text-primary' : 'text-muted-foreground'}`}
                                  data-testid={`button-pin-${message.id}`}
                                >
                                  {message.isPinned
                                    ? <PinOff className="h-3.5 w-3.5" />
                                    : <Pin className="h-3.5 w-3.5" />
                                  }
                                </button>
                              </div>
                              )}
                            </div>

                            {/* Task link preview card — shown when message content contains /tasks/UUID */}
                            {(() => {
                              const taskId = extractTaskLink(message.content);
                              if (!taskId) return null;
                              return <TaskLinkPreview taskId={taskId} />;
                            })()}

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

              {/* Scheduled Messages Section */}
              {scheduledMessages.length > 0 && (
                <div className="border-t bg-background">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover-elevate"
                    onClick={() => setScheduledSectionOpen(v => !v)}
                  >
                    {scheduledSectionOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <Clock className="h-3 w-3" />
                    <span>{scheduledMessages.length} scheduled {scheduledMessages.length === 1 ? 'message' : 'messages'}</span>
                  </button>
                  {scheduledSectionOpen && (
                    <div className="px-3 pb-2 space-y-1.5">
                      {scheduledMessages.map((msg) => {
                        const isEditing = !!editingScheduled[msg.id];
                        const editState = editingScheduled[msg.id];
                        return (
                          <div key={msg.id} className="rounded-md bg-muted/30 px-2.5 py-1.5 text-sm">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <Input
                                  value={editState.content}
                                  onChange={e => setEditingScheduled(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], content: e.target.value } }))}
                                  className="h-8 text-xs"
                                  placeholder="Message content"
                                />
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="date"
                                    value={editState.date}
                                    onChange={e => setEditingScheduled(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], date: e.target.value } }))}
                                    min={new Date().toISOString().split("T")[0]}
                                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                  <input
                                    type="time"
                                    value={editState.time}
                                    onChange={e => setEditingScheduled(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], time: e.target.value } }))}
                                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 text-xs flex-1"
                                    disabled={!editState.content.trim() || !editState.date || !editState.time || updateScheduledMutation.isPending}
                                    onClick={() => {
                                      const newAt = new Date(`${editState.date}T${editState.time}:00`);
                                      if (isNaN(newAt.getTime()) || newAt <= new Date()) {
                                        toast({ title: "Please choose a future date and time", variant: "destructive" });
                                        return;
                                      }
                                      updateScheduledMutation.mutate({ messageId: msg.id, content: editState.content, scheduledAt: newAt.toISOString() });
                                    }}
                                  >
                                    {updateScheduledMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => setEditingScheduled(prev => { const n = { ...prev }; delete n[msg.id]; return n; })}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-foreground text-xs leading-snug line-clamp-2 break-words">
                                    {msg.content}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Scheduled for {msg.scheduledAt ? new Date(msg.scheduledAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      const d = msg.scheduledAt ? new Date(msg.scheduledAt) : new Date();
                                      const pad = (n: number) => String(n).padStart(2, "0");
                                      setEditingScheduled(prev => ({
                                        ...prev,
                                        [msg.id]: {
                                          content: msg.content,
                                          date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
                                          time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
                                        },
                                      }));
                                    }}
                                    aria-label="Edit scheduled message"
                                  >
                                    <Settings className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => cancelScheduledMutation.mutate(msg.id)}
                                    aria-label="Cancel scheduled message"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Message Input - Compact h-9 design */}
              <div className="p-3 border-t bg-background">
                <form onSubmit={handleSendMessage} className="relative">
                  {showMentionPicker && (broadcastMentionOptions.length > 0 || filteredMentionUsers.length > 0) && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-lg shadow-lg max-h-48 overflow-auto z-50">
                      <div className="p-1">
                        {broadcastMentionOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover-elevate text-left"
                            onClick={() => insertBroadcastMention(opt.id)}
                          >
                            <div className="h-6 w-6 flex items-center justify-center shrink-0 rounded-full bg-muted">
                              <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium">@{opt.label}</span>
                              <span className="text-xs text-muted-foreground truncate">{opt.description}</span>
                            </div>
                          </button>
                        ))}
                        {broadcastMentionOptions.length > 0 && filteredMentionUsers.length > 0 && (
                          <div className="mx-2 my-1 border-t" />
                        )}
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
                  <div className="flex items-end gap-2">
                    <Textarea
                      ref={inputRef}
                      value={messageInput}
                      onChange={handleMessageInputChange}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && showMentionPicker) {
                          e.preventDefault();
                          setShowMentionPicker(false);
                          return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          if (showMentionPicker) {
                            if (broadcastMentionOptions.length > 0) {
                              e.preventDefault();
                              insertBroadcastMention(broadcastMentionOptions[0].id);
                            } else if (filteredMentionUsers.length > 0) {
                              e.preventDefault();
                              const first = filteredMentionUsers[0];
                              insertMention(first.id, first.firstName, first.lastName, first.email);
                            } else {
                              e.preventDefault();
                              handleSendMessage(e as unknown as React.FormEvent);
                            }
                          } else {
                            e.preventDefault();
                            handleSendMessage(e as unknown as React.FormEvent);
                          }
                        }
                        // Shift+Enter inserts newline (default textarea behaviour — no override needed)
                      }}
                      placeholder="Type a message... (@ to mention, /task to create task)"
                      rows={1}
                      className="flex-1 min-h-[36px] max-h-[120px] resize-none overflow-y-auto py-2 text-sm leading-5"
                      style={{ height: "auto" }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                      }}
                      data-testid="input-message"
                    />
                    {/* Schedule popover */}
                    <Popover open={schedulePopoverOpen} onOpenChange={setSchedulePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={!messageInput.trim()}
                          aria-label="Schedule message"
                          data-testid="button-schedule"
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 p-4 space-y-3">
                        <p className="text-sm font-medium">Schedule message</p>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Date</label>
                          <input
                            type="date"
                            value={scheduleDate}
                            onChange={e => setScheduleDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Time</label>
                          <input
                            type="time"
                            value={scheduleTime}
                            onChange={e => setScheduleTime(e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <Button
                          type="button"
                          className="w-full"
                          disabled={!scheduleDate || !scheduleTime || isScheduling}
                          onClick={handleScheduleMessage}
                        >
                          {isScheduling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
                          Schedule send
                        </Button>
                      </PopoverContent>
                    </Popover>
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

      {/* Create Task from Message Dialog */}
      <Dialog open={createTaskFromMsg !== null} onOpenChange={(open) => { if (!open) setCreateTaskFromMsg(null); }}>
        <DialogContent data-testid="dialog-create-task-from-message">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              Create Task
            </DialogTitle>
            <DialogDescription>
              Create a task from this message. The task will appear in the channel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="task-title">Task title *</Label>
              <Input
                id="task-title"
                value={taskFormTitle}
                onChange={(e) => setTaskFormTitle(e.target.value)}
                placeholder="Describe the task…"
                data-testid="input-task-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-project">Project</Label>
              <Select value={taskFormProjectId} onValueChange={setTaskFormProjectId}>
                <SelectTrigger id="task-project" data-testid="select-task-project">
                  <SelectValue placeholder="No project (business task)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {allProjects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select value={taskFormAssigneeId} onValueChange={setTaskFormAssigneeId}>
                <SelectTrigger id="task-assignee" data-testid="select-task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {allUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due-date">Due date</Label>
              <Input
                id="task-due-date"
                type="date"
                value={taskFormDueDate}
                onChange={(e) => setTaskFormDueDate(e.target.value)}
                data-testid="input-task-due-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateTaskFromMsg(null)}
              disabled={isCreatingTask}
              data-testid="button-cancel-create-task"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTaskFromMessage}
              disabled={!taskFormTitle.trim() || isCreatingTask}
              data-testid="button-confirm-create-task"
            >
              {isCreatingTask ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {isCreatingTask ? "Creating…" : "Create Task"}
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

              {/* ── Pinned Messages ── */}
              {selectedChannel && (
                <>
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 w-full text-left hover-elevate rounded-sm"
                      onClick={() => setPinnedPanelOpen(v => !v)}
                    >
                      <Pin className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                        Pinned Messages
                      </p>
                      {pinnedPanelOpen
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      }
                    </button>
                    {pinnedPanelOpen && (
                      <div className="space-y-1">
                        {(() => {
                          const myMembership = channelMembers.find(m => m.userId === user?.id);
                          const amChannelOwner = myMembership?.role === "owner" || myMembership?.role === "admin";
                          if (pinnedMessages.length === 0) {
                            return <p className="text-xs text-muted-foreground py-1">No pinned messages yet.</p>;
                          }
                          return pinnedMessages.map((pm) => {
                            const pmName = pm.userFirstName && pm.userLastName
                              ? `${pm.userFirstName} ${pm.userLastName}`
                              : pm.userEmail || "Unknown";
                            const snippet = pm.content.length > 80
                              ? pm.content.substring(0, 80) + "…"
                              : pm.content;
                            const canUnpin = amChannelOwner || pm.pinnedByUserId === user?.id;
                            return (
                              <div
                                key={pm.id}
                                className="flex items-start gap-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                                onClick={() => scrollToMessage(pm.id)}
                              >
                                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                                  <AvatarFallback className="text-[10px]">
                                    {getInitials(pm.userFirstName, pm.userLastName, pm.userEmail)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <span className="text-xs font-medium text-foreground truncate">{pmName}</span>
                                  <span className="text-xs text-muted-foreground line-clamp-2 leading-snug">{snippet}</span>
                                </div>
                                {canUnpin && (
                                  <button
                                    type="button"
                                    title="Unpin"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      pinMessageMutation.mutate(pm.id);
                                    }}
                                    className="p-1 rounded hover-elevate text-muted-foreground shrink-0"
                                  >
                                    <PinOff className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                  <Separator />
                </>
              )}

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
