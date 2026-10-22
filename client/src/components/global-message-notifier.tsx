import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useClientPortal } from "@/hooks/use-client-portal";
import { useAllNewMessages } from "@/lib/socket";
import { showMessageNotification, initFavicon, updateFaviconBadge } from "@/lib/notifications";
import { getActiveChannel } from "@/lib/activeChannel";
import type { Message } from "@shared/schema";

interface ChannelBasic {
  id: string;
  name: string;
  type?: string;
  dmParticipants?: unknown;
}

export function GlobalMessageNotifier() {
  const { user } = useAuth();
  const { isClient } = useClientPortal();
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

  // Only to put a person's name on a DM notification. Needs admin.users:view,
  // which a client never has — skip it rather than 403 every minute.
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!user && !isClient,
    staleTime: 60_000,
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

  /**
   * The one place a message notification is decided, and the one place the tab
   * badge is refreshed.
   *
   * Notifications used to bail out entirely on /messages and hand over to that
   * page's own handler, which had different rules — so whether you were
   * interrupted depended on which component happened to be mounted, and a
   * change to one never reached the other.
   *
   * The rule is the same everywhere now: not your own message, and not the
   * conversation you are sitting in front of.
   */
  useAllNewMessages((rawMessage: Message) => {
    // The count behind the tab badge, wherever you are. The messages page
    // invalidates this too; a second invalidation is a no-op.
    queryClient.invalidateQueries({ queryKey: ["/api/channels/unread/counts"] });

    if (rawMessage.userId === user?.id) return;

    // Reading it as it arrives is not something to be told about.
    if (document.hasFocus() && getActiveChannel() === rawMessage.channelId) return;

    const channel = channels.find(c => c.id === rawMessage.channelId);
    if (!channel) return;

    const mentions = Array.isArray(rawMessage.mentions) ? rawMessage.mentions : [];
    const isMention = mentions.includes(user?.id || "");

    const senderName =
      (rawMessage as any).userFirstName && (rawMessage as any).userLastName
        ? `${(rawMessage as any).userFirstName} ${(rawMessage as any).userLastName}`
        : (rawMessage as any).userEmail || "Someone";

    // A DM's stored name is generated — "dm-<uuid>-<uuid>" — so notifications
    // for one were titled with a pair of uuids. Name it after the person, the
    // way the conversation itself is named.
    let channelName = channel.name;
    if (channel.type === "dm") {
      const otherId = Array.isArray(channel.dmParticipants)
        ? (channel.dmParticipants as string[]).find((id) => id !== user?.id)
        : undefined;
      const other = otherId ? users.find((u: any) => u.id === otherId) : undefined;
      channelName = other
        ? (other.firstName && other.lastName ? `${other.firstName} ${other.lastName}` : other.email || "Direct message")
        : "Direct message";
    }

    showMessageNotification({
      channelName,
      senderName,
      messageContent: rawMessage.content,
      isMention,
    });
  });

  return null;
}
