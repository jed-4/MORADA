// Subbie action-based reward: a free month, earned by adding a job AND sending an
// invoice within 3 days of signup — layered on top of the standard 14-day trial.
//
// Two phases, both idempotent, run hourly (see server/index.ts), same shape as the
// referral sweep in server/referrals.ts:
//   EARN  — a subbie company that hit both milestones inside the 3-day window gets
//           subbie_reward_earned_at stamped and the "free month unlocked" email
//           (delivered OUT of the app — Apple anti-steering means no in-app
//           purchase CTA; the email links to the web /billing page).
//   GRANT — once that company has a Stripe customer (i.e. added a card on the web),
//           apply a one-month negative balance transaction so their first real
//           charge lands 30 days later. Mechanism reused verbatim from referrals.
//
// Eligibility is DERIVED from durable rows (a project exists; an invoice has a
// sent_date), not a separate event log — so a missed event can't lose the reward.

import { pool } from "./db";
import { getStripe } from "./stripe";
import { PLANS } from "./config/plans";
import { sendGenericEmail } from "./utils/email";

const REWARD_WINDOW_DAYS = 3;
const FREE_MONTH_CENTS = Math.round(PLANS.subbie.monthlyPrice * 100); // $35 → 3500

function appBaseUrl(): string {
  return process.env.APP_URL || "https://app.moradaco.com.au";
}

async function sendRewardEmail(to: string, companyName: string | null): Promise<void> {
  const billingUrl = `${appBaseUrl()}/billing`;
  const who = companyName ? `, ${companyName}` : "";
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1b18;max-width:520px;margin:0 auto;">
      <h2 style="font-size:20px;margin:0 0 12px;">Your free month is unlocked 🎉</h2>
      <p style="font-size:15px;line-height:1.5;color:#3a3a36;">
        Nice work${who} — you added a job and sent your first invoice through Morada.
        That's earned you a <strong>free month</strong> on the Subbie plan.
      </p>
      <p style="font-size:15px;line-height:1.5;color:#3a3a36;">
        Add a payment method to keep everything running after your trial. You won't be
        charged now — your first payment is 30 days after you add your card.
      </p>
      <p style="margin:24px 0;">
        <a href="${billingUrl}" style="background:#34519e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">
          Add payment &amp; keep my free month
        </a>
      </p>
      <p style="font-size:12px;color:#86837a;">If the button doesn't work, open ${billingUrl}</p>
    </div>`;
  await sendGenericEmail({
    to,
    subject: "Your free month is unlocked 🎉",
    html,
  });
}

async function ownerEmail(companyId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT email FROM users WHERE company_id = $1 AND email IS NOT NULL ORDER BY created_at ASC LIMIT 1`,
    [companyId],
  );
  return rows[0]?.email ?? null;
}

/** EARN phase: stamp earned + email any subbie company that qualified. */
async function processEarnPhase(): Promise<number> {
  // Eligibility fully expressed in SQL: subbie tier, not yet earned, signed up
  // recently, with a job AND a sent invoice both inside the 3-day window.
  const { rows: eligible } = await pool.query(
    `SELECT c.id, c.name
       FROM companies c
      WHERE (c.is_subbie = true OR c.chosen_plan = 'subbie')
        AND c.subbie_reward_earned_at IS NULL
        AND c.created_at >= NOW() - INTERVAL '10 days'
        AND EXISTS (
          SELECT 1 FROM projects p
           WHERE p.company_id = c.id
             AND p.created_at <= c.created_at + ($1 || ' days')::interval
        )
        AND EXISTS (
          SELECT 1 FROM client_invoices i
           WHERE i.company_id = c.id
             AND i.sent_date IS NOT NULL
             AND i.sent_date <= c.created_at + ($1 || ' days')::interval
        )
      LIMIT 50`,
    [String(REWARD_WINDOW_DAYS)],
  );

  let earned = 0;
  for (const company of eligible) {
    // Claim BEFORE emailing so a concurrent sweep can't double-send.
    const { rowCount: claimed } = await pool.query(
      `UPDATE companies SET subbie_reward_earned_at = NOW()
        WHERE id = $1 AND subbie_reward_earned_at IS NULL`,
      [company.id],
    );
    if (!claimed) continue;
    earned++;

    try {
      const to = await ownerEmail(company.id);
      if (to) {
        await sendRewardEmail(to, company.name ?? null);
        await pool.query(
          `UPDATE companies SET subbie_reward_email_sent_at = NOW() WHERE id = $1`,
          [company.id],
        );
      }
    } catch (err) {
      // Reward stays earned; a later touch-point can re-send. Don't unwind.
      console.error(`[subbie-reward] earned ${company.id} but email failed:`, err);
    }
  }
  return earned;
}

/** GRANT phase: apply the one-month credit once the subbie has a Stripe customer. */
async function processGrantPhase(): Promise<number> {
  const stripe = getStripe();
  if (!stripe) return 0;

  const { rows: toGrant } = await pool.query(
    `SELECT c.id, c.stripe_customer_id
       FROM companies c
      WHERE c.subbie_reward_earned_at IS NOT NULL
        AND c.subbie_reward_granted_at IS NULL
        AND c.stripe_customer_id IS NOT NULL
      LIMIT 50`,
  );

  let granted = 0;
  for (const company of toGrant) {
    // Claim BEFORE Stripe so a concurrent sweep can't double-credit.
    const { rowCount: claimed } = await pool.query(
      `UPDATE companies SET subbie_reward_granted_at = NOW()
        WHERE id = $1 AND subbie_reward_granted_at IS NULL`,
      [company.id],
    );
    if (!claimed) continue;

    try {
      await stripe.customers.createBalanceTransaction(company.stripe_customer_id, {
        amount: -Math.abs(FREE_MONTH_CENTS), // negative = credit
        currency: "aud",
        description: "Subbie welcome — 1 free month",
      });
      granted++;
    } catch (err) {
      // Roll the claim back so the next sweep retries.
      await pool.query(
        `UPDATE companies SET subbie_reward_granted_at = NULL WHERE id = $1`,
        [company.id],
      );
      console.error(`[subbie-reward] failed to grant credit for ${company.id}:`, err);
    }
  }
  return granted;
}

/** Hourly sweep entry point. Safe to run while Stripe is unconfigured (grant no-ops). */
export async function processSubbieRewards(): Promise<{ earned: number; granted: number }> {
  const earned = await processEarnPhase();
  const granted = await processGrantPhase();
  return { earned, granted };
}
