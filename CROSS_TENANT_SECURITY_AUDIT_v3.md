# Cross-Tenant Security Audit v3 — full route-surface sweep

**Audit only. No code was changed.** Branch `audit/tenant-sweep`, cut from `origin/main` @ `e2f03c17`
(the PR #35 merge). The only file this branch adds is this document.

Prompted by onboarding the first external company. The two earlier audits each scoped themselves to a
subset and said so:

- `CROSS_TENANT_SECURITY_AUDIT.md` (v1) covered **by-ID routes only** and explicitly scoped out
  "list endpoints that already filter by companyId in their query (spot-checked, not exhaustively
  re-verified)".
- `CROSS_TENANT_SECURITY_AUDIT_v2.md` covered the classes v1 excluded, but only where they surfaced
  while fixing the specific findings it was chasing (bill inbox, `requireCompany`, object storage,
  `/uploads`, activities, `getUserRole`, the user account-takeover routes, OAuth state).
- The scope work (PR #35) covered the scope section only.

This pass is the exhaustive one: **every registered route, classified, with a ledger that accounts for
all of them.** It is a map, not a fix.

---

## 1. Method

1. **Enumeration.** Every `app.<verb>(...)` registration was extracted mechanically from all four
   route-registering files (`server/routes.ts`, `server/auth.ts`, `server/index.ts`,
   `server/replitAuth.ts`), including two registrations whose path literal sits on the following line
   (`routes.ts:4415`, `routes.ts:9987`). Result: **1,136 routes**, zero unresolved.
   `server/middleware/clientAccess.ts` and `server/vite.ts` register no routes.
2. **Batching.** The 1,121 `routes.ts` routes were split into 12 contiguous line-range batches of ~94,
   plus the 15 routes in the other three files. Each batch was audited against a shared brief with a
   fixed classification schema, and each was required to emit **one ledger row per route** — the row
   count is the completeness proof.
3. **Reconciliation.** Batch output was parsed back into a single dataset and checked against the
   enumeration: 1,136 inventory routes, 1,136 ledger rows, no gaps, no duplicates.
4. **Independent cross-checks** (run separately from the batches, to catch a sloppy batch rather than
   trust it) — these produced findings the per-route pass did not, and one correction to it:
   - every table in `shared/schema.ts` classified by whether it carries `companyId` or can reach one
     through FKs;
   - every `DbStorage` method that touches a `companyId`-bearing table, checked for a `companyId`
     predicate;
   - a grep for `companyId` sourced from `req.body` / `req.query` / `req.params`;
   - a scan for handlers containing **no** company/guard token anywhere in the body (200 hits, used as
     a false-negative check against the batches' SAFE verdicts);
   - a duplicate-registration scan, which found six shadowed routes and invalidated one batch's
     headline finding;
   - a Drizzle chained-`.where()` scan, which found a silent predicate-replacement bug the per-route
     reading missed in two additional functions.

### Classification

- **SAFE** — every tenant-scoped access is constrained by the session's `companyId`, via
  `enforceProjectCompany`, a `getOwnedX` helper, an explicit per-record comparison, a storage call that
  takes companyId from the session, **or** a `userId`-scoped predicate (a user belongs to exactly one
  company, so self-scoping is sound isolation).
- **LEAK** — an id or companyId from path/query/body reaches a read or a write without confirming it
  belongs to the caller's company.
- **N/A** — no tenant-scoped data: statics, health/config, signature-authenticated webhooks, and
  token-gated portal endpoints where the token *is* the authorisation.
- **UNCLEAR** — could not be resolved. **There are none.**

### The null-company class is closed — confirmed

`app.use('/api', requireCompany)` sits at `routes.ts:1572`. The only `/api` route registered before it
is `POST /api/_client-error` (`routes.ts:1439`), which touches no tenant data. Every other `/api` route
is behind it. The allowlist was re-read and remains narrow and correctly self-scoped (exact-match
`POST /companies`; `PATCH /users/:id` only when `:id` is the caller). **This audit therefore reports
almost exclusively the cross-company IDOR class**, as instructed.

---

## 2. Counts

| | routes |
|---|---|
| **Total registered** | **1,136** |
| SAFE | 827 (72.8%) |
| **LEAK** | **248 (21.8%)** |
| N/A | 61 (5.4%) |
| UNCLEAR | 0 |

Of the 248 LEAKs:

| | count |
|---|---|
| **Genuinely new** (not covered by #33 / #34 / #35) | **244** |
| Already covered by #33 / #34 / #35 | 1 (`/objects/company/:companyId/*` sibling; see §6) |
| Known-open, already tracked (object storage A3 phase 2) | 1 |
| Reclassified by this audit as unreachable dead code | 2 |
| LEAK ledger rows with no detail block written | 2 (`POST /api/proposals/:id/revision` 22192 — a 3-line alias of `/new-revision`; `POST /api/ai/circuit/start` 24774 — partial tool-scoping, flagged but not fully traced) |

By severity (246 detail blocks):

| severity | count |
|---|---|
| CRITICAL | 40 |
| HIGH | 77 |
| MEDIUM | 79 |
| LOW | 48 |
| dead code (reclassified) | 2 |

**The headline:** the isolation guarantee is not one gap away from complete. Roughly one route in five
does not enforce it, and the failures are structural, not incidental — see §5.

---

## 3. Coverage ledger

Every batch, what it covered, and its classification totals. Per-route ledgers (one row per route, with
the concrete scoping mechanism named for each) are the source data behind this table.

| batch | line range | area | routes | SAFE | LEAK | N/A | UNCLEAR |
|---|---|---|---|---|---|---|---|
| 01 | routes.ts 1439–4358 | notes, docs, tasks, defects (live), minutes, custom fields & field settings, projects | 94 | 54 | 26 | 14 | 0 |
| 02 | routes.ts 4415–7956 | projects/team, estimates + items/groups, cost codes, e-notes, labour estimates, ownership helpers | 94 | 56 | 38 | 0 | 0 |
| 03 | routes.ts 7965–10220 | scope section, scope stages/templates/gear photos, object storage, takeoff, Google Calendar/Drive | 94 | 73 | 14 | 7 | 0 |
| 04 | routes.ts 10231–13310 | companies, users, roles & permissions, project access, invitations, dashboard/KPI analytics | 94 | 78 | 12 | 4 | 0 |
| 05 | routes.ts 13331–15794 | selections, products, suppliers + labels/insurances/contacts, RFQs, RFIs | 94 | 75 | 18 | 1 | 0 |
| 06 | routes.ts 15833–19255 | bills + line items/allowances, variations, teams, variation portal, RFQ supplier portal | 94 | 62 | 20 | 12 | 0 |
| 07 | routes.ts 19290–21917 | purchase orders + items/attachments/signatures/templates, favourites, client invoices, proposals | 94 | 71 | 21 | 2 | 0 |
| 08 | routes.ts 21926–24875 | proposals (state transitions), bill OCR, email-invoice webhook, activities, site diary | 94 | 68 | 22 | 4 | 0 |
| 09 | routes.ts 24890–28433 | checklists (templates/groups/items/instances), allowances, timesheets, budgets, non-working days | 94 | 73 | 21 | 0 | 0 |
| 10 | routes.ts 28452–32224 | schedules, schedule items/steps/baselines, dependencies, activity notes, defects (shadowed), systems library | 94 | 67 | 27 | 0 | 0 |
| 11 | routes.ts 32238–34272 | messaging (channels/DMs/messages), systems library templates, price list | 94 | 72 | 22 | 0 | 0 |
| 12 | routes.ts 34384–38692 + auth/index/replitAuth | pinned items, business schedule, Xero, notifications, AI; plus auth.ts / index.ts / replitAuth.ts | 87 | 78 | 7 | 2 | 0 |
| 12b | server/auth.ts, server/index.ts, server/replitAuth.ts | login/register/OAuth/logout, Stripe webhook, mobile & sitemap statics | 15 | 0 | 0 | 15 | 0 |
**Total: 1,136 routes — 827 SAFE / 248 LEAK / 61 N/A / 0 UNCLEAR.**

### What could NOT be reached, and why

Stated explicitly, since an audit's honesty lives here:

1. **No dynamic verification.** Nothing was executed. There is no running server, no database, and the
   DB-backed `tenant-isolation.test.ts` was not run (it needs the dev database). Every finding is from
   reading code. A finding could in principle be wrong if a guard exists somewhere the reading missed —
   which is exactly why the 200-route "no guard token anywhere in the handler" scan was run as a
   counter-check against the SAFE verdicts (§1.4). It surfaced 40 disagreements; all 40 resolved to
   legitimate **user-scoped** isolation, not leaks.
2. **Exploitability was reasoned, not proven.** Severities assume an attacker who has a valid account in
   company A and has obtained an id belonging to company B. Where that id is a random v4 UUID, the
   finding is graded down; where it is enumerable or routinely leaked by another endpoint, up.
3. **Client-side and role semantics out of scope.** `requirePermission` / `requireAdmin` were treated
   purely as role gates that provide *no* tenant scoping (which is correct and is the source of many
   findings). Whether the role model itself is right was not assessed.
4. **The Replit object-storage sidecar** was read only as far as the app-level code. The bucket's own
   ACLs were not inspected — the A3 analysis in v2 stands unchanged.
5. **Two LEAK rows lack detail blocks** (listed in §2). Both are known and named; neither was silently
   dropped.
6. **Socket layer, background jobs and email intake** were audited (see §7) but are not part of the
   1,136 route count.

---

## 4. Ranked findings — every genuinely-new LEAK

Ranked CRITICAL → LOW, then by file and line. `op` is read / write / delete.

Severity calibration: **CRITICAL** = mutate or destroy another tenant's data, or bulk-read it with an
easily-obtained id. **HIGH** = single-record cross-tenant read or write with a knowable id.
**MEDIUM** = needs an unguessable UUID, or exposes metadata only. **LOW** = low-value disclosure, or
403-instead-of-404 existence confirmation.

### CRITICAL — 40

| # | endpoint | file:line | op | the gap | suggested fix |
|---|---|---|---|---|---|
| 1 | `DELETE /api/doc-folders/:id` | `routes.ts:2591` | delete | no ownership check — `storage.deleteDocFolder(req.params.id)` deletes any row by id. `docs.folder_id` is `ON DELETE SET NULL`, so the victim's documents are silently unfiled as collateral. | same `getOwnedDocFolder` guard (404 on mismatch) before the delete. |
| 2 | `POST /api/tasks/bulk-action` | `routes.ts:3040` | write  | the `ids` array is consumed straight into `storage.getTask` / `updateTask` / `deleteTask` / `createTask`, all of which filter on id only (storage.ts:8261, 8297, 8323). `getOwnedTask` is never called. The permission check (`checkUserPermiss… | loop each id through the existing `getOwnedTask(req, res, id)` (collecting failures instead of writing 404 mid-loop), and `enforceProjectCompany(req,… |
| 3 | `GET /api/minutes` | `routes.ts:3329` | read | `storage.getMinutes(projectId?)` (storage.ts:21524) applies only an optional projectId filter and no company filter. Calling `GET /api/minutes` with no query string returns every meeting minute — title, attendees, full HTML body, AI summar… | mirror `GET /api/defects` exactly: `enforceProjectCompany` when `projectId` is present, otherwise restrict to the caller's company project ids (bette… |
| 4 | `POST /api/projects/:projectId/team/:userId` | `routes.ts:5242` | write | Neither `:projectId` nor `:userId` is company-checked. `requirePermission("admin.users","edit")` is a role gate only. An admin of company A can insert a `user_project_access` row binding any user id to any project id, and the handler then… | `enforceProjectCompany(req, res, projectId)` plus a check that the target user's `companyId` equals the caller's. |
| 5 | `GET /api/estimates/:id/enotes` | `routes.ts:7507` | read ( | `storage.getEstimateEnotes(:id)` filters by estimateId alone and returns every note row (including `brainstormNotes` free text) for any estimate. Worse, when the estimate has no rows it **seeds ~90 default rows into the victim's estimate**… | `getOwnedEstimate(req, res, req.params.id)` at the top of the handler. |
| 6 | `DELETE /api/labour-estimate-categories/:catId` | `routes.ts:7735` | delete | `storage.deleteLabourEstimateCategory(catId)` deletes by primary key with no company predicate and no route guard — destroys another tenant's labour category (and its tasks by cascade). | a `getOwnedLabourCategory` helper resolving category → labour estimate → project → company. |
| 7 | `DELETE /api/enote-template-sets/:id` | `routes.ts:7913` | delete | `deleteEnoteTemplateSet(id)` deletes **all** `enote_templates` rows with that `templateSetId` and then the set itself, by id, with no company predicate. Destroys another tenant's whole template library entry in one call. | load the set, compare `companyId` to the session, 404 on mismatch. |
| 8 | `POST /api/estimates/:id/apply-enote-template/:templateSetId` | `routes.ts:7944` | read + | Neither id is checked. `applyEnoteTemplateSetToEstimate` reads a foreign template set's rows, and when `replaceExisting` is truthy it runs `DELETE FROM estimate_enotes WHERE estimate_id = :id` against a foreign estimate before inserting th… | `getOwnedEstimate(req, res, req.params.id)` plus a company check on `:templateSetId`. |
| 9 | `POST /api/user-roles/:roleId/permissions` | `routes.ts:12785` | write | `:roleId` is passed straight to `storage.setRolePermissions` (storage.ts:8897), which deletes every `role_permissions` row for that roleId and re-inserts the caller's payload. No `getUserRole(roleId, companyId)` check — `user_roles` is com… | `const role = await storage.getUserRole(req.params.roleId, req.user.companyId); if (!role) return res.status(404)...` — the same guard already used b… |
| 10 | `PUT /api/users/:userId/project-access/bulk` | `routes.ts:12915` | write  | neither `:userId` nor the `projectIds` body array is checked against the caller's company. `storage.getUserProjectAccess(userId)` (storage.ts:9023) and `grantProjectAccess`/`revokeProjectAccess` (9074/9102) filter on nothing but userId/pro… | load the target user and require `target.companyId === getSessionCompanyId(req)` (the pattern at routes.ts:10741), and run every id in `projectIds` t… |
| 11 | `POST /api/invitations` | `routes.ts:12978` | write | `companyId` comes from the request body (`insertUserInvitationSchema` does not omit it, shared/schema.ts:431) and is never compared with the session company. `invitedBy` and `roleId` are body-supplied too. `storage.createUserInvitation` in… | omit `companyId` and `invitedBy` from the parsed body and stamp both from the session (`getSessionCompanyId(req)` / `req.user.id`); resolve `roleId`… |
| 12 | `POST /api/bills` | `routes.ts:16876` | write | `billData.companyId` is only defaulted from the session (`if (!billData.companyId && currentUser.companyId)`), and `insertBillSchema` explicitly permits both `companyId` and `projectId` (schema.ts:2046-2047). Neither id is verified against… | force `companyId = req.user.companyId` (never read it from the body) and gate the body's `projectId` with `enforceProjectCompany(req, res, projectId)… |
| 13 | `GET /api/site-diary-templates` | `routes.ts:23210` | read | `storage.getSiteDiaryTemplates()` (storage.ts:18222) takes no companyId and filters only `isArchived = false`. The endpoint returns **every** company's site-diary templates — names, descriptions, full field definitions and their `companyId… | add a required `companyId` parameter and `eq(siteDiaryTemplates.companyId, companyId)` — the fail-closed shape used for `getCompanySettings` in #33. |
| 14 | `POST /api/site-diary-templates/:id/set-default` | `routes.ts:23255` | write | The route checks only that the caller has *a* company, then calls `setDefaultSiteDiaryTemplate(req.params.id, user.companyId)`. That storage function (storage.ts:18266) clears the caller's current default and then runs `.set({ isDefault: t… | verify ownership before the call (new `getOwnedSiteDiaryTemplate`) and drop `companyId` from the storage `.set(...)` payload. |
| 15 | `DELETE /api/site-diary-templates/:id` | `routes.ts:23337` | delete | No auth-beyond-login, no ownership check. `deleteSiteDiaryTemplate(id)` (storage.ts:18315) soft-deletes by `isArchived = true` on `eq(id, id)`. Any authenticated user can archive every other tenant's site-diary templates, breaking their di… | ownership guard + `eq(companyId)` in the storage WHERE; also add `requireAuth, requireTeamMember, requirePermission(...)` to match the delete on site… |
| 16 | `POST /api/projects/:projectId/budget/calculate` | `routes.ts:26497` | write | no ownership check on `:projectId`; `storage.calculateBudget(projectId)` creates or overwrites the budget row for any project and returns its full contents. | `enforceProjectCompany(req, res, req.params.projectId)`. |
| 17 | `PATCH /api/budgets/:id` | `routes.ts:26509` | write | no auth middleware beyond the global `requireCompany` and no ownership check; `storage.updateBudget(id, data)` (storage.ts:19073) updates by id alone. Any tenant's budget totals can be rewritten. | load the budget, then `enforceProjectCompany(req, res, budget.projectId)` — ideally as a new `getOwnedBudget` helper alongside `getOwnedEstimate`. |
| 18 | `DELETE /api/budgets/:id` | `routes.ts:26532` | delete | `storage.deleteBudget(id)` deletes by id with no companyId or project predicate and no route-level ownership check. Cascades to that budget's line items. | `getOwnedBudget` → `enforceProjectCompany(budget.projectId)` before delete. |
| 19 | `POST /api/budgets/:budgetId/line-items/recalculate` | `routes.ts:26560` | write | `storage.recalculateBudgetLineItems(budgetId)` loads the budget by id and rebuilds all of its line items; no ownership check anywhere on the path. Returns the recalculated foreign line items too. | resolve budget → project → `enforceProjectCompany` before recalculating. |
| 20 | `PATCH /api/budget-line-items/:id` | `routes.ts:26572` | write | `storage.updateBudgetLineItem(id, data)` (storage.ts:19256) updates by id alone; no route guard. Any tenant's budget line can be edited. | load line item → budget → project → `enforceProjectCompany`. |
| 21 | `POST /api/projects/:projectId/labour-hours-budget/recalculate` | `routes.ts:26608` | write | no ownership check on `:projectId`; `recalculateLabourHoursBudget` rewrites the labour hours budget rows for whatever project is named (it derives the company from the *project*, not the caller). | `enforceProjectCompany(req, res, req.params.projectId)`. |
| 22 | `POST /api/schedules` | `routes.ts:28481` | write | `insertScheduleSchema` carries `projectId` from the body and it is inserted verbatim. Nothing checks the target project belongs to the caller's company. | `enforceProjectCompany(req, res, validationResult.data.projectId)` before `storage.createSchedule`. |
| 23 | `POST /api/schedule-items` | `routes.ts:28940` | write | `createData.scheduleId` comes from the body and is used for the sibling-sortOrder query and the insert with no ownership check. Secondary reads also cross tenants: `storage.getCompany(companyId)` from an `assignedToId` of the form `company… | resolve schedule → project and call `enforceProjectCompany`; additionally constrain the contact lookup to `contacts.companyId = session companyId` an… |
| 24 | `POST /api/schedule-items/bulk` | `routes.ts:29505` | write | no ownership check anywhere. Each `items[].id` is read back via `storage.getScheduleItem(id)` (cross-tenant read, returned in the activity metadata path) and then written by `storage.bulkUpdateScheduleItems`, which is a bare `update … wher… | validate the whole id set in one join (`schedule_items → schedules → projects.companyId = session companyId`) exactly as `POST /api/schedule-items/bu… |
| 25 | `POST /api/schedule-items/batch-sort` | `routes.ts:29624` | write | ownership is verified once — against the caller-supplied `scheduleId` (or, in the fallback, only the first update's item). The subsequent `Promise.all` then applies `sortOrder`/`parentItemId` to every `updates[].id` with no per-item check,… | keep the single ownership query but intersect it with the ids — one `inArray(scheduleItems.id, ids)` join filtered to `schedules.id = scheduleId` — a… |
| 26 | `POST /api/schedule-items/bulk-create` | `routes.ts:29691` | write | `storage.getScheduleById(scheduleId)` is fetched and used (its weekend flags, its project's holidays), but its project's `companyId` is never compared to the session. Items are inserted into the foreign schedule and an activity row is writ… | `enforceProjectCompany(req, res, schedule.projectId)` right after the `getScheduleById`. |
| 27 | `POST /api/schedule-items/:itemId/steps` | `routes.ts:29876` | write | only `if (!req.user)`. `scheduleItemId` is forced to the path param and inserted — a step is attached to whatever item id is supplied. | `getOwnedScheduleItem(req, res, req.params.itemId)` before the insert. |
| 28 | `PATCH /api/schedule-item-steps/:id` | `routes.ts:29886` | write | only `if (!req.user)`. `db.update(scheduleItemSteps).where(eq(id, req.params.id))` with no resolution of step → item → schedule → project → company. | add a `getOwnedScheduleItemStep` helper in the `getOwnedX` style (load step, then `getOwnedScheduleItem(step.scheduleItemId)`). |
| 29 | `DELETE /api/schedule-item-steps/:id` | `routes.ts:29900` | delete | only `if (!req.user)`. Unconditional `db.delete(scheduleItemSteps).where(eq(id, …))`; it does not even check a row was removed. | the same `getOwnedScheduleItemStep` guard before the delete. |
| 30 | `POST /api/schedules/:scheduleId/baselines` | `routes.ts:29914` | write | only `if (!req.user)`. Inserts a baseline against the supplied scheduleId and then copies every `scheduleItems` row of that schedule into `scheduleBaselineItems` — a write into, and a full snapshot read of, a foreign schedule. | `getScheduleById` + `enforceProjectCompany(schedule.projectId)` before the insert. |
| 31 | `DELETE /api/baselines/:id` | `routes.ts:29956` | delete | only `if (!req.user)`. Unconditional `db.delete(scheduleBaselines).where(eq(id, …))`; the baseline-items cascade goes with it. | ownership chain via schedule → `enforceProjectCompany`, returning 404 on mismatch. |
| 32 | `POST /api/schedule-items/:scheduleItemId/activity-notes` | `routes.ts:30371` | write | the note is stamped with the caller's own `userId`/`userName` (which the brief calls out as *not* an ownership check) and inserted against the path `scheduleItemId` with no verification of that item. | `getOwnedScheduleItem(req, res, req.params.scheduleItemId)` before `storage.createActivityNote`. |
| 33 | `DELETE /api/activity-notes/:id` | `routes.ts:30429` | delete | `canEditActivityNote` correctly restricts to the author, but the `isAdmin` branch (`req.user.roleName === 'Admin' \|\| 'Owner'`) bypasses it entirely with no company comparison, then calls `storage.deleteActivityNote(id)` — a bare `delete… | resolve the note → `scheduleItemId` → `getOwnedScheduleItem` before allowing the admin path; keep the author path as-is. |
| 34 | `GET /api/systems/documents` | `routes.ts:32320` | read | `storage.getSystemDocuments` (storage.ts:21690) builds `.where(eq(companyId))` then, when `folderId !== undefined`, calls `.where(...)` a **second time**. Drizzle 0.39's `PgSelectBase.where()` (node_modules/drizzle-orm/pg-core/query-builde… | Same pattern already used correctly in `getPriceListItems`/`getChannels`: accumulate a `conditions[]` array and pass a single `and(...conditions)`. N… |
| 35 | `GET /api/systems/task-templates` | `routes.ts:32446` | read | Same Drizzle double-`.where()` bug in `getTaskTemplates` (storage.ts:21794). `?isActive=true` (or `false`) replaces the `companyId` predicate with `is_active = true`, returning **every company's** task templates — titles, goals, descriptio… | conditions-array + single `and(...)`, as in `getPriceListItems`. |
| 36 | `GET /api/systems/workflow-templates` | `routes.ts:32594` | read | Same double-`.where()` bug in `getWorkflowTemplates` (storage.ts:22586). `?isActive=true` drops the companyId predicate and returns all tenants' workflow templates. | conditions-array + single `and(...)`. |
| 37 | `POST /api/channels/:channelId/members` | `routes.ts:33029` | write | `requireAuth` only. There is **no** `getChannel(channelId, companyId)` call, no membership check, and no role check. The handler inserts `{ ...body, channelId: req.params.channelId }` — so an attacker chooses both the target channel (any t… | mirror line 33013: `const channel = await storage.getChannel(req.params.channelId, companyId); if (!channel) return 404;` then require the caller to… |
| 38 | `DELETE /api/channels/:channelId/members/:userId` | `routes.ts:33049` | delete | Zero checks of any kind — the handler is a single `storage.removeChannelMember(req.params.channelId, req.params.userId)`. Any authenticated user can evict any user from any channel in any company, silently destroying their access and unrea… | `getChannel(channelId, companyId)` 404-guard + owner/admin membership check (or self-removal only), following the 33013 pattern. |
| 39 | `POST /api/channels/:channelId/messages` | `routes.ts:33208` | write | `channelId` is taken from the path and used directly in `storage.createMessage({...})` with **no** `getChannel(channelId, companyId)` check and **no** membership check. The only validation is that `threadParentId` lives in the same channel… | apply the exact guard used by `GET /api/channels/:channelId/messages` (33128–33138): `getChannel(channelId, companyId)` → 404, then `getChannelMember… |
| 40 | `DELETE /api/messages/:id` | `routes.ts:33361` | delete | The entire handler is `await storage.deleteMessage(req.params.id)`. No company check, no channel-membership check, no author check — `deleteMessage` soft-deletes on `WHERE id = ?`. Any authenticated user can erase any message in any compan… | copy the 33331 preamble — `requireMessageChannelAccess(...)` then `access.message.userId !== userId` (allowing channel owner/admin override if desire… |

### HIGH — 77

| # | endpoint | file:line | op | the gap | suggested fix |
|---|---|---|---|---|---|
| 1 | `PATCH /api/doc-folders/:id` | `routes.ts:2581` | write | no ownership check at all — `storage.updateDocFolder(req.params.id, req.body)` filters on id only. Any authenticated user can rename, re-parent, or re-company any doc folder in the database. | add a `getOwnedDocFolder(req, res, id)` helper in the `getOwnedDoc` style, and/or make `updateDocFolder` take companyId in its WHERE. |
| 2 | `POST /api/defects` | `routes.ts:3277` | write | `insertDefectSchema` validates shape only; the required `projectId` is never passed through `enforceProjectCompany`. The `defects` table has no companyId column, so the row genuinely lands inside the victim's project and renders in their d… | `if (!(await enforceProjectCompany(req, res, validationResult.data.projectId, "Project not found"))) return;` — the pattern already used by `GET /api… |
| 3 | `POST /api/minutes` | `routes.ts:3349` | write | body `projectId` (and `ownerId`) go straight into `storage.createMinute` with no ownership check. Minutes have no companyId column, so the record becomes the victim project's data. | `enforceProjectCompany(req, res, data.projectId)` before create; force `ownerId` from the session. |
| 4 | `POST /api/field-categories/by-key/:key/options/quick-add` | `routes.ts:3629` | write | creates a `field_options` row on a global category — the new option (attacker-controlled name) immediately appears in every other company's dropdowns for that category. | company-scope `field_options` (migration adding company_id + per-company seed), then filter both read and write by session companyId. |
| 5 | `POST /api/field-options` | `routes.ts:3775` | write | `createFieldOption` accepts any `categoryId` from the body and inserts into the shared table — the option shows up in every company's pickers. | company-scope `field_options` and validate `categoryId` against the caller's company. |
| 6 | `PATCH /api/field-options/:id` | `routes.ts:3792` | write | `updateFieldOption(id, body)` filters on id only — renaming/recolouring/deactivating an option changes it for every tenant, including options another company created. | company-scope `field_options`; add companyId to the WHERE clause. |
| 7 | `DELETE /api/field-options/:id` | `routes.ts:3813` | delete | `deleteFieldOption(id)` filters on id only — removes the option from every tenant's dropdowns. | company-scope `field_options`; add companyId to the WHERE clause. |
| 8 | `POST /api/field-categories/:id/options/batch` | `routes.ts:3826` | write  | `setCategoryOptions` (storage.ts:13888) does `DELETE FROM field_options WHERE category_id = $1` and re-inserts the submitted list, with no company filter and no ownership check on `:id`. One save from company A replaces the option set ever… | company-scope `field_options` (and `field_categories`), then scope both the delete and the insert by session companyId. |
| 9 | `PATCH /api/note-templates/:templateId/fields/:fieldId` | `routes.ts:4088` | write | the handler verifies `:templateId` belongs to the caller's company, then calls `storage.updateNoteTemplateField(req.params.fieldId, …)` which filters on the field id alone (storage.ts:9909). A caller pairs their own templateId with another… | re-fetch the field and assert `field.templateId === req.params.templateId` (the `reorderNoteTemplateFields` query at storage.ts:9935 already does thi… |
| 10 | `DELETE /api/note-templates/:templateId/fields/:fieldId` | `routes.ts:4123` | delete | identical second-id hole — `:templateId` is verified, `deleteNoteTemplateField(req.params.fieldId)` (storage.ts:9923) filters on field id only, so another company's template field is deleted. | add `eq(noteTemplateFields.templateId, templateId)` to the delete WHERE, matching `reorderNoteTemplateFields`. |
| 11 | `GET /api/projects/:projectId/team` | `routes.ts:5231` | read | `storage.getProjectTeamMembers(req.params.projectId)` (storage.ts:9117) selects `user_project_access` by projectId alone and returns the joined user rows. `:projectId` is never checked against the caller's company. | `if (!(await enforceProjectCompany(req, res, req.params.projectId))) return;` |
| 12 | `DELETE /api/projects/:projectId/team/:userId` | `routes.ts:5285` | delete | `storage.revokeProjectAccess(userId, projectId)` deletes the access row with no company predicate. Nothing ties `:projectId` to the caller's tenant. | `enforceProjectCompany` on `:projectId` and a company check on `:userId`. |
| 13 | `POST /api/projects/:projectId/cost-codes` | `routes.ts:7204` | write | No ownership check at all, and `companyId` is not stamped from the session — `insertCostCodeSchema` (cost_codes.companyId is `notNull`) requires it in the request body and `storage.createCostCode` inserts it verbatim. The caller chooses wh… | stamp `companyId` from the session as `POST /api/labour-task-templates` does, and drop this deprecated project-scoped route in favour of the company-… |
| 14 | `POST /api/estimates/:id/notes` | `routes.ts:7471` | write | `storage.createEstimateNote({ estimateId: req.params.id, ... })` runs with no ownership check on `:id`. Any authenticated user can post note content onto any company's estimate. | `if (!(await getOwnedEstimate(req, res, req.params.id))) return;` — the sibling GET at 7460 already does this. |
| 15 | `DELETE /api/estimate-notes/:noteId` | `routes.ts:7490` | delete | `storage.deleteEstimateNote(id)` deletes by primary key with no company predicate and no ownership guard in the route. | load the note, then `getOwnedEstimate(req, res, note.estimateId)` — the same chain `getOwnedEnote` uses. |
| 16 | `POST /api/estimates/:id/enotes` | `routes.ts:7516` | write | `createEstimateEnote({ ...req.body, estimateId: req.params.id })` — no ownership check on `:id`, and the raw body spread means arbitrary columns can be set. | `getOwnedEstimate(req, res, req.params.id)`. |
| 17 | `PATCH /api/estimates/:id/enotes/:categoryId` | `routes.ts:7530` | write | `storage.updateEstimateEnote(req.params.categoryId, req.body)` writes an unvalidated body to a row selected by id only. `:id` is never even read, so the path segment provides no protection. | `getOwnedEnote(req, res, req.params.categoryId)` — the helper already exists at routes.ts:5559. |
| 18 | `DELETE /api/estimate-enotes/:rowId` | `routes.ts:7539` | delete | `storage.deleteEstimateEnote(rowId)` checks only that the row `isCustom`; there is no company check. Also returns 403 (`Only custom rows can be deleted`) on a foreign row, confirming its existence. | `getOwnedEnote(req, res, req.params.rowId)` before the delete. |
| 19 | `POST /api/estimates/:id/enotes/rows` | `routes.ts:7553` | write | Creates a custom enote row on `:id` with no ownership check. | `getOwnedEstimate(req, res, req.params.id)`. |
| 20 | `DELETE /api/estimates/:id/enotes/:categoryId` | `routes.ts:7571` | delete | Identical body to 7539 reached by a different path; deletes any custom enote row by id, `:id` unused. Same 403-confirms-existence behaviour. | `getOwnedEnote(req, res, req.params.categoryId)`. |
| 21 | `GET /api/projects/:projectId/labour-estimate` | `routes.ts:7675` | read ( | No `enforceProjectCompany`. Worse, `storage.getLabourEstimate(projectId, companyId)` (storage.ts:11174) **accepts a companyId and never uses it** — the query is `where(eq(labourEstimates.projectId, projectId))`. The signature reads as scop… | `enforceProjectCompany(req, res, req.params.projectId)` in the route **and** add the missing `eq(labourEstimates.companyId, companyId)` predicate in… |
| 22 | `POST /api/projects/:projectId/labour-estimate` | `routes.ts:7693` | write | Creates a labour estimate (and seeds default categories) on any `:projectId`; only `companyId` is stamped from the session, which per the brief's third trap is not an ownership check. | `enforceProjectCompany(req, res, req.params.projectId)`. |
| 23 | `PATCH /api/labour-estimates/:id` | `routes.ts:7708` | write | `storage.updateLabourEstimate(id, req.body)` updates by primary key with an unvalidated body and no company predicate — includes `labourRatePerHour`, which drives cost figures. | introduce a `getOwnedLabourEstimate` helper on the existing `getOwnedX` pattern (load row → `enforceProjectCompany(row.projectId)` or compare `row.co… |
| 24 | `POST /api/labour-estimate-categories/:catId/apply-template` | `routes.ts:7762` | read + | `req.body.labourEstimateId` and `:catId` are both unguarded — the handler reads a foreign labour estimate's categories to resolve `cat.name`, then `applyLabourTemplate` inserts task rows into the foreign `:catId`. The `companyId` is used o… | `getOwnedLabourCategory(:catId)` and verify `body.labourEstimateId` resolves to the same owned estimate. |
| 25 | `POST /api/labour-estimate-categories/:catId/copy-to-template` | `routes.ts:7825` | read ( | `copyCategoryToTemplate(companyId, :catId, name)` selects every `labour_estimate_tasks` row for `:catId` — with no ownership check on `:catId` — and copies descriptions, crew sizes and hours into the **attacker's** template library, where… | `getOwnedLabourCategory(:catId)` before the copy. |
| 26 | `POST /api/estimates/:id/save-as-enote-template` | `routes.ts:7931` | read ( | `saveEstimateAsEnoteTemplate(:id, companyId, name)` reads every `estimate_enotes` row of `:id` — no ownership check — and copies `groupName`, `categoryName` and `brainstormNotes` into a new template set owned by the **attacker**, readable… | `getOwnedEstimate(req, res, req.params.id)` before the copy. |
| 27 | `POST /api/labour-estimate-categories/:catId/tasks` | `routes.ts:7974` | write | Same missing check; the insert hangs a new task row off any `categoryId` supplied in the path. The victim's labour estimate renders the injected row (their read path also filters by categoryId only), so this is a visible write into another… | same `getOwnedLabourEstimateCategory` guard before the insert. |
| 28 | `PATCH /api/labour-estimate-tasks/:taskId` | `routes.ts:7989` | write | `updateLabourEstimateTask(id, req.body)` (storage.ts:11325) updates by id with no company predicate and no schema validation, so any task can be rewritten — and `categoryId` itself is settable from the body, letting a task be moved between… | `getOwnedLabourEstimateTask(req,res,:taskId)` guard plus an explicit `pick()` allowlist (`description`, `subHeading`, `numMen`, `hoursPerMan`, `sortO… |
| 29 | `DELETE /api/labour-estimate-tasks/:taskId` | `routes.ts:7998` | delete | `deleteLabourEstimateTask(id)` (storage.ts:11342) deletes by id with no company predicate. | same `getOwnedLabourEstimateTask` guard before the delete. |
| 30 | `POST /api/users` | `routes.ts:10680` | write | `insertUserSchema` (shared/schema.ts:401) omits only id/createdAt/updatedAt, so `companyId` and `roleId` are client-supplied and `storage.createUser` (storage.ts:7829) inserts them verbatim. `requirePermission("admin.users","add")` is a ro… | strip `companyId` from the parsed body and stamp `getSessionCompanyId(req)`; validate `roleId` with `getUserRole(roleId, sessionCompanyId)`. |
| 31 | `POST /api/users/:userId/project-access` | `routes.ts:12837` | write | same hole as the grant route — `:userId` is unvalidated and `projectId` arrives inside `insertUserProjectAccessSchema` (userProjectAccess has no companyId column, so the row itself carries no tenant marker). `storage.createUserProjectAcces… | `enforceProjectCompany(req, res, body.projectId)` + target-user company check. |
| 32 | `POST /api/project-access/grant` | `routes.ts:12858` | write | `userId` and `projectId` both come from the body and go straight into `storage.grantProjectAccess` with no ownership check on either. A caller can grant their own account access to a project in company B, or grant a company-B user access t… | `enforceProjectCompany(req, res, projectId)` plus a `target.companyId === session companyId` check on `userId`. |
| 33 | `GET /api/invitations/:id` | `routes.ts:12966` | read | `storage.getUserInvitation(id)` (storage.ts:9194) selects by id alone and the handler adds no company comparison — unlike the sibling resend (13173) and delete (13236) routes, which do check. The returned row includes `inviteToken`, so rea… | add `if (invitation.companyId !== getSessionCompanyId(req)) return res.status(404)...`, matching routes.ts:13173 (and prefer 404 over that route's 40… |
| 34 | `PATCH /api/supplier-labels/:id` | `routes.ts:14592` | write | No ownership check at all. `requireAdmin` is a role gate only; `storage.updateSupplierLabel(id, data)` (storage.ts:14040) updates `supplier_labels` by primary key with no `companyId` predicate, so an admin of company A can rename/recolour/… | add a `getOwnedSupplierLabel(req, res, id)` helper in the `getOwnedX` family (load, compare `companyId`, 404) and call it before the update; or add `… |
| 35 | `DELETE /api/supplier-labels/:id` | `routes.ts:14612` | delete | Identical hole, worse outcome. The handler calls `storage.deleteSupplierLabel(req.params.id)` (storage.ts:14058 — `db.delete(...).where(eq(id))`) with no lookup and no company comparison, and always answers 204 even when nothing was delete… | same `getOwnedSupplierLabel` guard before the delete. |
| 36 | `DELETE /api/rfi-comments/:id` | `routes.ts:16641` | delete | the handler calls `storage.deleteRFIComment(req.params.id)` with no lookup at all. `DbStorage.deleteRFIComment` (storage.ts:15202) deletes by id with no company filter. Every sibling route in the block (`GET /api/rfis/:rfiId/comments`, `PO… | load the comment, then `getOwnedRFI(req, res, comment.rfiId, "Comment not found")` — mirroring `DELETE /api/task-comments/:id` (16753). |
| 37 | `PATCH /api/bills/:id` | `routes.ts:16948` | write | `getOwnedBill(:id)` correctly guards the bill being edited, but `insertBillSchema.partial()` still accepts `projectId` and `companyId`, and the update is applied verbatim. A caller can re-home their own bill onto company B's project (then… | omit `companyId` from the update schema and run `enforceProjectCompany` on any incoming `projectId`, the same way `POST /api/variations` (18497) does. |
| 38 | `POST /api/bill-line-item-allowances` | `routes.ts:17988` | write | the handler zod-parses the body and inserts it directly. Neither `billLineItemId` nor `allowanceItemId` is resolved to an owner. The PATCH (18005) and DELETE (18034) siblings both do the `allowance → billLineItems.billId → getOwnedBill` wa… | apply the same join used at 18007-18014 — resolve `billLineItemId` to its bill and call `getOwnedBill`, and additionally verify the `allowanceItemId`… |
| 39 | `POST /api/variations/:id/bills` | `routes.ts:18809` | write  | the variation is guarded by `getOwnedVariation`, but the body's `billIds[]` are passed straight to `storage.createVariationBills` (storage.ts:17413), which bulk-inserts junction rows with no ownership check. A subsequent `GET /api/variatio… | loop the `billIds` through `getOwnedBill` (or a single `bills.companyId = session` IN-query) before `createVariationBills`, rejecting the whole batch… |
| 40 | `POST /api/variations/:id/timesheets` | `routes.ts:18841` | write  | identical shape to the bills route. `timesheetIds[]` from the body go straight into `storage.createVariationTimesheets` (storage.ts:17472) unchecked. `getVariationTimesheets` (storage.ts:17436) then returns the linked timesheets' `userId`,… | validate each id with `getOwnedTimesheet` (routes.ts:5626) before linking. |
| 41 | `PATCH /api/teams/:id` | `routes.ts:18891` | write | no lookup and no company comparison — `storage.updateTeam(id, {name, color})` (storage.ts:26084) updates by id alone. `requireTeamMember` is a role gate only. Any authenticated user can rename/recolour any company's team. | add a `getOwnedTeam` helper following the `getOwnedSupplier` pattern (routes.ts:5593) — load via `storage.getTeam(id)`, compare `team.companyId` to t… |
| 42 | `DELETE /api/teams/:id` | `routes.ts:18903` | delete | same as the PATCH — `storage.deleteTeam(id)` (storage.ts:26094) deletes by id with no companyId predicate. Destroys another tenant's team record and, via FK behaviour, its membership rows. | the same `getOwnedTeam` guard before deleting. |
| 43 | `POST /api/purchase-orders` | `routes.ts:19328` | write | `req.body.projectId` is required but never checked against the caller's company. The only project gate is the site-PO branch's `user_project_access` lookup (19365), which is skipped entirely for `poType === "main"` and skipped for any admi… | `enforceProjectCompany(req, res, req.body.projectId)` before building `poData`. |
| 44 | `POST /api/proposals` | `routes.ts:21706` | write | `body.projectId` is never validated. `storage.createProposalAtomic` (storage.ts:17944) *derives* `companyId` from the supplied project, so the created proposal is stamped with the victim's companyId and attached to the victim's project — i… | `if (!(await enforceProjectCompany(req, res, validationResult.data.projectId, "Project not found"))) return;` before `createProposalAtomic`, matching… |
| 45 | `GET /api/proposals/:id/acceptances` | `routes.ts:21917` | read | The handler calls `storage.getProposalAcceptances(req.params.id)` with no ownership check whatsoever — no `getOwnedProposal`, no company comparison. Acceptance rows carry signer name/email/IP/signature and signed date. | `if (!(await getOwnedProposal(req, res, req.params.id, "Proposal not found"))) return;` — exactly as the sibling sections/items GETs do. |
| 46 | `POST /api/proposals/:id/send` | `routes.ts:21980` | write | `storage.getProposal(id)` with no company check, then `storage.updateProposal(id, { status:'sent', sentDate, contentSnapshot })`. The snapshot is built from the **caller's** `getCompanySettings(getSessionCompanyId(req))`, so company A stam… | `getOwnedProposal(req, res, req.params.id)` before the read. |
| 47 | `POST /api/proposals/:id/accept` | `routes.ts:22042` | write | No ownership check and — unlike the sibling `/acceptances` route — no `shareToken` check either. Writes a `proposal_acceptances` row and sets status `accepted`, `acceptedByName/Email`, `signature` on another company's proposal. Forges a cl… | `getOwnedProposal(...)` for the internal path, or require the shareToken as `/acceptances` (21935) does. |
| 48 | `POST /api/proposals/:id/reject` | `routes.ts:22093` | write | Same as `/accept` — no ownership and no share-token check. Sets status `rejected`, `rejectedDate`, `rejectionReason` on any company's sent proposal, which also makes it unacceptable thereafter (the accept path 400s on `rejected`). | `getOwnedProposal(...)` before the state transition. |
| 49 | `POST /api/proposals/:id/new-revision` | `routes.ts:22191` | write | Both mount the same `handleCreateProposalRevision`, which calls `storage.createProposalRevision(req.params.id, overrides)` with no ownership check. `createProposalRevision` (storage.ts:17971) loads the parent by id alone, marks the current… | `getOwnedProposal(req, res, req.params.id)` at the top of `handleCreateProposalRevision`. |
| 50 | `POST /api/proposals/:id/snapshot` | `routes.ts:22195` | read + | No ownership check. Reads the full proposal, sections, items, milestones and acceptances of any proposal and returns the whole snapshot in the response body — a complete cross-tenant dump of a priced commercial document — while also overwr… | `getOwnedProposal(...)` before the reads. |
| 51 | `POST /api/webhooks/email-invoice` | `routes.ts:23052` | write | `storage.getUsers("team")` is global across all companies (storage.ts:7955 — filters only on `userCategory` + `isActive`), and the handler picks `users.find(u => u.username === "admin") \|\| users[0]`, then passes that user's `companyId` t… | route on the recipient address to a company (per-tenant inbound alias) and reject when no tenant resolves; never `users[0]`. |
| 52 | `GET /api/site-diary-templates/default/:companyId` | `routes.ts:23223` | read | `companyId` is taken straight from the path and passed to `getDefaultSiteDiaryTemplate` with no comparison to the session company. Returns another tenant's default template in full. | ignore the path segment and use `req.user.companyId`; keep the route shape for compatibility. |
| 53 | `PATCH /api/site-diary-templates/:id` | `routes.ts:23306` | write | No ownership check at all. `updateSiteDiaryTemplate(id, data)` (storage.ts:18302) filters on id alone, so any tenant's template name, description and entire `fields` array can be rewritten. The partial schema also still accepts `companyId`… | ownership guard, plus `.omit({ companyId: true })` on the partial schema and `eq(companyId)` in the storage WHERE. |
| 54 | `PATCH /api/site-diary-entries/:id` | `routes.ts:23780` | write | `getOwnedSiteDiaryEntry` correctly guards `:id`, but the body's second and third ids are not guarded: `projectId` is validated with a bare `storage.getProject(...)` existence check (23800) and `templateId` with the unscoped `getSiteDiaryTe… | replace the existence check with `enforceProjectCompany(req, res, validationResult.data.projectId)`, exactly as the POST at 23733 does. |
| 55 | `PATCH /api/checklist-instance-items/:id` | `routes.ts:26203` | write | ownership is resolved from `existingItem.instanceId`, but `insertChecklistInstanceItemSchema.partial()` still accepts `instanceId` and `groupId`, which are passed straight to `storage.updateChecklistInstanceItem`. Re-parenting an owned ite… | mirror PATCH /api/checklist-instance-groups/:id (26086) — when `data.instanceId`/`data.groupId` differ from the existing values, run `getOwnedInstanc… |
| 56 | `PATCH /api/checklist-status-triggers/:id` | `routes.ts:26405` | write | the handler only asserts the caller *has* a companyId, then calls `storage.updateChecklistStatusTrigger(req.params.id, data)` (storage.ts:19020), whose WHERE clause is `eq(id)` alone. Any trigger id in the database is editable, including r… | add `companyId` to the storage signature and AND it in the WHERE clause, as `updateTaskTemplateStatus(id, data, companyId)` (storage.ts:12231) alread… |
| 57 | `DELETE /api/checklist-status-triggers/:id` | `routes.ts:26429` | delete | `storage.deleteChecklistStatusTrigger(req.params.id)` (storage.ts:19033) deletes by id with no companyId predicate; the route adds no ownership check. | same as above — companyId-filtered delete, matching `deleteTaskTemplateStatus(id, companyId)`. |
| 58 | `GET /api/projects/:projectId/budget` | `routes.ts:26457` | read ( | `requireAuth` + `requirePermission("financial.budget_actuals","view")` are role gates only; `req.params.projectId` is never checked against the caller's company. `storage.getBudget(projectId)` / `calculateBudget(projectId)` / `recalculateB… | `if (!(await enforceProjectCompany(req, res, req.params.projectId, "Project not found"))) return;` at the top, as `/api/projects/:projectId/allowance… |
| 59 | `GET /api/budgets/:budgetId/line-items` | `routes.ts:26548` | read | `storage.getBudgetLineItems(budgetId)` filters on budgetId only; the route adds nothing but a permission gate. Exposes another tenant's full cost-code-level budget vs actual breakdown. | resolve budget → project → `enforceProjectCompany`. |
| 60 | `GET /api/projects/:projectId/labour-hours-budget` | `routes.ts:26596` | read | `storage.getLabourHoursBudget(projectId)` filters on projectId only; the `requirePermission("financial.budget_labour","view")` gate is a role check, not a tenant check. | `enforceProjectCompany(req, res, req.params.projectId)`. |
| 61 | `GET /api/projects/:projectId/allowances/:allowanceId/detail` | `routes.ts:26707` | read | the project is company-checked inline (403, not the 404 convention), but `:allowanceId` is never verified to be an estimate item on that project. Every query in the handler keys off `allowanceId` alone: bill-line-item allocations (supplier… | `getOwnedEstimateItem(req, res, allowanceId, "Allowance not found")` (routes.ts:5546), and additionally assert `estimate.projectId === projectId`; sw… |
| 62 | `POST /api/projects/:projectId/allowances/:allowanceId/sync-selection` | `routes.ts:26969` | write | the project is company-checked, but `:allowanceId` is not tied to it. `storage.getSelectionByEstimateItemId(allowanceId)` resolves a foreign company's selection, and `syncSelectionCostingToAllowance` (13810) then creates or updates an allo… | `getOwnedEstimateItem(req, res, allowanceId)` plus an `estimate.projectId === projectId` assertion, matching POST /api/timesheet-allowances/bulk (282… |
| 63 | `POST /api/timesheets` | `routes.ts:27497` | write  | neither `body.userId` nor `body.projectId` is validated. For a non-admin caller the handler does `storage.getUser(body.userId)` and copies that user's `hourlyRate` onto the row, then returns the created timesheet — so supplying another com… | force `body.userId` to the session user unless the caller can approve timesheets *and* the target user is in `storage.getUsersByCompany(session compa… |
| 64 | `PATCH /api/timesheets/:id` | `routes.ts:27797` | write  | the existing row's owner company is checked, but the update body is not filtered: `body.projectId` and `body.userId` pass through to `storage.updateTimesheet`. Setting `userId` to a foreign user causes `storage.getUser(targetUserId)` at 27… | extend `TIMESHEET_PROTECTED_FIELDS` handling — reject `userId` changes outside the caller's company and run `enforceProjectCompany` on any `body.proj… |
| 65 | `GET /api/projects/:projectId/schedule` | `routes.ts:28452` | read | `storage.getSchedule(req.params.projectId, category)` filters on projectId + category only; no `enforceProjectCompany` and no auth middleware on the route at all beyond the global `requireAuth`. | `if (!(await enforceProjectCompany(req, res, req.params.projectId, "Schedule not found"))) return;` |
| 66 | `GET /api/projects/:projectId/schedules` | `routes.ts:28469` | read | `storage.getSchedulesByProject(req.params.projectId)` filters by projectId alone — the classic "list endpoint scoped by something other than the session company". | `enforceProjectCompany(req, res, req.params.projectId)` before the storage call. |
| 67 | `GET /api/schedules/:scheduleId/items` | `routes.ts:28741` | read | `storage.getScheduleItems(req.params.scheduleId)` filters by scheduleId only. No ownership resolution from schedule → project → company. | resolve `getScheduleById` then `enforceProjectCompany(schedule.projectId)`, as `PATCH /api/schedules/:id` already does. |
| 68 | `GET /api/projects/:projectId/schedule-items` | `routes.ts:28773` | read | the route relies on `clientAccessGate` for scoping, but that middleware returns `next()` immediately for any session whose `userCategory !== "client"` (clientAccess.ts:333). A team-member session therefore reaches `storage.getScheduleItems… | add `enforceProjectCompany(req, res, req.params.projectId)` — the client path stays gated by clientAccessGate, the team path gains the company check. |
| 69 | `PATCH /api/schedule-items/:id` | `routes.ts:29090` | write | `:id` is correctly guarded by `getOwnedScheduleItem`, but the body's `parentItemId` is not. `isDescendant` walks foreign items, and once set, `recalculateParentProgress(parentId)` (29200) and the parent date-range recompute (29397) issue `… | run `getOwnedScheduleItem(req, res, updateData.parentItemId)` (or assert the parent shares `originalItem.scheduleId`) before accepting the re-parent. |
| 70 | `GET /api/projects/:projectId/workflows` | `routes.ts:32679` | read | No `enforceProjectCompany`. `getProjectWorkflows(projectId)` (storage.ts:22666) filters on `projectId` only. Any authenticated user reading any project id gets that project's workflow runs (status, triggeredAt, createdTaskIds). | `if (!(await enforceProjectCompany(req, res, req.params.projectId))) return;` |
| 71 | `POST /api/project-workflows` | `routes.ts:32700` | write | Body `projectId` and `workflowTemplateId` are inserted verbatim. Nothing checks either belongs to the caller's company, so a user of company A can create workflow runs attached to company B's projects (and referencing B's workflow template… | `enforceProjectCompany(req, res, body.projectId)` plus a `getWorkflowTemplate(body.workflowTemplateId, companyId)` existence check before insert. |
| 72 | `PATCH /api/project-workflows/:id` | `routes.ts:32717` | write | `updateProjectWorkflow(id, data)` has `WHERE id = ?` only. Any authenticated user can rewrite any tenant's workflow run — including repointing `projectId` and `workflowTemplateId`. | resolve the row → `enforceProjectCompany(row.projectId)` before update; reject `projectId` in the body. |
| 73 | `DELETE /api/project-workflows/:id` | `routes.ts:32737` | delete | `deleteProjectWorkflow(id)` deletes on `id` alone, with no company or project ownership check. | resolve the row → `enforceProjectCompany(row.projectId)` before delete. |
| 74 | `GET /api/messages/:id` | `routes.ts:33196` | read | `storage.getMessage(req.params.id)` filters on `id` alone (storage.ts:23038). The handler performs no company check and no channel-membership check — unlike every neighbouring message route, which routes through `requireMessageChannelAcces… | replace the bare `getMessage` with `requireMessageChannelAccess(req.params.id, userId, companyId, res)` — the helper is already defined a few lines b… |
| 75 | `POST /api/price-list/review/links` | `routes.ts:34242` | write | `storage.createBillLineItemPriceLink(req.body)` — the body is inserted with no zod parse, no companyId, and no ownership check on either FK. `bill_line_item_price_links` has **no `companyId` column** (shared/schema.ts); tenancy is derived… | parse with `insertBillLineItemPriceLinkSchema`, then verify `billLineItemId` resolves through `bills → projects.companyId = session companyId` (the s… |
| 76 | `PATCH /api/price-list/review/links/:id` | `routes.ts:34255` | write | `updateBillLineItemPriceLink(id, link)` (storage.ts:24702) updates on `WHERE id = ?` with no company predicate, and the route passes raw `req.body`. Any authenticated user can rewrite any tenant's review link — repointing `priceListItemId`… | add a `companyId` parameter to `updateBillLineItemPriceLink` and resolve ownership through the `billLineItems → bills → projects.companyId` join befo… |
| 77 | `GET /api/xero/callback` | `routes.ts:35250` | write | `companyId` is read from the `state` query param (`JSON.parse(base64)`) with no signature or session comparison, and is only falls back to `user.companyId` when absent. Any authenticated user can complete a Xero OAuth flow with `state = ba… | sign the state the same way #34 signs the Google Calendar OAuth state (HMAC with SESSION_SECRET, nonce + expiry), and additionally assert `stateData.… |

### MEDIUM — 79

| # | endpoint | file:line | op | the gap | suggested fix |
|---|---|---|---|---|---|
| 1 | `DELETE /api/note-groups/:id` | `routes.ts:2449` | write  | `DbStorage.deleteNoteGroup` (storage.ts:9738) first runs `db.update(notes).set({groupId:null}).where(eq(notes.groupId, id))` with NO company filter, and only then performs the company-scoped delete. Passing another company's groupId ungrou… | resolve ownership first (`getNoteGroup(id, companyId)`) and return 404 before the un-grouping update, or add the companyId condition to the notes upd… |
| 2 | `PATCH /api/docs/:id` | `routes.ts:2537` | write | ownership of `:id` is checked by `getOwnedDoc`, but the update is `storage.updateDoc(req.params.id, req.body)` with no schema, so `companyId` (and `folderId`) can be set to another tenant's values — the doc then appears in the victim's Doc… | parse with `insertDocSchema.partial().omit({ companyId: true })`, as `POST /api/docs` effectively does by stamping companyId last. |
| 3 | `PATCH /api/defects/:id` | `routes.ts:3294` | write | `getOwnedDefect(:id)` guards the record being edited, but the body's `projectId` is unguarded, so a caller can re-parent their own defect into another company's project (defects carry no companyId, so it becomes the victim's data). | run `enforceProjectCompany` on `validationResult.data.projectId` when present, or omit `projectId` from the update schema. |
| 4 | `PATCH /api/minutes/:id` | `routes.ts:3366` | write | `getOwnedMinute(:id)` guards the target record, but the body's `projectId` is unguarded, so an owned minute can be re-parented into another tenant's project. | `enforceProjectCompany` on the body projectId, or omit it from the update schema. |
| 5 | `PATCH /api/estimates/:id` | `routes.ts:5926` | write | Ownership of `:id` is enforced, but `insertEstimateSchema.partial()` accepts `projectId`, and `storage.updateEstimate` (storage.ts:10229) only strips `version` and `isLocked`. The caller can move their own estimate onto another company's p… | delete `projectId` from `safeUpdate` (same side-door-close pattern already used for `selectedEstimateId`/`contractPrice` in PATCH /api/projects/:id),… |
| 6 | `PATCH /api/estimate-items/:id` | `routes.ts:6740` | write | `getOwnedEstimateItem` guards `:id`, but `updateData = { ...req.body }` and `insertEstimateItemSchema.partial()` both permit `estimateId`; `storage.updateEstimateItem` applies it verbatim. The caller can relocate their own line item into a… | strip `estimateId` (and `id`) from the patch before validation, mirroring the `.strict()` whitelist used by `PATCH /api/estimates/:estimateId/items/b… |
| 7 | `PATCH /api/estimate-groups/:id` | `routes.ts:7043` | write | `getOwnedEstimateGroup` guards `:id` and there is a same-estimate check for `parentGroupId`, but `estimateId` itself passes straight through `insertEstimateGroupSchema.partial()` into `storage.updateEstimateGroup` (storage.ts:10654). A gro… | strip `estimateId` from the validated patch. |
| 8 | `GET /api/estimates/:id/enotes/attachment-counts` | `routes.ts:7602` | read | `getEnoteAttachmentCounts(estimateId)` joins attachments→enotes filtered by estimateId only. Returns each foreign enote row id and its attachment count — metadata plus a supply of row ids for the delete/patch holes above. | `getOwnedEstimate(req, res, req.params.id)`. |
| 9 | `GET /api/labour-estimates/:id/categories` | `routes.ts:7717` | read | `getLabourEstimateCategories(labourEstimateId)` filters by parent id only; returns category names and aggregated hours for any tenant. | `getOwnedLabourEstimate(:id)` guard. |
| 10 | `POST /api/labour-estimates/:id/categories` | `routes.ts:7726` | write | Inserts a category under any labour estimate id, unguarded. | `getOwnedLabourEstimate(:id)` guard. |
| 11 | `PATCH /api/labour-estimates/:id/categories/reorder` | `routes.ts:7744` | write | `reorderLabourEstimateCategories(req.body.updates)` loops `UPDATE ... WHERE id = ?` over ids taken straight from the body. `:id` is never read. No batch ownership check. | a batch guard on the `ownsAllScopeStages` model — verify every id before any write, reject the whole batch on one miss. |
| 12 | `PATCH /api/labour-estimate-categories/:catId/tasks/reorder` | `routes.ts:7753` | write | Same shape as 7744 for `labour_estimate_tasks`; ids come from `req.body.updates`, `:catId` is never read or checked. | batch ownership guard before the loop. |
| 13 | `PATCH /api/labour-task-templates/:id` | `routes.ts:7798` | write | `updateLabourTaskTemplate(id, req.body)` writes by primary key only; the route reads `companyId` nowhere. Company-library data belonging to another tenant can be rewritten. | pass `companyId` into the storage predicate, matching `updateTaskView(id, data, companyId)`. |
| 14 | `DELETE /api/labour-task-templates/:id` | `routes.ts:7807` | delete | `deleteLabourTaskTemplate(id)` deletes by primary key only, no company predicate, no route guard. | `deleteX(id, companyId)` predicate pattern (see `deleteTaskView`). |
| 15 | `PATCH /api/labour-task-templates/reorder` | `routes.ts:7816` | write | `reorderLabourTaskTemplates(req.body.updates)` updates `sort_order` by id with no company predicate on any row. | add the companyId predicate to the per-row UPDATE, as `reorderTaskViews` does. |
| 16 | `PATCH /api/enote-templates/:id` | `routes.ts:7860` | write | `updateEnoteTemplate(id, req.body)` writes an unvalidated body to a row selected by primary key; the handler never reads `companyId`. | companyId predicate in the storage UPDATE. |
| 17 | `DELETE /api/enote-templates/:id` | `routes.ts:7869` | delete | `deleteEnoteTemplate(id)` deletes by primary key only. | companyId predicate in the storage DELETE. |
| 18 | `PATCH /api/enote-template-sets/:id` | `routes.ts:7902` | write | `renameEnoteTemplateSet(id, name)` renames by primary key; no company check anywhere in the route. | companyId predicate in the storage UPDATE. |
| 19 | `GET /api/enote-template-sets/:id/rows` | `routes.ts:7922` | read | `getEnoteTemplateSetRows(templateSetId)` filters by `templateSetId` alone. Returns another company's template rows including `brainstormNotes`, and supplies the row ids used by the 7860/7869 holes. | load the set and compare `companyId` before returning rows. |
| 20 | `PATCH /api/labour-estimates/:id/categories/:catId` | `routes.ts:7956` | write | `updateLabourEstimateCategory(req.params.catId, req.body)` writes an unvalidated body to a category selected by primary key. `:id` is never read; no company check. | `getOwnedLabourCategory(:catId)` guard. |
| 21 | `GET /api/labour-estimate-categories/:catId/tasks` | `routes.ts:7965` | read | No company check at all. `DbStorage.getLabourEstimateTasks` (storage.ts:11301) selects on `categoryId` alone, and `labour_estimate_tasks` / `labour_estimate_categories` carry no `companyId` column — only the grandparent `labour_estimates`… | add a `getOwnedLabourEstimateCategory` inline helper in the `getOwnedX` style that joins `labour_estimate_categories → labour_estimates` and compares… |
| 22 | `PATCH /api/scope-stages/:id` | `routes.ts:8314` | write | `getOwnedScopeStage(:id)` guards the stage, but `insertScopeStageSchema.partial()` still exposes `projectId`, and `updateScopeStage` writes it. The route then cascades with `storage.bulkUpdateScopeItemsInStage(updatedStage.projectId, updat… | `.omit({ projectId: true })` on the update schema, and add `eq(scopeItems.companyId, companyId)` to `bulkUpdateScopeItemsInStage` (pass the session c… |
| 23 | `GET /objects/company/:companyId/*` | `routes.ts:10043` | read | The handler does compare the `:companyId` segment to the session company and 404s on mismatch, but then strips the segment (`req.path.replace('/objects/company/<id>', '/objects')`) before `getObjectEntityFile`. The GCS bucket is flat (`${P… | partition the bucket per company and resolve against `${PRIVATE_OBJECT_DIR}/<companyId>/uploads/<uuid>`, or verify the object's GCS `companyId` metad… |
| 24 | `PATCH /api/dashboard-views/:id` | `routes.ts:11031` | write | after the (correct) `getDashboardView(id, companyId)` + creator check, the raw `req.body` is handed to `storage.updateDashboardView` (storage.ts:24817), which spreads it into `.set()`. `dashboard_views.companyId` and `creatorId` are theref… | parse the body with `insertDashboardViewSchema.partial()` (shared/schema.ts:6398 already omits companyId/creatorId), or use the allowed-fields whitel… |
| 25 | `PATCH /api/user-roles/:id` | `routes.ts:12656` | write | the update body is parsed with `insertUserRoleSchema.partial()`, which still contains `companyId`, and `storage.updateUserRole` (storage.ts:8590) does `.set({...role})`. The WHERE clause is company-scoped, so the caller can only move their… | parse with `insertUserRoleSchema.omit({ companyId: true }).partial()`, mirroring the POST at routes.ts:12610, or apply an explicit allowed-fields whi… |
| 26 | `POST /api/permissions` | `routes.ts:12758` | write | the `permissions` table has no `companyId` (shared/schema.ts) — it is a single global catalogue joined into every company's role matrix. Any user with `admin.roles:add` in any company can insert rows into it, and they appear in every other… | restrict to platform staff (`requirePlatformStaff`, already imported at routes.ts:199) — the catalogue is seed data, not tenant-editable. If tenant-d… |
| 27 | `GET /api/user-roles/:roleId/permissions` | `routes.ts:12776` | read | `storage.getRolePermissions(roleId)` (storage.ts:8849) filters only on roleId. No `getUserRole(roleId, companyId)` guard, so the full permission matrix of any company's role is readable. | `getUserRole(req.params.roleId, req.user.companyId)` before the read, 404 on miss. |
| 28 | `GET /api/users/:userId/project-access` | `routes.ts:12828` | read | `storage.getUserProjectAccess(userId)` filters on userId only; the handler adds nothing. Returns every project UUID and access level a foreign user holds — which then feeds the write routes above. | load the target user, require `target.companyId === getSessionCompanyId(req)`, else 404. |
| 29 | `PATCH /api/selections/:id` | `routes.ts:13611` | write | `enforceProjectCompany` validates the selection's *current* project, but `insertSelectionSchema.partial()` does not omit `projectId` (shared/schema.ts:1522), and `storage.updateSelection` writes it verbatim. A caller can move their own sel… | strip `projectId` from the update payload (the `const { companyId: _ignored, ...body }` pattern used by `PATCH /api/products/:id`), or run `enforcePr… |
| 30 | `PATCH /api/selection-options/:id` | `routes.ts:13693` | write | `assertOptionAccess` verifies the option's current parent, but `insertSelectionOptionSchema.partial()` keeps `selectionId` (shared/schema.ts:1563), so the body can re-parent the option onto another company's selection — it then renders ins… | strip `selectionId` from the update payload, or re-run `assertOptionAccess`-equivalent ownership on the incoming `selectionId`. |
| 31 | `PATCH /api/supplier-insurances/:id` | `routes.ts:14678` | write | `getOwnedSupplier(existing.supplierId)` checks the current parent only; `insertSupplierInsuranceSchema.partial()` keeps `supplierId`, so the row can be re-pointed at another company's supplier and will then surface in that tenant's `GET /a… | strip `supplierId` from the payload, or `getOwnedSupplier` the incoming value as well. |
| 32 | `PATCH /api/contact-insurances/:id` | `routes.ts:14763` | write | Same shape — `getContact(existing.contactId, companyId)` guards the current parent, but `insertContactInsuranceSchema.partial()` keeps `contactId`, allowing re-parenting onto another company's contact (visible in their `/api/expiring-conta… | strip `contactId`, or `getContact(body.contactId, companyId)` before the update. |
| 33 | `PATCH /api/supplier-contacts/:id` | `routes.ts:14850` | write | Same shape — `insertSupplierContactSchema.partial()` keeps `supplierId`, so the contact row can be moved under another company's supplier and is then returned by their `GET /api/suppliers/:id/contacts`. | strip `supplierId`, or `getOwnedSupplier(body.supplierId)`. |
| 34 | `POST /api/rfqs` | `routes.ts:15564` | read + | `body.projectId` is never validated. Line 15577 does `storage.getProject(validationResult.data.projectId)` with no company comparison and the project's name is echoed back in the generated `rfqNumber` (first 4 chars, upper-cased) — a direc… | `if (!(await enforceProjectCompany(req, res, validationResult.data.projectId, "Project not found"))) return;` before the number generation, exactly a… |
| 35 | `PATCH /api/rfq-items/:id` | `routes.ts:15690` | write | Ownership is checked on the item's existing `rfqId`, but `insertRfqItemSchema.partial()` keeps `rfqId`, so the body can move the item into another company's RFQ (which `GET /api/rfqs/:rfqId/items` then serves to that tenant). Note `PATCH /… | copy the "Cannot change rfqId of an existing quote" 400 guard from routes.ts:15805. |
| 36 | `POST /api/bills/:id/attachments` | `routes.ts:17145` | write | the company comparison is `if (userRole !== "admin" && project.companyId !== userCompanyId)`. `admin` is a per-company role, not platform staff (`requirePlatformStaff` is the platform gate, auth.ts:264), so company A's admin can append an… | replace the whole hand-rolled block with `getOwnedBill(req, res, req.params.id)`, which already handles the legacy project-only fallback and 404s. |
| 37 | `POST /api/bills/:id/link-po` | `routes.ts:17373` | write | the PO side is scoped, but the bill side is `if (companyId && previous.companyId && previous.companyId !== companyId)` — the check short-circuits when the bill's `companyId` is null. `getOwnedBill` exists precisely because older bills carr… | swap the inline check for `getOwnedBill(req, res, req.params.id)`. |
| 38 | `POST /api/bills/:id/unlink-po` | `routes.ts:17408` | write | same null-`companyId` short-circuit as link-po; a legacy bill belonging to another tenant can be unlinked from its PO (which then triggers `recomputePOStatusFromBills` on their PO). | `getOwnedBill`. |
| 39 | `POST /api/bills/:id/resuggest-po` | `routes.ts:17429` | write | same null-`companyId` short-circuit; runs `applyPOSuggestionsToBill(..., { autoApply: true })` against another tenant's legacy bill and returns the resulting bill row (a read of their data) plus the matched/suggested PO ids. | `getOwnedBill`. |
| 40 | `PATCH /api/variations/:id` | `routes.ts:18554` | write | `getOwnedVariation` guards the row, but `updateVariationSchema` = `insertVariationSchema.partial().omit(VARIATION_GUARDED_FIELDS)` and `projectId` is not in the guarded list (routes.ts:18206-18226), so the caller's own variation can be rep… | add `projectId: true` to `VARIATION_GUARDED_FIELDS` (a variation should never change project), or `enforceProjectCompany` it. |
| 41 | `PATCH /api/purchase-orders/:id` | `routes.ts:19414` | write | Ownership of `:id` is checked, but the validated patch (`insertPurchaseOrderSchema.partial()`) can contain `projectId` and `companyId`; `storage.updatePurchaseOrder` (23461) writes them unchanged. A caller can push their own PO into anothe… | drop `companyId` from the accepted patch and gate any `projectId` with `enforceProjectCompany`. |
| 42 | `PATCH /api/purchase-order-items/:id` | `routes.ts:19715` | write | `verifyPOItemOwnership` confirms the item's *current* parent, but `insertPurchaseOrderItemSchema.partial()` admits `purchaseOrderId`, so the item can be repointed at another company's PO — adding a line (and its money) to their order. | delete `purchaseOrderId` from the patch before `updatePurchaseOrderItem`, or run `verifyPOOwnership` on the incoming value. |
| 43 | `POST /api/purchase-orders/:poId/items/reorder` | `routes.ts:19765` | write | `verifyPOOwnership(:poId)` gates the parent PO, but the `itemIds`/`updates` array is passed straight to `storage.reorderPurchaseOrderItems` (storage.ts:23604), which updates `displayOrder` by item id alone. The ids are never required to be… | batch-ownership guard in the shape of `ownsAllScopeStages` — load each item and reject the whole batch unless every `purchaseOrderId` equals `req.par… |
| 44 | `PATCH /api/purchase-orders/:poId/items/:itemId` | `routes.ts:19794` | write | Both the PO and the item→PO relationship are verified, yet the body's `purchaseOrderId` is still applied — the same repoint hole as 19715. | strip `purchaseOrderId` from the patch payload. |
| 45 | `POST /api/purchase-orders/generate-from-timesheets` | `routes.ts:20372` | write | Timesheet ids are correctly filtered to the caller's company (20389–20396), but `body.projectId` (and `body.supplierId`) go straight into `storage.createPurchaseOrder` unchecked, so the generated PO can be pinned to another company's proje… | `enforceProjectCompany(req, res, projectId)` after the required-field checks; `getOwnedSupplier` for `supplierId`. |
| 46 | `POST /api/client-invoices` | `routes.ts:20648` | write | `enforceProjectCompany(data.projectId)` is correct, but `companyId` is not omitted from `insertClientInvoiceSchema` and `storage.createClientInvoice` (16738) only back-fills it when absent. A caller can therefore create an invoice under th… | omit `companyId` from the accepted payload and always derive it from the verified project, as `createProposalAtomic` does. |
| 47 | `PATCH /api/client-invoices/:id` | `routes.ts:20706` | write | `getOwnedClientInvoice` guards `:id`, but `insertClientInvoiceSchema.partial()` still admits `projectId` and `companyId`, and `storage.updateClientInvoice` (16760) `.set(invoice)` passes them through. The second id (the new project/company… | strip `projectId`/`companyId` from the patch, or run `enforceProjectCompany` on any incoming `projectId`. |
| 48 | `POST /api/client-invoices/full` | `routes.ts:20906` | write  | Two holes. (a) `verifyInvoiceChildrenOwnership` (20886) checks variations, allowances, bills and timesheets but **not** `children.selections` — a foreign `selectionOptionId` can be linked, and `GET /api/client-invoices/:id/selections` (215… | extend `verifyInvoiceChildrenOwnership` with the same option→selection→project check the single-link route uses at 21523–21527; strip `companyId` fro… |
| 49 | `PUT /api/client-invoices/:id/full` | `routes.ts:20953` | write  | Same unverified `children.selections` hole as the POST, plus the partial invoice body can carry `projectId`/`companyId`, which `storage.updateClientInvoiceFull` (16853) writes straight through — moving an owned invoice into another tenant'… | verify selections as above; reject or re-`enforceProjectCompany` any `projectId` in the body and never accept `companyId` from the client. |
| 50 | `PATCH /api/client-invoice-items/:id` | `routes.ts:21034` | write | Ownership walks item→invoice→project→company for the *existing* row, but `insertClientInvoiceItemSchema.partial()` admits `invoiceId` and `updateClientInvoiceItem` (16920) applies it, letting an item be attached to another company's invoic… | strip `invoiceId`, or re-run `getOwnedClientInvoice` on the incoming value. |
| 51 | `PATCH /api/invoice-variations/:id` | `routes.ts:21267` | write | The junction row is scoped via its invoice, but the patch may set `variationId` (and `invoiceId`). Worse, line 21282 then calls `storage.recomputeVariationPaidAmount(updated.variationId)` — a direct write to another company's variation rec… | apply the same check the create route uses at 21236 — the variation's `projectId` must equal the owned invoice's `projectId` — and reject a changed `… |
| 52 | `PATCH /api/invoice-allowances/:id` | `routes.ts:21360` | write | Junction row scoped by invoice, but the patch may set `estimateItemId`/`invoiceId` with no re-check, so a foreign estimate item can be linked to an owned invoice (the create route at 21331 does check this). | reuse the create-route check — `getOwnedEstimate(item.estimateId)` on any incoming `estimateItemId`; reject a changed `invoiceId`. |
| 53 | `PATCH /api/proposals/:id` | `routes.ts:21735` | write | `getOwnedProposal` guards `:id`, but `insertProposalSchema.partial()` admits `projectId` and `companyId` and `storage.updateProposal` (17723) writes them through. | strip `companyId`; `enforceProjectCompany` on any incoming `projectId`. |
| 54 | `PATCH /api/proposal-sections/:id` | `routes.ts:21803` | write | Section→proposal ownership is resolved for the existing row, but the patch's `proposalId` is applied by `updateProposalSection` (17772), moving the section onto another company's proposal. | strip `proposalId` from the patch, or `getOwnedProposal` the incoming value. |
| 55 | `PATCH /api/proposal-items/:id` | `routes.ts:21876` | write | Same as the section route — `proposalId` in the body is written by `updateProposalItem` (17821) with no ownership check on the new parent. | strip `proposalId` from the patch payload. |
| 56 | `GET /api/proposals/:id/latest-acceptance` | `routes.ts:21970` | read | `storage.getLatestProposalAcceptance(req.params.id)` runs with no ownership check; the DbStorage query filters only on `proposalId`. Returns the client's signed name, email, signature image and comments for any proposal id. (`GET /api/prop… | `if (!(await getOwnedProposal(req, res, req.params.id))) return;` |
| 57 | `PUT /api/system-configuration` | `routes.ts:22551` | write | `system_configuration` has no `companyId` column and `updateSystemConfiguration` (storage.ts:13793) writes the single first row. Any company's admin therefore rewrites currency, timezone, date format and every document-numbering prefix/sta… | add `companyId` to the table and scope reads/writes to the session company (the same shape as the `getCompanySettings(companyId)` fix in #33); until… |
| 58 | `PATCH /api/activities/:id` | `routes.ts:23183` | write | Only checks that a user is logged in. `storage.updateActivity(id, …)` (storage.ts:18208) filters on `eq(activities.id, id)` alone, so any activity row in any company can be pinned/unpinned and stamped with the attacker's `pinnedBy` user id… | load the activity, `enforceProjectCompany(req, res, activity.projectId)` (or compare `activity.companyId` to the session), then update. |
| 59 | `GET /api/site-diary-templates/:id` | `routes.ts:23239` | read | `storage.getSiteDiaryTemplate(id)` filters on id only (storage.ts:18234). Any template in any company is readable. | a `getOwnedSiteDiaryTemplate(req, res, id)` helper in the `getOwnedX` family, comparing `template.companyId` to the session and 404ing. |
| 60 | `POST /api/site-diary-templates` | `routes.ts:23275` | write | `insertSiteDiaryTemplateSchema` does not omit `companyId` (shared/schema.ts:3007), and the route only backfills it when absent: `if (user?.companyId && !data.companyId) data.companyId = user.companyId;`. A body-supplied `companyId` therefo… | `insertSiteDiaryTemplateSchema.omit({ companyId: true })` and stamp `companyId` from the session unconditionally, as `POST /api/cost-categories` (239… |
| 61 | `POST /api/ai/conversations/:id/messages` | `routes.ts:24620` | write | Both routes correctly gate the conversation (`conv.companyId !== companyId \|\| conv.userId !== userId`) and pass the session `companyId` into `executeTool`. Every tool in `server/ai/executor.ts` re-verifies ids against that companyId **ex… | in `create_task`, add the same `db.select().from(projects).where(and(eq(id, input.project_id), eq(companyId, companyId)))` guard the other project-sc… |
| 62 | `POST /api/checklist-instances` | `routes.ts:25852` | read | `body.projectId` is checked with `enforceProjectCompany`, but `body.templateId` is not. The handler then calls `getChecklistTemplateGroups(data.templateId)` and `getChecklistTemplateItems(group.id)` and copies every group name and item (de… | `getOwnedTemplate(req, res, data.templateId)` before the copy loop (the helper already exists at 24988 and is used by every other template route). |
| 63 | `POST /api/timesheets/clock-in` | `routes.ts:27403` | write | `body.projectId` (and `body.costCodeId`) go straight into `storage.clockIn(resolvedProjectId, user.id, costCodeId)` (storage.ts:20038) with no `enforceProjectCompany`. The inserted timesheet row carries a foreign projectId, so it lands in… | `if (projectId && !(await enforceProjectCompany(req, res, projectId, "Project not found"))) return;` before calling clockIn — the same guard GET /api… |
| 64 | `POST /api/timesheet-allowances` | `routes.ts:28173` | write | only `body.timesheetId` is guarded (`getOwnedTimesheet`). `insertTimesheetAllowanceSchema` still carries `estimateItemId`, which is inserted unchecked — allocating your labour cost against another tenant's allowance line, where it then app… | `getOwnedEstimateItem(req, res, data.estimateItemId)` alongside the existing timesheet guard, as POST /api/allowance-items (28307) already does. |
| 65 | `PATCH /api/timesheet-allowances/:id` | `routes.ts:28195` | write | ownership is resolved from `existingAllowance.timesheetId`, but the partial body may contain a new `estimateItemId` **or** a new `timesheetId`, both written without checking the target. An owned allocation can be retargeted onto a foreign… | when `data.estimateItemId`/`data.timesheetId` differ from the existing values, guard the target with `getOwnedEstimateItem` / `getOwnedTimesheet` bef… |
| 66 | `PATCH /api/allowance-items/:id` | `routes.ts:28317` | write | the *existing* item's parent estimate item is checked, but `insertAllowanceItemSchema.partial()` includes `estimateItemId`, so the update can move the row onto a foreign allowance — injecting a cost line into another tenant's PS/PC allowan… | re-run `getOwnedEstimateItem` on `validationResult.data.estimateItemId` when it differs from `existing.estimateItemId`. |
| 67 | `GET /api/schedule-items/:itemId/steps` | `routes.ts:29868` | read | only `if (!req.user)`. Direct `db.select().from(scheduleItemSteps).where(eq(scheduleItemId, req.params.itemId))` with no ownership resolution. | `getOwnedScheduleItem(req, res, req.params.itemId)`. |
| 68 | `GET /api/schedules/:scheduleId/baselines` | `routes.ts:29906` | read | only `if (!req.user)`. Selects all `scheduleBaselines` for the supplied scheduleId with no project/company resolution. | `getScheduleById` + `enforceProjectCompany(schedule.projectId)`. |
| 69 | `GET /api/baselines/:baselineId/items` | `routes.ts:29949` | read | only `if (!req.user)`. Reads `scheduleBaselineItems` by baselineId with no ownership chain (`baseline → schedule → project → company`). | load the baseline, then `enforceProjectCompany` via its schedule's project. |
| 70 | `POST /api/schedule-items/:id/dependencies` | `routes.ts:30043` | read ( | `:id` is guarded by `getOwnedScheduleItem`, but `predecessorId` from the body is fetched with the raw `storage.getScheduleItem` and used unchecked. The distinct 404 ("Predecessor item not found") confirms existence of arbitrary item ids, a… | guard the predecessor with `getOwnedScheduleItem(req, res, predecessorId)` (or require it to share `item.scheduleId`). |
| 71 | `PATCH /api/schedule-items/:id/dependencies/:predecessorId` | `routes.ts:30191` | read ( | same unguarded `storage.getScheduleItem(req.params.predecessorId)` at 30222; the foreign predecessor's `endDate` drives the caller's item dates and is therefore observable in the response. The dependency entry only has to exist on the call… | same as 30043 — resolve the predecessor through `getOwnedScheduleItem` / same-schedule assertion. |
| 72 | `POST /api/activity-notes/batch-counts` | `routes.ts:30330` | read | `storage.getBatchActivityNoteCounts(scheduleItemIds)` (storage.ts:21354) runs `inArray(activityNotes.scheduleItemId, ids)` with no company predicate. Any list of item ids is accepted. | join through `schedules → projects.companyId = session companyId` inside the storage function, or filter the incoming ids with the same join used by… |
| 73 | `GET /api/schedule-items/:scheduleItemId/activity-notes` | `routes.ts:30348` | read | no ownership check on `:scheduleItemId`; `storage.getActivityNotes` / `getActivityNoteCount` filter by scheduleItemId only. Returns full note content, author names and metadata. | `getOwnedScheduleItem(req, res, req.params.scheduleItemId)` first. |
| 74 | `PATCH /api/template-categories/:id` | `routes.ts:31933` | write | ownership of `:id` is verified, but `insertTemplateCategorySchema` (schema.ts:5656) does **not** omit `companyId`, and `validationResult.data` is passed straight into `updateTemplateCategory`, whose `.set({...category})` therefore writes a… | strip immutable fields in the route the way `PATCH /api/schedule-templates/:id` does (`const { companyId, ...safeUpdates } = validationResult.data`),… |
| 75 | `GET /api/project-workflows/:id` | `routes.ts:32688` | read | `getProjectWorkflow(id)` filters on `id` only, and `project_workflows` has **no `companyId` column** (shared/schema.ts) — the only tenancy path is `projectId → projects.companyId`, and it is never walked. | load the row, then `enforceProjectCompany(req, res, row.projectId)`; ideally add a `getOwnedProjectWorkflow` helper alongside `getOwnedScheduleItem`. |
| 76 | `PATCH /api/channels/:id` | `routes.ts:32870` | write | The WHERE clause is correct (`id + companyId`), but the validator is `insertChannelSchema.partial()` and `insertChannelSchema` (shared/schema.ts:4815) omits only `id/createdAt/updatedAt` — **`companyId` and `projectId` remain settable**. A… | `.omit({ companyId: true, createdById: true }).partial()` on the PATCH validator, matching the POST route. |
| 77 | `PATCH /api/business-schedule/projects/:projectId` | `routes.ts:35133` | write | the existing-row lookup filters on `companyId`, but when no row exists the insert takes `:projectId` straight from the path and `milestoneStartItemId` / `milestoneEndItemId` straight from the body, none of them verified. Nothing calls `enf… | `if (!(await enforceProjectCompany(req, res, projectId))) return;` plus a company-scoped existence check on both milestone item ids (join `schedule_i… |
| 78 | `POST /api/xero/push-bill` | `routes.ts:35409` | write | `pushBillToXeroInternal` does perform the ownership check (routes.ts:486–503), but `writeSyncStatus("failed", …)` runs *before* returning the 403, and again in the earlier NO_CONNECTION branch (routes.ts:472) which precedes the ownership c… | move the tenant ownership check to the very top of `pushBillToXeroInternal`, before `writeSyncStatus` is ever callable, and only after that resolve t… |
| 79 | `POST /api/xero/sync-bill-payment/:id` | `routes.ts:36505` | write | the tenant check is wrapped in `if (bill.projectId) { ... }`. `bills.projectId` is nullable (business-level bills, bill-inbox intake), so for any project-less bill the handler falls straight through to `syncBillFromXeroInternal(bill.id, co… | replicate the `pushBillToXeroInternal` pattern — project company check when `projectId` is set, else `bill.companyId !== companyId` → 404. Better: us… |

### LOW — 48

| # | endpoint | file:line | op | the gap | suggested fix |
|---|---|---|---|---|---|
| 1 | `PATCH /api/note-groups/:id` | `routes.ts:2429` | write | `storage.updateNoteGroup(req.params.id, req.body, companyId)` scopes the WHERE clause but SETs the whole raw body, so `{"companyId":"<victim>"}` moves the caller's own group (and its notes' grouping) into another tenant's Notes UI. No zod… | validate with `insertNoteGroupSchema.partial().omit({ companyId: true })` before passing to storage. |
| 2 | `POST /api/field-categories/seed-missing` | `routes.ts:3581` | write | `seedMissingBuiltInCategories` (storage.ts:7664) inserts into `field_categories`/`field_options`, which have no company_id column (shared/schema.ts:1435, 1458) — the write applies to every tenant. Content is fixed built-ins, so impact is l… | add `company_id` to `field_categories`/`field_options` and seed per company. |
| 3 | `GET /api/field-categories` | `routes.ts:3595` | read | `getFieldCategories()` / `getFieldOptions(categoryId)` take no companyId and the tables have no company column, so a caller sees every tenant's customised status/priority/trade/selection-category names. | company-scope the tables and thread session companyId through `getFieldCategories`. |
| 4 | `GET /api/field-categories/by-key/:key` | `routes.ts:3616` | read | `getFieldCategoryWithOptions(key)` matches on the globally-unique `key` with no company filter; option names customised by other tenants come back. | as above; key uniqueness must become (companyId, key). |
| 5 | `GET /api/field-categories/:id` | `routes.ts:3658` | read | `getFieldCategory(id)` filters on id only; any category row in the database is readable. | company-scope the table and the lookup. |
| 6 | `DELETE /api/field-categories/:id` | `routes.ts:3709` | read ( | reads any category via unscoped `getFieldCategory(id)` and reveals its existence / `isBuiltIn` flag through distinct error responses. `DbStorage.deleteFieldCategory` returns `false` (storage.ts:13844), so nothing is actually deleted today… | company-scope the table; add the companyId condition when the delete is implemented. |
| 7 | `GET /api/field-categories/:categoryId/options` | `routes.ts:3731` | read | `getFieldOptions(categoryId)` has no company filter; returns every tenant's options for that category. | company-scope `field_options`. |
| 8 | `GET /api/field-options` | `routes.ts:3741` | read | resolves a category by `categoryKey` across all tenants and returns its active options. | company-scope `field_categories`/`field_options`. |
| 9 | `GET /api/field-options/:id` | `routes.ts:3763` | read | `getFieldOption(id)` filters on id only. | company-scope `field_options`. |
| 10 | `POST /api/enote-templates` | `routes.ts:7849` | write | `companyId` is correctly stamped from the session, but the raw body spread lets the caller set `templateSetId` to a foreign set. `getEnoteTemplateSetRows` filters by `templateSetId` alone, so the injected row shows up inside the victim's t… | validate `templateSetId` against a company-scoped lookup before insert; stop spreading the raw body. |
| 11 | `PATCH /api/scope-item-types/:id` | `routes.ts:8056` | write | Ownership of `:id` is checked correctly, but the patch body is validated with `insertScopeItemTypeDefinitionSchema.partial()`, and that schema (shared/schema.ts:6663) omits only `id`/`createdAt` — `companyId` survives. `updateScopeItemType… | `.omit({ companyId: true })` on the patch schema (the pattern already used at 8046/8131/8271), and add `eq(companyId)` to the storage UPDATE's WHERE. |
| 12 | `PATCH /api/scope/:id` | `routes.ts:8178` | write | The per-record companyId check covers `:id`, but `insertScopeItemSchema.partial()` still contains `projectId` (shared/schema.ts:4127 omits only id/companyId/timestamps), and `updateScopeItem` writes whatever it is given. A caller can reloc… | `.omit({ projectId: true })` on the update schema (POST at 8131 already does this), or run `enforceProjectCompany` when the body carries a `projectId… |
| 13 | `PATCH /api/folder-templates/:id` | `routes.ts:9804` | write | `req.body` is passed straight through with no zod parse: `storage.updateFolderTemplate(req.params.id, req.body, req.user.companyId)` → `.set({ ...template, updatedAt })`. The WHERE clause correctly scopes to the caller's company, so the ta… | parse with `insertFolderTemplateSchema.partial()` before the storage call (that schema already omits `companyId`). |
| 14 | `POST /api/folder-templates/:id/apply` | `routes.ts:9832` | write | The template is fetched company-scoped, but `projectId` from the body is never checked: `storage.getProject(projectId)` runs unscoped (its only use is a 404-vs-200 existence test — the fetched project is never actually read), and every fol… | `if (!(await enforceProjectCompany(req, res, projectId, "Project not found"))) return;` before the template lookup. |
| 15 | `POST /api/drive-attachments` | `routes.ts:9909` | write | `companyId`/`attachedBy` are stamped from the session (correctly, after the body spread) but the parent entity is never verified — `attachedToType`/`attachedToId` come straight from the body, so a Drive file can be attached to another tena… | switch on `attachedToType` and run the matching guard (`enforceProjectCompany`, `getOwnedBill`, `getOwnedEstimate`, …) on `attachedToId` before the i… |
| 16 | `POST /api/projects/:projectId/takeoff/plans` | `routes.ts:10108` | write | `projectId` is taken from the path and `companyId` from the session, then inserted — no `enforceProjectCompany`. Every other project-scoped create in this batch (8128, 8154, 8268, 8414) calls the guard; the takeoff block never does. A plan… | `enforceProjectCompany(req, res, req.params.projectId)` at the top of the handler. |
| 17 | `PATCH /api/projects/:projectId/takeoff/plans/:planId` | `routes.ts:10121` | write | Plan ownership is checked properly, but `req.body` is then passed unvalidated into `storage.updateTakeoffPlan(planId, companyId, req.body)` → `.set({ ...data })`. Unlike the sibling measurement/markup/category routes, this one has no `pick… | add an `updateTakeoffPlanSchema = insertTakeoffPlanSchema.pick({...}).partial()` allowlist, mirroring `updateTakeoffMeasurementSchema` at routes.ts:1… |
| 18 | `POST /api/projects/:projectId/takeoff/categories` | `routes.ts:10177` | write | Same as the plans create — `:projectId` is stamped into the row with no `enforceProjectCompany`, producing a category row that references another tenant's project. Bounded by companyId-filtered reads. | `enforceProjectCompany(req, res, req.params.projectId)` at the top of the handler. |
| 19 | `POST /api/selections/create-po` | `routes.ts:13469` | write | `projectId` and every `selectionId` are properly verified, but `body.supplierId` is written onto the new purchase order with no ownership check, creating a PO in company A that references company B's supplier row (any PO view that joins th… | `getOwnedSupplier(req, res, supplierId)` when `supplierId` is supplied. |
| 20 | `POST /api/selections/:selectionId/options` | `routes.ts:13668` | write | The parent selection is guarded, and `selectionId` is forced from the path, but `insertSelectionOptionSchema` accepts `productId` and it is stored with no ownership check — an option in company A can link to company B's product-library row… | `getOwnedProduct(req, res, Number(productId))` when `productId` is present, matching routes.ts:14360. |
| 21 | `POST /api/client-selections` | `routes.ts:13982` | write | `projectId` is guarded by `enforceProjectCompany`, but `selectionId` and `optionId` (both NOT NULL FKs, shared/schema.ts `clientSelections`) are written unchecked — a client-selection row in company A can point at company B's selection/opt… | resolve the selection via `storage.getSelection` + `enforceProjectCompany`, and the option via `assertOptionAccess`, before create. |
| 22 | `PUT /api/suppliers/:id/labels` | `routes.ts:14632` | write | The supplier is guarded by `getOwnedSupplier`, but `storage.setSupplierLabels(supplierId, labelIds)` (storage.ts:14079) bulk-inserts whatever label ids the body supplies with no company filter, so a caller can attach another company's labe… | filter `labelIds` against `storage.getSupplierLabels(req.user.companyId)` (or add a companyId predicate inside `setSupplierLabels`) and 404 on any un… |
| 23 | `POST /api/supplier-name-mappings` | `routes.ts:15516` | write | `companyId` is taken from the session (good), but `body.supplierId` is stored unchecked, so a mapping in company A can resolve incoming bill supplier names to company B's supplier record. | `getOwnedSupplier(req, res, supplierId)` before `createSupplierNameMapping`. |
| 24 | `PATCH /api/rfqs/:id` | `routes.ts:15599` | write | The RFQ's own `companyId` is compared, but `insertRfqSchema.partial()` retains `projectId`, so an RFQ can be re-pointed at another company's project without any check. Secondary: the mismatch answers 403 ("Access denied") instead of the 40… | `enforceProjectCompany` on the incoming `projectId`; switch the 403 to 404. |
| 25 | `POST /api/rfq-items` | `routes.ts:15665` | write | The parent RFQ is correctly company-checked, but `estimateItemId` and `costCodeId` from the body are persisted with no ownership check, letting an RFQ item reference another tenant's estimate line or cost code. | `getOwnedEstimateItem(req, res, estimateItemId)` when present, plus a company check on `costCodeId`. |
| 26 | `POST /api/rfq-quotes` | `routes.ts:15761` | write | The RFQ is company-checked, but `supplierId` (a `contacts.id`, per shared/schema.ts) is written unvalidated, so a quote can be attributed to another company's contact. Mismatch on the RFQ also answers 403 rather than 404. | `storage.getContact(supplierId, req.user.companyId)` (404 on miss) before create; switch 403 → 404. |
| 27 | `PATCH /api/rfq-quotes/:id` | `routes.ts:15794` | write | The route explicitly blocks `rfqId` reassignment and checks the parent RFQ's company, but `supplierId` in the partial body is still unvalidated, so the quote can be re-attributed to another company's contact. Mismatch answers 403 rather th… | same contact ownership check as above. |
| 28 | `POST /api/rfq-portal-tokens` | `routes.ts:15988` | write | `rfqId` is verified against the session company, but `supplierId` is taken from the body and written to the token row with no `getOwnedSupplier` check, so a token can be minted referencing another tenant's supplier record. Any later join f… | `getOwnedSupplier(req, res, supplierId)` (routes.ts:5593) when `supplierId` is supplied. |
| 29 | `POST /api/rfis` | `routes.ts:16545` | write | `companyId` is correctly forced from the session (and omitted from `insertRfiSchema`), but `projectId` comes from the body and is never checked. The created RFI references a foreign project and `getNextRFINumber(companyId, rfi.projectId)`… | `enforceProjectCompany(req, res, validationResult.data.projectId)` before `storage.createRFI`. |
| 30 | `PATCH /api/rfis/:id` | `routes.ts:16568` | write | `getOwnedRFI` guards the RFI, but `insertRfiSchema.partial()` still carries `projectId`, so an owned RFI can be repointed at a foreign project. `companyId` is omitted from the schema, so the record cannot be handed over wholesale. | `enforceProjectCompany` on any incoming `projectId`, or drop `projectId` from the update schema. |
| 31 | `POST /api/bills/recompute-totals` | `routes.ts:17793` | write | the bill read is company-scoped (`getBills(projectId, undefined, companyId)` returns nothing for a foreign project, so no data leaks out), but `projectId` itself is never owned, and on `dryRun: false` the handler unconditionally calls `rec… | `enforceProjectCompany(req, res, projectId, "Project not found")` at the top of the handler. |
| 32 | `PATCH /api/bill-line-items/:id/link-price-item` | `routes.ts:17955` | write | the line item's parent bill is correctly resolved through `getOwnedBill`, but the body's `priceListItemId` is written unvalidated, so an owned bill line can be linked to another company's price-list item. Any read path that later joins on… | resolve `priceListItemId` and compare its `companyId` to the session before the update (the `getOwnedProduct` helper at routes.ts:14181 is the neares… |
| 33 | `PATCH /api/bill-line-item-allowances/:id` | `routes.ts:18005` | write | the existing row is correctly walked to its bill via `getOwnedBill`, but `insertBillLineItemAllowanceSchema.partial()` still includes `billLineItemId` and `allowanceItemId`, so the update can repoint an owned allocation at a foreign bill l… | reject `billLineItemId`/`allowanceItemId` in the PATCH body (the `rfqId` reassignment block at routes.ts:15912 is the in-repo precedent), or re-run t… |
| 34 | `PATCH /api/variation-items/:id` | `routes.ts:18731` | write | the item's current parent variation is guarded, but `insertVariationItemSchema.partial()` includes `variationId`, and the merged `data` is passed to `storage.updateVariationItem`. An owned line can therefore be moved onto another company's… | strip `variationId` from the PATCH payload (the create route already pins it from the URL at 18680). |
| 35 | `POST /api/favorite-suppliers/reorder` | `routes.ts:20238` | write | No `req.user` check and no ownership check at all; `storage.reorderFavoriteSuppliers` (23835) updates `displayOrder` by id alone, so any authenticated user can reorder any user's favourites in any company. | add `userId`+`companyId` predicates to `reorderFavoriteSuppliers`, mirroring `deleteFavoriteSupplier(id, userId, companyId)`. |
| 36 | `DELETE /api/favorite-cost-codes/:id` | `routes.ts:20300` | delete | No `req.user` check; `storage.deleteFavoriteCostCode(id)` (23878) deletes by id only. The sibling supplier route already takes `(id, userId, companyId)` — this one does not. | change the storage signature to `deleteFavoriteCostCode(id, userId, companyId)` with both in the WHERE, matching `deleteFavoriteSupplier`. |
| 37 | `POST /api/favorite-cost-codes/reorder` | `routes.ts:20314` | write | Same as the supplier reorder — no auth/ownership check, `reorderFavoriteCostCodes` (23889) updates by id alone. | add `userId`+`companyId` predicates in the storage update. |
| 38 | `PATCH /api/hbcf-projects/:id` | `routes.ts:22491` | write | The row is correctly confirmed to be in the caller's company, but `storage.updateHbcfProject(req.params.id, req.body)` passes the **raw, unvalidated** body straight to `db.update` with only `eq(id)` in the WHERE. A body `{"companyId":"<vic… | validate with `insertHbcfProjectSchema.omit({ companyId: true }).partial()` and add `eq(companyId)` to the storage WHERE, as `updateCostCode(id, …, c… |
| 39 | `POST /api/site-diary-entries` | `routes.ts:23716` | write  | The project is properly guarded with `enforceProjectCompany(body.projectId)`, but `templateId` is only existence-checked via the unscoped `getSiteDiaryTemplate`. The created entry can therefore reference another company's template, and `te… | ownership-check `templateId` against the session company (new `getOwnedSiteDiaryTemplate`) before insert. |
| 40 | `POST /api/channels` | `routes.ts:32827` | write | `companyId` is correctly stamped from the session, but neither `projectId` nor `dmParticipants` is validated. `dmParticipants` user ids are inserted straight into `channel_members` (line 32855–32862), so a company-A user can attach company… | filter `dmParticipants` through a `users.companyId = session companyId` lookup (the pattern `createTaskTemplate` already uses for `assigneeUserId`),… |
| 41 | `POST /api/channels/dm` | `routes.ts:32903` | write | `otherUserId` comes from the body and is passed to `getOrCreateDMChannel(userId, otherUserId, companyId)` with no check that the target user belongs to the caller's company. The channel is stamped with the caller's companyId but a `channel… | look up `otherUserId` with `users.companyId = req.user.companyId` and 404 if absent, before calling `getOrCreateDMChannel`. |
| 42 | `POST /api/channels/:channelId/read` | `routes.ts:33058` | write | The DB write is self-scoped (`WHERE channelId AND userId = session user`), so it no-ops for a channel the caller isn't in. But `emitMessagesRead(req.params.channelId, userId, …)` fires unconditionally into the `channel:<id>` socket room, s… | add the `getChannel(channelId, companyId)` 404-guard used at line 33013 before the write/emit. |
| 43 | `PATCH /api/price-list/categories/:id` | `routes.ts:34084` | write | The UPDATE is correctly gated on `id + companyId`, but `req.body` is passed **raw** (no zod parse) into `db.update(...).set({ ...category, updatedAt })`. `priceListCategories.companyId` is a real column, so a body containing `companyId` re… | parse with `insertPriceListCategorySchema.partial()` (it already omits `companyId`) before calling storage, matching the reminders/systems routes. |
| 44 | `PATCH /api/price-list/items/:id` | `routes.ts:34165` | write | Identical to the category route — raw `req.body` reaches `db.update(...).set(...)`, and `priceListItems.companyId` is a settable column, so the caller can donate their own price-list item (with its full price history) into another company'… | `insertPriceListItemSchema.partial()` parse before `updatePriceListItem`. |
| 45 | `POST /api/price-list/items/bulk-update` | `routes.ts:34197` | write | `updates` is only checked with `Array.isArray`; each `update.data` flows unvalidated into `updatePriceListItem` and thence into `.set()`. Same `companyId` mass-assignment as above, but applied to an arbitrary number of rows in one call. | validate each element with `z.object({ id: z.string(), data: insertPriceListItemSchema.partial() })` before the loop. |
| 46 | `POST /api/projects/:projectId/pinned-items` | `routes.ts:34574` | write | `:projectId` is written into the new row with no ownership check — only `requireTeamMember` (a role gate) and the caller's own userId/companyId being stamped on. This is the "stamping your own companyId is not an ownership check" trap; the… | `if (!(await enforceProjectCompany(req, res, req.params.projectId))) return;` at the top of the handler. |
| 47 | `GET /api/business-schedule/projects` | `routes.ts:34991` | read | projects and `business_schedule_projects` rows are correctly filtered by session companyId, but the milestone resolution at routes.ts:35055–35065 selects `schedule_items` by id with **no company filter** — `WHERE id IN (…)` only. Any miles… | join `schedule_items → schedules → projects` and add `eq(projects.companyId, companyId)` to the milestone query (same join the sibling route at 35189… |
| 48 | `POST /api/xero/webhook` | `routes.ts:36252` | write | the webhook is properly HMAC-authenticated and the supplier-bill branches scope by `resolvedConnection.companyId` via `getBillByXeroId(id, companyId)`. Branch B (client invoices, routes.ts:36406) uses `storage.getClientInvoiceByXeroId(xero… | add a `companyId` parameter to `getClientInvoiceByXeroId` (join `client_invoices → projects.company_id`) and pass `resolvedConnection.companyId`, mir… |

### DEAD CODE (reclassified — see §6) — 2

| # | endpoint | file:line | op | the gap | suggested fix |
|---|---|---|---|---|---|
| 1 | `GET /api/defects` | `routes.ts:32146` | read | **UNREACHABLE — shadowed by `routes.ts:3242`, which scopes correctly. Not exploitable; delete the dead block.** Had it been live: `storage.getDefects(projectId?, status?)` (storage.ts:21446) builds its WHERE from the optional query params only. With **no** parameters it returns every defect row in the database, across every company. With a `projectId` it returns anot… | make `companyId` a required first argument to `storage.getDefects` and join `defects → projects.companyId`, mirroring the fail-closed change made to… |
| 2 | `POST /api/defects` | `routes.ts:32169` | write | **UNREACHABLE — shadowed by `routes.ts:3277`. Note the *live* POST at 3277 has the same gap and IS listed above as a real finding.** Had it been live: `insertDefectSchema` carries `projectId` from the body and `storage.createDefect` inserts it verbatim. No `enforceProjectCompany`, and the route has no role middleware either. | `enforceProjectCompany(req, res, validationResult.data.projectId)` before `storage.createDefect` — the sibling GET/PATCH/DELETE already use `getOwned… |
---

## 5. Systemic patterns

The 248 findings are not 248 independent mistakes. They are roughly six repeating shapes. Fixing the
shapes is worth far more than fixing the instances.

### 5.1 Four tables have no tenancy column at all — a structural hole, not a route bug

Of 191 tables in `shared/schema.ts`, 98 carry `companyId` directly and 85 more can reach one through
FKs. **Eight can reach one by no path whatsoever**, and four of those are live tenant configuration:

| table | consequence |
|---|---|
| `field_categories` | shared task/project/note status & stage catalogue |
| `field_options` | shared status/stage/priority values, names, colours |
| `custom_field_defs` | shared custom-field definitions (`key` is globally `.unique()`) |
| `custom_field_options` | shared custom-field option values |

(The other four — `companies`, `permissions`, `system_configuration`, `referral_credits` — are either
the tenant table itself, a legitimately global catalogue, or carry tenancy under a different column
name. `system_configuration` is nonetheless writable by any tenant's admin: see the findings table.)

**No route guard can fix this**, because there is nothing to compare against. Every one of the ~15
field-settings routes reads and writes one globally shared config table: `POST
/api/field-categories/:id/options/batch` and `.../options/quick-add` are the sharp ends. Any
authenticated user renaming a project stage renames it for **every** company on the platform.

This needs a migration: add `company_id`, backfill, drop the global `key` uniqueness in favour of
`(company_id, key)`, then scope the routes. **A note on sequencing:** a fix for this exists on the
`feat/allowances` branch as migration `0037`, but `main` has since taken `0037` for
`0037_checklist_due_date.sql`. That branch will need renumbering before it lands.

### 5.2 Mass assignment via `.partial()` Zod schemas — the single largest class

The dominant shape, ~90 of the findings. A route correctly guards the record named in the path, then
passes a `.partial()`-validated body straight into `storage.updateX(id, data)`, which does a bare
`.set(data).where(eq(id))`. Because the insert schemas omit `companyId` but **not** `projectId` (or
`estimateId`, `purchaseOrderId`, `invoiceId`, `proposalId`, `instanceId`, `channelId`), the caller can
re-parent their own row onto another tenant's parent — and several handlers then act on the new parent.

The sharpest instances: `PATCH /api/invoice-variations/:id` then recomputes the *foreign* variation's
paid amount; `PATCH /api/checklist-instance-items/:id` then auto-completes the *foreign* checklist; and
`PATCH /api/scope-stages/:id` — **a residual on PR #35** — accepts a body `projectId`, which
`updateScopeStage` writes, after which the `isCompleted` cascade calls
`bulkUpdateScopeItemsInStage(updatedStage.projectId, …)` (`storage.ts:12844`, no companyId predicate)
and bulk-writes across the victim's scope items. The #35 guard checks the stage, which the attacker
legitimately owns; it does not check where they are moving it to.

`PATCH /api/business-dashboard-views/:id` already implements the correct pattern — an explicit
allowed-fields whitelist. That is the shape to propagate.

### 5.3 Role gates mistaken for tenant gates

`requireAuth`, `requireAdmin`, `requireTeamMember` and `requirePermission(...)` authenticate and
authorise **but do not scope**. A large group of findings is a route carrying an impressive-looking
`requirePermission("admin.users", "add")` and no company comparison at all. `POST /api/invitations`
(`routes.ts:12989`) is the worst: `companyId` is read straight from the request body, so an admin in
company A can mint a real invitation into company B and, controlling the invited address, accept it.
The entire `user_project_access` / `role_permissions` layer has no tenancy at all — neither table
carries `companyId` and no storage helper filters on one.

### 5.4 Unscoped collection reads in the storage layer

201 `DbStorage` methods touch a `companyId`-bearing table with no `companyId` predicate. Most are
by-primary-key lookups the route layer is *supposed* to guard, which is the current architecture. But
**17 are collection queries** with neither a companyId predicate nor a by-id `WHERE` — these return
other tenants' rows regardless of what the route does. The live ones behind routes:
`getSiteDiaryTemplates()` (every tenant's templates, no id needed), `getMinutes()`, `getUsers()`,
`getUserInvitations()`, `getProjects()`, `getTakeoffPlanPages()`, `getTaskActivity()`,
`getChecklistAuditLog()`, `getProposalPaymentMilestones()`, `getVariationBills()`.

`getDueReminders` / `getActiveBusinessRemindersForTime` / `getAllCompanySettings` are also unscoped but
are **correct by design** — they are cross-tenant sweeps for background jobs that then fan out on each
row's own `companyId`, the same pattern #33 established for the bill inbox.

### 5.5 A Drizzle footgun that silently deletes the tenancy predicate

Chaining `.where()` twice on a Drizzle query **replaces** the first predicate rather than ANDing it.
Five functions build a company-scoped query and then conditionally add a second `.where()`, so passing
the optional filter drops tenancy entirely:

| function | trigger |
|---|---|
| `getTaskTemplates` (`storage.ts:21794`) | `?isActive=true` |
| `getSystemDocuments` (`storage.ts:21690`) | optional filter |
| `getSystemFolders` (`storage.ts:21592`) | optional filter |
| `getWorkflowTemplates` (`storage.ts:22586`) | optional filter |
| `getTaskViews` (`storage.ts:10070`) | optional filter |

`GET /api/systems/task-templates?isActive=true` therefore returns every tenant's templates with no id
required. Three of these came from the per-route pass; **`getSystemFolders` and `getTaskViews` were
found only by the pattern scan** — the per-route reading missed them. Five more functions
(`getDefects`, `getEstimates`, `getMessages`, `getMinutes`, `getVariations`) use the same chaining but
their first `.where()` is not the tenancy predicate, so they are not leaks by this mechanism.

### 5.6 OAuth state carrying an unverified companyId

#34 fixed this for Google Calendar by signing the state. **Xero was missed.**
`GET /api/xero/callback` (`routes.ts:35250`) base64-decodes an unsigned `state`, reads `companyId` from
it, and prefers it over the session (`companyId = stateData.companyId || user?.companyId`), then writes
the resulting Xero tokens against that company. A crafted state overwrites another tenant's Xero
connection. `signOAuthState` / `verifyOAuthState` already exist in `server/utils/signedGrant.ts`.

---

## 6. Corrections to the per-route pass

Recorded because an audit that hides its own errors is not worth much.

**Six routes are shadowed dead code.** Express serves the first matching registration; these never run:

| route | live | shadowed (dead) |
|---|---|---|
| `GET /api/defects` | `routes.ts:3242` | `routes.ts:32146` |
| `GET /api/defects/:id` | `routes.ts:3267` | `routes.ts:32159` |
| `POST /api/defects` | `routes.ts:3277` | `routes.ts:32169` |
| `PATCH /api/defects/:id` | `routes.ts:3294` | `routes.ts:32186` |
| `DELETE /api/defects/:id` | `routes.ts:3317` | `routes.ts:32208` |
| `GET /api/xero/accounts` | `routes.ts:35375` | `routes.ts:37254` |

The batch covering line 32146 reported `GET /api/defects` as CRITICAL — "returns every defect row in
the database". The **unreachable** copy does. The live handler at `routes.ts:3242` scopes correctly
(`enforceProjectCompany` when a projectId is supplied, otherwise a company-projects filter). Both
defects findings are reclassified to dead code in the table above. The dead block should still be
deleted — it is a live leak the moment someone reorders registrations.

**One route is safe only by accident.** `GET /api/projects/:projectId/cost-codes`
(`routes.ts:7195`) calls `storage.getCostCodes()` with **no argument** against a signature of
`getCostCodes(companyId: string)`. The predicate becomes `company_id = NULL`, so it returns `[]` — the
endpoint is broken rather than leaking. It is one signature-fix away from becoming a leak, and it is
worth logging as a functional bug in its own right.

**Convention drift.** ~20 routes return **403** on a tenant mismatch where the established convention
is **404** (v1 set this deliberately, so existence is never confirmed). Individually LOW; collectively
it is an oracle that confirms which ids exist in other tenants.

---

## 7. Non-route surfaces

Audited, outside the 1,136 count:

| surface | verdict |
|---|---|
| `server/socketManager.ts` | **SAFE.** `socket.data.companyId` comes from the authenticated user; `getChannel(channelId, companyId)` is checked before a room join; presence broadcasts go to `company:<id>` rooms. |
| `reminderProcessor`, `xeroPushWorker`, `xeroReconcileScheduler`, trial/onboarding/referral sweeps | **SAFE by design.** Cross-tenant sweeps that fan out on each row's own `companyId`. |
| `gmailBillPoller` | **SAFE** — this is what #33 fixed. |
| `POST /api/webhooks/email-invoice` (`routes.ts:23052`) | **CRITICAL, still open.** Picks `users.find(u => u.username === "admin") || users[0]` across **all** companies and creates bills in whatever company that user belongs to. #33 fixed the *poller*, not this webhook. It is behind `requireAuth`, so it needs an authenticated caller — but any tenant's user triggers writes into one fixed foreign tenant. It is also why this feature only ever works for one company. |

---

## 8. The honest read: is per-route enforcement plus a test harness enough?

**No. Not on its own.** The evidence in this audit is not "a few routes were missed" — it is that the
model itself does not hold at this scale.

Three things argue against per-route-plus-tests as the terminal answer:

1. **The base rate.** 248 of 1,136 routes (21.8%) fail, *after* three dedicated security PRs and two
   prior audits. This is not a tail. A model that needs ~1,100 correct, manual, individually-authored
   decisions — where a single omission is a silent breach — will keep producing failures at roughly the
   rate developers add routes.
2. **Guards live at the wrong layer.** Ownership is enforced in ~24 closures inside a 38,769-line
   `registerRoutes`, while `storage.ts` will happily `SELECT … WHERE id = $1` across tenants for
   anyone who asks — 201 methods do exactly that. There is **no defence in depth**: one forgotten line
   in a route is a complete breach, because nothing beneath it will object. §5.5 is the proof — five
   functions lose their tenancy predicate to a *library ergonomics quirk*, and no layer notices.
3. **Whole classes are invisible to per-route review.** §5.1 (no tenancy column) and §5.5 (predicate
   replacement) were both found by pattern scans, not by reading routes. A reviewer looking at
   `PATCH /api/field-options/:id` sees a plausible handler; the bug is that the table has no
   `company_id`. Tests written per-route inherit the same blind spot — you cannot write the assertion
   you did not think of.

**What I would actually do**, in order:

- **Now, before the external company lands:** fix the 40 CRITICALs and the structural items — §5.1
  (migration), §5.6 (Xero state), the email-invoice webhook, and the five §5.5 functions. These are not
  optional; several are cross-tenant *writes*, and two hand over an account or an accounting
  connection.
- **Next, and this is the durable fix:** move enforcement **into the query layer**. Every tenant table
  gets a mandatory company predicate applied by construction — a scoped `db` handle bound to
  `req.user.companyId` (AsyncLocalStorage or an explicit per-request repository), or Postgres RLS with
  `SET LOCAL app.company_id`. RLS is the stronger of the two: it holds even for raw `pool.query` calls,
  of which this codebase has several. Either way the default flips from *open unless guarded* to
  *closed unless deliberately widened* — and the ~15 legitimate cross-tenant sweeps (§5.4) become an
  explicit, greppable, reviewable allowlist instead of being indistinguishable from bugs.
- **Then keep the per-route guards** as the second layer, and use the test harness for what it is
  genuinely good at: pinning the exceptions and preventing regressions on the routes you have already
  fixed. Tests are a ratchet, not a search strategy.

The realistic near-term compromise, if RLS is too large a change to make before onboarding: fix the
CRITICALs, add the `company_id` migration, and add a **CI guard** that fails the build when a new
`app.<verb>` handler in `routes.ts` contains no company/guard token — the same 200-route scan used in
§1.4, run as a lint with the current legitimate set as a baseline. That does not fix the architecture,
but it stops the base rate from growing while you change it.

One caveat on sequencing, since it cuts against the instinct to fix everything first: **§5.1 needs a
migration on production**, and this repo already has prod-pending migrations. Ordering that against the
onboarding date is a judgement call I have not made here.

---

## 9. Provenance

- Enumeration, reconciliation and the §5.1 / §5.4 / §5.5 / §6 pattern scans were produced by scripted
  analysis over `shared/schema.ts`, `server/storage.ts` and `server/routes.ts`; the scripts are
  deterministic and were re-run against the committed tree.
- Per-route classification was produced by 12 parallel passes over disjoint line ranges, each required
  to emit one ledger row per route; the row count was verified against the enumeration
  (1,136 = 1,136).
- Ten claims were re-verified by hand against the source before being written up here, chosen for
  severity or for contradicting a prior fix: the site-diary template family, `POST /api/invitations`,
  the budget subsystem, `GET /api/defects` (which produced the §6 correction), `POST
  /api/webhooks/email-invoice`, the Xero OAuth state, the field-settings schema, the scope-stage
  re-parent residual, `getCostCodes`, and the `getTaskTemplates` double-`.where()`.
