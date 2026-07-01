---
name: Billing trial & plan-status model
description: How BuildPro's Stripe trial/plan-status lifecycle works and why the enforcement stays lenient on null trial_ends_at.
---

# Billing trial & plan-status model

BuildPro companies carry `plan`, `chosenPlan`, `billingCycle`, `planStatus`,
`trialEndsAt`, `stripeCustomerId`, `stripeSubscriptionId`. Enforcement lives in
`requireActivePlan` and is a **no-op whenever Stripe is not configured** (no
`STRIPE_SECRET_KEY`), so the whole billing layer is dormant until keys are added.

## Rules baked into the code
- **Trial clock starts at company creation**, not at plan selection. `POST /api/companies`
  sets `planStatus='trialing'` + `trialEndsAt = now+14d` right after `createCompany`.
- **A null `trialEndsAt` means a legacy, pre-billing company** — nothing else can produce
  null once the create-time hook exists. `requireActivePlan` therefore treats null as
  allowed (lenient).
- **`/api/billing/select-plan` is idempotent**: it records the chosen plan/cycle but
  NEVER resets an existing `trialEndsAt` and never downgrades an `active` company back to
  `trialing`. Replaying it cannot extend the trial.
- **Webhook mirrors Stripe truth**: `handleStripeEvent` maps `subscription.status` →
  our `planStatus` via `mapSubscriptionStatus` (do NOT hardcode `active` on every
  `subscription.updated`). `invoice.payment_failed` → `past_due` (NOT `expired`);
  a sub only becomes `expired`/`cancelled` on the deleted/updated events.

**Why:** There is intentionally **no upgrade / plan-management UI yet** (out of scope for
the foundation task). Hard-blocking legacy `trial`/null companies would lock them out with
no recovery path, so leniency-on-null is deliberate. The create-time trial clock is what
closes the "new company skips onboarding's plan step and is never gated" bypass instead.

**How to apply:** When you add feature gating / an upgrade UI later, revisit the null
leniency — once users can self-serve a plan, legacy null companies can be migrated and the
null-allowed branch tightened. Keep webhook status mapping as the source of truth.
