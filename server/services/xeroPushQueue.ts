import { db } from "../db";
import { xeroPushQueue, type XeroPushJob } from "@shared/schema";
import { and, eq, inArray, lte, asc, ne, sql } from "drizzle-orm";

// A job left in "processing" this long is assumed orphaned (worker crashed
// mid-push), and a new enqueue takes it back to pending as before.
const STALE_PROCESSING_MS = 10 * 60 * 1000;

// Enqueue a bill for a background Xero push. Idempotent: if an active job already
// exists for the bill, just make it due now (coalesces rapid successive edits).
//
// A job that is mid-push ("processing") is NOT flipped back to pending: the
// worker would then mark it done when its (older) push finished, and the edit
// that arrived meanwhile never reached Xero. Instead its updatedAt is bumped —
// the worker compares it with the value it claimed the job with and, if it
// moved, puts the job back to pending so the newer state is pushed next tick.
export async function enqueueXeroPush(companyId: string, billId: string, delayMs = 0): Promise<void> {
  const dueAt = new Date(Date.now() + Math.max(0, delayMs));
  const active = await db
    .select({
      id: xeroPushQueue.id,
      status: xeroPushQueue.status,
      nextAttemptAt: xeroPushQueue.nextAttemptAt,
      updatedAt: xeroPushQueue.updatedAt,
    })
    .from(xeroPushQueue)
    .where(and(eq(xeroPushQueue.billId, billId), inArray(xeroPushQueue.status, ["pending", "processing"])))
    .limit(1);

  if (active.length > 0) {
    // Never push an already-due job further out: a delayed safety-net enqueue
    // must not delay a job that something else already needs run now.
    const existingDue = active[0].nextAttemptAt;
    const nextAttemptAt = existingDue && existingDue < dueAt ? existingDue : dueAt;
    const isProcessing = active[0].status === "processing";
    const isStale = isProcessing && !!active[0].updatedAt
      && Date.now() - new Date(active[0].updatedAt).getTime() > STALE_PROCESSING_MS;
    if (isProcessing && !isStale) {
      await db
        .update(xeroPushQueue)
        .set({
          nextAttemptAt,
          // Strictly later than whatever the worker claimed with, even within
          // the same millisecond — this is the "dirty" mark.
          updatedAt: sql`GREATEST(now(), ${xeroPushQueue.updatedAt} + interval '1 millisecond')`,
        })
        .where(and(eq(xeroPushQueue.id, active[0].id), eq(xeroPushQueue.status, "processing")));
      return;
    }
    await db
      .update(xeroPushQueue)
      .set({ status: "pending", nextAttemptAt, updatedAt: new Date() })
      .where(eq(xeroPushQueue.id, active[0].id));
    return;
  }

  try {
    await db.insert(xeroPushQueue).values({ companyId, billId, nextAttemptAt: dueAt });
  } catch (e: any) {
    // 23505 = the partial-unique index caught a concurrent enqueue — fine.
    if (e?.code !== "23505") throw e;
  }
}

// Clear a bill's outstanding job because the work is already done. Used by the
// in-process auto-push once its own attempt has succeeded, so the durable
// safety net it registered beforehand doesn't fire a redundant second push.
export async function resolvePendingPush(billId: string): Promise<void> {
  await db
    .update(xeroPushQueue)
    .set({ status: "done", lastError: null, updatedAt: new Date() })
    .where(and(eq(xeroPushQueue.billId, billId), inArray(xeroPushQueue.status, ["pending"])));
}

// Claim up to `limit` due jobs, flipping them to "processing" so a second worker
// instance can't grab the same ones (the conditional update is the guard).
export async function claimDuePushJobs(limit: number): Promise<XeroPushJob[]> {
  const due = await db
    .select()
    .from(xeroPushQueue)
    .where(and(eq(xeroPushQueue.status, "pending"), lte(xeroPushQueue.nextAttemptAt, new Date())))
    .orderBy(asc(xeroPushQueue.nextAttemptAt))
    .limit(limit);

  const claimed: XeroPushJob[] = [];
  for (const job of due) {
    const res = await db
      .update(xeroPushQueue)
      .set({ status: "processing", updatedAt: new Date() })
      .where(and(eq(xeroPushQueue.id, job.id), eq(xeroPushQueue.status, "pending")))
      .returning();
    if (res.length > 0) claimed.push(res[0]);
  }
  return claimed;
}

// Pass the claimed job (not just its id) so a re-enqueue that arrived while the
// push was running is detected: its updatedAt no longer matches the claim, so
// the job goes back to pending instead of done. A bare id keeps the old
// unconditional behaviour.
export async function markPushDone(jobOrId: XeroPushJob | string): Promise<void> {
  if (typeof jobOrId === "string") {
    await db
      .update(xeroPushQueue)
      .set({ status: "done", lastError: null, updatedAt: new Date() })
      .where(eq(xeroPushQueue.id, jobOrId));
    return;
  }
  const job = jobOrId;
  const done = await db
    .update(xeroPushQueue)
    .set({ status: "done", lastError: null, updatedAt: new Date() })
    .where(and(eq(xeroPushQueue.id, job.id), eq(xeroPushQueue.updatedAt, job.updatedAt)))
    .returning({ id: xeroPushQueue.id });
  if (done.length > 0) return;
  // Re-enqueued mid-push: run it again with the bill's latest state.
  await requeueIfDirty(job);
}

async function requeueIfDirty(job: XeroPushJob): Promise<void> {
  await db
    .update(xeroPushQueue)
    .set({ status: "pending", lastError: null, nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(xeroPushQueue.id, job.id),
      eq(xeroPushQueue.status, "processing"),
      ne(xeroPushQueue.updatedAt, job.updatedAt),
    ));
}

// Retry with exponential backoff (2,4,8,16,32,60 min), or dead-letter after
// maxAttempts. Pass forceDeadLetter for non-retryable outcomes.
export async function markPushRetry(job: XeroPushJob, error: string, forceDeadLetter = false): Promise<void> {
  const attempts = (job.attempts ?? 0) + 1;
  const err = error.slice(0, 1000);
  if (forceDeadLetter || attempts >= (job.maxAttempts ?? 6)) {
    // A newer edit arrived mid-push: give that state its own attempt rather
    // than dead-lettering it along with the old payload.
    const failed = await db
      .update(xeroPushQueue)
      .set({ status: "failed", attempts, lastError: err, updatedAt: new Date() })
      .where(and(eq(xeroPushQueue.id, job.id), eq(xeroPushQueue.updatedAt, job.updatedAt)))
      .returning({ id: xeroPushQueue.id });
    if (failed.length === 0) await requeueIfDirty(job);
    return;
  }
  const backoffMs = Math.min(2 ** attempts, 60) * 60 * 1000;
  await db
    .update(xeroPushQueue)
    .set({ status: "pending", attempts, lastError: err, nextAttemptAt: new Date(Date.now() + backoffMs), updatedAt: new Date() })
    .where(eq(xeroPushQueue.id, job.id));
}
