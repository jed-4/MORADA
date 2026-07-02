import { storage } from "../storage";
import { emitNotification, getConnectedUserIdsForCompany } from "../socketManager";
import { parseMentionUserIds, buildContentPreview } from "./mentions";

interface ChatMessageForNotify {
  id: string;
  channelId: string;
  content: string;
  // `mentions` is stored as a json column, so it arrives loosely typed; we
  // normalize it with an Array.isArray guard before use.
  mentions?: unknown;
}

/**
 * Fan out in-app + push notifications for a newly-created chat message. Used by
 * both the REST create route and the socket send_message path, so a message
 * sent via either transport notifies the same people the same way.
 *
 * Notification precedence (a user is only notified once, highest wins):
 *   1. Explicit @mention  -> type "mention"
 *   2. @channel / @here   -> type "mention"
 *   3. Everyone else in the channel -> type "message_new"
 *
 * To keep an active back-and-forth from spamming devices, the generic
 * "message_new" notification is only created for members who are NOT currently
 * connected (online users already receive the message in real time over the
 * socket, so they don't need a banner). Explicit mentions always notify,
 * connected or not. The acting sender is never notified.
 */
export async function dispatchChatMessageNotifications(params: {
  message: ChatMessageForNotify;
  senderId: string;
  companyId: string;
  senderName: string;
}): Promise<void> {
  const { message, senderId, companyId, senderName } = params;
  try {
    if (!companyId || !message?.channelId) return;

    const channel = await storage.getChannel(message.channelId, companyId);
    const channelName = channel?.name || "a channel";
    const members = await storage.getChannelMembers(message.channelId);
    const memberIds = new Set(members.map((m) => m.userId));

    const link = `/messages?channel=${message.channelId}`;
    const preview = buildContentPreview(message.content);
    const notified = new Set<string>([senderId]);

    const notify = async (
      userId: string,
      type: string,
      title: string,
      body: string,
    ) => {
      if (!userId || notified.has(userId)) return;
      notified.add(userId);
      try {
        const notification = await storage.createNotification({
          userId,
          companyId,
          type,
          title,
          message: body,
          link,
          entityType: "message",
          entityId: message.id,
          isRead: false,
          createdByUserId: senderId,
        });
        emitNotification(userId, notification);
      } catch (err) {
        console.error("[Notify] Failed to create chat notification:", err);
      }
    };

    // 1) Explicit @mentions (only members of the channel).
    const mentionIds =
      Array.isArray(message.mentions) && message.mentions.length
        ? Array.from(new Set(message.mentions))
        : parseMentionUserIds(message.content);
    for (const uid of mentionIds) {
      if (!memberIds.has(uid)) continue;
      await notify(
        uid,
        "mention",
        `${senderName} mentioned you in #${channelName}`,
        preview || "mentioned you",
      );
    }

    // 2) @channel / @here broadcast mentions.
    const hasChannel = /@channel\b/.test(message.content);
    const hasHere = /@here\b/.test(message.content);
    if (hasChannel || hasHere) {
      const token = hasChannel ? "@channel" : "@here";
      let targets: string[];
      if (hasChannel) {
        targets = Array.from(memberIds);
      } else {
        const connected = new Set(getConnectedUserIdsForCompany(companyId));
        targets = Array.from(memberIds).filter((id) => connected.has(id));
      }
      for (const uid of targets) {
        await notify(
          uid,
          "mention",
          `${token} in #${channelName}`,
          `${senderName} mentioned ${token}`,
        );
      }
    }

    // 3) Generic new-message notification for everyone else — but only for
    // members who are offline, so online participants aren't spammed during a
    // live conversation (they already get the message over the socket).
    const connected = new Set(getConnectedUserIdsForCompany(companyId));
    for (const uid of memberIds) {
      if (connected.has(uid)) continue;
      await notify(
        uid,
        "message_new",
        `New message in #${channelName}`,
        preview ? `${senderName}: ${preview}` : `${senderName} sent a message`,
      );
    }
  } catch (err) {
    console.error("[Notify] dispatchChatMessageNotifications failed:", err);
  }
}
