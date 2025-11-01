import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSocket, useChannelMessages, useTypingIndicator, useAllNewMessages } from "@/lib/socket";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { Hash, Plus, Send, Loader2, Sparkles, Menu, X, Bell, BellOff, Lock, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Channel, Message, ChannelMember } from "@shared/schema";
import {
  initFavicon,
  updateFaviconBadge,
  showMessageNotification,
  isNotificationSupported,
  requestNotificationPermission,
  areNotificationsGranted,
} from "@/lib/notifications";
import { NotificationSettingsButton } from "@/components/NotificationSettings";

// Helper to parse and render mentions in messages
function renderMessageWithMentions(content: string, currentUserId?: string) {
  // Parse mentions in format @[Name](userId:123)
  const mentionRegex = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }
    
    // Add highlighted mention
    const name = match[1];
    const userId = match[2];
    const isCurrentUser = userId === currentUserId;
    
    parts.push(
      <span 
        key={match.index}
        className={`inline-flex items-center px-1.5 py-0.5 rounded ${
          isCurrentUser 
            ? 'bg-primary/20 text-primary font-semibold' 
            : 'bg-accent/50 text-accent-foreground'
        }`}
        data-testid={`mention-${userId}`}
      >
        @{name}
      </span>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : content;
}

export default function Communications() {
  const { user } = useAuth();
  const { socket, isConnected, joinChannel, leaveChannel, sendMessage, startTyping, stopTyping, markAsRead } = useSocket();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Create channel dialog state
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [isClientFacing, setIsClientFacing] = useState(false);
  
  // Notification state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  
  // Mention picker state
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch channels
  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  // Fetch unread counts
  const { data: unreadCounts = {}, isLoading: unreadLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
  });

  // Fetch messages for selected channel
  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/channels", selectedChannelId, "messages"],
    enabled: !!selectedChannelId,
  });

  // Update local messages when fetched messages change
  useEffect(() => {
    if (messages) {
      setLocalMessages(messages);
    }
  }, [messages]);

  // Listen for new messages in current channel
  useChannelMessages(selectedChannelId, (message) => {
    setLocalMessages(prev => [...prev, message]);
    scrollToBottom();
    
    // Mark as read when new message arrives in currently viewed channel
    if (selectedChannelId) {
      markAsRead(selectedChannelId);
      // Invalidate unread counts to clear the badge immediately
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      }, 100);
    }
  });

  // Listen for ALL new messages to update unread badges
  useAllNewMessages(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
  });

  // Get typing indicators for the selected channel
  const typingUserIds = useTypingIndicator(selectedChannelId);

  // Fetch user info for typing users
  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Join/leave channels when selection changes
  useEffect(() => {
    if (selectedChannelId && isConnected) {
      joinChannel(selectedChannelId);
      
      // Mark as read when joining channel and invalidate unread counts
      markAsRead(selectedChannelId);
      
      // Wait a bit then invalidate to ensure backend has updated
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      }, 100);
      
      return () => {
        leaveChannel(selectedChannelId);
      };
    }
  }, [selectedChannelId, isConnected, joinChannel, leaveChannel, markAsRead]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [localMessages]);

  // Initialize notifications on mount
  useEffect(() => {
    // Initialize favicon
    initFavicon();
    
    // Check notification permission
    if (isNotificationSupported()) {
      setNotificationPermission(Notification.permission);
      // Show banner if permission not granted
      if (Notification.permission === "default") {
        setShowNotificationBanner(true);
      }
    }
  }, []);

  // Update favicon badge when unread counts change
  useEffect(() => {
    const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
    updateFaviconBadge(totalUnread);
  }, [unreadCounts]);

  // Listen for new messages and show notifications
  useAllNewMessages((message: Message) => {
    // Don't notify for own messages
    if (message.userId === user?.id) return;
    
    // Don't notify for messages in currently viewed channel
    if (selectedChannelId === message.channelId) return;
    
    // Find the channel for this message
    const channel = channels.find(c => c.id === message.channelId);
    if (!channel) return;
    
    // Track as new message for highlighting
    setNewMessageIds(prev => new Set(prev).add(message.id));
    
    // Check if user is mentioned
    const mentions = Array.isArray(message.mentions) ? message.mentions : [];
    const isMention = mentions.includes(user?.id || "");
    
    // Show notification
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

  // Request notification permission
  const handleRequestNotificationPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      setShowNotificationBanner(false);
    }
  };

  // Create channel mutation
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

  // Create sample data mutation
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

  // Handle typing input change
  const handleMessageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessageInput(value);

    // Detect @ mention trigger
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtPos !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtPos + 1);
      // Show picker if @ is at start or preceded by space, and followed by alphanumeric only
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

    // Emit typing start
    if (value.trim() && !typingTimeoutRef.current) {
      startTyping(selectedChannelId);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing after 2 seconds of inactivity
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
  
  // Insert mention into message
  const insertMention = (userId: string, firstName: string | null, lastName: string | null, email: string | null) => {
    const name = firstName && lastName 
      ? `${firstName} ${lastName}` 
      : email || 'Unknown';
    
    // Replace @search with @[Name](userId:xxx)
    const beforeMention = messageInput.substring(0, mentionStartPos);
    const afterMention = messageInput.substring(inputRef.current?.selectionStart || messageInput.length);
    const mention = `@[${name}](userId:${userId})`;
    
    setMessageInput(beforeMention + mention + ' ' + afterMention);
    setShowMentionPicker(false);
    
    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannelId) return;

    // Stop typing indicator
    stopTyping(selectedChannelId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Check for /task bot command
    const taskCommandRegex = /^\/task\s+(.+)$/i;
    const taskMatch = messageInput.match(taskCommandRegex);
    
    if (taskMatch) {
      try {
        const taskTitle = taskMatch[1].trim();
        
        if (!taskTitle) {
          sendMessage(selectedChannelId, `❌ Task title cannot be empty. Usage: /task Your task description`);
          setMessageInput("");
          return;
        }
        
        // Send bot message to channel
        sendMessage(selectedChannelId, `🤖 Creating task: "${taskTitle}"...`);
        
        // Get channel's projectId (null for general/company-wide channels)
        const currentChannel = channels.find(c => c.id === selectedChannelId);
        const projectId = currentChannel?.projectId || null;
        
        // Create task via API
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: taskTitle,
            type: "task",
            status: "todo",
            projectId: projectId,
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create task");
        }
        
        const newTask = await response.json();
        
        // Send success message
        const taskType = projectId ? "project" : "business";
        sendMessage(selectedChannelId, `✅ Task created: "${newTask.title}" (${taskType} task, ID: ${newTask.id.slice(0, 8)})`);
      } catch (error: any) {
        console.error("Failed to create task:", error);
        sendMessage(selectedChannelId, `❌ Failed to create task: ${error.message}`);
      }
      
      setMessageInput("");
      setShowMentionPicker(false);
      return;
    }

    // Extract mentioned user IDs
    const mentionRegex = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(messageInput)) !== null) {
      mentions.push(match[2]); // user ID
    }

    // Send via socket (socket handler will add mentions array to message)
    sendMessage(selectedChannelId, messageInput, mentions);
    setMessageInput("");
    setShowMentionPicker(false);
  };

  // Get initials for avatar
  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string | null) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  // Select first channel by default
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col relative">
      {/* Notification Permission Banner */}
      {showNotificationBanner && isNotificationSupported() && notificationPermission === "default" && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-blue-50 dark:bg-blue-950" data-testid="notification-banner">
          <Bell className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-sm">Enable notifications to get alerts for new messages and @mentions</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
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

      {/* Unsupported Browser Banner */}
      {!isNotificationSupported() && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-yellow-50 dark:bg-yellow-950" data-testid="browser-unsupported-banner">
          <BellOff className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Your browser doesn't support notifications. In-app highlights will still work.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex-1 flex relative min-h-0">
        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            data-testid="sidebar-overlay"
          />
        )}
      
      {/* Left Sidebar - Channels List */}
      <Card className={`
        w-64 flex flex-col border-r rounded-none border-l-0 border-t-0 border-b-0
        absolute md:relative inset-y-0 left-0 z-50 md:z-0
        transform transition-transform duration-200 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-lg" data-testid="text-communications">Communications</h2>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              onClick={() => setIsSidebarOpen(false)}
              data-testid="button-close-sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
            <NotificationSettingsButton />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => seedSampleDataMutation.mutate()}
              disabled={seedSampleDataMutation.isPending || channels.length > 0}
              title="Load sample channels and messages"
              data-testid="button-seed-sample"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsCreateChannelOpen(true)}
              data-testid="button-new-channel"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {channelsLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : channels.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground p-4">
                No channels yet
              </div>
            ) : (
              channels.map((channel) => {
                const unreadCount = unreadCounts[channel.id] || 0;
                const isClientFacing = channel.isClientFacing || false;
                const channelIcon = isClientFacing ? Eye : Lock;
                const ChannelIcon = channelIcon;
                
                return (
                  <Button
                    key={channel.id}
                    variant={selectedChannelId === channel.id ? "secondary" : "ghost"}
                    className={`w-full justify-between gap-2 ${
                      isClientFacing 
                        ? 'border-l-2 border-l-green-500 dark:border-l-green-400' 
                        : 'border-l-2 border-l-blue-500 dark:border-l-blue-400'
                    }`}
                    onClick={() => {
                      setSelectedChannelId(channel.id);
                      setIsSidebarOpen(false); // Close sidebar on mobile
                    }}
                    data-testid={`channel-${channel.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChannelIcon className={`h-4 w-4 flex-shrink-0 ${
                        isClientFacing ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                      }`} />
                      <span className="truncate">{channel.name}</span>
                    </div>
                    {unreadCount > 0 && selectedChannelId !== channel.id && (
                      <Badge variant="default" className="ml-auto flex-shrink-0" data-testid={`unread-${channel.id}`}>
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </Card>

      {/* Main Panel - Messages */}
      <div className="flex-1 flex flex-col">
        {selectedChannel ? (
          <>
            {/* Channel Header */}
            <div className={`p-4 border-b flex items-center justify-between ${
              selectedChannel.isClientFacing 
                ? 'bg-green-50 dark:bg-green-950/20 border-b-green-200 dark:border-b-green-800' 
                : 'bg-blue-50 dark:bg-blue-950/20 border-b-blue-200 dark:border-b-blue-800'
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="icon"
                  variant="ghost"
                  className="md:hidden"
                  onClick={() => setIsSidebarOpen(true)}
                  data-testid="button-toggle-sidebar"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                {selectedChannel.isClientFacing ? (
                  <Eye className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                )}
                <h3 className="font-semibold text-lg" data-testid="text-channel-name">{selectedChannel.name}</h3>
                {selectedChannel.isClientFacing && (
                  <Badge className="bg-green-600 dark:bg-green-700 text-white font-bold" data-testid="badge-client-channel">
                    CLIENT CHANNEL
                  </Badge>
                )}
              </div>
              <Badge variant="outline" data-testid="badge-channel-type">
                {selectedChannel.type === 'dm' ? 'Direct Message' : selectedChannel.isClientFacing ? 'Client Facing' : 'Internal'}
              </Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : localMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                <div className="space-y-4">
                  {localMessages.map((message) => {
                    const isNewMessage = newMessageIds.has(message.id);
                    const mentions = Array.isArray(message.mentions) ? message.mentions : [];
                    const isMentioned = mentions.includes(user?.id || "");
                    
                    return (
                    <div 
                      key={message.id} 
                      className={`flex gap-3 p-2 -mx-2 rounded transition-colors ${
                        isNewMessage 
                          ? isMentioned 
                            ? 'bg-amber-100 dark:bg-amber-950/30 font-semibold'
                            : 'bg-blue-50 dark:bg-blue-950/20'
                          : ''
                      }`}
                      data-testid={`message-${message.id}`}
                      onClick={() => {
                        // Remove highlight when clicked
                        if (isNewMessage) {
                          setNewMessageIds(prev => {
                            const next = new Set(prev);
                            next.delete(message.id);
                            return next;
                          });
                        }
                      }}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(message.userFirstName, message.userLastName, message.userEmail)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm">
                            {message.userFirstName && message.userLastName 
                              ? `${message.userFirstName} ${message.userLastName}`
                              : message.userEmail}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                          {renderMessageWithMentions(message.content, user?.id)}
                        </p>
                      </div>
                    </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Typing Indicator */}
            {typingUserIds.size > 0 && (
              <div className="px-4 py-2 text-sm text-muted-foreground">
                {Array.from(typingUserIds).map(userId => {
                  const typingUser = allUsers.find(u => u.id === userId);
                  const displayName = typingUser?.firstName 
                    ? `${typingUser.firstName} ${typingUser.lastName || ''}`.trim()
                    : typingUser?.email || 'Someone';
                  return displayName;
                }).filter(name => name !== 'Someone').join(', ') || 'Someone'} {typingUserIds.size === 1 ? 'is' : 'are'} typing...
              </div>
            )}

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t">
              <div className="relative">
                {/* Mention Picker */}
                {showMentionPicker && (
                  <Card className="absolute bottom-full mb-2 left-0 max-w-sm w-full max-h-60 overflow-auto z-50 border shadow-lg">
                    <div className="p-2 border-b text-xs font-semibold text-muted-foreground">
                      Mention someone
                    </div>
                    <ScrollArea className="max-h-48">
                      {allUsers
                        .filter(u => {
                          if (!mentionSearch) return true;
                          const searchLower = mentionSearch.toLowerCase();
                          const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
                          const email = (u.email || '').toLowerCase();
                          return fullName.includes(searchLower) || email.includes(searchLower);
                        })
                        .slice(0, 10)
                        .map((mentionUser) => (
                          <button
                            key={mentionUser.id}
                            type="button"
                            onClick={() => insertMention(mentionUser.id, mentionUser.firstName, mentionUser.lastName, mentionUser.email)}
                            className="w-full flex items-center gap-2 p-2 hover-elevate active-elevate-2 rounded text-left"
                            data-testid={`mention-option-${mentionUser.id}`}
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {getInitials(mentionUser.firstName, mentionUser.lastName, mentionUser.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">
                                {mentionUser.firstName && mentionUser.lastName 
                                  ? `${mentionUser.firstName} ${mentionUser.lastName}`
                                  : mentionUser.email}
                              </div>
                              {mentionUser.firstName && mentionUser.lastName && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {mentionUser.email}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                    </ScrollArea>
                  </Card>
                )}
                
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={messageInput}
                    onChange={handleMessageInputChange}
                    placeholder={`Message #${selectedChannel.name}`}
                    className="flex-1"
                    data-testid="input-message"
                  />
                  <Button 
                    type="submit" 
                    disabled={!messageInput.trim() || !isConnected}
                    data-testid="button-send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </form>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a channel to start messaging
          </div>
        )}
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newChannelName.trim()) {
                createChannelMutation.mutate({ 
                  name: newChannelName.trim(),
                  isClientFacing 
                });
                setNewChannelName("");
                setIsClientFacing(false);
                setIsCreateChannelOpen(false);
              }
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="channel-name">Channel Name</Label>
                <Input
                  id="channel-name"
                  placeholder={isClientFacing ? "e.g., 26-ocean-client" : "e.g., 26-ocean-internal"}
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  autoFocus
                  data-testid="input-channel-name"
                />
              </div>
              
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="client-facing" className="text-base font-semibold">
                    {isClientFacing ? "Client-Facing Channel" : "Internal Channel"}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {isClientFacing 
                      ? "Client can see messages - BE CAREFUL with costs & subcontractors"
                      : "Internal team only - safe for sensitive information"
                    }
                  </p>
                </div>
                <Switch
                  id="client-facing"
                  checked={isClientFacing}
                  onCheckedChange={setIsClientFacing}
                  data-testid="switch-client-facing"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
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
                type="submit"
                disabled={!newChannelName.trim() || createChannelMutation.isPending}
                data-testid="button-create"
              >
                {createChannelMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Channel"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
