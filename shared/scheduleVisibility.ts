/**
 * Schedule-item visibility rules for calendars.
 *
 * A project schedule is *project duration* — multi-day spans with dependencies and
 * Gantt semantics. A personal calendar is *appointments*. Dropping every schedule
 * item onto a user's week as an all-day chip overflows the all-day row and buries
 * the things they actually have to turn up for, so items are bucketed into tiers:
 *
 *   EVENT — renders as a chip on the grid:
 *     • in-house work (assigned to your own company rather than a subbie), and
 *     • appointment-type items (inspection / meeting / milestone / delivery),
 *       whoever they're assigned to — you may need to attend a subbie's inspection.
 *   BAND  — everyone else's work bars, collapsed into a slim per-project span
 *           under the day headers. Glanceable, no text competing for space.
 *
 * A project can be opted out of banding per user, in which case its whole schedule
 * comes through as events.
 *
 * The business calendar asks a different question and uses a different test — see
 * `ScheduleVisibilityMode`.
 */

/** Item types that behave like appointments rather than spans of work. */
export const APPOINTMENT_TYPES = ["milestone", "inspection", "delivery", "meeting"] as const;

export type ScheduleVisibilityTier = "event" | "band";

/**
 * Which question the calendar is asking.
 *
 * `personal` — "might I need to turn up to this?" In-house work counts, because
 *   business-assigned means our own crew rather than a subbie.
 *
 * `business` — "what is the company doing?" The in-house test inverts here: on a
 *   company-wide calendar our own work *is* the bulk of the schedule, so promoting
 *   it would put nearly everything back on the grid as chips and re-create exactly
 *   the flood the tiers exist to remove. The axis becomes what kind of time an item
 *   is, not whose: a point-in-time commitment, or a stretch of duration.
 */
export type ScheduleVisibilityMode = "personal" | "business";

/** The subset of a schedule item these rules need. */
export interface TierableScheduleItem {
  type?: string | null;
  /** "HH:mm", when the item is pinned to a time of day. */
  startTime?: string | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  assignedCompanyId?: string | null;
  projectId?: string | null;
}

/**
 * Is this item assigned to the builder's own company (in-house) rather than a subbie?
 *
 * Three storage forms coexist and all mean the same thing:
 *   1. `assignedCompanyId` — the explicit column, if it has been added.
 *   2. `assignedToId = null` with `assignedToName` set — the current convention. The
 *      write paths null the id and cache the company name (see the `company:` handling
 *      in the schedule-item POST/PATCH routes).
 *   3. `assignedToId = "company:<uuid>"` — legacy rows written before that fix.
 *
 * Contacts cannot be deleted while a schedule item references them, so a null id with
 * a surviving name is not a dangling contact.
 */
export function isBusinessAssigned(item: TierableScheduleItem, companyId?: string | null): boolean {
  if (item.assignedCompanyId) {
    return companyId ? item.assignedCompanyId === companyId : true;
  }
  if (typeof item.assignedToId === "string" && item.assignedToId.startsWith("company:")) {
    return companyId ? item.assignedToId.slice("company:".length) === companyId : true;
  }
  return !item.assignedToId && !!item.assignedToName;
}

export function isAppointmentType(item: TierableScheduleItem): boolean {
  return !!item.type && (APPOINTMENT_TYPES as readonly string[]).includes(item.type);
}

/**
 * Which tier does this item belong to for the given viewer?
 *
 * `fullScheduleProjectIds` are projects the user has explicitly opted into seeing in
 * full, so nothing from them is banded.
 */
export function scheduleItemTier(
  item: TierableScheduleItem,
  companyId?: string | null,
  fullScheduleProjectIds?: Iterable<string> | null,
  mode: ScheduleVisibilityMode = "personal"
): ScheduleVisibilityTier {
  if (fullScheduleProjectIds && item.projectId) {
    const optedIn = fullScheduleProjectIds instanceof Set
      ? fullScheduleProjectIds
      : new Set(fullScheduleProjectIds);
    if (optedIn.has(item.projectId)) return "event";
  }
  if (isAppointmentType(item)) return "event";
  if (mode === "business") {
    // A clock time is a commitment someone made — "8am Tuesday" is an appointment
    // whatever the item's type says. Without a time it is a stretch of work, and
    // belongs in the band whoever owns it.
    return item.startTime ? "event" : "band";
  }
  if (isBusinessAssigned(item, companyId)) return "event";
  return "band";
}

/** A contiguous stretch of banded work for one project. */
export interface ProjectBand {
  projectId: string;
  projectName: string | null;
  projectColor: string | null;
  /** Inclusive ISO date (yyyy-MM-dd). */
  startDate: string;
  /** Inclusive ISO date (yyyy-MM-dd). */
  endDate: string;
  /** Longest-running item in the span — used as the band's label. */
  label: string | null;
  itemCount: number;
}

interface BandableScheduleItem extends TierableScheduleItem {
  name?: string | null;
  title?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  projectName?: string | null;
  projectColor?: string | null;
}

/** yyyy-MM-dd in local time — schedule dates are day-granular, so avoid UTC shifting. */
function toDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return toDayKey(date)!;
}

/**
 * Collapse banded items into one span per project per contiguous stretch.
 *
 * Overlapping and adjacent runs merge (a gap of a single day still reads as one
 * stretch of work), so a project that runs Mon–Wed and Thu–Fri yields one band.
 */
interface DaySpan {
  start: string;
  end: string;
  name: string | null;
  projectName: string | null;
  projectColor: string | null;
}

export function computeProjectBands(items: BandableScheduleItem[]): ProjectBand[] {
  const byProject = new Map<string, BandableScheduleItem[]>();

  for (const item of items) {
    if (!item.projectId) continue;
    if (!toDayKey(item.startDate)) continue;
    const bucket = byProject.get(item.projectId);
    if (bucket) bucket.push(item);
    else byProject.set(item.projectId, [item]);
  }

  const bands: ProjectBand[] = [];

  // Array.from rather than iterating the Map directly — this project's tsconfig
  // target predates downlevel Map iteration.
  for (const [projectId, projectItems] of Array.from(byProject.entries())) {
    const spans: DaySpan[] = projectItems
      .map((item: BandableScheduleItem) => {
        const start = toDayKey(item.startDate)!;
        // A missing end date means a single-day item, not an open-ended one.
        const end = toDayKey(item.endDate) ?? start;
        return {
          start,
          end: end < start ? start : end,
          name: item.name ?? item.title ?? null,
          projectName: item.projectName ?? null,
          projectColor: item.projectColor ?? null,
        };
      })
      .sort((a: DaySpan, b: DaySpan) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

    let current: DaySpan[] = [];
    const flush = (group: DaySpan[]) => {
      if (!group.length) return;
      const start = group.reduce((min, s) => (s.start < min ? s.start : min), group[0].start);
      const end = group.reduce((max, s) => (s.end > max ? s.end : max), group[0].end);
      // Label with the longest-running item — the one that characterises the stretch.
      const longest = group.reduce((best, s) => {
        const len = (dk: string, ek: string) => new Date(ek).getTime() - new Date(dk).getTime();
        return len(s.start, s.end) > len(best.start, best.end) ? s : best;
      }, group[0]);
      bands.push({
        projectId,
        projectName: longest.projectName,
        projectColor: longest.projectColor,
        startDate: start,
        endDate: end,
        label: longest.name,
        itemCount: group.length,
      });
    };

    for (const span of spans) {
      if (!current.length) {
        current = [span];
        continue;
      }
      const runningEnd = current.reduce((max, s) => (s.end > max ? s.end : max), current[0].end);
      // Merge when the next span starts on or before the day after the running end.
      if (span.start <= addDays(runningEnd, 1)) {
        current.push(span);
      } else {
        flush(current);
        current = [span];
      }
    }
    flush(current);
  }

  return bands.sort((a, b) =>
    a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0
  );
}
