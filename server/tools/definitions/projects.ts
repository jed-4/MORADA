import { z } from "zod";
import { storage } from "../../storage";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { and, eq, not } from "drizzle-orm";
import type { MoradaTool } from "../types";
import { requiredString } from "./shared";

export const projectTools: MoradaTool[] = [
  {
    name: "get_business_overview",
    description:
      "Get a live snapshot of the business: active project count, overdue tasks, unpaid bills, overdue client invoices, and open blocked items. Use this to orient before answering broad questions.",
    inputSchema: z.object({}),
    scope: "read:projects",
    mutates: false,
    permission: { key: "dashboard.overview", action: "view" },
    async handler(ctx) {
      const circuit = await storage.getCircuitContext(ctx.companyId);
      return {
        success: true,
        data: {
          activeProjectCount: circuit.activeProjects.length,
          overdueTaskCount: circuit.overdueTasks.length,
          tasksDueThisWeekCount: circuit.tasksDueThisWeek.length,
          unpaidBillCount: circuit.unpaidBills.length,
          overdueInvoiceCount: circuit.overdueClientInvoices.length,
          openBlockedItemCount: circuit.openBlockedItems.length,
          leadProjectCount: circuit.leadProjects.length,
          overdueTasks: circuit.overdueTasks.slice(0, 8),
          tasksDueThisWeek: circuit.tasksDueThisWeek.slice(0, 8),
          unpaidBills: circuit.unpaidBills.slice(0, 8),
          overdueInvoices: circuit.overdueClientInvoices.slice(0, 8),
          openBlockedItems: circuit.openBlockedItems.slice(0, 5),
        },
      };
    },
  },

  {
    name: "get_projects",
    description:
      "List active projects with name, status, progress percentage, start/end dates, and contract cost in cents. Pass include_leads=true to also return pipeline/lead projects.",
    inputSchema: z.object({
      include_leads: z.boolean().describe("Include pipeline/lead projects.").optional(),
    }),
    scope: "read:projects",
    mutates: false,
    permission: { key: "projects.view", action: "view" },
    async handler(ctx, input) {
      const circuit = await storage.getCircuitContext(ctx.companyId);
      let projects: any[] = circuit.activeProjects;
      if (input.include_leads) {
        const leads = circuit.leadProjects.map((p: any) => ({
          ...p,
          status: "lead",
          percentComplete: 0,
          startDate: null,
          endDate: null,
          clientName: null,
          contractCost: null,
        }));
        projects = [...projects, ...leads];
      }
      return { success: true, data: projects };
    },
  },

  {
    name: "get_project_detail",
    description:
      "Get detailed information about a specific project including financials, progress, contacts, and schedule summary.",
    inputSchema: z.object({
      project_id: requiredString("project_id").describe("The project ID to look up."),
    }),
    scope: "read:projects",
    mutates: false,
    permission: { key: "projects.view", action: "view" },
    async handler(ctx, input) {
      const project = await db
        .select()
        .from(schema.projects)
        .where(
          and(eq(schema.projects.id, input.project_id), eq(schema.projects.companyId, ctx.companyId)),
        )
        .limit(1);
      if (!project.length) return { success: false, error: "Project not found" };
      const p = project[0] as any;
      const bills = await db
        .select()
        .from(schema.bills)
        .where(
          and(eq(schema.bills.projectId, input.project_id), not(eq(schema.bills.status, "paid"))),
        )
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
    },
  },

  {
    name: "get_team",
    description: "Get team members of this company and their roles.",
    inputSchema: z.object({}),
    scope: "read:projects",
    mutates: false,
    permission: { key: "business.team", action: "view" },
    async handler(ctx) {
      const users = (await storage.getUsersByCompanyWithRoles(ctx.companyId)) as any[];
      return {
        success: true,
        data: users
          .map((u: any) => ({
            id: u.id,
            name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
            email: u.email,
            role: u.roleName || u.role,
          }))
          .filter((u: any) => u.name),
      };
    },
  },
];
