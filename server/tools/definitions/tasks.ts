import { z } from "zod";
import { storage } from "../../storage";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { and, eq } from "drizzle-orm";
import type { MoradaTool } from "../types";
import { requiredString } from "./shared";

export const taskTools: MoradaTool[] = [
  {
    name: "get_tasks",
    description:
      "Get tasks for the company. Use filter='overdue' for past-due tasks, 'due_this_week' for upcoming, 'all' for both. Optionally filter to a project.",
    inputSchema: z.object({
      filter: z.enum(["overdue", "due_this_week", "all"]).optional(),
      project_id: z.string().describe("Optional: scope to one project.").optional(),
      limit: z.number().describe("Max number to return (default 20).").optional(),
    }),
    scope: "read:tasks",
    mutates: false,
    permission: { key: "tasks.manage", action: "view" },
    async handler(ctx, input) {
      const circuit = await storage.getCircuitContext(ctx.companyId);
      const filter = input.filter || "all";
      const limit = input.limit || 20;
      let tasks: any[];
      if (filter === "overdue") tasks = circuit.overdueTasks;
      else if (filter === "due_this_week") tasks = circuit.tasksDueThisWeek;
      else tasks = [...circuit.overdueTasks, ...circuit.tasksDueThisWeek];
      if (input.project_id) {
        tasks = tasks.filter((t: any) => t.projectId === input.project_id);
      }
      return { success: true, data: tasks.slice(0, limit) };
    },
  },

  {
    name: "create_task",
    description:
      "Create a new task. Use when the user asks to add or create a task, action item, or to-do.",
    inputSchema: z.object({
      title: requiredString("title").describe("Task title (required)."),
      project_id: z.string().describe("Project to attach to.").optional(),
      due_date: z.string().describe("Due date as YYYY-MM-DD.").optional(),
      assignee_name: z.string().describe("Name of person to assign to.").optional(),
    }),
    scope: "write:tasks",
    mutates: true,
    permission: { key: "tasks.manage", action: "add" },
    async handler(ctx, input) {
      const task = await storage.createNote({
        companyId: ctx.companyId,
        title: input.title,
        content: "",
        type: "task",
        status: "todo",
        projectId: input.project_id || null,
        assigneeName: input.assignee_name || null,
        dueDate: input.due_date ? new Date(input.due_date) : null,
        scope: input.project_id ? "project" : "personal",
        author: ctx.userId,
        ownerId: ctx.userId,
      } as any);
      return {
        success: true,
        data: { id: task.id, title: task.title, message: `Task "${input.title}" created.` },
      };
    },
  },

  {
    name: "update_task",
    description: "Update an existing task's status, due date, or assignee.",
    inputSchema: z.object({
      task_id: requiredString("task_id").describe("Task ID to update (required)."),
      status: z.enum(["todo", "in-progress", "done"]).optional(),
      due_date: z.string().describe("New due date as YYYY-MM-DD.").optional(),
      assignee_name: z.string().describe("New assignee name.").optional(),
    }),
    scope: "write:tasks",
    mutates: true,
    permission: { key: "tasks.manage", action: "edit" },
    async handler(ctx, input) {
      // Tenancy gate: the task id came from the model, so confirm it is ours
      // before updating it, and report a miss as "not found".
      const taskRows = await db
        .select()
        .from(schema.notes)
        .where(and(eq(schema.notes.id, input.task_id), eq(schema.notes.companyId, ctx.companyId)))
        .limit(1);
      if (!taskRows.length) return { success: false, error: "Task not found" };
      const updates: Record<string, any> = {};
      if (input.status) updates.status = input.status;
      if (input.due_date) updates.dueDate = new Date(input.due_date);
      if (input.assignee_name) updates.assigneeName = input.assignee_name;
      const updated = await storage.updateNote(input.task_id, updates);
      return { success: true, data: { id: updated?.id, message: "Task updated." } };
    },
  },
];
