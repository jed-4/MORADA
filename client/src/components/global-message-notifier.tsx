import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useAllNewMessages } from "@/lib/socket";
import { showMessageNotification } from "@/lib/notifications";
import type { Message } from "@shared/schema";

interface ChannelBasic {
  id: string;
  name: string;
}

export function GlobalMessageNotifier() {
  const { user } = useAuth();

  const { data: channels = [] } = useQuery<ChannelBasic[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
    staleTime: 60_000,
  });

  useAllNewMessages((rawMessage: Message) => {
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
