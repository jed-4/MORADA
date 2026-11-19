/**
 * Defects v2 stage 3 — the handover list, the client's sign-off of it, and
 * backcharges to trades. Contract: docs/DEFECTS_V2.md ("Stage 3").
 *
 *  - The handover list is the project's defects in the chosen job stages
 *    (default pre_handover + handover), with before/after photos, status and
 *    closed date. One JSON shape feeds the web page and the @react-pdf
 *    document. Photos are served by a project-scoped route, so a client never
 *    needs object-storage access of their own.
 *  - Clients see it only when the project's "Share handover list with client"
 *    switch is on (and their role holds portal.handover). They never see trade
 *    names or any money.
 *  - Sign-off records the client's typed name, the time, their IP and browser,
 *    and a snapshot of the list — the same evidence a signed variation keeps.
 *  - Backcharges are CENTS INC GST on the defect. Reading or writing one needs
 *    `financial.bills` (the bills permission). The defect event says a
 *    backcharge was recorded but never carries the amount, because events are
 *    visible to everyone who can see the defect. No Xero document is created.
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  contacts,
  costCodes,
  defectEvents,
  defectHandoverSignoffs,
  defects,
  projects,
} from "@shared/schema";
import { DEFECT_JOB_STAGES, formatDefectRef, isDefectStage, type DefectStage } from "@shared/defects";
import {
  backchargeTotalsByTrade,
  parseBackchargeDollars,
  parseHandoverJobStages,
  splitHandoverPhotos,
  validBackchargeCents,
  type HandoverSignoffView,
} from "@shared/defectTrades";
import { storage } from "../storage";
import { DefectError, logEvent } from "./defects";

type Actor = { id: string | null; name: string; companyId: string };
type Photo = { url: string; name?: string; type?: string; kind?: string };

const isImage = (p: Photo) => (p.type ?? "").startsWith("image") || /\.(jpe?g|png|heic|webp|gif)$/i.test(p.name ?? p.url);

async function ownedProject(companyId: string, projectId: string) {
  const [p] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId))).limit(1);
  if (!p) throw new DefectError(404, "Project not found");
  return p;
}

export function handoverPhotoUrl(projectId: string, defectId: string, index: number) {
  return `/api/projects/${projectId}/handover/photos/${defectId}/${index}`;
}

export interface HandoverView {
  project: { id: string; name: string; address: string | null };
  branding: { companyName: string | null; logoUrl: string | null; brandColor: string | null; documentStyle: string; abn: string | null; phone: string | null; email: string | null };
  jobStages: string[];
  shareWithClient: boolean;
  defects: Array<{
    id: string;
    ref: string;
    title: string;
    description: string | null;
    location: string | null;
    jobStage: string;
    stage: DefectStage;
    priority: string;
    trade: string | null;
    dueDate: string | null;
    closedAt: string | null;
    before: string[];
    after: string[];
  }>;
  counts: { total: number; closed: number; open: number };
  signoffs: HandoverSignoffView[];
}

/**
 * The list. `forClient` drops trade names (a client never sees who the trade
 * is) and refuses unless the project shares the list.
 */
export async function getHandoverList(params: {
  companyId: string;
  projectId: string;
  jobStagesRaw: unknown;
  forClient: boolean;
}): Promise<HandoverView> {
  const project = await ownedProject(params.companyId, params.projectId);
  if (params.forClient && !project.shareHandoverWithClient) {
    throw new DefectError(404, "Your builder hasn't shared the handover list yet");
  }
  const jobStages = parseHandoverJobStages(params.jobStagesRaw, DEFECT_JOB_STAGES as unknown as string[]);
  const [rows, settings, company, signoffs] = await Promise.all([
    db.select().from(defects)
      .where(and(eq(defects.projectId, project.id), eq(defects.companyId, params.companyId), inArray(defects.jobStage, jobStages)))
      .orderBy(asc(defects.number)),
    storage.getCompanySettings(params.companyId).catch(() => undefined) as Promise<any>,
    storage.getCompany(params.companyId).catch(() => undefined) as Promise<any>,
    listSignoffs(params.companyId, project.id),
  ]);

  const items = rows.map((d) => {
    const photos = ((Array.isArray(d.attachments) ? d.attachments : []) as Photo[])
      .map((p, i) => ({ ...p, i }))
      .filter(isImage);
    const { before, after } = splitHandoverPhotos(photos);
    return {
      id: d.id,
      ref: formatDefectRef(d.number),
      title: d.title,
      description: d.description,
      location: d.location,
      jobStage: d.jobStage,
      stage: (isDefectStage(d.stage) ? d.stage : "open") as DefectStage,
      priority: d.priority,
      trade: params.forClient ? null : (d.assignedContactName || d.trade || null),
      dueDate: d.dueDate?.toISOString() ?? null,
      closedAt: d.closedAt?.toISOString() ?? null,
      before: before.slice(0, 2).map((p) => handoverPhotoUrl(project.id, d.id, p.i)),
      after: after.slice(0, 2).map((p) => handoverPhotoUrl(project.id, d.id, p.i)),
    };
  });
  const closed = items.filter((i) => i.stage === "closed").length;
  return {
    project: { id: project.id, name: project.name, address: ((project as any).location as string | null) ?? null },
    branding: {
      companyName: settings?.companyName || company?.nickname || company?.name || null,
      logoUrl: settings?.logoUrl ?? null,
      brandColor: settings?.brandColor ?? null,
      documentStyle: settings?.documentStyle ?? "style1",
      abn: company?.abn ?? null,
      phone: settings?.phone ?? company?.phone ?? null,
      email: settings?.email ?? company?.email ?? null,
    },
    jobStages,
    shareWithClient: !!project.shareHandoverWithClient,
    defects: items,
    counts: { total: items.length, closed, open: items.length - closed },
    signoffs,
  };
}

/** Object path of a handover photo, checked against the project + company. */
export async function handoverPhotoPath(params: {
  companyId: string;
  projectId: string;
  defectId: string;
  index: number;
  forClient: boolean;
}): Promise<string | null> {
  const project = await ownedProject(params.companyId, params.projectId);
  if (params.forClient && !project.shareHandoverWithClient) return null;
  const [d] = await db.select({ attachments: defects.attachments }).from(defects)
    .where(and(eq(defects.id, params.defectId), eq(defects.projectId, project.id), eq(defects.companyId, params.companyId)))
    .limit(1);
  if (!d) return null;
  const p = ((Array.isArray(d.attachments) ? d.attachments : []) as Photo[])[params.index];
  if (!p || !isImage(p) || !p.url.startsWith(`/objects/company/${params.companyId}/`)) return null;
  return p.url;
}

export const handoverSettingsSchema = z.object({ shareWithClient: z.boolean() });

export async function setHandoverSharing(companyId: string, projectId: string, share: boolean) {
  const project = await ownedProject(companyId, projectId);
  await db.update(projects).set({ shareHandoverWithClient: share, updatedAt: new Date() })
    .where(and(eq(projects.id, project.id), eq(projects.companyId, companyId)));
  return { shareWithClient: share };
}

async function listSignoffs(companyId: string, projectId: string): Promise<HandoverSignoffView[]> {
  const rows = await db.select().from(defectHandoverSignoffs)
    .where(and(eq(defectHandoverSignoffs.companyId, companyId), eq(defectHandoverSignoffs.projectId, projectId)))
    .orderBy(desc(defectHandoverSignoffs.signedAt));
  return rows.map((r) => ({
    id: r.id,
    signerName: r.signerName,
    signedAt: r.signedAt.toISOString(),
    jobStages: (r.jobStages as string[]) ?? [],
    defectCount: r.defectCount,
    openCount: r.openCount,
  }));
}

export const signoffSchema = z.object({
  name: z.string().trim().min(2, "Type your full name to sign").max(200),
  agree: z.literal(true, { errorMap: () => ({ message: "Tick the box to confirm" }) }),
  jobStages: z.string().max(200).optional(),
});

/** The client signs the list as it stands. */
export async function signHandoverList(params: {
  companyId: string;
  projectId: string;
  actor: Actor;
  body: z.infer<typeof signoffSchema>;
  ip: string | null;
  userAgent: string | null;
}) {
  const list = await getHandoverList({ companyId: params.companyId, projectId: params.projectId, jobStagesRaw: params.body.jobStages, forClient: true });
  if (!list.defects.length) throw new DefectError(400, "There's nothing on the handover list to sign yet");
  const [row] = await db.insert(defectHandoverSignoffs).values({
    companyId: params.companyId,
    projectId: params.projectId,
    signerUserId: params.actor.id,
    signerName: params.body.name,
    jobStages: list.jobStages,
    defectCount: list.counts.total,
    openCount: list.counts.open,
    snapshot: list.defects.map((d) => ({ id: d.id, ref: d.ref, title: d.title, stage: d.stage, closedAt: d.closedAt })),
    ipAddress: params.ip,
    userAgent: params.userAgent?.slice(0, 500) ?? null,
  }).returning();
  await db.insert(defectEvents).values(list.defects.map((d) => ({
    companyId: params.companyId, defectId: d.id, type: "handover_signed",
    actorUserId: params.actor.id, actorName: params.body.name,
    data: { signoffId: row.id, stage: d.stage },
  })));
  return {
    id: row.id,
    signerName: row.signerName,
    signedAt: row.signedAt.toISOString(),
    jobStages: list.jobStages,
    defectCount: row.defectCount,
    openCount: row.openCount,
  } satisfies HandoverSignoffView;
}

// ── backcharges ─────────────────────────────────────────────────────────────

export const backchargeSchema = z.object({
  /** Either cents (integer) … */
  amountCents: z.number().int().optional(),
  /** … or dollars inc GST as typed ("1,250.50"). */
  amount: z.union([z.string(), z.number()]).optional(),
  reason: z.string().trim().min(1, "Say what the backcharge is for").max(2000),
  costCodeId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
});

export interface BackchargeView {
  defectId: string;
  ref: string;
  title: string;
  projectId: string;
  projectName: string | null;
  stage: string;
  cents: number;
  reason: string | null;
  costCodeId: string | null;
  costCodeLabel: string | null;
  contactId: string | null;
  contactName: string | null;
  backchargedAt: string | null;
  backchargedByName: string | null;
}

export async function setBackcharge(params: {
  id: string;
  companyId: string;
  actor: Actor;
  body: z.infer<typeof backchargeSchema>;
}) {
  const { id, companyId, actor, body } = params;
  const cents = body.amountCents !== undefined ? validBackchargeCents(body.amountCents) : parseBackchargeDollars(body.amount);
  if (cents == null) throw new DefectError(400, "Enter an amount over $0 (inc GST)");

  const [row] = await db.select({ d: defects }).from(defects)
    .innerJoin(projects, eq(projects.id, defects.projectId))
    .where(and(eq(defects.id, id), eq(projects.companyId, companyId))).limit(1);
  if (!row) throw new DefectError(404, "Defect not found");
  const d = row.d;

  const contactId = body.contactId === undefined ? (d.backchargeContactId ?? d.assignedContactId) : body.contactId;
  if (!contactId) throw new DefectError(400, "Pick the trade to backcharge");
  const [contact] = await db.select({ id: contacts.id }).from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId))).limit(1);
  if (!contact) throw new DefectError(400, "Trade contact not found");

  let costCodeId: string | null = null;
  if (body.costCodeId) {
    const [cc] = await db.select({ id: costCodes.id }).from(costCodes)
      .where(and(eq(costCodes.id, body.costCodeId), eq(costCodes.companyId, companyId))).limit(1);
    if (!cc) throw new DefectError(400, "Cost code not found");
    costCodeId = cc.id;
  }

  const updating = d.backchargeCents != null;
  await db.update(defects).set({
    backchargeCents: cents,
    backchargeReason: body.reason,
    backchargeContactId: contact.id,
    backchargeCostCodeId: costCodeId,
    backchargedAt: d.backchargedAt ?? new Date(),
    backchargedBy: actor.id,
    backchargedByName: actor.name,
    updatedAt: new Date(),
  }).where(eq(defects.id, d.id));
  // No amount in the event: events are shown to everyone who can see the defect.
  await logEvent(companyId, d.id, "backcharge", actor, { action: updating ? "updated" : "recorded", contactId: contact.id });
  return getBackcharge(d.id, companyId);
}

export async function clearBackcharge(params: { id: string; companyId: string; actor: Actor }) {
  const [row] = await db.select({ id: defects.id, cents: defects.backchargeCents }).from(defects)
    .innerJoin(projects, eq(projects.id, defects.projectId))
    .where(and(eq(defects.id, params.id), eq(projects.companyId, params.companyId))).limit(1);
  if (!row) throw new DefectError(404, "Defect not found");
  if (row.cents == null) return null;
  await db.update(defects).set({
    backchargeCents: null, backchargeReason: null, backchargeContactId: null, backchargeCostCodeId: null,
    backchargedAt: null, backchargedBy: null, backchargedByName: null, updatedAt: new Date(),
  }).where(eq(defects.id, row.id));
  await logEvent(params.companyId, row.id, "backcharge", params.actor, { action: "cleared" });
  return null;
}

async function backchargeRows(companyId: string, filter: { projectId?: string; defectId?: string }) {
  const where = [eq(projects.companyId, companyId), isNotNull(defects.backchargeCents)];
  if (filter.projectId) where.push(eq(defects.projectId, filter.projectId));
  if (filter.defectId) where.push(eq(defects.id, filter.defectId));
  const rows = await db.select({
    d: defects,
    projectName: projects.name,
    contactName: contacts.name,
    contactCompany: contacts.company,
    costCode: costCodes.code,
    costCodeName: costCodes.title,
  }).from(defects)
    .innerJoin(projects, eq(projects.id, defects.projectId))
    .leftJoin(contacts, and(eq(contacts.id, defects.backchargeContactId), eq(contacts.companyId, companyId)))
    .leftJoin(costCodes, and(eq(costCodes.id, defects.backchargeCostCodeId), eq(costCodes.companyId, companyId)))
    .where(and(...where))
    .orderBy(desc(defects.backchargedAt));
  return rows.map((r): BackchargeView => ({
    defectId: r.d.id,
    ref: formatDefectRef(r.d.number),
    title: r.d.title,
    projectId: r.d.projectId,
    projectName: r.projectName,
    stage: r.d.stage,
    cents: r.d.backchargeCents ?? 0,
    reason: r.d.backchargeReason,
    costCodeId: r.d.backchargeCostCodeId,
    costCodeLabel: r.costCode ? [r.costCode, r.costCodeName].filter(Boolean).join(" · ") : null,
    contactId: r.d.backchargeContactId,
    contactName: r.contactCompany?.trim() || r.contactName || null,
    backchargedAt: r.d.backchargedAt?.toISOString() ?? null,
    backchargedByName: r.d.backchargedByName,
  }));
}

export async function getBackcharge(defectId: string, companyId: string): Promise<BackchargeView | null> {
  const [row] = await backchargeRows(companyId, { defectId });
  return row ?? null;
}

/** The office's list to raise from: rows plus totals per trade. */
export async function listBackcharges(companyId: string, projectId?: string) {
  if (projectId) await ownedProject(companyId, projectId);
  const items = await backchargeRows(companyId, { projectId });
  const totals = backchargeTotalsByTrade(items.map((i) => ({ contactId: i.contactId, contactName: i.contactName, cents: i.cents })));
  return { items, totals, totalCents: items.reduce((s, i) => s + i.cents, 0) };
}
