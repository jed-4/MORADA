import crypto from "crypto";

/**
 * Resend delivery events — the half of "did it send?" the app could not see.
 *
 * A provider accepting a message says nothing about whether it arrived. The
 * case that prompted this: a variation went to an address that does not exist,
 * Resend accepted it, Google bounced it minutes later, and the app carried on
 * showing "Sent" because nothing was listening.
 *
 * Resend signs webhooks with the Svix scheme: the signature covers
 * `${id}.${timestamp}.${body}` keyed by the secret, and the header can carry
 * several space-separated signatures during a secret rotation.
 */

export type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked";

/**
 * Event → what it means for the row. Status events move `status`; engagement
 * events (opened/clicked) only count, because an "open" is approximate — Apple
 * Mail fetches every image the moment a message arrives — and must never be
 * able to overwrite a bounce.
 */
const KIND_FOR_EVENT: Partial<Record<ResendEventType, ResendDeliveryEvent["kind"]>> = {
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  // email.sent adds nothing — we already wrote "sent" ourselves.
};

export interface ResendDeliveryEvent {
  messageId: string;
  kind: "delayed" | "delivered" | "bounced" | "complained" | "opened" | "clicked";
  detail?: string;
  occurredAt?: Date;
}

/**
 * How far along each status is. Webhooks arrive out of order and are retried,
 * so a late "delivered" must not paper over a "bounced" that already landed,
 * and a "delayed" must not undo a "delivered".
 */
const STATUS_RANK: Record<string, number> = {
  sent: 0,
  delayed: 1,
  delivered: 2,
  bounced: 3,
  complained: 3,
  failed: 3,
};

/** The row fields the patch reads. */
export interface DeliveryState {
  status: string;
  deliveredAt?: Date | null;
  firstOpenedAt?: Date | null;
  firstClickedAt?: Date | null;
  openCount?: number | null;
  clickCount?: number | null;
}

/**
 * What an event changes on a row — pure, so the ordering rules are testable
 * without a database. Returns null when the event changes nothing.
 */
export function deliveryPatch(current: DeliveryState, event: ResendDeliveryEvent): Record<string, unknown> | null {
  const at = event.occurredAt ?? new Date();
  const patch: Record<string, unknown> = {};

  const advanceTo = (status: string, detail?: string) => {
    if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[current.status] ?? 0)) return;
    if (status === current.status && STATUS_RANK[status] >= 3) return; // retried bounce
    patch.status = status;
    patch.statusDetail = detail ?? null;
    patch.statusUpdatedAt = at;
  };

  switch (event.kind) {
    case "delayed":
    case "bounced":
    case "complained":
      advanceTo(event.kind, event.detail);
      break;
    case "delivered":
      advanceTo("delivered");
      // A delivered event for a message we already know bounced is the
      // provider contradicting itself; the timeline should not say both.
      if (!current.deliveredAt && current.status !== "bounced" && current.status !== "failed") patch.deliveredAt = at;
      break;
    case "opened":
    case "clicked": {
      // An open or click proves it arrived, even if the delivered event is
      // still in flight (or was lost).
      if ((STATUS_RANK[current.status] ?? 0) < STATUS_RANK.delivered) advanceTo("delivered");
      if (!current.deliveredAt && current.status !== "bounced" && current.status !== "failed") patch.deliveredAt = at;
      if (event.kind === "opened") {
        patch.openCount = (current.openCount ?? 0) + 1;
        patch.lastOpenedAt = at;
        if (!current.firstOpenedAt) patch.firstOpenedAt = at;
      } else {
        patch.clickCount = (current.clickCount ?? 0) + 1;
        if (!current.firstClickedAt) patch.firstClickedAt = at;
      }
      break;
    }
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Verify a Resend/Svix signature.
 *
 * Returns false rather than throwing, so a malformed request is a 401 and not a
 * 500 — an unauthenticated endpoint should never be able to produce a stack
 * trace. Timing-safe comparison, since this is a public endpoint.
 */
export function verifyResendSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
): boolean {
  const header = (name: string) => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  const id = header("svix-id");
  const timestamp = header("svix-timestamp");
  const signatureHeader = header("svix-signature");
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  // Reject anything older than five minutes: a captured request should not stay
  // replayable forever.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // Resend's secrets are issued as "whsec_<base64>".
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  // The header is space-separated "v1,<sig>" entries — more than one while a
  // secret is being rotated.
  return signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter(Boolean)
    .some((candidate) => {
      const a = Buffer.from(candidate!);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

/**
 * Pull the delivery outcome out of a Resend event payload.
 *
 * Returns null for events we do not map, so an unfamiliar event type is a no-op
 * rather than a row set to some invented status.
 */
export function parseResendEvent(payload: any): ResendDeliveryEvent | null {
  const type = payload?.type as ResendEventType | undefined;
  if (!type) return null;
  const kind = KIND_FOR_EVENT[type];
  if (!kind) return null;

  const data = payload?.data ?? {};
  const messageId = data.email_id ?? data.id;
  if (!messageId) return null;

  // Resend puts the reason in different places depending on the event.
  const detail =
    data.bounce?.message ??
    data.bounce?.subType ??
    data.reason ??
    (type === "email.complained" ? "Recipient marked the message as spam" : undefined);

  const occurredAt = payload?.created_at ? new Date(payload.created_at) : undefined;
  return {
    messageId: String(messageId),
    kind,
    detail: detail ? String(detail).slice(0, 500) : undefined,
    occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : undefined,
  };
}
