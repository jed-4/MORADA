/**
 * When a reminder is due, and who it goes to.
 *
 * Pure — no database, no clock of its own — so the decisions can be tested
 * directly. The processor that uses it runs every minute against live data,
 * which is the last place you want this logic to live untested.
 *
 * The bug this replaces: the processor read `lastTriggeredAt`, `deliverySettings`,
 * `message` and `recurrencePattern` off its rows. None of those are columns.
 * Drizzle drops unknown keys silently rather than erroring, so nothing ever
 * failed — business reminders simply went to everyone in the company, by email,
 * regardless of the delivery toggles, with an empty body, and personal
 * reminders never recurred.
 */

export type BusinessReminderSchedule = {
  scheduleType: string | null;        // "daily" | "weekly" | "monthly" | "custom"
  scheduleTime: string | null;        // "16:30", wall clock in the company's timezone
  scheduleDays?: unknown;             // weekly/custom: 0-6 (Sun-Sat). monthly: days of month.
};

export type ZonedNow = {
  dateKey: string;    // "2026-10-06" in the company's timezone
  minutes: number;    // minutes since midnight, company time
  dayOfWeek: number;  // 0 = Sunday
  dayOfMonth: number;
};

/**
 * Break an instant into the company's wall-clock parts.
 *
 * The processor used to compare `new Date().toTimeString()` — the SERVER's
 * local time — against a schedule the user set in their own timezone. On a UTC
 * host that fires an Australian 16:30 reminder at 03:30 the next morning.
 */
export function zonedNow(at: Date, timeZone: string): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(at);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24; // en-CA can render midnight as "24"
  const minute = Number(get("minute"));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + minute,
    dayOfWeek: Math.max(0, weekdays.indexOf(get("weekday"))),
    dayOfMonth: Number(get("day")),
  };
}

/** "16:30" → minutes since midnight, or null if unusable. */
export function parseScheduleTime(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function asNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(n => Number.isFinite(n)) : [];
}

/** Does today match the reminder's recurrence pattern? */
export function matchesScheduleDay(schedule: BusinessReminderSchedule, now: ZonedNow): boolean {
  const days = asNumbers(schedule.scheduleDays);
  switch (schedule.scheduleType) {
    case "daily":
      return true;
    case "weekly":
    case "custom":
      return days.includes(now.dayOfWeek);
    case "monthly":
      // Days past the end of a short month fall on its last day, so a "31st"
      // reminder still fires in February instead of being skipped four times a
      // year. Previously "monthly" matched nothing at all and never fired.
      if (days.length === 0) return false;
      if (days.includes(now.dayOfMonth)) return true;
      return days.some(d => d > daysInMonth(now) && now.dayOfMonth === daysInMonth(now));
    default:
      return false;
  }
}

function daysInMonth(now: ZonedNow): number {
  const [y, m] = now.dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Should this business reminder fire now?
 *
 * Due at or after its time, once per company-local day. The old check demanded
 * the current HH:MM equal the scheduled one exactly, so a restart, a slow tick
 * or an overlapping run silently lost that day's reminder. "At or after, once a
 * day" catches up instead of dropping it.
 */
export function businessReminderDue(
  schedule: BusinessReminderSchedule,
  now: ZonedNow,
  alreadyFiredToday: boolean,
): boolean {
  if (alreadyFiredToday) return false;
  const due = parseScheduleTime(schedule.scheduleTime);
  if (due == null) return false;
  if (!matchesScheduleDay(schedule, now)) return false;
  return now.minutes >= due;
}

// ─── Recipients ──────────────────────────────────────────────────────────────

export type TargetedUser = { id: string; roleId?: string | null };

export type BusinessReminderTargeting = {
  targetUsers: string | null;         // "all" | "specific" | "roles" | (legacy "field" | "office")
  targetRoleIds?: unknown;
  specificUserIds?: unknown;
};

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

/**
 * Who a business reminder goes to.
 *
 * Previously: everyone in the company, every time — `targetUsers`,
 * `targetRoleIds` and `specificUserIds` were never read, so a reminder aimed at
 * two people notified the whole business.
 *
 * "field" and "office" are accepted but cannot be resolved: nothing on a user
 * or a role records which they are (roles carry `userCategory`, which is
 * team/supplier/client). They fall back to everyone — the behaviour those rows
 * already had — and `unresolvedTarget` says so, so the caller can log it rather
 * than let it pass as a deliberate choice.
 */
export function resolveBusinessRecipients(
  targeting: BusinessReminderTargeting,
  companyUsers: TargetedUser[],
): { recipients: TargetedUser[]; unresolvedTarget: string | null } {
  switch (targeting.targetUsers) {
    case "specific": {
      const ids = new Set(asStrings(targeting.specificUserIds));
      return { recipients: companyUsers.filter(u => ids.has(u.id)), unresolvedTarget: null };
    }
    case "roles": {
      const roleIds = new Set(asStrings(targeting.targetRoleIds));
      return { recipients: companyUsers.filter(u => u.roleId && roleIds.has(u.roleId)), unresolvedTarget: null };
    }
    case "field":
    case "office":
      return { recipients: companyUsers, unresolvedTarget: targeting.targetUsers };
    case "all":
    default:
      return { recipients: companyUsers, unresolvedTarget: null };
  }
}

// ─── Personal reminders ──────────────────────────────────────────────────────

export type PersonalReminderSchedule = {
  reminderType: string | null;    // "one_time" | "recurring"
  schedulePattern?: string | null; // "daily" | "weekdays" | "weekly" | "custom"
  scheduleDays?: unknown;
  scheduleTime?: string | null;
};

/**
 * The next time a recurring personal reminder is due, or null if it is done.
 *
 * The processor looked for a `recurrencePattern` column that does not exist, so
 * every reminder — recurring or not — was marked completed after firing once.
 * The real columns are reminderType / schedulePattern / scheduleDays.
 */
export function nextPersonalDueAt(
  schedule: PersonalReminderSchedule,
  lastDueAt: Date,
  timeZone: string,
): Date | null {
  if (schedule.reminderType !== "recurring") return null;

  const pattern = schedule.schedulePattern || "daily";
  const custom = asNumbers(schedule.scheduleDays);
  const allowed = (dow: number) => {
    switch (pattern) {
      case "daily": return true;
      case "weekdays": return dow >= 1 && dow <= 5;
      case "weekly":
      case "custom": return custom.length === 0 ? true : custom.includes(dow);
      default: return true;
    }
  };

  // Walk forward a day at a time to the next allowed weekday. A year is a hard
  // stop so an unsatisfiable pattern cannot spin.
  for (let i = 1; i <= 366; i++) {
    const candidate = new Date(lastDueAt.getTime() + i * 24 * 60 * 60 * 1000);
    if (allowed(zonedNow(candidate, timeZone).dayOfWeek)) return candidate;
  }
  return null;
}
