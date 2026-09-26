/**
 * When a proposal's content is frozen, and what may still be changed anyway.
 *
 * Until now "sent" locked nothing. The builder showed a banner saying the
 * client's copy would not change — true, the snapshot is frozen — but the
 * sections, items and milestones routes had no status check at all, so a sent,
 * viewed or even accepted proposal could be edited freely. Nothing stopped it
 * and nothing recorded it, and your side drifted away from the document the
 * client is holding.
 *
 * One rule, here, used by the routes that enforce it and by the screens that
 * grey things out, so the two cannot disagree.
 */

/** Content is editable in exactly one state. */
export const EDITABLE_STATUS = "draft";

/**
 * Signed off and frozen, but not yet sent. The step people were asking for:
 * a proposal can be finished and locked against further fiddling before it
 * goes anywhere, and unlocked again if something is wrong.
 */
export const READY_STATUS = "ready";

export type ProposalLockStatus = string | null | undefined;

/** Can sections, items, milestones and the document itself still be changed? */
export function isProposalEditable(status: ProposalLockStatus): boolean {
  return (status ?? EDITABLE_STATUS) === EDITABLE_STATUS;
}

/** Locked before it has gone anywhere — the one lock that can be undone. */
export function isProposalReady(status: ProposalLockStatus): boolean {
  return status === READY_STATUS;
}

/** Locked because it has been sent; no way back except a new revision. */
export function isProposalSentToClient(status: ProposalLockStatus): boolean {
  return !isProposalEditable(status) && !isProposalReady(status);
}

/**
 * Fields that stay writable on a locked proposal.
 *
 * `expiryDate` because extending the date is how an expired proposal goes back
 * in front of a client without burning a revision number — blocking it would
 * strand every expired proposal. `isArchived` because filing something away is
 * not editing it. `remindersEnabled` because deciding to chase, or to stop
 * chasing, is a decision about a sent proposal and belongs to people who have
 * already sent it.
 */
export const LOCKED_WRITABLE_FIELDS = ["expiryDate", "isArchived", "remindersEnabled"] as const;

/** Which of these updates a locked proposal may not accept. */
export function blockedFieldsWhenLocked(patch: Record<string, unknown>): string[] {
  const allowed = new Set<string>(LOCKED_WRITABLE_FIELDS);
  return Object.keys(patch).filter((k) => !allowed.has(k));
}

export function proposalLockMessage(status: ProposalLockStatus): string {
  return isProposalReady(status)
    ? "This proposal is marked ready, so its content is locked. Unlock it to make changes."
    : "This proposal has been sent, so its content is locked. Create a new revision to change it.";
}
