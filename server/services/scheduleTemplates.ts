/**
 * Schedule templates are real schedules.
 *
 * A template owns one `schedules` row (schedules.template_id) and its items are
 * ordinary `schedule_items`, dated against TEMPLATE_ANCHOR_DAY. That lets the
 * template page run the same page, routes, cascade, steps and dependencies as
 * a project schedule. This module is the only place rows move between the two:
 *
 *   ensureTemplateSchedule   a template's schedule, created (and any legacy
 *                            template_data converted) on first use
 *   copyScheduleItems        re-place one schedule's items onto another's
 *                            calendar — apply, save-as-template, duplicate
 *
 * Every copy is ONE insert for the items and ONE for their steps, with ids
 * generated up front so parents and dependencies are remapped before anything
 * is written. Neon sits ~400ms away per round trip, so a per-item loop turns a
 * 200-line template into a minute-long apply.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import {
  contacts, nonWorkingDays, scheduleItems, scheduleItemSteps, schedules, scheduleTemplates,
  type Schedule, type ScheduleItem, type ScheduleTemplate,
} from "@shared/schema";
import { scheduleDayString, scheduleDayUTC } from "@shared/scheduleDates";
import {
  TEMPLATE_ANCHOR_DAY, addWorkingDays, placeItems, storedDay, workingOffset, type DayCalendar,
} from "@shared/scheduleTemplateDates";

type Dependency = { id: string; type: "FS" | "SS" | "FF" | "SF"; lag?: number };

/** A schedule's own week, plus its company's holidays when it has a project. */
export async function calendarFor(schedule: Schedule, companyId: string | null): Promise<DayCalendar> {
  const base = { includeSaturday: schedule.includeSaturday, includeSunday: schedule.includeSunday };
  // Holidays are real dates. A template's dates sit on a fixed anchor and
  // mean nothing, so a template never reads them — the project it is applied
  // to supplies its own.
  if (schedule.templateId || !companyId) return base;
  const rows = await db.select({ date: nonWorkingDays.date }).from(nonWorkingDays).where(and(
    eq(nonWorkingDays.companyId, companyId),
    or(isNull(nonWorkingDays.scheduleId), eq(nonWorkingDays.scheduleId, schedule.id)),
  ));
  // Read in server-local time, matching fetchNonWorkingDaySet in routes.ts,
  // so apply agrees with every other schedule write about which days are off.
  return { ...base, holidays: new Set(rows.map((r) => scheduleDayString(r.date))) };
}

export interface CopyOptions {
  source: Schedule;
  target: Schedule;
  sourceCompanyId: string | null;
  targetCompanyId: string | null;
  /** Day 0 on the source calendar. Defaults to the anchor for a template, else the earliest start. */
  sourceDay0?: string;
  /** Day 0 on the target calendar. Defaults to the anchor for a template. */
  targetDay0?: string;
  /** Added to every top-level sortOrder, so appended items land below existing ones. */
  sortOrderBase?: number;
}

/**
 * Copy every item of `source` into `target`, re-placed on the target calendar.
 *
 * Carries what a template is FOR: the tree, dependencies (type and lag),
 * durations, sub-items (unticked), assignee, team, cost code, colour, notes
 * and attachments. Resets what belongs to one job: status, progress, actual
 * and baseline dates, and links to that job's checklists, tasks, diary
 * entries and scope stages.
 */
export async function copyScheduleItems(opts: CopyOptions): Promise<ScheduleItem[]> {
  const { source, target } = opts;
  const items: ScheduleItem[] = await db.select().from(scheduleItems)
    .where(eq(scheduleItems.scheduleId, source.id))
    .orderBy(asc(scheduleItems.sortOrder));
  if (items.length === 0) return [];

  const [sourceCal, targetCal] = await Promise.all([
    calendarFor(source, opts.sourceCompanyId),
    calendarFor(target, opts.targetCompanyId),
  ]);
  const sourceDay0 = opts.sourceDay0
    ?? (source.templateId ? TEMPLATE_ANCHOR_DAY
      : items.map((i) => storedDay(i.startDate)).sort()[0]);
  const targetDay0 = opts.targetDay0 ?? TEMPLATE_ANCHOR_DAY;

  const placed = placeItems(items, { day0: sourceDay0, calendar: sourceCal }, { day0: targetDay0, calendar: targetCal });
  const idMap = new Map(items.map((i) => [i.id, randomUUID()]));
  const base = opts.sortOrderBase ?? 0;

  const rows = items.map((i) => {
    const p = placed.get(i.id)!;
    const deps = ((i.dependencies as Dependency[] | null) ?? [])
      .filter((d) => idMap.has(d.id))
      .map((d) => ({ id: idMap.get(d.id)!, type: d.type, lag: d.lag ?? 0 }));
    const parentId = i.parentItemId && idMap.has(i.parentItemId) ? idMap.get(i.parentItemId)! : null;
    return {
      id: idMap.get(i.id)!,
      scheduleId: target.id,
      name: i.name,
      description: i.description,
      type: i.type,
      status: "not_started",
      priority: i.priority,
      startDate: scheduleDayUTC(p.start),
      endDate: scheduleDayUTC(p.end),
      startTime: i.startTime,
      endTime: i.endTime,
      duration: p.duration,
      assignedToId: i.assignedToId,
      assignedToName: i.assignedToName,
      assignedToColor: i.assignedToColor,
      teamId: i.teamId,
      teamName: i.teamName,
      costCodeId: i.costCodeId,
      costCodeTitle: i.costCodeTitle,
      dependencies: deps,
      progressPercent: 0,
      notes: i.notes,
      notesHtml: i.notesHtml,
      attachments: i.attachments ?? [],
      parentItemId: parentId,
      color: i.color,
      // sortOrder is per sibling group, so only roots need shifting below
      // what the target already holds.
      sortOrder: (i.sortOrder ?? 0) + (parentId ? 0 : base),
      isCollapsed: i.isCollapsed,
      useWorkingDaysOverride: i.useWorkingDaysOverride,
    };
  });

  // One statement: Postgres checks the self-referencing parent FK at the end
  // of the statement, so children may precede their parents in `rows`.
  const created = (await db.insert(scheduleItems).values(rows as any).returning()) as ScheduleItem[];

  const steps = await db.select().from(scheduleItemSteps)
    .where(inArray(scheduleItemSteps.scheduleItemId, items.map((i) => i.id)));
  if (steps.length > 0) {
    await db.insert(scheduleItemSteps).values(steps.map((s) => ({
      scheduleItemId: idMap.get(s.scheduleItemId)!,
      name: s.name,
      isCompleted: false,
      sortOrder: s.sortOrder,
    })));
  }
  return created;
}

/** Top-level sortOrder to start appended items at, and the day after the last item. */
export async function appendPoint(target: Schedule, targetCompanyId: string | null) {
  const existing = await db.select({
    endDate: scheduleItems.endDate, sortOrder: scheduleItems.sortOrder, parentItemId: scheduleItems.parentItemId,
  }).from(scheduleItems).where(eq(scheduleItems.scheduleId, target.id));
  const roots = existing.filter((e) => !e.parentItemId);
  const sortOrderBase = roots.length ? Math.max(...roots.map((r) => r.sortOrder ?? 0)) + 1 : 0;
  if (existing.length === 0) return { sortOrderBase, nextDay: null as string | null };
  const lastEnd = existing.map((e) => storedDay(e.endDate)).sort().pop()!;
  const cal = await calendarFor(target, targetCompanyId);
  return { sortOrderBase, nextDay: addWorkingDays(lastEnd, 1, cal) };
}

// ---------------------------------------------------------------------------
// Template ↔ schedule
// ---------------------------------------------------------------------------

export async function getTemplateSchedule(templateId: string): Promise<Schedule | undefined> {
  const [row] = await db.select().from(schedules).where(eq(schedules.templateId, templateId)).limit(1);
  return row;
}

export async function createTemplateSchedule(
  template: ScheduleTemplate,
  week: { includeSaturday?: boolean | null; includeSunday?: boolean | null } = {},
): Promise<Schedule> {
  const [row] = await db.insert(schedules).values({
    templateId: template.id,
    projectId: null,
    name: template.name,
    status: "offline",
    includeSaturday: !!week.includeSaturday,
    includeSunday: !!week.includeSunday,
    createdBy: template.createdBy,
    createdByName: template.createdByName,
  } as any).returning();
  return row;
}

/**
 * The template's schedule, creating it on first use. A template made before
 * migration 0095 — or by the spreadsheet import, which still sends
 * template_data — has its items converted into rows here, once. template_data
 * is left as it was, as a backup.
 */
export async function ensureTemplateSchedule(template: ScheduleTemplate): Promise<Schedule> {
  const existing = await getTemplateSchedule(template.id);
  if (existing) return existing;
  let schedule: Schedule;
  try {
    schedule = await createTemplateSchedule(template);
  } catch (err) {
    // Two requests opened the template at once; the unique index let only
    // one create its schedule. Use that one.
    const raced = await getTemplateSchedule(template.id);
    if (raced) return raced;
    throw err;
  }
  const legacy = Array.isArray(template.templateData) ? (template.templateData as any[]) : [];
  if (legacy.length > 0) await convertLegacyItems(template, schedule, legacy);
  return schedule;
}

/**
 * The old template_data shape, from three writers:
 *   - the template editor: id, name, duration, type, relativeStartDay,
 *     parentItemId, color, description, assigneeName (free text)
 *   - Save as Template on a project: + notes, priority, dependencies [{id,type}]
 *   - the spreadsheet import: NO id, NO relativeStartDay, NO parent — but a
 *     category (the stage or phase) and predecessorNames by name
 */
export async function convertLegacyItems(template: ScheduleTemplate, schedule: Schedule, legacy: any[]) {
  const cal: DayCalendar = { includeSaturday: schedule.includeSaturday, includeSunday: schedule.includeSunday };
  const ids = legacy.map((it) => (it?.id ? String(it.id) : randomUUID()));
  const idOf = new Map<string, string>();
  legacy.forEach((it, i) => { if (it?.id) idOf.set(String(it.id), randomUUID()); });
  const newId = (i: number) => (legacy[i]?.id ? idOf.get(String(legacy[i].id))! : ids[i]);

  // Spreadsheet rows carry their stage as a category and no parent. Each
  // distinct category becomes a group row, in order of first appearance.
  const groups = new Map<string, string>();
  legacy.forEach((it) => {
    const cat = typeof it?.category === "string" ? it.category.trim() : "";
    if (cat && !it.parentItemId && !groups.has(cat)) groups.set(cat, randomUUID());
  });

  // A free-text assignee is matched to one of the company's contacts by name.
  const assigneeNames = Array.from(new Set(legacy.map((it) => it?.assigneeName).filter(Boolean).map(String)));
  const contactByName = new Map<string, typeof contacts.$inferSelect>();
  if (assigneeNames.length > 0) {
    const rows = await db.select().from(contacts).where(eq(contacts.companyId, template.companyId));
    for (const c of rows) {
      for (const n of [c.name, c.company, `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()]) {
        if (n) contactByName.set(n.trim().toLowerCase(), c);
      }
    }
  }

  const byName = new Map<string, number>();
  legacy.forEach((it, i) => { if (it?.name && !byName.has(String(it.name).trim().toLowerCase())) byName.set(String(it.name).trim().toLowerCase(), i); });

  // Start offsets and durations in working days, then a forward pass for
  // spreadsheet rows, which have predecessors but no start day — without it
  // every imported row starts on Day 1.
  const duration = legacy.map((it) => Math.max(1, Number(it?.duration) || 1));
  const offset = legacy.map((it) => Math.max(0, Number(it?.relativeStartDay) || 0));
  const deps: Dependency[][] = legacy.map((it) => {
    if (Array.isArray(it?.dependencies) && it.dependencies.length) {
      return it.dependencies
        .filter((d: any) => d?.id && idOf.has(String(d.id)))
        .map((d: any) => ({ id: String(d.id), type: d.type || "FS", lag: Number(d.lag) || 0 }));
    }
    const names: string[] = Array.isArray(it?.predecessorNames) ? it.predecessorNames : [];
    return names
      .map((n) => byName.get(String(n).trim().toLowerCase()))
      .filter((j): j is number => j !== undefined)
      .map((j) => ({ id: `#${j}`, type: (it.predecessorRelation || "FS") as Dependency["type"], lag: 0 }));
  });
  const indexOfDep = (d: Dependency) => d.id.startsWith("#")
    ? Number(d.id.slice(1))
    : legacy.findIndex((it) => it?.id && String(it.id) === d.id);
  const needsPass = legacy.some((it, i) => it?.relativeStartDay == null && deps[i].length > 0);
  if (needsPass) {
    for (let round = 0; round < legacy.length; round++) {
      let moved = false;
      legacy.forEach((it, i) => {
        if (it?.relativeStartDay != null) return;
        for (const d of deps[i]) {
          const j = indexOfDep(d);
          if (j < 0 || j === i) continue;
          const min = d.type === "SS" ? offset[j] + (d.lag ?? 0) : offset[j] + duration[j] + (d.lag ?? 0);
          if (d.type !== "FF" && d.type !== "SF" && offset[i] < min) { offset[i] = min; moved = true; }
        }
      });
      if (!moved) break;
    }
  }

  const rows: any[] = [];
  let groupOrder = 0;
  for (const [name, id] of Array.from(groups)) {
    const members = legacy.map((it, i) => i).filter((i) => String(legacy[i]?.category ?? "").trim() === name && !legacy[i]?.parentItemId);
    const start = Math.min(...members.map((i) => offset[i]));
    const end = Math.max(...members.map((i) => offset[i] + duration[i] - 1));
    rows.push({
      id, scheduleId: schedule.id, name, type: "task", status: "not_started", priority: "low",
      startDate: scheduleDayUTC(addWorkingDays(TEMPLATE_ANCHOR_DAY, start, cal)),
      endDate: scheduleDayUTC(addWorkingDays(TEMPLATE_ANCHOR_DAY, end, cal)),
      duration: end - start + 1, sortOrder: groupOrder++, progressPercent: 0, dependencies: [],
    });
  }

  legacy.forEach((it, i) => {
    const start = addWorkingDays(TEMPLATE_ANCHOR_DAY, offset[i], cal);
    const end = addWorkingDays(start, duration[i] - 1, cal);
    const cat = typeof it?.category === "string" ? it.category.trim() : "";
    const parentId = it?.parentItemId && idOf.has(String(it.parentItemId))
      ? idOf.get(String(it.parentItemId))!
      : (cat && groups.get(cat)) || null;
    const assignee = it?.assigneeName ? String(it.assigneeName) : "";
    const contact = assignee ? contactByName.get(assignee.trim().toLowerCase()) : undefined;
    // An assignee we can't match is kept where someone will see it, not dropped.
    const unmatched = assignee && !contact ? `Assignee on the old template: ${assignee}` : "";
    const notes = [it?.notes, unmatched].filter(Boolean).join("\n\n") || null;
    rows.push({
      id: newId(i),
      scheduleId: schedule.id,
      name: String(it?.name ?? "Untitled"),
      description: it?.description || null,
      type: it?.type || "task",
      status: "not_started",
      priority: it?.priority || "low",
      startDate: scheduleDayUTC(start),
      endDate: scheduleDayUTC(end),
      duration: duration[i],
      assignedToId: contact?.id ?? null,
      assignedToName: contact ? (contact.company || contact.name) : null,
      assignedToColor: contact?.scheduleColor ?? null,
      dependencies: deps[i]
        .map((d) => { const j = indexOfDep(d); return j >= 0 && j !== i ? { id: newId(j), type: d.type, lag: d.lag ?? 0 } : null; })
        .filter(Boolean),
      progressPercent: 0,
      notes,
      parentItemId: parentId,
      color: it?.color || null,
      // Roots go below the generated group rows; sortOrder is per sibling group.
      sortOrder: (Number(it?.sortOrder) || i) + (parentId ? 0 : groupOrder),
    });
  });

  // A parent spans its children. The old editor stored a parent's own
  // duration and start day independently, so re-derive every parent from its
  // descendants, deepest first — the same envelope the server's rollup keeps
  // on a project schedule.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depthOf = (r: any) => { let d = 0; let p = r.parentItemId; while (p && byId.has(p) && d < 10) { d++; p = byId.get(p)!.parentItemId; } return d; };
  for (const parent of [...rows].sort((a, b) => depthOf(b) - depthOf(a))) {
    const kids = rows.filter((r) => r.parentItemId === parent.id);
    if (kids.length === 0) continue;
    parent.startDate = new Date(Math.min(...kids.map((k) => k.startDate.getTime())));
    parent.endDate = new Date(Math.max(...kids.map((k) => k.endDate.getTime())));
    parent.duration = workingOffset(storedDay(parent.startDate), storedDay(parent.endDate), cal) + 1;
  }

  if (rows.length > 0) await db.insert(scheduleItems).values(rows);
}

/** Company that owns a template-owned schedule, or null if it isn't one. */
export async function templateCompanyId(schedule: { templateId?: string | null }): Promise<string | null> {
  if (!schedule.templateId) return null;
  const [t] = await db.select({ companyId: scheduleTemplates.companyId })
    .from(scheduleTemplates).where(eq(scheduleTemplates.id, schedule.templateId)).limit(1);
  return t?.companyId ?? null;
}
