import { db } from "../db";
import { xeroPushQueue, type XeroPushJob } from "@shared/schema";
import { and, eq, inArray, lte, asc } from "drizzle-orm";

// Enqueue a bill for a background Xero push. Idempotent: if an active job already
// exists for the bill, just make it due now (coalesces rapid successive edits).
export async function enqueueXeroPush(companyId: string, billId: string): Promise<void> {
  const active = await db
    .select({ id: xeroPushQueue.id })
    .from(xeroPushQueue)
    .where(and(eq(xeroPushQueue.billId, billId), inArray(xeroPushQueue.status, ["pending", "processing"])))
    .limit(1);

  if (active.length > 0) {
    await db
      .update(xeroPushQueue)
      .set({ status: "pending", nextAttemptAt: new Date(), updatedAt: new Date() })
      .where(eq(xeroPushQueue.id, active[0].id));
    return;
  }

  try {
    await db.insert(xeroPushQueue).values({ companyId, billId });
  } catch (e: any) {
    // 23505 = the partial-unique index caught a concurrent enqueue — fine.
    if (e?.code !== "23505") throw e;
  }
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

export async function markPushDone(jobId: string): Promise<void> {
  await db
    .update(xeroPushQueue)
    .set({ status: "done", lastError: null, updatedAt: new Date() })
    .where(eq(xeroPushQueue.id, jobId));
}

// Retry with exponential backoff (2,4,8,16,32,60 min), or dead-letter after
// maxAttempts. Pass forceDeadLetter for non-retryable outcomes.
export async function markPushRetry(job: XeroPushJob, error: string, forceDeadLetter = false): Promise<void> {
  const attempts = (job.attempts ?? 0) + 1;
  const err = error.slice(0, 1000);
  if (forceDeadLetter || attempts >= (job.maxAttempts ?? 6)) {
    await db
      .update(xeroPushQueue)
      .set({ status: "failed", attempts, lastError: err, updatedAt: new Date() })
      .where(eq(xeroPushQueue.id, job.id));
    return;
  }
  const backoffMs = Math.min(2 ** attempts, 60) * 60 * 1000;
  await db
    .update(xeroPushQueue)
    .set({ status: "pending", attempts, lastError: err, nextAttemptAt: new Date(Date.now() + backoffMs), updatedAt: new Date() })
    .where(eq(xeroPushQueue.id, job.id));
}
