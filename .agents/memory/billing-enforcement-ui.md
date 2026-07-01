---
name: Billing enforcement & paywall UI
description: How the plan paywall, seat rule, and limit enforcement fit together in BuildPro
---

# Billing enforcement & paywall

- **Seat rule (Full User):** active `users` with `user_category='team'` AND role NOT mobile-only. Owner/admin (built-in roles) always count. Client/supplier/mobile-only roles are free. Mobile-only lives on `user_roles.is_mobile_only`.
- **Built-in roles can never be mobile-only.** Both the RolesPermissions toggle (disabled when `role.isBuiltIn`) and the PATCH `/api/user-roles/:id` backend (strips `isMobileOnly` from update when the existing role is built-in) enforce this, or the seat count would exclude owner/admin and break enforcement.

- **Enforcement is a no-op until Stripe is live.** All limit gates (`project_limit_reached`, `user_limit_reached`) are wrapped behind `isStripeConfigured()` and `limit !== -1`. Limit error bodies use `{ error: 'user_limit_reached', ... }` — the machine code is in the `error` field, NOT a `code` field. Frontend must read `err.payload.error`.

- **Paywall (`PlanGate`) is mounted once in the authed layout** and driven by `/api/billing/status` (`blocked` + `isOwner`). It renders a non-dismissible dialog (uses `DialogContent hideCloseButton` + prevents escape/outside-close). It must exempt `/billing/` routes (success/cancelled) and portal/auth routes via the prefix list, or the Stripe return page gets covered during webhook-propagation lag.

- **Plan catalogue for the client comes from `GET /api/billing/plans`** — do NOT import `server/config/plans.ts` into the client (it reads `process.env` at module load). The endpoint returns display fields + `stripeConfigured`.
