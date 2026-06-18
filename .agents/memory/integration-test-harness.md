---
name: Integration test harness (strict auth vs dev DB)
description: How to run HTTP integration tests that need real auth + the dev database without tripping the production DB guard or the dev auth bypass.
---

# Running HTTP integration tests with strict auth

Run the test process with `NODE_ENV=test` (not `development`, not `production`).

**Why:**
- `server/db.ts` throws a FATAL guard if `NODE_ENV=production` while `DATABASE_URL` host is `helium` (the dev/workspace proxy). So you cannot use production mode against the dev DB.
- The auth middleware's dev bypass (global `/api` dev-user injection in `registerRoutes`, plus `requirePermission`/`requireTeamMember`) only fires when `NODE_ENV === 'development'`. Under `development` you get an injected dev user and skipped permission checks — useless for testing tenant isolation / authz.
- `NODE_ENV=test` satisfies neither branch: the DB guard stays quiet AND auth is strictly enforced. Admin (General Manager) role still bypasses `requirePermission`, so create the test user's company via `storage.createCompany(insertCompany, userId)` (it assigns the GM admin role) to get past permission gates and isolate the ownership checks under test.

**How to apply:**
- Build the app yourself: `express()` + `express.json()` then `await registerRoutes(app)` (returns the http.Server). Listen on port `0` (ephemeral) so it never collides with the running dev server on 5000. Startup side-effects (pollers/healers) live in `server/index.ts`, NOT `registerRoutes`, so calling `registerRoutes` alone is safe.
- Session cookie is `secure: true` and the app uses `trust proxy`. Over plain HTTP, express-session will NOT set/accept the cookie unless the request looks HTTPS — send header `X-Forwarded-Proto: https` on every request, then capture/replay the `connect.sid` cookie manually (`res.headers.getSetCookie()`).
- Create users via the `/api/auth/register` endpoint (sets `passwordHash` correctly). Do NOT call `storage.createUser({password})` expecting login to work — that hashes into the `password` column, but login checks `passwordHash`.
- `storage.createProject` coerces `projectSubStatus` to `null` (ignores the schema default), so pass `projectSubStatus: "lead_new"` explicitly or you hit a not-null violation.
- Use a custom assert harness + `process.exit(code)` for teardown. `node:test` won't exit cleanly: the connect-pg-simple session store keeps a prune `setInterval` and its own pg pool open. Close the http server + `pool.end()`, then `process.exit`.
