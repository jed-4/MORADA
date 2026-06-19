---
name: Bill actuals must be ex-GST
description: BuildPro bill line totals are GST-inclusive for tax-inclusive bills; any "actual spend" rollup must strip GST per line to match the ex-GST budget.
---

The budget "Budgeted" column is ex-GST, but `bill_line_items.total` for a tax-inclusive bill (`bill.taxMode === "inclusive"` AND the line's tax type is `"GST on expenses"`) INCLUDES GST. Summing those totals raw inflates actuals ~10%.

**Rule:** every place that rolls bill spend into a budget/actual figure must convert with the shared helper `billLineExGstCents(lineTotal, lineTax, taxMode, taxRatePercent=10)` in `shared/billTotals.ts`. It divides by `1+rate` ONLY for inclusive + "GST on expenses" lines; exclusive / "No GST" / undefined mode pass through unchanged. Convert PER LINE — a single bill can mix GST and no-GST lines, so never strip GST off a bill *header* total.

**Why:** GST is a pass-through tax, not a cost. Comparing inc-GST actuals against an ex-GST budget made every tax-inclusive bill look ~10% over budget.

**How to apply:** the bill-spend rollups that must route through `billLineExGstCents` are `calculateBudget` + `recalculateBudgetLineItems` (server/storage.ts) and `/actual-costs` + `/budget-actuals` drill-down (server/routes.ts). Leave comparisons that are inc-GST on BOTH sides alone (e.g. project-profitability sums inc-GST bills vs inc-GST client invoices — consistent, so no change). The canonical inclusive→ex-GST math also lives in client BillDetail.
