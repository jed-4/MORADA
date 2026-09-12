import { storage } from "../storage";
import { emitNotification } from "../socketManager";
import { sendGenericEmail } from "../utils/email";
import { renderClientEmail } from "./clientEmailShell";
import { formatCents } from "@shared/money";
import {
  PUSH_PREFS_VIEW_KEY,
  shouldEmailForType,
} from "@shared/notificationGroups";

/**
 * Tell the builder when a client decides something.
 *
 * The variation portal could take a client's signature — which approves the
 * variation outright, makes it immutable and extends the project end date —
 * and the builder was told nothing at all. No bell, no activity entry, no
 * email. You found out by happening to open the variation.
 *
 * Three channels, deliberately different in kind:
 *
 *   in-app   always. It is free, it is where the rest of the app's events
 *            live, and a notification you miss costs nothing.
 *   activity always. The project feed is the record of what happened, and a
 *            client approving a variation is exactly what it is for.
 *   email    opt-in per group, and the client-decisions group is the one that
 *            defaults on — a signature arrives on the client's schedule, often
 *            out of hours, which is the case email exists for.
 *
 * Every channel is best-effort. A client's signature is the part that cannot be
 * retried, so nothing here is allowed to fail it.
 */

export type ClientDecision = "approved" | "rejected";

export interface ClientDecisionInput {
  decision: ClientDecision;
  /** Who to tell. Usually the variation's creator. */
  recipientUserId?: string | null;
  companyId?: string | null;
  projectId?: string | null;
  /** "VAR-001" */
  documentNumber?: string | null;
  /** The variation's own name. */
  documentName?: string | null;
  documentId: string;
  /** The name the client typed when signing. */
  signerName: string;
  totalCents?: number | null;
  rejectionReason?: string | null;
  /** Where the bell takes them. */
  link: string;
}

const TYPE_FOR: Record<ClientDecision, string> = {
  approved: "variation_client_approved",
  rejected: "variation_client_rejected",
};

/** Does this user want an email for this notification type? */
async function wantsEmail(userId: string, type: string): Promise<boolean> {
  try {
    const row = await storage.getUserViewPreferences(userId, PUSH_PREFS_VIEW_KEY);
    return shouldEmailForType(type, (row?.preferences as any)?.emailGroups);
  } catch {
    // A preference lookup that fails should not silently mute a channel the
    // user is expecting, so fall through to the defaults.
    return shouldEmailForType(type, undefined);
  }
}

export async function notifyClientDecision(input: ClientDecisionInput): Promise<void> {
  const {
    decision,
    recipientUserId,
    companyId,
    projectId,
    documentNumber,
    documentName,
    documentId,
    signerName,
    totalCents,
    rejectionReason,
    link,
  } = input;

  const type = TYPE_FOR[decision];
  const ref = documentNumber || documentName || "a variation";
  const money = typeof totalCents === "number" ? ` (${formatCents(totalCents)})` : "";
  const title = decision === "approved" ? "Variation approved by client" : "Variation rejected by client";
  const message =
    decision === "approved"
      ? `${signerName} approved ${ref}${money}.`
      : `${signerName} rejected ${ref}${money}.${rejectionReason ? ` "${rejectionReason}"` : ""}`;

  // ── The project feed ──────────────────────────────────────────────────────
  // Logged even with no recipient: the feed is the project's record, not one
  // person's inbox.
  try {
    if (projectId) {
      await storage.createActivity({
        projectId,
        companyId: companyId ?? null,
        // A client is not a user, so userId stays null and userName carries
        // who it actually was. The feed already renders userName.
        userId: null,
        userName: signerName,
        activityType: "variation",
        action: decision,
        description: message,
        entityId: documentId,
        entityName: documentName ?? documentNumber ?? null,
        metadata: { via: "client-portal", totalCents: totalCents ?? null },
      } as any);
    }
  } catch (err: any) {
    console.error("[client-decision] activity log failed:", err?.message);
  }

  if (!recipientUserId) return;

  // ── The bell ──────────────────────────────────────────────────────────────
  try {
    const notification = await storage.createNotification({
      userId: recipientUserId,
      companyId: companyId ?? null,
      type,
      title,
      message,
      link,
      entityType: "variation",
      entityId: documentId,
      isRead: false,
      createdByUserId: null,
    } as any);
    emitNotification(recipientUserId, notification);
  } catch (err: any) {
    console.error("[client-decision] notification failed:", err?.message);
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  try {
    if (!(await wantsEmail(recipientUserId, type))) return;
    const user = await storage.getUser(recipientUserId);
    if (!user?.email) return;

    const settings = companyId ? await storage.getCompanySettings(companyId) : undefined;
    const base = (process.env.APP_BASE_URL || "https://app.moradaco.com.au").replace(/\/$/, "");

    // The builder's own branding, not Morada's — this lands next to the mail
    // they send their clients, and renderClientEmail is what shapes those.
    const html = renderClientEmail({
      brand: {
        companyName: (settings as any)?.companyName,
        logoUrl: (settings as any)?.logoUrl,
        brandColor: (settings as any)?.brandColor,
      },
      body: message,
      cta: { href: `${base}${link}`, label: "Open the variation" },
      note:
        decision === "approved"
          ? "The variation is now approved and locked. Its days have been added to the schedule."
          : "Nothing has changed on the job. You can duplicate it for revision from the variation.",
    });

    await sendGenericEmail({
      to: user.email,
      subject: `${title} — ${ref}`,
      html,
      context: { type: "client_decision", id: documentId, companyId: companyId ?? null },
    });
  } catch (err: any) {
    console.error("[client-decision] email failed:", err?.message);
  }
}
