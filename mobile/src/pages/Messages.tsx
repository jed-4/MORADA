import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileButton } from "@/components/ui/MobileButton";
import { Plus, Search, Hash, User, ChevronDown, ChevronUp, Archive } from "lucide-react";
import { useAuth } from "@shared/useAuth";
import { format, isAfter, subDays } from "date-fns";
import type { Channel } from "@shared/schema";

export function Messages() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [showOlderMessages, setShowOlderMessages] = useState(false);

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user?.id,
  });

  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
    enabled: !!user?.id,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  const filteredChannels = channels.filter((channel) =>
    channel.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Split channels into recent (< 1 week) and older (>= 1 week)
  const { recentChannels, olderChannels } = useMemo(() => {
    const oneWeekAgo = subDays(new Date(), 7);
    const recent: Channel[] = [];
    const older: Channel[] = [];
    
    filteredChannels.forEach((channel) => {
      const updatedAt = channel.updatedAt ? new Date(channel.updatedAt) : null;
      const hasUnread = (unreadCounts[channel.id] || 0) > 0;
      
      // Always show channels with unread messages in recent
      if (hasUnread || (updatedAt && isAfter(updatedAt, oneWeekAgo))) {
        recent.push(channel);
      } else {
        older.push(channel);
      }
    });
    
    return { recentChannels: recent, olderChannels: older };
  }, [filteredChannels, unreadCounts]);

  const getChannelAvatar = (channel: Channel) => {
    if (channel.type === "dm") {
      // For DMs, show first letters of participant names (exclude current user)
      const participants = (channel.dmParticipants as string[]) || [];
      const otherParticipant = participants.find((p: string) => p !== user?.id);
      return otherParticipant?.substring(0, 2).toUpperCase() || "DM";
    }
    return channel.name.substring(0, 2).toUpperCase();
  };

  const getChannelIcon = (channel: Channel) => {
    return channel.type === "dm" ? (
      <User className="w-4 h-4" />
    ) : (
      <Hash className="w-4 h-4" />
    );
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "";
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffInDays = Math.floor(
      (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffInDays === 0) {
      return format(dateObj, "h:mm a");
    } else if (diffInDays === 1) {
      return "Yesterday";
    } else if (diffInDays < 7) {
      return format(dateObj, "EEEE");
    } else {
      return format(dateObj, "MMM d");
    }
  };

  const handleChannelClick = (channelId: string) => {
    // TODO: Navigate to channel detail view
    console.log("Navigate to channel:", channelId);
  };

  return (
    <div className="flex flex-col h-full">
      <MobileHeader
        title="Messages"
        action={
          <MobileButton
            size="icon"
            variant="ghost"
            onClick={() => console.log("Create new message")}
            data-testid="button-new-message"
          >
            <Plus className="w-5 h-5" />
          </MobileButton>
        }
      />

      {/* Search Bar */}
      <div className="bg-card border-b px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 pl-9 pr-3 rounded-md border bg-background text-sm"
            data-testid="input-search-messages"
          />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : recentChannels.length === 0 && olderChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Hash className="w-12 h-12 text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">No Channels Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm
                ? "No channels match your search"
                : "Start a conversation with your team"}
            </p>
          </div>
        ) : (
          <div>
            {/* Recent Messages */}
            {recentChannels.length > 0 && (
              <div className="divide-y">
                {recentChannels.map((channel) => {
                  const unreadCount = unreadCounts[channel.id] || 0;
                  return (
                    <div
                      key={channel.id}
                      onClick={() => handleChannelClick(channel.id)}
                      className="flex items-start gap-3 p-4 hover-elevate active-elevate-2"
                      data-testid={`channel-${channel.id}`}
                    >
                      <div className="relative">
                        <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold">
                          {getChannelAvatar(channel)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5">
                            {getChannelIcon(channel)}
                            <h3 className="font-semibold text-sm">{channel.name}</h3>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(channel.updatedAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-muted-foreground truncate">
                            {channel.description || "No description"}
                          </p>
                          {unreadCount > 0 && (
                            <span className="px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-medium">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Older Messages Section */}
            {olderChannels.length > 0 && (
              <div className="border-t">
                <button
                  onClick={() => setShowOlderMessages(!showOlderMessages)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover-elevate"
                  data-testid="toggle-older-messages"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Archive className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      Older messages ({olderChannels.length})
                    </span>
                  </div>
                  {showOlderMessages ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                
                {showOlderMessages && (
                  <div className="divide-y opacity-75">
                    {olderChannels.map((channel) => {
                      const unreadCount = unreadCounts[channel.id] || 0;
                      return (
                        <div
                          key={channel.id}
                          onClick={() => handleChannelClick(channel.id)}
                          className="flex items-start gap-3 p-4 hover-elevate active-elevate-2"
                          data-testid={`channel-older-${channel.id}`}
                        >
                          <div className="relative">
                            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-muted-foreground font-semibold text-sm">
                              {getChannelAvatar(channel)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5">
                                {getChannelIcon(channel)}
                                <h3 className="font-medium text-sm text-muted-foreground">{channel.name}</h3>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatTime(channel.updatedAt)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground/70 truncate">
                              {channel.description || "No description"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
