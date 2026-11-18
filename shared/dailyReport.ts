/**
 * The daily site report: one project, one day, one page for the client.
 *
 * Everything here is pure — no database, no storage — so the two rules that
 * matter most can be tested without either:
 *
 *   1. WHICH DAY. A "day" is a calendar day in the COMPANY's timezone, and the
 *      tables involved store it three different ways:
 *        - site diary entries, defects: a real instant (`timestamp`). Windowed
 *          by local midnight → next local midnight. The diary page's own
 *          DATE(entry_date_time) is the UTC day, which puts an 8am Sydney entry
 *          on the previous day; the report does not copy that.
 *        - timesheets.date: UTC midnight OF the local calendar day (written by
 *          calendarDateMidnightUtcInTz on every write path), so the day is the
 *          UTC date part.
 *        - schedule_items start/end: day-granular; the Gantt reads the UTC date
 *          part (`iso.substring(0, 10)`), so the report does too and shows the
 *          same bars as active.
 *
 *   2. NO MONEY ON SITE. The report goes to the homeowner. Timesheets carry
 *      hourlyRate and total; neither may leave the server in this document.
 *      `buildCrewRows` returns names and hours only, and the document model
 *      type has nowhere to put a rate.
 */

export const DAILY_REPORT_MAX_PHOTOS = 12;

/** `yyyy-MM-dd`, validated as a real calendar date. */
export function isReportDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The local calendar day an instant falls on, in `tz`, as `yyyy-MM-dd`. */
export function localDayOf(instant: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get("year"), m = get("month"), d = get("day");
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* unknown timezone: fall through to UTC */
  }
  return instant.toISOString().slice(0, 10);
}

/** Offset of `tz` from UTC at `instant`, in minutes (Sydney summer = +660). */
function tzOffsetMinutes(instant: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
    return Math.round((asUtc - instant.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** The instant local midnight starts on `day` in `tz`. DST-safe: the offset is
 *  re-read at the candidate instant, so a day that starts in one offset and
 *  ends in another (first Sunday of October in Sydney) is still right. */
function localMidnight(day: string, tz: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00.000Z`);
  let guess = utcMidnight - tzOffsetMinutes(new Date(utcMidnight), tz) * 60000;
  guess = utcMidnight - tzOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * [start, end) instants of a local calendar day. 23, 24 or 25 hours long.
 */
export function localDayWindow(day: string, tz: string): { start: Date; end: Date } {
  return { start: localMidnight(day, tz), end: localMidnight(nextDay(day), tz) };
}

/** [start, end) for a column that stores UTC midnight of the calendar day. */
export function utcDayWindow(day: string): { start: Date; end: Date } {
  return { start: new Date(`${day}T00:00:00.000Z`), end: new Date(`${nextDay(day)}T00:00:00.000Z`) };
}

export function inWindow(value: Date | string | null | undefined, w: { start: Date; end: Date }): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t >= w.start.getTime() && t < w.end.getTime();
}

const dayPart = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/* ── Crew (timesheets) ───────────────────────────────────────────────────── */

export interface CrewRow {
  name: string;
  hours: number;
}

export interface TimesheetForCrew {
  userId: string;
  date: Date | string;
  duration: string | number | null;
  status?: string | null;
  isActive?: boolean | null;
  /** Present on the row; deliberately never read. */
  hourlyRate?: unknown;
  total?: unknown;
}

/**
 * Who was on site and for how long. One row per person, hours summed across
 * their entries, longest first.
 *
 * Built field by field from an allow-list: a spread of the timesheet would
 * carry hourlyRate/total into the document and from there into a PDF that a
 * homeowner reads. Rejected entries are dropped; a running clock (isActive)
 * still counts — the person is on site — with the hours recorded so far.
 */
export function buildCrewRows(
  timesheets: TimesheetForCrew[],
  namesByUserId: Map<string, string>,
  day: string,
): CrewRow[] {
  const w = utcDayWindow(day);
  const hoursByUser = new Map<string, number>();
  for (const ts of timesheets) {
    if (ts.status === "rejected") continue;
    if (!inWindow(ts.date, w)) continue;
    const h = Number(ts.duration ?? 0);
    hoursByUser.set(ts.userId, (hoursByUser.get(ts.userId) ?? 0) + (Number.isFinite(h) ? h : 0));
  }
  const rows: CrewRow[] = [];
  hoursByUser.forEach((hours, userId) => {
    rows.push({ name: namesByUserId.get(userId) || "Team member", hours: Math.round(hours * 100) / 100 });
  });
  return rows.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}

export function formatHours(h: number): string {
  if (!h) return "—";
  const rounded = Math.round(h * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : String(rounded)} h`;
}

/* ── Schedule ───────────────────────────────────────────────────────────── */

export interface ScheduleItemForReport {
  id: string;
  name: string;
  type?: string | null;
  status?: string | null;
  startDate: Date | string;
  endDate: Date | string;
  progressPercent?: number | null;
  assignedToName?: string | null;
  parentItemId?: string | null;
}

export interface ScheduleRow {
  name: string;
  detail: string;
}

/**
 * Items whose bar covers `day`. Stages (items that are a parent of another)
 * are left out — their children already say what is happening — as are
 * cancelled items and invoice claim points, which are money, not site work.
 */
export function activeScheduleRows(items: ScheduleItemForReport[], day: string): ScheduleRow[] {
  const parents = new Set(items.map((i) => i.parentItemId).filter(Boolean) as string[]);
  return items
    .filter((i) => !parents.has(i.id))
    .filter((i) => i.status !== "cancelled" && i.type !== "invoice")
    .filter((i) => {
      const s = dayPart(i.startDate), e = dayPart(i.endDate) ?? s;
      return !!s && !!e && s <= day && day <= e;
    })
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || a.name.localeCompare(b.name))
    .map((i) => {
      const bits: string[] = [];
      if (i.assignedToName) bits.push(i.assignedToName);
      if (i.status === "completed") bits.push("Completed");
      else if (i.progressPercent) bits.push(`${i.progressPercent}% complete`);
      else if (i.status === "in_progress") bits.push("In progress");
      return { name: i.name, detail: bits.join(" · ") };
    });
}

/* ── Defects ────────────────────────────────────────────────────────────── */

export interface DefectForReport {
  title: string;
  location?: string | null;
  dateIdentified: Date | string;
  dateResolved?: Date | string | null;
}

export interface DefectRow {
  title: string;
  location: string | null;
}

export function defectsForDay(
  defects: DefectForReport[],
  day: string,
  tz: string,
): { raised: DefectRow[]; closed: DefectRow[] } {
  const w = localDayWindow(day, tz);
  const row = (d: DefectForReport): DefectRow => ({ title: d.title, location: d.location || null });
  return {
    raised: defects.filter((d) => inWindow(d.dateIdentified, w)).map(row),
    closed: defects.filter((d) => inWindow(d.dateResolved, w)).map(row),
  };
}

/* ── Diary ──────────────────────────────────────────────────────────────── */

export interface TemplateFieldForReport {
  id: string;
  title: string;
  type: string;
  order?: number;
}

export interface DiaryEntryForReport {
  id: string;
  title: string;
  entryDateTime: Date | string;
  templateId?: string | null;
  fieldValues?: unknown;
  overallPhotos?: unknown;
  weather?: unknown;
  createdByName?: string | null;
}

export interface ReportField {
  label: string;
  value: string;
}

export interface ReportEntry {
  title: string;
  time: string;
  author: string | null;
  fields: ReportField[];
}

export interface ReportWeather {
  condition: string | null;
  temp: number | null;
  wind: number | null;
}

/** An object path the server can read, from any of the shapes diary photos
 *  have been stored in: the bare `/objects/...` path, a photo-gallery file
 *  object `{ objectPath }`, or a serving URL wrapping the encoded path. */
export function photoObjectPath(v: unknown): string | null {
  let s: string | null = null;
  if (typeof v === "string") s = v;
  else if (v && typeof v === "object" && typeof (v as any).objectPath === "string") {
    const ct = (v as any).contentType;
    if (ct && typeof ct === "string" && !ct.startsWith("image/")) return null;
    s = (v as any).objectPath;
  }
  if (!s) return null;
  const wrapped = /\/api\/uploads\/(?:file|serve)\/([^?#]+)/.exec(s);
  if (wrapped) {
    try { s = decodeURIComponent(wrapped[1]); } catch { return null; }
  }
  if (!s.startsWith("/objects/")) return null;
  if (/\.(pdf|docx?|xlsx?|csv|txt|zip)$/i.test(s)) return null;
  return s;
}

/** Every photo on an entry, overall photos first, de-duplicated. */
export function entryPhotoPaths(entry: DiaryEntryForReport): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const p = photoObjectPath(v);
    if (p && !out.includes(p)) out.push(p);
  };
  if (Array.isArray(entry.overallPhotos)) entry.overallPhotos.forEach(push);
  const fv = (entry.fieldValues && typeof entry.fieldValues === "object" ? entry.fieldValues : {}) as Record<string, unknown>;
  for (const [key, v] of Object.entries(fv)) {
    if (key.startsWith("_")) continue;
    if (Array.isArray(v)) v.forEach(push);
  }
  return out;
}

export function entryWeather(entry: DiaryEntryForReport): ReportWeather | null {
  const w = (entry.weather && typeof entry.weather === "object" ? entry.weather : {}) as Record<string, any>;
  const fv = (entry.fieldValues && typeof entry.fieldValues === "object" ? entry.fieldValues : {}) as Record<string, any>;
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const condition =
    (typeof w.condition === "string" && w.condition) ||
    (typeof fv.weather === "string" && fv.weather) ||
    (typeof fv.weatherConditions === "string" && fv.weatherConditions) ||
    null;
  const temp = num(w.temp ?? fv.temperature ?? fv.temp);
  const wind = num(w.wind ?? fv.wind);
  if (!condition && temp === null && wind === null) return null;
  return { condition, temp, wind };
}

export function formatWeather(w: ReportWeather | null): string | null {
  if (!w) return null;
  const bits: string[] = [];
  if (w.condition) bits.push(w.condition);
  if (w.temp !== null) bits.push(`${Math.round(w.temp)}°C`);
  if (w.wind !== null) bits.push(`wind ${Math.round(w.wind)} km/h`);
  return bits.join(", ") || null;
}

function fieldText(type: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (type === "file" || type === "photo-gallery") return null; // photos go in the grid
  if (type === "checkbox") {
    const val = v && typeof v === "object" && "value" in (v as any) ? (v as any).value : v;
    return val ? "Yes" : "No";
  }
  if (Array.isArray(v)) {
    const strs = v.filter((x) => typeof x === "string" && !photoObjectPath(x)) as string[];
    return strs.length ? strs.join(", ") : null;
  }
  if (typeof v === "object") return null;
  const s = String(v).trim();
  return s ? s : null;
}

function timeOfDay(instant: Date | string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" })
      .format(new Date(instant))
      .replace(/\s/g, " ")
      .toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The text of one diary entry: the template's fields in the template's order,
 * labelled as the builder labelled them. Without a template (deleted, or an
 * entry from the old free-form screen) the raw keys are humanised.
 */
export function reportEntry(
  entry: DiaryEntryForReport,
  fields: TemplateFieldForReport[] | null,
  tz: string,
): ReportEntry {
  const fv = (entry.fieldValues && typeof entry.fieldValues === "object" ? entry.fieldValues : {}) as Record<string, unknown>;
  const out: ReportField[] = [];
  if (fields && fields.length) {
    for (const f of [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const value = fieldText(f.type, fv[f.id]);
      if (value) out.push({ label: f.title, value });
    }
  } else {
    for (const [key, v] of Object.entries(fv)) {
      if (key.startsWith("_") || /^(weather|weatherConditions|temperature|temp|wind|humidity)$/.test(key)) continue;
      const value = fieldText("text", v);
      if (value) out.push({ label: key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim(), value });
    }
  }
  return {
    title: entry.title,
    time: timeOfDay(entry.entryDateTime, tz),
    author: entry.createdByName || null,
    fields: out,
  };
}

/** A field that says what was done on site, by the builder's own label. */
const WORK_DONE_LABEL = /\bwork\b|progress|activit|carried out|completed today|tasks? (done|completed)/i;

/**
 * Lift "work done" fields out of the entries into their own list, so the
 * client reads what happened first and the entry blocks don't repeat it.
 * Labels are the builder's (templates are theirs to name), so this matches
 * on wording; an entry with no such field keeps everything in its block.
 */
export function splitWorkDone(entries: ReportEntry[]): { entries: ReportEntry[]; workDone: string[] } {
  const workDone: string[] = [];
  const rest = entries.map((e) => {
    const keep: ReportField[] = [];
    for (const f of e.fields) {
      if (WORK_DONE_LABEL.test(f.label)) workDone.push(f.value);
      else keep.push(f);
    }
    return { ...e, fields: keep };
  });
  return { entries: rest, workDone };
}

/* ── The document model ─────────────────────────────────────────────────── */

export interface DailyReportPhoto {
  /** A data URI, already a PDF-sized JPEG thumbnail. */
  src: string;
}

/**
 * Everything the PDF prints. Note what is NOT here: no rate, no cost, no
 * total. A field added to this type is a field a homeowner can read.
 */
export interface DailyReportModel {
  date: string;
  dateLabel: string;
  company: {
    name: string;
    logoSrc: string | null;
    brandColor: string | null;
    variant: "brand" | "light";
    contactLines: string[];
  };
  project: { name: string; address: string | null; clientName: string | null };
  weather: string | null;
  workDone: string[];
  entries: ReportEntry[];
  crew: CrewRow[];
  crewTotalHours: number;
  schedule: ScheduleRow[];
  defectsRaised: DefectRow[];
  defectsClosed: DefectRow[];
  photos: DailyReportPhoto[];
  /** Photos that exist but were not printed (beyond the cap or unreadable). */
  morePhotos: number;
}

export function formatReportDate(day: string): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function reportFilename(projectName: string, day: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  return `daily-report-${slug}-${day}.pdf`;
}
