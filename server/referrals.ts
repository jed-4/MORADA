// Referral system backend: referral codes, referral credits, and the credit
// sweep job. Uses raw pool queries (same approach as the billing endpoints).
//
// Flow:
//  1. Every company gets a unique referral code (generated lazily).
//  2. A new company signing up with ?ref=<code> records referred_by_company_id.
//  3. When the referred company pays its FIRST invoice, a pending credit is
//     created with a 7-day hold (fire_after).
//  4. An hourly sweep issues credits past their hold — after checking the
//     referee's invoice wasn't refunded — as a negative Stripe balance
//     transaction on the referrer's customer.
//  5. A refund of the referee's first charge cancels the pending credit.

import { pool } from "./db";
import { getStripe } from "./stripe";
import { PLANS, isPlanKey, type PlanKey } from "./config/plans";

// ---- Schema safety net (additive, idempotent — deploy runs no migrations) ----
export async function ensureReferralTables(): Promise<void> {
  await pool.query(
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)`,
  );
  await pool.query(
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS referred_by_company_id VARCHAR REFERENCES companies(id)`,
  );
  // UNIQUE constraint added separately so re-runs are safe on all PG versions.
  await pool.query(
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'companies_referral_code_unique'
       ) THEN
         ALTER TABLE companies ADD CONSTRAINT companies_referral_code_unique UNIQUE (referral_code);
       END IF;
     END $$;`,
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS referral_credits (
       id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
       referrer_company_id varchar NOT NULL REFERENCES companies(id),
       referee_company_id varchar NOT NULL REFERENCES companies(id),
       amount_cents integer NOT NULL,
       status varchar(20) NOT NULL DEFAULT 'pending',
       referee_invoice_id text,
       fire_after timestamp,
       created_at timestamp NOT NULL DEFAULT now()
     )`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS referral_credits_status_idx ON referral_credits (status, fire_after)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS referral_credits_referrer_idx ON referral_credits (referrer_company_id)`,
  );
  // One credit per referee company, DB-enforced so concurrent/retried webhook
  // deliveries can never create duplicates.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS referral_credits_referee_unique ON referral_credits (referee_company_id)`,
  );
}

// ---- Referral codes ----

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

function randomSegment(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// Company ids are UUIDs (not integers), so the code is fully random:
// M-XXXX-XXXX (11 chars, fits varchar(20)). Uniqueness is enforced by the DB.
export function generateReferralCode(): string {
  return `M-${randomSegment(4)}-${randomSegment(4)}`;
}

/** Returns the company's referral code, generating + saving one if missing. */
export async function ensureCompanyReferralCode(companyId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT referral_code FROM companies WHERE id = $1`,
    [companyId],
  );
  if (!rows.length) return null;
  if (rows[0].referral_code) return rows[0].referral_code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const { rows: updated } = await pool.query(
        `UPDATE companies SET referral_code = $1
          WHERE id = $2 AND referral_code IS NULL
          RETURNING referral_code`,
        [code, companyId],
      );
      if (updated.length) return updated[0].referral_code as string;
      // Someone else set it concurrently — read it back.
      const { rows: again } = await pool.query(
        `SELECT referral_code FROM companies WHERE id = $1`,
        [companyId],
      );
      return (again[0]?.referral_code as string) || null;
    } catch (err: any) {
      // Unique collision — extremely unlikely; retry with a fresh code.
      if (err?.code !== "23505") throw err;
    }
  }
  return null;
}

/** Case-insensitive lookup of a company id by referral code. Null if invalid. */
export async function getCompanyIdByReferralCode(code: string): Promise<string | null> {
  const trimmed = (code || "").trim().toUpperCase();
  if (!trimmed || trimmed.length > 20) return null;
  const { rows } = await pool.query(
    `SELECT id FROM companies WHERE UPPER(referral_code) = $1 LIMIT 1`,
    [trimmed],
  );
  return rows.length ? (rows[0].id as string) : null;
}

// ---- Referral credits ----

/** The referrer's current monthly plan price in cents (annual → monthly equivalent). */
export function referrerMonthlyPriceCents(plan: string | null | undefined): number {
  const key: PlanKey = isPlanKey(plan) ? plan : "builder";
  return PLANS[key].monthlyPrice * 100;
}

/**
 * Creates a pending referral credit with a 7-day hold. Idempotent per referee:
 * a unique index on referee_company_id plus ON CONFLICT DO NOTHING guarantees
 * exactly one credit per referee company, even under concurrent/retried
 * webhook deliveries (a company only ever has one "first invoice").
 */
export async function createPendingReferralCredit(params: {
  referrerCompanyId: string;
  refereeCompanyId: string;
  amountCents: number;
  refereeInvoiceId: string | null;
}): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO referral_credits
       (referrer_company_id, referee_company_id, amount_cents, status, referee_invoice_id, fire_after)
     VALUES ($1, $2, $3, 'pending', $4, NOW() + INTERVAL '7 days')
     ON CONFLICT (referee_company_id) DO NOTHING
     RETURNING id`,
    [params.referrerCompanyId, params.refereeCompanyId, params.amountCents, params.refereeInvoiceId],
  );
  return rows.length > 0;
}

/** Cancels any pending credit tied to a (now refunded) referee invoice. */
export async function cancelPendingCreditForInvoice(invoiceId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE referral_credits SET status = 'cancelled'
      WHERE referee_invoice_id = $1 AND status = 'pending'`,
    [invoiceId],
  );
  return rowCount || 0;
}

export interface ReferralStats {
  referralCode: string | null;
  totalReferrals: number;
  creditsIssued: number;
  creditsPending: number;
}

export async function getReferralStats(companyId: string): Promise<ReferralStats> {
  const referralCode = await ensureCompanyReferralCode(companyId);
  const { rows: refRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM companies WHERE referred_by_company_id = $1`,
    [companyId],
  );
  const { rows: creditRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'issued')::int AS issued,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
     FROM referral_credits WHERE referrer_company_id = $1`,
    [companyId],
  );
  return {
    referralCode,
    totalReferrals: refRows[0]?.c ?? 0,
    creditsIssued: creditRows[0]?.issued ?? 0,
    creditsPending: creditRows[0]?.pending ?? 0,
  };
}

// ---- Credit sweep (hourly job) ----

/**
 * Issues pending referral credits that are past their 7-day hold.
 * For each: re-checks the referee's invoice hasn't been refunded, then applies
 * a negative balance transaction (a credit) to the referrer's Stripe customer.
 */
export async function processReferralCredits(): Promise<{ issued: number; cancelled: number }> {
  const stripe = getStripe();
  if (!stripe) return { issued: 0, cancelled: 0 };

  const { rows: due } = await pool.query(
    `SELECT rc.id, rc.referrer_company_id, rc.amount_cents, rc.referee_invoice_id,
            c.stripe_customer_id AS referrer_stripe_customer_id
       FROM referral_credits rc
       JOIN companies c ON c.id = rc.referrer_company_id
      WHERE rc.status = 'pending' AND rc.fire_after IS NOT NULL AND rc.fire_after <= NOW()
      LIMIT 25`,
  );

  let issued = 0;
  let cancelled = 0;
  for (const credit of due) {
    try {
      // Check the referee's first invoice wasn't refunded during the hold.
      if (credit.referee_invoice_id) {
        try {
          const invoice = await stripe.invoices.retrieve(credit.referee_invoice_id);
          const chargeId =
            typeof (invoice as any).charge === "string"
              ? (invoice as any).charge
              : (invoice as any).charge?.id || null;
          if (chargeId) {
            const charge = await stripe.charges.retrieve(chargeId);
            if (charge.refunded || (charge.amount_refunded ?? 0) > 0) {
              await pool.query(
                `UPDATE referral_credits SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
                [credit.id],
              );
              cancelled++;
              continue;
            }
          }
        } catch (invErr) {
          console.error(`[referrals] could not verify invoice ${credit.referee_invoice_id} — skipping credit ${credit.id} this sweep:`, invErr);
          continue; // leave pending; retry next sweep
        }
      }

      if (!credit.referrer_stripe_customer_id) {
        // Referrer has never touched Stripe — leave pending until they do.
        continue;
      }

      // Claim the row BEFORE calling Stripe so a concurrent sweep can't
      // double-issue. If the Stripe call fails we roll the claim back.
      const { rowCount: claimed } = await pool.query(
        `UPDATE referral_credits SET status = 'issued' WHERE id = $1 AND status = 'pending'`,
        [credit.id],
      );
      if (!claimed) continue;

      try {
        await stripe.customers.createBalanceTransaction(credit.referrer_stripe_customer_id, {
          amount: -Math.abs(credit.amount_cents), // negative = credit
          currency: "aud",
          description: "Referral credit — 1 free month",
        });
        issued++;
      } catch (stripeErr) {
        await pool.query(
          `UPDATE referral_credits SET status = 'pending' WHERE id = $1 AND status = 'issued'`,
          [credit.id],
        );
        throw stripeErr;
      }
    } catch (err) {
      console.error(`[referrals] failed to process credit ${credit.id}:`, err);
    }
  }
  return { issued, cancelled };
}
