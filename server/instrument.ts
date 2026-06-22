// Sentry initialization for the Express backend.
//
// This module is imported as the very FIRST import in server/index.ts so that
// Sentry's auto-instrumentation (HTTP, Express, tracing) can hook into the
// runtime before any other module is loaded.
//
// Initialization is a no-op when SENTRY_DSN is unset, so local development
// without a DSN runs cleanly.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    // A release identifier lets issues be filtered by build. Replit sets
    // REPLIT_DEPLOYMENT_ID on deployed instances; fall back to an explicit
    // SENTRY_RELEASE when provided at build time.
    release:
      process.env.SENTRY_RELEASE ||
      process.env.REPLIT_DEPLOYMENT_ID ||
      undefined,
    // Performance tracing: sample everything in dev, a sane fraction in prod.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Do not attach PII (cookies, request bodies, user IPs) by default.
    sendDefaultPii: false,
  });
}
