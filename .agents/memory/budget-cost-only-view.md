---
name: Budget cost-only view
description: The Budget page is a pure cost view — per-cost-code budget excludes all markup; revenue side keeps it.
---

# Budget = cost, not revenue

The Budget page's per-cost-code **Budget** column and header baseline show
**cost only**: ex-GST, with NO per-line markup and NO global project markup.

- Per-line budgeted cost = `estimateItemBuilderCostExTax(item)` in
  `shared/pricing.ts` (qty*unitCost, or cached `priceIncTax - taxAmount` for
  fixed-price/qty=0 lines). This equals `computeEstimateSummary().builderCostTotal`
  exactly — it is the canonical cost figure.
- Do NOT use `(priceIncTax - taxAmount)` for the budget baseline: that still
  carries per-line markup (and global markup folds in via priceIncTax), which
  inflates the budget into a revenue figure.

**Why:** Builders want Budget vs Spent to be a true cost-vs-cost comparison so
the gross-margin headline (revenue − cost) is meaningful. Revenue stays on the
contract side: `computeContractMetrics`/`revisedContractPriceExGstCents` keep all
markup + approved variations. Never strip markup from the revenue side.

**How to apply:** Any new "budget" or "estimated cost" rollup must go through the
cost-only helper, not the priceIncTax path. The contract/revenue rollups are a
separate code path and must keep markup.

# Live recompute on approved-boundary changes

- Only `status === "approved"` variations count toward Revised (statuses are
  draft|action|pending|approved|rejected — there is no "released").
- Only `status === "approved"` timesheets count as actual labour cost (drafts/
  submitted/rejected excluded), in both `getProjectLabourCostBreakdown` and the
  `/api/projects/:id/actual-costs` route — keep these two in lockstep.
- Budget recompute (`recalcProjectBudget`) must fire on EVERY path that crosses
  the approved boundary: PATCH `/api/variations/:id` AND POST
  `/api/variations/bulk-status`. GET budget also recomputes live on read
  (calculateBudget + recalculateBudgetLineItems, best-effort persisted fallback),
  so the page is always live — there is no manual Recalculate dependency.

# One actual figure per screen

Header "Spent"/"Remaining" (Budget.tsx) use the full actual cost ex-GST
(bills + labour) from the live `/actual-costs` query, matching the cost table
Total and the gross-margin bar. Don't revert "Spent" to the bills-only persisted
`budget.actualAmount` — when labour > 0 that contradicts the rest of the screen.
