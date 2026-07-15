import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, Fragment } from "react";
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
import { Hash, Plus, Send, Loader2, Sparkles, MoreVertical, Bell, BellOff, Lock, Eye, Settings, User, Pin, PinOff, Filter, EyeOff, Clock, Trash2, ThumbsUp, Check, Heart, Smile, Flame, MessageSquare, ChevronDown, ChevronRight, ListTodo, Calendar, Megaphone, X, Paperclip, FileText, Download, ZoomIn } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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
  SelectSeparator,
} from "@/components/ui/select";
import { format, isToday, isYesterday, isThisWeek, isSameDay, differenceInMinutes } from "date-fns";
import type { Channel, Message, ChannelMember, MessageReaction, MessageAttachment } from "@shared/schema";

// Messages augmented with attachments returned by the API
interface MessageWithAttachments extends Message {
  attachments: MessageAttachment[];
}

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
    status === "done" ? "text-status-success" :
    status === "in-progress" ? "text-status-info" :
    "text-muted-foreground";

  // Route to the correct tasks page based on task context
  const taskHref = task.projectId
    ? `/tasks?projectId=${task.projectId}&taskId=${taskId}`
    : `/business/tasks?taskId=${taskId}`;

  return (
    <a
      href={taskHref}
      className="mt-1.5 flex flex-col gap-1 rounded-md border bg-card p-2.5 w-64 hover-elevate no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-1.5">
        <ListTodo className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
        <span className="text-xs font-medium text-foreground leading-tight line-clamp-2">{title}</span>
      </div>
      <div className="flex items-center gap-2 text-table text-muted-foreground">
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

// Attachment queued for upload alongside the next message
interface PendingAttachment {
  id: string;
  file: File;
  progress: number;
  uploading: boolean;
  error: boolean;
  objectPath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

// Stable empty-collection constants so inline `= []` / `= {}` defaults
// don't create a new reference on every render (which would make any
// useEffect that lists them as deps fire on every single render,
// causing infinite setState → "Maximum update depth exceeded" crashes).
const EMPTY_MESSAGES: MessageWithAttachments[] = [];
const EMPTY_CHANNELS: ChannelWithMeta[] = [];
const EMPTY_UNREAD: Record<string, number> = {};
const EMPTY_USERS: any[] = [];

/** Format a message timestamp the way Google Chat does:
 *  - Today       → "2:35 PM"
 *  - Yesterday   → "Yesterday 2:35 PM"
 *  - This week   → "Mon 2:35 PM"
 *  - Older       → "5 Apr 2:35 PM"
 */
function formatMessageTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const time = format(d, "h:mm a");
  if (isToday(d)) return time;
  if (isYesterday(d)) return `Yesterday ${time}`;
  if (isThisWeek(d, { weekStartsOn: 1 })) return `${format(d, "EEE")} ${time}`;
  return `${format(d, "d MMM")} ${time}`;
}

/** Label shown on the horizontal day divider between message groups. */
function formatDayDivider(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEEE");
  return format(d, "EEE d MMM yyyy");
}

/** Returns true when a horizontal day divider should be drawn before `current`. */
function shouldShowDayDivider(
  current: Date | string,
  previous: Date | string | null | undefined,
): boolean {
  if (!previous) return true;
  const c = typeof current === "string" ? new Date(current) : current;
  const p = typeof previous === "string" ? new Date(previous) : previous;
  return !isSameDay(c, p);
}

/** Returns true when the timestamp under `current` should be shown
 *  (first message of a thread, day change, or > 30 min since previous). */
function shouldShowTimestamp(
  current: Date | string,
  previous: Date | string | null | undefined,
): boolean {
  if (!previous) return true;
  const c = typeof current === "string" ? new Date(current) : current;
  const p = typeof previous === "string" ? new Date(previous) : previous;
  if (!isSameDay(c, p)) return true;
  return Math.abs(differenceInMinutes(c, p)) > 30;
}

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
    document.title = "Morada";
  }, []);

  // Merge new attachments into an existing list, deduplicating by id
  const mergeAttachments = (existing: MessageAttachment[], incoming: MessageAttachment[]): MessageAttachment[] => {
    const seen = new Set(existing.map(a => a.id));
    return [...existing, ...incoming.filter(a => !seen.has(a.id))];
  };

  // Read ?channel= URL param on mount to support navigation from dropdown/notifications
  const channelFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("channel");
  }, []);
  
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(channelFromUrl);
  const [messageInput, setMessageInput] = useState("");
  // Per-channel draft store — survives channel switches
  const channelDrafts = useRef<Map<string, string>>(new Map());
  const messageInputRef = useRef<string>("");
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
  const [taskFormDescription, setTaskFormDescription] = useState("");
  const [taskFormPriority, setTaskFormPriority] = useState("medium");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  
  // Scheduled message state
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledSectionOpen, setScheduledSectionOpen] = useState(true);

  // Attachment state — files queued to send with the next message (upload starts on file select)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Thread reply attachment state: parentMessageId → PendingAttachment[]
  const [threadPendingAttachments, setThreadPendingAttachments] = useState<Record<string, PendingAttachment[]>>({});
  // Hidden file input refs per thread reply (by parentMessageId)
  const threadFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Lightbox state for image preview
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Map of messageId → attachments (for real-time socket updates)
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, MessageAttachment[]>>({});

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

  const { data: messages = EMPTY_MESSAGES, isLoading: messagesLoading } = useQuery<MessageWithAttachments[]>({
    queryKey: ["/api/channels", selectedChannelId, "messages"],
    enabled: !!selectedChannelId,
  });

  const { data: channelMembers = [] } = useQuery<ChannelMember[]>({
    queryKey: ["/api/channels", selectedChannelId, "members"],
    enabled: !!selectedChannelId && isChannelPanelOpen,
  });

  useEffect(() => {
    const queryMessages = messages.filter((m: MessageWithAttachments) => !m.threadParentId);
    setLocalMessages(prev => {
      // Detect channel switch: prev has messages from a different channel → start fresh
      const prevChannelId = prev.find(m => !m.id.startsWith('temp-'))?.channelId;
      const queryChannelId = queryMessages[0]?.channelId;
      if (!prevChannelId || !queryChannelId || prevChannelId !== queryChannelId || prev.length === 0) {
        return queryMessages;
      }
      // Same channel — merge: query data is authoritative for existing IDs;
      // keep any socket-only messages not yet returned by the API
      const queryIds = new Set(queryMessages.map(m => m.id));
      const socketExtra = prev.filter(m => !queryIds.has(m.id) && !m.id.startsWith('temp-'));
      if (socketExtra.length === 0) return queryMessages;
      return [...queryMessages, ...socketExtra].sort(
        (a, b) => new Date(a.createdAt as Date).getTime() - new Date(b.createdAt as Date).getTime()
      );
    });
    // Populate attachments map from API data
    const newMap: Record<string, MessageAttachment[]> = {};
    for (const m of messages) {
      if (m.attachments && m.attachments.length > 0) {
        newMap[m.id] = m.attachments;
      }
    }
    setAttachmentsMap(prev => ({ ...prev, ...newMap }));
  }, [messages]);

  useChannelMessages(selectedChannelId, (rawMessage) => {
    // The socket payload may include an `attachments` array from the server
    const { attachments: incomingAttachments, ...message } = rawMessage as MessageWithAttachments;

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
      // Hydrate attachmentsMap for thread reply if attachments present
      if (incomingAttachments && incomingAttachments.length > 0) {
        setAttachmentsMap(prev => ({
          ...prev,
          [message.id]: mergeAttachments(prev[message.id] || [], incomingAttachments),
        }));
      }
      return;
    }
    setLocalMessages(prev => {
      // Deduplicate: skip if this real ID is already in the list
      // (can happen when sender receives their own REST-sent message via socket)
      if (prev.some(m => m.id === message.id)) return prev;
      return [...prev, message];
    });
    // Hydrate attachmentsMap from socket payload so receivers see attachments immediately
    if (incomingAttachments && incomingAttachments.length > 0) {
      setAttachmentsMap(prev => ({
        ...prev,
        [message.id]: mergeAttachments(prev[message.id] || [], incomingAttachments),
      }));
    }
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
    queryKey: ["/api/users/assignable"],
  });

  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
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

  // Track which channel was selected previously so we can save its draft
  const prevSelectedChannelId = useRef<string | null>(null);

  // Reset per-channel UI state when switching channels; save/restore drafts
  useEffect(() => {
    // Save the outgoing draft (messageInputRef always has the current value)
    if (prevSelectedChannelId.current) {
      channelDrafts.current.set(prevSelectedChannelId.current, messageInputRef.current);
    }
    prevSelectedChannelId.current = selectedChannelId;

    // Restore draft for the incoming channel (or empty string if none)
    const savedDraft = selectedChannelId ? (channelDrafts.current.get(selectedChannelId) ?? "") : "";

    setReactionsMap({});
    setOpenThreads(new Set());
    setThreadMessages({});
    setThreadInputs({});
    setMessageInput(savedDraft);
    messageInputRef.current = savedDraft;
    setPendingMentions([]);
    setShowMentionPicker(false);
    setPendingAttachments([]);
  }, [selectedChannelId]);

  // Real-time reaction updates from other users
  useReactionUpdated((messageId, reactions) => {
    setReactionsMap(prev => ({ ...prev, [messageId]: reactions }));
  });

  // Handle real-time attachment updates
  useEffect(() => {
    if (!socket) return;
    const handleAttachmentsUpdated = (data: { messageId: string; attachment: MessageAttachment }) => {
      setAttachmentsMap(prev => {
        const existing = prev[data.messageId] || [];
        if (existing.some(a => a.id === data.attachment.id)) return prev;
        return { ...prev, [data.messageId]: [...existing, data.attachment] };
      });
    };
    socket.on("message_attachments_updated", handleAttachmentsUpdated);
    return () => { socket.off("message_attachments_updated", handleAttachmentsUpdated); };
  }, [socket]);

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
      const repliesWithAttachments: MessageWithAttachments[] = await res.json();
      // Hydrate attachmentsMap with any attachments returned for replies
      const newAttachments: Record<string, MessageAttachment[]> = {};
      for (const r of repliesWithAttachments) {
        if (r.attachments && r.attachments.length > 0) {
          newAttachments[r.id] = r.attachments;
        }
      }
      if (Object.keys(newAttachments).length > 0) {
        setAttachmentsMap(prev => ({ ...prev, ...newAttachments }));
      }
      setThreadMessages(prev => ({ ...prev, [messageId]: repliesWithAttachments }));
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
    const replyPending = threadPendingAttachments[parentMessageId] || [];
    const uploadedReplyAttachments = replyPending.filter(pa => pa.objectPath && !pa.error);
    const stillUploading = replyPending.some(pa => pa.uploading);
    if ((!content && uploadedReplyAttachments.length === 0) || stillUploading) return;
    setSendingThreads(prev => new Set(prev).add(parentMessageId));
    setThreadInputs(prev => ({ ...prev, [parentMessageId]: "" }));
    setThreadPendingAttachments(prev => ({ ...prev, [parentMessageId]: [] }));

    // Build attachment paths to send atomically with the reply
    const pendingAttachmentPaths = uploadedReplyAttachments.map(pa => ({
      objectPath: pa.objectPath!,
      fileName: pa.file.name,
      fileSize: pa.file.size,
      mimeType: pa.file.type || "application/octet-stream",
    }));

    try {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content,
          threadParentId: parentMessageId,
          ...(pendingAttachmentPaths.length ? { pendingAttachmentPaths } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const reply = await res.json() as MessageWithAttachments;
      setThreadMessages(prev => {
        const existing = prev[parentMessageId] || [];
        // Deduplicate: if socket already delivered this reply, don't add twice
        if (existing.some(r => r.id === reply.id)) return prev;
        return { ...prev, [parentMessageId]: [...existing, reply] };
      });
      // Hydrate attachmentsMap from the atomic response
      if (reply.attachments && reply.attachments.length > 0) {
        setAttachmentsMap(prev => ({
          ...prev,
          [reply.id]: mergeAttachments(prev[reply.id] || [], reply.attachments),
        }));
      }
      // threadCount is NOT updated here — the server emits message_updated via socket
      // with the authoritative count, which useMessageUpdated handles.
    } catch {
      setThreadInputs(prev => ({ ...prev, [parentMessageId]: content }));
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setSendingThreads(prev => { const next = new Set(prev); next.delete(parentMessageId); return next; });
    }
  }, [threadInputs, threadPendingAttachments, toast]);

  const handleCreateTaskFromMessage = async () => {
    if (!taskFormTitle.trim() || !selectedChannelId) return;
    setIsCreatingTask(true);
    try {
      const effectiveProjectId = taskFormProjectId && taskFormProjectId !== "__none__" ? taskFormProjectId : undefined;
      const effectiveAssigneeId = taskFormAssigneeId && taskFormAssigneeId !== "__none__" ? taskFormAssigneeId : undefined;
      const taskBody: Record<string, unknown> = {
        type: "task",
        title: taskFormTitle.trim(),
        content: taskFormDescription.trim(),   // required field; empty string is fine
        priority: taskFormPriority || "medium",
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
      setTaskFormDescription("");
      setTaskFormPriority("medium");
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
      const alreadyShown = localStorage.getItem("notification-banner-shown") === "1";
      if (Notification.permission === "default" && !alreadyShown) {
        localStorage.setItem("notification-banner-shown", "1");
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
    // Skip notification only when the user is actively viewing this exact channel (window focused)
    if (document.hasFocus() && selectedChannelId === message.channelId) return;
    
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
    let value = e.target.value;
    // Auto-capitalise the very first character
    if (value.length === 1 && value[0] >= 'a' && value[0] <= 'z') {
      value = value[0].toUpperCase() + value.slice(1);
    }
    const cursorPos = e.target.selectionStart || 0;
    setMessageInput(value);
    messageInputRef.current = value;

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

  const sendViaRest = async (
    channelId: string,
    content: string,
    mentions: string[] = [],
    pendingAttachmentPaths?: Array<{ objectPath: string; fileName: string; fileSize: number; mimeType: string }>,
  ) => {
    const response = await fetch(`/api/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content, mentions, ...(pendingAttachmentPaths?.length ? { pendingAttachmentPaths } : {}) }),
    });
    if (!response.ok) throw new Error("Failed to send message");
    return response.json() as Promise<MessageWithAttachments>;
  };

  /**
   * Upload a single file to object storage immediately.
   * Updates setPending in-place with progress/uploading/error/objectPath.
   * Returns the final objectPath on success, null on failure.
   */
  const uploadFileToStorage = async (
    pendingId: string,
    file: File,
    setPending: React.Dispatch<React.SetStateAction<PendingAttachment[]>>,
  ): Promise<string | null> => {
    const mark = (patch: Partial<PendingAttachment>) =>
      setPending(prev => prev.map(p => p.id === pendingId ? { ...p, ...patch } : p));

    mark({ uploading: true, progress: 0, error: false });
    try {
      // Upload via our Express server — avoids all CORS issues with direct-to-GCS.
      const formData = new FormData();
      formData.append("file", file, file.name);

      mark({ progress: 30 });

      const uploadResp = await fetch("/api/uploads/file", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      mark({ progress: 80 });

      if (!uploadResp.ok) {
        const body = await uploadResp.text().catch(() => "");
        console.error("[upload] Server upload failed:", uploadResp.status, body.substring(0, 500));
        throw new Error(`Upload failed: ${uploadResp.status} ${body.substring(0, 200)}`);
      }

      const { objectPath } = await uploadResp.json() as { objectPath: string };

      mark({ progress: 100, uploading: false, objectPath });
      return objectPath;
    } catch (err) {
      console.error("[upload] Failed:", err instanceof Error ? err.message : String(err));
      mark({ uploading: false, error: true });
      return null;
    }
  };

  // Handle file selection for the MAIN compose area — upload immediately on select
  const handleFileSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const newPending: PendingAttachment[] = Array.from(files).map(file => ({
      id: `pending-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      uploading: true,
      error: false,
    }));
    setPendingAttachments(prev => [...prev, ...newPending]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Start uploading each file immediately
    for (const pa of newPending) {
      uploadFileToStorage(pa.id, pa.file, setPendingAttachments);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Handle file selection for a THREAD REPLY compose area — upload immediately on select
  const handleThreadFileSelected = useCallback((parentMessageId: string, files: FileList | null) => {
    if (!files) return;
    const newPending: PendingAttachment[] = Array.from(files).map(file => ({
      id: `pending-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      uploading: true,
      error: false,
    }));
    setThreadPendingAttachments(prev => ({
      ...prev,
      [parentMessageId]: [...(prev[parentMessageId] || []), ...newPending],
    }));
    const input = threadFileInputRefs.current[parentMessageId];
    if (input) input.value = "";
    // Start uploading each file immediately
    for (const pa of newPending) {
      uploadFileToStorage(
        pa.id,
        pa.file,
        (updater) => setThreadPendingAttachments(prev => {
          const arr = prev[parentMessageId] || [];
          const updated = typeof updater === "function" ? (updater as (p: PendingAttachment[]) => PendingAttachment[])(arr) : updater;
          return { ...prev, [parentMessageId]: updated };
        }),
      );
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const readyAttachments = pendingAttachments.filter(p => p.objectPath && !p.error);
    if ((!messageInput.trim() && readyAttachments.length === 0) || !selectedChannelId || isSending) return;

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

    // Collect ready attachments to send atomically with the message
    const uploadedAttachments = pendingAttachments.filter(pa => pa.objectPath && !pa.error);
    const pendingAttachmentPaths = uploadedAttachments.map(pa => ({
      objectPath: pa.objectPath!,
      fileName: pa.file.name,
      fileSize: pa.file.size,
      mimeType: pa.file.type || "application/octet-stream",
    }));
    setPendingAttachments([]);

    try {
      const saved = await sendViaRest(selectedChannelId, content, mentions, pendingAttachmentPaths);
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

      // Attachments are returned from the message create response — hydrate attachmentsMap
      if (saved.attachments && saved.attachments.length > 0) {
        setAttachmentsMap(prev => ({
          ...prev,
          [saved.id]: mergeAttachments(prev[saved.id] || [], saved.attachments),
        }));
      }
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
                <EmptyState
                  variant="inline"
                  title={channels.length > 0
                    ? "All channels are hidden by filters"
                    : channelTypeFilter === "dm" ? "No direct messages yet" : channelTypeFilter === "channel" ? "No channels yet" : "No channels yet"}
                  className="p-4"
                />
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
                          <Badge variant="default" className="h-4 text-data px-1.5" data-testid={`unread-${channel.id}`}>
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
                    <Badge variant="secondary" className="h-5 text-data shrink-0">
                      <Eye className="h-3 w-3 mr-1" />
                      Client
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-sage' : isReconnecting ? 'bg-amber animate-pulse' : 'bg-muted-foreground/40'}`} />
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
                <div className="space-y-4 max-w-4xl mx-auto">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : localMessages.length === 0 ? (
                    <EmptyState
                      variant="inline"
                      icon={Hash}
                      title="No messages yet"
                      description="Start the conversation!"
                      className="p-8"
                    />
                  ) : (
                    localMessages.map((message, idx, arr) => {
                      const isBot = !!message.isBot;
                      const isOwn = !isBot && message.userId === user?.id;
                      const isHighlighted = newMessageIds.has(message.id);
                      const isPinnedHighlight = highlightedMessageId === message.id;
                      const msgReactions = reactionsMap[message.id] || [];
                      const threadOpen = openThreads.has(message.id);
                      const threadCount = message.threadCount || 0;

                      // Day divider + grouping rules
                      const prev = idx > 0 ? arr[idx - 1] : null;
                      const showDayDivider = shouldShowDayDivider(message.createdAt, prev?.createdAt);
                      const gapTooLarge = shouldShowTimestamp(message.createdAt, prev?.createdAt);
                      const sameAuthorAsPrev = !!prev
                        && !!prev.userId === !!message.userId
                        && prev.userId === message.userId
                        && !!prev.isBot === !!message.isBot;
                      const showHeader = showDayDivider || gapTooLarge || !sameAuthorAsPrev;
                      const showTimestamp = gapTooLarge || showDayDivider;

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

                      const authorName = isBot
                        ? 'Assistant'
                        : isOwn
                          ? 'You'
                          : (message.userFirstName && message.userLastName
                              ? `${message.userFirstName} ${message.userLastName}`
                              : message.userEmail || 'Unknown');

                      return (
                        <Fragment key={message.id}>
                          {showDayDivider && (
                            <div
                              className="flex items-center gap-3 py-1"
                              data-testid={`day-divider-${format(new Date(message.createdAt), 'yyyy-MM-dd')}`}
                            >
                              <div className="flex-1 h-px bg-border" />
                              <span className="text-xs font-medium text-muted-foreground px-2">
                                {formatDayDivider(message.createdAt)}
                              </span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                          )}
                        <div
                          ref={(el) => { messageRefs.current[message.id] = el; }}
                          className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''} justify-start ${showHeader ? '' : 'mt-0.5'} ${isHighlighted ? 'animate-pulse' : ''} ${isPinnedHighlight ? 'rounded-lg ring-2 ring-primary/40 bg-primary/5' : ''} group/msg`}
                          data-testid={`message-${message.id}`}
                        >
                          {/* Avatar gutter — visible only on first message of a group; hidden entirely for own messages */}
                          {!isOwn && (
                            showHeader ? (
                              isBot ? (
                                <div className="h-8 w-8 shrink-0 rounded-full bg-primary flex items-center justify-center">
                                  <Sparkles className="h-4 w-4 text-white" />
                                </div>
                              ) : (
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarFallback className="text-xs bg-muted/60">
                                    {getInitials(message.userFirstName, message.userLastName, message.userEmail)}
                                  </AvatarFallback>
                                </Avatar>
                              )
                            ) : (
                              <div className="w-8 shrink-0" aria-hidden="true" />
                            )
                          )}
                          <div className={`flex flex-col gap-1 max-w-[80%] ${isOwn ? 'items-end' : 'items-start'}`}>
                            {showHeader && (
                              <span className="text-xs font-medium text-foreground">
                                {authorName}
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
                                {message.content && (
                                  <div className="break-words whitespace-pre-wrap">
                                    {renderMessageWithMentions(message.content, user?.id)}
                                  </div>
                                )}
                                {/* Attachments */}
                                {(attachmentsMap[message.id] || []).length > 0 && (
                                  <div className={`flex flex-col gap-1.5 ${message.content ? 'mt-2' : ''}`}>
                                    {(attachmentsMap[message.id] || []).map((att) => {
                                      const isImage = att.mimeType?.startsWith("image/");
                                      return isImage ? (
                                        <button
                                          key={att.id}
                                          type="button"
                                          className="block rounded-md overflow-hidden max-w-[280px] group/img relative"
                                          onClick={() => setLightboxUrl(att.fileUrl)}
                                        >
                                          <img
                                            src={att.fileUrl}
                                            alt={att.fileName}
                                            className="max-h-[200px] w-auto object-cover rounded-md"
                                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                          />
                                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                                            <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                                          </div>
                                        </button>
                                      ) : (
                                        <a
                                          key={att.id}
                                          href={att.fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-background/50 hover-elevate max-w-[280px]"
                                        >
                                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-medium truncate">{att.fileName}</span>
                                            {att.fileSize && (
                                              <span className="text-data text-muted-foreground">
                                                {att.fileSize < 1024 * 1024
                                                  ? `${Math.round(att.fileSize / 1024)} KB`
                                                  : `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`}
                                              </span>
                                            )}
                                          </div>
                                          <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-auto" />
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                                {/* Pinned indicator inside bubble */}
                                {message.isPinned && (
                                  <div className="flex items-center gap-1 mt-1 text-data text-muted-foreground">
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
                                    side="right"
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
                                    setTaskFormProjectId(selectedChannel?.projectId || projectId || "");
                                    setTaskFormAssigneeId("");
                                    setTaskFormDueDate("");
                                    setTaskFormDescription("");
                                    setTaskFormPriority("medium");
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
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {Object.entries(reactionGroups).map(([emojiId, group]) => (
                                  <button
                                    key={emojiId}
                                    type="button"
                                    title={group.users.join(", ")}
                                    onClick={() => toggleReaction(message.id, emojiId)}
                                    className={`
                                      inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                                      hover-elevate transition-colors
                                      ${group.myReaction
                                        ? 'bg-primary/20 border-primary/40 text-primary'
                                        : 'bg-muted/50 border-border/70 text-foreground/70 hover:border-border'
                                      }
                                    `}
                                  >
                                    <ReactionIcon id={emojiId} className="h-3.5 w-3.5" />
                                    <span className="tabular-nums">{group.count}</span>
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
                              <div className={`mt-1 w-full space-y-2 ${isOwn ? 'mr-2 border-r-2 border-border pr-3' : 'ml-2 border-l-2 border-border pl-3'}`}>
                                {/* "Replying to [name]" context header */}
                                <div className="text-table text-muted-foreground flex items-center gap-1">
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
                                  (threadMessages[message.id] || []).map((reply, replyIdx, replyArr) => {
                                    const replyIsOwn = reply.userId === user?.id;
                                    const parentName = message.userFirstName && message.userLastName
                                      ? `${message.userFirstName} ${message.userLastName}`
                                      : message.userEmail || "Unknown";
                                    const prevReply = replyIdx > 0 ? replyArr[replyIdx - 1] : null;
                                    const replyShowDayDivider = shouldShowDayDivider(reply.createdAt, prevReply?.createdAt);
                                    const replyGapTooLarge = shouldShowTimestamp(reply.createdAt, prevReply?.createdAt);
                                    const replySameAuthor = !!prevReply
                                      && !!prevReply.userId === !!reply.userId
                                      && prevReply.userId === reply.userId
                                      && !!prevReply.isBot === !!reply.isBot;
                                    const replyShowHeader = replyShowDayDivider || replyGapTooLarge || !replySameAuthor;
                                    const replyShowTimestamp = replyGapTooLarge || replyShowDayDivider;
                                    const replyAuthor = replyIsOwn
                                      ? 'You'
                                      : (reply.userFirstName && reply.userLastName
                                          ? `${reply.userFirstName} ${reply.userLastName}`
                                          : reply.userEmail || 'Unknown');
                                    return (
                                      <Fragment key={reply.id}>
                                        {replyShowDayDivider && (
                                          <div className="flex items-center gap-2 py-0.5">
                                            <div className="flex-1 h-px bg-border" />
                                            <span className="text-data font-medium text-muted-foreground px-1.5">
                                              {formatDayDivider(reply.createdAt)}
                                            </span>
                                            <div className="flex-1 h-px bg-border" />
                                          </div>
                                        )}
                                      <div className={`flex gap-2 items-start ${replyShowHeader ? '' : 'mt-0.5'} ${replyIsOwn ? 'flex-row-reverse' : ''} justify-start`}>
                                        {!replyIsOwn && (
                                          replyShowHeader ? (
                                            <Avatar className="h-6 w-6 shrink-0">
                                              <AvatarFallback className="text-data bg-muted/60">
                                                {getInitials(reply.userFirstName, reply.userLastName, reply.userEmail)}
                                              </AvatarFallback>
                                            </Avatar>
                                          ) : (
                                            <div className="w-6 shrink-0" aria-hidden="true" />
                                          )
                                        )}
                                        <div className={`flex flex-col gap-0.5 flex-1 ${replyIsOwn ? 'items-end' : 'items-start'}`}>
                                          {replyShowHeader && (
                                            <span className="text-table font-medium text-foreground">
                                              {replyAuthor}
                                            </span>
                                          )}
                                          <div className={`
                                            px-2.5 pt-1 pb-1.5 rounded-lg text-sm
                                            ${replyIsOwn
                                              ? 'bg-primary/10 text-foreground border border-primary/20'
                                              : 'bg-muted/20 text-foreground'
                                            }
                                          `}>
                                            {/* "Reply to [name]" label inside each reply bubble */}
                                            <div className="text-data text-muted-foreground mb-1">
                                              Replying to <span className="font-medium text-foreground/70">{parentName}</span>
                                            </div>
                                            {reply.content && (
                                              <div className="break-words whitespace-pre-wrap">
                                                {renderMessageWithMentions(reply.content, user?.id)}
                                              </div>
                                            )}
                                            {/* Attachments in thread replies */}
                                            {(attachmentsMap[reply.id] || []).length > 0 && (
                                              <div className={`flex flex-col gap-1 ${reply.content ? 'mt-1.5' : ''}`}>
                                                {(attachmentsMap[reply.id] || []).map((att) => {
                                                  const isImg = att.mimeType?.startsWith("image/");
                                                  return isImg ? (
                                                    <button
                                                      key={att.id}
                                                      type="button"
                                                      className="block rounded overflow-hidden max-w-[200px]"
                                                      onClick={() => setLightboxUrl(att.fileUrl)}
                                                    >
                                                      <img
                                                        src={att.fileUrl}
                                                        alt={att.fileName}
                                                        className="max-h-[140px] w-auto object-cover rounded"
                                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                      />
                                                    </button>
                                                  ) : (
                                                    <a
                                                      key={att.id}
                                                      href={att.fileUrl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-background/50 hover-elevate max-w-[240px]"
                                                    >
                                                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-xs font-medium truncate">{att.fileName}</span>
                                                        {att.fileSize && (
                                                          <span className="text-data text-muted-foreground">
                                                            {att.fileSize < 1024 * 1024
                                                              ? `${Math.round(att.fileSize / 1024)} KB`
                                                              : `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`}
                                                          </span>
                                                        )}
                                                      </div>
                                                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-auto" />
                                                    </a>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                          {replyShowTimestamp && (
                                            <span
                                              className="text-data text-muted-foreground"
                                              title={format(new Date(reply.createdAt), "EEE d MMM yyyy, h:mm a")}
                                            >
                                              {formatMessageTime(reply.createdAt)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      </Fragment>
                                    );
                                  })
                                )}
                                {/* Reply compose area */}
                                <div className="flex flex-col gap-1 pt-1">
                                  {/* Thread pending attachment chips */}
                                  {(threadPendingAttachments[message.id] || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {(threadPendingAttachments[message.id] || []).map(pa => (
                                        <div
                                          key={pa.id}
                                          className="flex flex-col gap-0.5 px-1.5 py-0.5 rounded border bg-muted/30 text-data max-w-[140px]"
                                        >
                                          <div className="flex items-center gap-1">
                                            {pa.error ? (
                                              <X className="h-2.5 w-2.5 shrink-0 text-destructive" />
                                            ) : pa.uploading ? (
                                              <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-muted-foreground" />
                                            ) : (
                                              <FileText className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className="truncate">{pa.file.name}</span>
                                            <button
                                              type="button"
                                              className="shrink-0 text-muted-foreground hover:text-destructive"
                                              onClick={() => setThreadPendingAttachments(prev => ({
                                                ...prev,
                                                [message.id]: (prev[message.id] || []).filter(p => p.id !== pa.id),
                                              }))}
                                            >
                                              <X className="h-2.5 w-2.5" />
                                            </button>
                                          </div>
                                          {pa.uploading && (
                                            <div className="w-full h-0.5 bg-muted rounded-full overflow-hidden">
                                              <div
                                                className="h-full bg-primary transition-all duration-200"
                                                style={{ width: `${pa.progress}%` }}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Hidden file input for thread reply */}
                                  <input
                                    ref={el => { threadFileInputRefs.current[message.id] = el; }}
                                    type="file"
                                    multiple
                                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                                    className="hidden"
                                    onChange={e => handleThreadFileSelected(message.id, e.target.files)}
                                  />
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      aria-label="Attach file to reply"
                                      className="h-7 w-7"
                                      onClick={() => threadFileInputRefs.current[message.id]?.click()}
                                    >
                                      <Paperclip className="h-3 w-3" />
                                    </Button>
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
                                      disabled={
                                        (!threadInputs[message.id]?.trim() &&
                                          (threadPendingAttachments[message.id] || []).filter(p => p.objectPath && !p.error).length === 0) ||
                                        (threadPendingAttachments[message.id] || []).some(p => p.uploading) ||
                                        sendingThreads.has(message.id)
                                      }
                                      onClick={() => sendReply(message.id, message.channelId)}
                                    >
                                      {sendingThreads.has(message.id)
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Send className="h-3.5 w-3.5" />
                                      }
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {showTimestamp && (
                              <span
                                className="text-data text-muted-foreground"
                                title={format(new Date(message.createdAt), "EEE d MMM yyyy, h:mm a")}
                              >
                                {formatMessageTime(message.createdAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        </Fragment>
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
                                  <p className="text-table text-muted-foreground mt-0.5">
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
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  className="hidden"
                  onChange={e => handleFileSelected(e.target.files)}
                />
                {/* Pending attachment chips with upload progress */}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {pendingAttachments.map(pa => (
                      <div
                        key={pa.id}
                        className="flex flex-col gap-0.5 px-2 py-1 rounded-md border bg-muted/30 text-xs max-w-[180px]"
                      >
                        <div className="flex items-center gap-1.5">
                          {pa.error ? (
                            <X className="h-3 w-3 shrink-0 text-destructive" />
                          ) : pa.uploading ? (
                            <Loader2 className="h-3 w-3 shrink-0 text-muted-foreground animate-spin" />
                          ) : pa.file.type.startsWith("image/") ? (
                            <ZoomIn className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <span className={`truncate ${pa.error ? 'text-destructive' : 'text-foreground'}`}>
                            {pa.file.name}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingAttachments(prev => prev.filter(p => p.id !== pa.id))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {pa.uploading && (
                          <div className="w-full h-0.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-200"
                              style={{ width: `${pa.progress}%` }}
                            />
                          </div>
                        )}
                        {pa.error && (
                          <span className="text-data text-destructive">Upload failed</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                    {/* Attach button */}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Attach file"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-attach"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
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
                      disabled={
                        (!messageInput.trim() && pendingAttachments.filter(p => p.objectPath && !p.error).length === 0) ||
                        pendingAttachments.some(p => p.uploading) ||
                        isSending
                      }
                      className="h-9"
                      data-testid="button-send"
                    >
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                variant="inline"
                icon={Hash}
                title="Select a channel to start messaging"
              />
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
              {createChannelMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>) : "Create Channel"}
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
              {createDmMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting...</>) : "Start Conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task from Message Dialog */}
      <Dialog open={createTaskFromMsg !== null} onOpenChange={(open) => {
        if (!open) {
          setCreateTaskFromMsg(null);
          setTaskFormDescription("");
          setTaskFormPriority("medium");
        }
      }}>
        <DialogContent className="max-w-lg" data-testid="dialog-create-task-from-message">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              Create Task from Message
            </DialogTitle>
            <DialogDescription>
              This task will be linked to the channel and appear as a card in the chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={taskFormTitle}
                onChange={(e) => setTaskFormTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                data-testid="input-task-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={taskFormDescription}
                onChange={(e) => setTaskFormDescription(e.target.value)}
                placeholder="Add more detail (optional)…"
                className="resize-none text-sm min-h-[72px]"
                data-testid="input-task-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={taskFormPriority} onValueChange={setTaskFormPriority}>
                  <SelectTrigger id="task-priority" data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-project">Project</Label>
                <Select value={taskFormProjectId} onValueChange={setTaskFormProjectId}>
                  <SelectTrigger id="task-project" data-testid="select-task-project">
                    <SelectValue placeholder={user?.companyNickname ?? "Business"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{user?.companyNickname ?? "Business"}</SelectItem>
                    {allProjects.length > 0 && <SelectSeparator />}
                    {allProjects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
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
                            return (
                              <EmptyState
                                variant="inline"
                                title="No pinned messages yet."
                                className="py-3"
                              />
                            );
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
                                  <AvatarFallback className="text-data">
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
                            <AvatarFallback className="text-table">
                              {getInitials(memberUser?.firstName, memberUser?.lastName, memberUser?.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate">{displayName}</span>
                          {isOwner && (
                            <Badge variant="secondary" className="text-data shrink-0 px-1.5">
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
                                <AvatarFallback className="text-table">
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

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-lg bg-black/40"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Attachment preview"
            className="max-w-full max-h-full object-contain rounded-md"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
