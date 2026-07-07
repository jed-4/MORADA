import { storage } from "../storage";

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
        let projects: any[] = [...ctx.activeProjects];
        if (input.status && input.status !== "all") {
          projects = projects.filter(p => p.status === input.status);
        }
        if (input.include_leads) {
          const leads = ctx.leadProjects.map(p => ({
            ...p, status: "lead", percentComplete: 0,
            startDate: null, endDate: null, clientName: null, contractCost: null,
          }));
          projects = [...projects, ...leads];
        }
        return { success: true, data: projects };
      }

      case "get_tasks": {
        const ctx = await storage.getCircuitContext(companyId);
        const filter = input.filter || "all";
        let tasks: any[];
        if (filter === "overdue") tasks = ctx.overdueTasks;
        else if (filter === "due_this_week") tasks = ctx.tasksDueThisWeek;
        else tasks = [...ctx.overdueTasks, ...ctx.tasksDueThisWeek];
        if (input.project_id) {
          tasks = tasks.filter((t: any) => t.projectId === input.project_id);
        }
        return { success: true, data: tasks };
      }

      case "get_bills": {
        const ctx = await storage.getCircuitContext(companyId);
        let bills = ctx.unpaidBills;
        if (input.status === "overdue") bills = bills.filter(b => b.daysOverdue > 0);
        if (input.project_id) {
          bills = bills.filter((b: any) => b.projectId === input.project_id);
        }
        return { success: true, data: bills };
      }

      case "get_client_invoices": {
        const ctx = await storage.getCircuitContext(companyId);
        let invoices = ctx.overdueClientInvoices;
        if (input.status && input.status !== "all" && input.status !== "overdue") {
          invoices = [];
        }
        return { success: true, data: invoices };
      }

      case "get_blocked_items": {
        const items = await storage.getAiBlockedItems(companyId, false);
        return { success: true, data: items };
      }

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

      case "log_blocked_item": {
        if (!input.description) return { success: false, error: "description is required" };
        const item = await storage.createAiBlockedItem({
          companyId,
          userId,
          conversationId,
          description: input.description,
        });
        return {
          success: true,
          data: { id: item.id, message: `Blocked item logged: "${input.description}"` },
        };
      }

      case "create_site_diary_entry": {
        if (!input.project_id || !input.content) {
          return { success: false, error: "project_id and content are required" };
        }
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
        return {
          success: true,
          data: { id: entry.id, message: "Site diary entry created." },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[AI tool] ${toolName} error:`, err);
    return { success: false, error: err?.message || "Tool execution failed" };
  }
}
