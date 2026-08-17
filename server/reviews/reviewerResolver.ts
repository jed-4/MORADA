/**
 * Who is reviewing, and what may they do.
 *
 * V1 ships CLIENT review only. Phase 2 — an admin pushing an estimate or RFQ to
 * a PM and back — is deliberately not built. But every place that would
 * otherwise hard-code "client" goes through this module instead, so phase 2 is
 * a new branch here plus a UI, not a rearchitecture.
 *
 * The seams, all already in the schema:
 *   review_items.reviewerType        "client" | "user"
 *   review_items.reviewerContactId   populated in V1
 *   review_items.reviewerUserId      always null in V1 — phase 2 fills it
 *   review_approvals.decidedByType   "client" | "user"
 *   review_comments.authorType       "team" | "client" | "system"
 *
 * Nothing here talks to the database directly: the lookups are injected, the
 * same shape as middleware/scopeOwnership.ts, so this is testable without a
 * live Postgres (server/auth.ts builds its session middleware in a module-load
 * IIFE bound to a pg store, so importing routes.ts requires a real database).
 */

import type { ReviewItem } from "@shared/schema";

/** Reviewer kinds. "user" is accepted by the types but unreachable in V1. */
export type ReviewerType = "client" | "user";

/** Who authored a comment. Distinct from ReviewerType: the builder writes too. */
export type ReviewAuthorType = "team" | "client" | "system";

/** How a decision reached us — a session, or an emailed direct link. */
export type ReviewDecidedVia = "portal_login" | "portal_token";

export interface ResolvedReviewer {
  type: ReviewerType;
  /** contacts.id for a client reviewer, users.id for an internal one. */
  refId: string | null;
  /** Best available display name; never empty. */
  displayName: string;
  email: string | null;
  /** False when the item has no reviewer assigned yet. */
  isAssigned: boolean;
}

/** The record shapes this module needs; anything else is the caller's business. */
export interface ReviewerLookups {
  getContact(id: string): Promise<{ id: string; name?: string | null; email?: string | null } | undefined | null>;
  getUser(id: string): Promise<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | undefined | null>;
  /** The project's assigned client contact — the V1 default reviewer. */
  getProjectClientContactId(projectId: string): Promise<string | null>;
}

export const UNASSIGNED_REVIEWER_NAME = "Unassigned";
/** Name recorded when a token holder decides without typing one. */
export const ANONYMOUS_REVIEWER_NAME = "Client";

function personName(user: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email || UNASSIGNED_REVIEWER_NAME;
}

export function createReviewerResolver(deps: ReviewerLookups) {
  /**
   * Resolve an item's reviewer to a display name + email.
   *
   * Never throws on a dangling ref: a contact deleted after assignment leaves
   * reviewerContactId null (ON DELETE SET NULL), and a stale id simply resolves
   * to unassigned rather than failing the whole request.
   */
  async function resolveReviewer(item: Pick<ReviewItem, "reviewerType" | "reviewerContactId" | "reviewerUserId">): Promise<ResolvedReviewer> {
    const type: ReviewerType = item.reviewerType === "user" ? "user" : "client";

    if (type === "user") {
      // Phase 2 path. Unreachable in V1 (nothing writes reviewerType="user"),
      // but implemented so the seam is real rather than aspirational.
      if (!item.reviewerUserId) {
        return { type, refId: null, displayName: UNASSIGNED_REVIEWER_NAME, email: null, isAssigned: false };
      }
      const user = await deps.getUser(item.reviewerUserId);
      if (!user) {
        return { type, refId: null, displayName: UNASSIGNED_REVIEWER_NAME, email: null, isAssigned: false };
      }
      return { type, refId: user.id, displayName: personName(user), email: user.email ?? null, isAssigned: true };
    }

    if (!item.reviewerContactId) {
      return { type, refId: null, displayName: UNASSIGNED_REVIEWER_NAME, email: null, isAssigned: false };
    }
    const contact = await deps.getContact(item.reviewerContactId);
    if (!contact) {
      return { type, refId: null, displayName: UNASSIGNED_REVIEWER_NAME, email: null, isAssigned: false };
    }
    return {
      type,
      refId: contact.id,
      displayName: (contact.name || "").trim() || contact.email || UNASSIGNED_REVIEWER_NAME,
      email: contact.email ?? null,
      isAssigned: true,
    };
  }

  /**
   * The reviewer a new item should default to.
   *
   * V1 rule: one client per PROJECT — the project's assigned client contact.
   * An explicit reviewerContactId on the create payload always wins, so the
   * builder can override per item without a schema change.
   */
  async function defaultReviewerForProject(projectId: string): Promise<{
    reviewerType: ReviewerType;
    reviewerContactId: string | null;
    reviewerUserId: null;
  }> {
    const contactId = await deps.getProjectClientContactId(projectId);
    return { reviewerType: "client", reviewerContactId: contactId, reviewerUserId: null };
  }

  return { resolveReviewer, defaultReviewerForProject };
}

export type ReviewerResolver = ReturnType<typeof createReviewerResolver>;

// ── Decision attribution ─────────────────────────────────────────────────────

/**
 * Which columns a decision writes for "who decided".
 *
 * Kept here rather than inline at the write site so that adding the phase-2
 * internal reviewer is one branch in one file. `decidedByType` mirrors
 * `reviewerType`, but they are separate columns on purpose: the person who
 * decides is not necessarily the person the item was addressed to (a second
 * client contact on the same project, say).
 */
export interface DecisionAttribution {
  decidedByType: ReviewerType;
  decidedByUserId: string | null;
  decidedByContactId: string | null;
  decidedByName: string;
  decidedVia: ReviewDecidedVia;
}

export function attributeDecision(args: {
  reviewer: ResolvedReviewer;
  via: ReviewDecidedVia;
  /** Session user id, when the decision came from a logged-in session. */
  sessionUserId?: string | null;
  /** Name typed by a token holder, or the session user's name. */
  typedName?: string | null;
}): DecisionAttribution {
  const { reviewer, via, sessionUserId, typedName } = args;

  const name =
    (typedName || "").trim().slice(0, 100) ||
    (reviewer.isAssigned ? reviewer.displayName : "") ||
    ANONYMOUS_REVIEWER_NAME;

  if (reviewer.type === "user") {
    return {
      decidedByType: "user",
      decidedByUserId: sessionUserId ?? reviewer.refId,
      decidedByContactId: null,
      decidedByName: name,
      decidedVia: via,
    };
  }

  // A logged-in client has BOTH a session user and a contact ref; record both,
  // so the trail survives either record being cleaned up later.
  return {
    decidedByType: "client",
    decidedByUserId: sessionUserId ?? null,
    decidedByContactId: reviewer.refId,
    decidedByName: name,
    decidedVia: via,
  };
}

/**
 * The author attribution for a comment.
 *
 * A session user who is NOT the reviewer is the builder's team; a client
 * session or a token holder is the reviewer side. System lines are written by
 * the server itself and are never user-attributed.
 */
export function attributeComment(args: {
  isSystem?: boolean;
  sessionUserId?: string | null;
  sessionUserCategory?: string | null;
  viaToken?: boolean;
}): { authorType: ReviewAuthorType; createdById: string | null } {
  if (args.isSystem) return { authorType: "system", createdById: null };
  if (args.viaToken) return { authorType: "client", createdById: null };
  if (args.sessionUserCategory === "client") {
    return { authorType: "client", createdById: args.sessionUserId ?? null };
  }
  return { authorType: "team", createdById: args.sessionUserId ?? null };
}
