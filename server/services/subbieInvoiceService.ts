// Subbie invoice orchestrator — turns unbilled tracked hours into a draft invoice.
//
// Flow: pull the project's un-invoiced timesheets → compute lines/totals via the
// pure module (shared/subbieInvoice.ts) → persist invoice + items → link the
// source timesheets and mark them invoiced. GST behaviour is driven entirely by
// the subbie's users.is_gst_registered flag.
//
// ⚠️ NOT yet runtime-tested against the DB (built offline). Verify in Replit:
//   - the two spots marked [VERIFY] below (charge-rate source; invoice numbering)
//   - that server/migrations/subbieTierColumns.ts has run (adds day_rate + quantity_decimal)

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import * as schema from "@shared/schema";
import { dollarsToCents, formatCents, timesheetHours, type Cents } from "@shared/money";
import { computeSubbieInvoice, type BillingUnit } from "@shared/subbieInvoice";
import type { SubbieInvoicePdfData } from "./subbieInvoicePdf";

export interface GenerateSubbieInvoiceInput {
  companyId: string;
  projectId: string;
  /** The subbie (owner) whose GST status + charge/day rate apply. */
  userId: string;
  /** Display name of the builder/client being billed. */
  clientName: string;
  /** Optional link to a users row, if the client exists as one. */
  clientId?: string | null;
  billingUnit: BillingUnit;
  /** EX-GST cents. Required in day mode; falls back to users.day_rate if omitted. */
  dayRateCents?: Cents;
  /** Optional half-day-step override of the computed day count. */
  dayCountOverride?: number;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  /** Defaults to today. */
  invoiceDate?: Date;
  dueDate?: Date;
  notes?: string;
}

export interface GenerateSubbieInvoiceResult {
  invoice: schema.ClientInvoice;
  timesheetIds: string[];
  pdfData: SubbieInvoicePdfData;
}

/** EX-GST cents charged to the client for one tracked row. */
function chargeRateCentsFor(
  ts: schema.Timesheet,
  userChargeRate: string | null | undefined,
): Cents {
  // [VERIFY] Prefer a per-row charge rate if the prod schema has one
  // (Replit reported timesheets.charge_rate_cents); else the user's charge
  // rate; else fall back to the pay rate stored on the row.
  const perRow = (ts as any).chargeRateCents;
  if (typeof perRow === "number" && perRow > 0) return perRow;
  if (userChargeRate != null && userChargeRate !== "") return dollarsToCents(userChargeRate);
  return dollarsToCents(ts.hourlyRate);
}

/** Next per-company invoice number, e.g. INV-1001. [VERIFY] no shared generator existed. */
async function nextInvoiceNumber(companyId: string): Promise<string> {
  const rows = await db
    .select({ invoiceNumber: schema.clientInvoices.invoiceNumber })
    .from(schema.clientInvoices)
    .where(eq(schema.clientInvoices.companyId, companyId));
  let max = 1000;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(r.invoiceNumber ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${max + 1}`;
}

export async function generateSubbieInvoice(
  input: GenerateSubbieInvoiceInput,
): Promise<GenerateSubbieInvoiceResult> {
  // 1. Load the subbie (GST status + rates) and their business identity.
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId));
  if (!user) throw new Error("Subbie user not found");
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, input.companyId));
  if (!company) throw new Error("Company not found");

  const gstRegistered = user.isGstRegistered !== false;

  // 2. Resolve the day rate (day mode): explicit → users.day_rate. Read raw —
  //    day_rate isn't in the Drizzle schema, so db.select() won't return it.
  let dayRateCents = input.dayRateCents;
  if (input.billingUnit === "day" && (dayRateCents == null || dayRateCents <= 0)) {
    try {
      const r = await pool.query(`SELECT day_rate FROM users WHERE id = $1`, [input.userId]);
      const dr = r.rows?.[0]?.day_rate;
      if (dr != null && dr !== "") dayRateCents = dollarsToCents(dr);
    } catch {
      // column not present yet — caller must pass dayRateCents explicitly
    }
    if (dayRateCents == null || dayRateCents <= 0) {
      throw new Error("A day rate is required to bill by the day — set one on your profile or pass it in");
    }
  }

  // 3. Pull un-invoiced timesheets for this job (optionally date-bounded, this subbie only).
  const timesheets = await storage.getTimesheets(input.projectId, {
    invoiced: false,
    userId: input.userId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (timesheets.length === 0) throw new Error("No unbilled hours to invoice for this job");

  // 4. Compute lines + totals (pure).
  const entries = timesheets.map((ts) => ({
    date: ts.date,
    hours: timesheetHours(ts),
    chargeRateCents: chargeRateCentsFor(ts, user.chargeRate),
  }));
  const computed = computeSubbieInvoice(entries, {
    billingUnit: input.billingUnit,
    dayRateCents,
    gstRegistered,
    description: input.description,
    dayCountOverride: input.dayCountOverride,
  });
  if (computed.lines.length === 0) throw new Error("Nothing billable after computing lines");

  // 5. Persist the invoice header.
  const invoiceDate = input.invoiceDate ?? new Date();
  const invoiceNumber = await nextInvoiceNumber(input.companyId);
  const invoice = await storage.createClientInvoice({
    invoiceNumber,
    companyId: input.companyId,
    name: `${input.description?.trim() || "Carpentry"} — ${invoiceNumber}`,
    projectId: input.projectId,
    clientId: input.clientId ?? null,
    invoiceDate,
    dueDate: input.dueDate,
    invoicingMethod: "cost_plus",
    subtotal: computed.subtotalExGstCents,
    markupAmount: 0,
    gstAmount: computed.gstCents,
    totalAmount: computed.totalIncGstCents,
    paidAmount: 0,
    balanceAmount: computed.totalIncGstCents,
    status: "draft",
    showAmountsIncTax: gstRegistered,
    notes: input.notes,
  } as schema.InsertClientInvoice);

  // 6. Persist line items. quantity is an INTEGER column and can't hold 7.5 — we
  //    store the fractional value in quantity_decimal (added by the migration) and
  //    keep the integer column as a rounded shadow for legacy readers.
  let sortOrder = 0;
  for (const line of computed.lines) {
    const item = await storage.createClientInvoiceItem({
      invoiceId: invoice.id,
      description: line.description,
      quantity: Math.max(1, Math.round(line.quantity)),
      unitPrice: line.unitPriceCents,
      totalPrice: line.totalPriceCents,
      taxable: line.taxable,
      unit: line.unit === "day" ? "day" : "hr",
      sortOrder: sortOrder++,
    } as schema.InsertClientInvoiceItem);
    try {
      await db.execute(
        sql`update client_invoice_items set quantity_decimal = ${line.quantity} where id = ${item.id}`,
      );
    } catch {
      // Column not present yet — legacy integer quantity still holds a sane value.
    }
  }

  // 7. Link the source timesheets and mark them invoiced (so they can't double-bill).
  const timesheetIds: string[] = [];
  for (const ts of timesheets) {
    try {
      await storage.createInvoiceTimesheet({ invoiceId: invoice.id, timesheetId: ts.id } as schema.InsertInvoiceTimesheet);
    } catch {
      // junction may already exist; ignore
    }
    await storage.updateTimesheet(ts.id, { invoiced: true } as Partial<schema.InsertTimesheet>);
    timesheetIds.push(ts.id);
  }

  // 8. Assemble the presentation-ready data the PDF renderer expects.
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  const pdfData: SubbieInvoicePdfData = {
    documentLabel: computed.documentLabel,
    gstRegistered,
    business: { name: company.name, abn: company.abn, email: user.email, phone: (user as any).phone ?? null },
    client: { name: input.clientName },
    invoiceNumber,
    invoiceDate: fmtDate(invoiceDate),
    dueDate: input.dueDate ? fmtDate(input.dueDate) : null,
    lines: computed.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      totalPriceCents: l.totalPriceCents,
    })),
    subtotalExGstCents: computed.subtotalExGstCents,
    gstCents: computed.gstCents,
    totalIncGstCents: computed.totalIncGstCents,
    notes: input.notes ?? null,
  };

  return { invoice, timesheetIds, pdfData };
}

/** Small convenience for logs / responses. */
export function summariseInvoice(r: GenerateSubbieInvoiceResult): string {
  return `${r.invoice.invoiceNumber}: ${formatCents(r.pdfData.totalIncGstCents)} (${r.timesheetIds.length} timesheets)`;
}
