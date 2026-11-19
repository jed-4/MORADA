/**
 * Home Screen widget snapshot (mobile #40).
 *
 * Pure assembly of the small payload the iOS "Today" and "Tasks" widgets
 * render. The route (GET /api/mobile/widget-snapshot) does the queries —
 * the same ones /api/mobile/dashboard uses — and hands the rows here.
 *
 * Rules (approved):
 *   - NEVER any money. Nothing here reads a rate, total, price or amount.
 *   - Tasks: up to 4 open tasks due today, with a short job name.
 *   - Schedule: the next item today, or the next upcoming one, plus a few
 *     after it so the phone can pre-schedule timeline entries.
 *   - Timer: the active timesheet's clockInTime. The widget counts it up
 *     itself (system timer), so no refresh is needed while clocked in.
 *
 * "Today" is the PHONE's local day. The phone sends `date=YYYY-MM-DD` and
 * `tzOffset` (Date#getTimezoneOffset, minutes, e.g. -600 for AEST). Without
 * them we fall back to the server's UTC day.
 */
import { timesheetHours } from "@shared/money";

export const WIDGET_TASK_LIMIT = 4;
export const WIDGET_SCHEDULE_LIMIT = 5;
const SHORT_NAME_MAX = 18;

export interface WidgetDayWindow {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Inclusive start of the local day, as a UTC instant. */
  start: Date;
  /** Exclusive end of the local day, as a UTC instant. */
  end: Date;
}

/**
 * Resolve the phone's local day into a UTC window. `tzOffset` follows
 * Date#getTimezoneOffset: minutes to ADD to local time to get UTC, so AEST
 * (UTC+10) is -600.
 */
export function resolveDayWindow(dateParam: unknown, tzOffsetParam: unknown, now = new Date()): WidgetDayWindow {
  const offsetRaw = Number(tzOffsetParam);
  const offset = Number.isFinite(offsetRaw) && Math.abs(offsetRaw) <= 14 * 60 ? Math.round(offsetRaw) : 0;
  let date = typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
  if (!date) {
    // Derive the local date from `now` and the offset.
    date = new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  }
  const [y, m, d] = date.split("-").map(Number);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d);
  const start = new Date(localMidnightAsUtc + offset * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { date, start, end };
}

/** A short job label for a cramped widget row: job number, else a trimmed name. */
export function shortProjectName(project: { name?: string | null; jobNumber?: string | null } | null | undefined): string {
  if (!project) return "";
  const jobNumber = (project.jobNumber || "").trim();
  if (jobNumber) return jobNumber;
  const name = (project.name || "").trim();
  if (name.length <= SHORT_NAME_MAX) return name;
  // Prefer cutting at a word boundary.
  const cut = name.slice(0, SHORT_NAME_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > 8 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function inWindow(value: unknown, win: WidgetDayWindow): boolean {
  if (!value) return false;
  const t = new Date(value as any).getTime();
  return Number.isFinite(t) && t >= win.start.getTime() && t < win.end.getTime();
}

function isDoneStatus(status: unknown): boolean {
  const s = String(status || "").toLowerCase();
  return s === "done" || s === "completed" || s === "complete" || s === "cancelled";
}

/** Schedule items are date-only in practice (stored at UTC midnight). */
function dayKey(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as any);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

export interface WidgetTask {
  id: string;
  title: string;
  projectId: string | null;
  projectShortName: string;
}

export interface WidgetScheduleItem {
  id: string;
  name: string;
  projectId: string | null;
  projectShortName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime: string | null; // HH:mm
  endTime: string | null;   // HH:mm
  isToday: boolean;
}

export interface WidgetSnapshot {
  generatedAt: string;
  date: string;
  activeTimesheet: {
    id: string;
    clockInTime: string;
    projectId: string | null;
    projectName: string;
    projectShortName: string;
  } | null;
  /** Completed hours today (excludes the running timer — the widget adds that live). */
  hoursToday: number;
  tasks: WidgetTask[];
  nextScheduleItem: WidgetScheduleItem | null;
  /** nextScheduleItem first, then the few after it, for timeline entries. */
  upcomingSchedule: WidgetScheduleItem[];
}

export interface BuildWidgetSnapshotInput {
  window: WidgetDayWindow;
  projects: Array<{ id: string; name?: string | null; jobNumber?: string | null }>;
  tasks: any[];
  scheduleItems: any[];
  activeTimesheet: any | null;
  timesheetsToday: any[];
  now?: Date;
}

export function buildWidgetSnapshot(input: BuildWidgetSnapshotInput): WidgetSnapshot {
  const { window: win } = input;
  const now = input.now ?? new Date();
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const shortFor = (projectId: string | null | undefined, fallback = "") => {
    if (!projectId) return fallback;
    return shortProjectName(projectById.get(projectId)) || fallback;
  };

  // ── Tasks due today (open only), max 4 ──
  const tasks: WidgetTask[] = (input.tasks || [])
    .filter((t) => !t.archivedAt && !isDoneStatus(t.status) && inWindow(t.dueDate, win))
    .filter((t) => !t.projectId || projectById.has(t.projectId) || t.taskContextType === "business")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, WIDGET_TASK_LIMIT)
    .map((t) => ({
      id: String(t.id),
      title: String(t.title || "Untitled task"),
      projectId: t.projectId ?? null,
      projectShortName: t.projectId ? shortFor(t.projectId) : "Business",
    }));

  // ── Schedule: in-progress-today first, then the next to start ──
  const upcoming: WidgetScheduleItem[] = (input.scheduleItems || [])
    .filter((s) => !isDoneStatus(s.status) && dayKey(s.endDate) >= win.date)
    .map((s) => {
      const startDate = dayKey(s.startDate);
      const endDate = dayKey(s.endDate);
      return {
        id: String(s.id),
        name: String(s.name || "Schedule item"),
        projectId: s.projectId ?? null,
        projectShortName: shortFor(s.projectId, s.projectName ? shortProjectName({ name: s.projectName }) : ""),
        startDate,
        endDate,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
        isToday: startDate <= win.date && endDate >= win.date,
      };
    })
    .sort((a, b) => {
      if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      return (a.startTime || "99:99") < (b.startTime || "99:99") ? -1 : 1;
    })
    .slice(0, WIDGET_SCHEDULE_LIMIT);

  // ── Active timer ──
  const ts = input.activeTimesheet;
  const clockIn = ts?.isActive !== false && ts?.clockInTime ? new Date(ts.clockInTime) : null;
  const activeTimesheet = ts && clockIn && Number.isFinite(clockIn.getTime())
    ? {
        id: String(ts.id),
        clockInTime: clockIn.toISOString(),
        projectId: ts.projectId ?? null,
        projectName: ts.projectId ? String(projectById.get(ts.projectId)?.name || "") : "Business",
        projectShortName: ts.projectId ? shortFor(ts.projectId) : "Business",
      }
    : null;

  // ── Completed hours today (hours only — never the timesheet total) ──
  const hours = (input.timesheetsToday || [])
    .filter((t) => !t.isActive && inWindow(t.date, win))
    .reduce((sum, t) => sum + timesheetHours(t), 0);

  return {
    generatedAt: now.toISOString(),
    date: win.date,
    activeTimesheet,
    hoursToday: Math.round(hours * 100) / 100,
    tasks,
    nextScheduleItem: upcoming[0] ?? null,
    upcomingSchedule: upcoming,
  };
}
