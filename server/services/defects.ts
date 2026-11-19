/**
 * Defects v2 — database side. Contract: docs/DEFECTS_V2.md.
 *
 * Every query here is scoped by companyId (via projects.company_id, which is
 * authoritative; defects.company_id is a denormalised copy for indexes). The
 * routes in server/routes.ts do auth, team-member, permission and project
 * ownership checks first; this module never trusts an id from the body
 * without checking it belongs to the same company/project.
 *
 * Round trips are ~400ms to Neon, so lists are one query for rows (counts and
 * watcher flags as subqueries) plus one for stage counts, run in parallel.
 */
import { and, asc, desc, eq, ilike, inArray, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  defects,
  defectEvents,
  defectWatchers,
  projectLocations,
  projects,
  users,
  contacts,
  defectPhotoSchema,
  type Defect,
  type DefectEvent,
} from "@shared/schema";
import {
  DEFECT_STAGES,
  DEFECT_JOB_STAGES,
  DEFECT_PERMISSION_KEY,
  DEFECT_STAGE_LABELS,
  buildLocationPaths,
  checkDefectTransition,
  defaultDefectDueDate,
  defectNotifyRecipients,
  diffDefectFields,
  formatDefectRef,
  isDefectOverdue,
  isDefectStage,
  locationParentMakesCycle,
  transitionSideEffects,
  type DefectStage,
} from "@shared/defects";
import { getUserDisplayName } from "@shared/utils";
import { storage } from "../storage";
import { isAdminRole } from "../middleware/auth";
import { notifyDefectUsers } from "../utils/domainNotifications";

// ── errors ──────────────────────────────────────────────────────────────────

export class DefectError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

// ── permissions ─────────────────────────────────────────────────────────────

export type DefectActions = { view: boolean; add: boolean; edit: boolean; close: boolean; delete: boolean };

/**
 * The caller's projects.defects actions in one go. Same decision as
 * requirePermission: development passes, built-in admin-like roles pass,
 * otherwise the role's allowedActions.
 */
export async function resolveDefectActions(user: any): Promise<DefectActions> {
  const all: DefectActions = { view: true, add: true, edit: true, close: true, delete: true };
  const none: DefectActions = { view: false, add: false, edit: false, close: false, delete: false };
  if (process.env.NODE_ENV === "development") return all;
  if (!user?.roleId || !user?.companyId) return none;
  const role = await storage.getUserRole(user.roleId, user.companyId);
  if (role && isAdminRole(role)) return all;
  const [rolePermissions, allPermissions] = await Promise.all([
    storage.getRolePermissions(user.roleId),
    storage.getPermissions(),
  ]);
  const perm = allPermissions.find((p) => p.key === DEFECT_PERMISSION_KEY);
  if (!perm) return none;
  const rp = rolePermissions.find((r) => r.permissionId === perm.id);
  const acts = Array.isArray(rp?.allowedActions) ? (rp!.allowedActions as string[]) : [];
  return {
    view: acts.includes("view"),
    add: acts.includes("add"),
    edit: acts.includes("edit"),
    close: acts.includes("close"),
    delete: acts.includes("delete"),
  };
}

// ── shapes ──────────────────────────────────────────────────────────────────

type Photo = z.infer<typeof defectPhotoSchema>;

export type DefectDto = ReturnType<typeof toDefectDto>;

export function toDefectDto(
  d: Defect,
  extra: { projectName: string | null; watcherCount: number; isWatching: boolean; now: Date },
) {
  const attachments = (Array.isArray(d.attachments) ? d.attachments : []) as Photo[];
  return {
    id: d.id,
    projectId: d.projectId,
    projectName: extra.projectName,
    number: d.number,
    ref: formatDefectRef(d.number),
    title: d.title,
    description: d.description,
    stage: (isDefectStage(d.stage) ? d.stage : "open") as DefectStage,
    jobStage: d.jobStage,
    priority: d.priority,
    trade: d.trade,
    location: d.location,
    locationId: d.locationId,
    assignedContactId: d.assignedContactId,
    assignedContactName: d.assignedContactName,
    ownerUserId: d.ownerUserId,
    ownerName: d.ownerName,
    dueDate: d.dueDate,
    dateIdentified: d.dateIdentified,
    closedAt: d.closedAt,
    closedByName: d.closedByName,
    // Trade status (stage 2). Never money: backcharges have their own route.
    sentToTradeAt: d.sentToTradeAt,
    tradeViewedAt: d.tradeViewedAt,
    tradeMarkedFixedAt: d.tradeMarkedFixedAt,
    attachments: attachments.map((a) => ({ url: a.url, name: a.name ?? "", type: a.type, kind: a.kind })),
    createdBy: d.createdBy,
    createdByName: d.createdByName,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    overdue: isDefectOverdue({ stage: d.stage, dueDate: d.dueDate }, extra.now),
    watcherCount: extra.watcherCount,
    isWatching: extra.isWatching,
    // Legacy fields — old widgets and reports still read these.
    status: d.status,
    type: d.type,
    notes: d.notes,
    dateResolved: d.dateResolved,
  };
}

function eventDto(e: DefectEvent) {
  return {
    id: e.id,
    defectId: e.defectId,
    type: e.type,
    actorUserId: e.actorUserId,
    actorName: e.actorName,
    data: e.data ?? {},
    createdAt: e.createdAt,
  };
}

// ── list ────────────────────────────────────────────────────────────────────

export const defectListQuerySchema = z.object({
  stage: z.string().optional(),
  jobStage: z.string().optional(),
  ownerUserId: z.string().optional(),
  trade: z.string().optional(),
  locationId: z.string().optional(),
  q: z.string().max(200).optional(),
  overdue: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().max(200).optional(),
});
export type DefectListQuery = z.infer<typeof defectListQuerySchema>;

const createdAtMs = sql`date_trunc('milliseconds', ${defects.createdAt})`;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const at = new Date(iso);
    if (!id || Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

function watcherSubqueries(userId: string | null) {
  return {
    watcherCount: sql<number>`(select count(*)::int from defect_watchers w where w.defect_id = ${defects.id})`,
    isWatching: userId
      ? sql<boolean>`exists(select 1 from defect_watchers w where w.defect_id = ${defects.id} and w.user_id = ${userId})`
      : sql<boolean>`false`,
  };
}

/** Location id plus every location under it, so "Level 1" finds the kitchen. */
async function locationAndDescendants(companyId: string, locationId: string): Promise<string[]> {
  const [loc] = await db.select({ projectId: projectLocations.projectId }).from(projectLocations)
    .where(and(eq(projectLocations.id, locationId), eq(projectLocations.companyId, companyId))).limit(1);
  if (!loc) return [locationId];
  const rows = await db.select({ id: projectLocations.id, parentId: projectLocations.parentId })
    .from(projectLocations)
    .where(and(eq(projectLocations.projectId, loc.projectId), eq(projectLocations.companyId, companyId)));
  const out = new Set([locationId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId && out.has(r.parentId) && !out.has(r.id)) { out.add(r.id); grew = true; }
    }
  }
  return Array.from(out);
}

export async function listDefects(params: {
  companyId: string;
  userId: string | null;
  projectId?: string;
  mine?: boolean;
  query: DefectListQuery;
  /** Legacy array routes want every row. */
  unpaged?: boolean;
}) {
  const { companyId, userId, projectId, mine, query } = params;
  const now = new Date();
  const base: SQL[] = [eq(projects.companyId, companyId)];
  if (projectId) base.push(eq(defects.projectId, projectId));
  if (mine) {
    if (!userId) return { items: [], nextCursor: null, counts: emptyCounts() };
    base.push(or(
      eq(defects.ownerUserId, userId),
      eq(defects.createdBy, userId),
      sql`exists(select 1 from defect_watchers w where w.defect_id = ${defects.id} and w.user_id = ${userId})`,
    )!);
  }
  if (query.jobStage) base.push(inArray(defects.jobStage, query.jobStage.split(",").filter(Boolean)));
  if (query.ownerUserId) {
    base.push(query.ownerUserId === "none" ? isNull(defects.ownerUserId) : eq(defects.ownerUserId, query.ownerUserId));
  }
  if (query.trade) base.push(eq(defects.trade, query.trade));
  if (query.locationId) {
    base.push(inArray(defects.locationId, await locationAndDescendants(companyId, query.locationId)));
  }
  if (query.q?.trim()) {
    const like = `%${query.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const asNumber = /^d?-?0*(\d{1,6})$/i.exec(query.q.trim());
    base.push(or(
      ilike(defects.title, like),
      ilike(defects.description, like),
      ilike(defects.location, like),
      ...(asNumber ? [eq(defects.number, Number(asNumber[1]))] : []),
    )!);
  }
  if (query.overdue === "1" || query.overdue === "true") {
    base.push(lt(defects.dueDate, now));
    base.push(notInArray(defects.stage, ["fixed", "closed"]));
  }

  const where = [...base];
  const stages = (query.stage ?? "").split(",").filter((s) => isDefectStage(s));
  if (stages.length) where.push(inArray(defects.stage, stages));

  const limit = params.unpaged ? 5000 : (query.limit ?? 50);
  if (!params.unpaged && query.cursor) {
    const c = decodeCursor(query.cursor);
    if (!c) throw new DefectError(400, "Bad cursor");
    where.push(sql`(${createdAtMs}, ${defects.id}) < (${c.at.toISOString()}::timestamp, ${c.id})`);
  }

  const subs = watcherSubqueries(userId);
  const [rows, countRows] = await Promise.all([
    db.select({ d: defects, projectName: projects.name, ...subs })
      .from(defects)
      .innerJoin(projects, eq(projects.id, defects.projectId))
      .where(and(...where))
      .orderBy(desc(createdAtMs), desc(defects.id))
      .limit(limit + 1),
    db.select({ stage: defects.stage, n: sql<number>`count(*)::int` })
      .from(defects)
      .innerJoin(projects, eq(projects.id, defects.projectId))
      .where(and(...base))
      .groupBy(defects.stage),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map((r) => toDefectDto(r.d, {
    projectName: r.projectName, watcherCount: Number(r.watcherCount) || 0, isWatching: !!r.isWatching, now,
  }));
  const counts = emptyCounts();
  for (const c of countRows) {
    const s = isDefectStage(c.stage) ? c.stage : "open";
    counts[s] += Number(c.n) || 0;
  }
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(new Date(last.d.createdAt), last.d.id) : null,
    counts,
  };
}

function emptyCounts(): Record<DefectStage, number> {
  return Object.fromEntries(DEFECT_STAGES.map((s) => [s, 0])) as Record<DefectStage, number>;
}

// ── detail ──────────────────────────────────────────────────────────────────

export async function getDefectDetail(id: string, companyId: string, userId: string | null) {
  const subs = watcherSubqueries(userId);
  const [rowRes, events, watchers] = await Promise.all([
    db.select({ d: defects, projectName: projects.name, ...subs })
      .from(defects)
      .innerJoin(projects, eq(projects.id, defects.projectId))
      .where(and(eq(defects.id, id), eq(projects.companyId, companyId)))
      .limit(1),
    db.select().from(defectEvents)
      .where(and(eq(defectEvents.defectId, id), eq(defectEvents.companyId, companyId)))
      .orderBy(asc(defectEvents.createdAt)),
    db.select({ userId: defectWatchers.userId, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(defectWatchers)
      .innerJoin(users, eq(users.id, defectWatchers.userId))
      .where(and(eq(defectWatchers.defectId, id), eq(users.companyId, companyId)))
      .orderBy(asc(defectWatchers.createdAt)),
  ]);
  const row = rowRes[0];
  if (!row) throw new DefectError(404, "Defect not found");
  return {
    ...toDefectDto(row.d, {
      projectName: row.projectName, watcherCount: Number(row.watcherCount) || 0, isWatching: !!row.isWatching, now: new Date(),
    }),
    events: events.map(eventDto),
    watchers: watchers.map((w) => ({ userId: w.userId, name: getUserDisplayName(w) })),
  };
}

// ── validation helpers ──────────────────────────────────────────────────────

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const defectFieldsSchema = z.object({
  title: z.string().trim().max(300).optional(),
  description: nullableText(10000),
  location: nullableText(500),
  locationId: z.string().nullable().optional(),
  type: z.string().trim().min(1).max(64).optional(),
  priority: z.string().trim().min(1).max(64).optional(),
  trade: nullableText(120),
  assignedContactId: z.string().nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  jobStage: z.enum(DEFECT_JOB_STAGES).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  dateIdentified: z.coerce.date().optional(),
  notes: nullableText(10000),
  attachments: z.array(defectPhotoSchema).max(100).optional(),
});

export const createDefectSchema = defectFieldsSchema.extend({
  clientRequestId: z.string().trim().min(1).max(120).optional(),
  photos: z.array(defectPhotoSchema).max(50).optional(),
  // Legacy POST /api/defects body carried these; accepted and ignored/handled.
  projectId: z.string().optional(),
  status: z.string().optional(),
  stage: z.string().optional(),
});

export const transitionSchema = z.object({
  to: z.string(),
  note: z.string().trim().max(5000).optional(),
  photos: z.array(defectPhotoSchema).max(50).optional(),
});

export const commentSchema = z.object({
  text: z.string().trim().min(1).max(10000),
  mentions: z.array(z.string()).max(50).optional(),
});

export const photosSchema = z.object({
  photos: z.array(defectPhotoSchema).min(1).max(50),
});

/** New photos must be uploads under this company's own prefix. */
function assertOwnPhotos(photos: Photo[], companyId: string, alreadyOnDefect: Set<string> = new Set()) {
  for (const p of photos) {
    if (alreadyOnDefect.has(p.url)) continue;
    if (!p.url.startsWith(`/objects/company/${companyId}/`)) {
      throw new DefectError(400, "Photos must be uploaded first (use the upload route), then sent by object path");
    }
  }
}

type Actor = { id: string | null; name: string; companyId: string };

export function actorFromReq(req: any): Actor {
  const u = req.user ?? {};
  return { id: u.id ?? null, name: getUserDisplayName(u), companyId: u.companyId };
}

async function teamUser(companyId: string, userId: string) {
  const [u] = await db.select({
    id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, userCategory: users.userCategory,
  }).from(users).where(and(eq(users.id, userId), eq(users.companyId, companyId))).limit(1);
  if (!u || (u.userCategory && u.userCategory !== "team")) return null;
  return u;
}

/** Resolve owner / trade / location ids into the denormalised columns. */
async function resolveRefs(
  companyId: string,
  projectId: string,
  data: { ownerUserId?: string | null; assignedContactId?: string | null; locationId?: string | null },
) {
  const out: Partial<Defect> = {};
  const jobs: Promise<void>[] = [];
  if (data.ownerUserId !== undefined) {
    jobs.push((async () => {
      if (!data.ownerUserId) { out.ownerUserId = null; out.ownerName = null; return; }
      const u = await teamUser(companyId, data.ownerUserId);
      if (!u) throw new DefectError(400, "Owner must be a team member of this company");
      out.ownerUserId = u.id;
      out.ownerName = getUserDisplayName(u);
    })());
  }
  if (data.assignedContactId !== undefined) {
    jobs.push((async () => {
      if (!data.assignedContactId) { out.assignedContactId = null; out.assignedContactName = null; return; }
      const [c] = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company })
        .from(contacts)
        .where(and(eq(contacts.id, data.assignedContactId), eq(contacts.companyId, companyId))).limit(1);
      if (!c) throw new DefectError(400, "Trade contact not found");
      out.assignedContactId = c.id;
      out.assignedContactName = c.company || c.name;
    })());
  }
  if (data.locationId !== undefined) {
    jobs.push((async () => {
      if (!data.locationId) { out.locationId = null; return; }
      const locs = await projectLocationRows(companyId, projectId);
      if (!locs.some((l) => l.id === data.locationId)) throw new DefectError(400, "Location not found on this project");
      out.locationId = data.locationId;
      out.location = buildLocationPaths(locs).get(data.locationId) ?? null;
    })());
  }
  await Promise.all(jobs);
  return out;
}

async function addWatchers(defectId: string, userIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(userIds.filter((v): v is string => !!v)));
  if (!ids.length) return;
  await db.insert(defectWatchers).values(ids.map((userId) => ({ defectId, userId }))).onConflictDoNothing();
}

export async function logEvent(companyId: string, defectId: string, type: string, actor: Actor, data: Record<string, unknown>) {
  await db.insert(defectEvents).values({
    companyId, defectId, type, actorUserId: actor.id, actorName: actor.name, data,
  });
}

export async function watcherIds(defectId: string): Promise<string[]> {
  const rows = await db.select({ userId: defectWatchers.userId }).from(defectWatchers)
    .where(eq(defectWatchers.defectId, defectId));
  return rows.map((r) => r.userId);
}

function pgCode(err: any): string | undefined {
  return err?.code ?? err?.cause?.code;
}
function pgConstraint(err: any): string {
  return String(err?.constraint ?? err?.cause?.constraint ?? err?.message ?? "");
}

// ── create ──────────────────────────────────────────────────────────────────

export async function createDefect(params: {
  companyId: string;
  projectId: string;
  actor: Actor;
  body: z.infer<typeof createDefectSchema>;
}): Promise<{ created: boolean; defect: Awaited<ReturnType<typeof getDefectDetail>> }> {
  const { companyId, projectId, actor, body } = params;

  if (body.clientRequestId) {
    const [existing] = await db.select({ id: defects.id }).from(defects)
      .where(and(eq(defects.projectId, projectId), eq(defects.clientRequestId, body.clientRequestId))).limit(1);
    if (existing) return { created: false, defect: await getDefectDetail(existing.id, companyId, actor.id) };
  }

  const photos = [...(body.attachments ?? []), ...(body.photos ?? [])];
  assertOwnPhotos(photos, companyId);

  const refs = await resolveRefs(companyId, projectId, {
    ownerUserId: body.ownerUserId, assignedContactId: body.assignedContactId, locationId: body.locationId,
  });
  const now = new Date();
  const jobStage = body.jobStage ?? "construction";
  const location = refs.location ?? body.location ?? null;
  const title = body.title?.trim() || (location ? `Defect at ${location}` : "Defect");

  const values = {
    projectId,
    companyId,
    title,
    description: body.description ?? null,
    location,
    locationId: refs.locationId ?? null,
    type: body.type ?? "builder",
    priority: body.priority ?? "medium",
    trade: body.trade ?? null,
    assignedContactId: refs.assignedContactId ?? null,
    assignedContactName: refs.assignedContactName ?? null,
    ownerUserId: refs.ownerUserId ?? null,
    ownerName: refs.ownerName ?? null,
    jobStage,
    stage: "open",
    status: "open",
    dateIdentified: body.dateIdentified ?? now,
    dueDate: body.dueDate === undefined ? defaultDefectDueDate(jobStage, now) : body.dueDate,
    notes: body.notes ?? null,
    attachments: photos,
    clientRequestId: body.clientRequestId ?? null,
    createdBy: actor.id,
    createdByName: actor.name,
  };

  let row: Defect | undefined;
  for (let attempt = 0; attempt < 4 && !row; attempt++) {
    try {
      [row] = await db.insert(defects).values({
        ...values,
        number: sql`(select coalesce(max(${defects.number}), 0) + 1 from ${defects} where ${defects.projectId} = ${projectId})`,
      } as any).returning();
    } catch (err: any) {
      if (pgCode(err) !== "23505") throw err;
      if (pgConstraint(err).includes("client_request") && body.clientRequestId) {
        const [existing] = await db.select({ id: defects.id }).from(defects)
          .where(and(eq(defects.projectId, projectId), eq(defects.clientRequestId, body.clientRequestId))).limit(1);
        if (existing) return { created: false, defect: await getDefectDetail(existing.id, companyId, actor.id) };
      }
      // Two creates raced for the same number — try again.
    }
  }
  if (!row) throw new DefectError(409, "Couldn't number the defect — please try again");

  await Promise.all([
    addWatchers(row.id, [actor.id, row.ownerUserId]),
    logEvent(companyId, row.id, "created", actor, { stage: "open", photos: photos.length }),
  ]);

  if (row.ownerUserId && row.ownerUserId !== actor.id) {
    void notifyDefectUsers({
      userIds: [row.ownerUserId], companyId, projectId, defectId: row.id, actorUserId: actor.id,
      title: `${formatDefectRef(row.number)} assigned to you`,
      message: `${actor.name} made you responsible for "${row.title}"`,
    });
  }

  return { created: true, defect: await getDefectDetail(row.id, companyId, actor.id) };
}

// ── update ──────────────────────────────────────────────────────────────────

export async function loadOwned(id: string, companyId: string): Promise<Defect> {
  const [row] = await db.select({ d: defects }).from(defects)
    .innerJoin(projects, eq(projects.id, defects.projectId))
    .where(and(eq(defects.id, id), eq(projects.companyId, companyId))).limit(1);
  if (!row) throw new DefectError(404, "Defect not found");
  return row.d;
}

const TRACKED_FIELDS = [
  "title", "description", "location", "locationId", "type", "priority", "trade",
  "assignedContactId", "assignedContactName", "ownerUserId", "ownerName", "jobStage",
  "dueDate", "dateIdentified", "notes",
] as const;

export async function updateDefect(params: {
  id: string;
  companyId: string;
  actor: Actor;
  body: Record<string, unknown>;
}) {
  const { id, companyId, actor } = params;
  // Stage moves go through /transition so they're checked and logged. The
  // legacy `status` key is silently dropped (old clients still send it).
  const { status: _legacyStatus, stage, projectId: _projectId, ...rest } = params.body as any;
  if (stage !== undefined) throw new DefectError(400, "Change the stage with POST /api/defects/:id/transition");
  const parsed = defectFieldsSchema.safeParse(rest);
  if (!parsed.success) throw new DefectError(400, "Validation failed", parsed.error.issues);
  const body = parsed.data;

  const before = await loadOwned(id, companyId);
  const existingUrls = new Set(((before.attachments as Photo[] | null) ?? []).map((a) => a.url));
  if (body.attachments) assertOwnPhotos(body.attachments, companyId, existingUrls);

  const refs = await resolveRefs(companyId, before.projectId, {
    ownerUserId: body.ownerUserId, assignedContactId: body.assignedContactId, locationId: body.locationId,
  });
  const patch: Partial<Defect> = {
    ...(body.title !== undefined ? { title: body.title || before.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.location !== undefined ? { location: body.location } : {}),
    ...(body.type !== undefined ? { type: body.type } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.trade !== undefined ? { trade: body.trade } : {}),
    ...(body.jobStage !== undefined ? { jobStage: body.jobStage } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
    ...(body.dateIdentified !== undefined ? { dateIdentified: body.dateIdentified } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
    ...refs,
  };
  // A free-text location edit unlinks the picked location.
  if (body.location !== undefined && body.locationId === undefined && body.location !== before.location) {
    patch.locationId = null;
  }

  const tracked: Record<string, unknown> = {};
  for (const k of TRACKED_FIELDS) if (k in patch) tracked[k] = (patch as any)[k];
  const fields = diffDefectFields(before as any, tracked);
  const photosChanged = body.attachments !== undefined
    && JSON.stringify(before.attachments ?? []) !== JSON.stringify(body.attachments);

  if (Object.keys(patch).length) {
    await db.update(defects).set({ ...patch, updatedAt: new Date() }).where(eq(defects.id, id));
  }
  const jobs: Promise<unknown>[] = [];
  if (Object.keys(fields).length || photosChanged) {
    jobs.push(logEvent(companyId, id, "updated", actor, { fields, ...(photosChanged ? { photos: true } : {}) }));
  }
  const newOwner = refs.ownerUserId;
  if (newOwner && newOwner !== before.ownerUserId) {
    jobs.push(addWatchers(id, [newOwner]));
    if (newOwner !== actor.id) {
      void notifyDefectUsers({
        userIds: [newOwner], companyId, projectId: before.projectId, defectId: id, actorUserId: actor.id,
        title: `${formatDefectRef(before.number)} assigned to you`,
        message: `${actor.name} made you responsible for "${patch.title ?? before.title}"`,
      });
    }
  }
  await Promise.all(jobs);
  return getDefectDetail(id, companyId, actor.id);
}

// ── transition ──────────────────────────────────────────────────────────────

export async function transitionDefect(params: {
  id: string;
  companyId: string;
  actor: Actor;
  actions: DefectActions;
  body: z.infer<typeof transitionSchema>;
}) {
  const { id, companyId, actor, actions, body } = params;
  const before = await loadOwned(id, companyId);
  const check = checkDefectTransition(before.stage, body.to, { canEdit: actions.edit, canClose: actions.close, note: body.note });
  if (!check.ok) throw new DefectError(check.status, check.error);
  const to = body.to as DefectStage;
  const from = (isDefectStage(before.stage) ? before.stage : "open") as DefectStage;

  const photos = body.photos ?? [];
  assertOwnPhotos(photos, companyId);
  const now = new Date();
  const side = transitionSideEffects(to, actor, now);
  const attachments = photos.length
    ? [...(((before.attachments as Photo[] | null) ?? [])), ...photos]
    : undefined;

  // Guard on the stage we read, so two people moving it at once can't both win.
  const updated = await db.update(defects)
    .set({ stage: to, ...side, ...(attachments ? { attachments } : {}), updatedAt: now })
    .where(and(eq(defects.id, id), eq(defects.stage, before.stage)))
    .returning({ id: defects.id });
  if (!updated.length) throw new DefectError(409, "Someone else just changed this defect — reload and try again");

  const note = body.note?.trim() || null;
  await Promise.all([
    logEvent(companyId, id, "transition", actor, { from, to, note }),
    photos.length ? logEvent(companyId, id, "photo", actor, { photos, count: photos.length }) : Promise.resolve(),
  ]);

  const recipients = defectNotifyRecipients({
    actorUserId: actor.id, ownerUserId: before.ownerUserId, watcherIds: await watcherIds(id),
  });
  if (recipients.length) {
    void notifyDefectUsers({
      userIds: recipients, companyId, projectId: before.projectId, defectId: id, actorUserId: actor.id,
      title: `${formatDefectRef(before.number)} ${DEFECT_STAGE_LABELS[to]}`,
      message: `${actor.name} moved "${before.title}" to ${DEFECT_STAGE_LABELS[to]}${note ? `: ${note}` : ""}`,
    });
  }
  return getDefectDetail(id, companyId, actor.id);
}

// ── comments / photos / watch ───────────────────────────────────────────────

export async function commentOnDefect(params: {
  id: string;
  companyId: string;
  actor: Actor;
  body: z.infer<typeof commentSchema>;
}) {
  const { id, companyId, actor, body } = params;
  const before = await loadOwned(id, companyId);
  const requested = Array.from(new Set(body.mentions ?? []));
  const mentions = requested.length
    ? (await db.select({ id: users.id, userCategory: users.userCategory }).from(users)
      .where(and(inArray(users.id, requested), eq(users.companyId, companyId))))
      .filter((u) => !u.userCategory || u.userCategory === "team")
      .map((u) => u.id)
    : [];

  await Promise.all([
    logEvent(companyId, id, "comment", actor, { text: body.text, mentions }),
    // Being mentioned in a defect is a reason to follow it.
    addWatchers(id, mentions),
    db.update(defects).set({ updatedAt: new Date() }).where(eq(defects.id, id)),
  ]);

  const ref = formatDefectRef(before.number);
  const preview = body.text.length > 140 ? `${body.text.slice(0, 137)}…` : body.text;
  const mentioned = mentions.filter((m) => m !== actor.id);
  const others = defectNotifyRecipients({
    actorUserId: actor.id, ownerUserId: before.ownerUserId, watcherIds: await watcherIds(id),
  }).filter((u) => !mentioned.includes(u));
  if (mentioned.length) {
    void notifyDefectUsers({
      userIds: mentioned, companyId, projectId: before.projectId, defectId: id, actorUserId: actor.id,
      title: `${actor.name} mentioned you on ${ref}`, message: preview,
    });
  }
  if (others.length) {
    void notifyDefectUsers({
      userIds: others, companyId, projectId: before.projectId, defectId: id, actorUserId: actor.id,
      title: `New comment on ${ref}`, message: `${actor.name}: ${preview}`,
    });
  }
  return getDefectDetail(id, companyId, actor.id);
}

export async function addDefectPhotos(params: {
  id: string;
  companyId: string;
  actor: Actor;
  photos: Photo[];
}) {
  const { id, companyId, actor, photos } = params;
  const before = await loadOwned(id, companyId);
  assertOwnPhotos(photos, companyId);
  const attachments = [...(((before.attachments as Photo[] | null) ?? [])), ...photos];
  await db.update(defects).set({ attachments, updatedAt: new Date() }).where(eq(defects.id, id));
  await logEvent(companyId, id, "photo", actor, { photos, count: photos.length });
  return getDefectDetail(id, companyId, actor.id);
}

export async function setWatching(params: { id: string; companyId: string; actor: Actor; watching: boolean }) {
  const { id, companyId, actor, watching } = params;
  if (!actor.id) throw new DefectError(401, "Not signed in");
  await loadOwned(id, companyId);
  if (watching) {
    const inserted = await db.insert(defectWatchers).values({ defectId: id, userId: actor.id })
      .onConflictDoNothing().returning({ userId: defectWatchers.userId });
    if (inserted.length) await logEvent(companyId, id, "watcher_added", actor, { userId: actor.id });
  } else {
    const removed = await db.delete(defectWatchers)
      .where(and(eq(defectWatchers.defectId, id), eq(defectWatchers.userId, actor.id)))
      .returning({ userId: defectWatchers.userId });
    if (removed.length) await logEvent(companyId, id, "watcher_removed", actor, { userId: actor.id });
  }
  return getDefectDetail(id, companyId, actor.id);
}

export async function deleteDefect(id: string, companyId: string) {
  await loadOwned(id, companyId);
  await db.delete(defects).where(eq(defects.id, id));
}

// ── locations ───────────────────────────────────────────────────────────────

async function projectLocationRows(companyId: string, projectId: string) {
  return db.select().from(projectLocations)
    .where(and(eq(projectLocations.projectId, projectId), eq(projectLocations.companyId, companyId)))
    .orderBy(asc(projectLocations.sortOrder), asc(projectLocations.name));
}

export async function listLocations(companyId: string, projectId: string) {
  const rows = await projectLocationRows(companyId, projectId);
  const paths = buildLocationPaths(rows);
  return rows
    .map((r) => ({ id: r.id, parentId: r.parentId, name: r.name, path: paths.get(r.id) ?? r.name, sortOrder: r.sortOrder }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
}

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().nullable().optional(),
});

export const updateLocationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

export async function createLocation(companyId: string, projectId: string, body: z.infer<typeof createLocationSchema>) {
  const rows = await projectLocationRows(companyId, projectId);
  const parentId = body.parentId || null;
  if (parentId && !rows.some((r) => r.id === parentId)) throw new DefectError(400, "Parent location not found on this project");
  const dup = rows.find((r) => (r.parentId ?? null) === parentId && r.name.toLowerCase() === body.name.toLowerCase());
  if (dup) {
    const paths = buildLocationPaths(rows);
    return { id: dup.id, parentId: dup.parentId, name: dup.name, path: paths.get(dup.id) ?? dup.name, sortOrder: dup.sortOrder };
  }
  const siblings = rows.filter((r) => (r.parentId ?? null) === parentId);
  const sortOrder = siblings.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
  const [row] = await db.insert(projectLocations).values({ companyId, projectId, parentId, name: body.name, sortOrder }).returning();
  const paths = buildLocationPaths([...rows, row]);
  return { id: row.id, parentId: row.parentId, name: row.name, path: paths.get(row.id) ?? row.name, sortOrder: row.sortOrder };
}

async function loadOwnedLocation(id: string, companyId: string) {
  const [row] = await db.select().from(projectLocations)
    .where(and(eq(projectLocations.id, id), eq(projectLocations.companyId, companyId))).limit(1);
  if (!row) throw new DefectError(404, "Location not found");
  return row;
}

export async function getLocationProjectId(id: string, companyId: string): Promise<string> {
  return (await loadOwnedLocation(id, companyId)).projectId;
}

export async function updateLocation(id: string, companyId: string, body: z.infer<typeof updateLocationSchema>) {
  const loc = await loadOwnedLocation(id, companyId);
  const rows = await projectLocationRows(companyId, loc.projectId);
  if (body.parentId !== undefined) {
    const parentId = body.parentId || null;
    if (parentId && !rows.some((r) => r.id === parentId)) throw new DefectError(400, "Parent location not found on this project");
    if (locationParentMakesCycle(rows, id, parentId)) throw new DefectError(400, "A location can't sit inside itself");
  }
  const patch = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.parentId !== undefined ? { parentId: body.parentId || null } : {}),
    ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
  };
  if (!Object.keys(patch).length) return (await listLocations(companyId, loc.projectId)).find((l) => l.id === id);
  await db.update(projectLocations).set(patch).where(eq(projectLocations.id, id));

  // Paths changed for this location and everything below it: keep the
  // defects' display text in step.
  if (patch.name !== undefined || patch.parentId !== undefined) {
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    const paths = buildLocationPaths(next);
    const affected = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of next) if (r.parentId && affected.has(r.parentId) && !affected.has(r.id)) { affected.add(r.id); grew = true; }
    }
    await Promise.all(Array.from(affected).map((locId) =>
      db.update(defects).set({ location: paths.get(locId) ?? null })
        .where(and(eq(defects.locationId, locId), eq(defects.projectId, loc.projectId)))));
  }
  return (await listLocations(companyId, loc.projectId)).find((l) => l.id === id);
}

export async function deleteLocation(id: string, companyId: string) {
  const loc = await loadOwnedLocation(id, companyId);
  const [[child], [used]] = await Promise.all([
    db.select({ id: projectLocations.id }).from(projectLocations).where(eq(projectLocations.parentId, id)).limit(1),
    db.select({ id: defects.id }).from(defects).where(and(eq(defects.locationId, id), eq(defects.projectId, loc.projectId))).limit(1),
  ]);
  if (child) throw new DefectError(409, "Remove or move the locations inside it first");
  if (used) throw new DefectError(409, "Defects use this location — move them first");
  await db.delete(projectLocations).where(eq(projectLocations.id, id));
}
