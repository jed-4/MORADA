// Must be the very first import so Sentry can instrument the runtime before
// any other module loads. No-op when SENTRY_DSN is unset.
import { sentryEnabled } from "./instrument";
import * as Sentry from "@sentry/node";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startReminderProcessor } from "./utils/reminderProcessor";
import { startScheduledMessageProcessor } from "./utils/scheduledMessageProcessor";
import { startGmailBillPoller } from "./services/gmailBillPoller";
import { healContactNames } from "./utils/healContactNames";
import { ensureReferralTables, processReferralCredits } from "./referrals";
import { storage } from "./storage";
import { setEstimateTotalIntegrityReporter } from "@shared/pricing";
import path from "path";
import fs from "fs";

// Wire the estimate total-integrity invariant to error monitoring. When an
// estimate's grand total diverges from the sum of its per-line totals (the
// structural symptom of a stale cached line price), surface it loudly to
// Sentry (and the logs) instead of quietly displaying a wrong number. This is
// a no-op signal when Sentry is not configured — it still logs.
setEstimateTotalIntegrityReporter(({ estimateId, expectedTotal, actualTotal, diff }) => {
  const message = `[estimate-integrity] total mismatch estimate=${estimateId ?? "unknown"} expected=${expectedTotal} actual=${actualTotal} diff=${diff}`;
  console.error(message);
  if (sentryEnabled) {
    Sentry.captureMessage(message, {
      level: "error",
      tags: { area: "estimate-pricing", estimateId: estimateId ?? "unknown" },
      extra: { estimateId, expectedTotal, actualTotal, diff },
    });
  }
});

// Catch async errors that escape the request context entirely (e.g. AggregateError
// from connection pool failures on unmatched routes). Without this, Node prints
// an unhandled rejection warning and Sentry never sees a structured event.
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[unhandledRejection]", err);
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: { type: "unhandledRejection" } });
  }
});

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

// Stripe webhook — must receive the raw body for signature verification, so it
// is mounted BEFORE express.json(). No-op (200) when Stripe is not configured
// so the app boots and Stripe can ping without keys present.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const { getStripe, getStripeWebhookSecret } = await import('./stripe');
  const { handleStripeEvent } = await import('./stripeWebhook');
  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    return res.status(200).json({ received: true, skipped: 'stripe_not_configured' });
  }
  const sigHeader = req.headers['stripe-signature'];
  if (!sigHeader) return res.status(400).json({ error: 'Missing stripe-signature header' });
  const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', (err as Error).message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }
  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error('[stripe webhook] handler error (non-fatal):', err);
  }
  return res.json({ received: true });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Never let a browser cache an API response.
//
// Express attaches an ETag to every JSON response but sets NO Cache-Control.
// A response with no Cache-Control and no Expires is "heuristically cacheable"
// (RFC 9111 §4.2.2): the browser is free to reuse it WITHOUT revalidating, for
// a duration it invents. That produces the worst kind of bug — approve a
// timesheet, reload the page, and still see the old status, with no error and
// no way to tell the data is stale. It resolves itself minutes later, so it
// looks like "the server was slow" rather than a cache.
//
// This is also why useAuth (shared/useAuth.ts) hand-rolls `cache: 'no-store'`
// and a 304 branch — a per-endpoint workaround for a problem every endpoint
// has. Fixing it here covers all of them and lets those workarounds retire.
//
// no-store (not no-cache) because these responses are per-user and carry
// financial data: don't write them to disk at all. We lose 304 revalidation,
// which is a fine trade — correctness beats a few KB on a page that already
// waits on a cross-Pacific database round trip.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Serve uploaded files (avatars, gear photos, etc.)
app.use('/uploads', express.static(path.resolve(import.meta.dirname, '..', 'uploads')));

// Set Content Security Policy — frame-ancestors * allows canvas/iframe embedding
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://client.crisp.chat; " +
    "worker-src 'self' blob:; " +
    "child-src 'self' blob:; " +
    "style-src 'self' 'unsafe-inline' https://client.crisp.chat; " +
    "img-src 'self' data: blob: https://client.crisp.chat https://image.crisp.chat https://api.qrserver.com; " +
    "font-src 'self' data: https://client.crisp.chat; " +
    "connect-src 'self' ws: wss: blob: data: https://client.crisp.chat wss://client.relay.crisp.chat; " +
    "frame-src 'self' blob: https://client.crisp.chat; " +
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

    // Report genuine server errors (5xx) to Sentry, stamped with the user and
    // company that hit them so we know which customer was affected. We skip 4xx
    // (validation / permission / not-found) since those are expected client
    // errors, not actionable bugs. withScope keeps the user + company context
    // scoped to this single event so it never leaks across requests.
    if (sentryEnabled && status >= 500) {
      Sentry.withScope((scope) => {
        const u = (req as any).user;
        if (u) {
          scope.setUser({ id: u.id, email: u.email });
          if (u.companyId) scope.setTag("company_id", u.companyId);
        }
        scope.setTag("path", req.path);
        scope.setContext("request", { method: req.method, path: req.path });
        Sentry.captureException(err);
      });
    }

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

  // Expo Go QR code page — rendered under /api/ so Vite's dev middleware
  // never intercepts and injects the React SPA entry point into this HTML.
  // Only available in development; returns 404 in production.
  app.get("/api/expo-qr", (req, res) => {
    if (app.get("env") !== "development") return res.status(404).end();
    const tunnelUrl = "exp://ltskb44-jed4-8081.exp.direct";
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=20&data=${encodeURIComponent(tunnelUrl)}`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Expo Go QR</title>
<style>
  body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#fff;font-family:sans-serif;gap:16px}
  img{width:320px;height:320px;border-radius:8px}
  p{color:#555;font-size:14px;text-align:center;max-width:320px}
  code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:12px;word-break:break-all}
</style></head><body>
  <img src="${qrImg}" alt="Expo Go QR code" />
  <p>Scan with <strong>Expo Go</strong> (Android) or the <strong>Camera app</strong> (iOS)</p>
  <code>${tunnelUrl}</code>
</body></html>`);
  });

  // Explicit sitemap — bots and crawlers get a clean 200 with a valid empty
  // sitemap instead of falling through to the SPA catch-all and triggering
  // an unhandled AggregateError rejection path.
  app.get("/sitemap.xml", (_req, res) => {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
    );
  });

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
    // reusePort is Linux-only; macOS throws ENOTSUP
    ...(process.platform === "linux" ? { reusePort: true } : {}),
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

    // Ensure the circuit_* tables exist (additive, idempotent). The deploy
    // build does not run drizzle push, so this guarantees the Circuit AI chat
    // widget works the first time production boots this feature.
    try {
      await storage.ensureCircuitTables();
    } catch (error) {
      console.error('Failed to ensure circuit tables:', error);
    }

    // Ensure the AI assistant tables exist (additive, idempotent).
    try {
      await storage.ensureAiTables();
    } catch (error) {
      console.error('Failed to ensure AI tables:', error);
    }

    // Ensure the suggestions table + users.is_platform_staff column exist
    // (additive, idempotent). The deploy build does not run drizzle push, so
    // this guarantees the suggestion box works the first time production boots
    // this feature.
    try {
      await storage.ensureSuggestionsTable();
    } catch (error) {
      console.error('Failed to ensure suggestions table:', error);
    }

    // Ensure the task_comments table exists (additive, idempotent). The deploy
    // build does not run drizzle push, so this guarantees the task comment
    // thread works the first time production boots this feature.
    try {
      await storage.ensureTaskCommentsTable();
    } catch (error) {
      console.error('Failed to ensure task_comments table:', error);
    }

    // Ensure the task_activity table exists (additive, idempotent). Powers the
    // auto-generated activity lines merged into the task comment feed.
    try {
      await storage.ensureTaskActivityTable();
    } catch (error) {
      console.error('Failed to ensure task_activity table:', error);
    }

    // Ensure the referral columns + referral_credits table exist (additive,
    // idempotent). The deploy build does not run drizzle push, so this
    // guarantees the referral system works the first time production boots
    // this feature.
    try {
      await ensureReferralTables();
    } catch (error) {
      console.error('Failed to ensure referral tables:', error);
    }

    // Ensure thumbnail_x/thumbnail_y columns exist on all attachment tables
    // (additive, idempotent). Powers the focal point picker feature.
    try {
      await storage.ensureFocalPointColumns();
    } catch (error) {
      console.error('Failed to ensure focal point columns:', error);
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

    // Xero push outbox worker: retries failed bill pushes in the background.
    const { startXeroPushWorker } = await import("./services/xeroPushWorker");
    startXeroPushWorker(45);

    // Nightly reconcile: backstop for missed webhooks. Auto-applies safe drift,
    // notifies on surprises.
    const { startXeroReconcileScheduler } = await import("./services/xeroReconcileScheduler");
    startXeroReconcileScheduler();

    // Trial-expiry sweep: flip lapsed 'trialing' companies to 'expired'.
    // Runs once on boot and hourly thereafter. Guarded so a failure never
    // takes down startup.
    const trialExpirySweep = async () => {
      try {
        const r = await storage.expireLapsedTrials();
        if (r.expired > 0) log(`[billing] expired ${r.expired} lapsed trial(s)`);
      } catch (err) {
        console.error('[billing] trial expiry sweep failed (non-fatal):', err);
      }
    };
    trialExpirySweep();
    setInterval(trialExpirySweep, 60 * 60 * 1000);

    // Referral-credit sweep: issues pending referral credits past their 7-day
    // hold (after re-checking the referee's invoice wasn't refunded). Runs
    // hourly alongside the trial sweep. No-op while Stripe is unconfigured.
    const referralCreditSweep = async () => {
      try {
        const r = await processReferralCredits();
        if (r.issued > 0 || r.cancelled > 0) {
          log(`[referrals] issued ${r.issued} credit(s), cancelled ${r.cancelled}`);
        }
      } catch (err) {
        console.error('[referrals] credit sweep failed (non-fatal):', err);
      }
    };
    referralCreditSweep();
    setInterval(referralCreditSweep, 60 * 60 * 1000);

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
