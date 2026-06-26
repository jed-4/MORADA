---
name: Cross-tenant isolation convention
description: How BuildPro enforces companyId isolation on by-ID API routes and the 404 masking rule
---
# Cross-tenant isolation convention

BuildPro is shared-schema multi-tenant; rows are isolated only by `companyId`.

**Rule:** a cross-tenant access OR a non-existent id on any by-ID route returns
**404** (never 403) so existence is never confirmed. 401-unauthenticated is
unchanged (global `/api` auth middleware).

**Why:** confirmed product decision — a 403 leaks that the record exists to an
unauthorized caller.

**How to apply:** by-ID storage getters are id-only (no company filter by
design); ownership is enforced in the route layer. Funnel every by-ID
GET/PATCH/DELETE through the `getOwned*` ownership helpers (and the root
`enforceProjectCompany`, project→company). The helper writes the 404 itself, so
the route just bails: `const owned = await getOwnedX(...); if(!owned) return;`.
Never trust a `companyId` from the request body — derive from `req.user`.

Two ownership shapes: direct `companyId` column (RFQ, supplier, defect, checklist
template, newer bills) vs. via project (estimate, selection, schedule, variation,
client invoice, proposal, older bills). Bills handle both, fail-closed to 404 if
neither.

**Nested sub-resources** whose path carries only the leaf id (variation items,
bill line item allowances, proposal sections/items/milestones) own no company
scope: resolve the parent FK by id (inline query) then delegate to the matching
`getOwned*`. The allowance chain is two hops (allowance → bill line item → bill).

**Tests:** the tenant-isolation workflow runs the harness under NODE_ENV=test.
Each resource gets a cross-tenant 404 pair, a same-company positive control
(2xx), and a survival assertion. A committed audit report at the repo root
enumerates the full by-ID inventory.

**Ownership before validation:** in POST/PATCH routes the `getOwnedX` check must
run BEFORE Zod body validation, or a cross-tenant attempt with an invalid body
leaks a 400 (existence signal) instead of the intended 404. Some by-ID *write*
routes were entirely unguarded (e.g. POST /api/tasks/:id/subtasks) even when the
sibling GET was guarded — audit every verb on a path, not just GET. Note some
such routes back a not-implemented DatabaseStorage stub (createSubtask 500s), so
a 2xx positive control is impossible; assert only the cross-tenant 404 pair there.

**Beware ad-hoc fail-open checks:** some routes (bill-payments void/delete) had
an inline `if (record.companyId !== req.user.companyId) 403` instead of a
`getOwned*` helper. That fails OPEN on legacy rows whose `companyId` is null
(comparison is false → passes), and returns 403 not 404. Always route via the
parent's `getOwned*` (payment → getOwnedBill(billId)) which has the
projectId→company fallback for legacy rows and does the 404 masking.
