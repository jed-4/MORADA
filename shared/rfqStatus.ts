/**
 * RFQ status is derived from its recipients, not set by hand.
 *
 * Before recipients existed there was no reliable writer for rfqs.status at all
 * (the send flow's PATCH was silently stripped, so every RFQ sat on "draft"
 * forever). Deriving it removes the whole class of "the badge disagrees with
 * reality" bug: the RFQ is a roll-up of the individual requests underneath it.
 *
 * The stored column is kept in sync rather than computed on read so the list
 * page can still filter and sort on it in SQL.
 */
import type { RfqRecipient, RfqQuote } from "./schema";

export type RfqDerivedStatus =
  | "draft"
  | "sent"
  | "quoted"
  | "accepted"
  | "declined"
  | "expired";

/** Recipient states that mean "we are still waiting on this supplier". */
const AWAITING: ReadonlySet<string> = new Set(["sent", "viewed"]);

export interface DeriveRfqStatusInput {
  recipients: Pick<RfqRecipient, "status">[];
  quotes: Pick<RfqQuote, "status">[];
  dueDate?: Date | string | null;
  /** Defaults to now; injectable so tests aren't clock-dependent. */
  now?: Date;
}

export function deriveRfqStatus({
  recipients,
  quotes,
  dueDate,
  now = new Date(),
}: DeriveRfqStatusInput): RfqDerivedStatus {
  // An accepted quote is terminal and outranks everything — an awarded RFQ
  // stays awarded even once its due date passes.
  if (quotes.some((q) => q.status === "accepted")) return "accepted";

  // Nobody has been contacted yet (or there is nobody to contact).
  if (recipients.length === 0) return "draft";
  if (recipients.every((r) => r.status === "not_sent")) return "draft";

  if (recipients.some((r) => r.status === "quoted")) return "quoted";

  // Every supplier we actually sent to has said no.
  const engaged = recipients.filter((r) => r.status !== "not_sent");
  if (engaged.length > 0 && engaged.every((r) => r.status === "declined")) {
    return "declined";
  }

  // Out with suppliers. Past the response deadline with nobody still live on
  // it, that becomes "expired" — which is what makes the status worth filtering
  // on, since it surfaces the RFQs that quietly died.
  const stillWaiting = recipients.some((r) => AWAITING.has(r.status));
  if (dueDate && !stillWaiting) {
    const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
    if (due instanceof Date && !Number.isNaN(due.getTime()) && due < now) {
      return "expired";
    }
  }

  return "sent";
}

/**
 * Per-recipient roll-up for the list page: "3 sent · 2 quoted".
 */
export function summariseRecipients(recipients: Pick<RfqRecipient, "status">[]) {
  const counts = {
    total: recipients.length,
    notSent: 0,
    sent: 0,
    viewed: 0,
    quoted: 0,
    declined: 0,
    noResponse: 0,
  };
  for (const r of recipients) {
    switch (r.status) {
      case "not_sent": counts.notSent++; break;
      case "sent": counts.sent++; break;
      case "viewed": counts.viewed++; break;
      case "quoted": counts.quoted++; break;
      case "declined": counts.declined++; break;
      case "no_response": counts.noResponse++; break;
    }
  }
  return counts;
}

export const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  viewed: "Viewed",
  quoted: "Quoted",
  declined: "Declined",
  no_response: "No response",
};

/**
 * Single vocabulary for the RFQ badge. The list page previously invented a
 * "pending" status that does not exist in the enum, and had no label at all for
 * "confirmed" or "expired" — so those rendered a badge with an undefined label.
 */
export const RFQ_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Out for quote",
  confirmed: "Confirmed",
  quoted: "Quoted",
  accepted: "Awarded",
  declined: "Declined",
  expired: "Expired",
};
