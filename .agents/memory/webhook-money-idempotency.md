---
name: Webhook-driven money records need DB-enforced idempotency
description: Stripe webhook handlers that create credits/charges must dedupe via unique index + ON CONFLICT, not SELECT-then-INSERT.
---

Any record created from a Stripe webhook that represents money (referral credits, etc.) must be idempotent at the DB level: unique index on the natural key (e.g. one credit per referee company) + `INSERT ... ON CONFLICT DO NOTHING RETURNING id`.

**Why:** Stripe retries webhook deliveries and can deliver concurrently; a SELECT-then-INSERT check races and creates duplicates (caught in architect review of the referral-credit sweep).

**How to apply:** When adding any webhook-created financial row, add the unique index in the idempotent ensure-table startup hook and make the insert conflict-safe; return whether the row was actually created.

Related: `POST /api/companies` whitelists profile fields only (name/nickname/abn/address/phone/email/website/logo) — billing/referral columns (planStatus, stripeCustomerId, referredByCompanyId) are server-managed; never spread req.body into company inserts.
