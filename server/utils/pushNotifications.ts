import { storage } from "../storage";
import type { Notification as InAppNotification } from "@shared/schema";
import { getPushGroupForType, PUSH_PREFS_VIEW_KEY } from "@shared/notificationGroups";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_CHUNK_SIZE = 100;

// Receipt polling (#316). Expo accepts a push and returns a "ticket" with a
// receipt id; whether the device actually received it (and whether the token is
// now dead) is only knowable by fetching the receipt a little later. We keep a
// small in-memory queue of receipt-id -> token and sweep it on an interval,
// pruning tokens that come back DeviceNotRegistered. This is best-effort and
// intentionally not persisted — a server restart simply drops pending checks.
const RECEIPT_CHECK_DELAY_MS = 90_000; // give Expo time before the first check
const RECEIPT_SWEEP_INTERVAL_MS = 60_000; // how often the sweeper runs
const RECEIPT_MAX_AGE_MS = 30 * 60_000; // stop chasing receipts older than this
const RECEIPT_BATCH_SIZE = 1000; // Expo allows up to 1000 ids per getReceipts call

interface PendingReceipt {
  id: string; // Expo receipt id (ticket.id)
  token: string; // the device token this ticket was sent to
  queuedAt: number;
}

const pendingReceipts: PendingReceipt[] = [];
let receiptSweeper: ReturnType<typeof setInterval> | null = null;

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

  // Respect the recipient's per-group mute preferences (#317). Notification
  // types that aren't mapped to a group have no toggle and are always sent.
  // A preference-lookup failure must never block delivery — we send anyway.
  try {
    const group = getPushGroupForType(notification.type);
    if (group) {
      const prefRow = await storage.getUserViewPreferences(notification.userId, PUSH_PREFS_VIEW_KEY);
      const muted = (prefRow?.preferences as any)?.mutedGroups;
      if (Array.isArray(muted) && muted.includes(group)) {
        console.log(
          `[Push] Skipped notification ${notification.id} for user ${notification.userId}: group "${group}" is muted`,
        );
        return;
      }
    }
  } catch (err) {
    console.error("[Push] Failed to check push preferences (sending anyway):", err);
  }

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
  const receiptEntries: { id: string; token: string }[] = [];

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
          // Accepted by Expo, but not necessarily delivered. Queue the receipt
          // id so the sweeper can later confirm delivery and prune dead tokens.
          const to = chunk[idx]?.to;
          if (ticket?.id && to) receiptEntries.push({ id: ticket.id, token: to });
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

  queueReceiptsForCheck(receiptEntries);

  return { sent, errors, pruned };
}

/** Add accepted-ticket receipt ids to the pending queue and start the sweeper. */
function queueReceiptsForCheck(entries: { id: string; token: string }[]): void {
  if (!entries.length) return;
  const now = Date.now();
  for (const entry of entries) {
    pendingReceipts.push({ id: entry.id, token: entry.token, queuedAt: now });
  }
  ensureReceiptSweeper();
}

function ensureReceiptSweeper(): void {
  if (receiptSweeper) return;
  receiptSweeper = setInterval(() => {
    void sweepReceipts();
  }, RECEIPT_SWEEP_INTERVAL_MS);
  // Don't keep the process alive solely to poll receipts.
  if (typeof receiptSweeper.unref === "function") receiptSweeper.unref();
}

function stopSweeperIfIdle(): void {
  if (!pendingReceipts.length && receiptSweeper) {
    clearInterval(receiptSweeper);
    receiptSweeper = null;
  }
}

/**
 * Poll Expo for delivery receipts on queued tickets (#316). Checks only
 * receipts old enough to have settled, prunes tokens reported
 * DeviceNotRegistered, and drops expired entries we can stop chasing.
 */
async function sweepReceipts(): Promise<void> {
  const now = Date.now();

  // Drop entries we've waited too long on — Expo may never surface them.
  for (let i = pendingReceipts.length - 1; i >= 0; i--) {
    if (now - pendingReceipts[i].queuedAt > RECEIPT_MAX_AGE_MS) {
      pendingReceipts.splice(i, 1);
    }
  }

  const ready = pendingReceipts.filter((r) => now - r.queuedAt >= RECEIPT_CHECK_DELAY_MS);
  if (!ready.length) {
    stopSweeperIfIdle();
    return;
  }

  const batch = ready.slice(0, RECEIPT_BATCH_SIZE);
  const batchIds = new Set(batch.map((b) => b.id));
  // Remove this batch from the queue — we check each receipt once.
  for (let i = pendingReceipts.length - 1; i >= 0; i--) {
    if (batchIds.has(pendingReceipts[i].id)) pendingReceipts.splice(i, 1);
  }

  const idToToken = new Map(batch.map((b) => [b.id, b.token]));

  try {
    const res = await fetch(EXPO_RECEIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({ ids: batch.map((b) => b.id) }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[Push] Expo getReceipts returned ${res.status}: ${text.slice(0, 300)}`);
      requeueReceipts(batch); // transient — retry on a later sweep until they age out
      return;
    }

    const json: any = await res.json().catch(() => null);
    const receipts = json?.data;
    if (!receipts || typeof receipts !== "object") {
      requeueReceipts(batch); // receipts may not be ready yet — retry later
      return;
    }

    const tokensToPrune: string[] = [];
    let ok = 0;
    let errored = 0;
    for (const [receiptId, receipt] of Object.entries<any>(receipts)) {
      if (receipt?.status === "ok") {
        ok += 1;
        continue;
      }
      if (receipt?.status === "error") {
        errored += 1;
        const errType = receipt?.details?.error;
        const token = idToToken.get(receiptId);
        if (errType === "DeviceNotRegistered" && token) {
          tokensToPrune.push(token);
        } else {
          console.error(`[Push] Expo receipt error (${errType || "unknown"}): ${receipt?.message}`);
        }
      }
    }

    let pruned = 0;
    if (tokensToPrune.length) {
      try {
        pruned = await storage.deletePushTokens(Array.from(new Set(tokensToPrune)));
      } catch (err) {
        console.error("[Push] Failed to prune tokens from receipts:", err);
      }
    }

    if (errored || pruned) {
      console.log(
        `[Push] Receipt check: ${ok} delivered, ${errored} error(s), ${pruned} token(s) pruned (${pendingReceipts.length} still pending)`,
      );
    }
  } catch (err) {
    console.error("[Push] Failed to poll Expo receipts:", err);
    requeueReceipts(batch); // network failure — retry on a later sweep
  }

  stopSweeperIfIdle();
}

/**
 * Put a batch back on the queue after a transient receipt-poll failure. Entries
 * keep their original queuedAt, so they're retried on the next sweep and still
 * age out via RECEIPT_MAX_AGE_MS (bounded retries, no infinite loop).
 */
function requeueReceipts(batch: PendingReceipt[]): void {
  if (!batch.length) return;
  for (const entry of batch) pendingReceipts.push(entry);
  ensureReceiptSweeper();
}
