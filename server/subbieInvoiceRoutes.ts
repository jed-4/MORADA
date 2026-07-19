// Subbie invoice endpoints, isolated in their own file so wiring touches the big
// routes.ts by a single registration line. Register via registerSubbieInvoiceRoutes(app).
//
// Flow the mobile app uses:
//   POST /api/projects/:projectId/subbie-invoice  → creates a draft invoice from
//        unbilled hours and returns it + a rendered PDF (base64). The app previews,
//        then hands that base64 to the existing POST /api/client-invoices/:id/send-email.

import type { Express } from "express";
import { pool } from "./db";
import { requireAuth } from "./middleware/auth";
import { generateSubbieInvoice } from "./services/subbieInvoiceService";
import { renderSubbieInvoicePdf } from "./services/subbieInvoicePdf";
import type { BillingUnit } from "@shared/subbieInvoice";

export function registerSubbieInvoiceRoutes(app: Express): void {
  // Subbie onboarding profile: tags the company as subbie tier (which the reward
  // sweep and gating target) and stores ABN / GST status / rates. day_rate and
  // is_subbie aren't in the Drizzle schema, so this writes raw.
  app.post("/api/subbie/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const companyId = req.user?.companyId || (req.session as any)?.companyId;
      if (!userId || !companyId) return res.status(401).json({ error: "Not authenticated" });

      const { abn, isGstRegistered, chargeRate, dayRate } = req.body ?? {};

      await pool.query(
        `UPDATE companies
            SET is_subbie = true,
                chosen_plan = 'subbie',
                abn = COALESCE($2, abn)
          WHERE id = $1`,
        [companyId, abn ?? null],
      );
      await pool.query(
        `UPDATE users
            SET is_gst_registered = $2,
                charge_rate = $3,
                day_rate = $4
          WHERE id = $1`,
        [userId, isGstRegistered !== false, chargeRate ?? null, dayRate ?? null],
      );

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to save profile" });
    }
  });

  app.post("/api/projects/:projectId/subbie-invoice", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const companyId = req.user?.companyId || (req.session as any)?.companyId;
      if (!userId || !companyId) return res.status(401).json({ error: "Not authenticated" });

      const {
        billingUnit, dayRateCents, dayCountOverride, clientName, clientId,
        description, startDate, endDate, dueDate, notes,
      } = req.body ?? {};

      if (billingUnit !== "hour" && billingUnit !== "day") {
        return res.status(400).json({ error: "billingUnit must be 'hour' or 'day'" });
      }
      if (!clientName || typeof clientName !== "string") {
        return res.status(400).json({ error: "clientName is required" });
      }

      const result = await generateSubbieInvoice({
        companyId,
        projectId: req.params.projectId,
        userId,
        clientName,
        clientId: clientId ?? null,
        billingUnit: billingUnit as BillingUnit,
        dayRateCents: typeof dayRateCents === "number" ? dayRateCents : undefined,
        dayCountOverride: typeof dayCountOverride === "number" ? dayCountOverride : undefined,
        description,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes,
      });

      const pdf = await renderSubbieInvoicePdf(result.pdfData);

      res.json({
        invoice: result.invoice,
        timesheetIds: result.timesheetIds,
        pdfBase64: pdf.toString("base64"),
        pdfFilename: `${result.invoice.invoiceNumber || "invoice"}.pdf`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to generate invoice" });
    }
  });
}
