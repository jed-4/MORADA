# RLS Design & Rollout Plan — Morada

**Design only. No code or schema was changed.** Branch `design/rls-plan`, cut from `origin/main`
@ `e2f03c17`. The only file this branch adds is this document.

**Context.** `CROSS_TENANT_SECURITY_AUDIT_v3.md` (branch `audit/tenant-sweep`) swept all 1,136 routes
and found 248 leaking / 40 critical, *after* three dedicated security PRs. The conclusion there — that
per-route enforcement cannot hold at this scale without a layer beneath it — is the premise here.

**Bottom line up front.** RLS is the right end state and this codebase is unusually well-positioned in
one specific way: `server/storage.ts` has **1,077 database call sites but exactly one `import { db }`**
(line 119). That single import is the whole leverage point — it makes the plumbing a one-file change
instead of a thousand-site refactor. Against that, three things make it *harder* here than the
textbook: the request lifecycle currently has no transaction boundary, `pool.query` is monkey-patched
with cross-connection retries, and dev and prod sit behind **different** pooling technologies. Honest
sizing: **6–10 weeks** of focused work (§10). **The 40 CRITICALs must not wait for it.**

---

## 1. Table inventory

193 tables in `shared/schema.ts`, classified by whether a tenancy predicate can be written today.

| category | count | meaning | RLS treatment |
|---|---|---|---|
| **A1** | **98** | direct `company_id` column | simple policy — the easy majority |
| **A2** | **86** | no `company_id`, but an FK path to one exists | `EXISTS` policy against the parent, or denormalise |
| **B** | **4** | tenant data with **no tenancy path at all** | must be restructured before RLS can apply |
| **C** | **5** | genuinely global / infrastructure | stays open (or policy on `companies.id`) |

**Category B — the blockers.** All four are the field-settings family:
`field_categories`, `field_options`, `custom_field_defs`, `custom_field_options`.

**Category C — must stay open:**

| table | why |
|---|---|
| `companies` | the tenant root itself. Gets its own policy: `USING (id = current_company_id())` |
| `permissions` | global permission catalogue, identical for all tenants, read-only in practice |
| `system_configuration` | single-row platform config. **Note: currently writable by any tenant's admin** — a v3 finding, and RLS will *not* fix it because there is nothing to scope by. Needs an app-level platform-staff gate |
| `referral_credits` | genuinely dual-company (`referrer_company_id` / `referee_company_id`) — needs a bespoke policy, see §5.4 |
| `sessions` | `connect-pg-simple` store, keyed by `sid`. Infrastructure, no tenant column, must stay open or auth breaks |

The complete table-by-table list with each table's resolved tenancy path is in **Appendix A**.

### A2 is the hidden cost

86 tables — 45% of the schema — have no `company_id` of their own. Examples: `estimate_items`
(→ `estimates` → `projects.company_id`), `bill_line_items`, `proposal_sections`,
`checklist_instance_items`, `rfq_quotes`. Some resolve in one hop, some in three.

Every one needs either a subquery policy (a correlated `EXISTS` per row) or a denormalised
`company_id` (a migration per table, plus a trigger or app change to keep it correct). This is the
single largest sizing driver and the main reason the estimate is weeks rather than days. §5.2 and §10
cost both options.

---

## 2. Tenant-context mechanism

### 2.1 What the request must do

```
request → auth → requireCompany → [NEW] open tenant context → route handler → storage.* → Postgres
                                          │
                                          └─ BEGIN; SELECT set_config('app.company_id', $1, true);
```

`set_config(..., true)` is **transaction-local** — it is discarded at COMMIT/ROLLBACK and cannot leak
onto the next user of that pooled connection. That property is the reason to prefer it over a
session-level `SET` (see §2.4).

### 2.2 The linchpin: one proxy covers 1,077 call sites

`server/storage.ts` is 26,392 lines with 1,343 async methods and 1,077 direct `db.*` calls — but it
imports `db` exactly once. Replacing that export with an AsyncLocalStorage-aware proxy re-points every
one of those call sites without editing them:

```ts
// server/db.ts  — sketch, not final code
export const tenantContext = new AsyncLocalStorage<{ companyId: string; tx: any }>();

const rawDb = drizzle({ client: pool, schema });

export const db: typeof rawDb = new Proxy(rawDb, {
  get(target, prop, receiver) {
    const ctx = tenantContext.getStore();
    const active = ctx?.tx ?? target;     // request-scoped tx when inside one
    return Reflect.get(active, prop, active);
  },
});
```

Storage code keeps calling `db.select()...` unchanged. Inside a request it transparently runs on the
request's transaction (which carries `app.company_id`); outside one — background jobs, startup — it
falls through to the raw handle. **This is what makes the project tractable.**

Two caveats, both manageable:

- **Nested transactions.** `storage.ts` calls `db.transaction()` at 19 sites. Inside a request-scoped
  transaction these become Drizzle savepoints, which is correct behaviour, but it must be verified —
  savepoint semantics on rollback differ from top-level rollback.
- **Advisory locks.** Four sites take `pg_advisory_xact_lock` (`storage.ts:17931/17954/17997/17998`,
  invoice and PO numbering). These are *transaction*-scoped. Under a request-wide transaction the lock
  is held for the whole request instead of a short inner one. Given Neon round-trip latency (~400 ms
  from AU) and known N+1 patterns, this is a genuine contention risk on the numbering paths and needs
  measuring before rollout.

### 2.3 The raw `pool.query` path — 43 sites

`db.ts` monkey-patches `pool.query` with a retry wrapper. Raw calls check out an **arbitrary** pooled
connection, so they do **not** see the request's transaction or its `app.company_id`.

Under RLS this **fails closed, not open**: with no setting, `current_setting('app.company_id', true)`
returns NULL, the policy predicate is NULL, and the row is filtered out. A missed raw call site returns
zero rows or violates a `WITH CHECK` — a loud error, never a silent leak. That is the single best
property of this migration and it should be leaned on deliberately: **turn the raw sites into errors
and fix what breaks.**

The 43 sites, by disposition:

| location | count | disposition |
|---|---|---|
| `server/referrals.ts` | 20 | cross-company by nature → **service role** (§4) |
| `server/routes.ts` | 10 | per-request → convert to the request handle |
| `server/index.ts` | 8 | startup DDL / one-off data fixes → **service role** |
| `server/services/onboardingEmails.ts` | 6 | cross-company sweep → **service role** |
| `server/foundingMembers.ts` | 3 | global counter over `companies` → **service role** |
| `server/services/*`, `server/utils/*`, `server/ai/executor.ts`, `server/middleware/uploadsAccess.ts` | 6 | case-by-case |

Only ~16 of the 43 are per-request and need conversion. The rest are legitimately cross-tenant and are
better served by an explicit service role than by threading context into them.

**A specific hazard in the retry wrapper:** it retries "ambiguous" errors for read-only statements on a
*fresh* connection. With transaction-scoped context that is safe (the transaction has already aborted,
so the retry fails loudly). With a session-scoped `SET` it would be actively dangerous — the retry
could land on a connection carrying **another request's** company id. This alone rules out the
session-scoped variant.

### 2.4 Pooling — and why dev and prod differ

This is the part most RLS write-ups get to skip, and Morada cannot.

- **Production** (`replit.md:58`): `ep-delicate-flower-aeoexpyq.c-2.us-east-2.aws.neon.tech`. **No
  `-pooler` suffix** — this is a Neon *direct* endpoint. Combined with `@neondatabase/serverless`
  `Pool` over WebSocket, each pooled client is a real Postgres session. Session-level `SET` would
  technically work here.
- **Development** (`replit.md:57`): `host=helium` — "Replit's internal PostgreSQL connection pooler",
  a proxy. If it pools in transaction mode (PgBouncer-style), session-level state is **not** sticky and
  a session `SET` silently lands on the wrong connection.

So a session-scoped design would work in prod and break — or worse, *appear* to work while leaking — in
dev. **Transaction-scoped `set_config(..., true)` is correct under both**, and is therefore the design.
It also survives any future move to Neon's `-pooler` endpoint, which is a realistic scaling step.

### 2.5 The cost of this choice, stated plainly

Transaction-scoped context requires the request's queries to share one transaction, which means
**every mutating request holds an open transaction and a pooled connection for its full duration.**
With ~400 ms round trips and existing N+1 patterns, some requests will hold a transaction for seconds.
Consequences to plan for:

- `Pool` max connections is **not configured** in `db.ts` (library default, 10). Request-duration
  checkout will exhaust that under modest concurrency. Needs sizing and an explicit `max`.
- Idle-in-transaction exposure — set `idle_in_transaction_session_timeout` so a stalled request cannot
  pin a connection indefinitely.
- Read-heavy GETs get wrapped in transactions they do not need.

**Mitigation:** open the transaction lazily — on the first database call within the request, not in the
middleware — and for `GET` requests use a `READ ONLY` transaction. Both are small additions to the
same wrapper. This should be load-tested in Phase 2, not assumed.

---

## 3. The DB-role gotcha — make or break

**Postgres does not apply RLS to a table's owner.** `ENABLE ROW LEVEL SECURITY` alone is a no-op for
the owning role. Roles with `BYPASSRLS` (and superusers) are likewise exempt.

Morada connects with whatever role is in `DATABASE_URL`. On a Replit-managed Neon project that is
almost certainly `neondb_owner` — **the role that owns every table**. If so, enabling RLS today changes
nothing at all, every test passes, and the isolation is imaginary. This must be settled before any
other work.

### Verify first (read-only, run against dev and prod)

```sql
SELECT current_user,
       rolsuper, rolbypassrls, rolcreaterole
  FROM pg_roles WHERE rolname = current_user;

SELECT tablename, tableowner
  FROM pg_tables WHERE schemaname = 'public' LIMIT 5;   -- owner == current_user?
```

### Two mechanisms; use both

1. **`FORCE ROW LEVEL SECURITY`** — makes policies apply to the table owner too:
   ```sql
   ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
   ALTER TABLE bills FORCE  ROW LEVEL SECURITY;   -- without this, an owner connection ignores it
   ```
   Necessary if the app keeps connecting as the owner. **Note it also applies to migrations and
   maintenance run as that role**, which is a real operational footgun — a manual `psql` fix-up as the
   owner will silently see only the rows its (unset) context allows. Mitigate by having the service
   role (below) available for ops work.

2. **A dedicated non-owner application role** — the cleaner end state:
   ```sql
   CREATE ROLE morada_app  LOGIN PASSWORD '…' NOBYPASSRLS;
   GRANT USAGE ON SCHEMA public TO morada_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO morada_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO morada_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO morada_app;
   ```
   Then point `DATABASE_URL` at `morada_app`. Tables stay owned by `neondb_owner`, which continues to
   run migrations unimpeded.

**Recommendation: do both.** Non-owner app role as the primary control, `FORCE` as belt-and-braces so
that a future credential change back to the owner role does not silently disable isolation.

**Unverified, and genuinely blocking:** whether the Replit-managed Neon project permits `CREATE ROLE`,
and whether Replit's deployment tooling would overwrite a hand-edited `DATABASE_URL`. `neondb_owner`
normally has `CREATEROLE`, but "normally" is not good enough for the thing the whole design rests on.
**This is the Phase 0 spike** (§10) and nothing else should start until it returns an answer.

If role creation turns out to be impossible, the fallback is `FORCE ROW LEVEL SECURITY` plus a
`morada_service` role for sweeps — workable, but it puts migrations and RLS on the same role and raises
the operational care required.

---

## 4. Legitimate cross-tenant operations

These must keep working. Under RLS they break unless deliberately exempted.

### Design: a second connection pool on a service role

```ts
// server/db.ts — sketch
export const servicePool = new Pool({ connectionString: process.env.DATABASE_SERVICE_URL });
export const serviceDb   = drizzle({ client: servicePool, schema });
```

`morada_service` is granted `BYPASSRLS` (or is exempted by a `TO morada_service` policy). It is used
**only** by the call sites listed below — never by a request handler. Enforce that with a lint rule:
`serviceDb` / `servicePool` may not be imported from `server/routes.ts` or `server/storage.ts`.

Preferred where practical: **per-company context switching in the loop** rather than blanket bypass —
the sweep enumerates companies on the service handle, then processes each company with
`app.company_id` set to that company. That keeps the tenant predicate live for the actual work and
limits bypass to the enumeration step. This mirrors the fan-out pattern PR #33 already established for
the bill inbox.

### Complete call-site list

| # | site | what it does | disposition |
|---|---|---|---|
| 1 | `gmailBillPoller.ts:327` sweep | polls every company's bill inbox | enumerate on service handle, then per-company context |
| 2 | `reminderProcessor.ts:26` `getDueReminders` | cross-tenant due-reminder sweep | same |
| 3 | `reminderProcessor.ts:107` `getActiveBusinessRemindersForTime` | cross-tenant business reminders | same |
| 4 | `storage.ts:13680` `getAllCompanySettings` | all tenants' settings (bill-inbox fan-out) | service handle |
| 5 | `storage.ts:13649` `expireLapsedTrials` | one `UPDATE` across all companies | service handle |
| 6 | `index.ts:466` trial expiry sweep | hourly | service handle |
| 7 | `index.ts:481` onboarding email sweep (+ `onboardingEmails.ts` ×6 raw) | hourly, all companies | service handle |
| 8 | `index.ts:497` referral credit sweep (+ `referrals.ts` ×20 raw) | inherently two-company | service handle |
| 9 | `foundingMembers.ts` ×3 raw | global count over `companies` | service handle |
| 10 | `xeroPushWorker.ts:47` drain | queue across tenants | enumerate, then per-company |
| 11 | `xeroReconcileScheduler.ts:93` | per-connection reconcile | enumerate, then per-company |
| 12 | `scheduledMessageProcessor.ts:57` | scheduled message dispatch | enumerate, then per-company |
| 13 | `pushNotifications.ts:216` receipt sweeper | Expo receipts, cross-tenant | service handle |
| 14 | `index.ts:551–558` startup DDL/data fixes | `ALTER TYPE`, bulk `UPDATE` | service handle (or owner) |
| 15 | `POST /api/webhooks/email-invoice` (`routes.ts:23052`) | **currently picks `users[0]` globally** | **do not exempt.** This is a live v3 CRITICAL. Fix the tenant routing first; it should run *in* a tenant context, not bypass |
| 16 | `POST /api/stripe/webhook` (`index.ts:65`) | signature-authed, resolves company from the Stripe customer | service handle to resolve, then per-company context |
| 17 | `POST /api/xero/webhook` (`routes.ts:36252`) | HMAC-authed, resolves company from the connection | same |
| 18 | Token-gated portals (`/api/portal/*`, proposal client-view, PO sign) | no session, token *is* the authorisation | resolve the token on the service handle, then set context to the token's company |
| 19 | `middleware/uploadsAccess.ts` owner resolution | resolves a file's owning company | service handle for the lookup, compare in app code |
| 20 | `seed-lenny.ts`, `healContactNames.ts`, `syncOverheadActuals.ts` | scripts / maintenance | service handle |

Item 18 is the subtle one and worth calling out: portal routes have **no `req.user`**, so the middleware
cannot derive a company. They must resolve token → company on the service handle and *then* open a
tenant context for the rest of the request. Missing this turns every supplier/client portal into a
500 on rollout day.

---

## 5. Policy shapes

### 5.0 Helper function

```sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_company_id() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.company_id', true), '')
$$;
```

`current_setting(…, true)` returns NULL when unset rather than raising — so **an un-contexted
connection sees nothing and can write nothing**. Fail-closed by construction.

`STABLE` + wrapping the call as `(SELECT app.current_company_id())` inside policies lets the planner
hoist it into an InitPlan and evaluate it **once per query instead of once per row**. On large scans
this is the difference between negligible and material overhead — do not skip the `SELECT` wrapper.

### 5.1 Category A1 — 98 tables with `company_id`

```sql
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON bills
  FOR ALL
  USING      (company_id = (SELECT app.current_company_id()))
  WITH CHECK (company_id = (SELECT app.current_company_id()));
```

`USING` filters reads (and the pre-image of UPDATE/DELETE); `WITH CHECK` validates the post-image of
INSERT/UPDATE. Both are required — `USING` alone would let a row be *updated into* another tenant,
which is precisely the §5.2 mass-assignment class from the v3 audit. **RLS closes that entire class
structurally**, which is a large part of the value here.

This policy is identical for all 98 tables and should be **generated** from the table inventory, not
hand-written.

### 5.2 Category A2 — 86 tables reached through a parent

Two options, and the choice is per-table rather than global.

**(a) Subquery policy — no migration:**
```sql
CREATE POLICY tenant_isolation ON estimate_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM estimates e
     WHERE e.id = estimate_items.estimate_id
       AND e.company_id = (SELECT app.current_company_id())))
  WITH CHECK (EXISTS ( … same … ));
```
Correct and zero-migration, but adds a correlated lookup per row. Fine for by-id access and small
child collections; costly on wide scans, and worse for the three-hop tables.

**(b) Denormalise `company_id` onto the child — migration per table:**
Faster and gives a uniform policy, but 86 migrations plus a mechanism to keep the column honest (a
`BEFORE INSERT/UPDATE` trigger is the reliable one; relying on app code re-introduces exactly the
class of bug being eliminated).

**Recommendation:** start with (a) everywhere — it needs no migration and is immediately correct — then
selectively denormalise the hot tables (`estimate_items`, `bill_line_items`, `schedule_items`,
`timesheets`, `scope_items`) if measurement shows it is warranted. Measure before migrating 86 tables.

### 5.3 Category B — field settings, after restructure

Once `company_id` exists (§6), they become ordinary A1 tables with the standard policy. Nothing special
— which is the point of doing the restructure first.

### 5.4 Category C

| table | policy |
|---|---|
| `companies` | `USING (id = (SELECT app.current_company_id()))` — a tenant sees only its own row |
| `permissions` | RLS off. Global read-only catalogue |
| `sessions` | RLS off. Auth infrastructure |
| `system_configuration` | RLS off — but add an app-level platform-staff gate; RLS cannot help here |
| `referral_credits` | `USING (referrer_company_id = cur OR referee_company_id = cur)`, `WITH CHECK` restricted to the service role, since only the sweep writes it |

---

## 6. Prerequisite work

### 6.1 Field settings — a fix already exists, and it is good

`origin/feat/allowances` carries `migrations/0040_field_settings_company_scope.sql` (72 lines).
**Assessment: sound.** It adds `company_id` to both tables, clones the global rows per company using
deterministic `md5(company_id || original_id)` ids so `category_id` and the `parent_id` self-reference
remap without a mapping table, deletes the originals, sets `NOT NULL`, adds the FKs, and swaps the
global unique on `key` for `(company_id, key)` — dropping the global unique *first*, which is required
or every clone collides. It is safe on existing data because nothing FKs into `field_options.id`
(`estimate_items` stores the unit name; `allowance_status` stores the option key).

**Correction to the v3 audit:** that document says the branch's migration is numbered `0037` and
collides with `main`. It has since been renumbered to `0040` (commit `cc324add`). The collision is
resolved. A lesser numbering wrinkle remains: `main` is already at `0043`, so `0040` will land
out of sequence. Harmless given migrations are applied manually, but note it so a future replay on a
fresh database is not assumed to be ordered.

**It covers only two of the four Category-B tables.**

### 6.2 `custom_field_defs` / `custom_field_options` — delete rather than migrate

Every `DbStorage` method for these is an inert stub (`storage.ts:9789–9798`): reads return `[]` /
`undefined`, writes `throw new Error("Not implemented")` or return `false`. The ~10 routes exposing
them cannot read or write anything. **Recommendation: drop both tables and their routes** rather than
spend a migration making dead tables tenant-aware. That removes half of Category B for near-zero cost.
Confirm the tables are empty in prod first.

### 6.3 `company_id` indexes — the quiet prerequisite

Of the 98 A1 tables, only **9** declare an index whose column list includes `companyId`, and the
migrations contain just **2** `company_id` index statements. Every RLS policy adds a `company_id`
predicate to *every* query on the table. Without indexes, list queries that currently seq-scan will
keep seq-scanning with an extra filter, and some plans will regress.

**~90 indexes to add**, mechanically generatable from the inventory, using
`CREATE INDEX CONCURRENTLY` so no table is locked on a live database. Note `CONCURRENTLY` cannot run
inside a transaction block — the migration must be a plain script, not wrapped.

### 6.4 Sequencing against pending migrations

Already prod-pending across branches: `0032`/`0033` (onboarding), `0034`/`0035` (bills), `0036`
(allowances), `0037` (checklist), `0040` (field settings), `0043` (company settings). RLS adds its own.
Ordering these against each other and against the external-company onboarding date is an operational
decision, not a technical one — but it needs an owner, and the index migration (§6.3) should land
*before* policies, not with them.

---

## 7. Rollout phasing & safety

### 7.1 There is no built-in audit mode — build the equivalent

Postgres has no "log-only" RLS. The closest safe equivalent, and the one to use:

**Step 1 — enable RLS with a deliberately permissive policy.**
```sql
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bills FOR ALL USING (true) WITH CHECK (true);
```
This proves the *plumbing* — that RLS is genuinely active on this role, that no query path breaks —
while changing no results. Any code path that misbehaves here is a wiring bug, not a policy bug.

**Step 2 — swap the policy to the real predicate.**
```sql
BEGIN;
  DROP POLICY tenant_isolation ON bills;
  CREATE POLICY tenant_isolation ON bills FOR ALL
    USING      (company_id = (SELECT app.current_company_id()))
    WITH CHECK (company_id = (SELECT app.current_company_id()));
COMMIT;
```
Fast DDL, transactional, and instantly reversible.

Separately, a **shadow check** is worth running in staging before step 2: for a sampled set of
read queries, execute once with context and once on the service handle, and log any row-count
difference. Differences are exactly the rows RLS is about to start hiding — if any of them are rows the
tenant legitimately needs, that is a lockout waiting to happen.

### 7.2 Order of enablement

Enable in waves, lowest blast radius first. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` takes a brief
`ACCESS EXCLUSIVE` lock — sub-millisecond on an idle table, but it queues behind long transactions, so
run waves during a quiet window and with `lock_timeout` set.

| wave | tables | rationale |
|---|---|---|
| 0 | one low-traffic A1 table (`suppliers`) | end-to-end proof on production |
| 1 | remaining A1 leaf tables (no children) | simple policies, contained |
| 2 | A1 core entities (`projects`, `bills`, `estimates`, `purchase_orders`, …) | highest value, highest care |
| 3 | A2 one-hop children | subquery policies |
| 4 | A2 two/three-hop children | most expensive to verify |
| 5 | Category B (post-restructure) + `companies` | last, once the pattern is proven |

### 7.3 Rollback

Per table, instant, no data change:
```sql
ALTER TABLE bills DISABLE ROW LEVEL SECURITY;   -- policies remain defined, simply not enforced
```
Keep a generated `rls_disable_all.sql` in the repo and rehearse running it against staging so nobody is
composing SQL during an incident. Note that disabling reopens the tenancy hole — it is an availability
lever, not a security one, and must be paired with an alert.

### 7.4 Deployment ordering

The context plumbing (§2) must be **live in production and proven** before any real policy is enabled.
It is a no-op on its own: setting `app.company_id` on a database with no policies changes nothing. Ship
it, watch it for a few days, then start wave 0. Do not ship plumbing and policies together.

---

## 8. Test strategy

Both directions, on every tenant table. 184 tenant tables × 4 assertions is ~736 checks — far too many
to hand-write, and hand-writing them would reproduce the v3 blind spot (you cannot assert what you did
not think of). **Generate the harness from the table inventory.**

### 8.1 Generated SQL matrix (the core)

For each A1/A2 table, with fixtures for company A and company B:

| # | assertion | direction |
|---|---|---|
| 1 | context=A → `SELECT` returns A's row and **not** B's | no leak (read) |
| 2 | context=A → `UPDATE` targeting B's row affects **0 rows** | no leak (write) |
| 3 | context=A → `DELETE` targeting B's row affects **0 rows** | no leak (delete) |
| 4 | context=A → `INSERT` with B's `company_id` raises `42501` | no leak (`WITH CHECK`) |
| 5 | context=A → `SELECT/UPDATE/DELETE` of A's own row **succeeds** | **no lockout** |
| 6 | no context set → every statement returns 0 rows / is rejected | fail-closed |

Assertion 5 is the one that prevents an outage and the one most likely to be skipped. It deserves equal
weight to 1–4.

pgTAP is the natural fit; a plain SQL script with `RAISE EXCEPTION` on mismatch works too and avoids a
new extension dependency on Neon. Either way it runs against a scratch database in CI.

### 8.2 Application-level suite

SQL-level tests prove the policies. They do not prove the *plumbing* — that the middleware sets context
on every path. For that, extend the existing `server/__tests__/tenant-isolation.test.ts` (it already
boots the real app against a database and has the two-company fixture) with:

- a request per route family as company B against company A's records → 404, not 500;
- **and the positive control** — the same request as company A succeeds. A 500 storm on rollout day
  looks nothing like a leak, and only the positive controls catch it.
- portal / webhook / background-job paths explicitly (§4 item 18 is the likeliest breakage).

### 8.3 A guard against regression

Once policies are live, add a CI check that every table in `shared/schema.ts` classified A1/A2 has
`relrowsecurity = true` and at least one policy. A new table without RLS should fail the build — that
is the ratchet that stops the 248-route situation recurring at the database layer.

---

## 9. Risk & performance

| risk | consequence | mitigation |
|---|---|---|
| **RLS silently inactive** (owner role, no `FORCE`) | complete false confidence — everything passes, nothing is enforced | §3 Phase-0 spike; assertion 6 in the harness fails loudly if context is ignored |
| **Over-restrictive policy** | outage — users cannot see their own data | positive-control tests (§8.1 #5); permissive-first rollout (§7.1); per-table disable |
| **Under-restrictive policy** | leak, silent | generated policies (no per-table hand-editing); assertions 1–4 |
| **Missed raw `pool.query`** | that call path breaks | **fails closed** — errors, not leaks. Convert the 16 per-request sites; service role for the rest |
| **Portal / webhook paths have no session** | 500s for suppliers and clients on rollout day | §4 item 18 — resolve token → company on the service handle, then set context |
| **Connection exhaustion** | request queuing / timeouts | `Pool.max` is currently unset (default 10) — size it; lazy transaction open; `READ ONLY` for GETs |
| **Advisory-lock contention** | invoice/PO numbering serialises across a whole request | measure the four sites (§2.2); consider moving numbering into its own short transaction |
| **Retry wrapper crossing connections** | with session-scoped context, cross-tenant contamination | designed out by using transaction-scoped `set_config` (§2.3) |
| **Service role over-used** | RLS quietly bypassed everywhere | lint rule forbidding `serviceDb` in routes/storage; keep the §4 list as the allowlist and review additions |

### Performance

- **Per-query cost.** A simple `company_id = <constant>` predicate is cheap. The two things that make
  it not cheap: (i) calling `current_setting()` per row instead of once — fixed by `STABLE` + the
  `(SELECT …)` wrapper; (ii) A2 subquery policies, which add a correlated lookup per row.
- **Indexes.** ~90 A1 tables lack a `company_id` index (§6.3). This is the single largest performance
  prerequisite. `CREATE INDEX CONCURRENTLY`, before policies.
- **Plan changes.** RLS predicates can change plans on large tables. Capture `EXPLAIN` for the ~20
  heaviest queries before and after wave 2.
- **Latency context.** Neon is `us-east-2`; the team is in AU (~400 ms round trip). Anything that adds
  round trips hurts disproportionately — `set_config` is one extra statement per request, which is
  acceptable, but it argues strongly against any design that adds a round trip per *query*.

---

## 10. Effort estimate

Assumes one experienced engineer who knows this codebase, working in focused blocks — not alongside a
full feature load. Sizes are working days.

| phase | work | days |
|---|---|---|
| **0** | **Spike: settle the role question.** Confirm the connecting role, table ownership, whether `CREATE ROLE` is permitted on Replit-managed Neon, whether `DATABASE_URL` survives redeploys, and whether dev's `helium` proxy is transaction-pooled. Prove RLS actually bites on one throwaway table in dev. **Blocks everything.** | **1–2** |
| **1** | Prerequisites: review + land field-settings `0040`; drop the dead `custom_field_*` tables and routes; generate and apply ~90 `company_id` indexes `CONCURRENTLY` | 3–5 |
| **2** | Tenant-context plumbing: ALS + `db` proxy, middleware, lazy/`READ ONLY` transaction handling, service pool + role, convert ~16 per-request raw sites, portal/webhook context resolution, load-test connection behaviour | **6–10** |
| **3** | A1 policies (98 tables): generator, migration, permissive-then-strict rollout | 3–5 |
| **4** | A2 policies (86 tables): subquery policies, per-hop verification, selective denormalisation of hot tables | **6–12** |
| **5** | Test harness: generated SQL matrix (~736 assertions), app-level extensions, CI ratchet | 4–6 |
| **6** | Staged production rollout: waves 0–5 with monitoring and soak time between waves | 3–5 |
| **7** | Cross-tenant sweep conversion + the §4 call-site work not already done in Phase 2 | 2–3 |
| | **Total** | **28–48 days** |

**Honest range: 6–10 weeks** of focused engineering. Realistically longer in calendar time for a
solo developer also shipping features — **3–4 months elapsed** is a fair planning assumption.

### What pushes the number up, specific to this codebase

1. **A2 is 86 tables — 45% of the schema.** Most RLS write-ups assume every table carries the tenant
   key. Here fewer than half do. Phase 4 is the biggest single line item and the least predictable.
2. **No transaction boundary exists today.** The request lifecycle has to grow one. That is Phase 2's
   risk, and it is a behavioural change to every write path, not just a security change.
3. **Dev and prod pool differently** (`helium` proxy vs Neon direct). Anything that works in one must be
   re-verified in the other; a design that only works in prod is worse than useless.
4. **43 raw `pool.query` sites behind a retry wrapper** that can move a query to a different connection.
5. **Four transaction-scoped advisory locks** whose hold time changes under request-wide transactions.
6. **`Pool.max` is unset** and request-duration checkout is a new load profile at ~400 ms RTT.
7. **Migration queue congestion** — six-plus prod-pending migrations across branches before RLS adds
   its own (§6.4).

### What pulls it down

- **The single `db` import in `storage.ts`** covering 1,077 call sites (§2.2). Without this, Phase 2
  would be a multi-week refactor on its own instead of days.
- **98 tables already carry `company_id`** — the A1 policy is generated, not authored.
- **The existing field-settings migration is sound** and already renumbered; it needs review, not
  authorship.
- **`tenant-isolation.test.ts` already has** the two-company fixture and boots the real app.
- **Failures are fail-closed by construction** — missed sites error rather than leak, so the migration
  surfaces its own gaps.

### Recommended sequencing against the external-company onboarding

RLS will not be ready for it. That is fine, provided the order is right:

1. **Now:** fix the 40 CRITICALs from the v3 audit and the four Category-B/structural items. These are
   days of work, not weeks, and several are cross-tenant *writes* (`POST /api/invitations`, the
   email-invoice webhook, the budget subsystem, the Xero OAuth state).
2. **Also now, cheap:** the CI guard from v3 §8 — fail the build on a new route handler with no
   company token. Stops the leak count growing while the real fix is built.
3. **Then Phase 0.** One to two days, and it determines whether this plan is viable as written.
4. **Then Phases 1–7**, with the external company already onboarded behind the fixed per-route guards.

Treating RLS as the reason to defer the CRITICALs would be the one genuinely bad outcome here.

---

## Appendix A — complete table inventory

`A1` = direct `company_id` · `A2` = reachable via FK · `B` = no tenancy path, needs restructure ·
`C` = global / infrastructure

**Read the A2 paths as candidates, not conclusions.** They were derived mechanically by shortest FK
path, which is not always the semantically correct parent. `activity_notes` resolves as
`userId → users.company_id` — technically a valid path, but the *meaningful* owner is the schedule item
the note hangs off, and scoping by author would behave differently for a note written by a user who
later moves company. Every A2 policy needs its parent confirmed by hand before it is written. Budget
for that in Phase 4; it is part of why that phase is 6–12 days rather than 3.

| # | table | cat | tenancy path |
|---|---|---|---|
| 1 | `activities` | A1 | company_id |
| 2 | `activity_notes` | A2 | userId→users |
| 3 | `ai_blocked_items` | A1 | company_id |
| 4 | `ai_conversations` | A1 | company_id |
| 5 | `ai_messages` | A2 | conversationId→ai_conversations |
| 6 | `allowance_items` | A2 | sourceSelectionId→selections → projectId→projects |
| 7 | `bill_approvals` | A2 | billId→bills |
| 8 | `bill_line_item_allowances` | A2 | estimateItemId→estimate_items → costCategoryId→cost_categories |
| 9 | `bill_line_item_price_links` | A2 | priceListItemId→price_list_items |
| 10 | `bill_line_items` | A2 | billId→bills |
| 11 | `bill_payments` | A2 | billId→bills |
| 12 | `bills` | A1 | company_id |
| 13 | `budget_line_items` | A2 | costCodeId→cost_codes |
| 14 | `budgets` | A2 | projectId→projects |
| 15 | `business_dashboard_views` | A1 | company_id |
| 16 | `business_reminders` | A1 | company_id |
| 17 | `business_schedule_projects` | A1 | company_id |
| 18 | `calendar_views` | A1 | company_id |
| 19 | `channel_members` | A2 | channelId→channels |
| 20 | `channels` | A1 | company_id |
| 21 | `checklist_audit_log` | A1 | company_id |
| 22 | `checklist_instance_groups` | A2 | instanceId→checklist_instances |
| 23 | `checklist_instance_items` | A2 | instanceId→checklist_instances |
| 24 | `checklist_instances` | A1 | company_id |
| 25 | `checklist_status_triggers` | A1 | company_id |
| 26 | `checklist_template_groups` | A2 | templateId→checklist_templates |
| 27 | `checklist_template_items` | A2 | assignedRoleId→user_roles |
| 28 | `checklist_templates` | A1 | company_id |
| 29 | `client_invoice_items` | A2 | invoiceId→client_invoices |
| 30 | `client_invoice_payments` | A2 | invoiceId→client_invoices |
| 31 | `client_invoices` | A1 | company_id |
| 32 | `client_selections` | A2 | projectId→projects |
| 33 | `companies` | C | tenant root — policy on id |
| 34 | `company_direct_cost_actuals` | A1 | company_id |
| 35 | `company_income_actuals` | A1 | company_id |
| 36 | `company_oh_settings` | A1 | company_id |
| 37 | `company_settings` | A1 | company_id |
| 38 | `contact_insurances` | A2 | contactId→contacts |
| 39 | `contacts` | A1 | company_id |
| 40 | `cost_categories` | A1 | company_id |
| 41 | `cost_codes` | A1 | company_id |
| 42 | `custom_field_defs` | B | ** no tenancy path ** |
| 43 | `custom_field_options` | B | ** no tenancy path ** |
| 44 | `dashboard_themes` | A1 | company_id |
| 45 | `dashboard_view_permissions` | A2 | viewId→dashboard_views |
| 46 | `dashboard_views` | A1 | company_id |
| 47 | `defects` | A2 | projectId→projects |
| 48 | `doc_folders` | A1 | company_id |
| 49 | `docs` | A1 | company_id |
| 50 | `drive_file_activity_logs` | A1 | company_id |
| 51 | `drive_file_attachments` | A1 | company_id |
| 52 | `drive_folder_templates` | A1 | company_id |
| 53 | `enote_attachments` | A2 | enoteId→estimate_enotes → estimateId→estimates → projectId→projects |
| 54 | `enote_template_sets` | A1 | company_id |
| 55 | `enote_templates` | A1 | company_id |
| 56 | `estimate_enotes` | A2 | estimateId→estimates → projectId→projects |
| 57 | `estimate_groups` | A2 | defaultCostCode→cost_codes |
| 58 | `estimate_items` | A2 | costCategoryId→cost_categories |
| 59 | `estimate_notes` | A2 | userId→users |
| 60 | `estimate_templates` | A1 | company_id |
| 61 | `estimates` | A2 | projectId→projects |
| 62 | `favorite_cost_codes` | A1 | company_id |
| 63 | `favorite_suppliers` | A1 | company_id |
| 64 | `field_categories` | B | ** no tenancy path ** |
| 65 | `field_options` | B | ** no tenancy path ** |
| 66 | `focus_blocks` | A1 | company_id |
| 67 | `folder_templates` | A1 | company_id |
| 68 | `hbcf_projects` | A1 | company_id |
| 69 | `invoice_allowances` | A2 | invoiceId→client_invoices |
| 70 | `invoice_bills` | A2 | invoiceId→client_invoices |
| 71 | `invoice_estimates` | A2 | invoiceId→client_invoices |
| 72 | `invoice_selections` | A2 | invoiceId→client_invoices |
| 73 | `invoice_timesheets` | A2 | invoiceId→client_invoices |
| 74 | `invoice_variations` | A2 | invoiceId→client_invoices |
| 75 | `job_number_counters` | A1 | company_id |
| 76 | `labour_estimate_categories` | A2 | labourEstimateId→labour_estimates |
| 77 | `labour_estimate_tasks` | A2 | categoryId→labour_estimate_categories → labourEstimateId→labour_estimates |
| 78 | `labour_estimates` | A1 | company_id |
| 79 | `labour_hours_budget` | A2 | projectId→projects |
| 80 | `labour_task_templates` | A1 | company_id |
| 81 | `message_attachments` | A2 | messageId→messages → channelId→channels |
| 82 | `message_reactions` | A2 | userId→users |
| 83 | `messages` | A2 | channelId→channels |
| 84 | `minutes` | A2 | projectId→projects |
| 85 | `non_working_days` | A1 | company_id |
| 86 | `note_groups` | A1 | company_id |
| 87 | `note_template_fields` | A2 | templateId→note_templates |
| 88 | `note_templates` | A1 | company_id |
| 89 | `notifications` | A1 | company_id |
| 90 | `oh_pipeline_jobs` | A1 | company_id |
| 91 | `onboarding_email_log` | A1 | company_id |
| 92 | `option_attachments` | A2 | optionId→selection_options → approvedById→users |
| 93 | `overhead_categories` | A1 | company_id |
| 94 | `overhead_forecast_overrides` | A2 | itemId→overhead_items → categoryId→overhead_categories |
| 95 | `overhead_items` | A2 | categoryId→overhead_categories |
| 96 | `overhead_month_actuals` | A2 | itemId→overhead_items → categoryId→overhead_categories |
| 97 | `overhead_month_status` | A1 | company_id |
| 98 | `password_reset_tokens` | A2 | userId→users |
| 99 | `payment_terms_options` | A1 | company_id |
| 100 | `permissions` | C | global permission catalogue |
| 101 | `pinned_items` | A1 | company_id |
| 102 | `price_list_categories` | A1 | company_id |
| 103 | `price_list_items` | A1 | company_id |
| 104 | `product_images` | A2 | productId→products |
| 105 | `products` | A1 | company_id |
| 106 | `project_workflows` | A2 | projectId→projects |
| 107 | `projects` | A1 | company_id |
| 108 | `proposal_acceptances` | A2 | proposalId→proposals |
| 109 | `proposal_items` | A2 | proposalId→proposals |
| 110 | `proposal_payment_milestones` | A1 | company_id |
| 111 | `proposal_sections` | A2 | proposalId→proposals |
| 112 | `proposals` | A1 | company_id |
| 113 | `purchase_order_attachments` | A2 | purchaseOrderId→purchase_orders |
| 114 | `purchase_order_items` | A2 | purchaseOrderId→purchase_orders |
| 115 | `purchase_order_signatures` | A2 | purchaseOrderId→purchase_orders |
| 116 | `purchase_order_templates` | A1 | company_id |
| 117 | `purchase_orders` | A1 | company_id |
| 118 | `push_tokens` | A2 | userId→users |
| 119 | `referral_credits` | C | dual-company (referrer/referee) |
| 120 | `reminder_notifications` | A2 | businessReminderId→business_reminders |
| 121 | `reminders` | A1 | company_id |
| 122 | `rfi_comments` | A2 | rfiId→rfis |
| 123 | `rfi_templates` | A1 | company_id |
| 124 | `rfis` | A1 | company_id |
| 125 | `rfq_follow_ups` | A2 | rfqId→rfqs |
| 126 | `rfq_items` | A2 | rfqId→rfqs |
| 127 | `rfq_portal_tokens` | A2 | rfqId→rfqs |
| 128 | `rfq_quotes` | A2 | rfqId→rfqs |
| 129 | `rfq_templates` | A1 | company_id |
| 130 | `rfqs` | A1 | company_id |
| 131 | `role_permissions` | A2 | roleId→user_roles |
| 132 | `schedule_baseline_items` | A2 | baselineId→schedule_baselines → createdBy→users |
| 133 | `schedule_baselines` | A2 | createdBy→users |
| 134 | `schedule_item_steps` | A2 | scheduleItemId→schedule_items → scopeStageId→scope_stages |
| 135 | `schedule_items` | A2 | scopeStageId→scope_stages |
| 136 | `schedule_templates` | A1 | company_id |
| 137 | `schedules` | A2 | projectId→projects |
| 138 | `scope_gear_photos` | A1 | company_id |
| 139 | `scope_item_type_definitions` | A1 | company_id |
| 140 | `scope_items` | A1 | company_id |
| 141 | `scope_stages` | A1 | company_id |
| 142 | `scope_templates` | A1 | company_id |
| 143 | `selection_comments` | A2 | createdById→users |
| 144 | `selection_options` | A2 | approvedById→users |
| 145 | `selection_template_group_memberships` | A2 | templateId→selection_templates |
| 146 | `selection_template_groups` | A1 | company_id |
| 147 | `selection_templates` | A1 | company_id |
| 148 | `selections` | A2 | projectId→projects |
| 149 | `sessions` | C | connect-pg-simple session store |
| 150 | `site_diary_entries` | A2 | templateId→site_diary_templates |
| 151 | `site_diary_templates` | A1 | company_id |
| 152 | `suggestions` | A1 | company_id |
| 153 | `supplier_contacts` | A2 | supplierId→suppliers |
| 154 | `supplier_insurances` | A2 | supplierId→suppliers |
| 155 | `supplier_label_assignments` | A2 | supplierId→suppliers |
| 156 | `supplier_labels` | A1 | company_id |
| 157 | `supplier_name_mappings` | A1 | company_id |
| 158 | `suppliers` | A1 | company_id |
| 159 | `system_configuration` | C | platform config (single row) |
| 160 | `system_documents` | A1 | company_id |
| 161 | `system_folders` | A1 | company_id |
| 162 | `takeoff_categories` | A1 | company_id |
| 163 | `takeoff_markups` | A1 | company_id |
| 164 | `takeoff_measurements` | A1 | company_id |
| 165 | `takeoff_plan_pages` | A1 | company_id |
| 166 | `takeoff_plans` | A1 | company_id |
| 167 | `task_activity` | A1 | company_id |
| 168 | `task_comments` | A2 | createdById→users |
| 169 | `task_tags` | A1 | company_id |
| 170 | `task_template_attachments` | A1 | company_id |
| 171 | `task_template_statuses` | A1 | company_id |
| 172 | `task_templates` | A1 | company_id |
| 173 | `task_views` | A1 | company_id |
| 174 | `teams` | A1 | company_id |
| 175 | `template_categories` | A1 | company_id |
| 176 | `timesheet_allowances` | A2 | estimateItemId→estimate_items → costCategoryId→cost_categories |
| 177 | `timesheet_cost_codes` | A2 | costCodeId→cost_codes |
| 178 | `timesheets` | A2 | projectId→projects |
| 179 | `user_column_preferences` | A2 | userId→users |
| 180 | `user_dashboard_preferences` | A1 | company_id |
| 181 | `user_invitations` | A1 | company_id |
| 182 | `user_memos` | A1 | company_id |
| 183 | `user_project_access` | A2 | userId→users |
| 184 | `user_roles` | A1 | company_id |
| 185 | `user_view_preferences` | A2 | userId→users |
| 186 | `users` | A1 | company_id |
| 187 | `variation_bills` | A2 | billId→bills |
| 188 | `variation_items` | A2 | variationId→variations → projectId→projects |
| 189 | `variation_timesheets` | A2 | variationId→variations → projectId→projects |
| 190 | `variations` | A2 | projectId→projects |
| 191 | `workflow_templates` | A1 | company_id |
| 192 | `xero_connections` | A1 | company_id |
| 193 | `xero_push_queue` | A1 | company_id |