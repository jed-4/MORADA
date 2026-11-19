/**
 * Defects v2, stages 2 and 3 — the rules shared by the server, the web and the
 * phone. Contract: docs/DEFECTS_V2.md ("Stage 2" and "Stage 3").
 *
 * Pure functions only, so they can be tested without a database
 * (server/__tests__/defects-trades.test.ts).
 */
import { dollarsToCents, formatCents, gstSplit, type Cents } from "./money";
import { isDefectOverdue, type DefectStage, type DefectJobStage } from "./defects";

// ── Trade links ─────────────────────────────────────────────────────────────

/**
 * Stages a trade sees on their private page. `open` is not there yet — it
 * hasn't been sent — and `closed` is finished. `fixed` stays visible (read
 * only) so the trade can see it is waiting on the builder's check.
 */
export const TRADE_VISIBLE_STAGES: readonly DefectStage[] = ["sent", "accepted", "rejected", "fixed"];

/** Stages where the trade still has something to do. */
export const TRADE_ACTION_STAGES: readonly DefectStage[] = ["sent", "accepted", "rejected"];

/** Stages "Send to trade" can move a defect out of (into `sent`). */
export const SENDABLE_STAGES: readonly DefectStage[] = ["open", "sent", "accepted", "rejected"];

/**
 * Tokens are 32 random bytes as base64url (43 characters). Anything shorter or
 * with other characters is rejected before it ever reaches the database.
 */
export const TRADE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

export function isWellFormedTradeToken(token: unknown): token is string {
  return typeof token === "string" && TRADE_TOKEN_PATTERN.test(token);
}

export type TradeAction = "accept" | "fixed";

/**
 * What a trade may do from their page. They can accept work that was sent to
 * them (or sent back), and say it's fixed. They can never close, reopen or
 * reject — that is the builder's check.
 */
export function tradeTransitionTarget(
  from: string,
  action: TradeAction,
): { ok: true; to: DefectStage } | { ok: false; error: string } {
  if (action === "accept") {
    if (from === "sent" || from === "rejected") return { ok: true, to: "accepted" };
    if (from === "accepted") return { ok: false, error: "You've already accepted this one" };
    return { ok: false, error: "This defect can't be accepted right now" };
  }
  if (from === "sent" || from === "accepted" || from === "rejected") return { ok: true, to: "fixed" };
  if (from === "fixed") return { ok: false, error: "Already marked as fixed — the builder will check it" };
  return { ok: false, error: "This defect can't be marked as fixed right now" };
}

/**
 * A link stays live while the trade has anything open on the job: something to
 * do, or something waiting on the builder's check (which might be rejected
 * back to them). When none of those remain it is revoked.
 */
export function tradeLinkShouldRevoke(stagesOfTradesDefects: string[]): boolean {
  return !stagesOfTradesDefects.some((s) => (TRADE_VISIBLE_STAGES as readonly string[]).includes(s));
}

/** Is this link usable right now? */
export function tradeLinkIsLive(link: { revokedAt: Date | string | null | undefined } | null | undefined): boolean {
  return !!link && !link.revokedAt;
}

// ── Daily digest ────────────────────────────────────────────────────────────

/** Default local hour the digest goes out. */
export const DEFECT_DIGEST_HOUR = 7;

/** Calendar date + hour in a time zone, without a date library. */
export function localDateAndHour(at: Date, timeZone: string): { date: string; hour: number } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
  } catch {
    tz = "Australia/Sydney";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/**
 * Is a trade's digest due? Once per local day, at or after `hour` in the
 * company's time zone. A sweep that runs hourly and misses 7am (restart,
 * deploy) still sends later that morning — never twice in a day.
 */
export function isDigestDue(params: {
  now: Date;
  timeZone: string;
  lastDigestAt: Date | string | null | undefined;
  hour?: number;
}): boolean {
  const hour = params.hour ?? DEFECT_DIGEST_HOUR;
  const today = localDateAndHour(params.now, params.timeZone);
  if (today.hour < hour) return false;
  if (!params.lastDigestAt) return true;
  const last = localDateAndHour(new Date(params.lastDigestAt), params.timeZone);
  return last.date !== today.date;
}

export interface DigestDefect {
  id: string;
  stage: string;
  dueDate: Date | string | null;
  sentToTradeAt: Date | string | null;
}

/**
 * What goes in a trade's digest. "New" = sent to them since the last digest
 * (everything they have, the first time). "Overdue" = past due and still
 * theirs to do. A defect is listed once — overdue wins. Nothing in either →
 * no email.
 */
export function buildDigest<T extends DigestDefect>(
  defects: T[],
  lastDigestAt: Date | string | null | undefined,
  now: Date,
): { fresh: T[]; overdue: T[]; send: boolean } {
  const since = lastDigestAt ? new Date(lastDigestAt).getTime() : null;
  const live = defects.filter((d) => (TRADE_ACTION_STAGES as readonly string[]).includes(d.stage));
  const overdue = live.filter((d) => isDefectOverdue({ stage: d.stage, dueDate: d.dueDate }, now));
  const overdueIds = new Set(overdue.map((d) => d.id));
  const fresh = live.filter((d) => {
    if (overdueIds.has(d.id)) return false;
    if (since == null) return true;
    return !!d.sentToTradeAt && new Date(d.sentToTradeAt).getTime() > since;
  });
  return { fresh, overdue, send: fresh.length + overdue.length > 0 };
}

/**
 * Should the owner get an "overdue" reminder for this defect today? Once per
 * local day while it stays overdue.
 */
export function ownerOverdueReminderDue(params: {
  stage: string;
  dueDate: Date | string | null;
  ownerUserId: string | null;
  remindedAt: Date | string | null | undefined;
  now: Date;
  timeZone: string;
}): boolean {
  if (!params.ownerUserId) return false;
  if (!isDefectOverdue({ stage: params.stage, dueDate: params.dueDate }, params.now)) return false;
  if (!params.remindedAt) return true;
  return localDateAndHour(new Date(params.remindedAt), params.timeZone).date
    !== localDateAndHour(params.now, params.timeZone).date;
}

// ── Handover (stage 3) ──────────────────────────────────────────────────────

/** Job stages the handover list shows unless others are chosen. */
export const HANDOVER_DEFAULT_JOB_STAGES: readonly DefectJobStage[] = ["pre_handover", "handover"];

/** `?jobStages=a,b` → valid job stages, or the default pair. */
export function parseHandoverJobStages(raw: unknown, valid: readonly string[]): string[] {
  const list = typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const ok = Array.from(new Set(list.filter((s) => valid.includes(s))));
  return ok.length ? ok : [...HANDOVER_DEFAULT_JOB_STAGES];
}

/** Photos for the before / after columns. Untagged photos count as "before". */
export function splitHandoverPhotos<P extends { kind?: string | null }>(photos: P[]): { before: P[]; after: P[] } {
  const before: P[] = [];
  const after: P[] = [];
  for (const p of photos) (p.kind === "after" || p.kind === "trade" ? after : before).push(p);
  return { before, after };
}

// ── Backcharges (stage 3) ───────────────────────────────────────────────────

/** Biggest backcharge accepted: $1,000,000 inc GST. */
export const MAX_BACKCHARGE_CENTS = 100_000_000;

/**
 * The amount typed into the form, in dollars inc GST ("1,250.50", "$300",
 * 300) → integer cents. Null when it isn't a positive amount within range.
 * Conversion goes through shared/money.ts (dollarsToCents), never `* 100`.
 */
export function parseBackchargeDollars(input: unknown): Cents | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "number" ? String(input) : typeof input === "string" ? input : "";
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = dollarsToCents(cleaned);
  if (!Number.isInteger(cents) || cents <= 0 || cents > MAX_BACKCHARGE_CENTS) return null;
  return cents;
}

/** An amount already in cents from an API body. */
export function validBackchargeCents(input: unknown): Cents | null {
  if (typeof input !== "number" || !Number.isInteger(input)) return null;
  if (input <= 0 || input > MAX_BACKCHARGE_CENTS) return null;
  return input;
}

export interface BackchargeRow {
  contactId: string | null;
  contactName: string | null;
  cents: number | null;
}

/** Totals per trade, biggest first. Rows with no amount are skipped. */
export function backchargeTotalsByTrade(rows: BackchargeRow[]): Array<{
  contactId: string | null;
  contactName: string;
  count: number;
  totalCents: Cents;
  exGstCents: Cents;
  gstCents: Cents;
}> {
  const by = new Map<string, { contactId: string | null; contactName: string; count: number; totalCents: number }>();
  for (const r of rows) {
    if (!r.cents || r.cents <= 0) continue;
    const key = r.contactId ?? "__none__";
    const cur = by.get(key) ?? { contactId: r.contactId, contactName: r.contactName || "No trade", count: 0, totalCents: 0 };
    cur.count += 1;
    cur.totalCents += r.cents;
    by.set(key, cur);
  }
  return Array.from(by.values())
    .map((t) => {
      const { exGst, gst } = gstSplit(t.totalCents);
      return { ...t, exGstCents: exGst, gstCents: gst };
    })
    .sort((a, b) => b.totalCents - a.totalCents || a.contactName.localeCompare(b.contactName));
}

export function formatBackcharge(cents: number | null | undefined): string {
  return cents ? `${formatCents(cents, { alwaysShowDecimals: true })} inc GST` : "—";
}

// ── API shapes ──────────────────────────────────────────────────────────────

/** Trade status line on a defect (no money). */
export interface DefectTradeStatus {
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  sentToTradeAt: string | null;
  tradeViewedAt: string | null;
  tradeMarkedFixedAt: string | null;
  link: { id: string; createdAt: string; lastViewedAt: string | null; live: boolean } | null;
}

/** One row of the per-trade view. */
export interface DefectTradeSummary {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  counts: Record<DefectStage, number>;
  overdue: number;
  link: { id: string; createdAt: string; lastViewedAt: string | null; lastDigestAt: string | null; live: boolean } | null;
  /** Present only for callers who may see money. */
  backchargeCents?: number;
}

/** What a trade's public page receives. Never money, never other trades. */
export interface TradePortalView {
  companyName: string | null;
  projectName: string | null;
  projectAddress: string | null;
  tradeName: string;
  defects: Array<{
    id: string;
    ref: string;
    title: string;
    description: string | null;
    location: string | null;
    priority: string;
    stage: DefectStage;
    dueDate: string | null;
    overdue: boolean;
    sentAt: string | null;
    rejectedNote: string | null;
    photos: Array<{ url: string; name: string; kind: string | null }>;
  }>;
}

export interface HandoverSignoffView {
  id: string;
  signerName: string;
  signedAt: string;
  jobStages: string[];
  defectCount: number;
  openCount: number;
}
