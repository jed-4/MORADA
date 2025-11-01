import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSocket, useChannelMessages } from "@/lib/socket";
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
  const { socket, isConnected, joinChannel, leaveChannel, sendMessage } = useSocket();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch channels
  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
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

  // Listen for new messages
  useChannelMessages(selectedChannelId, (message) => {
    setLocalMessages(prev => [...prev, message]);
    scrollToBottom();
  });

  // Join/leave channels when selection changes
  useEffect(() => {
    if (selectedChannelId && isConnected) {
      joinChannel(selectedChannelId);
      return () => {
        leaveChannel(selectedChannelId);
      };
    }
  }, [selectedChannelId, isConnected, joinChannel, leaveChannel]);

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
      return apiRequest("/api/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: "channel" })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    }
  });

  // Create sample data mutation
  const seedSampleDataMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/channels/seed-sample", {
        method: "POST"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    }
  });

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannelId) return;

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
              channels.map((channel) => (
                <Button
                  key={channel.id}
                  variant={selectedChannelId === channel.id ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2"
                  onClick={() => setSelectedChannelId(channel.id)}
                  data-testid={`channel-${channel.id}`}
                >
                  <Hash className="h-4 w-4" />
                  <span className="truncate">{channel.name}</span>
                </Button>
              ))
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

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
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
