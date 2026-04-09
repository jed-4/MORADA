import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { MessageSquare, ArrowLeft, ExternalLink, Send, Loader2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import type { Channel, Message } from "@shared/schema";

interface ChannelWithMeta extends Channel {
  isPinned?: boolean;
  lastMessageAt?: Date | string | null;
  messageCount?: number;
}

function getInitials(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null
): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName.substring(0, 2).toUpperCase();
  if (email) return email.substring(0, 2).toUpperCase();
  return "?";
}

export function MessagesDropdown() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "chat">("list");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
    refetchInterval: 30000,
  });

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);

  const { data: channels = [] } = useQuery<ChannelWithMeta[]>({
    queryKey: ["/api/channels"],
    enabled: open,
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/channels", selectedChannelId, "messages"],
    enabled: !!selectedChannelId && view === "chat",
  });

  const markReadMut = useMutation({
    mutationFn: (channelId: string) =>
      fetch(`/api/channels/${channelId}/read`, { method: "POST", credentials: "include" }).then(
        () => undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
    },
  });

  const sendMut = useMutation({
    mutationFn: ({ channelId, content }: { channelId: string; content: string }) =>
      apiRequest(`/api/channels/${channelId}/messages`, "POST", { content, mentions: [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", selectedChannelId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });
      setMessageText("");
    },
  });

  useEffect(() => {
    if (view === "chat" && messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, view]);

  useEffect(() => {
    if (!open) {
      setView("list");
      setSelectedChannelId(null);
      setMessageText("");
    }
  }, [open]);

  const getDmDisplayName = (channel: ChannelWithMeta): string => {
    const participants = channel.dmParticipants as string[] | null;
    if (!participants || !user) return "Direct Message";
    const otherId = participants.find(id => id !== user.id);
    if (!otherId) return "Direct Message";
    const other = allUsers.find((u: any) => u.id === otherId);
    if (!other) return "Direct Message";
    return other.firstName && other.lastName
      ? `${other.firstName} ${other.lastName}`
      : other.email;
  };

  const getDmInitials = (channel: ChannelWithMeta): string => {
    const participants = channel.dmParticipants as string[] | null;
    if (!participants || !user) return "DM";
    const otherId = participants.find(id => id !== user.id);
    if (!otherId) return "DM";
    const other = allUsers.find((u: any) => u.id === otherId);
    if (!other) return "DM";
    return getInitials(other.firstName, other.lastName, other.email);
  };

  const sortedChannels = [...channels].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  const handleOpenChat = (channelId: string) => {
    setSelectedChannelId(channelId);
    setView("chat");
    if (unreadCounts[channelId]) {
      markReadMut.mutate(channelId);
    }
  };

  const handleOpenFull = () => {
    navigate(`/messages?channel=${selectedChannelId}`);
    setOpen(false);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedChannelId || sendMut.isPending) return;
    sendMut.mutate({ channelId: selectedChannelId, content: messageText.trim() });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 relative"
          data-testid="button-messages-dropdown"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5" data-testid="badge-unread-count">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 items-center justify-center text-[9px] font-bold text-white">
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0" data-testid="dropdown-messages">
        {view === "list" ? (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">Messages</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { navigate("/messages"); setOpen(false); }}
                data-testid="button-view-all"
              >
                View All
              </Button>
            </div>

            <ScrollArea className="max-h-[400px]">
              {sortedChannels.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No conversations yet
                </div>
              ) : (
                <div className="p-1">
                  {sortedChannels.map(channel => {
                    const isDm = channel.type === "dm";
                    const displayName = isDm ? getDmDisplayName(channel) : channel.name;
                    const initials = isDm ? getDmInitials(channel) : null;
                    const unread = unreadCounts[channel.id] || 0;

                    return (
                      <button
                        key={channel.id}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover-elevate text-left"
                        onClick={() => handleOpenChat(channel.id)}
                        data-testid={`channel-row-${channel.id}`}
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-[11px]">
                            {isDm ? initials : <Hash className="h-3 w-3" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm truncate block ${unread > 0 ? "font-semibold" : "font-medium"}`}>
                            {isDm ? displayName : `#${displayName}`}
                          </span>
                          {channel.lastMessageAt && (
                            <span className="text-[11px] text-muted-foreground">
                              {formatDistanceToNow(new Date(channel.lastMessageAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        {unread > 0 && (
                          <Badge
                            variant="destructive"
                            className="shrink-0 text-[10px] h-5 min-w-[1.25rem] flex items-center justify-center px-1"
                          >
                            {unread > 99 ? "99+" : unread}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 px-1.5 py-1.5 border-b">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setView("list")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm font-medium flex-1 truncate min-w-0 px-1">
                {selectedChannel?.type === "dm"
                  ? getDmDisplayName(selectedChannel)
                  : `#${selectedChannel?.name}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleOpenFull}
                title="Open in messages"
                data-testid="button-open-full"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>

            <ScrollArea className="h-64">
              <div className="p-3 space-y-3">
                {messagesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No messages yet
                  </p>
                ) : (
                  messages.map(msg => {
                    const isOwn = msg.userId === user?.id;
                    const sender = allUsers.find((u: any) => u.id === msg.userId);
                    const senderName = sender
                      ? sender.firstName && sender.lastName
                        ? `${sender.firstName} ${sender.lastName}`
                        : sender.email
                      : "Unknown";

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        {!isOwn && (
                          <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(sender?.firstName, sender?.lastName, sender?.email)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`flex flex-col gap-0.5 max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                          {!isOwn && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {senderName}
                            </span>
                          )}
                          <div
                            className={`px-2.5 py-1.5 rounded-xl text-xs break-words ${
                              isOwn
                                ? "bg-primary/10 text-foreground border border-primary/20"
                                : "bg-muted/40 text-foreground"
                            }`}
                          >
                            {msg.content}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-2 border-t">
              <form onSubmit={handleSend} className="flex gap-1.5">
                <Input
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="h-8 text-sm flex-1"
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!messageText.trim() || sendMut.isPending}
                  data-testid="button-send"
                >
                  {sendMut.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Send className="h-3 w-3" />}
                </Button>
              </form>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
