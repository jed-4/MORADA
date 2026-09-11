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
  | "email.complained";

/** Event → the status we store. Anything unmapped is ignored rather than guessed. */
const STATUS_FOR_EVENT: Partial<Record<ResendEventType, string>> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  // email.sent adds nothing — we already wrote "sent" ourselves.
  // email.delivery_delayed is not an outcome; the delivered/bounced event follows.
};

export interface ResendDeliveryEvent {
  messageId: string;
  status: string;
  detail?: string;
  occurredAt?: Date;
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
  const status = STATUS_FOR_EVENT[type];
  if (!status) return null;

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
    status,
    detail: detail ? String(detail).slice(0, 500) : undefined,
    occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : undefined,
  };
}
