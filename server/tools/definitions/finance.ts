import { z } from "zod";
import { storage } from "../../storage";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import type { MoradaTool } from "../types";
import { PROJECT_NOT_FOUND, projectBelongsToCompany, requiredString } from "./shared";

export const financeTools: MoradaTool[] = [
  {
    name: "get_bills",
    description:
      "Get bills for the company. Use status='unpaid' or 'overdue' to find outstanding amounts. Bill amounts are in cents.",
    inputSchema: z.object({
      status: z.enum(["all", "unpaid", "overdue"]).optional(),
      project_id: z.string().describe("Optional: scope to one project.").optional(),
      limit: z.number().optional(),
    }),
    scope: "read:financials",
    mutates: false,
    permission: { key: "financial.bills", action: "view" },
    async handler(ctx, input) {
      const circuit = await storage.getCircuitContext(ctx.companyId);
      let bills = circuit.unpaidBills;
      if (input.status === "overdue") bills = bills.filter((b: any) => b.daysOverdue > 0);
      if (input.project_id) {
        bills = bills.filter((b: any) => b.projectId === input.project_id);
      }
      const limit = input.limit || 20;
      return { success: true, data: bills.slice(0, limit) };
    },
  },

  {
    name: "get_client_invoices",
    description:
      "Get client invoices. Use status='overdue' for past-due, 'draft' for unsent, 'sent' for outstanding. Amounts in cents.",
    inputSchema: z.object({
      status: z.enum(["all", "overdue", "sent", "draft", "paid"]).optional(),
      project_id: z.string().describe("Optional: scope to one project.").optional(),
    }),
    scope: "read:financials",
    mutates: false,
    permission: { key: "projects.invoices", action: "view" },
    async handler(ctx, input) {
      const circuit = await storage.getCircuitContext(ctx.companyId);
      const status = input.status || "all";
      if (status === "all" || status === "overdue") {
        return { success: true, data: circuit.overdueClientInvoices };
      }
      // Joined through projects so the company filter is applied server-side.
      const rows = await db
        .select({
          id: schema.clientInvoices.id,
          invoiceNumber: schema.clientInvoices.invoiceNumber,
          name: schema.clientInvoices.name,
          totalAmount: schema.clientInvoices.totalAmount,
          status: schema.clientInvoices.status,
          dueDate: schema.clientInvoices.dueDate,
          projectName: schema.projects.name,
        })
        .from(schema.clientInvoices)
        .innerJoin(schema.projects, eq(schema.clientInvoices.projectId, schema.projects.id))
        .where(
          and(
            eq(schema.projects.companyId, ctx.companyId),
            eq(schema.clientInvoices.status, status),
            input.project_id ? eq(schema.clientInvoices.projectId, input.project_id) : undefined,
          ),
        )
        .orderBy(desc(schema.clientInvoices.createdAt))
        .limit(15);
      return { success: true, data: rows };
    },
  },

  {
    name: "get_estimates",
    description:
      "Get estimates (quotes) for a specific project. Returns estimate name, status, and total value in cents.",
    inputSchema: z.object({
      project_id: requiredString("project_id").describe("Project ID (required)."),
    }),
    scope: "read:financials",
    mutates: false,
    permission: { key: "financial.estimate", action: "view" },
    async handler(ctx, input) {
      if (!(await projectBelongsToCompany(ctx, input.project_id))) return PROJECT_NOT_FOUND;
      const estimates = await db
        .select()
        .from(schema.estimates)
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
    },
  },
];
