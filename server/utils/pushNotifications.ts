import { storage } from "../storage";
import type { Notification as InAppNotification } from "@shared/schema";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK_SIZE = 100;

interface ExpoMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: "high";
  badge?: number;
}

function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

/**
 * Send a push to a single user's registered devices. Looks up the user's
 * Expo push tokens, sends via the Expo Push API in chunks, and prunes any
 * tokens Expo reports as DeviceNotRegistered/invalid.
 *
 * This is fire-and-forget by design — callers should not await it on the
 * request path, and it must never throw (it only logs).
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body?: string; data?: Record<string, any>; badge?: number },
): Promise<void> {
  try {
    if (!userId) return;
    const tokenRows = await storage.getPushTokensForUser(userId);
    if (!tokenRows.length) return;
    const tokens = tokenRows.map((t) => t.token);
    const result = await sendExpoPush(tokens, payload);
    const notificationId = payload.data?.notificationId;
    console.log(
      `[Push] Dispatched to user ${userId}${notificationId ? ` (notification ${notificationId})` : ""}: ` +
        `${result.sent} sent, ${result.errors} error(s), ${result.pruned} pruned of ${tokens.length} device(s)`,
    );
  } catch (err) {
    console.error("[Push] sendPushToUser failed:", err);
  }
}

/**
 * Hook target for storage.createNotification — turns an in-app notification
 * record into a device push for the recipient.
 */
export async function sendPushForNotification(notification: InAppNotification): Promise<void> {
  if (!notification?.userId) return;
  const data: Record<string, any> = {
    notificationId: notification.id,
    type: notification.type,
  };
  if (notification.link) data.link = notification.link;
  if (notification.entityType) data.entityType = notification.entityType;
  if (notification.entityId) data.entityId = notification.entityId;

  await sendPushToUser(notification.userId, {
    title: notification.title,
    body: notification.message ?? undefined,
    data,
  });
}

/**
 * Low-level send: validates tokens, batches into chunks of 100, posts to Expo,
 * and prunes tokens that come back as DeviceNotRegistered.
 */
export async function sendExpoPush(
  tokens: string[],
  payload: { title: string; body?: string; data?: Record<string, any>; badge?: number },
): Promise<{ sent: number; errors: number; pruned: number }> {
  const valid = Array.from(new Set(tokens.filter(isExpoPushToken)));
  if (!valid.length) return { sent: 0, errors: 0, pruned: 0 };

  let sent = 0;
  let errors = 0;

  const messages: ExpoMessage[] = valid.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body || "",
    data: payload.data || {},
    priority: "high",
    ...(typeof payload.badge === "number" ? { badge: payload.badge } : {}),
  }));

  const tokensToPrune: string[] = [];

  for (let i = 0; i < messages.length; i += EXPO_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + EXPO_CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[Push] Expo push API returned ${res.status}: ${text.slice(0, 300)}`);
        continue;
      }

      const json: any = await res.json().catch(() => null);
      const tickets = json?.data;
      if (!Array.isArray(tickets)) continue;

      tickets.forEach((ticket: any, idx: number) => {
        if (ticket?.status === "error") {
          errors += 1;
          const errType = ticket?.details?.error;
          const to = chunk[idx]?.to;
          if (errType === "DeviceNotRegistered" && to) {
            tokensToPrune.push(to);
          } else {
            console.error(`[Push] Expo ticket error (${errType || "unknown"}): ${ticket?.message}`);
          }
        } else {
          sent += 1;
        }
      });
    } catch (err) {
      errors += chunk.length;
      console.error("[Push] Failed to POST to Expo push service:", err);
    }
  }

  let pruned = 0;
  if (tokensToPrune.length) {
    try {
      pruned = await storage.deletePushTokens(tokensToPrune);
      console.log(`[Push] Pruned ${pruned} unregistered device token(s)`);
    } catch (err) {
      console.error("[Push] Failed to prune unregistered tokens:", err);
    }
  }

  return { sent, errors, pruned };
}
