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
export const db = drizzle({ client: pool, schema });
