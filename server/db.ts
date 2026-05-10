import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Startup safety log (#225 — publish data-loss investigation):
// Print the host + database name (NEVER credentials) so deployment logs
// always show which Neon endpoint the running instance is bound to. If
// the deployed app silently swaps to a different DB on a republish (a
// suspected root cause of past "half the data disappears" incidents),
// this line in the deploy logs will reveal it immediately.
try {
  const u = new URL(process.env.DATABASE_URL);
  const dbName = u.pathname.replace(/^\//, "") || "(default)";
  // u.hostname encodes the Neon project + branch — safe to log; password is on u.password.
  console.log(`[DB] connected — host=${u.hostname} db=${dbName} env=${process.env.NODE_ENV ?? "unknown"}`);
} catch {
  // If DATABASE_URL is malformed we still want the app to fail loudly via the Pool,
  // so swallow parse errors here rather than crash on the log line.
  console.warn("[DB] could not parse DATABASE_URL for startup log");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Retry transient Neon control-plane / connection errors. These are
// short-lived infrastructure blips on Neon's side (control plane suspend/
// resume, transient permit exhaustion) that almost always clear within a
// second. Without retries, a single blip surfaces as a 500 to the user —
// including raw JSON in the browser if they happened to be loading a page.
//
// SAFETY: We split errors into two buckets so we never silently double-
// apply a mutation:
//   - PRE_EXECUTION: failure happened before the query reached Postgres,
//     so retrying is safe for ANY statement (read or write).
//   - AMBIGUOUS: connection dropped after the query was sent — the
//     statement may or may not have committed. Only safe to retry for
//     read-only (SELECT/EXPLAIN/SHOW) queries. NOTE: `WITH` CTEs are
//     deliberately excluded — Postgres allows data-modifying CTEs
//     (`WITH x AS (INSERT/UPDATE/DELETE ... RETURNING) SELECT ...`) so
//     we cannot safely classify a leading `WITH` as read-only.
const PRE_EXECUTION_ERROR_PATTERNS = [
  /control plane request failed/i,
  /failed to acquire permit/i,
  /too many database connection attempts/i,
];
const AMBIGUOUS_ERROR_PATTERNS = [
  /connection terminated unexpectedly/i,
  /terminating connection due to administrator command/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
];
const RETRY_DELAYS_MS = [100, 300, 800];
const READ_ONLY_STATEMENT = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(select|explain|show)\b/i;

function classifyError(err: unknown): "pre_execution" | "ambiguous" | "fatal" {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (PRE_EXECUTION_ERROR_PATTERNS.some((re) => re.test(msg))) return "pre_execution";
  if (AMBIGUOUS_ERROR_PATTERNS.some((re) => re.test(msg))) return "ambiguous";
  return "fatal";
}

function isReadOnlyQuery(args: any[]): boolean {
  // pool.query supports either (text, params) or ({ text, ... }) forms.
  const first = args[0];
  const text = typeof first === "string" ? first : (first && typeof first === "object" ? first.text : "");
  return typeof text === "string" && READ_ONLY_STATEMENT.test(text);
}

const originalQuery = pool.query.bind(pool) as (...args: any[]) => Promise<any>;
(pool as any).query = async function patchedQuery(...args: any[]) {
  let lastErr: unknown;
  const readOnly = isReadOnlyQuery(args);
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await originalQuery(...args);
    } catch (err) {
      lastErr = err;
      const cls = classifyError(err);
      const retriable = cls === "pre_execution" || (cls === "ambiguous" && readOnly);
      if (attempt === RETRY_DELAYS_MS.length || !retriable) {
        throw err;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[DB] transient ${cls} error (attempt ${attempt + 1}, ${readOnly ? "read" : "write"}), retrying in ${delay}ms: ${(err as Error)?.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
};

export const db = drizzle({ client: pool, schema });
