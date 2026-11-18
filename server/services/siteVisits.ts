/**
 * Arriving on site (#46) — the site sign-in register.
 *
 * The phone's geofence posts arrive/leave here. A visit is recorded separately
 * from timesheets and NEVER changes one. Rules in shared/siteVisits.ts.
 *
 * Idempotency: the phone queues these offline and may replay them.
 *  - arrive: (user_id, client_request_id) is unique, so a replay finds the
 *    row it already made. A second arrive at the same job while a visit is
 *    still open (iOS can fire "enter" twice at a fence edge) returns the open
 *    visit rather than starting another.
 *  - leave: closes the latest open visit for that user + job and stamps the
 *    leave_client_request_id, so a replay finds the closed row and stops.
 */
import { and, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { db } from "../db";
import { siteVisits, type SiteVisit } from "@shared/schema";
import { siteVisitRetentionCutoff } from "@shared/siteVisits";

/** An open visit older than this is treated as abandoned (the leave was lost). */
const OPEN_VISIT_REUSE_MS = 16 * 60 * 60 * 1000;

export async function recordSiteArrival(args: {
  companyId: string;
  userId: string;
  projectId: string;
  at: Date;
  clientRequestId: string | null;
}): Promise<{ visit: SiteVisit; created: boolean }> {
  const { companyId, userId, projectId, at, clientRequestId } = args;

  if (clientRequestId) {
    const [replay] = await db.select().from(siteVisits)
      .where(and(eq(siteVisits.companyId, companyId), eq(siteVisits.userId, userId), eq(siteVisits.clientRequestId, clientRequestId)))
      .limit(1);
    if (replay) return { visit: replay, created: false };
  }

  const [open] = await db.select().from(siteVisits)
    .where(and(
      eq(siteVisits.companyId, companyId),
      eq(siteVisits.userId, userId),
      eq(siteVisits.projectId, projectId),
      isNull(siteVisits.leftAt),
      gte(siteVisits.arrivedAt, new Date(at.getTime() - OPEN_VISIT_REUSE_MS)),
    ))
    .orderBy(desc(siteVisits.arrivedAt))
    .limit(1);
  if (open) return { visit: open, created: false };

  const inserted = await db.insert(siteVisits)
    .values({ companyId, userId, projectId, arrivedAt: at, source: "geofence", clientRequestId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { visit: inserted[0], created: true };

  // Lost a race with a concurrent replay of the same request.
  const [row] = await db.select().from(siteVisits)
    .where(and(eq(siteVisits.companyId, companyId), eq(siteVisits.userId, userId), eq(siteVisits.clientRequestId, clientRequestId!)))
    .limit(1);
  return { visit: row, created: false };
}

export async function recordSiteLeave(args: {
  companyId: string;
  userId: string;
  projectId: string;
  at: Date;
  clientRequestId: string | null;
}): Promise<{ visit: SiteVisit | null; closed: boolean }> {
  const { companyId, userId, projectId, at, clientRequestId } = args;

  if (clientRequestId) {
    const [replay] = await db.select().from(siteVisits)
      .where(and(eq(siteVisits.companyId, companyId), eq(siteVisits.userId, userId), eq(siteVisits.leaveClientRequestId, clientRequestId)))
      .limit(1);
    if (replay) return { visit: replay, closed: false };
  }

  const [open] = await db.select().from(siteVisits)
    .where(and(
      eq(siteVisits.companyId, companyId),
      eq(siteVisits.userId, userId),
      eq(siteVisits.projectId, projectId),
      isNull(siteVisits.leftAt),
      lte(siteVisits.arrivedAt, at),
    ))
    .orderBy(desc(siteVisits.arrivedAt))
    .limit(1);
  // No open visit: the arrive was never recorded (fence registered while
  // already on site, or storing was off at the time). Nothing to close — a
  // leave on its own would print a false "arrived about" time.
  if (!open) return { visit: null, closed: false };

  const [row] = await db.update(siteVisits)
    .set({ leftAt: at, leaveClientRequestId: clientRequestId })
    .where(and(eq(siteVisits.id, open.id), eq(siteVisits.companyId, companyId), isNull(siteVisits.leftAt)))
    .returning();
  return { visit: row ?? open, closed: !!row };
}

export async function listSiteVisits(args: {
  companyId: string;
  userId?: string | null;
  projectId?: string | null;
  from: Date;
  to: Date;
}): Promise<SiteVisit[]> {
  const conds = [
    eq(siteVisits.companyId, args.companyId),
    gte(siteVisits.arrivedAt, args.from),
    lt(siteVisits.arrivedAt, args.to),
  ];
  if (args.userId) conds.push(eq(siteVisits.userId, args.userId));
  if (args.projectId) conds.push(eq(siteVisits.projectId, args.projectId));
  return db.select().from(siteVisits).where(and(...conds)).orderBy(siteVisits.arrivedAt).limit(2000);
}

/** Visits are kept for 12 months. */
export async function deleteExpiredSiteVisits(now: Date = new Date()): Promise<number> {
  const rows = await db.delete(siteVisits)
    .where(lt(siteVisits.arrivedAt, siteVisitRetentionCutoff(now)))
    .returning({ id: siteVisits.id });
  return rows.length;
}

let started = false;
const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 195_000; // staggered off the other sweeps

export function startSiteVisitCleanup(): void {
  if (started) return;
  started = true;
  const run = () => {
    deleteExpiredSiteVisits()
      .then((n) => { if (n > 0) console.log(`[SiteVisits] deleted ${n} visit(s) older than 12 months`); })
      .catch((e) => console.error("[SiteVisits] cleanup failed (non-fatal):", e));
  };
  setTimeout(run, STARTUP_DELAY_MS);
  setInterval(run, DAY_MS);
}
