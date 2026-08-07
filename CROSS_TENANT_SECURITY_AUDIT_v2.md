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

## Part 2 — Fixed on branch `feat/tenant-isolation-pr2`

All re-verified against `main` @ `dae1e9c0` before fixing; every line number in
the original Part 2 list had moved.

| # | Finding | Status |
|---|---|---|
| A3 | Object-storage validate-then-strip | **Phase 1 done**, phase 2 open — see below |
| A4 | `/uploads` served by `express.static` above `setupAuth` — every uploaded file readable with no session | **Fixed.** Now `app.get('/uploads/*', requireAuth, serveUpload)` inside `registerRoutes`, resolving each file's owner through the table that references it |
| A5 | `getEnoteAttachments` had no company predicate | **Fixed.** Route uses a new `getOwnedEnote` guard; storage takes a required companyId and enforces it as a join |
| A6 | `/api/activities` took companyId from query/body | **Fixed.** Session only, on both GET and POST; GET also verifies a supplied `projectId` |
| A7 | AI summary never checked the project | **Fixed** via `enforceProjectCompany` |
| A8 | `getUserRole(id, companyId?)` optional and mostly omitted | **Fixed.** Required on the interface and implementation; all 17 call sites thread the owning company |
| — | `PATCH /api/users/:id` IDOR | **Fixed**, plus two worse siblings — see below |
| — | Two dead files | **Deleted** (`object_storage/routes.ts`, `messaging/socket.ts`) |
| — | Unsigned Google Calendar OAuth state | **Fixed** — reuses `signOAuthState`/`verifyOAuthState`, action-scoped to `calendar` |

### Found while fixing, not in either audit

- **`POST /api/users/:id/change-password` and `/send-password-reset` had the same
  gap as `PATCH /api/users/:id`, with worse consequences** — both took the id
  straight from the URL after the permission gate, so an admin in one company
  could set the password of, or mint a reset token for, a user in another. Fixing
  only the flagged route would have left the two that actually hand over the
  account. All three now 404 unless the target is in the caller's company.
- **`POST /api/estimate-enotes/:rowId/attachments`** never checked the note
  belonged to the caller, so a user could attach files into another company's
  estimate note. Fixed alongside A5. Because multer writes to disk before the
  handler runs, the rejection path now unlinks the file — otherwise a refused
  upload orphaned up to 50 MB.
- **The serving route's comment was wrong.** `/objects/company/:companyId/*`
  carries a comment claiming it fixes tenant isolation. It does not, for exactly
  the A3 reason. Left in place with a corrected comment; closing it is phase 2.

### A3 — why it split

The bucket is **flat**: every object lives at `${PRIVATE_OBJECT_DIR}/uploads/<uuid>`,
and the `/objects/company/<id>/` segment exists only in app-level strings. Both
consumers validate that segment against the session and then **strip it** before
the storage lookup, so the check only stops you typing someone else's id — not
putting your **own** id in front of their UUID.

Neither fix the original audit suggested is free:

- Partitioning the bucket needs every existing object copied and every stored
  path rewritten.
- Enforcing the `companyId` GCS metadata does not work as written:
  `uploadObjectEntity` (server-side) writes it, but `getObjectEntityUploadURL`
  — the **primary** client path — takes no companyId and writes no metadata.
  Enforcing on read would 403 nearly every existing file.

**Phase 1 (this branch, no migration):** bill OCR — the leg that returns document
*contents*, and the one with no DB row to authorise against, since OCR runs
before the bill exists — now requires an HMAC-signed grant binding one exact
path to one exact company, issued at upload. Generalised into
`server/utils/signedGrant.ts`.

**Phase 2 (tracked separately, needs a GCS backfill):** partition the bucket,
migrate existing objects, then enforce on `/objects/company/:companyId/*`.

**Blocked, needs a decision:** "start writing companyId metadata on presign"
could not be implemented. `signObjectURL` goes through the Replit sidecar with a
fixed request shape (`bucket_name`, `object_name`, `method`, `expires_at`) — there
is no way to sign `x-goog-meta-*` headers into the presigned PUT. Options are
(a) route uploads through the server (`/api/uploads/file` already writes the
metadata, but puts upload bandwidth through the app), or (b) add a post-upload
finalize endpoint that stamps metadata server-side. Phase 2 needs a backfill
either way.

**Severity calibration:** exploiting either A3 leg requires already knowing a
target UUID. These are random v4 and not enumerable, so this is "reachable *if*
you learn a UUID", not "any file is reachable". A5 was exactly the kind of
endpoint that leaks them, which is part of why it mattered.

---

## Verification status

| Check | Result |
|---|---|
| `tsc` — `TS2554`/`TS2345` on `getCompanySettings`/`updateCompanySettings` | none |
| `tsc` — errors on any changed line | none |
| `server/__tests__/oauth-state.test.ts` (no DB) | 8/8 pass |
| `server/__tests__/bill-inbox-fanout.test.ts` (no DB, no network) | 10/10 pass |
| `server/__tests__/require-company.test.ts` (no DB) | 12/12 pass |
| `server/__tests__/uploads-access.test.ts` (no DB) | 8/8 pass |
| `server/__tests__/signed-grant.test.ts` (no DB) | 9/9 pass |
| `server/__tests__/tenant-isolation.test.ts` (needs DB) | **not run** |
| `scripts/check-company-settings-duplicates.mjs` on dev / prod | **not run** |

PR2 adds no migrations. One behaviour change to watch on deploy: a file under
`uploads/` that no table references (orphaned by a failed write or a deleted
parent) used to serve and now 404s.

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
