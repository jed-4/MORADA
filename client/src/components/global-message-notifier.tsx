import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useAllNewMessages } from "@/lib/socket";
import { showMessageNotification, initFavicon, updateFaviconBadge } from "@/lib/notifications";
import type { Message } from "@shared/schema";

interface ChannelBasic {
  id: string;
  name: string;
}

export function GlobalMessageNotifier() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: channels = [] } = useQuery<ChannelBasic[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
    staleTime: 60_000,
  });

  /**
   * The unread badge on the browser tab's icon.
   *
   * This used to live inside the messages page, which meant it only ever
   * updated while that page was open — the one time you can already see the
   * unread counts. Leave the page and the component unmounts, so the badge
   * stops being written and sits on whatever number it last had; a message
   * arriving while you were anywhere else never reached it.
   *
   * It belongs here instead: this component is mounted for the whole app, so
   * the count on the tab is right wherever you are, which is the only reason
   * to put a number on a tab at all.
   */
  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
    enabled: !!user,
  });

  useEffect(() => { if (user) initFavicon(); }, [user]);

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  useEffect(() => {
    if (!user) return;
    updateFaviconBadge(totalUnread);
    // Clear it on the way out, so a signed-out tab is not still carrying
    // somebody's unread count.
    return () => updateFaviconBadge(0);
  }, [totalUnread, user]);

  useAllNewMessages((rawMessage: Message) => {
    // The count behind the tab badge, wherever you are. The messages page
    // invalidates this too; a second invalidation is a no-op.
    queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });

    // Delegate to Messages.tsx handler when user is actively on that page
    if (window.location.pathname === "/messages") return;
    // Never notify for own messages
    if (rawMessage.userId === user?.id) return;

    const channel = channels.find(c => c.id === rawMessage.channelId);
    if (!channel) return;

    const mentions = Array.isArray(rawMessage.mentions) ? rawMessage.mentions : [];
    const isMention = mentions.includes(user?.id || "");

    const senderName =
      (rawMessage as any).userFirstName && (rawMessage as any).userLastName
        ? `${(rawMessage as any).userFirstName} ${(rawMessage as any).userLastName}`
        : (rawMessage as any).userEmail || "Someone";

    showMessageNotification({
      channelName: channel.name,
      senderName,
      messageContent: rawMessage.content,
      isMention,
    });
  });

  return null;
}
