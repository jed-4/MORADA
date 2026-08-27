/**
 * Fingerprints the Business → Calendar event set across a matrix of filter states.
 *
 *   npx tsx scripts/calendar-fingerprint.ts [--out <dir>] [--tz <zone>]
 *
 * Why: Phase 1b swaps the calendar's rendering engine. The pixels change on
 * purpose, so a screenshot diff proves nothing. What must NOT change is the event
 * set — the array the grid is handed. This hashes that array under ~90 filter
 * combinations so "nothing moved" is a diff, not a claim.
 *
 * Three modes, all run by default:
 *
 *   1. EXTRACTION CHECK — runs `buildBusinessCalendarEvents` against a verbatim
 *      copy of the pre-extraction `useMemo` body (see `buildReference` below) and
 *      asserts they agree on every state. This is the Phase 1a proof.
 *   2. MUTATION CHECK — deliberately breaks the transform in several ways and
 *      asserts the fingerprint *notices*. A check that cannot fail is worse than
 *      no check, because it manufactures confidence.
 *   3. FINGERPRINT — writes `fingerprint.txt` (one line per state) and
 *      `states/<key>.json` (full event lists). Run on both sides of a change and
 *      diff the directories.
 *
 * Determinism: the corpus is generated from fixed seed data around a fixed anchor
 * date — no `Date.now()`, no `Math.random()`. The timezone is pinned before the
 * first `Date` is constructed, because task due dates are timestamps at *local*
 * midnight and day bucketing is local.
 *
 * @see BUSINESS_CALENDAR_PLAN.md Part 3a
 */
const tzArg = process.argv.indexOf("--tz");
process.env.TZ = tzArg > -1 ? process.argv[tzArg + 1] : "Australia/Sydney";

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isWithinInterval } from "date-fns";
import type { CalendarEvent } from "../shared/calendarEvent";
import {
  buildBusinessCalendarEvents,
  deterministicProjectColor,
  type BusinessCalendarInput,
} from "../shared/businessCalendarEvents";
import {
  taskAssigneeIds,
  cachedAssigneeNameById,
  formatAssigneeLabel,
} from "../shared/taskAssignees";

// ---------------------------------------------------------------------------
// Reference implementation — the `filteredEvents` useMemo body exactly as it
// stood at b8fe2436, before Phase 1a lifted it out. Do not "tidy" this: its only
// job is to disagree if the extraction changed anything.
// ---------------------------------------------------------------------------

function buildReference(input: BusinessCalendarInput): CalendarEvent[] {
  const allTasks = input.tasks as any[];
  const allScheduleItems = input.scheduleItems as any[];
  const { schedules, projects, users, filters, showParentItems, showChildItems } = input;
  const completedOption = { key: input.completedStatusKey };
  const selectedViewUserId = input.viewAsUserId;

  const taskEvents: CalendarEvent[] = allTasks
    .filter(task => task.dueDate)
    .map(task => {
      const project = projects.find(p => p.id === task.projectId);
      const assigneeIds = taskAssigneeIds(task);
      const cachedNames = cachedAssigneeNameById(task);
      const assigneeNames = assigneeIds
        .map(id => {
          const u = users.find(candidate => candidate.id === id);
          const live = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : null;
          return live || cachedNames.get(id) || null;
        })
        .filter((name): name is string => !!name);
      const isCompleted = task.status === completedOption?.key;

      return {
        id: task.id,
        title: task.title,
        startDate: new Date(task.dueDate!),
        endDate: new Date(task.dueDate!),
        startTime: task.startTime,
        endTime: task.endTime,
        color: project?.color || deterministicProjectColor(task.projectId || task.id),
        projectId: task.projectId,
        projectColor: project?.color || deterministicProjectColor(task.projectId || task.id),
        projectName: project?.name || null,
        assigneeName: formatAssigneeLabel(assigneeNames),
        assigneeId: task.assigneeId,
        assigneeIds,
        type: "task" as const,
        status: task.status,
        isCompleted,
        templateId: task.templateId,
        resource: task,
      };
    });

  const parentItemIds = new Set(
    allScheduleItems.filter((item: any) => item.parentItemId).map((item: any) => item.parentItemId)
  );

  const filteredScheduleItems = allScheduleItems.filter(item => {
    const isParent = parentItemIds.has(item.id);
    const isChild = !!(item as any).parentItemId;
    if (isParent && !showParentItems) return false;
    if (isChild && !showChildItems) return false;
    return true;
  });

  const scheduleEvents: CalendarEvent[] = filteredScheduleItems.map(item => {
    const schedule = schedules.find(s => s.id === item.scheduleId);
    const project = schedule ? projects.find(p => p.id === schedule.projectId) : undefined;
    const assigneeName = (item as any).assignedToName || null;
    const isCompleted = item.status === "completed";
    const projectColor = project?.color || deterministicProjectColor(project?.id || item.id);

    return {
      id: item.id,
      title: item.name,
      startDate: new Date(item.startDate),
      endDate: new Date(item.endDate),
      startTime: item.startTime,
      endTime: item.endTime,
      color: projectColor,
      projectId: project?.id,
      projectColor: projectColor,
      projectName: project?.name || null,
      assigneeName,
      assigneeId: item.assignedToId,
      assigneeIds: [],
      type: "schedule" as const,
      status: item.status,
      isCompleted,
    };
  });

  let filtered = [...taskEvents, ...scheduleEvents];

  if (selectedViewUserId !== "all") {
    filtered = filtered.filter(event => (event.assigneeIds ?? []).includes(selectedViewUserId));
  }
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    filtered = filtered.filter(event => {
      if (event.type === "schedule") return filters.eventTypes!.includes("schedule-item");
      return filters.eventTypes!.includes(event.type);
    });
  }
  if (filters.projects && filters.projects.length > 0) {
    filtered = filtered.filter(event => event.projectId && filters.projects!.includes(event.projectId));
  }
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter(event => event.status && filters.status!.includes(event.status));
  }
  if (filters.assignees && filters.assignees.length > 0) {
    filtered = filtered.filter(event =>
      (event.assigneeIds ?? []).some(id => filters.assignees!.includes(id))
    );
  }
  if (filters.dateFrom || filters.dateTo) {
    filtered = filtered.filter(event => {
      const eventDate = event.startDate;
      if (filters.dateFrom && filters.dateTo) {
        return isWithinInterval(eventDate, { start: filters.dateFrom, end: filters.dateTo });
      } else if (filters.dateFrom) {
        return eventDate >= filters.dateFrom;
      } else if (filters.dateTo) {
        return eventDate <= filters.dateTo;
      }
      return true;
    });
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Corpus
//
// The dev database cannot prove any of this: it holds four dated tasks, all with
// the legacy assignee column, and zero schedule items. So the corpus is built to
// hit the axes that actually branch.
// ---------------------------------------------------------------------------

const ANCHOR = new Date(2026, 7, 15); // 15 Aug 2026, local. Fixed so runs are comparable.
const day = (offset: number, h = 0, m = 0) =>
  new Date(ANCHOR.getFullYear(), ANCHOR.getMonth(), ANCHOR.getDate() + offset, h, m, 0, 0);

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_GONE = "99999999-9999-4999-8999-999999999999"; // left the company: not in `users`
const COMPANY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const users = [
  { id: USER_A, firstName: "Ana", lastName: "Alvarez", email: "ana@example.com" },
  { id: USER_B, firstName: "Bo", lastName: "Barnes", email: "bo@example.com" },
  { id: "33333333-3333-4333-8333-333333333333", firstName: null, lastName: null, email: "noname@example.com" },
];

const projects = [
  { id: "p-colour", name: "Coloured Project", color: "#3B82F6" },
  { id: "p-nocolour", name: "Uncoloured Project", color: null }, // deterministicProjectColor path
  { id: "p-empty", name: "Project With Nothing On", color: "#10B981" },
];

const schedules = [
  { id: "s-colour", projectId: "p-colour" },
  { id: "s-nocolour", projectId: "p-nocolour" },
  { id: "s-orphan", projectId: null }, // schedule with no project
];

const STATUSES = ["todo", "in_progress", "done", "on_hold"];
const COMPLETED_KEY = "done";

const tasks: any[] = [
  // --- assignee shapes ---
  { id: "t-legacy", title: "Legacy assignee only", dueDate: day(0), assigneeId: USER_A, assigneeName: "Ana Alvarez", assigneeIds: [], projectId: "p-colour", status: "todo", startTime: "09:00", endTime: "10:00" },
  { id: "t-array", title: "Array assignee only", dueDate: day(0), assigneeId: null, assigneeIds: [USER_A], assigneeNames: ["Ana Alvarez"], projectId: "p-colour", status: "todo", startTime: "11:00", endTime: "12:00" },
  { id: "t-both", title: "Both columns", dueDate: day(1), assigneeId: USER_A, assigneeName: "Ana Alvarez", assigneeIds: [USER_A], assigneeNames: ["Ana Alvarez"], projectId: "p-nocolour", status: "in_progress" },
  { id: "t-multi", title: "Multi assignee", dueDate: day(1), assigneeId: null, assigneeIds: [USER_A, USER_B], assigneeNames: ["Ana Alvarez", "Bo Barnes"], projectId: "p-colour", status: "todo", startTime: "13:00", endTime: "14:30" },
  { id: "t-gone", title: "Assignee who has left", dueDate: day(2), assigneeId: null, assigneeIds: [USER_GONE], assigneeNames: ["Gone Person"], projectId: "p-colour", status: "todo" },
  { id: "t-gone-mixed", title: "One present, one gone", dueDate: day(2), assigneeId: null, assigneeIds: [USER_B, USER_GONE], assigneeNames: ["Bo Barnes", "Gone Person"], projectId: "p-nocolour", status: "todo" },
  { id: "t-unassigned", title: "Nobody", dueDate: day(3), assigneeId: null, assigneeIds: [], projectId: "p-colour", status: "on_hold" },
  { id: "t-noname", title: "Assignee with no name", dueDate: day(3), assigneeId: null, assigneeIds: ["33333333-3333-4333-8333-333333333333"], assigneeIds_note: "email fallback", status: "todo" },

  // --- project / colour shapes ---
  { id: "t-noproject", title: "No project at all", dueDate: day(4), assigneeIds: [USER_A], projectId: null, status: "todo" },
  { id: "t-unknownproject", title: "Project not in list", dueDate: day(4), assigneeIds: [USER_A], projectId: "p-missing", status: "todo" },

  // --- date / time shapes ---
  { id: "t-nodate", title: "No due date — must never appear", dueDate: null, assigneeIds: [USER_A], projectId: "p-colour", status: "todo" },
  { id: "t-untimed", title: "Due but untimed", dueDate: day(5), assigneeIds: [USER_A], projectId: "p-colour", status: "todo" },
  { id: "t-starttime-only", title: "Start time, no end", dueDate: day(5), assigneeIds: [USER_B], projectId: "p-colour", status: "todo", startTime: "07:30" },
  { id: "t-string-date", title: "Due date as ISO string", dueDate: day(6).toISOString(), assigneeIds: [USER_A], projectId: "p-colour", status: "todo" },

  // --- status shapes ---
  ...STATUSES.map((status, i) => ({
    id: `t-status-${status}`,
    title: `Status ${status}`,
    dueDate: day(7 + i),
    assigneeIds: [USER_B],
    projectId: "p-colour",
    status,
  })),

  // --- boundaries ---
  { id: "t-month-first", title: "First of month", dueDate: new Date(2026, 7, 1), assigneeIds: [USER_A], projectId: "p-colour", status: "todo" },
  { id: "t-month-last", title: "Last of month", dueDate: new Date(2026, 7, 31, 23, 59), assigneeIds: [USER_A], projectId: "p-colour", status: "todo" },
  { id: "t-newyear", title: "New year's eve", dueDate: new Date(2026, 11, 31), assigneeIds: [USER_A], projectId: "p-colour", status: "todo" },
  { id: "t-dst", title: "DST changeover (AU spring forward)", dueDate: new Date(2026, 9, 4, 2, 30), assigneeIds: [USER_A], projectId: "p-colour", status: "todo" },
  { id: "t-template", title: "From a recurring template", dueDate: day(8), assigneeIds: [USER_A], projectId: "p-colour", status: "todo", templateId: "tpl-1" },
];

const scheduleItems: any[] = [
  // --- parent / child / orphan ---
  { id: "si-parent", name: "Parent item", scheduleId: "s-colour", startDate: day(0), endDate: day(4), status: "not_started", type: "task", assignedToId: "contact-1", assignedToName: "Alf Stewart Plumbing" },
  { id: "si-child", name: "Child item", scheduleId: "s-colour", parentItemId: "si-parent", startDate: day(1), endDate: day(2), status: "in_progress", type: "task", assignedToId: "contact-1", assignedToName: "Alf Stewart Plumbing" },
  { id: "si-orphan", name: "Neither parent nor child", scheduleId: "s-colour", startDate: day(3), endDate: day(3), status: "not_started", type: "milestone" },

  // --- every type ---
  ...["task", "milestone", "inspection", "delivery", "meeting"].map((type, i) => ({
    id: `si-type-${type}`,
    name: `A ${type}`,
    scheduleId: "s-nocolour",
    startDate: day(5 + i),
    endDate: day(5 + i),
    status: "not_started",
    type,
    startTime: "08:00",
    endTime: "09:00",
    assignedToId: "contact-2",
    assignedToName: "Bluey's Building Supplies",
  })),

  // --- all three storage forms of "assigned to our own company" ---
  { id: "si-inhouse-explicit", name: "In-house (assignedCompanyId)", scheduleId: "s-colour", startDate: day(2), endDate: day(3), status: "not_started", type: "task", assignedCompanyId: COMPANY, assignedToId: null, assignedToName: "Lighthouse Projects" },
  { id: "si-inhouse-convention", name: "In-house (null id + cached name)", scheduleId: "s-colour", startDate: day(3), endDate: day(4), status: "not_started", type: "task", assignedToId: null, assignedToName: "Lighthouse Projects" },
  { id: "si-inhouse-legacy", name: "In-house (legacy company: prefix)", scheduleId: "s-colour", startDate: day(4), endDate: day(5), status: "not_started", type: "task", assignedToId: `company:${COMPANY}`, assignedToName: "Lighthouse Projects" },

  // --- unassigned, and a schedule with no project ---
  { id: "si-unassigned", name: "Assigned to nobody", scheduleId: "s-nocolour", startDate: day(6), endDate: day(6), status: "completed", type: "task" },
  { id: "si-noproject", name: "Schedule has no project", scheduleId: "s-orphan", startDate: day(7), endDate: day(7), status: "not_started", type: "task" },
  { id: "si-noschedule", name: "Schedule id not in list", scheduleId: "s-missing", startDate: day(7), endDate: day(8), status: "not_started", type: "task" },

  // --- span shapes ---
  { id: "si-multiday", name: "Runs three weeks", scheduleId: "s-colour", startDate: day(-10), endDate: day(11), status: "in_progress", type: "task", assignedToId: "contact-3", assignedToName: "Captain Feathersword Excavations" },
  { id: "si-sameday", name: "Single day", scheduleId: "s-colour", startDate: day(9), endDate: day(9), status: "not_started", type: "task" },
  { id: "si-string-dates", name: "Dates as ISO strings", scheduleId: "s-colour", startDate: day(10).toISOString(), endDate: day(10).toISOString(), status: "not_started", type: "task" },
  { id: "si-straddle", name: "Straddles the month boundary", scheduleId: "s-colour", startDate: new Date(2026, 6, 28), endDate: new Date(2026, 8, 3), status: "in_progress", type: "task" },
];

// ---------------------------------------------------------------------------
// State matrix
//
// `calendarMode` is deliberately absent: `dateRange` derives from `currentDate`
// alone and the view never reaches this transform, so month/week/day/agenda all
// produce the same event set.
// ---------------------------------------------------------------------------

type State = { key: string; input: Omit<BusinessCalendarInput, "tasks" | "scheduleItems" | "schedules" | "projects" | "users" | "completedStatusKey"> };

const BASE = {
  filters: {},
  viewAsUserId: "all",
  showParentItems: true,
  showChildItems: true,
} as const;

function buildStates(): State[] {
  const states: State[] = [{ key: "baseline", input: { ...BASE } }];
  const add = (key: string, patch: Partial<State["input"]>) =>
    states.push({ key, input: { ...BASE, ...patch } as State["input"] });

  // Each axis swept independently against the baseline.
  add("projects-one", { filters: { projects: ["p-colour"] } });
  add("projects-two", { filters: { projects: ["p-colour", "p-nocolour"] } });
  add("projects-all", { filters: { projects: projects.map(p => p.id) } });
  add("projects-empty-one", { filters: { projects: ["p-empty"] } });

  for (const status of STATUSES) add(`status-${status}`, { filters: { status: [status] } });
  add("status-multi", { filters: { status: ["todo", "in_progress"] } });
  add("status-schedule-values", { filters: { status: ["not_started", "completed"] } });

  add("assignee-a", { filters: { assignees: [USER_A] } });
  add("assignee-b", { filters: { assignees: [USER_B] } });
  add("assignee-both", { filters: { assignees: [USER_A, USER_B] } });
  add("assignee-gone", { filters: { assignees: [USER_GONE] } });

  add("types-task", { filters: { eventTypes: ["task"] } });
  add("types-schedule", { filters: { eventTypes: ["schedule-item"] } });
  add("types-both", { filters: { eventTypes: ["task", "schedule-item"] } });
  add("types-none-match", { filters: { eventTypes: ["meeting"] } });

  add("date-from", { filters: { dateFrom: day(0) } });
  add("date-to", { filters: { dateTo: day(5) } });
  add("date-both", { filters: { dateFrom: day(0), dateTo: day(5) } });
  add("date-inverted", { filters: { dateFrom: day(5), dateTo: day(0) } });

  add("viewas-a", { viewAsUserId: USER_A });
  add("viewas-b", { viewAsUserId: USER_B });
  add("viewas-gone", { viewAsUserId: USER_GONE });
  add("viewas-nobody", { viewAsUserId: "no-such-user" });

  add("parents-off", { showParentItems: false });
  add("children-off", { showChildItems: false });
  add("both-off", { showParentItems: false, showChildItems: false });

  // Combinations, where a filter-ordering bug would show and a single-axis sweep
  // would not.
  add("combo-project-assignee-nochildren", {
    filters: { projects: ["p-colour"], assignees: [USER_A] },
    showChildItems: false,
  });
  add("combo-viewas-and-assignee-disagree", {
    filters: { assignees: [USER_B] },
    viewAsUserId: USER_A,
  });
  add("combo-type-and-status", {
    filters: { eventTypes: ["schedule-item"], status: ["not_started"] },
  });
  add("combo-everything", {
    filters: {
      projects: ["p-colour", "p-nocolour"],
      status: ["todo", "not_started"],
      assignees: [USER_A, USER_B],
      eventTypes: ["task", "schedule-item"],
      dateFrom: day(-2),
      dateTo: day(8),
    },
    viewAsUserId: USER_A,
    showParentItems: false,
    showChildItems: true,
  });

  return states;
}

// ---------------------------------------------------------------------------
// Serialisation + hashing
// ---------------------------------------------------------------------------

/**
 * Only the fields that reach the screen. `resource` is the entire raw row — hashing
 * it would make the fingerprint churn on unrelated schema additions, so it is
 * checked by identity instead (see `resourceMismatches`).
 */
function serialise(e: CalendarEvent) {
  return {
    id: e.id,
    title: e.title,
    startDate: e.startDate?.toISOString() ?? null,
    endDate: e.endDate?.toISOString() ?? null,
    startTime: e.startTime ?? null,
    endTime: e.endTime ?? null,
    color: e.color ?? null,
    projectId: e.projectId ?? null,
    projectColor: e.projectColor ?? null,
    projectName: e.projectName ?? null,
    assigneeName: e.assigneeName ?? null,
    assigneeId: e.assigneeId ?? null,
    assigneeIds: e.assigneeIds ?? null,
    type: e.type,
    status: e.status ?? null,
    isCompleted: e.isCompleted ?? null,
    templateId: e.templateId ?? null,
  };
}

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/** Order-sensitive: output order feeds render order and week-view lane layout. */
const hashOrdered = (events: CalendarEvent[]) => sha(events.map(serialise));

/** Order-insensitive: "is it the same set", regardless of arrangement. */
const hashUnordered = (events: CalendarEvent[]) =>
  sha(
    events
      .map(serialise)
      .sort((a, b) =>
        (a.startDate ?? "").localeCompare(b.startDate ?? "") ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.id.localeCompare(b.id),
      ),
  );

function run(state: State, build = buildBusinessCalendarEvents): CalendarEvent[] {
  return build({ tasks, scheduleItems, schedules, projects, users, completedStatusKey: COMPLETED_KEY, ...state.input });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const outArg = process.argv.indexOf("--out");
const outDir = outArg > -1 ? process.argv[outArg + 1] : "calendar-fingerprint";

const states = buildStates();
let failures = 0;

console.log(`TZ=${process.env.TZ}  states=${states.length}  tasks=${tasks.length}  scheduleItems=${scheduleItems.length}\n`);

// --- 1. Extraction check --------------------------------------------------
const extractionDiffs: string[] = [];
for (const state of states) {
  const actual = run(state);
  const reference = run(state, buildReference);
  if (hashOrdered(actual) !== hashOrdered(reference)) extractionDiffs.push(state.key);
}
if (extractionDiffs.length) {
  failures++;
  console.log(`EXTRACTION  FAIL — ${extractionDiffs.length} state(s) differ from the pre-extraction implementation:`);
  for (const k of extractionDiffs) console.log(`  ${k}`);
} else {
  console.log(`EXTRACTION  ok — all ${states.length} states identical to the pre-extraction implementation`);
}

// --- 2. Mutation check ----------------------------------------------------
// Each mutation is a plausible way to break the transform. If the matrix does not
// notice one, the matrix has a hole.
type Mutation = { name: string; build: (input: BusinessCalendarInput) => CalendarEvent[] };
const mutations: Mutation[] = [
  {
    name: "legacy assigneeId ignored",
    build: (input) =>
      buildBusinessCalendarEvents({
        ...input,
        tasks: input.tasks.map(t => ({ ...t, assigneeId: null })),
      }),
  },
  {
    name: "parent/child test inverted",
    build: (input) =>
      buildBusinessCalendarEvents({
        ...input,
        showParentItems: !input.showParentItems,
        showChildItems: !input.showChildItems,
      }),
  },
  {
    name: "view-as filter dropped",
    build: (input) => buildBusinessCalendarEvents({ ...input, viewAsUserId: "all" }),
  },
  {
    name: "project filter dropped",
    build: (input) =>
      buildBusinessCalendarEvents({ ...input, filters: { ...input.filters, projects: undefined } }),
  },
  {
    name: "date range dropped",
    build: (input) =>
      buildBusinessCalendarEvents({
        ...input,
        filters: { ...input.filters, dateFrom: undefined, dateTo: undefined },
      }),
  },
  {
    name: "cached assignee names ignored",
    build: (input) =>
      buildBusinessCalendarEvents({
        ...input,
        tasks: input.tasks.map(t => ({ ...t, assigneeName: null, assigneeNames: [] })),
      }),
  },
];

for (const mutation of mutations) {
  const caught = states.filter(state => {
    const base = run(state);
    const mutated = mutation.build({
      tasks, scheduleItems, schedules, projects, users,
      completedStatusKey: COMPLETED_KEY, ...state.input,
    });
    return hashOrdered(base) !== hashOrdered(mutated);
  });
  if (caught.length === 0) {
    failures++;
    console.log(`MUTATION    FAIL — "${mutation.name}" was NOT caught by any state. The matrix has a hole.`);
  } else {
    console.log(`MUTATION    ok — "${mutation.name}" caught by ${caught.length}/${states.length} states (e.g. ${caught[0].key})`);
  }
}

// --- 3. Fingerprint -------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "states"), { recursive: true });

const lines: string[] = [`# TZ=${process.env.TZ}`, `# state  count  ordered  unordered`];
let resourceMismatches = 0;
for (const state of states) {
  const events = run(state);
  for (const e of events) {
    if (e.resource && e.resource.id !== e.id) resourceMismatches++;
  }
  lines.push(
    `${state.key.padEnd(36)} ${String(events.length).padStart(4)}  ${hashOrdered(events)}  ${hashUnordered(events)}`,
  );
  writeFileSync(
    join(outDir, "states", `${state.key}.json`),
    JSON.stringify(events.map(serialise), null, 2) + "\n",
  );
}
writeFileSync(join(outDir, "fingerprint.txt"), lines.join("\n") + "\n");

if (resourceMismatches) {
  failures++;
  console.log(`RESOURCE    FAIL — ${resourceMismatches} event(s) whose \`resource\` is not the row they came from`);
} else {
  console.log(`RESOURCE    ok — every event's \`resource\` is its own row`);
}

console.log(`\nWrote ${states.length} states to ${outDir}/`);
console.log(failures ? `\n${failures} check(s) FAILED` : `\nAll checks passed`);
process.exit(failures ? 1 : 0);
