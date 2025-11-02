import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSocket } from "@/lib/socket";
import { useLocation } from "wouter";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import type { Channel, Message } from "@shared/schema";

interface RecentMessage extends Message {
  channelName?: string;
  senderName?: string;
}

export function MessagesDropdown() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [quickReplyChannelId, setQuickReplyChannelId] = useState<string | null>(null);
  const [quickReplyText, setQuickReplyText] = useState("");
  const { sendMessage } = useSocket();

  // Fetch recent messages across all channels
  const { data: recentMessages = [] } = useQuery<RecentMessage[]>({
    queryKey: ["/api/messages/recent"],
    enabled: open,
  });

  // Calculate total unread count
  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  // Send quick reply
  const handleQuickReply = (e: React.FormEvent, messageId: string, channelId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!quickReplyText.trim()) return;

    sendMessage(channelId, quickReplyText.trim());
    setQuickReplyText("");
    setQuickReplyChannelId(null);
  };

  // Navigate to channel
  const handleMessageClick = (channelId: string) => {
    navigate(`/messages?channel=${channelId}`);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-messages-dropdown"
        >
          <MessageSquare className="h-4 w-4" />
          {totalUnread > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
              data-testid="badge-unread-count"
            >
              {totalUnread > 99 ? "99+" : totalUnread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-[400px] max-h-[80vh] p-0 md:w-[400px]"
        data-testid="dropdown-messages"
      >
        <div className="flex items-center justify-between p-3 border-b">
          <DropdownMenuLabel className="p-0">Recent Messages</DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate("/messages");
              setOpen(false);
            }}
            data-testid="button-view-all"
          >
            View All
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh]">
          {recentMessages.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No recent messages
            </div>
          ) : (
            <div className="p-2">
              {recentMessages.slice(0, 10).map((message) => {
                const isReplying = quickReplyChannelId === message.channelId;
                
                return (
                  <div
                    key={message.id}
                    className="rounded-lg hover-elevate p-3 mb-2 cursor-pointer"
                    onClick={() => !isReplying && handleMessageClick(message.channelId)}
                    data-testid={`message-${message.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback>
                          {message.senderName?.substring(0, 2).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-sm truncate">
                            {message.senderName || "Unknown"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            in #{message.channelName || "unknown"}
                          </span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                          {message.content}
                        </p>
                        
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                        </span>

                        {/* Quick Reply */}
                        {isReplying ? (
                          <form
                            onSubmit={(e) => handleQuickReply(e, message.id, message.channelId)}
                            className="mt-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex gap-2">
                              <Input
                                placeholder="Type a reply..."
                                value={quickReplyText}
                                onChange={(e) => setQuickReplyText(e.target.value)}
                                className="h-8 text-sm"
                                autoFocus
                                data-testid="input-quick-reply"
                              />
                              <Button 
                                type="submit" 
                                size="icon" 
                                className="h-8 w-8 flex-shrink-0"
                                disabled={!quickReplyText.trim()}
                                data-testid="button-send-reply"
                              >
                                <Send className="h-3 w-3" />
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickReplyChannelId(message.channelId);
                            }}
                            data-testid="button-reply"
                          >
                            Reply
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
