/**
 * Defects v2 stage 2 — trades. Contract: docs/DEFECTS_V2.md ("Stage 2").
 *
 *  - ONE private link per trade (contact) per job: `defect_trade_links`. The
 *    token is 32 random bytes; the page lists only that trade's defects on
 *    that job, never another trade's, never money.
 *  - "Send to trade" moves open defects to `sent`, stamps `sent_to_trade_at`,
 *    logs `sent_to_trade` and (optionally, for urgent ones) emails the trade
 *    straight away through the normal email service + delivery log.
 *  - The trade can Accept (→ accepted) or Mark as fixed (→ fixed, optional
 *    photo). Each is a `transition` event with actor = the trade's name, and
 *    notifies the owner and watchers.
 *  - A link is revoked when the trade has nothing open left on the job, or on
 *    demand from the office.
 *  - The daily digest (hourly sweep, ~7am company time) emails each trade what
 *    is new and overdue — skipped when there's neither — and reminds owners of
 *    their overdue defects through the notifications system.
 *
 * Every staff function takes the caller's companyId and scopes by it.
 * Public (token) functions resolve the company FROM the link and never take an
 * id from the request without checking it belongs to that link.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "../db";
import {
  contacts,
  defects,
  defectEvents,
  defectTradeLinks,
  projects,
  systemConfiguration,
  type Defect,
  type DefectTradeLink,
} from "@shared/schema";
import {
  DEFECT_STAGES,
  DEFECT_STAGE_LABELS,
  checkDefectTransition,
  defectNotifyRecipients,
  formatDefectRef,
  isDefectOverdue,
  isDefectStage,
  transitionSideEffects,
  type DefectStage,
} from "@shared/defects";
import {
  SENDABLE_STAGES,
  TRADE_VISIBLE_STAGES,
  buildDigest,
  isDigestDue,
  isWellFormedTradeToken,
  ownerOverdueReminderDue,
  tradeLinkShouldRevoke,
  tradeTransitionTarget,
  type DefectTradeStatus,
  type DefectTradeSummary,
  type TradeAction,
  type TradePortalView,
} from "@shared/defectTrades";
import { storage } from "../storage";
import { sendGenericEmail } from "../utils/email";
import { renderClientEmail } from "./clientEmailShell";
import { notifyDefectUsers } from "../utils/domainNotifications";
import { DefectError, logEvent, watcherIds, type DefectActions } from "./defects";

const CANONICAL_APP_URL = "https://app.moradaco.com.au";
const FROM_ADDRESS = "noreply@moradaco.com.au";

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || CANONICAL_APP_URL).replace(/\/+$/, "");
}

export function newTradeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tradePortalUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/portal/defects/${token}`;
}

type Actor = { id: string | null; name: string; companyId: string };

const tradeName = (c: { name: string; company: string | null }) => (c.company?.trim() || c.name).trim();

// ── contacts / links ────────────────────────────────────────────────────────

async function ownedContact(companyId: string, contactId: string) {
  const [c] = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
    .limit(1);
  return c ?? null;
}

async function liveLink(companyId: string, projectId: string, contactId: string) {
  const [row] = await db.select().from(defectTradeLinks)
    .where(and(
      eq(defectTradeLinks.companyId, companyId),
      eq(defectTradeLinks.projectId, projectId),
      eq(defectTradeLinks.contactId, contactId),
      isNull(defectTradeLinks.revokedAt),
    ))
    .limit(1);
  return row ?? null;
}

/** The live link for this trade on this job, created if there isn't one. */
export async function getOrCreateTradeLink(companyId: string, projectId: string, contactId: string): Promise<DefectTradeLink> {
  const existing = await liveLink(companyId, projectId, contactId);
  if (existing) return existing;
  try {
    const [row] = await db.insert(defectTradeLinks)
      .values({ companyId, projectId, contactId, token: newTradeToken() })
      .returning();
    return row;
  } catch (err: any) {
    // Two sends raced; the partial unique index let one through.
    if ((err?.code ?? err?.cause?.code) !== "23505") throw err;
    const again = await liveLink(companyId, projectId, contactId);
    if (!again) throw err;
    return again;
  }
}

/** Revoke the trade's live link on this job (no-op when there isn't one). */
export async function revokeTradeLink(params: { companyId: string; projectId: string; contactId: string; actor: Actor | null; reason: string }) {
  const { companyId, projectId, contactId, actor, reason } = params;
  const revoked = await db.update(defectTradeLinks)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(defectTradeLinks.companyId, companyId),
      eq(defectTradeLinks.projectId, projectId),
      eq(defectTradeLinks.contactId, contactId),
      isNull(defectTradeLinks.revokedAt),
    ))
    .returning({ id: defectTradeLinks.id });
  if (!revoked.length) return false;
  // One event on each of the trade's defects so the history says why the
  // trade's link stopped working.
  const rows = await db.select({ id: defects.id }).from(defects)
    .where(and(eq(defects.projectId, projectId), eq(defects.companyId, companyId), eq(defects.assignedContactId, contactId)));
  if (rows.length) {
    await db.insert(defectEvents).values(rows.map((r) => ({
      companyId, defectId: r.id, type: "link_revoked",
      actorUserId: actor?.id ?? null, actorName: actor?.name ?? "Morada", data: { contactId, reason },
    })));
  }
  return true;
}

/** Revoke the link if the trade has nothing open left on the job. */
export async function revokeTradeLinkIfDone(companyId: string, projectId: string, contactId: string | null | undefined) {
  if (!contactId) return false;
  const rows = await db.select({ stage: defects.stage }).from(defects)
    .where(and(eq(defects.projectId, projectId), eq(defects.companyId, companyId), eq(defects.assignedContactId, contactId)));
  if (!tradeLinkShouldRevoke(rows.map((r) => r.stage))) return false;
  return revokeTradeLink({ companyId, projectId, contactId, actor: null, reason: "No open defects left" });
}

/** After any stage change from the office (close, reopen…): tidy the link. */
export async function afterDefectStageChange(companyId: string, defectId: string) {
  try {
    const [d] = await db.select({ projectId: defects.projectId, contactId: defects.assignedContactId })
      .from(defects).where(and(eq(defects.id, defectId), eq(defects.companyId, companyId))).limit(1);
    if (d) await revokeTradeLinkIfDone(companyId, d.projectId, d.contactId);
  } catch (err) {
    console.error("[defect-trades] link tidy failed:", err);
  }
}

// ── send to trade ───────────────────────────────────────────────────────────

export const sendToTradeSchema = z.object({
  /** Set / change the trade contact while sending. */
  contactId: z.string().min(1).optional(),
  /** Email the trade now (urgent). Otherwise it goes in tomorrow's digest. */
  emailNow: z.boolean().optional(),
  message: z.string().trim().max(2000).optional(),
});

export const sendAllToTradeSchema = z.object({
  emailNow: z.boolean().optional(),
  message: z.string().trim().max(2000).optional(),
});

type Brand = Awaited<ReturnType<typeof loadBrand>>;

async function loadBrand(companyId: string) {
  const settings: any = await storage.getCompanySettings(companyId).catch(() => undefined);
  return {
    companyName: (settings?.companyName as string | null) ?? null,
    logoUrl: (settings?.logoUrl as string | null) ?? null,
    brandColor: (settings?.brandColor as string | null) ?? null,
    phone: (settings?.phone as string | null) ?? null,
    email: (settings?.email as string | null) ?? null,
    address: (settings?.address as string | null) ?? null,
    documentStyle: (settings?.documentStyle as string | null) ?? "style1",
  };
}

const fmtDate = (d: Date | string | null | undefined, timeZone = "Australia/Sydney") =>
  d ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(d)) : null;

function defectLine(d: Pick<Defect, "number" | "title" | "location" | "dueDate">, timeZone: string) {
  const due = fmtDate(d.dueDate, timeZone);
  return `• ${formatDefectRef(d.number)} ${d.title}${d.location ? ` — ${d.location}` : ""}${due ? ` (due ${due})` : ""}`;
}

async function emailTrade(params: {
  kind: "defect_trade" | "defect_digest";
  link: DefectTradeLink;
  to: string;
  subject: string;
  body: string;
  brand: Brand;
  baseUrl: string;
  sender?: { name?: string | null; email?: string | null } | null;
  userId?: string | null;
}) {
  const { link, brand } = params;
  const html = renderClientEmail({
    brand,
    body: params.body,
    cta: { href: tradePortalUrl(params.baseUrl, link.token), label: "View your defects" },
    note: "This link is just for you — it shows only your defects on this job.",
    sender: params.sender ?? null,
  });
  await sendGenericEmail({
    to: params.to,
    subject: params.subject,
    html,
    from: `${brand.companyName || "Morada"} via Morada <${FROM_ADDRESS}>`,
    ...(params.sender?.email ? { replyTo: params.sender.email } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    context: { type: params.kind, id: link.id, companyId: link.companyId },
  });
  await db.update(defectTradeLinks).set({ lastEmailedAt: new Date() }).where(eq(defectTradeLinks.id, link.id));
}

async function companyTimeZone(companyId: string): Promise<string> {
  const rows = await db.select({ companyId: systemConfiguration.companyId, timezone: systemConfiguration.timezone })
    .from(systemConfiguration)
    .where(or(eq(systemConfiguration.companyId, companyId), isNull(systemConfiguration.companyId)));
  return rows.find((r) => r.companyId === companyId)?.timezone || rows.find((r) => !r.companyId)?.timezone || "Australia/Sydney";
}

export interface SendResult {
  contactId: string;
  contactName: string;
  sent: number;
  emailed: boolean;
  emailError: string | null;
  linkUrl: string;
}

/**
 * Send these defects (all on one project, all one trade) to the trade.
 * Open ones move to `sent`; ones already with the trade are re-included in the
 * email but keep their stage and first-sent time.
 */
async function sendBatch(params: {
  companyId: string;
  projectId: string;
  contactId: string;
  rows: Defect[];
  actor: Actor;
  actions: DefectActions;
  emailNow: boolean;
  message?: string;
  baseUrl: string;
}): Promise<SendResult> {
  const { companyId, projectId, contactId, rows, actor, actions, emailNow, baseUrl } = params;
  const contact = await ownedContact(companyId, contactId);
  if (!contact) throw new DefectError(400, "Trade contact not found");
  const name = tradeName(contact);

  for (const d of rows) {
    if (!(SENDABLE_STAGES as readonly string[]).includes(d.stage)) {
      throw new DefectError(400, `${formatDefectRef(d.number)} is ${DEFECT_STAGE_LABELS[d.stage as DefectStage] ?? d.stage} — it can't be sent to a trade`);
    }
    if (d.stage === "open") {
      const check = checkDefectTransition("open", "sent", { canEdit: actions.edit, canClose: actions.close });
      if (!check.ok) throw new DefectError(check.status, check.error);
    }
  }

  const link = await getOrCreateTradeLink(companyId, projectId, contactId);
  const now = new Date();
  let moved = 0;
  for (const d of rows) {
    const fromOpen = d.stage === "open";
    const side = fromOpen ? transitionSideEffects("sent", actor, now) : null;
    const updated = await db.update(defects)
      .set({
        ...(side ? { stage: "sent", ...side } : {}),
        assignedContactId: contact.id,
        assignedContactName: name,
        ...(d.sentToTradeAt ? {} : { sentToTradeAt: now }),
        updatedAt: now,
      })
      .where(and(eq(defects.id, d.id), eq(defects.stage, d.stage)))
      .returning({ id: defects.id });
    if (!updated.length) throw new DefectError(409, `Someone else just changed ${formatDefectRef(d.number)} — reload and try again`);
    if (fromOpen) {
      moved++;
      await logEvent(companyId, d.id, "transition", actor, { from: "open", to: "sent", note: null });
    }
    await logEvent(companyId, d.id, "sent_to_trade", actor, {
      contactId: contact.id, contactName: name, emailed: emailNow && !!contact.email,
    });
  }

  // Owner + watchers hear about it, as with any other move.
  await Promise.all(rows.map(async (d) => {
    const recipients = defectNotifyRecipients({ actorUserId: actor.id, ownerUserId: d.ownerUserId, watcherIds: await watcherIds(d.id) });
    if (recipients.length) {
      void notifyDefectUsers({
        userIds: recipients, companyId, projectId, defectId: d.id, actorUserId: actor.id,
        title: `${formatDefectRef(d.number)} sent to ${name}`,
        message: `${actor.name} sent "${d.title}" to ${name}`,
      });
    }
  }));

  let emailed = false;
  let emailError: string | null = null;
  if (emailNow) {
    if (!contact.email) {
      emailError = `${name} has no email address — copy the link and send it another way`;
    } else {
      try {
        const [brand, project, tz, sender] = await Promise.all([
          loadBrand(companyId),
          storage.getProject(projectId).catch(() => undefined),
          companyTimeZone(companyId),
          actor.id ? storage.getUser(actor.id).catch(() => undefined) : undefined,
        ]);
        const projectName = project?.name ?? "the job";
        const n = rows.length;
        const lines = rows.map((d) => defectLine(d, tz)).join("\n");
        const body = [
          `Hi ${contact.name?.split(" ")[0] || name},`,
          params.message?.trim() || `${brand.companyName || "We"} ${n === 1 ? "has a defect" : `have ${n} defects`} for you to fix at ${projectName}:`,
          lines,
          "Open your link to see photos and locations. Tap Accept when you've got it, and Mark as fixed when it's done.",
        ].join("\n\n");
        await emailTrade({
          kind: "defect_trade", link, to: contact.email, brand, baseUrl, body,
          subject: `${n === 1 ? `Defect to fix: ${rows[0].title}` : `${n} defects to fix`} — ${projectName}`,
          sender: sender ? { name: [sender.firstName, sender.lastName].filter(Boolean).join(" ") || null, email: sender.email } : null,
          userId: actor.id,
        });
        emailed = true;
      } catch (err: any) {
        emailError = err?.message || "The email didn't send";
      }
    }
  }

  return { contactId: contact.id, contactName: name, sent: moved, emailed, emailError, linkUrl: tradePortalUrl(baseUrl, link.token) };
}

/** "Send to trade" on one defect. */
export async function sendDefectToTrade(params: {
  id: string;
  companyId: string;
  actor: Actor;
  actions: DefectActions;
  body: z.infer<typeof sendToTradeSchema>;
  baseUrl: string;
}) {
  const { id, companyId } = params;
  const [row] = await db.select({ d: defects }).from(defects)
    .innerJoin(projects, eq(projects.id, defects.projectId))
    .where(and(eq(defects.id, id), eq(projects.companyId, companyId))).limit(1);
  if (!row) throw new DefectError(404, "Defect not found");
  const d = row.d;
  const contactId = params.body.contactId || d.assignedContactId;
  if (!contactId) throw new DefectError(400, "Pick the trade to send it to");
  if (d.assignedContactId && contactId !== d.assignedContactId && d.stage !== "open") {
    // Moving a live defect to another trade: tidy the old trade's link after.
    const result = await sendBatch({ ...params, projectId: d.projectId, contactId, rows: [d], emailNow: !!params.body.emailNow, message: params.body.message });
    await revokeTradeLinkIfDone(companyId, d.projectId, d.assignedContactId);
    return result;
  }
  return sendBatch({ ...params, projectId: d.projectId, contactId, rows: [d], emailNow: !!params.body.emailNow, message: params.body.message });
}

/** "Send all open for this trade" on a project. */
export async function sendAllToTrade(params: {
  companyId: string;
  projectId: string;
  contactId: string;
  actor: Actor;
  actions: DefectActions;
  body: z.infer<typeof sendAllToTradeSchema>;
  baseUrl: string;
}) {
  const rows = await db.select().from(defects)
    .where(and(
      eq(defects.projectId, params.projectId),
      eq(defects.companyId, params.companyId),
      eq(defects.assignedContactId, params.contactId),
      inArray(defects.stage, SENDABLE_STAGES as unknown as string[]),
    ))
    .orderBy(asc(defects.number));
  if (!rows.length) throw new DefectError(400, "This trade has no open defects on this job");
  return sendBatch({ ...params, rows, emailNow: !!params.body.emailNow, message: params.body.message });
}

// ── staff views ─────────────────────────────────────────────────────────────

function linkView(l: DefectTradeLink | null | undefined) {
  if (!l) return null;
  return { id: l.id, createdAt: l.createdAt.toISOString(), lastViewedAt: l.lastViewedAt?.toISOString() ?? null, live: !l.revokedAt };
}

/** Trade status for one defect's drawer. */
export async function getDefectTradeStatus(id: string, companyId: string): Promise<DefectTradeStatus> {
  const [row] = await db.select({ d: defects }).from(defects)
    .innerJoin(projects, eq(projects.id, defects.projectId))
    .where(and(eq(defects.id, id), eq(projects.companyId, companyId))).limit(1);
  if (!row) throw new DefectError(404, "Defect not found");
  const d = row.d;
  const [contact, link] = d.assignedContactId
    ? await Promise.all([ownedContact(companyId, d.assignedContactId), liveLink(companyId, d.projectId, d.assignedContactId)])
    : [null, null];
  return {
    contactId: d.assignedContactId,
    contactName: contact ? tradeName(contact) : d.assignedContactName,
    contactEmail: contact?.email ?? null,
    sentToTradeAt: d.sentToTradeAt?.toISOString() ?? null,
    tradeViewedAt: d.tradeViewedAt?.toISOString() ?? null,
    tradeMarkedFixedAt: d.tradeMarkedFixedAt?.toISOString() ?? null,
    link: linkView(link),
  };
}

/** Per-trade view for a project: counts by stage, overdue, link state. */
export async function listProjectTrades(companyId: string, projectId: string, withMoney: boolean): Promise<DefectTradeSummary[]> {
  const now = new Date();
  const [rows, links] = await Promise.all([
    db.select({
      contactId: defects.assignedContactId,
      stage: defects.stage,
      dueDate: defects.dueDate,
      backchargeCents: defects.backchargeCents,
      backchargeContactId: defects.backchargeContactId,
    }).from(defects)
      .where(and(eq(defects.projectId, projectId), eq(defects.companyId, companyId), or(isNotNull(defects.assignedContactId), isNotNull(defects.backchargeContactId)))),
    db.select().from(defectTradeLinks)
      .where(and(eq(defectTradeLinks.companyId, companyId), eq(defectTradeLinks.projectId, projectId)))
      .orderBy(desc(defectTradeLinks.createdAt)),
  ]);
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.contactId) ids.add(r.contactId);
    if (r.backchargeContactId) ids.add(r.backchargeContactId);
  }
  for (const l of links) ids.add(l.contactId);
  if (!ids.size) return [];
  const people = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company, email: contacts.email })
    .from(contacts).where(and(eq(contacts.companyId, companyId), inArray(contacts.id, Array.from(ids))));

  return people.map((c) => {
    const mine = rows.filter((r) => r.contactId === c.id);
    const counts = Object.fromEntries(DEFECT_STAGES.map((s) => [s, 0])) as Record<DefectStage, number>;
    for (const r of mine) counts[isDefectStage(r.stage) ? r.stage : "open"]++;
    const link = links.find((l) => l.contactId === c.id && !l.revokedAt) ?? links.find((l) => l.contactId === c.id) ?? null;
    const out: DefectTradeSummary = {
      contactId: c.id,
      contactName: tradeName(c),
      contactEmail: c.email ?? null,
      counts,
      overdue: mine.filter((r) => isDefectOverdue({ stage: r.stage, dueDate: r.dueDate }, now)).length,
      link: link ? { ...linkView(link)!, lastDigestAt: link.lastDigestAt?.toISOString() ?? null } : null,
    };
    if (withMoney) {
      out.backchargeCents = rows
        .filter((r) => (r.backchargeContactId ?? r.contactId) === c.id && r.backchargeCents)
        .reduce((sum, r) => sum + (r.backchargeCents ?? 0), 0);
    }
    return out;
  }).sort((a, b) => a.contactName.localeCompare(b.contactName));
}

/** The trade's link URL (created if needed) — for "Copy link". */
export async function tradeLinkFor(companyId: string, projectId: string, contactId: string, baseUrl: string) {
  const contact = await ownedContact(companyId, contactId);
  if (!contact) throw new DefectError(404, "Trade contact not found");
  const link = await getOrCreateTradeLink(companyId, projectId, contactId);
  return { url: tradePortalUrl(baseUrl, link.token), link: linkView(link) };
}

// ── public trade page ───────────────────────────────────────────────────────

async function linkByToken(token: string) {
  if (!isWellFormedTradeToken(token)) return null;
  const [row] = await db.select().from(defectTradeLinks).where(eq(defectTradeLinks.token, token)).limit(1);
  return row ?? null;
}

/** 404 for an unknown token, 410 for a revoked one. */
async function requireLiveLink(token: string) {
  const link = await linkByToken(token);
  if (!link) throw new DefectError(404, "Invalid or expired link");
  if (link.revokedAt) throw new DefectError(410, "This link has been turned off. Ask the builder for a new one if you still have work to do.");
  return link;
}

async function linkDefects(link: DefectTradeLink) {
  return db.select().from(defects)
    .where(and(
      eq(defects.projectId, link.projectId),
      eq(defects.companyId, link.companyId),
      eq(defects.assignedContactId, link.contactId),
      inArray(defects.stage, TRADE_VISIBLE_STAGES as unknown as string[]),
    ))
    .orderBy(asc(defects.dueDate), asc(defects.number));
}

type Photo = { url: string; name?: string; type?: string; kind?: string };

export function tradePhotoUrl(token: string, defectId: string, index: number) {
  return `/api/portal/defects/${token}/photos/${defectId}/${index}`;
}

export async function loadTradePortal(token: string): Promise<TradePortalView> {
  const link = await requireLiveLink(token);
  const [rows, contact, brand, project] = await Promise.all([
    linkDefects(link),
    ownedContact(link.companyId, link.contactId),
    loadBrand(link.companyId),
    storage.getProject(link.projectId).catch(() => undefined),
  ]);
  if (!contact) throw new DefectError(404, "Invalid or expired link");
  const now = new Date();
  const name = tradeName(contact);

  // Latest "sent back" note per defect, so the trade sees why it bounced.
  const rejected = rows.filter((d) => d.stage === "rejected").map((d) => d.id);
  const notes = new Map<string, string>();
  if (rejected.length) {
    const evs = await db.select({ defectId: defectEvents.defectId, data: defectEvents.data })
      .from(defectEvents)
      .where(and(
        inArray(defectEvents.defectId, rejected),
        eq(defectEvents.companyId, link.companyId),
        eq(defectEvents.type, "transition"),
        sql`${defectEvents.data}->>'to' = 'rejected'`,
      ))
      .orderBy(desc(defectEvents.createdAt));
    for (const e of evs) if (!notes.has(e.defectId)) notes.set(e.defectId, String((e.data as any)?.note ?? "") || "");
  }

  // Stamp the views (first time per defect gets an event).
  const unseen = rows.filter((d) => !d.tradeViewedAt);
  await Promise.all([
    db.update(defectTradeLinks).set({ lastViewedAt: now }).where(eq(defectTradeLinks.id, link.id)),
    unseen.length
      ? db.update(defects).set({ tradeViewedAt: now }).where(and(inArray(defects.id, unseen.map((d) => d.id)), isNull(defects.tradeViewedAt)))
      : Promise.resolve(),
    unseen.length
      ? db.insert(defectEvents).values(unseen.map((d) => ({
        companyId: link.companyId, defectId: d.id, type: "trade_viewed",
        actorUserId: null, actorName: name, data: { contactId: contact.id },
      })))
      : Promise.resolve(),
  ]);

  return {
    companyName: brand.companyName,
    projectName: project?.name ?? null,
    projectAddress: ((project as any)?.location as string | null) ?? null,
    tradeName: name,
    defects: rows.map((d) => {
      const photos = (Array.isArray(d.attachments) ? d.attachments : []) as Photo[];
      return {
        id: d.id,
        ref: formatDefectRef(d.number),
        title: d.title,
        description: d.description,
        location: d.location,
        priority: d.priority,
        stage: (isDefectStage(d.stage) ? d.stage : "open") as DefectStage,
        dueDate: d.dueDate?.toISOString() ?? null,
        overdue: isDefectOverdue({ stage: d.stage, dueDate: d.dueDate }, now),
        sentAt: d.sentToTradeAt?.toISOString() ?? null,
        rejectedNote: notes.get(d.id) || null,
        photos: photos
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => (p.type ?? "").startsWith("image") || /\.(jpe?g|png|heic|webp|gif)$/i.test(p.name ?? p.url))
          .map(({ p, i }) => ({ url: tradePhotoUrl(token, d.id, i), name: p.name ?? "", kind: p.kind ?? null })),
      };
    }),
  };
}

/** The stored object path of a photo on a defect the link may see, or null. */
export async function tradePhotoPath(token: string, defectId: string, index: number): Promise<string | null> {
  const link = await linkByToken(token);
  if (!link || link.revokedAt) return null;
  const [d] = await db.select({ attachments: defects.attachments, stage: defects.stage }).from(defects)
    .where(and(
      eq(defects.id, defectId),
      eq(defects.projectId, link.projectId),
      eq(defects.companyId, link.companyId),
      eq(defects.assignedContactId, link.contactId),
    )).limit(1);
  if (!d || !(TRADE_VISIBLE_STAGES as readonly string[]).includes(d.stage)) return null;
  const photos = (Array.isArray(d.attachments) ? d.attachments : []) as Photo[];
  const p = photos[index];
  if (!p || !p.url.startsWith(`/objects/company/${link.companyId}/`)) return null;
  return p.url;
}

export const tradeActionSchema = z.object({
  action: z.enum(["accept", "fixed"]),
  note: z.string().trim().max(2000).optional(),
  /** Optional photo as a data URL — images only, up to 10 MB. */
  photo: z.string().max(15_000_000).optional(),
  photoName: z.string().trim().max(200).optional(),
});

export function decodePhotoDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new DefectError(400, "The photo must be an image");
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length) throw new DefectError(400, "The photo is empty");
  if (buffer.length > 10 * 1024 * 1024) throw new DefectError(400, "That photo is over 10 MB");
  return { buffer, mime: m[1].toLowerCase() };
}

/** Accept / Mark as fixed from the trade's page. */
export async function tradeAct(params: {
  token: string;
  defectId: string;
  body: z.infer<typeof tradeActionSchema>;
  uploadPhoto: (buffer: Buffer, mime: string, companyId: string) => Promise<string>;
}) {
  const { token, defectId, body } = params;
  const link = await requireLiveLink(token);
  const [d] = await db.select().from(defects)
    .where(and(
      eq(defects.id, defectId),
      eq(defects.projectId, link.projectId),
      eq(defects.companyId, link.companyId),
      eq(defects.assignedContactId, link.contactId),
    )).limit(1);
  if (!d || !(TRADE_VISIBLE_STAGES as readonly string[]).includes(d.stage)) throw new DefectError(404, "Defect not found");
  const target = tradeTransitionTarget(d.stage, body.action as TradeAction);
  if (!target.ok) throw new DefectError(409, target.error);
  if (body.photo && body.action !== "fixed") throw new DefectError(400, "Photos go with Mark as fixed");

  const contact = await ownedContact(link.companyId, link.contactId);
  const name = contact ? tradeName(contact) : "Trade";
  const actor: Actor = { id: null, name, companyId: link.companyId };

  let photo: Photo | null = null;
  if (body.photo) {
    const { buffer, mime } = decodePhotoDataUrl(body.photo);
    const url = await params.uploadPhoto(buffer, mime, link.companyId);
    photo = { url, name: body.photoName || `fixed-${formatDefectRef(d.number)}.jpg`, type: mime, kind: "trade" };
  }

  const now = new Date();
  const side = transitionSideEffects(target.to, actor, now);
  const attachments = photo ? [...(((d.attachments as Photo[] | null) ?? [])), photo] : undefined;
  const updated = await db.update(defects)
    .set({
      stage: target.to,
      ...side,
      ...(attachments ? { attachments } : {}),
      ...(target.to === "fixed" ? { tradeMarkedFixedAt: now } : {}),
      updatedAt: now,
    })
    .where(and(eq(defects.id, d.id), eq(defects.stage, d.stage)))
    .returning({ id: defects.id });
  if (!updated.length) throw new DefectError(409, "This defect just changed — reload the page");

  const note = body.note?.trim() || null;
  await Promise.all([
    logEvent(link.companyId, d.id, "transition", actor, { from: d.stage, to: target.to, note, via: "trade_link", contactId: link.contactId }),
    photo ? logEvent(link.companyId, d.id, "photo", actor, { photos: [photo], count: 1, via: "trade_link" }) : Promise.resolve(),
  ]);

  const recipients = defectNotifyRecipients({ actorUserId: null, ownerUserId: d.ownerUserId, watcherIds: await watcherIds(d.id) });
  if (recipients.length) {
    void notifyDefectUsers({
      userIds: recipients, companyId: link.companyId, projectId: d.projectId, defectId: d.id, actorUserId: null,
      title: target.to === "fixed"
        ? `${formatDefectRef(d.number)} fixed by ${name} — check it`
        : `${formatDefectRef(d.number)} accepted by ${name}`,
      message: `${name} ${target.to === "fixed" ? "marked" : "accepted"} "${d.title}"${target.to === "fixed" ? " as fixed" : ""}${note ? `: ${note}` : ""}`,
    });
  }
  return loadTradePortal(token);
}

// ── daily digest + owner overdue reminders ──────────────────────────────────

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly; each trade gets one a day
const STARTUP_DELAY_MS = 225_000; // stagger off the RFQ / proposal / variation sweeps
let started = false;

export async function sweepDefectDigests(now = new Date()): Promise<{ links: number; emailed: number; revoked: number; reminded: number }> {
  let emailed = 0;
  let revoked = 0;
  let reminded = 0;
  const links = await db.select().from(defectTradeLinks).where(isNull(defectTradeLinks.revokedAt));
  const tzCache = new Map<string, string>();
  const tzFor = async (companyId: string) => {
    if (!tzCache.has(companyId)) tzCache.set(companyId, await companyTimeZone(companyId).catch(() => "Australia/Sydney"));
    return tzCache.get(companyId)!;
  };
  const brandCache = new Map<string, Brand>();
  const baseUrl = appBaseUrl();

  for (const link of links) {
    try {
      const tz = await tzFor(link.companyId);
      if (!isDigestDue({ now, timeZone: tz, lastDigestAt: link.lastDigestAt })) continue;
      // Claim the day first: a second instance or an overlapping tick loses.
      const claimed = await db.update(defectTradeLinks)
        .set({ lastDigestAt: now })
        .where(and(
          eq(defectTradeLinks.id, link.id),
          isNull(defectTradeLinks.revokedAt),
          link.lastDigestAt ? eq(defectTradeLinks.lastDigestAt, link.lastDigestAt) : isNull(defectTradeLinks.lastDigestAt),
        ))
        .returning({ id: defectTradeLinks.id });
      if (!claimed.length) continue;

      const rows = await linkDefects(link);
      if (tradeLinkShouldRevoke(rows.map((r) => r.stage))) {
        if (await revokeTradeLink({ companyId: link.companyId, projectId: link.projectId, contactId: link.contactId, actor: null, reason: "No open defects left" })) revoked++;
        continue;
      }
      const digest = buildDigest(rows, link.lastDigestAt, now);
      if (!digest.send) continue;
      const contact = await ownedContact(link.companyId, link.contactId);
      if (!contact?.email) continue;

      if (!brandCache.has(link.companyId)) brandCache.set(link.companyId, await loadBrand(link.companyId));
      const brand = brandCache.get(link.companyId)!;
      const project = await storage.getProject(link.projectId).catch(() => undefined);
      const projectName = project?.name ?? "the job";
      const parts = [`Hi ${contact.name?.split(" ")[0] || tradeName(contact)},`, `Here's where your defects stand at ${projectName}.`];
      if (digest.overdue.length) parts.push(`Overdue (${digest.overdue.length}):\n${digest.overdue.map((d) => defectLine(d, tz)).join("\n")}`);
      if (digest.fresh.length) parts.push(`New (${digest.fresh.length}):\n${digest.fresh.map((d) => defectLine(d, tz)).join("\n")}`);
      parts.push("Tap Accept on anything you've picked up, and Mark as fixed when it's done.");
      await emailTrade({
        kind: "defect_digest", link, to: contact.email, brand, baseUrl, body: parts.join("\n\n"),
        subject: `${digest.overdue.length ? `${digest.overdue.length} overdue` : `${digest.fresh.length} new`} defect${digest.overdue.length + digest.fresh.length === 1 ? "" : "s"} — ${projectName}`,
      });
      emailed++;
    } catch (err) {
      console.error(`[defect-digest] link ${link.id} failed:`, err);
    }
  }

  // Owners: one reminder a day per overdue defect, from 7am their company time.
  const overdue = await db.select({
    id: defects.id, companyId: defects.companyId, projectId: defects.projectId, number: defects.number, title: defects.title,
    stage: defects.stage, dueDate: defects.dueDate, ownerUserId: defects.ownerUserId, remindedAt: defects.ownerOverdueRemindedAt,
    trade: defects.assignedContactName,
  }).from(defects)
    .where(and(
      isNotNull(defects.ownerUserId),
      isNotNull(defects.companyId),
      lt(defects.dueDate, now),
      inArray(defects.stage, ["open", "sent", "accepted", "rejected"]),
    ))
    .limit(2000);
  for (const d of overdue) {
    try {
      const tz = await tzFor(d.companyId!);
      if (localHour(now, tz) < 7) continue;
      if (!ownerOverdueReminderDue({ stage: d.stage, dueDate: d.dueDate, ownerUserId: d.ownerUserId, remindedAt: d.remindedAt, now, timeZone: tz })) continue;
      const claimed = await db.update(defects).set({ ownerOverdueRemindedAt: now })
        .where(and(eq(defects.id, d.id), d.remindedAt ? eq(defects.ownerOverdueRemindedAt, d.remindedAt) : isNull(defects.ownerOverdueRemindedAt)))
        .returning({ id: defects.id });
      if (!claimed.length) continue;
      await notifyDefectUsers({
        userIds: [d.ownerUserId!], companyId: d.companyId!, projectId: d.projectId, defectId: d.id, actorUserId: null,
        title: `${formatDefectRef(d.number)} is overdue`,
        message: `"${d.title}" was due ${fmtDate(d.dueDate, tz)}${d.trade ? ` — with ${d.trade}` : ""}`,
      });
      reminded++;
    } catch (err) {
      console.error(`[defect-digest] owner reminder ${d.id} failed:`, err);
    }
  }
  return { links: links.length, emailed, revoked, reminded };
}

function localHour(at: Date, tz: string) {
  try {
    return Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at)) % 24;
  } catch {
    return at.getUTCHours();
  }
}

export function startDefectDigestScheduler() {
  if (started) return;
  started = true;
  const tick = () => {
    sweepDefectDigests()
      .then((r) => {
        if (r.emailed || r.revoked || r.reminded) {
          console.log(`[defect-digest] ${r.emailed} digest(s) emailed, ${r.revoked} link(s) revoked, ${r.reminded} owner reminder(s)`);
        }
      })
      .catch((err) => console.error("[defect-digest] sweep failed:", err));
  };
  setTimeout(() => {
    tick();
    setInterval(tick, CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
