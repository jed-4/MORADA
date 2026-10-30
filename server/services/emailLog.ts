import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  emailDeliveries,
  users,
  projects,
  variations,
  variationSends,
  proposals,
  proposalAcceptances,
  rfqs,
  rfqRecipients,
  rfqQuotes,
  purchaseOrders,
  clientInvoices,
  selections,
  reviewItems,
} from "@shared/schema";
import {
  ATTENTION_WINDOW_MS,
  NO_CONFIRMATION_AFTER_MS,
  emailTypeKey,
  hideBearerLinks,
  type EmailLogDetail,
  type EmailLogListResponse,
  type EmailLogRow,
  type EmailTimelineEvent,
} from "@shared/emailLog";

/**
 * The company email log — every row of email_deliveries a person may see.
 *
 * Scope is decided by the caller and passed in, never read from the request
 * here: `companyId` always, plus `onlyUserId` for someone without the
 * admin.email_log permission, who sees the emails they sent themselves.
 */
export interface EmailLogScope {
  companyId: string;
  onlyUserId?: string | null;
}

export interface EmailLogFilters {
  /** One row — the detail view reuses the list query for its joins and refs. */
  id?: string | null;
  status?: "attention" | "delivered" | "opened" | "problem" | "unconfirmed" | null;
  type?: string | null;
  projectId?: string | null;
  senderId?: string | null;
  /** Exact recipient, case-insensitive — a contact's history. */
  address?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  /** IANA zone the from/to dates are in. sent_at is UTC; without this an
   *  Australian "from 1 Oct" would start at 10–11am local. */
  timeZone?: string | null;
  cursor?: string | null;
  limit?: number;
}

/** Delivery events can only arrive once the webhook secret is configured. */
export function isDeliveryTrackingEnabled(): boolean {
  return !!process.env.RESEND_WEBHOOK_SECRET;
}

const hours = (ms: number) => `${Math.round(ms / 3_600_000)} hours`;

/**
 * Mirror of deliveryHealth().needsAttention in shared/emailLog.ts. If one
 * changes, the other must — the filter and the chip are the same claim.
 */
function attentionSql(trackingEnabled: boolean): SQL {
  const problem = sql`${emailDeliveries.status} IN ('failed', 'bounced', 'complained')`;
  if (!trackingEnabled) return problem;
  return sql`(${problem} OR (
    ${emailDeliveries.provider} = 'resend'
    AND ${emailDeliveries.status} IN ('sent', 'delayed')
    AND ${emailDeliveries.sentAt} > now() - ${hours(ATTENTION_WINDOW_MS)}::interval
    AND (${emailDeliveries.status} = 'delayed' OR ${emailDeliveries.sentAt} < now() - ${hours(NO_CONFIRMATION_AFTER_MS)}::interval)
  ))`;
}

function scopeConditions(scope: EmailLogScope): SQL[] {
  const conds: SQL[] = [eq(emailDeliveries.companyId, scope.companyId)];
  if (scope.onlyUserId) conds.push(eq(emailDeliveries.userId, scope.onlyUserId));
  return conds;
}

function filterConditions(f: EmailLogFilters, trackingEnabled: boolean): SQL[] {
  const conds: SQL[] = [];
  if (f.id) conds.push(eq(emailDeliveries.id, f.id));
  switch (f.status) {
    case "attention":
      conds.push(attentionSql(trackingEnabled));
      break;
    case "problem":
      conds.push(sql`${emailDeliveries.status} IN ('failed', 'bounced', 'complained')`);
      break;
    case "delivered":
      conds.push(eq(emailDeliveries.status, "delivered"));
      break;
    case "opened":
      conds.push(sql`${emailDeliveries.openCount} > 0`);
      break;
    case "unconfirmed":
      conds.push(sql`${emailDeliveries.status} IN ('sent', 'delayed')`);
      break;
  }
  if (f.type) {
    conds.push(f.type === "onboarding"
      ? sql`${emailDeliveries.contextType} LIKE 'onboarding:%'`
      : eq(emailDeliveries.contextType, f.type));
  }
  if (f.projectId) conds.push(eq(emailDeliveries.projectId, f.projectId));
  if (f.senderId) conds.push(eq(emailDeliveries.userId, f.senderId));
  if (f.address) {
    conds.push(sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${emailDeliveries.toAddresses}) a
                           WHERE lower(a) = lower(${f.address.trim()}))`);
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(${emailDeliveries.subject} ILIKE ${like} OR ${emailDeliveries.toAddresses}::text ILIKE ${like})`);
  }
  const localDate = f.timeZone
    ? sql`((${emailDeliveries.sentAt} AT TIME ZONE 'UTC') AT TIME ZONE ${f.timeZone})::date`
    : sql`(${emailDeliveries.sentAt})::date`;
  if (f.from) conds.push(sql`${localDate} >= ${f.from}::date`);
  if (f.to) conds.push(sql`${localDate} <= ${f.to}::date`);
  return conds;
}

function decodeCursor(cursor: string | null | undefined): { ts: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    return ts && id ? { ts, id } : null;
  } catch {
    return null;
  }
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function listEmailDeliveries(scope: EmailLogScope, f: EmailLogFilters): Promise<EmailLogListResponse> {
  const trackingEnabled = isDeliveryTrackingEnabled();
  const limit = Math.min(Math.max(Number.isFinite(f.limit) ? f.limit! : 100, 1), 200);
  const base = [...scopeConditions(scope), ...filterConditions(f, trackingEnabled)];

  const cursor = decodeCursor(f.cursor);
  const pageConds = cursor
    ? [...base, sql`(${emailDeliveries.sentAt}, ${emailDeliveries.id}) < (${cursor.ts}::timestamp, ${cursor.id})`]
    : base;

  // Summary is over the SCOPE, not the filters — the counts are the tabs, and
  // they should not change as you click between them. Totals cover 30 days;
  // "attention" is unwindowed so the badge matches the list it opens.
  const summaryConds = scopeConditions(scope);
  const last30 = sql`${emailDeliveries.sentAt} > now() - interval '30 days'`;

  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: emailDeliveries.id,
        sentAt: emailDeliveries.sentAt,
        cursorTs: sql<string>`${emailDeliveries.sentAt}::text`,
        toAddresses: emailDeliveries.toAddresses,
        subject: emailDeliveries.subject,
        provider: emailDeliveries.provider,
        status: emailDeliveries.status,
        statusDetail: emailDeliveries.statusDetail,
        statusUpdatedAt: emailDeliveries.statusUpdatedAt,
        contextType: emailDeliveries.contextType,
        contextId: emailDeliveries.contextId,
        projectId: emailDeliveries.projectId,
        projectName: projects.name,
        userId: emailDeliveries.userId,
        senderFirst: users.firstName,
        senderLast: users.lastName,
        senderEmail: users.email,
        openCount: emailDeliveries.openCount,
        firstOpenedAt: emailDeliveries.firstOpenedAt,
        attachmentCount: sql<number>`jsonb_array_length(${emailDeliveries.attachments})`,
        resentFromId: emailDeliveries.resentFromId,
      })
      .from(emailDeliveries)
      .leftJoin(users, eq(users.id, emailDeliveries.userId))
      // Project joined on the company too: a context document from another
      // tenant must never lend this row its name.
      .leftJoin(projects, and(eq(projects.id, emailDeliveries.projectId), eq(projects.companyId, scope.companyId)))
      .where(and(...pageConds))
      .orderBy(desc(emailDeliveries.sentAt), desc(emailDeliveries.id))
      .limit(limit + 1),
    db
      .select({
        total: sql<number>`count(*) FILTER (WHERE ${last30})::int`,
        delivered: sql<number>`count(*) FILTER (WHERE ${last30} AND ${emailDeliveries.status} = 'delivered')::int`,
        opened: sql<number>`count(*) FILTER (WHERE ${last30} AND ${emailDeliveries.openCount} > 0)::int`,
        attention: sql<number>`count(*) FILTER (WHERE ${attentionSql(trackingEnabled)})::int`,
      })
      .from(emailDeliveries)
      .where(and(...summaryConds)),
  ]);

  const page = rows.slice(0, limit);
  const refs = await resolveContextRefs(page, scope.companyId);
  const last = page[page.length - 1];

  return {
    rows: page.map((r): EmailLogRow => ({
      id: r.id,
      sentAt: iso(r.sentAt)!,
      toAddresses: r.toAddresses ?? [],
      subject: r.subject,
      provider: r.provider,
      status: r.status,
      statusDetail: r.statusDetail,
      statusUpdatedAt: iso(r.statusUpdatedAt),
      contextType: r.contextType,
      contextId: r.contextId,
      contextRef: (r.contextId && refs.get(r.contextId)) || null,
      projectId: r.projectName ? r.projectId : null,
      projectName: r.projectName ?? null,
      userId: r.userId,
      senderName: [r.senderFirst, r.senderLast].filter(Boolean).join(" ") || r.senderEmail || null,
      openCount: r.openCount ?? 0,
      firstOpenedAt: iso(r.firstOpenedAt),
      attachmentCount: Number(r.attachmentCount ?? 0),
      resentFromId: r.resentFromId,
    })),
    nextCursor: rows.length > limit && last
      ? Buffer.from(`${last.cursorTs}|${last.id}`, "utf8").toString("base64url")
      : null,
    trackingEnabled,
    scopeAll: !scope.onlyUserId,
    summary: summary ?? { total: 0, delivered: 0, opened: 0, attention: 0 },
  };
}

/**
 * The document number each row was about ("4501-VO-017", "RFQ-012"), one query
 * per type present on the page, all in parallel. Every lookup is filtered by
 * company: the context id came from our own write, but a ref is a label shown
 * to a user, and it must not be able to name another tenant's document.
 */
async function resolveContextRefs(
  rows: Array<{ contextType: string | null; contextId: string | null }>,
  companyId: string,
): Promise<Map<string, string>> {
  const idsFor = (...types: string[]) =>
    Array.from(new Set(rows.filter((r) => r.contextId && types.includes(emailTypeKey(r.contextType))).map((r) => r.contextId!)));

  const v = idsFor("variation", "client_decision");
  const p = idsFor("proposal", "proposal_reminder");
  const r = idsFor("rfq", "rfq_reminder");
  const po = idsFor("purchase_order");
  const ci = idsFor("client_invoice");
  const s = idsFor("selection");
  const ri = idsFor("review_item");

  const lookups: Array<Promise<Array<{ id: string; ref: string | null }>>> = [];
  if (v.length) lookups.push(db.select({ id: variations.id, ref: variations.variationNumber }).from(variations)
    .innerJoin(projects, eq(projects.id, variations.projectId))
    .where(and(inArray(variations.id, v), eq(projects.companyId, companyId))));
  if (p.length) lookups.push(db.select({ id: proposals.id, ref: proposals.proposalNumber }).from(proposals)
    .where(and(inArray(proposals.id, p), eq(proposals.companyId, companyId))));
  if (r.length) lookups.push(db.select({ id: rfqs.id, ref: rfqs.rfqNumber }).from(rfqs)
    .innerJoin(projects, eq(projects.id, rfqs.projectId))
    .where(and(inArray(rfqs.id, r), eq(projects.companyId, companyId))));
  if (po.length) lookups.push(db.select({ id: purchaseOrders.id, ref: purchaseOrders.poNumber }).from(purchaseOrders)
    .innerJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .where(and(inArray(purchaseOrders.id, po), eq(projects.companyId, companyId))));
  if (ci.length) lookups.push(db.select({ id: clientInvoices.id, ref: clientInvoices.invoiceNumber }).from(clientInvoices)
    .innerJoin(projects, eq(projects.id, clientInvoices.projectId))
    .where(and(inArray(clientInvoices.id, ci), eq(projects.companyId, companyId))));
  if (s.length) lookups.push(db.select({ id: selections.id, ref: selections.name }).from(selections)
    .innerJoin(projects, eq(projects.id, selections.projectId))
    .where(and(inArray(selections.id, s), eq(projects.companyId, companyId))));
  if (ri.length) lookups.push(db.select({ id: reviewItems.id, ref: reviewItems.name }).from(reviewItems)
    .where(and(inArray(reviewItems.id, ri), eq(reviewItems.companyId, companyId))));

  const map = new Map<string, string>();
  try {
    for (const batch of await Promise.all(lookups)) {
      for (const row of batch) if (row.ref) map.set(row.id, row.ref);
    }
  } catch (err: any) {
    // A label is not worth failing the log over.
    console.error("[email-log] could not resolve document refs:", err?.message);
  }
  return map;
}

/** One row in full, or null when it is outside the caller's scope. */
export async function getEmailDelivery(scope: EmailLogScope, id: string) {
  const [row] = await db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.id, id), ...scopeConditions(scope)))
    .limit(1);
  return row ?? null;
}

export async function getEmailDeliveryDetail(scope: EmailLogScope, id: string): Promise<EmailLogDetail | null> {
  const row = await getEmailDelivery(scope, id);
  if (!row) return null;

  const [listed, resentAs, portal] = await Promise.all([
    listEmailDeliveries(scope, { id, limit: 1 }).then((r) => r.rows[0] ?? null),
    db
      .select({ id: emailDeliveries.id, sentAt: emailDeliveries.sentAt, toAddresses: emailDeliveries.toAddresses, status: emailDeliveries.status })
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.resentFromId, id), eq(emailDeliveries.companyId, scope.companyId)))
      .orderBy(emailDeliveries.sentAt),
    portalEvents(row, scope.companyId),
  ]);

  const base: EmailLogRow = listed ?? {
    id: row.id,
    sentAt: iso(row.sentAt)!,
    toAddresses: row.toAddresses ?? [],
    subject: row.subject,
    provider: row.provider,
    status: row.status,
    statusDetail: row.statusDetail,
    statusUpdatedAt: iso(row.statusUpdatedAt),
    contextType: row.contextType,
    contextId: row.contextId,
    contextRef: null,
    projectId: null,
    projectName: null,
    userId: row.userId,
    senderName: null,
    openCount: row.openCount ?? 0,
    firstOpenedAt: iso(row.firstOpenedAt),
    attachmentCount: (row.attachments ?? []).length,
    resentFromId: row.resentFromId,
  };

  return {
    ...base,
    fromAddress: row.fromAddress,
    replyTo: row.replyTo,
    htmlBody: row.htmlBody ? hideBearerLinks(row.htmlBody) : null,
    bodyRedacted: row.bodyRedacted,
    attachments: (row.attachments ?? []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      stored: !!a.objectPath,
    })),
    clickCount: row.clickCount ?? 0,
    lastOpenedAt: iso(row.lastOpenedAt),
    deliveredAt: iso(row.deliveredAt),
    timeline: buildTimeline(row, portal, resentAs),
    resentAs: resentAs.map((r) => ({ id: r.id, sentAt: iso(r.sentAt)!, toAddresses: r.toAddresses ?? [], status: r.status })),
  };
}

type DeliveryRow = typeof emailDeliveries.$inferSelect;


function buildTimeline(
  row: DeliveryRow,
  portal: EmailTimelineEvent[],
  resentAs: Array<{ sentAt: Date; toAddresses: string[] | null }>,
): EmailTimelineEvent[] {
  const events: EmailTimelineEvent[] = [];
  const via = row.provider === "gmail" ? "from the sender's Gmail" : row.provider === "resend" ? "via Morada's mail service" : null;

  if (row.status === "failed") {
    events.push({ at: iso(row.sentAt)!, kind: "failed", label: "Could not be sent", detail: row.statusDetail });
  } else {
    events.push({ at: iso(row.sentAt)!, kind: "sent", label: "Sent", detail: via });
  }
  if (row.status === "delayed" && row.statusUpdatedAt) {
    events.push({ at: iso(row.statusUpdatedAt)!, kind: "delayed", label: "Delivery delayed", detail: row.statusDetail });
  }
  if (row.deliveredAt) {
    events.push({ at: iso(row.deliveredAt)!, kind: "delivered", label: "Delivered to the recipient's mail server" });
  }
  if (row.firstOpenedAt) {
    const n = row.openCount ?? 1;
    events.push({
      at: iso(row.firstOpenedAt)!,
      kind: "opened",
      label: n > 1 ? `Opened (${n} times)` : "Opened",
      approximate: true,
    });
  }
  if (row.firstClickedAt) {
    events.push({ at: iso(row.firstClickedAt)!, kind: "clicked", label: (row.clickCount ?? 1) > 1 ? `Link clicked (${row.clickCount} times)` : "Link clicked" });
  }
  if ((row.status === "bounced" || row.status === "complained") && row.statusUpdatedAt) {
    events.push({
      at: iso(row.statusUpdatedAt)!,
      kind: row.status,
      label: row.status === "bounced" ? "Bounced" : "Marked as spam",
      detail: row.statusDetail,
    });
  }
  for (const r of resentAs) {
    events.push({ at: iso(r.sentAt)!, kind: "resent", label: `Resent to ${(r.toAddresses ?? []).join(", ")}` });
  }
  events.push(...portal);
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * What the recipient did AFTER the email — opened the portal link, signed,
 * submitted a quote. The email is only the first step; this is the rest of
 * the story, from records the features already keep.
 *
 * Only events after this email was sent count: a view from before it belongs
 * to an earlier send.
 */
async function portalEvents(row: DeliveryRow, companyId: string): Promise<EmailTimelineEvent[]> {
  if (!row.contextId || row.status === "failed") return [];
  const sentAt = row.sentAt;
  const out: EmailTimelineEvent[] = [];
  try {
    switch (emailTypeKey(row.contextType)) {
      case "variation": {
        // Per-send tracking exists for variations: the send row this email belongs to.
        const [send] = await db
          .select({
            id: variationSends.id,
            firstViewedAt: variationSends.firstViewedAt,
            lastViewedAt: variationSends.lastViewedAt,
            viewCount: variationSends.viewCount,
            signedSendId: variations.signedSendId,
            clientSignedDate: variations.clientSignedDate,
            clientSignedName: variations.clientSignedName,
            variationStatus: variations.status,
          })
          .from(variationSends)
          .innerJoin(variations, eq(variations.id, variationSends.variationId))
          .where(and(eq(variationSends.emailDeliveryId, row.id), eq(variationSends.companyId, companyId)))
          .limit(1);
        if (!send) break;
        if (send.firstViewedAt) {
          out.push({
            at: iso(send.firstViewedAt)!,
            kind: "portal_viewed",
            label: send.viewCount > 1 ? `Opened the variation in the portal (${send.viewCount} times)` : "Opened the variation in the portal",
          });
        }
        if (send.signedSendId === send.id && send.clientSignedDate) {
          const rejected = send.variationStatus === "rejected";
          out.push({
            at: iso(send.clientSignedDate)!,
            kind: rejected ? "rejected" : "signed",
            label: rejected ? "Rejected the variation" : "Approved and signed",
            detail: send.clientSignedName ? `by ${send.clientSignedName}` : null,
          });
        }
        break;
      }
      case "proposal": {
        const [proposal] = await db
          .select({ lastViewedAt: proposals.lastViewedAt, viewCount: proposals.viewCount })
          .from(proposals)
          .where(and(eq(proposals.id, row.contextId), eq(proposals.companyId, companyId)))
          .limit(1);
        if (!proposal) break;
        // Proposals count views per document, not per email — so this is
        // "viewed since", and says so.
        if (proposal.lastViewedAt && proposal.lastViewedAt > sentAt) {
          out.push({
            at: iso(proposal.lastViewedAt)!,
            kind: "portal_viewed",
            label: "Proposal viewed online",
            detail: proposal.viewCount > 1 ? `${proposal.viewCount} views in total — last view shown` : null,
          });
        }
        const acceptances = await db
          .select({ signedAt: proposalAcceptances.signedAt, status: proposalAcceptances.status, name: proposalAcceptances.signedByName })
          .from(proposalAcceptances)
          .where(eq(proposalAcceptances.proposalId, row.contextId))
          .orderBy(proposalAcceptances.signedAt);
        for (const a of acceptances) {
          if (a.signedAt <= sentAt) continue;
          out.push({
            at: iso(a.signedAt)!,
            kind: a.status === "rejected" ? "rejected" : "signed",
            label: a.status === "rejected" ? "Declined the proposal" : "Accepted the proposal",
            detail: a.name ? `by ${a.name}` : null,
          });
        }
        break;
      }
      case "rfq": {
        // RFQ links are per supplier, so match the token issued to this recipient.
        const recipients = (row.toAddresses ?? []).map((a) => a.toLowerCase());
        if (!recipients.length) break;
        // Portal links are per recipient (rfq_recipients; rfq_portal_tokens
        // is the legacy fallback), so match the one issued to this address.
        const tokens = await db
          .select({
            viewedAt: rfqRecipients.viewedAt,
            quoteId: rfqRecipients.quoteId,
            quoteSubmittedAt: rfqQuotes.submittedAt,
            email: rfqRecipients.supplierEmail,
          })
          .from(rfqRecipients)
          .leftJoin(rfqQuotes, eq(rfqQuotes.id, rfqRecipients.quoteId))
          .innerJoin(rfqs, eq(rfqs.id, rfqRecipients.rfqId))
          .innerJoin(projects, eq(projects.id, rfqs.projectId))
          .where(and(eq(rfqRecipients.rfqId, row.contextId), eq(projects.companyId, companyId)));
        for (const t of tokens) {
          if (!t.email || !recipients.includes(t.email.toLowerCase())) continue;
          if (t.viewedAt && t.viewedAt > sentAt) {
            out.push({ at: iso(t.viewedAt)!, kind: "portal_viewed", label: "Opened the RFQ in the supplier portal" });
          }
          if (t.quoteId && t.quoteSubmittedAt && t.quoteSubmittedAt > sentAt) {
            out.push({ at: iso(t.quoteSubmittedAt)!, kind: "quote_submitted", label: "Submitted a quote" });
          }
        }
        break;
      }
      case "review_item": {
        const [item] = await db
          .select({ portalViewedAt: reviewItems.portalViewedAt })
          .from(reviewItems)
          .where(and(eq(reviewItems.id, row.contextId), eq(reviewItems.companyId, companyId)))
          .limit(1);
        if (item?.portalViewedAt && item.portalViewedAt > sentAt) {
          out.push({ at: iso(item.portalViewedAt)!, kind: "portal_viewed", label: "Opened the review link" });
        }
        break;
      }
    }
  } catch (err: any) {
    // The rest of the detail is still worth showing.
    console.error("[email-log] portal events failed:", err?.message);
  }
  return out;
}
