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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hash, Plus, Send, Loader2, Sparkles, MoreVertical, Bell, BellOff, Lock, Eye, Settings, UserPlus } from "lucide-react";
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
            ? 'bg-[#bba7db]/20 text-[#bba7db] border border-[#bba7db]/20' 
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

export default function Messages() {
  const { user } = useAuth();
  const { socket, isConnected, joinChannel, leaveChannel, sendMessage, startTyping, stopTyping, markAsRead } = useSocket();
  
  useEffect(() => {
    document.title = "Messages | BuildPro";
  }, []);
  
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [isClientFacing, setIsClientFacing] = useState(false);
  
  const [isAddPeopleOpen, setIsAddPeopleOpen] = useState(false);
  const [isChannelSettingsOpen, setIsChannelSettingsOpen] = useState(false);
  
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const { data: unreadCounts = {}, isLoading: unreadLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/channels", selectedChannelId, "messages"],
    enabled: !!selectedChannelId,
  });

  useEffect(() => {
    if (messages) {
      setLocalMessages(messages);
    }
  }, [messages]);

  useChannelMessages(selectedChannelId, (message) => {
    setLocalMessages(prev => [...prev, message]);
    scrollToBottom();
    
    if (selectedChannelId) {
      markAsRead(selectedChannelId);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      }, 100);
    }
  });

  useAllNewMessages(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
  });

  const typingUserIds = useTypingIndicator(selectedChannelId);

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  useEffect(() => {
    if (selectedChannelId && isConnected) {
      joinChannel(selectedChannelId);
      markAsRead(selectedChannelId);
      
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      }, 100);
      
      return () => {
        leaveChannel(selectedChannelId);
      };
    }
  }, [selectedChannelId, isConnected, joinChannel, leaveChannel, markAsRead]);

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
    const mention = `@[${name}](userId:${userId})`;
    
    setMessageInput(beforeMention + mention + ' ' + afterMention);
    setShowMentionPicker(false);
    
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannelId) return;

    stopTyping(selectedChannelId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

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
        
        sendMessage(selectedChannelId, `🤖 Creating task: "${taskTitle}"...`);
        
        const currentChannel = channels.find(c => c.id === selectedChannelId);
        const projectId = currentChannel?.projectId || null;
        
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

    const mentionRegex = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(messageInput)) !== null) {
      mentions.push(match[2]);
    }

    sendMessage(selectedChannelId, messageInput, mentions);
    setMessageInput("");
    setShowMentionPicker(false);
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

  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  const filteredMentionUsers = allUsers.filter((u: any) => {
    if (!mentionSearch) return true;
    const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
    return fullName.includes(mentionSearch) || (u.email || '').toLowerCase().includes(mentionSearch);
  });

  const typingUsers = (Array.isArray(typingUserIds) ? typingUserIds : [])
    .map((id: string) => allUsers.find((u: any) => u.id === id))
    .filter(Boolean)
    .map((u: any) => u.firstName || u.email || 'Someone');

  return (
    <div className="h-full flex flex-col">
      {/* Notification Banner */}
      {showNotificationBanner && isNotificationSupported() && notificationPermission === "default" && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-blue-50 dark:bg-blue-950/20" data-testid="notification-banner">
          <Bell className="h-4 w-4" />
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

      {/* 2-row header matching ClickUp 2025 pattern */}
      <div className="shrink-0 border-b bg-background">
        {/* Row 1: Page title + connection status */}
        <div className="h-9 px-4 flex items-center justify-between">
          <h1 className="text-sm font-semibold">Messages</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        {/* Row 2: Channel info + actions */}
        {selectedChannel && (
          <div className="h-9 px-4 flex items-center justify-between border-t">
            <div className="flex items-center gap-2 min-w-0">
              <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate">{selectedChannel.name}</span>
              {selectedChannel.isClientFacing && (
                <Badge variant="secondary" className="h-4 text-[10px] shrink-0">
                  <Eye className="h-3 w-3 mr-1" />
                  Client
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <NotificationSettingsButton />
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setIsAddPeopleOpen(true)}
                data-testid="button-add-people"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setIsChannelSettingsOpen(true)}
                data-testid="button-channel-settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar - Channels List */}
        <div className="w-60 border-r flex flex-col bg-muted/20">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channels</span>
            <div className="flex items-center gap-1">
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
                onClick={() => setIsCreateChannelOpen(true)}
                data-testid="button-new-channel"
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
              ) : channels.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground p-4">
                  No channels yet
                </div>
              ) : (
                channels.map((channel) => {
                  const unreadCount = unreadCounts[channel.id] || 0;
                  const isActive = selectedChannelId === channel.id;
                  
                  return (
                    <button
                      key={channel.id}
                      className={`
                        w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm
                        transition-all
                        ${isActive 
                          ? 'bg-[#bba7db]/10 text-[#bba7db] font-medium' 
                          : 'hover-elevate text-foreground'
                        }
                      `}
                      onClick={() => setSelectedChannelId(channel.id)}
                      data-testid={`channel-${channel.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {channel.isClientFacing ? (
                          <Eye className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                        )}
                        <span className="truncate">{channel.name}</span>
                      </div>
                      {unreadCount > 0 && !isActive && (
                        <Badge variant="default" className="h-4 text-[10px] px-1.5 shrink-0" data-testid={`unread-${channel.id}`}>
                          {unreadCount}
                        </Badge>
                      )}
                    </button>
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
                      
                      return (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'animate-pulse' : ''}`}
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
                            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
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
                            <div
                              className={`
                                px-3 py-2 rounded-xl text-sm
                                ${isOwn 
                                  ? 'bg-[#bba7db]/10 text-foreground border border-[#bba7db]/20' 
                                  : isBot
                                    ? 'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 text-foreground border border-purple-200 dark:border-purple-800'
                                    : 'bg-muted/30 text-foreground'
                                }
                              `}
                            >
                              <div className="break-words whitespace-pre-wrap">
                                {renderMessageWithMentions(message.content, user?.id)}
                              </div>
                            </div>
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
                      placeholder="Type a message... (@ to mention, /task to create task)"
                      className="h-9 flex-1"
                      data-testid="input-message"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!messageInput.trim()}
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

      {/* Add People Dialog */}
      <Dialog open={isAddPeopleOpen} onOpenChange={setIsAddPeopleOpen}>
        <DialogContent data-testid="dialog-add-people">
          <DialogHeader>
            <DialogTitle>Add People</DialogTitle>
            <DialogDescription>
              Invite team members to this channel
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This feature is coming soon. All team members currently have access to all channels.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsAddPeopleOpen(false)} data-testid="button-close-add-people">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel Settings Dialog */}
      <Dialog open={isChannelSettingsOpen} onOpenChange={setIsChannelSettingsOpen}>
        <DialogContent data-testid="dialog-channel-settings">
          <DialogHeader>
            <DialogTitle>Channel Settings</DialogTitle>
            <DialogDescription>
              Configure settings for #{selectedChannel?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Channel settings coming soon. You'll be able to manage permissions, notifications, and more.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsChannelSettingsOpen(false)} data-testid="button-close-settings">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
