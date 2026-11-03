// Operations workflows engine: when something happens in a company, run that
// company's matching workflows (shared/workflows.ts for the shapes).
//
// How a firing works:
//   1. Load the company's ACTIVE workflows for this trigger type — one query,
//      always filtered by the event's companyId, so a workflow can only ever
//      act on its own company's events.
//   2. For each match, CLAIM a workflow_runs row keyed by (workflow, event
//      key). The unique index makes the claim the idempotency check: a retry,
//      a double click or a second server inserts nothing and runs nothing.
//   3. Run the actions in order. One failing action is recorded and the rest
//      still run; the run ends done / partial / failed with what it made.
//
// Callers fire and forget (fireWorkflowEvent): a workflow must never slow down
// or break the save that triggered it.
//
// To-Dos a workflow makes carry referenceType "workflow_run" (+ the run id),
// and keep templateId so they show the template's SOP. Recurring generation
// ignores them (storage.generateRecurringTasks / createNextRecurringTask), so a
// one-off from a weekly template never stands in for, or spawns, a weekly one.

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import {
  workflowActionsSchema,
  type WorkflowAction,
  type WorkflowAssignee,
  type WorkflowRunResult,
  type WorkflowTriggerConfig,
  type WorkflowTriggerType,
} from "@shared/workflows";
import { storage } from "../storage";
import { notifyTaskAssignment, notifyWorkflowMessage } from "../utils/domainNotifications";

export const WORKFLOW_TASK_REFERENCE = "workflow_run";

export type WorkflowActor = { id: string | null; name: string };

export function actorFrom(user: any): WorkflowActor {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || user?.email || "Someone";
  return { id: user?.id ?? null, name };
}

export type WorkflowEvent =
  | { type: "project_status"; companyId: string; projectId: string; projectName: string; statusKey: string; statusLabel?: string | null; actor: WorkflowActor }
  | { type: "project_phase"; companyId: string; projectId: string; projectName: string; phase: string; actor: WorkflowActor }
  | { type: "task_completed"; companyId: string; taskId: string; taskTitle: string; templateId: string | null; projectId: string | null; actor: WorkflowActor }
  | { type: "doc_approved"; companyId: string; docId: string; docTitle: string; docType: string; version: number; actor: WorkflowActor };

type Normalised = { trigger: WorkflowTriggerType; config: WorkflowTriggerConfig; actions: WorkflowAction[] };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

// A row saved by the builder carries `actions`. A row saved before the engine
// existed only has the legacy columns; read those as the same thing, so an old
// "status change → these task templates" workflow means what it always said.
export function normaliseWorkflow(row: schema.WorkflowTemplate): Normalised | null {
  const parsed = workflowActionsSchema.safeParse(row.actions ?? []);
  const actions = parsed.success ? parsed.data : [];
  if (actions.length > 0) {
    if (row.triggerType === "stage_change" || row.triggerType === "status_change" || row.triggerType === "date") return null;
    return { trigger: row.triggerType as WorkflowTriggerType, config: (row.triggerConfig ?? {}) as WorkflowTriggerConfig, actions };
  }

  const configs = Array.isArray(row.taskConfigs) ? (row.taskConfigs as any[]) : [];
  const ids = Array.isArray(row.taskTemplateIds) ? (row.taskTemplateIds as string[]) : [];
  const legacyActions: WorkflowAction[] = configs.length
    ? configs.filter((c) => c?.templateId).map((c) => ({
        type: "create_task" as const,
        taskTemplateId: c.templateId,
        offsetDays: Math.max(0, Number(c.offsetDays) || 0),
        assignee: c.assigneeRoleId ? { type: "role" as const, roleId: c.assigneeRoleId } : { type: "template" as const },
      }))
    : ids.filter(Boolean).map((id) => ({ type: "create_task" as const, taskTemplateId: id, offsetDays: 0, assignee: { type: "template" as const } }));
  if (legacyActions.length === 0) return null;

  if (row.triggerType === "status_change" && row.triggerStatus) {
    return { trigger: "project_status", config: { statusKey: row.triggerStatus }, actions: legacyActions };
  }
  if (row.triggerType === "stage_change" && row.triggerStage) {
    const phase = norm(row.triggerStage);
    if (["lead", "pre_construction", "construction", "post_construction"].includes(phase)) {
      return { trigger: "project_phase", config: { phase: phase as any }, actions: legacyActions };
    }
    return null;
  }
  if (row.triggerType === "manual") return { trigger: "manual", config: {}, actions: legacyActions };
  return null;
}

function matches(w: Normalised, event: WorkflowEvent): boolean {
  if (w.trigger !== event.type) return false;
  const c = w.config;
  switch (event.type) {
    case "project_status":
      // Legacy rows held free text, so a label match counts too.
      return !!c.statusKey && (c.statusKey === event.statusKey || norm(c.statusKey) === norm(event.statusLabel));
    case "project_phase":
      return !!c.phase && c.phase === event.phase;
    case "task_completed":
      return !!c.taskTemplateId && c.taskTemplateId === event.templateId;
    case "doc_approved":
      if (c.docId) return c.docId === event.docId;
      if (c.docType) return c.docType === event.docType;
      return true;
  }
}

function eventKey(event: WorkflowEvent): string {
  switch (event.type) {
    case "project_status": return `project:${event.projectId}:status:${event.statusKey}`;
    case "project_phase": return `project:${event.projectId}:phase:${event.phase}`;
    case "task_completed": return `task:${event.taskId}`;
    case "doc_approved": return `doc:${event.docId}:v${event.version}`;
  }
}

function eventSummary(event: WorkflowEvent): string {
  switch (event.type) {
    case "project_status": return `${event.projectName} moved to ${event.statusLabel || event.statusKey}`;
    case "project_phase": return `${event.projectName} entered ${event.phase.replace(/_/g, "-")}`;
    case "task_completed": return `"${event.taskTitle}" was completed`;
    case "doc_approved": return `"${event.docTitle}" v${event.version} was approved`;
  }
}

type RunContext = {
  companyId: string;
  projectId: string | null;
  link: string;
  summary: string;
  actor: WorkflowActor;
};

function contextFor(event: WorkflowEvent): RunContext {
  const projectId = event.type === "project_status" || event.type === "project_phase"
    ? event.projectId
    : event.type === "task_completed" ? event.projectId : null;
  const link = event.type === "doc_approved"
    ? `/systems?tab=library&doc=${event.docId}`
    : projectId ? `/projects/${projectId}` : "/workspace/tasks";
  return { companyId: event.companyId, projectId, link, summary: eventSummary(event), actor: event.actor };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

// For request handlers: never awaited, never throws.
export function fireWorkflowEvent(event: WorkflowEvent): void {
  dispatchWorkflowEvent(event).catch((err) =>
    console.error(`[Workflows] ${event.type} dispatch failed for company ${event.companyId}:`, err));
}

export async function dispatchWorkflowEvent(event: WorkflowEvent): Promise<string[]> {
  const legacy = event.type === "project_status" ? ["status_change"] : event.type === "project_phase" ? ["stage_change"] : [];
  const rows = await db.select().from(schema.workflowTemplates).where(and(
    eq(schema.workflowTemplates.companyId, event.companyId),
    eq(schema.workflowTemplates.isActive, true),
    inArray(schema.workflowTemplates.triggerType, [event.type, ...legacy]),
  ));
  const runIds: string[] = [];
  const key = eventKey(event);
  const ctx = contextFor(event);
  for (const row of rows) {
    const w = normaliseWorkflow(row);
    if (!w || !matches(w, event)) continue;
    const runId = await runWorkflow(row, w, key, event.type, ctx);
    if (runId) runIds.push(runId);
  }
  return runIds;
}

// A project save changed its status and/or phase: fire both triggers. Takes
// the rows from before and after the save so every route that moves a project
// (edit, board drag, phase transition) can report it the same way.
export function fireProjectChangeWorkflows(
  before: { projectSubStatus?: string | null; currentSystemPhase?: string | null } | null | undefined,
  after: { id: string; name: string; companyId: string | null; projectSubStatus?: string | null; currentSystemPhase?: string | null; isBusiness?: boolean | null },
  actor: WorkflowActor,
): void {
  if (!after.companyId || after.isBusiness) return;
  const companyId = after.companyId;
  const statusKey = after.projectSubStatus;
  const phase = after.currentSystemPhase;
  const statusChanged = !!statusKey && statusKey !== before?.projectSubStatus;
  const phaseChanged = !!phase && phase !== before?.currentSystemPhase;
  if (!statusChanged && !phaseChanged) return;
  (async () => {
    if (statusChanged) {
      let statusLabel: string | null = null;
      try {
        const category = await storage.getFieldCategoryWithOptions("project.status", companyId);
        statusLabel = category?.options?.find((o: any) => o.key === statusKey)?.name ?? null;
      } catch { /* the label is only for the run log line */ }
      await dispatchWorkflowEvent({ type: "project_status", companyId, projectId: after.id, projectName: after.name, statusKey: statusKey!, statusLabel, actor });
    }
    if (phaseChanged) {
      await dispatchWorkflowEvent({ type: "project_phase", companyId, projectId: after.id, projectName: after.name, phase: phase!, actor });
    }
  })().catch((err) => console.error(`[Workflows] project change dispatch failed for ${after.id}:`, err));
}

// "Run" pressed in the builder. Every press is its own run.
export async function runWorkflowManually(
  row: schema.WorkflowTemplate,
  opts: { projectId: string | null; projectName: string | null; actor: WorkflowActor },
): Promise<string | null> {
  const w = normaliseWorkflow(row);
  if (!w) return null;
  const ctx: RunContext = {
    companyId: row.companyId,
    projectId: opts.projectId,
    link: opts.projectId ? `/projects/${opts.projectId}` : "/workspace/tasks",
    summary: `Run by ${opts.actor.name}${opts.projectName ? ` on ${opts.projectName}` : ""}`,
    actor: opts.actor,
  };
  return runWorkflow(row, w, `manual:${randomUUID()}`, "manual", ctx);
}

// ---------------------------------------------------------------------------
// Running one workflow
// ---------------------------------------------------------------------------

async function runWorkflow(
  row: schema.WorkflowTemplate,
  w: Normalised,
  key: string,
  triggerType: string,
  ctx: RunContext,
): Promise<string | null> {
  const [claimed] = await db.insert(schema.workflowRuns).values({
    companyId: ctx.companyId,
    workflowId: row.id,
    eventKey: key,
    triggerType,
    projectId: ctx.projectId,
    summary: ctx.summary,
    status: "running",
    firedById: ctx.actor.id,
    firedByName: ctx.actor.name,
  }).onConflictDoNothing().returning({ id: schema.workflowRuns.id });
  if (!claimed) return null; // this event already ran this workflow

  const result: WorkflowRunResult = { createdTaskIds: [], notifiedUserIds: [], errors: [] };
  for (let i = 0; i < w.actions.length; i++) {
    const action = w.actions[i];
    try {
      if (action.type === "create_task") await createTasks(action, claimed.id, row.name, ctx, result);
      else await notify(action, row.name, ctx, result);
    } catch (err: any) {
      result.errors.push(`Step ${i + 1}: ${err?.message || String(err)}`);
    }
  }
  const status = result.errors.length === 0 ? "done" : result.errors.length < w.actions.length ? "partial" : "failed";
  await db.update(schema.workflowRuns)
    .set({ status, result, finishedAt: new Date() })
    .where(eq(schema.workflowRuns.id, claimed.id));
  return claimed.id;
}

async function companyUsers(companyId: string) {
  return db.select({
    id: schema.users.id,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    email: schema.users.email,
    roleId: schema.users.roleId,
  }).from(schema.users).where(and(eq(schema.users.companyId, companyId), eq(schema.users.isActive, true)));
}
type CompanyUser = Awaited<ReturnType<typeof companyUsers>>[number];

const displayName = (u: CompanyUser) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "";

// Everyone resolves through this company's active users, so an id from
// anywhere else (or someone who has left) simply drops out.
function resolvePeople(assignee: WorkflowAssignee, users: CompanyUser[], template?: schema.TaskTemplate): CompanyUser[] {
  if (assignee.type === "user") return users.filter((u) => u.id === assignee.userId);
  if (assignee.type === "role") return users.filter((u) => u.roleId === assignee.roleId);
  if (!template) return [];
  if (template.assigneeType === "user") {
    const named = template.assigneeUserIds?.length ? template.assigneeUserIds : (template.assigneeUserId ? [template.assigneeUserId] : []);
    return users.filter((u) => named.includes(u.id));
  }
  return template.defaultRoleId ? users.filter((u) => u.roleId === template.defaultRoleId) : [];
}

// Date-only, as the recurring generator stores due dates (midnight, server
// clock), so these sort and display alongside the generated ones.
function dueDate(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function createTasks(
  action: Extract<WorkflowAction, { type: "create_task" }>,
  runId: string,
  workflowName: string,
  ctx: RunContext,
  result: WorkflowRunResult,
) {
  const [template] = await db.select().from(schema.taskTemplates).where(and(
    eq(schema.taskTemplates.id, action.taskTemplateId),
    eq(schema.taskTemplates.companyId, ctx.companyId),
  ));
  if (!template) throw new Error("its task template no longer exists");

  const people = resolvePeople(action.assignee, await companyUsers(ctx.companyId), template);
  const owners: Array<CompanyUser | null> = people.length ? people : [null];
  const due = dueDate(action.offsetDays);
  const checklist = Array.isArray(template.checklist) ? (template.checklist as any[]) : [];
  const contextType = ctx.projectId ? "project" : "business";

  const rows = owners.map((person) => ({
    title: template.title,
    content: template.description || "",
    author: `Workflow: ${workflowName}`,
    type: "task",
    status: template.defaultTaskStatus || "todo",
    category: template.category ?? "",
    assigneeId: person?.id ?? null,
    assigneeName: person ? displayName(person) : null,
    assigneeIds: person ? [person.id] : [],
    assigneeNames: person ? [displayName(person)] : [],
    ownerId: ctx.actor.id,
    ownerName: ctx.actor.name,
    dueDate: due,
    tags: [],
    labels: [],
    templateId: template.id,
    referenceType: WORKFLOW_TASK_REFERENCE,
    referenceId: runId,
    companyId: ctx.companyId,
    projectId: ctx.projectId,
    taskContextType: contextType,
    taskContextId: ctx.projectId ?? ctx.companyId,
    checklist: checklist.map((item) => ({ id: randomUUID(), text: item?.text ?? "", completed: false })),
  }));
  // notes is typed `any` in the schema, so say what comes back.
  const created = (await db.insert(schema.notes).values(rows as any).returning()) as any[];
  for (const task of created) {
    result.createdTaskIds.push(task.id);
    await notifyTaskAssignment({
      task,
      actorUserId: ctx.actor.id ?? "",
      companyId: ctx.companyId,
      actorName: `Workflow "${workflowName}"`,
    });
  }
}

async function notify(
  action: Extract<WorkflowAction, { type: "notify" }>,
  workflowName: string,
  ctx: RunContext,
  result: WorkflowRunResult,
) {
  const people = resolvePeople(action.recipient, await companyUsers(ctx.companyId));
  if (people.length === 0) throw new Error("nobody to notify (the role is empty or the person has left)");
  for (const person of people) {
    await notifyWorkflowMessage({
      userId: person.id,
      companyId: ctx.companyId,
      title: workflowName,
      message: `${action.message} (${ctx.summary})`,
      link: ctx.link,
      createdByUserId: ctx.actor.id,
    });
    result.notifiedUserIds.push(person.id);
  }
}
