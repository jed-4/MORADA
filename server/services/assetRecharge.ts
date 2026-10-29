// Loads what shared/assetRecharge.ts needs and returns the charges.
//
// Charges are computed, never stored, so an edited timesheet or a moved
// booking can't leave a stale charge on a job. Everything is scoped to one
// company: assets by company_id, timesheets by the drivers of those assets
// (users the asset routes already checked belong to the company).

import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import { computeRecharges, type RechargeCharge } from "@shared/assetRecharge";

export interface LoadRechargeOptions {
  /** Only charges to this job. */
  projectId?: string;
  /** Only charges for this asset. */
  assetId?: string;
  /** Only days on or after this 'YYYY-MM-DD'. */
  from?: string;
}

const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export async function loadRecharges(companyId: string, opts: LoadRechargeOptions = {}): Promise<RechargeCharge[]> {
  const assets = await db
    .select({ id: schema.assets.id, dayRateCents: schema.assets.dayRateCents })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.companyId, companyId),
      gt(schema.assets.dayRateCents, 0),
      ...(opts.assetId ? [eq(schema.assets.id, opts.assetId)] : []),
    ));
  if (!assets.length) return [];
  const assetIds = assets.map((a) => a.id);

  const [assignments, bookings] = await Promise.all([
    db.select({
      assetId: schema.assetEvents.assetId,
      date: schema.assetEvents.date,
      userId: schema.assetEvents.relatedUserId,
      createdAt: schema.assetEvents.createdAt,
    })
      .from(schema.assetEvents)
      .where(and(
        eq(schema.assetEvents.companyId, companyId),
        eq(schema.assetEvents.kind, "assignment"),
        inArray(schema.assetEvents.assetId, assetIds),
      )),
    db.select().from(schema.assetBookings)
      .where(and(eq(schema.assetBookings.companyId, companyId), inArray(schema.assetBookings.assetId, assetIds))),
  ]);

  const drivers = Array.from(new Set(assignments.map((a) => a.userId).filter((u): u is string => !!u)));

  // Approved timesheets of those drivers. For one job, only the days they
  // worked on it matter — but every job they worked that day, so the day
  // can be split by hours.
  let timesheets: { userId: string; projectId: string | null; date: Date; duration: string | null }[] = [];
  if (drivers.length) {
    const base = and(
      inArray(schema.timesheets.userId, drivers),
      eq(schema.timesheets.status, "approved"),
      isNotNull(schema.timesheets.projectId),
      ...(opts.from ? [sql`${schema.timesheets.date} >= ${opts.from}::date`] : []),
    );
    let dayFilter = base;
    if (opts.projectId) {
      const days = await db.selectDistinct({ date: schema.timesheets.date })
        .from(schema.timesheets)
        .where(and(base, eq(schema.timesheets.projectId, opts.projectId)));
      if (!days.length) dayFilter = undefined as any;
      else dayFilter = and(base, inArray(schema.timesheets.date, days.map((d) => d.date)));
    }
    if (dayFilter) {
      timesheets = await db.select({
        userId: schema.timesheets.userId,
        projectId: schema.timesheets.projectId,
        date: schema.timesheets.date,
        duration: schema.timesheets.duration,
      }).from(schema.timesheets).where(dayFilter) as any;
    }
  }

  const charges = computeRecharges({
    assets: assets.map((a) => ({ id: a.id, dayRateCents: a.dayRateCents ?? 0 })),
    assignments: assignments.map((a) => ({ assetId: a.assetId, date: a.date, userId: a.userId, at: new Date(a.createdAt).getTime() })),
    // Timesheet dates are stored as UTC midnight of the calendar day.
    timesheets: timesheets.map((t) => ({ userId: t.userId, projectId: t.projectId, date: dayKey(t.date), hours: Number(t.duration) || 0 })),
    bookings: bookings.map((b) => ({
      assetId: b.assetId, projectId: b.projectId, fromDate: b.fromDate, toDate: b.toDate, includeWeekends: b.includeWeekends,
    })),
  });

  return charges.filter((c) =>
    (!opts.projectId || c.projectId === opts.projectId) && (!opts.from || c.date >= opts.from),
  );
}
