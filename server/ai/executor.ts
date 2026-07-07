import { storage } from "../storage";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, not, isNull, lt, lte, gte, desc, asc } from "drizzle-orm";

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  companyId: string,
  userId: string,
  conversationId: string,
): Promise<ToolResult> {
  try {
    switch (toolName) {

      // ── READ TOOLS ──────────────────────────────────────────────────────────

      case "get_business_overview": {
        const ctx = await storage.getCircuitContext(companyId);
        return {
          success: true,
          data: {
            activeProjectCount: ctx.activeProjects.length,
            overdueTaskCount: ctx.overdueTasks.length,
            tasksDueThisWeekCount: ctx.tasksDueThisWeek.length,
            unpaidBillCount: ctx.unpaidBills.length,
            overdueInvoiceCount: ctx.overdueClientInvoices.length,
            openBlockedItemCount: ctx.openBlockedItems.length,
            leadProjectCount: ctx.leadProjects.length,
            overdueTasks: ctx.overdueTasks.slice(0, 8),
            tasksDueThisWeek: ctx.tasksDueThisWeek.slice(0, 8),
            unpaidBills: ctx.unpaidBills.slice(0, 8),
            overdueInvoices: ctx.overdueClientInvoices.slice(0, 8),
            openBlockedItems: ctx.openBlockedItems.slice(0, 5),
          },
        };
      }

      case "get_projects": {
        const ctx = await storage.getCircuitContext(companyId);
        let projects: any[] = ctx.activeProjects;
        if (input.include_leads) {
          const leads = ctx.leadProjects.map((p: any) => ({
            ...p, status: "lead", percentComplete: 0,
            startDate: null, endDate: null, clientName: null, contractCost: null,
          }));
          projects = [...projects, ...leads];
        }
        return { success: true, data: projects };
      }

      case "get_project_detail": {
        if (!input.project_id) return { success: false, error: "project_id is required" };
        const project = await db.select().from(schema.projects)
          .where(and(eq(schema.projects.id, input.project_id), eq(schema.projects.companyId, companyId)))
          .limit(1);
        if (!project.length) return { success: false, error: "Project not found" };
        const p = project[0] as any;
        // Get bills for this project
        const bills = await db.select().from(schema.bills)
          .where(and(eq(schema.bills.projectId, input.project_id), not(eq(schema.bills.status, "paid"))))
          .limit(10);
        const unpaidTotal = bills.reduce((sum: number, b: any) => sum + (b.total || 0), 0);
        return {
          success: true,
          data: {
            id: p.id,
            name: p.name,
            status: p.projectStatus,
            subStatus: p.projectSubStatus,
            percentComplete: p.percentComplete,
            startDate: p.startDate,
            endDate: p.endDate,
            contractCost: p.contractCost,
            address: p.address,
            description: p.description,
            unpaidBillTotal: unpaidTotal,
            unpaidBillCount: bills.length,
          },
        };
      }

      case "get_tasks": {
        const ctx = await storage.getCircuitContext(companyId);
        const filter = input.filter || "all";
        const limit = input.limit || 20;
        let tasks: any[];
        if (filter === "overdue") tasks = ctx.overdueTasks;
        else if (filter === "due_this_week") tasks = ctx.tasksDueThisWeek;
        else tasks = [...ctx.overdueTasks, ...ctx.tasksDueThisWeek];
        if (input.project_id) {
          tasks = tasks.filter((t: any) => t.projectId === input.project_id);
        }
        return { success: true, data: tasks.slice(0, limit) };
      }

      case "get_bills": {
        const ctx = await storage.getCircuitContext(companyId);
        let bills = ctx.unpaidBills;
        if (input.status === "overdue") bills = bills.filter((b: any) => b.daysOverdue > 0);
        if (input.project_id) {
          bills = bills.filter((b: any) => b.projectId === input.project_id);
        }
        const limit = input.limit || 20;
        return { success: true, data: bills.slice(0, limit) };
      }

      case "get_client_invoices": {
        const ctx = await storage.getCircuitContext(companyId);
        const status = input.status || "all";
        // Circuit context only has overdue. For other statuses, query directly.
        if (status === "all" || status === "overdue") {
          return { success: true, data: ctx.overdueClientInvoices };
        }
        // Query for a specific status
        const rows = await db.select().from(schema.clientInvoices)
          .innerJoin(schema.projects, eq(schema.clientInvoices.projectId, schema.projects.id))
          .where(and(
            eq(schema.projects.companyId, companyId),
            eq(schema.clientInvoices.status, status),
          ))
          .orderBy(desc(schema.clientInvoices.createdAt))
          .limit(15);
        return {
          success: true,
          data: rows.map((row: any) => ({
            id: row.client_invoices.id,
            invoiceNumber: row.client_invoices.invoiceNumber,
            name: row.client_invoices.name,
            totalAmount: row.client_invoices.totalAmount,
            status: row.client_invoices.status,
            dueDate: row.client_invoices.dueDate?.toISOString() || null,
            projectName: row.projects.name,
          })),
        };
      }

      case "get_estimates": {
        if (!input.project_id) return { success: false, error: "project_id is required" };
        const estimates = await db.select().from(schema.estimates)
          .where(eq(schema.estimates.projectId, input.project_id))
          .orderBy(desc((schema.estimates as any).createdAt));
        return {
          success: true,
          data: estimates.map((e: any) => ({
            id: e.id,
            name: e.name,
            status: e.status,
            total: e.total,
            priceIncTax: e.priceIncTax,
          })),
        };
      }

      case "get_team": {
        const users = await storage.getUsers() as any[];
        return {
          success: true,
          data: users.map((u: any) => ({
            id: u.id,
            name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
            email: u.email,
            role: u.roleName || u.role,
          })).filter((u: any) => u.name),
        };
      }

      case "get_schedule_items": {
        if (!input.project_id) return { success: false, error: "project_id is required" };
        const limit = input.limit || 20;
        // Verify project belongs to this company
        const project = await db.select().from(schema.projects)
          .where(and(eq(schema.projects.id, input.project_id), eq(schema.projects.companyId, companyId)))
          .limit(1);
        if (!project.length) return { success: false, error: "Project not found" };
        const items = await storage.getScheduleItemsByProject(input.project_id, { limit });
        return {
          success: true,
          data: (items as any[]).map((item: any) => ({
            id: item.id,
            name: item.name,
            startDate: item.startDate,
            endDate: item.endDate,
            status: item.status,
            type: item.type,
          })),
        };
      }

      case "get_blocked_items": {
        const items = await storage.getAiBlockedItems(companyId, false);
        return { success: true, data: items };
      }

      // ── WRITE TOOLS ─────────────────────────────────────────────────────────

      case "create_task": {
        if (!input.title) return { success: false, error: "title is required" };
        const task = await storage.createTask({
          companyId,
          title: input.title,
          content: "",
          type: "task",
          status: "todo",
          projectId: input.project_id || null,
          assigneeName: input.assignee_name || null,
          dueDate: input.due_date ? new Date(input.due_date) : null,
          scope: input.project_id ? "project" : "personal",
          author: userId,
          ownerId: userId,
        } as any);
        return {
          success: true,
          data: { id: task.id, title: task.title, message: `Task "${input.title}" created.` },
        };
      }

      case "update_task": {
        if (!input.task_id) return { success: false, error: "task_id is required" };
        // Verify ownership
        const taskRows = await db.select().from(schema.notes)
          .where(and(eq(schema.notes.id, input.task_id), eq(schema.notes.companyId, companyId)))
          .limit(1);
        if (!taskRows.length) return { success: false, error: "Task not found" };
        const updates: Record<string, any> = {};
        if (input.status) updates.status = input.status;
        if (input.due_date) updates.dueDate = new Date(input.due_date);
        if (input.assignee_name) updates.assigneeName = input.assignee_name;
        const updated = await storage.updateNote(input.task_id, updates);
        return {
          success: true,
          data: { id: updated?.id, message: `Task updated.` },
        };
      }

      case "log_blocked_item": {
        if (!input.description) return { success: false, error: "description is required" };
        const item = await storage.createAiBlockedItem({
          companyId, userId, conversationId,
          description: input.description,
        });
        return {
          success: true,
          data: { id: item.id, message: `Blocked item logged: "${input.description}"` },
        };
      }

      case "resolve_blocked_item": {
        if (!input.blocked_item_id) return { success: false, error: "blocked_item_id is required" };
        const item = await storage.resolveAiBlockedItem(input.blocked_item_id, companyId);
        if (!item) return { success: false, error: "Blocked item not found" };
        return { success: true, data: { id: item.id, message: "Blocked item resolved." } };
      }

      case "add_project_note": {
        if (!input.project_id || !input.title) return { success: false, error: "project_id and title are required" };
        // Verify project belongs to company
        const proj = await db.select().from(schema.projects)
          .where(and(eq(schema.projects.id, input.project_id), eq(schema.projects.companyId, companyId)))
          .limit(1);
        if (!proj.length) return { success: false, error: "Project not found" };
        const note = await storage.createNote({
          companyId,
          projectId: input.project_id,
          title: input.title,
          content: input.content || "",
          type: "memo",
          author: userId,
          status: "active",
        } as any);
        return { success: true, data: { id: note.id, message: "Note added to project." } };
      }

      case "create_site_diary_entry": {
        if (!input.project_id || !input.content) {
          return { success: false, error: "project_id and content are required" };
        }
        const proj = await db.select().from(schema.projects)
          .where(and(eq(schema.projects.id, input.project_id), eq(schema.projects.companyId, companyId)))
          .limit(1);
        if (!proj.length) return { success: false, error: "Project not found" };
        const entryDate = input.date ? new Date(input.date) : new Date();
        const entry = await storage.createNote({
          companyId,
          projectId: input.project_id,
          title: `Site Diary — ${entryDate.toLocaleDateString("en-AU")}`,
          content: input.content,
          type: "site_diary",
          author: userId,
          status: "active",
        } as any);
        return { success: true, data: { id: entry.id, message: "Site diary entry created." } };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[AI tool] ${toolName} error:`, err);
    return { success: false, error: err?.message || "Tool execution failed" };
  }
}
