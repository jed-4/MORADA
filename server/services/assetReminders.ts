// Asset register reminders: once a day, turn what's coming due into To-Do tasks.
//
// Two sources:
//   - compliance items (rego, CTP, insurance, ...): a heads-up task at 30 days
//     and an urgent one at 7 (or already overdue). The per-row reminder flags
//     gate it; the routes clear them when the expiry date moves, so a renewed
//     rego starts the cycle again.
//   - service schedules: one task per due cycle, the moment a schedule turns
//     due soon or overdue on either km/hours or the calendar. A cycle is
//     identified by the last-done point, so logging the service ends it.
//
// Tasks go to the same person as supplier insurance expiries (the company's
// insurance reminder role, else an admin) — the office renews rego, not the
// driver. Archived and sold assets are skipped.
//
// The routes close these tasks when the thing is dealt with; see
// closeAssetReminderTasks.

import { and, eq, inArray, like, lte, ne, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import * as schema from "@shared/schema";
import {
  COMPLIANCE_KIND_LABELS,
  addDaysKey,
  daysBetween,
  serviceDue,
  todayKey,
  type ComplianceKind,
  METER_UNIT,
  type MeterType,
} from "@shared/assets";

export const ASSET_TASK_REF = {
  compliance30: "asset_compliance_30",
  compliance7: "asset_compliance_7",
  service: "asset_service_due",
  defect: "asset_defect",
} as const;

const LIVE_STATUSES = ["active", "off_road"];

let lastRunDate: string | null = null;

/** Identifies one due cycle of a schedule; changes when the service is logged. */
export function serviceCycleRef(s: { id: string; lastDoneDate: string | null; lastDoneMeter: number | null }): string {
  return `${s.id}:${s.lastDoneDate ?? "-"}:${s.lastDoneMeter ?? "-"}`;
}

/** Same rule as the supplier-insurance pass, cached per run. */
export async function resolveAssignee(companyId: string, cache = new Map<string, string | null>()): Promise<string | null> {
  if (cache.has(companyId)) return cache.get(companyId)!;
  let assigneeId: string | null = null;
  const settings = await storage.getCompanySettings(companyId);
  const roleId = (settings as any)?.insuranceReminderRoleId;
  if (roleId) {
    const withRole = await storage.getUsersByRole(companyId, roleId);
    assigneeId = withRole[0]?.id ?? null;
  }
  if (!assigneeId) {
    const all = await storage.getUsersByCompany(companyId);
    const admin = all.find((u) => {
      const role = ((u as any).role ?? "").toLowerCase();
      return role.includes("admin") || role.includes("general manage") || role.includes("owner");
    });
    assigneeId = admin?.id ?? all[0]?.id ?? null;
  }
  cache.set(companyId, assigneeId);
  return assigneeId;
}

export async function createAssetTask(input: {
  companyId: string;
  assigneeId: string | null;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  referenceType: string;
  referenceId: string;
}) {
  await storage.createTask({
    companyId: input.companyId,
    title: input.title,
    // Tasks live in `notes`: `content` and `author` are NOT NULL. A
    // `description` key is silently dropped by Drizzle and the insert fails.
    content: input.description,
    contentText: input.description,
    author: "System", // same as the recurring-task generator
    status: "todo",
    priority: input.priority,
    // Midday UTC lands on the same calendar day across Australian zones.
    dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00Z`) : null,
    assigneeId: input.assigneeId,
    assigneeIds: input.assigneeId ? [input.assigneeId] : [],
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  } as any);
}

/** Runs at most once per Sydney calendar day; the processor ticks every minute. */
export async function processAssetReminders(now = new Date()): Promise<void> {
  const today = todayKey("Australia/Sydney", now);
  if (lastRunDate === today) return;

  try {
    const assignees = new Map<string, string | null>();
    let created = 0;

    // ---- compliance items ----------------------------------------------
    // One query across every company: only rows inside 30 days with a
    // reminder still unsent, on assets that are still in use.
    const horizon = addDaysKey(today, 30);

    const items = await db
      .select({ item: schema.assetComplianceItems, asset: schema.assets })
      .from(schema.assetComplianceItems)
      .innerJoin(schema.assets, eq(schema.assetComplianceItems.assetId, schema.assets.id))
      .where(and(
        inArray(schema.assets.status, LIVE_STATUSES),
        lte(schema.assetComplianceItems.expiryDate, horizon),
        or(eq(schema.assetComplianceItems.reminder30Sent, false), eq(schema.assetComplianceItems.reminder7Sent, false)),
      ));

    for (const { item, asset } of items) {
      const days = daysBetween(today, item.expiryDate);
      const label = item.label || COMPLIANCE_KIND_LABELS[item.kind as ComplianceKind] || item.kind;
      const what = `${label} — ${asset.name}${asset.rego ? ` (${asset.rego})` : ""}`;
      const when = days < 0 ? `expired ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "expires today" : `expires in ${days} day${days === 1 ? "" : "s"}`;
      const assigneeId = await resolveAssignee(asset.companyId, assignees);

      if (days <= 7 && !item.reminder7Sent) {
        await createAssetTask({
          companyId: asset.companyId,
          assigneeId,
          title: `URGENT: ${what} ${when}`,
          description: `${label} for ${asset.name} ${when} (${item.expiryDate}). Renew it, then update the expiry on the asset so the reminders reset.`,
          priority: "high",
          dueDate: item.expiryDate,
          referenceType: ASSET_TASK_REF.compliance7,
          referenceId: item.id,
        });
        // The 30-day heads-up is pointless once the urgent one exists.
        await db.update(schema.assetComplianceItems)
          .set({ reminder7Sent: true, reminder30Sent: true })
          .where(and(eq(schema.assetComplianceItems.id, item.id), eq(schema.assetComplianceItems.companyId, asset.companyId)));
        created++;
      } else if (days > 7 && !item.reminder30Sent) {
        await createAssetTask({
          companyId: asset.companyId,
          assigneeId,
          title: `${what} ${when}`,
          description: `${label} for ${asset.name} ${when} (${item.expiryDate}). Update the expiry on the asset once it's renewed.`,
          priority: "low",
          dueDate: item.expiryDate,
          referenceType: ASSET_TASK_REF.compliance30,
          referenceId: item.id,
        });
        await db.update(schema.assetComplianceItems)
          .set({ reminder30Sent: true })
          .where(and(eq(schema.assetComplianceItems.id, item.id), eq(schema.assetComplianceItems.companyId, asset.companyId)));
        created++;
      }
    }

    // ---- service schedules ---------------------------------------------
    const schedules = await db
      .select({ schedule: schema.assetServiceSchedules, asset: schema.assets })
      .from(schema.assetServiceSchedules)
      .innerJoin(schema.assets, eq(schema.assetServiceSchedules.assetId, schema.assets.id))
      .where(inArray(schema.assets.status, LIVE_STATUSES));

    const dueSchedules = schedules
      .map((r) => ({ ...r, due: serviceDue(r.schedule, r.asset, today) }))
      .filter((r) => !r.due.unknown && r.due.state !== "ok");

    if (dueSchedules.length) {
      // Which cycles already have a task — one query, not one per schedule.
      const refs = dueSchedules.map((r) => serviceCycleRef(r.schedule));
      const existing = await db
        .select({ referenceId: schema.notes.referenceId })
        .from(schema.notes)
        .where(and(
          eq(schema.notes.type, "task"),
          eq(schema.notes.referenceType, ASSET_TASK_REF.service),
          inArray(schema.notes.referenceId, refs),
        ));
      const done = new Set(existing.map((e) => e.referenceId));

      for (const { schedule, asset, due } of dueSchedules) {
        const ref = serviceCycleRef(schedule);
        if (done.has(ref)) continue;
        const unit = METER_UNIT[asset.meterType as MeterType] ?? "";
        const reason =
          due.drivenBy === "meter" && due.meterLeft != null
            ? due.meterLeft < 0
              ? `${(-due.meterLeft).toLocaleString("en-AU")} ${unit} overdue`
              : `due in ${due.meterLeft.toLocaleString("en-AU")} ${unit}`
            : due.daysLeft != null
              ? due.daysLeft < 0
                ? `${-due.daysLeft} days overdue`
                : `due in ${due.daysLeft} days`
              : "due";
        const at = [
          due.dueMeter != null ? `at ${due.dueMeter.toLocaleString("en-AU")} ${unit}` : null,
          due.dueDate ? `by ${due.dueDate}` : null,
        ].filter(Boolean).join(" or ");
        await createAssetTask({
          companyId: asset.companyId,
          assigneeId: await resolveAssignee(asset.companyId, assignees),
          title: `${schedule.label} — ${asset.name}${asset.rego ? ` (${asset.rego})` : ""} ${reason}`,
          description: `${schedule.label} for ${asset.name} is ${reason}${at ? ` (${at})` : ""}. Log the service on the asset when it's done and this task closes itself.`,
          priority: due.state === "overdue" ? "high" : "low",
          dueDate: due.dueDate,
          referenceType: ASSET_TASK_REF.service,
          referenceId: ref,
        });
        created++;
      }
    }

    lastRunDate = today;
    if (created) console.log(`[AssetReminders] created ${created} task(s)`);
  } catch (error) {
    // Not marking the day done: the next tick retries.
    console.error("[AssetReminders] failed:", error);
  }
}

/**
 * Closes open reminder tasks once the thing is dealt with: a compliance item
 * renewed or deleted, or a service logged against its schedule. Scoped to the
 * company, so another tenant's tasks can never be touched.
 */
export async function closeAssetReminderTasks(
  companyId: string,
  target: { complianceItemId: string } | { scheduleId: string } | { prestartId: string },
): Promise<void> {
  const refMatch =
    "complianceItemId" in target
      ? and(
          inArray(schema.notes.referenceType, [ASSET_TASK_REF.compliance30, ASSET_TASK_REF.compliance7]),
          eq(schema.notes.referenceId, target.complianceItemId),
        )
      : "scheduleId" in target
        ? and(eq(schema.notes.referenceType, ASSET_TASK_REF.service), like(schema.notes.referenceId, `${target.scheduleId}:%`))
        : and(eq(schema.notes.referenceType, ASSET_TASK_REF.defect), eq(schema.notes.referenceId, target.prestartId));

  await db.update(schema.notes)
    .set({ status: "done", completedAt: new Date(), updatedAt: new Date() } as any)
    .where(and(
      eq(schema.notes.companyId, companyId),
      eq(schema.notes.type, "task"),
      ne(schema.notes.status, "done"),
      refMatch,
    ));
}

/** Test seam: forget that today already ran. */
export function resetAssetReminderClock() {
  lastRunDate = null;
}
