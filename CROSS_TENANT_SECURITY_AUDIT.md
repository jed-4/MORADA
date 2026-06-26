---
title: Cross-Tenant Security Audit — Report (Task #357)
---
# Cross-Tenant Security Audit Report

This report enumerates every by-ID detail/mutate route and its backing storage
function audited for cross-tenant (companyId) isolation in BuildPro. The goal:
Company A cannot read or mutate Company B's data by guessing/knowing a record ID
(IDOR). Per the confirmed decision, a cross-tenant access (or a non-existent ID)
returns **404 Not Found** — never 403 — so existence is never confirmed to an
unauthorized caller. Unauthenticated requests still return **401** (handled by
the global `/api` auth middleware) — only the ownership-mismatch case is 404.

Status legend:
- **already-safe** — was already enforcing company scope before this audit.
- **fixed** — gap closed in this audit (now enforces 404 cross-tenant).
- **indirect-via-join** — owns no `companyId` column; ownership resolved through a
  parent (project / bill / variation / proposal) before any read or mutation.

## Ownership primitives (server/routes.ts)
All by-ID enforcement funnels through a small set of helpers (defined ~4404+):

- `enforceProjectCompany(req, res, projectId, notFound)` — the root check. Loads
  the project, compares `project.companyId` to `req.user.companyId`, returns 404
  on mismatch / missing. **Flipped from 403 → 404 in this audit.**
- `getOwnedBill` — bill carries a direct `companyId` on newer rows; older rows
  fall back to `projectId` → `enforceProjectCompany`. Handles both so neither
  legitimate access breaks nor isolation leaks.
- `getOwnedVariation`, `getOwnedEstimate`, `getOwnedEstimateItem`,
  `getOwnedEstimateGroup`, `getOwnedScheduleItem`, `getOwnedClientInvoice`,
  `getOwnedProposal` — resolve `projectId` → `enforceProjectCompany`.
- `getOwnedSupplier`, `getOwnedDefect`, `getOwnedRFQ`, `getOwnedDoc`,
  `getOwnedTask` — direct `companyId` compare.
- `getOwnedMinute` — `projectId` → `enforceProjectCompany`, else owner user's
  `companyId`.
- `getOwnedTimesheet` — owning user's `companyId`, else `projectId` →
  `enforceProjectCompany`.
- `getOwnedSiteDiaryEntry` — `projectId` → `enforceProjectCompany`.
- `assertOptionAccess` — view-preference / option access, 404 on mismatch.

The standard route pattern is:
`const owned = await getOwnedX(req, res, id); if (!owned) return;` (the helper
writes the 404 response itself, so the route just bails).

For deeply-nested sub-resources whose path carries only the leaf id (no
project/company), ownership is resolved inline: fetch the parent FK by id via a
dynamic-import db query, then delegate to the matching `getOwnedX` helper.

## Resources audited

### Estimates — indirect-via-join / already-safe (hardened earlier)
- `GET/PATCH/DELETE /api/estimates/:id` → `enforceProjectCompany` via project.
- Estimate items / groups → `getOwnedEstimateItem` / `getOwnedEstimateGroup`.

### Selections — indirect-via-join
- `GET/PATCH/DELETE /api/selections/:id` → `enforceProjectCompany`.

### Schedules — indirect-via-join
- `PATCH /api/schedules/:id`, `/working-days`, `PUT /status`, `PATCH /online`,
  `DELETE /api/schedules/:id` → `enforceProjectCompany`.
- Schedule items (`getOwnedScheduleItem`): item → schedule → project → company.

### Checklist templates — direct companyId (already-safe + scoping extended)
- `GET/PATCH/DELETE /api/checklist-templates/:id`, `/duplicate`, `/groups`,
  `/groups/reorder`, group `move-to` / `move-to-template`, items — all scoped by
  the template's `companyId`. Create/import/duplicate stamp the caller's company;
  export is company-filtered (verified by tests that A's data never leaks to B).

### Bills — fixed / indirect-via-join (full CRUD + sub-resources)
- `GET/PATCH/DELETE /api/bills/:id`, `/duplicate`, `/line-items` (GET+POST),
  `/payments`, `/line-item-allowances`, approvals — all via `getOwnedBill`.
- `POST /api/bills/:id/approve` & `/reject` — call `getOwnedBill` after the
  `canApprove`/`canReject` permission gate (**fixed this session**).
- `POST /api/bills/:id/ocr-from-attachment` & `/confirm-extraction` — converted
  from a legacy 403 block to `getOwnedBill` 404 (**fixed this session**).
- `POST /api/bill-line-items/:id/link-price-item` — inline lookup of the line
  item's `billId`, then `getOwnedBill` (**fixed this session**).
- `PATCH/DELETE /api/bill-line-item-allowances/:id` — inline join
  allowance → billLineItem → `billId`, then `getOwnedBill` (**fixed this session**).

### Variations — indirect-via-join / fixed
- `GET/PATCH/DELETE /api/variations/:id`, `/items` (GET) → `getOwnedVariation`.
- `PATCH/DELETE /api/variation-items/:id` — inline lookup of the item's
  `variationId`, then `getOwnedVariation` (**fixed this session**).

### Client invoices — indirect-via-join
- `GET/PATCH/DELETE /api/client-invoices/:id`, `/items` → `getOwnedClientInvoice`.

### Proposals — indirect-via-join / fixed
- `GET/PATCH/DELETE /api/proposals/:id`, `/sections` (GET) → `getOwnedProposal`.
- `PATCH/DELETE /api/proposal-sections/:id` — inline lookup of `proposalId`, then
  `getOwnedProposal` (**fixed this session**).
- `PATCH/DELETE /api/proposal-items/:id` — inline lookup of `proposalId`, then
  `getOwnedProposal` (**fixed this session**).
- `PATCH/DELETE /api/proposal-milestones/:id` — inline lookup of `proposalId`,
  then `getOwnedProposal` (**fixed this session**).

### RFQs — direct companyId
- `GET /api/rfqs/:id/items`, `/follow-ups` → `getOwnedRFQ` (direct `companyId`).

### RFIs — direct companyId / fixed this session
- `GET/PATCH/DELETE /api/rfis/:id`, `GET /api/rfis/:rfiId/comments` previously
  returned **403** on a tenant mismatch; converted to `getOwnedRFI` (direct
  `companyId`, mirrors `getOwnedRFQ`) which masks cross-tenant and non-existent
  ids as **404** (**fixed this session**).
- `POST /api/rfi-comments` resolves the parent RFI from `body.rfiId` (not the
  URL). Ownership is enforced via `getOwnedRFI` **before** body validation so a
  cross-tenant / non-existent `rfiId` returns **404**, not a `400` validation
  leak.

### Bill payments — payment → bill → company / fixed this session
- `PATCH /api/bill-payments/:id/void`, `DELETE /api/bill-payments/:id`
  previously used an ad-hoc `403` check that **failed open** on legacy bills with
  no `companyId`. Rewritten to resolve `payment → getOwnedBill(billId)`, which
  handles the legacy `projectId → company` fallback and masks cross-tenant /
  non-existent ids as **404** (**fixed this session**).

### Suppliers — direct companyId (hardened earlier)
- `GET/PATCH/DELETE /api/suppliers/:id` → `getOwnedSupplier` (direct `companyId`).

### Defects — indirect-via-join (hardened earlier)
- `GET/PATCH/DELETE /api/defects/:id` → `getOwnedDefect` (item → project →
  company). Note the path is registered twice (≈L2113 and ≈L26944); Express
  serves the first registration and both call `getOwnedDefect`.

### Minutes — indirect-via-join / direct fallback (hardened earlier)
- `GET/PATCH/DELETE /api/minutes/:id`, `POST /api/minutes/:id/summarize` →
  `getOwnedMinute` (project → company, else owner user's `companyId`).
- `POST /api/minutes/:id/transcribe` is a multipart upload route guarded by the
  same `getOwnedMinute` helper; not exercised in tests (file upload) but uses the
  identical 404 masking.

### Docs — direct companyId (hardened earlier)
- `GET/PATCH/DELETE /api/docs/:id` → `getOwnedDoc` (direct `companyId`).

### Tasks — direct companyId / fixed this session
- `GET /api/tasks/:id`, `GET /api/tasks/:id/subtasks` → `getOwnedTask`.
- `POST /api/tasks/:id/subtasks` — was completely unguarded (cross-tenant write
  IDOR). Now calls `getOwnedTask` **before** body validation, so cross-tenant /
  non-existent ids mask as **404** (**fixed this session**). Note: the backing
  `DatabaseStorage.createSubtask` is currently a not-implemented stub (a
  legitimate owner request 500s), but the ownership guard runs first, so the
  isolation boundary holds regardless. No positive 2xx control is asserted for
  this route because the feature itself is unimplemented.
- `PATCH /api/tasks/:id` — previously returned **403** on a company mismatch;
  switched to `getOwnedTask` so cross-tenant now masks as **404** (**fixed this
  session**, per the 404 decision).
- `PATCH /api/tasks/:id/status` — previously called `storage.getTask(id, companyId)`
  (the storage getter ignores the 2nd arg) then `updateTaskStatus` with no
  ownership check → IDOR. Now gated by `getOwnedTask` (**fixed this session**).
- `DELETE /api/tasks/:id` — previously called `storage.deleteTask(id)` with no
  company scoping (the `requirePermission` gate is bypassed for admin roles, so a
  legitimately-permissioned user could delete another company's task) → IDOR.
  Now gated by `getOwnedTask` before deletion (**fixed this session**).

### Site diary entries — indirect-via-join (hardened earlier)
- `GET/PATCH/DELETE /api/site-diary-entries/:id` → `getOwnedSiteDiaryEntry`
  (entry → project → company).

### Timesheets — indirect-via-join / direct fallback (hardened earlier)
- `GET/PATCH/DELETE /api/timesheets/:id` → `getOwnedTimesheet` (owning user's
  `companyId`, else project → company).
- `POST /api/timesheets/:id/approve` & `/reject` also call `getOwnedTimesheet`
  after a `canUserApproveTimesheets` permission gate (not 404-tested because the
  permission gate can fire first; the by-id ownership is covered via GET/PATCH/DELETE).

### View-preference options — direct companyId
- `assertOptionAccess` — direct compare, 404 on mismatch.

## Edge cases & notes
- **Bills with no companyId AND no projectId**: `getOwnedBill` returns 404 (cannot
  prove ownership → deny). This is intentional fail-closed behaviour.
- **Mixed bill ownership** (`backfillBillsCompanyId`): newer bills use a direct
  `companyId`, older ones fall back to `projectId`. `getOwnedBill` handles both,
  so neither legitimate access breaks nor isolation leaks.
- **Client body companyId is never trusted**: company is always derived from
  `req.user.companyId`; create/duplicate/import endpoints stamp the caller's
  company server-side.
- **Sub-resource inline lookups** use the same dynamic-import db pattern already
  established by `link-price-item`; they select only the parent FK, then delegate
  to the existing `getOwnedX` helper so the 404 masking stays uniform.
- **No schema migrations were required** — every audited resource has a path to a
  company (own column or via project/parent). No table needed a denormalized
  `companyId` added.

## Storage-layer audit (server/storage.ts)

The by-ID storage getters are **id-only and intentionally do NOT filter by
companyId** — they are pure data accessors. Ownership is enforced one layer up,
in the route helpers, which is the established convention in this codebase. Every
by-ID storage function below was audited and confirmed to be reached *only*
through a company-scoping helper or inline ownership check (no route reads/mutates
it by raw id without a guard):

| Storage fn (id-only) | Enforced by (route layer) | Ownership shape |
|---|---|---|
| `getBillById` | `getOwnedBill` | direct companyId, else project |
| `getVariation` | `getOwnedVariation` | via project |
| `getEstimate` / `getEstimateItem` / `getEstimateGroup` | `getOwnedEstimate*` | via project |
| `getScheduleById` / `getScheduleItem` | `getOwnedScheduleItem` / `enforceProjectCompany` | via project |
| `getClientInvoice` | `getOwnedClientInvoice` | via project |
| `getProposal` | `getOwnedProposal` | via project |
| `getRFQ` | `getOwnedRFQ` | direct companyId |
| `getRFI` | `getOwnedRFI` (GET/PATCH/DELETE `:id`, GET `:rfiId/comments`, POST `/api/rfi-comments` via `body.rfiId`) | direct companyId |
| `getBillPaymentById` | resolve payment → `billId` → `getOwnedBill` (void / DELETE) | via parent bill |
| `getSupplierById` | `getOwnedSupplier` | direct companyId |
| `getDefectById` | `getOwnedDefect` | via project |
| `getDoc` | `getOwnedDoc` | direct companyId |
| `getMinute` | `getOwnedMinute` | via project, else owner user |
| `getTask` (+`updateTaskStatus` / `deleteTask`) | `getOwnedTask` (GET/PATCH/`:id/status`/DELETE) | direct companyId |
| `getTimesheet` | `getOwnedTimesheet` | owner user, else via project |
| `getSiteDiaryEntry` | `getOwnedSiteDiaryEntry` | via project |
| `getProject` | `enforceProjectCompany` (GET/PATCH/DELETE `/api/projects/:id`) | direct companyId |
| `getChecklistTemplate` (+groups/items) | template.companyId compare in route | direct companyId |
| `updateBillLineItem` / `deleteBillLineItem` | resolve line item by id → its `billId` → `getOwnedBill` (NOT the URL `:billId`) | via parent |
| `updateVariationItem` / `deleteVariationItem` | inline `variationId` lookup → `getOwnedVariation` | via parent |
| `updateBillLineItemAllowance` / `deleteBillLineItemAllowance` | inline join → `billId` → `getOwnedBill` | via parent |
| `updateProposalSection` / `deleteProposalSection` | inline `proposalId` lookup → `getOwnedProposal` | via parent |
| `updateProposalItem` / `deleteProposalItem` | inline `proposalId` lookup → `getOwnedProposal` | via parent |
| `updateProposalPaymentMilestone` / `deleteProposalPaymentMilestone` | inline `proposalId` lookup → `getOwnedProposal` | via parent |

**Design decision:** enforcement lives in the route layer (mandatory helper call)
rather than inside storage. This was kept consistent with the existing pattern to
avoid a large, risky storage refactor in a security task. The residual risk — a
*future* route forgetting to call a helper — is tracked as follow-up #359
("Make data isolation safe by default at the storage layer"), which proposes
pushing the companyId filter into the storage functions themselves.

## Out of scope (per spec)
- List endpoints that already filter by `companyId` in their query (spot-checked,
  not exhaustively re-verified).
- The auth/session mechanism and the 401-unauthenticated behaviour.
- Frontend permission gating (isolation is enforced server-side regardless).

## Verification
`server/__tests__/tenant-isolation.test.ts` (run by the `tenant-isolation`
workflow) was extended to cover every audited family, including the newly-secured
nested sub-resources (variation items, bill line item allowances, proposal
sections / items / milestones), RFIs (+ comments, including the body-resolved
`POST /api/rfi-comments`), bill payments (void / delete via parent bill), and
the prior-session by-id families (suppliers, defects, minutes, docs, tasks +
subtasks, site-diary entries, timesheets, schedule items). Each gets:
1. a cross-tenant attempt by company B against company A's record → asserts 404,
2. a non-existent id → asserts 404,
plus positive controls (A reaches its own data), a 401 unauthenticated control,
and survival assertions proving B's attempts never mutated/deleted A's records
(including A's prior-session by-id records).

**Result: 245 passed, 0 failed.**
