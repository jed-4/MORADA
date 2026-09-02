# Committed Cost — spec

Branch: `spec/committed-cost` (worktree `morada-committed/`, off `origin/main` @ 43bb1498)
Written: 2026-09-01. **Static read of schema/routes/storage/UI only.** The dev DB has
**zero rows in `purchase_orders`**, so nothing below is confirmed against live data —
every claim is a code citation. Flagged again in §10.

Follows from the "Awaiting PO" finding in PR #116 (`fix/money-bugs`), which fixed six
money bugs but deliberately left this one because it needs a product decision.

---

## 1. The problem

Two kinds of labour are costed by different routes:

- **Internal staff** — `timesheets.hourlyRate` is set, so `total = duration × hourlyRate`
  flows straight into actual cost.
- **Subcontractors** — `timesheets.hourlyRate` is `0` (schema default), so `total` is `$0`.
  The cost is meant to arrive later as a **bill** raised against a **PO**.

Between the subbie doing the work and their invoice landing, that cost exists **nowhere**:

| Source | Carries the cost? | Why not |
|---|---|---|
| Timesheet | ✗ | `hourlyRate` is 0 for subbies, so `total` is 0 |
| Purchase order | ✗ | POs feed **no** cost rollup (verified below) |
| Bill | ✗ | Doesn't exist yet |

Verified that POs are absent from every cost path:

- `GET /api/projects/:id/actual-costs` (`server/routes.ts:4951`) — bills + timesheets only
- `DatabaseStorage.calculateBudget` (`server/storage.ts:20800+`) — zero references to POs
- `GET /api/projects/:projectId/cash-flow` (`server/routes.ts:42560`) — does not even query
  `purchase_orders`. Its `committedNotPaid` bucket is fed **only from bills** in
  `awaiting_payment` / `awaiting_approval` / `needs_review` (`routes.ts:42704`).

**Effect:** committed cost is understated mid-job. Actual Costs, Gross Profit, budget
remaining, cost-to-complete and the cash-flow forecast all read better than reality, then
correct with a jolt when the bill lands. It is a **timing** problem, not leakage — the money
is counted correctly once billed.

---

## 2. What "Committed" means

> **Committed** = money we have promised to spend but have not yet incurred.

The standard construction shape, and what this spec builds toward:

```
Budget  →  Committed  →  Actual  →  Forecast
```

**Committed is NOT folded into Actual Costs.** Actual Costs feeds gross profit; mixing money
*incurred* with money *promised* makes margin read wrong. Budget warnings use
`actual + committed`; profit uses `actual` alone. (Decision confirmed with Jed 2026-09-01.)

---

## 3. Scope decision — labour only, or all POs?  ⚠️ DECIDE FIRST

The trigger was subbie labour, but a line labelled "Committed" that silently ignores a
$40k material PO is its own trust bug — the same class of defect PR #116 just fixed.

**Recommendation: count ALL open POs, materials included.** The mechanism is identical;
restricting it to labour is extra filtering code for a worse number. Subbie timesheets
*awaiting* a PO are then an **additional** labour-only source (§4c), not the whole feature.

There is also no clean "sub PO" flag to filter on even if we wanted one:

- `purchaseOrderTypeEnum` is `["main", "site"]` (`schema.ts:5849`) — no labour type
- Timesheet-generated POs are created as `poType: "main"` (`routes.ts:22704`)
- They do **not** set `supplierUserId` — supplier is a contact or a cached name string
  (`routes.ts:22705-06`)
- The only reliable marker is that their line items carry
  `purchase_order_items.sourceTimesheetId` (`schema.ts:6007`)

Adding a `labour` PO type would need a migration **and** a backfill of existing POs. Not
required for this feature — don't.

---

## 4. Data sources

### (a) Open POs — the main source

Committed value of a PO = **PO value − what has already been billed against it**, floored
at zero.

`bills.matchedSitePOId` (`schema.ts:2088`) is the bill→PO link. The column name is legacy;
the schema comment states it "holds the linked PO of ANY type (main / site / supplier /
labour), not site-only."

`recomputePOStatusFromBills()` (`server/services/poStatusFromBills.ts`) **already** maintains
PO status from linked bills and is called on bill create/update/delete:

| PO status | Meaning | Committed? |
|---|---|---|
| `draft` | not issued | **No** — never auto-modified by the service |
| `pending_approval` | not issued | **No** |
| `sent`, `acknowledged`, `accepted` | issued, unbilled | **Yes** |
| `partially_received`, `completed` | issued, unbilled | **Yes** |
| `invoiced`, `partially_paid` | partly/fully billed | **Partial** — see §5b |
| `paid` | fully billed | **No** |
| `cancelled` | void | **No** — never auto-modified |

### (b) Bills — the offset

Sum of linked bills per PO, **excluding vendor credits** (`billType = 'credit'`), mirroring
the exclusion `poStatusFromBills.ts:51` already applies for exactly this reason.

### (c) Subbie timesheets awaiting a PO — labour only

`timesheets.poStatus` (`schema.ts:3642`) is the discriminator:
`null` for employees, `"awaiting_po" | "on_po" | "paid"` for subcontractors.

`awaiting_po` hours have no PO yet, so they must be valued from the rate:

- `timesheets.hourlyRate` is **0** for subbies — unusable
- `users.hourlyRate` is the subbie's profile rate, and is what PO generation already uses
  (`routes.ts:22626`: `profileRate = subUser?.hourlyRate`)

So: `committed = duration × users.hourlyRate`, ex GST (wages carry no GST).

**This is the state the original bug was about.** A PO-only implementation would still miss
it — which is why (c) is not optional.

### State machine

```
subbie timesheet approved
        │
        ├── poStatus = awaiting_po ──────────► COMMITTED  (hours × users.hourlyRate)
        │
        ├── poStatus = on_po, PO unbilled ───► COMMITTED  (PO line total, authoritative)
        │
        └── PO billed ──────────────────────► ACTUAL      (the bill carries it; drop the PO)
```

---

## 5. Computation rules

### (a) GST basis — ⚠️ the trap

Budget figures are **ex GST**, so committed must be too. But
**`purchase_orders.subtotal` means different things depending on `gstMode`** — the same
class of unit trap that caused bugs #2, #5 and #6 in PR #116.

From `CreatePOFromEstimateDialog.tsx:115-123`:

| `gstMode` | `subtotal` is | `gstAmount` | `total` |
|---|---|---|---|
| `exclusive` | **ex** GST | `subtotal × 0.1` | `subtotal + gst` |
| `inclusive` | **inc** GST | `subtotal / 11` | `subtotal` (same as subtotal!) |
| `gst_free` | ex GST | `0` | `subtotal` |

**At PO header level, one rule works for all three:**

```
poExGstCents = total - gstAmount
```

**At item level the rule differs by mode** (item totals are inc-GST only when the PO is
inclusive — `CreatePOFromEstimateDialog.tsx:155`):

| `gstMode` | item ex-GST |
|---|---|
| `inclusive` | `item.total - item.gstAmount` |
| `exclusive` | `item.total` |
| `gst_free` | `item.total` |

**Add `poLineExGstCents(total, gstAmount, gstMode)` to `shared/billTotals.ts`**, directly
mirroring the existing `billLineExGstCents(lineTotal, lineTax, taxMode)` at
`shared/billTotals.ts:71`. Do not hand-roll this at call sites — that is exactly how the
allowances ×100 bug happened.

### (b) Per-PO committed

```
committedExGst(po) = max(0, poExGst(po) - Σ billedExGst(linked bills, excluding credits))
```

**Not a binary drop.** A PO flips to `invoiced` on the *first* linked bill even if that bill
covers a fraction of it (`poStatusFromBills.ts:72`). Dropping the whole PO at that point
swings the number from over- to under-stated. Subtract the billed amount instead, and let
status only gate `draft` / `cancelled`.

The `max(0, …)` floor matters: an over-billed PO (bill exceeds PO) must not produce a
*negative* commitment that quietly offsets other POs.

### (c) Cost-code bucketing

`purchase_order_items.costCodeId` (`schema.ts:6001`) exists, so committed **can** be bucketed
per cost code for the Budget table — unlike variation costs, whose `costCode` is free text
(see PR #116 §5).

Items with no `costCodeId` fall to the `uncategorized` bucket, matching how
`recalculateBudgetLineItems` already handles uncoded bill lines (`storage.ts:21044`).

Bucketing needs the *billed* offset apportioned too. Simplest defensible rule: apportion a
PO's billed total across its items **pro rata by item ex-GST value**. Exact per-line matching
isn't possible — bills don't link to PO *items*, only to the PO.

---

## 6. Server

### New endpoint

```
GET /api/projects/:id/committed-costs
requireAuth + requirePermission("financial.budget_actuals", "view")
```

Mirrors `/api/projects/:id/actual-costs` (`routes.ts:4951`) in shape, permission and tenancy
guard. Response, all **ex-GST integer cents**:

```jsonc
{
  "projectId": "…",
  "poCommittedExGstCents":      0,  // open POs, net of billing
  "labourCommittedExGstCents":  0,  // awaiting_po subbie hours
  "committedExGstCents":        0,  // the total
  "byCostCode": [
    { "costCodeId": "…|null", "costCodeTitle": "…", "committedExGstCents": 0 }
  ],
  "poCount": 0,
  "awaitingPoTimesheetCount": 0
}
```

### Performance

`bills.matchedSitePOId` has **no index** (`schema.ts:2088`). The per-PO billed rollup filters
on it. Load all POs + all linked bills for the project in **two** queries and join in memory —
do not query per PO. Per my notes, Neon is ~400ms per round trip from AU; a loop over POs
would be visibly slow.

If it still drags, add `CREATE INDEX CONCURRENTLY bills_matched_site_po_idx ON bills(matched_site_po_id)`
— **that would be the only migration in this feature**, and it is optional. Measure first.

---

## 7. UI

Every figure below is **ex GST** and must say so — per the §6 convention landed in PR #116.

### (a) Budget page header — primary

Extend the existing stat row (`client/src/pages/Budget.tsx:1344`):

```
Revised Contract  |  Committed  |  Actual Costs  |  Gross Profit
      ex GST          ex GST         ex GST           ex GST
```

Gross Profit stays `Revised Contract − Actual Costs`. **Committed must not enter the margin
maths** — that is the whole point of a separate line.

### (b) Budget cost-code table

Add a `Committed` column between `Budgeted` and `Actual`. Remaining becomes
`budgeted − actual − committed`, which is the figure that actually answers "can I still
afford this cost code?".

### (c) CASH "Budget vs Actual" widget

`SegmentedBar` (`ProjectBudgetVsActualWidget.tsx:26`) already stacks bills (amber) + labour
(teal). Add a third **committed** segment in a hatched/outline treatment so it reads as
"not yet spent" rather than spend, sitting between the solid actual and the budget tick.
Reuse the existing coral-stripe pattern (line 58) for visual consistency.

### (d) Stale-commitment nudge

A PO sitting `sent` for 60+ days with no linked bill is usually a **matching failure**, not a
real commitment (§8). Surface it in `AlertsWidget` rather than letting it inflate Committed
forever.

---

## 8. Double-counting risks

| # | Risk | Consequence | Mitigation |
|---|---|---|---|
| 1 | **Unmatched bill** — subbie bill arrives via Xero/email intake and never gets linked to its PO | PO stays `sent`, so the PO **and** the bill both count → **overstated** | The headline risk. §7d nudge + rely on existing `poSuggestions.ts` ranking. Commitment accounting is only as good as PO↔bill matching. |
| 2 | Partial billing | Binary drop understates; no offset overstates | Subtract billed, don't drop (§5b) |
| 3 | Vendor credits | A credit pushes a PO toward `paid` on a document that *reduces* what's owed | Exclude `billType = 'credit'`, as `poStatusFromBills.ts:51` already does |
| 4 | Timesheet on a PO **and** counted as `awaiting_po` | Same hours twice | Sources are mutually exclusive by `poStatus` — but assert it in tests |
| 5 | PO deleted while timesheets point at it | Hours orphaned, silently lost | Already handled: PO/item deletion resets `poStatus` to `awaiting_po` (`routes.ts:21613`, `22030-44`) — so they fall back into source (c). Verify with a test. |
| 6 | Over-billed PO | Negative commitment offsets other POs | `max(0, …)` floor (§5b) |

---

## 9. Phasing

| Phase | Scope | Ships |
|---|---|---|
| **1** | `poLineExGstCents` helper + `shared/committedCost.ts` pure module + endpoint + tests | Nothing visible |
| **2** | Budget page header + cost-code column | The number becomes usable |
| **3** | CASH widget segment + stale-PO alert | Dashboard parity |

Phase 1 is independently mergeable and carries all the risk. Ship and review it alone.

### Test plan (phase 1)

Follow the `node:assert` + `tsx` pattern of `server/__tests__/money-metrics.test.ts`:

- All three `gstMode` values → correct ex-GST, header **and** item level
- PO part-billed → committed is the remainder, not 0 and not the full PO
- PO over-billed → committed is 0, never negative
- `draft` / `cancelled` POs → excluded
- Vendor credit linked → does not reduce committed
- `awaiting_po` timesheet → valued at `users.hourlyRate`, not `timesheets.hourlyRate` (0)
- Timesheet on a PO → counted once, via the PO only
- Cost-code apportionment sums back to the PO total

---

## 10. Open questions

1. **§3 scope — all POs, or labour only?** Recommendation: all POs. **Needs Jed's call
   before phase 1**, as it changes the endpoint's contract.
2. Should `completed` / `partially_received` POs count as committed? They are goods received
   but unbilled — arguably *accrued* rather than committed. Recommendation: count them, and
   revisit if it proves confusing.
3. Should Committed appear on the client-facing portal? Recommendation: **no** — it is a
   builder-side cost concept and would confuse a client reading their own job.

## Verification gap

The dev DB has **zero POs** and no `awaiting_po` timesheets, so none of this is reproduced
against data. Before phase 2 ships, spot-check a live project with active subbies to size the
distortion — if it is trivially small on real jobs, phases 2–3 may not be worth the UI cost.
