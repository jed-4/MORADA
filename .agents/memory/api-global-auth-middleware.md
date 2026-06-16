---
name: Global /api auth middleware
description: All /api routes are protected by one global middleware with an explicit public allowlist — individual routes look unauthenticated but aren't.
---

BuildPro protects ALL `/api/*` routes with a single global middleware
(`app.use('/api', ...)` in server/routes.ts, registered before any route handler).
In production it ends with `return requireAuth(...)`; in development it injects a dev user.
Only an explicit allowlist is public: `/auth/*` (except `/auth/user`), `/invitations/by-token/:t`
and `/invitations/:id/accept`, `/portal/*`, GET `/proposals/:id/client-view`,
POST `/proposals/:id/(view|acceptances)`, and `/xero/webhook`.

**Why:** Many individual route handlers (e.g. `GET /api/projects/:id`,
`GET /api/projects/:id/contract-metrics`) have NO per-route `requireAuth` and look
unauthenticated when read in isolation. A reviewer (including the architect) can flag
them as "unauthenticated endpoint" — that is a false positive; they are covered globally.

**How to apply:** Do NOT add redundant `requireAuth` to a route already covered by the
global middleware. Before acting on an "unauthenticated route" finding, confirm whether the
path matches the public allowlist — if not, it is already protected in prod. Note: the
global guard enforces *authentication* (logged in) but NOT *company-level authorization*;
read-by-id routes like the project/contract-metrics GETs do not scope by `companyId`, so a
logged-in user from another company could read by guessing an ID. Cross-company hardening,
if needed, is a separate concern and should be applied consistently, not on one endpoint.
