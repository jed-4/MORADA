// Subbie tier schema safety net — additive, idempotent (deploy runs no migrations,
// same pattern as ensureReferralTables in server/referrals.ts). Call once at boot.
//
// Adds:
//   users.day_rate                       — optional day rate (dollars, ex-GST) the
//                                           subbie can bill by at invoice time
//   client_invoice_items.quantity_decimal — fractional qty (7.5 hrs / 3.5 days);
//                                           the legacy `quantity` column is integer
//   companies.is_subbie                  — flags the subbie tier (set at mobile
//                                           signup) so the reward sweep can target it
//   companies.subbie_reward_earned_at    — action reward: job + invoice within 3 days
//   companies.subbie_reward_email_sent_at — "free month unlocked" email sent once
//   companies.subbie_reward_granted_at   — free-month Stripe credit applied once

import { pool } from "./db";

export async function ensureSubbieTierColumns(): Promise<void> {
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS day_rate numeric(10,2)`,
  );
  await pool.query(
    `ALTER TABLE client_invoice_items ADD COLUMN IF NOT EXISTS quantity_decimal numeric(10,2)`,
  );
  await pool.query(
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_subbie boolean NOT NULL DEFAULT false`,
  );
  await pool.query(
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS subbie_reward_earned_at timestamp`,
  );
  await pool.query(
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS subbie_reward_email_sent_at timestamp`,
  );
  await pool.query(
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS subbie_reward_granted_at timestamp`,
  );
}
