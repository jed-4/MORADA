// Vehicle & plant recharge: which job each asset-day is charged to, and for
// how much. Pure — the server loads the inputs, this decides.
//
// Rules (agreed with Jed, 2026-10-28):
//   - Day rate per asset, ex GST (an internal cost, like labour).
//   - A day the asset is BOOKED to a job charges that job. Two bookings on
//     the same day split it evenly.
//   - Otherwise, a day its assigned driver has approved hours on jobs charges
//     those jobs, split by the hours on each. Hours with no job (business
//     time) don't count, and a day with only business hours charges nothing.
//   - A booking wins over the driver's timesheets for that asset and day, so
//     a day is never charged twice.
//   - Who the driver was on a day comes from the assignment history, so
//     handing the ute to someone else doesn't rewrite past charges.
//
// It is an internal cost, not cash: the fuel and servicing are already in
// bills. Never feed it to the cashflow forecast.

export interface RechargeAsset {
  id: string;
  dayRateCents: number;
}

/** An assignment event: from `date` on, the asset is with `userId` (null = pool). */
export interface RechargeAssignment {
  assetId: string;
  date: string; // YYYY-MM-DD
  userId: string | null;
  /** Tie-break for several changes on one day; later wins. */
  at?: number;
}

export interface RechargeTimesheet {
  userId: string;
  projectId: string | null;
  date: string; // YYYY-MM-DD
  hours: number;
}

export interface RechargeBooking {
  assetId: string;
  projectId: string;
  fromDate: string;
  toDate: string;
  includeWeekends: boolean;
}

export interface RechargeCharge {
  assetId: string;
  projectId: string;
  date: string;
  /** Share of the day, 0–1. */
  fraction: number;
  cents: number;
  source: "booking" | "timesheet";
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Every date key from..to inclusive (capped at ~3 years, for a typo'd range). */
export function eachDay(from: string, to: string, includeWeekends: boolean): string[] {
  const out: string[] = [];
  const end = keyToUtc(to);
  for (let t = keyToUtc(from), n = 0; t <= end && n < 1100; t += 86_400_000, n++) {
    const day = new Date(t).getUTCDay();
    if (!includeWeekends && (day === 0 || day === 6)) continue;
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Who had the asset on `date`, from its assignment history. */
export function driverOn(history: RechargeAssignment[], date: string): string | null {
  let current: string | null = null;
  for (const a of history) {
    if (a.date > date) break;
    current = a.userId;
  }
  return current;
}

/**
 * Split a whole number of cents across weights so the parts add up exactly
 * (largest remainder): $95 over three equal jobs is 31.67 + 31.67 + 31.66.
 */
export function splitCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    parts[i]++;
    left--;
  }
  return parts;
}

export function computeRecharges(input: {
  assets: RechargeAsset[];
  assignments: RechargeAssignment[];
  timesheets: RechargeTimesheet[];
  bookings: RechargeBooking[];
}): RechargeCharge[] {
  const charges: RechargeCharge[] = [];
  const rated = input.assets.filter((a) => a.dayRateCents > 0);

  // Approved hours per user, per day, per job.
  const hoursByUserDay = new Map<string, Map<string, number>>();
  for (const t of input.timesheets) {
    if (!t.projectId || !(t.hours > 0)) continue;
    const k = `${t.userId}|${t.date}`;
    const byProject = hoursByUserDay.get(k) ?? new Map<string, number>();
    byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + t.hours);
    hoursByUserDay.set(k, byProject);
  }

  for (const asset of rated) {
    // Booked days first: they own the day.
    const bookedProjects = new Map<string, string[]>();
    for (const b of input.bookings) {
      if (b.assetId !== asset.id) continue;
      for (const d of eachDay(b.fromDate, b.toDate, b.includeWeekends)) {
        const list = bookedProjects.get(d) ?? [];
        if (!list.includes(b.projectId)) list.push(b.projectId);
        bookedProjects.set(d, list);
      }
    }
    for (const [date, projects] of Array.from(bookedProjects.entries())) {
      const parts = splitCents(asset.dayRateCents, projects.map(() => 1));
      projects.forEach((projectId, i) =>
        charges.push({ assetId: asset.id, projectId, date, fraction: 1 / projects.length, cents: parts[i], source: "booking" }),
      );
    }

    // Then the driver's days, skipping anything booked.
    const history = input.assignments
      .filter((a) => a.assetId === asset.id)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? 0) - (b.at ?? 0));
    if (!history.length) continue;
    const drivers = new Set(history.map((h) => h.userId).filter((u): u is string => !!u));

    for (const [key, byProject] of Array.from(hoursByUserDay.entries())) {
      const [userId, date] = key.split("|");
      if (!drivers.has(userId) || bookedProjects.has(date)) continue;
      if (driverOn(history, date) !== userId) continue;
      const projects = Array.from(byProject.keys()).sort();
      const hours = projects.map((p) => byProject.get(p)!);
      const total = hours.reduce((s, h) => s + h, 0);
      const parts = splitCents(asset.dayRateCents, hours);
      projects.forEach((projectId, i) =>
        charges.push({ assetId: asset.id, projectId, date, fraction: hours[i] / total, cents: parts[i], source: "timesheet" }),
      );
    }
  }

  return charges.sort((a, b) => a.date.localeCompare(b.date) || a.assetId.localeCompare(b.assetId) || a.projectId.localeCompare(b.projectId));
}
