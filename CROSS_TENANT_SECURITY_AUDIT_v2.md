# Cross-Tenant Security Audit v2

Second-pass tenant-isolation audit, prompted by onboarding a second real company
onto production. Branch: `feat/tenant-isolation`.

The earlier `CROSS_TENANT_SECURITY_AUDIT.md` covered **by-ID routes only** — it
explicitly scoped out list endpoints, no-argument service calls and file
serving, which is where every finding below lives.

Findings were re-verified against `origin/main` @ `4ee73058` before any fix; the
original audit ran against a tree ~123 commits behind, so its line numbers are
all stale and one of its findings was already resolved.

---

## Part 1 — Fixed on this branch

### A1 — Bill inbox was single-tenant (CRITICAL)

`getCompanySettings()` / `updateCompanySettings()` were called with no
companyId and fell through to an unordered `LIMIT 1`, so the bill inbox
operated on whichever `company_settings` row the database happened to return
first. That row holds a live Google OAuth **refresh token**. With two companies
on the platform this reads and rewrites one tenant's Gmail credentials from
another tenant's session, and files supplier invoices into the wrong company's
books.

Seven call sites, not the six originally reported — `/api/bill-inbox/poll-now`
called `pollBillInbox()` with no company at all and was missed by the first
audit:

| Site | Fix |
|---|---|
| `GET /api/bill-inbox/status` | session companyId |
| `GET /api/bill-inbox/callback` | signed OAuth state (below) |
| `POST /api/bill-inbox/disconnect` | session companyId |
| `POST /api/bill-inbox/toggle-polling` | session companyId |
| `POST /api/bill-inbox/set-default-user` | session companyId |
| `POST /api/bill-inbox/poll-now` | session companyId |
| `gmailBillPoller.pollBillInbox` | required parameter |

Commits: `584f9223`, `f884e0b6`.

### Signed OAuth state (CRITICAL, not in the original audit)

`/api/bill-inbox/callback` is necessarily unauthenticated — Google redirects the
browser to it — and it **never validated the `state` parameter at all**. The
state was unsigned base64 and simply ignored on return. Anyone could hand an
admin a crafted callback URL and silently bind their own Gmail account into that
admin's company bill inbox, then read every invoice that landed there.

State is now HMAC-SHA256 signed (keyed on `SESSION_SECRET`), carries the issuing
company, expires in 10 minutes, and is compared with `timingSafeEqual`. The
callback refuses anything that does not verify, and additionally cross-checks
the session's companyId when a cookie is present.

**Deploy note:** consent flows started before this ships fail with
`invalid_state` and must be restarted.

Covered by `server/__tests__/oauth-state.test.ts` (8 tests), including a forged
state naming another company and a body swapped onto a valid signature.

### Bill inbox polled only one company (functional + isolation)

`pollBillInbox()` read settings unscoped, so **only one arbitrary company was
ever polled** regardless of how many had connected an inbox, and one tenant's
expired token aborted the entire cycle. `pollAllBillInboxes()` now fans out over
every company with polling enabled and a stored refresh token, each inside its
own try/catch. Rows with no `company_id` are logged and skipped.

**Deploy note:** inboxes that have been silently not polling will start
importing on first run. Worth reviewing what is queued in them before shipping.

### Three further high-severity finds (none in the original audit)

1. **`getBillInboxGmailClient` token writeback** — on a successful refresh it
   wrote the new Gmail **access token** back through the unscoped path, so a
   token refreshed for company A could be stored in company B's settings row.
   Now takes a required companyId and throws without one.
   (`server/services/googleOAuthService.ts`)
2. **Cross-company email From-name** — outbound variation, purchase-order and
   client-invoice email took its From name from the unscoped settings row, so
   one company's name could appear on another company's client-facing email.
3. **`syncCompanyName` boot overwrite** — ran at every startup, read an unscoped
   row and stamped its name onto the primary company. A second tenant's company
   name could overwrite the primary company's on the next boot. Now reads the
   primary company's own settings.

### A2 — 16 remaining unscoped settings reads

Reported as 13; actually 13 in `routes.ts` plus `storage.recomputeBillTotals`,
`storage.syncCompanyName` and `googleOAuthService.getBillInboxGmailClient`.

Most are configuration reads whose blast radius is a wrong value — tax rate,
fiscal-year start, default builder margin, default Xero account codes. Sources
threaded: session companyId for authenticated routes; the enclosing function's
existing parameter (`pushBillToXeroInternal`, `resolveKpiPeriodRange`); the
bill's own companyId in `recomputeBillTotals`; and the variation's project for
`GET /api/portal/variation/:token`, which is token-authenticated with no session
to read.

`processTimesheetOvertimeReminders` needed restructuring rather than threading:
it iterates every company's active timesheets, so a single unscoped read meant
one company's reminder toggle and threshold governed everyone.

Commit: `9664939d`.

### Fail closed — companyId is a required parameter

The `LIMIT 1` fallback and the legacy-row "self-heal" claim (which let whichever
company read first take ownership of the pre-multi-tenant unowned row,
credentials included) are both deleted.

`companyId` is now **required** on `getCompanySettings` and
`updateCompanySettings` — on the `IStorage` interface and both implementations —
so a missed caller is a compile error, including one reached through an
`IStorage`-typed variable. Both also throw at runtime, which is what catches an
`any`-typed or dynamically dispatched caller the types cannot see.

`tsc` reports **no `TS2554` or `TS2345`** against either method.

MemStorage previously kept one shared settings object, which would have made the
in-memory store behave exactly like the bug being fixed; it is now a `Map` keyed
by companyId.

Commit: `4c08ced2`.

### Group B — `requireCompany` middleware

Registration creates a user with `companyId` null and nothing forces onboarding
to completion. About a dozen list endpoints pass companyId to storage as
`user?.companyId as string | undefined` and **skip the tenancy filter entirely**
when it is undefined, returning every company's rows:

`GET /api/tasks`, `/api/bills`, `/api/checklist-templates` (+ `/export`),
`/api/projects/:id/bills`, `/bill-line-items`, `/actual-costs`,
`/budget-actuals`, `/contract-metrics`, `GET` + `PATCH /api/company-settings`,
`POST /api/bills/recompute-totals`.

`server/middleware/requireCompany.ts` rejects with 403 at the `/api` mount,
closing the class rather than the instances so a new list route cannot
reintroduce it.

The allowlist is deliberately narrow — the client renders only the onboarding
page while `user.companyId` is null, so the real pre-company surface is
`/auth/*`, the profile step, company creation and plan selection. Two entries
are **not** prefix matches:

- `POST /companies` is matched exactly; a prefix would also expose `GET` and
  `PATCH /companies/:id`.
- `PATCH /users/:id` is allowed only when `:id` is the caller's own id, because
  that same route is the admin user-edit endpoint.

Invited users (team, client and supplier alike) are stamped with companyId at
`acceptInvitation`, so portal access is unaffected.

Commit: `0c306cd1`.

### Migration 0043 — unique index on `company_settings.company_id`

Nothing has ever enforced one settings row per company. Now that reads are
scoped by `company_id`, a duplicate would reintroduce the same non-determinism
through a different door.

Unlike `0030`, this migration **does not auto-dedupe**: choosing which of two
rows is authoritative — whose Gmail tokens are live — is a judgment call, and
guessing wrong silently disconnects a tenant's bill inbox.

**Run `scripts/check-company-settings-duplicates.mjs` against dev and prod
before applying.** It is read-only and exits non-zero if anything needs
resolving. **This has not been run against either database.**

### Already fixed on main before this branch

The reported `GET /api/timesheets` leak (owner with view-scope "all" and no
projectId sees every company's timesheets including pay rates) was **already
resolved** on current main — `routes.ts` passes companyId and `storage` scopes
through a user subquery. No change needed.

---

## Part 2 — Still open (PR 2)

Not yet investigated in depth; line references are current as of `4ee73058` plus
this branch.

| # | Finding | Location |
|---|---|---|
| A3 | Object storage validate-then-strip — bill OCR accepts a caller-supplied bucket path. Partition the path per company, or verify the `companyId` GCS metadata written at upload | `POST /api/bills/ocr-from-path` (`routes.ts:22620`) and the object-storage service |
| A4 | `/uploads` is mounted with `express.static` **before** any auth runs — every uploaded file is world-readable to anyone who can guess a path. Move below `setupAuth` and add an ownership check | `server/index.ts:118` |
| A5 | `getEnoteAttachments(enoteId)` has no company predicate | `server/storage.ts:11044` |
| A6 | `/api/activities` takes companyId from the query/body instead of the session — a caller can name another company | `routes.ts:23070` (GET), `:23089` (POST) |
| A7 | AI summary does not check the project belongs to the caller's company | `GET /api/ai-summary/:projectId` (`routes.ts:34204`) |
| A8 | `getUserRole(id, companyId?)` — the companyId is optional and most callers omit it | `server/storage.ts:2773`, `:8548` |
| — | **`PATCH /api/users/:id` IDOR** (found while building the requireCompany allowlist, not in either audit): has `requirePermission("admin.users","edit")` but **no tenancy check** — calls `storage.updateUser` on any id supplied, so an admin in company A can edit company B's users, including email, role and password. Check the siblings at `:10595` (`/xero-link`) and `:10688` (`/timezone`) for the same gap | `routes.ts:10713` |
| — | Delete two dead files: `server/replit_integrations/object_storage/routes.ts` (unauthenticated wildcard bucket read) and `server/messaging/socket.ts` | — |
| — | **Sign the Google Calendar OAuth state.** `generateState`/`parseState` are unsigned base64 with only a timestamp check — the same class of forgery fixed for the bill inbox, on the calendar flow. Deliberately left alone in this branch to keep the change scoped | `googleOAuthService.ts:132`, `:145` |

---

## Verification status

| Check | Result |
|---|---|
| `tsc` — `TS2554`/`TS2345` on `getCompanySettings`/`updateCompanySettings` | none |
| `tsc` — errors on any changed line | none |
| `server/__tests__/oauth-state.test.ts` (no DB) | 8/8 pass |
| `server/__tests__/bill-inbox-fanout.test.ts` (no DB, no network) | 10/10 pass |
| `server/__tests__/tenant-isolation.test.ts` (needs DB) | **not run** |
| `scripts/check-company-settings-duplicates.mjs` on dev / prod | **not run** |

`npx tsc --noEmit` is **non-deterministic on this repo** — the same checkout
produced both 1365 and 1439 errors across runs, with the swing landing in files
nobody touched (`Gantt.tsx`, `Schedule.tsx`, `scheduleCascade.ts`) and many
apparent diffs being the same error with union members printed in a different
order. Total-count comparison is therefore not a usable regression signal here;
compare per-file, or per changed line.

### Before shipping

1. Run the duplicate check on dev **and** prod.
2. Apply migration `0043` to dev and prod **before** the deploy.
3. Run `tenant-isolation.test.ts` against the dev database.
4. Review what is sitting in bill inboxes that have not been polling.
