/**
 * Labour Hours drill-down: the individual timesheets behind one cost code's
 * Pending or Approved hours on the Budget page's Labour Hours tab.
 *
 * The attribution MUST match storage.recalculateLabourHoursBudget, or the list
 * won't add up to the figure that was clicked:
 *   - a timesheet with cost-code splits contributes each split's hours to that
 *     split's cost code;
 *   - otherwise its own duration goes to its cost code, else the cost code of
 *     the estimate line (work item) it was logged against;
 *   - "pending" = status "submitted"; "approved" = status "approved";
 *   - subcontractor HOURS count (#456) — their cost is what's left out.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";

import {
  pickLabourHoursEntries,
  type LabourHoursEntry,
  type LabourHoursStatus,
} from "@shared/labourHoursEntries";

type TsRow = Parameters<typeof pickLabourHoursEntries>[0]["timesheets"][number];

export async function loadLabourHoursEntries(
  projectId: string,
  costCodeId: string,
  status: LabourHoursStatus,
): Promise<{ entries: LabourHoursEntry[]; totalHours: number }> {
  const timesheets = (await db
    .select({
      id: schema.timesheets.id,
      userId: schema.timesheets.userId,
      date: schema.timesheets.date,
      duration: schema.timesheets.duration,
      status: schema.timesheets.status,
      poStatus: schema.timesheets.poStatus,
      description: schema.timesheets.description,
      costCodeId: schema.timesheets.costCodeId,
      workItemId: schema.timesheets.workItemId,
    })
    .from(schema.timesheets)
    .where(eq(schema.timesheets.projectId, projectId))) as TsRow[];
  const relevant = timesheets.filter((t) => t.status === status);
  if (relevant.length === 0) return { entries: [], totalHours: 0 };

  const ids = relevant.map((t) => t.id);
  const splits = await db
    .select({
      timesheetId: schema.timesheetCostCodes.timesheetId,
      costCodeId: schema.timesheetCostCodes.costCodeId,
      duration: schema.timesheetCostCodes.duration,
    })
    .from(schema.timesheetCostCodes)
    .where(inArray(schema.timesheetCostCodes.timesheetId, ids));

  const workItemIds = Array.from(new Set(
    relevant.filter((t) => !t.costCodeId && t.workItemId).map((t) => t.workItemId as string),
  ));
  const workItemCostCode = new Map<string, string>();
  if (workItemIds.length > 0) {
    const items = await db
      .select({ id: schema.estimateItems.id, costCode: schema.estimateItems.costCode })
      .from(schema.estimateItems)
      .where(inArray(schema.estimateItems.id, workItemIds));
    for (const it of items) if (it.costCode) workItemCostCode.set(it.id, it.costCode);
  }

  const picked = pickLabourHoursEntries({ timesheets: relevant, splits, workItemCostCode, costCodeId, status });
  const userIds = Array.from(new Set(picked.map((e) => e.userId)));
  const people = userIds.length > 0
    ? await db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        isSubcontractor: schema.users.isSubcontractor,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds))
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const entries: LabourHoursEntry[] = picked.map((e) => {
    const p = byId.get(e.userId);
    const name = p ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : "";
    return { ...e, workerName: name || "Unknown", isSubcontractor: p?.isSubcontractor === true };
  });
  return { entries, totalHours: entries.reduce((s, e) => s + e.hours, 0) };
}
