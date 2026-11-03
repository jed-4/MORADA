// Operations workflows: "when X happens, do Y". Shared by the builder UI and
// the engine (server/services/workflowEngine.ts) so both read one shape.
//
// A workflow is one trigger and an ordered list of actions. Every firing is a
// row in workflow_runs keyed by (workflow, event key); the event key is what
// makes a firing happen once. See WORKFLOW_TRIGGERS for what each key is.

import { z } from "zod";

export const PROJECT_PHASES = [
  { value: "lead", label: "Lead" },
  { value: "pre_construction", label: "Pre-construction" },
  { value: "construction", label: "Construction" },
  { value: "post_construction", label: "Post-construction" },
] as const;

export const WORKFLOW_TRIGGERS = {
  // A project's detailed status becomes `statusKey`. Once per project per
  // status: moving away and back does not fire again.
  project_status: "A project moves to a status",
  // A project enters a phase (Lead, Pre-construction, …). Once per project
  // per phase.
  project_phase: "A project enters a phase",
  // A To-Do made from `taskTemplateId` is marked done. Once per To-Do.
  task_completed: "A task is completed",
  // A Library document is approved: a given doc, any doc of `docType`, or
  // any doc. Once per approved version.
  doc_approved: "A document is approved",
  // Someone presses Run, on a project or for the business. Every press runs.
  manual: "Run by hand",
} as const;
export type WorkflowTriggerType = keyof typeof WORKFLOW_TRIGGERS;
export const WORKFLOW_TRIGGER_TYPES = Object.keys(WORKFLOW_TRIGGERS) as [WorkflowTriggerType, ...WorkflowTriggerType[]];

export const workflowTriggerConfigSchema = z.object({
  statusKey: z.string().optional(),
  phase: z.enum(["lead", "pre_construction", "construction", "post_construction"]).optional(),
  taskTemplateId: z.string().optional(),
  docId: z.string().optional(),
  docType: z.string().optional(),
}).strict();
export type WorkflowTriggerConfig = z.infer<typeof workflowTriggerConfigSchema>;

// Who an action is for. "template" = whoever the task template is assigned
// to (role fans out to everyone in it, like the recurring generator).
export const workflowAssigneeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("template") }),
  z.object({ type: z.literal("role"), roleId: z.string().min(1) }),
  z.object({ type: z.literal("user"), userId: z.string().min(1) }),
]);
export type WorkflowAssignee = z.infer<typeof workflowAssigneeSchema>;

export const workflowActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    taskTemplateId: z.string().min(1),
    // Due this many days after the trigger (0 = same day). Never negative,
    // so a task is never born overdue.
    offsetDays: z.number().int().min(0).max(365).default(0),
    assignee: workflowAssigneeSchema.default({ type: "template" }),
  }),
  z.object({
    type: z.literal("notify"),
    recipient: workflowAssigneeSchema.refine((a) => a.type !== "template", "Pick a role or a person"),
    message: z.string().trim().min(1).max(500),
  }),
]);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export const workflowActionsSchema = z.array(workflowActionSchema).max(20);

export type WorkflowRunResult = {
  createdTaskIds: string[];
  notifiedUserIds: string[];
  errors: string[];
};
