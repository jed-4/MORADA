import { claimDuePushJobs, markPushDone, markPushRetry } from "./xeroPushQueue";
import { pushBillToXeroInternal } from "../routes";

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
      const result = await pushBillToXeroInternal(job.billId, job.companyId);
      if (result.ok) {
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
