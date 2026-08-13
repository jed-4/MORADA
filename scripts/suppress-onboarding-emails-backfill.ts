/**
 * RUN ONCE, BEFORE the first production deploy of the trial email sequence.
 *
 * The hourly sweep (server/services/onboardingEmails.ts) looks at every
 * company whose trial ended within the last 30 days. On a brand-new install
 * that is exactly right, but on an EXISTING database every company already
 * mid-trial or recently expired matches immediately — so the first sweep
 * after deploy would blast retroactive "your trial has ended" / "4 days left"
 * emails to people who signed up weeks ago.
 *
 * This backfill writes a log row for every pre-existing company, marking the
 * sequence as already delivered. Because delivery is gated on
 * UNIQUE(company_id, email_key), those companies are then permanently
 * suppressed and only genuinely NEW signups receive the sequence.
 *
 * Idempotent (ON CONFLICT DO NOTHING) — safe to re-run.
 *
 * Usage (against prod, with prod DATABASE_URL):
 *   npx tsx --env-file=.env scripts/suppress-onboarding-emails-backfill.ts
 *   npx tsx ... scripts/suppress-onboarding-emails-backfill.ts --dry-run
 */

import { pool } from "../server/db";
import { ensureOnboardingEmailTable } from "../server/services/onboardingEmails";

const KEYS = ["welcome", "tips_day3", "trial_ending", "trial_ended"] as const;
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const host = (process.env.DATABASE_URL || "").match(/@([^/]+)\//)?.[1] ?? "unknown";
  console.log(`[backfill] target host: ${host}`);
  console.log(`[backfill] mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`);

  await ensureOnboardingEmailTable();

  // Every company that exists right now. We suppress the whole sequence for
  // all of them — a company created before this deploy should never receive
  // a lifecycle email about a trial it started before the feature existed.
  const { rows: companies } = await pool.query(
    `SELECT c.id, c.name, u.email AS owner_email
       FROM companies c
       LEFT JOIN users u ON u.id = c.owner_id`,
  );

  console.log(`[backfill] existing companies: ${companies.length}`);

  if (dryRun) {
    const { rows: atRisk } = await pool.query(
      `SELECT count(*) AS c
         FROM companies
        WHERE trial_ends_at IS NOT NULL
          AND owner_id IS NOT NULL
          AND COALESCE(plan_status, '') IN ('trialing', 'trial', 'expired')
          AND trial_ends_at > now() - interval '30 days'`,
    );
    console.log(
      `[backfill] of those, ${atRisk[0].c} would receive an email on the first sweep if NOT suppressed`,
    );
    console.log("[backfill] dry run complete — no rows written");
    await pool.end();
    return;
  }

  let inserted = 0;
  for (const company of companies) {
    for (const key of KEYS) {
      const res = await pool.query(
        `INSERT INTO onboarding_email_log (company_id, email_key, to_email)
         VALUES ($1, $2, $3)
         ON CONFLICT (company_id, email_key) DO NOTHING`,
        [company.id, key, company.owner_email ?? "backfill-suppressed"],
      );
      inserted += res.rowCount ?? 0;
    }
  }

  console.log(`[backfill] suppression rows written: ${inserted}`);
  console.log("[backfill] done — only companies created AFTER this point will receive the sequence");
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
