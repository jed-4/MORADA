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
import { Hash, Plus, Send, Loader2, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Channel, Message, ChannelMember } from "@shared/schema";

export default function Communications() {
  const { user } = useAuth();
  const { socket, isConnected, joinChannel, leaveChannel, sendMessage, startTyping, stopTyping, markAsRead } = useSocket();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Create channel mutation
  const createChannelMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "channel" }),
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
    setMessageInput(value);

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

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannelId) return;

    // Stop typing indicator
    stopTyping(selectedChannelId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Send via socket
    sendMessage(selectedChannelId, messageInput);
    setMessageInput("");
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
    <div className="h-[calc(100vh-3.5rem)] flex">
      {/* Left Sidebar - Channels List */}
      <Card className="w-64 flex flex-col border-r rounded-none border-l-0 border-t-0 border-b-0">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-lg" data-testid="text-communications">Communications</h2>
          <div className="flex gap-1">
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
              onClick={() => {
                const name = prompt("Enter channel name:");
                if (name) createChannelMutation.mutate(name);
              }}
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
                return (
                  <Button
                    key={channel.id}
                    variant={selectedChannelId === channel.id ? "secondary" : "ghost"}
                    className="w-full justify-between gap-2"
                    onClick={() => setSelectedChannelId(channel.id)}
                    data-testid={`channel-${channel.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Hash className="h-4 w-4 flex-shrink-0" />
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
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-lg" data-testid="text-channel-name">{selectedChannel.name}</h3>
              </div>
              <Badge variant="outline" data-testid="badge-channel-type">
                {selectedChannel.type === 'dm' ? 'Direct Message' : 'Channel'}
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
                  {localMessages.map((message) => (
                    <div key={message.id} className="flex gap-3" data-testid={`message-${message.id}`}>
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
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{message.content}</p>
                      </div>
                    </div>
                  ))}
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
              <div className="flex gap-2">
                <Input
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
            </form>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a channel to start messaging
          </div>
        )}
      </div>
    </div>
  );
}
