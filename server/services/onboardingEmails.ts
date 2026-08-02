// Trial lifecycle emails. Before this, a self-signup received NO email at all
// — no welcome, no trial-ending warning, nothing. This module covers the
// 14-day trial with four sends, each delivered at most once per company:
//
//   welcome       day 0   fired inline at company creation
//   tips_day3     day 3   one concrete thing to try
//   trial_ending  day 10  four days left, how to subscribe
//   trial_ended   day 14+ trial over, subscribe to continue
//
// Days 3/10/14 are driven by an hourly sweep off companies.trial_ends_at (the
// trial is 14 days, so day 3 == trial_ends_at - 11 days, and so on).
//
// Once-only delivery is enforced by a UNIQUE(company_id, email_key) index, not
// by application logic: the sweep CLAIMS a send by inserting the log row, and
// only sends if the insert won. A failed send deletes its claim so the next
// sweep retries.

import { pool } from "../db";
import { sendGenericEmail } from "../utils/email";
import { isFoundingProgrammeConfigured } from "../config/plans";
import { foundingSpotsLeft } from "../foundingMembers";
import { isStripeConfigured } from "../stripe";

export type OnboardingEmailKey = "welcome" | "tips_day3" | "trial_ending" | "trial_ended";

const FROM = "Morada <noreply@moradaco.com.au>";

// These two ask the user to subscribe. With billing switched off there is
// nothing to subscribe to and the paywall never engages (requireActivePlan is
// a no-op without Stripe), so the nag is both useless and misleading — it
// sends people to a checkout that 503s. Welcome and the day-3 tip carry no
// billing call to action, so they still go out.
//
// Keyed on the same predicate the paywall uses rather than a separate flag, so
// the emails and the enforcement can never disagree: wire Stripe up and these
// switch themselves on.
const BILLING_DEPENDENT_KEYS: OnboardingEmailKey[] = ["trial_ending", "trial_ended"];

function emailAllowed(key: OnboardingEmailKey): boolean {
  if (!sendingEnabled()) return false;
  if (BILLING_DEPENDENT_KEYS.includes(key) && !isStripeConfigured()) return false;
  return true;
}

// These emails go to real customers, and dev/staging routinely runs against a
// copy of real data — so sending is OFF unless we're in production. Set
// ONBOARDING_EMAILS_ENABLED=true to deliberately exercise it elsewhere.
function sendingEnabled(): boolean {
  if (process.env.ONBOARDING_EMAILS_ENABLED === "true") return true;
  return process.env.NODE_ENV === "production";
}

// ---- Schema safety net (additive, idempotent — deploy runs no migrations) ----
export async function ensureOnboardingEmailTable(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS onboarding_email_log (
       id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
       company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
       email_key varchar(40) NOT NULL,
       to_email text NOT NULL,
       sent_at timestamp NOT NULL DEFAULT now()
     )`,
  );
  // The once-only guarantee. Concurrent instances and retried sweeps both rely
  // on this rather than on a read-then-write check.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS onboarding_email_log_company_key_unique
       ON onboarding_email_log (company_id, email_key)`,
  );
}

function appUrl(): string {
  return (process.env.APP_URL || "https://app.moradaco.com.au").replace(/\/$/, "");
}

// ---- Shared shell ----------------------------------------------------------
// Morada lavender (--primary #A890D4) on the warm off-white page background,
// matching the in-app palette.
function shell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Morada</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #FAFAF8;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 40px 0;">
          <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; border: 1px solid #EAEAE8;">
            <tr>
              <td style="padding: 28px 40px; text-align: center; background-color: #A890D4; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 600; letter-spacing: -0.01em;">Morada</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 36px 40px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 40px; text-align: center; background-color: #F5F4F0; border-radius: 0 0 8px 8px;">
                <p style="margin: 0; color: #6B6560; font-size: 12px;">
                  © ${new Date().getFullYear()} Morada — construction management for Australian builders.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" style="width: 100%; margin: 28px 0;">
    <tr><td align="center">
      <a href="${href}" style="display: inline-block; padding: 13px 30px; background-color: #A890D4; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">${label}</a>
    </td></tr>
  </table>`;
}

const h2 = (text: string) =>
  `<h2 style="margin: 0 0 16px; color: #2C2825; font-size: 22px; font-weight: 600;">${text}</h2>`;
const p = (text: string) =>
  `<p style="margin: 0 0 18px; color: #4a5568; font-size: 16px; line-height: 1.6;">${text}</p>`;
const small = (text: string) =>
  `<p style="margin: 24px 0 0; color: #6B6560; font-size: 13px; line-height: 1.5;">${text}</p>`;

// ---- Templates -------------------------------------------------------------

interface TemplateContext {
  firstName: string | null;
  companyName: string;
  trialEndsAt: Date | null;
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long" });
}

function welcomeEmail(ctx: TemplateContext) {
  const greeting = ctx.firstName ? `Welcome aboard, ${ctx.firstName}` : "Welcome aboard";
  return {
    subject: "Welcome to Morada — your 14-day trial has started",
    html: shell(
      h2(`${greeting}!`) +
        p(
          `Your account for <strong>${ctx.companyName}</strong> is ready and your 14-day free trial has started. No card needed${ctx.trialEndsAt ? `, and nothing happens until ${formatDate(ctx.trialEndsAt)}` : ""}.`,
        ) +
        p(
          `We've loaded a sample project so you can see how Morada works with real numbers in it — estimates, variations, bills, timesheets and client invoices all wired together. Have a click around, then clear the demo data from the banner at the top of the app whenever you're ready to start on your own jobs.`,
        ) +
        p(`<strong>A good first move:</strong> create your first project, then build an estimate for it. That's the backbone everything else hangs off.`) +
        button(appUrl(), "Open Morada") +
        small(
          `Questions, or something not working the way you'd expect? Just reply to this email — it comes through to a real person.`,
        ),
    ),
  };
}

function tipsDay3Email(ctx: TemplateContext) {
  const greeting = ctx.firstName ? `Hi ${ctx.firstName},` : "Hi there,";
  return {
    subject: "Try this next in Morada: build an estimate",
    html: shell(
      h2("Where most builders see it click") +
        p(greeting) +
        p(
          `You're a few days into your trial. If you've only done one thing so far, make it this: <strong>build an estimate on a real job</strong>.`,
        ) +
        p(
          `Estimates are where Morada earns its keep. Price the job once, and that same structure carries through to your budget, your progress claims, your variations and your client invoices — so you're not re-typing numbers into three spreadsheets and hoping they agree.`,
        ) +
        p(
          `A couple of things worth knowing while you're in there: allowances (Prime Cost and Provisional Sum) track what you've actually spent against what you allowed, and every line can carry a cost code so job costing comes out the other end for free.`,
        ) +
        button(`${appUrl()}/estimates`, "Build an estimate") +
        small(`Stuck on how to structure something? Reply and tell us about the job — happy to help you set it up.`),
    ),
  };
}

function trialEndingEmail(ctx: TemplateContext) {
  const greeting = ctx.firstName ? `Hi ${ctx.firstName},` : "Hi there,";
  return {
    subject: `Your Morada trial ends ${ctx.trialEndsAt ? formatDate(ctx.trialEndsAt) : "in 4 days"}`,
    html: shell(
      h2("Four days left on your trial") +
        p(greeting) +
        p(
          `Your free trial for <strong>${ctx.companyName}</strong> ends ${ctx.trialEndsAt ? `on <strong>${formatDate(ctx.trialEndsAt)}</strong>` : "in four days"}. To keep going without interruption, pick a plan and add your card.`,
        ) +
        p(
          `Everything you've entered stays exactly where it is — subscribing just keeps the doors open. You can change or cancel your plan whenever you like.`,
        ) +
        button(`${appUrl()}/settings?tab=billing`, "Choose your plan") +
        small(
          `Not sure which plan fits, or need more time to get a proper look? Reply and let us know — we'd rather sort it out than have you rushed.`,
        ),
    ),
  };
}

async function trialEndedEmail(ctx: TemplateContext) {
  const greeting = ctx.firstName ? `Hi ${ctx.firstName},` : "Hi there,";
  // Only mention the founding offer when the programme is switched on AND
  // spots remain — never promise something we can't honour.
  let foundingBlock = "";
  if (isFoundingProgrammeConfigured()) {
    try {
      const spots = await foundingSpotsLeft();
      if (spots > 0) {
        foundingBlock = p(
          `<strong>One more thing:</strong> there ${spots === 1 ? "is 1 founding member spot" : `are ${spots} founding member spots`} left. Founding members get their first month free and Studio at half price for life.`,
        );
      }
    } catch {
      // Non-fatal: send the email without the offer rather than not at all.
    }
  }

  return {
    subject: `Your Morada trial has ended — pick up where you left off`,
    html: shell(
      h2("Your trial has ended") +
        p(greeting) +
        p(
          `The 14-day trial for <strong>${ctx.companyName}</strong> has finished. Your data is all still here and untouched — subscribe and you're straight back into it.`,
        ) +
        foundingBlock +
        button(`${appUrl()}/settings?tab=billing`, "Subscribe and continue") +
        small(
          `If Morada wasn't the right fit, we'd genuinely like to know why — reply and tell us. It's the most useful feedback we get.`,
        ),
    ),
  };
}

// ---- Send with once-only claim --------------------------------------------

/**
 * Claim (company, key) and send. Returns true only if this call sent the email.
 * The claim row is inserted first so concurrent sweeps can't double-send; a
 * failed send removes the claim so the next sweep retries.
 */
async function claimAndSend(
  companyId: string,
  key: OnboardingEmailKey,
  toEmail: string,
  build: () => Promise<{ subject: string; html: string }> | { subject: string; html: string },
): Promise<boolean> {
  const claim = await pool.query(
    `INSERT INTO onboarding_email_log (company_id, email_key, to_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (company_id, email_key) DO NOTHING
     RETURNING id`,
    [companyId, key, toEmail],
  );
  if (claim.rowCount === 0) return false; // already sent (or being sent)

  try {
    const { subject, html } = await build();
    await sendGenericEmail({ to: toEmail, subject, html, from: FROM });
    console.log(`[onboarding-email] sent '${key}' to ${toEmail} (company ${companyId})`);
    return true;
  } catch (err) {
    await pool
      .query(`DELETE FROM onboarding_email_log WHERE company_id = $1 AND email_key = $2`, [companyId, key])
      .catch(() => {});
    console.error(`[onboarding-email] failed to send '${key}' to ${toEmail} (company ${companyId}):`, err);
    return false;
  }
}

async function companyContext(companyId: string): Promise<
  ({ email: string } & TemplateContext) | null
> {
  const { rows } = await pool.query(
    `SELECT c.name AS company_name,
            c.trial_ends_at,
            u.email      AS owner_email,
            u.first_name AS owner_first_name
       FROM companies c
       JOIN users u ON u.id = c.owner_id
      WHERE c.id = $1`,
    [companyId],
  );
  const row = rows[0];
  if (!row?.owner_email) return null;
  return {
    email: row.owner_email,
    firstName: row.owner_first_name ?? null,
    companyName: row.company_name ?? "your company",
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
  };
}

/**
 * Day-0 welcome. Called (fire-and-forget) right after company creation, so a
 * new signup hears from us immediately.
 */
export async function sendWelcomeEmail(companyId: string): Promise<boolean> {
  if (!sendingEnabled()) {
    console.log(`[onboarding-email] skipping welcome for company ${companyId} (sending disabled outside production)`);
    return false;
  }
  await ensureOnboardingEmailTable();
  const ctx = await companyContext(companyId);
  if (!ctx) {
    console.warn(`[onboarding-email] no owner email for company ${companyId} — skipping welcome`);
    return false;
  }
  return claimAndSend(companyId, "welcome", ctx.email, () => welcomeEmail(ctx));
}

/**
 * Hourly sweep for the day-3, day-10 and post-expiry emails. Selects on the
 * trial clock; the unique index does the de-duplication, so this is safe to
 * run as often as we like.
 */
export async function processOnboardingEmails(): Promise<{ sent: number }> {
  if (!sendingEnabled()) return { sent: 0 };
  await ensureOnboardingEmailTable();

  // Companies still on the trial track. Subscribers (planStatus 'active') are
  // excluded — they don't need trial nudges. 'cancelled' is excluded too.
  const { rows } = await pool.query(
    `SELECT c.id,
            c.plan_status,
            c.trial_ends_at
       FROM companies c
      WHERE c.trial_ends_at IS NOT NULL
        AND c.owner_id IS NOT NULL
        AND COALESCE(c.plan_status, '') IN ('trialing', 'trial', 'expired')
        AND c.trial_ends_at > now() - interval '30 days'`,
  );

  let sent = 0;
  const now = Date.now();

  for (const row of rows) {
    const trialEndsAt = new Date(row.trial_ends_at);
    const msLeft = trialEndsAt.getTime() - now;
    const daysLeft = msLeft / (24 * 60 * 60 * 1000);

    // Which email is due? Only ever one per company per sweep — the earlier
    // stages are skipped once their window has passed (no back-filling a
    // "4 days left" warning to someone whose trial already ended).
    let due: OnboardingEmailKey | null = null;
    if (msLeft <= 0) due = "trial_ended";
    else if (daysLeft <= 4) due = "trial_ending";
    else if (daysLeft <= 11) due = "tips_day3";
    // Skipping happens BEFORE the claim, so a suppressed expiry email stays
    // owed rather than being tombstoned — it will go out once Stripe is live.
    if (!due || !emailAllowed(due)) continue;

    try {
      const ctx = await companyContext(row.id);
      if (!ctx) continue;

      const ok = await claimAndSend(row.id, due, ctx.email, () => {
        if (due === "trial_ended") return trialEndedEmail(ctx);
        if (due === "trial_ending") return trialEndingEmail(ctx);
        return tipsDay3Email(ctx);
      });
      if (ok) sent++;
    } catch (err) {
      console.error(`[onboarding-email] sweep failed for company ${row.id}:`, err);
    }
  }

  return { sent };
}
