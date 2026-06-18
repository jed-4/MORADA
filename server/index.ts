import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startReminderProcessor } from "./utils/reminderProcessor";
import { startScheduledMessageProcessor } from "./utils/scheduledMessageProcessor";
import { startGmailBillPoller } from "./services/gmailBillPoller";
import { healContactNames } from "./utils/healContactNames";
import { storage } from "./storage";
import path from "path";
import fs from "fs";

const app = express();

// Capture raw body for Xero webhook HMAC verification before JSON parsing
// Must be registered before express.json() middleware
app.use('/api/xero/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req: Request, _res: Response, next: NextFunction) => {
  if (Buffer.isBuffer(req.body)) {
    (req as any).rawBody = req.body.toString('utf8');
    try {
      req.body = JSON.parse((req as any).rawBody);
    } catch {
      req.body = {};
    }
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Serve uploaded files (avatars, gear photos, etc.)
app.use('/uploads', express.static(path.resolve(import.meta.dirname, '..', 'uploads')));

// Set Content Security Policy — frame-ancestors * allows canvas/iframe embedding
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
    "worker-src 'self' blob:; " +
    "child-src 'self' blob:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws: wss: blob: data:; " +
    "frame-src 'self' blob:; " +
    "object-src 'self' blob:; " +
    "frame-ancestors *;"
  );
  next();
});

// Require SESSION_SECRET in production for security
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set in production');
}

// Note: Replit Auth session setup is done in registerRoutes via setupAuth()

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log the error so it still shows in deployment logs.
    console.error(`[error] ${req.method} ${req.path} -> ${status}: ${message}`, err);

    // For browser navigations to non-API routes, serve the SPA shell so the
    // user sees the React app (which will render its own error UI / login)
    // instead of a raw JSON error like `{"message":"Control plane request failed"}`.
    // API clients keep getting JSON. We require Sec-Fetch-Mode: navigate so a
    // generic `Accept: */*` non-browser client doesn't unexpectedly receive HTML.
    const isBrowserNavigation =
      req.method === "GET" &&
      req.get("sec-fetch-mode") === "navigate" &&
      !req.path.startsWith("/api") &&
      !req.path.startsWith("/uploads");

    if (isBrowserNavigation) {
      const indexPath = path.resolve(import.meta.dirname, "..", "dist", "public", "index.html");
      if (fs.existsSync(indexPath)) {
        res.status(status).sendFile(indexPath);
        return;
      }
    }

    res.status(status).json({ message });
  });

  // Serve mobile manifest with no-cache headers for PWA updates
  app.get("/mobile-manifest.json", (_req, res) => {
    const manifestPath = path.resolve(import.meta.dirname, "..", "client", "public", "mobile-manifest.json");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(manifestPath);
  });

  // Serve mobile app preview from built files
  const mobileDistPath = path.resolve(import.meta.dirname, "..", "dist", "mobile");
  if (fs.existsSync(mobileDistPath)) {
    // Serve index.html with no-cache for PWA updates
    app.get("/mobile", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(mobileDistPath, "index.html"));
    });
    app.use("/mobile", express.static(mobileDistPath, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        // Don't cache HTML files
        if (filePath.endsWith('.html')) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      }
    }));
    app.get("/mobile/*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(mobileDistPath, "index.html"));
    });
    log("Mobile app preview available at /mobile");
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);

    if (process.env.NODE_ENV === "production") {
      const missingXero = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_WEBHOOK_KEY"].filter(k => !process.env[k]);
      if (missingXero.length) {
        console.warn(`[startup] WARNING: Missing Xero env vars in production: ${missingXero.join(", ")} — Xero integration features will be unavailable or insecure.`);
      }
    }
    
    // Ensure multi-tenancy safety columns exist (additive, idempotent). The
    // deploy build does not run drizzle push, so this guarantees the company
    // scoping + trial/plan columns exist the first time production boots after
    // this hardening ships, and backfills checklist_templates.company_id.
    try {
      await storage.ensureTenancyColumns();
    } catch (error) {
      console.error('Failed to ensure tenancy columns:', error);
    }

    // Ensure the push_tokens table exists (additive, idempotent). The deploy
    // build does not run drizzle push, so this guarantees device push
    // registration/dispatch works the first time production boots this feature.
    try {
      await storage.ensurePushTokensTable();
    } catch (error) {
      console.error('Failed to ensure push_tokens table:', error);
    }

    // Auto-seed missing built-in field categories (for production databases)
    try {
      const seedResult = await storage.seedMissingBuiltInCategories();
      if (seedResult.addedCategories.length > 0 || seedResult.addedOptions.length > 0) {
        log(`Seeded missing field categories: ${seedResult.addedCategories.join(', ') || 'none'}`);
        log(`Seeded missing field options: ${seedResult.addedOptions.join(', ') || 'none'}`);
      }
    } catch (error) {
      console.error('Failed to seed missing field categories:', error);
    }
    
    startReminderProcessor(1);
    startScheduledMessageProcessor(1);
    startGmailBillPoller(5);

    // One-time data heal for trade/supplier contacts whose `name` was
    // overwritten by the old key-person fallback. Idempotent — safe to
    // run on every startup.
    healContactNames();

    // Ensure company_settings.company_id is set — this is the authoritative link
    // that scopes the bill inbox exclusively to one company. getFirstCompanyId()
    // is only used here (one-time backfill). The poller never guesses.
    try {
      const csBackfill = await storage.backfillCompanySettingsCompanyId();
      if (csBackfill.updated) log('company_settings.company_id backfilled from primary company');
    } catch (err) {
      console.error("backfillCompanySettingsCompanyId failed (non-fatal):", err);
    }

    // Keep companies.name in sync with company_settings.company_name so there
    // is a single source of truth for the company display name.
    try {
      const sync = await storage.syncCompanyName();
      if (sync.synced) log(`Company name synced to "${sync.name}"`);
    } catch (err) {
      console.error("syncCompanyName failed (non-fatal):", err);
    }

    // Backfill the role_name cache on any users whose cached value is empty.
    // This fixes visibility bugs in routes that check roleName for admin access.
    try {
      const roleHeal = await storage.healUserRoleNameCache();
      if (roleHeal.updated > 0) {
        log(`Role name cache healed: updated ${roleHeal.updated} user(s)`);
      }
    } catch (err) {
      console.error("healUserRoleNameCache failed (non-fatal):", err);
    }

    // Backfill companyId on any bills that pre-date the company-scoping migration
    try {
      const backfillResult = await storage.backfillBillsCompanyId();
      if (backfillResult.updated > 0) {
        log(`Bills backfill: stamped companyId on ${backfillResult.updated} existing bill(s)`);
      }
    } catch (err) {
      console.error("Bills companyId backfill failed (non-fatal):", err);
    }

    // Task #296: collapse purchase_order_status from 9 → 6 values.
    // Idempotent: only UPDATEs rows still on the legacy values. ALTER TYPE
    // ADD VALUE IF NOT EXISTS ensures the new enum members exist before we
    // try to write them. partially_received/completed → invoiced if a bill
    // is already linked, otherwise sent.
    try {
      const { pool } = await import("./db");
      await pool.query(`ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'invoiced'`);
      await pool.query(`ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'partially_paid'`);
      await pool.query(`ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'paid'`);
      const r1 = await pool.query(`UPDATE purchase_orders SET status='draft' WHERE status='pending_approval'`);
      const r2 = await pool.query(`UPDATE purchase_orders SET status='sent' WHERE status IN ('acknowledged','accepted')`);
      const r3 = await pool.query(`UPDATE purchase_orders SET status='invoiced' WHERE status IN ('partially_received','completed') AND matched_bill_id IS NOT NULL`);
      const r4 = await pool.query(`UPDATE purchase_orders SET status='sent' WHERE status IN ('partially_received','completed')`);
      const r5 = await pool.query(`UPDATE purchase_orders SET status='invoiced' WHERE status='billed'`);
      const moved = (r1.rowCount ?? 0) + (r2.rowCount ?? 0) + (r3.rowCount ?? 0) + (r4.rowCount ?? 0) + (r5.rowCount ?? 0);
      if (moved > 0) log(`[PO status collapse] migrated ${moved} purchase order(s) to the 6-state lifecycle`);
    } catch (err) {
      console.error("[PO status collapse] migration failed (non-fatal):", err);
    }

    // Repair any pre-existing duplicate scope stages before the unique
    // index can possibly trip on legacy rows. Idempotent — exits cheaply
    // when there are no duplicates.
    try {
      const repair = await storage.repairDuplicateScopeStages();
      if (repair.duplicatesRemoved > 0) {
        log(`Scope stages repaired: removed ${repair.duplicatesRemoved} duplicate(s) across ${repair.projectsScanned} project(s)`);
      }
    } catch (error) {
      console.error('Failed to repair duplicate scope stages:', error);
    }

    // Heal client invoices whose stored paidAmount still counts a voided
    // payment (pre-fix voids never recomputed the totals). Idempotent and
    // tightly scoped — only touches invoices where paidAmount provably came
    // from the payment rows. Exits cheaply when there is nothing to fix.
    try {
      const healed = await storage.healVoidedClientInvoicePaidAmounts();
      if (healed.fixed > 0) {
        log(`Client invoice paid amounts healed: corrected ${healed.fixed} invoice(s) with voided payments`);
      }
    } catch (error) {
      console.error('Failed to heal voided client invoice paid amounts:', error);
    }

    // Backfill / correct the cached contract price snapshot on every project
    // that has a selected estimate, recomputing it from the canonical estimate
    // summary (per-line markup + project markup + GST). Idempotent and
    // non-destructive — only updates projects.contractPrice where the cached
    // value has drifted from the canonical total. This brings historical
    // contracts (stamped by the old priceIncTax-sum path) onto the correct
    // figure without any manual re-approval.
    try {
      const snap = await storage.recomputeContractPriceSnapshots();
      if (snap.updated > 0) {
        log(`Contract price snapshots recomputed: corrected ${snap.updated} of ${snap.scanned} project(s)`);
      }
    } catch (error) {
      console.error('Failed to recompute contract price snapshots:', error);
    }
  });
})();
