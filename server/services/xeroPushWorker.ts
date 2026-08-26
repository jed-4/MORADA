import { claimDuePushJobs, markPushDone, markPushRetry } from "./xeroPushQueue";
import { isAutoPushEligible, pushBillToXeroInternal } from "../routes";

// Kept well under Xero's ~60 calls/min: a bill push is 1–3 Xero calls, and each
// already retries on 429 (xeroFetchWithRetry). One small batch per tick.
const BATCH = 8;

// 4xx (except 429) means Xero rejected the payload — a blind retry won't help,
// so dead-letter immediately and let the user fix it.
function isRetryable(status?: number): boolean {
  if (!status) return true; // network / unexpected throw
  if (status === 429) return true;
  return status >= 500;
}

async function drainOnce(): Promise<void> {
  let jobs;
  try {
    jobs = await claimDuePushJobs(BATCH);
  } catch (e) {
    console.error("[xeroPushWorker] claim failed:", e);
    return;
  }
  if (jobs.length === 0) return;

  for (const job of jobs) {
    try {
      // Jobs can wait — the auto-push safety net is due 90s out, and a retry
      // backs off for up to an hour. Re-read the bill and apply the same
      // eligibility rule the in-process path uses, so a job queued when the
      // bill was pushable doesn't act on that intent after it stopped being
      // true (paid in the meantime, or the sync flag turned off).
      const { storage } = await import("../storage");
      const bill = await storage.getBillById(job.billId).catch(() => null);
      if (!bill) {
        await markPushDone(job.id);
        continue;
      }
      if (!isAutoPushEligible(bill as any)) {
        await markPushDone(job.id);
        continue;
      }
      const result = await pushBillToXeroInternal(job.billId, job.companyId);
      if (result.ok) {
        await markPushDone(job.id);
        continue;
      }
      // INVOICE_LOCKED is not a failure: Xero refused the edit because the
      // bill is already settled there, and the push handler responded by
      // pulling Xero's version back over ours. The work is done — recording it
      // as a failed job leaves a dead-lettered row and a red badge for a bill
      // that is now correct.
      if (result.error === "INVOICE_LOCKED") {
        await markPushDone(job.id);
        continue;
      }
      const reason = result.message || result.error || "Push failed";
      await markPushRetry(job, reason, !isRetryable(result.status));
    } catch (e: any) {
      await markPushRetry(job, e?.message || "Push threw").catch(() => {});
    }
  }
}

let started = false;
export function startXeroPushWorker(intervalSec = 45): void {
  if (started) return;
  started = true;
  // First drain shortly after boot, then on the interval.
  setTimeout(() => { drainOnce().catch((e) => console.error("[xeroPushWorker]", e)); }, 20_000);
  setInterval(() => { drainOnce().catch((e) => console.error("[xeroPushWorker]", e)); }, intervalSec * 1000);
  console.log(`[xeroPushWorker] started (every ${intervalSec}s)`);
}
