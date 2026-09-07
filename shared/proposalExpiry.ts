/**
 * When a proposal's pricing stops being valid.
 *
 * Two things make this fiddlier than a `<` comparison, and both are the kind
 * of bug a client notices before you do.
 *
 * 1. THE DAY BOUNDARY. "Valid until 31 March" means through the end of the
 *    31st, not from its first second. A date picker hands you midnight, so
 *    comparing `now > expiryDate` retires the proposal a full day early — the
 *    client opens it on the morning of the 31st, the day you told them it was
 *    good until, and is refused. Expiry dates are therefore stored at the END
 *    of the chosen day, via `endOfDay` below, and every comparison is a plain
 *    `now > expiryDate` against that.
 *
 * 2. WHAT COMES BACK. Expiring is not a one-way door. A client who asks for
 *    another week should get it by moving the date, and the proposal has to
 *    return to the state it was actually in — a client who had already opened
 *    it goes back to "viewed", not "sent", or the view tracking silently lies.
 */
import type { Proposal } from "./schema";

/** Last instant of the given local day. */
export function endOfDay(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(value) : new Date(value.getTime());
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Statuses a proposal can lapse FROM: it is out with the client and undecided. */
const LAPSABLE = new Set(["sent", "viewed"]);

export interface ExpiryCandidate {
  status?: string | null;
  expiryDate?: Date | string | null;
  isArchived?: boolean | null;
}

/**
 * Whether a proposal's pricing has run out.
 *
 * False for anything without an expiry date — an open-ended proposal never
 * lapses, and treating a null date as "expired now" would retire every
 * proposal in the database on the first sweep. False, too, for anything
 * already decided: an accepted proposal does not stop being accepted because
 * a date passed.
 */
export function isLapsed(proposal: ExpiryCandidate, now: Date = new Date()): boolean {
  if (proposal.isArchived) return false;
  if (!LAPSABLE.has(String(proposal.status ?? ""))) return false;
  if (!proposal.expiryDate) return false;
  const expiry = typeof proposal.expiryDate === "string" ? new Date(proposal.expiryDate) : proposal.expiryDate;
  if (Number.isNaN(expiry.getTime())) return false;
  return now > expiry;
}

/**
 * The status an expired proposal returns to when its date is extended.
 *
 * A client who had already opened it goes back to "viewed" — reverting them to
 * "sent" would contradict the view count sitting next to it on the same row.
 */
export function statusOnReinstate(proposal: Pick<Proposal, "viewCount" | "viewedDate">): "sent" | "viewed" {
  return (proposal.viewCount ?? 0) > 0 || proposal.viewedDate ? "viewed" : "sent";
}

/** Convenience for the Send dialog's "valid for N days". */
export function expiryFromDays(days: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return endOfDay(d);
}

/** Whole days until a proposal lapses; negative once it has. */
export function daysUntilExpiry(expiryDate: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!expiryDate) return null;
  const d = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}
