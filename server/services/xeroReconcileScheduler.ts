import { db } from "../db";
import { xeroConnections } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { reconcileBillsWithXero } from "../routes";

// Nightly reconciliation backstop for missed Xero webhooks. Safe drift (payments
// / status toward paid) is auto-applied; "surprises" (total changed, voided, or
// gone from Xero) are left for a human and raised as a notification.

const DUE_HOURS = 20; // don't re-run within 20h of the last sweep
const OVERDUE_HOURS = 26; // force a run if somehow this overdue (window was missed)
// ~1–4am AEST/AEDT — overnight for an AU business (server clock is UTC).
const NIGHTLY_UTC_HOURS = new Set([15, 16, 17]);

function hoursSince(d: Date | null | undefined): number {
  if (!d) return Infinity;
  return (Date.now() - new Date(d).getTime()) / 3_600_000;
}

async function notifySurprises(companyId: string, report: Awaited<ReturnType<typeof reconcileBillsWithXero>>): Promise<void> {
  const total = report.surprises.length;
  const voided = report.surprises.filter((s) => s.reviewReason === "voided_in_xero").length;
  const names = report.surprises.map((s) => s.billNumber).slice(0, 8).join(", ");
  const more = total > 8 ? ` +${total - 8} more` : "";
  // Voids get called out by name — they're the change a builder most wants to
  // hear about, and they read very differently from a total being edited.
  const voidNote = voided > 0 ? ` (${voided} voided in Xero)` : "";
  const message = `${total} bill${total === 1 ? "" : "s"} changed unexpectedly in Xero and need review${voidNote}: ${names}${more}`;

  let users;
  try {
    users = await storage.getUsersByCompanyWithRoles(companyId, "team");
  } catch {
    return;
  }
  // Notify admins/owners/managers; fall back to everyone if no role matches.
  const isManager = (u: any) => /admin|owner|manager|director/i.test(String(u?.role?.name || u?.roleName || ""));
  const recipients = users.filter(isManager);
  const targets = recipients.length > 0 ? recipients : users;

  for (const u of targets) {
    try {
      await storage.createNotification({
        userId: (u as any).id,
        companyId,
        type: "xero_reconcile",
        title: "Bills need review",
        message,
        // Query param matters: NotificationBell does a full navigation (not a
        // wouter push) for links containing "?", which remounts Bills so the
        // review modal opens from a cold mount.
        link: "/bills?review=xero",
        entityType: "bill",
        isRead: false,
      } as any);
    } catch (e) {
      console.error("[xeroReconcile] notify failed:", e);
    }
  }
}

async function runDueConnections(): Promise<void> {
  const nowHour = new Date().getUTCHours();
  const inWindow = NIGHTLY_UTC_HOURS.has(nowHour);

  let connections;
  try {
    connections = await db.select().from(xeroConnections).where(eq(xeroConnections.isActive, true));
  } catch (e) {
    console.error("[xeroReconcile] failed to list connections:", e);
    return;
  }

  for (const conn of connections) {
    const since = hoursSince(conn.lastReconciledAt);
    const due = since >= DUE_HOURS;
    const overdue = since >= OVERDUE_HOURS;
    if (!due) continue;
    if (!inWindow && !overdue) continue; // prefer the overnight window; force if overdue

    try {
      const report = await reconcileBillsWithXero(conn.companyId, { safeOnly: true });
      await storage.updateXeroConnection(conn.id, { lastReconciledAt: new Date() } as any);
      if (report.connected) {
        // Only newly-raised surprises notify. A bill that's been sitting in the
        // review queue (or was explicitly dismissed) must not re-notify every
        // single night — that's what trained everyone to ignore this.
        const newlyFlagged = report.surprises.filter((s) => s.isNew);
        console.log(
          `[xeroReconcile] ${conn.companyId}: ${report.corrected} corrected, ` +
          `${report.surprises.length} needing review (${newlyFlagged.length} new)`,
        );
        if (newlyFlagged.length > 0) {
          await notifySurprises(conn.companyId, { ...report, surprises: newlyFlagged });
        }
      }
    } catch (e) {
      console.error(`[xeroReconcile] sweep failed for company ${conn.companyId}:`, e);
    }
  }
}

let started = false;
export function startXeroReconcileScheduler(): void {
  if (started) return;
  started = true;
  // Check hourly; a connection only actually sweeps once per ~day (DUE_HOURS).
  setTimeout(() => { runDueConnections().catch((e) => console.error("[xeroReconcile]", e)); }, 120_000);
  setInterval(() => { runDueConnections().catch((e) => console.error("[xeroReconcile]", e)); }, 60 * 60 * 1000);
  console.log("[xeroReconcile] scheduler started (hourly check, nightly per connection)");
}
