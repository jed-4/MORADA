---
name: Budget cost-code Actual column split
description: How the Budget page splits per-cost-code "Actual" into Labour/Bills/Internal/Total without double-counting.
---

The Budget page cost-code table shows actual spend as four columns: Labour, Bills, Internal, Total.

- **Bills** = the persisted `budgetLineItems.actualAmount` (bills-only). `recalculateBudgetLineItems` never folds labour/timesheets into `actualAmount`.
- **Labour** = a SEPARATE computed endpoint (`getProjectLabourCostBreakdown` / `GET /api/projects/:id/labour-costs`), NOT stored on the line item.
- **Internal** is a $0 placeholder for now.
- **Total** = Labour + Bills + Internal. Difference/Status compare Budgeted against Total.

**Why:** Bills and Labour come from different sources and must be summed in the UI only — folding labour into `actualAmount` would double-count against the gross-margin bar.

**How to apply:** Any future change to actual spend on this table must keep Bills = `actualAmount` and Labour from its own endpoint. The labour endpoint's grand total MUST reconcile with `actual-costs.timesheetCostCents` (the gross-margin bar). Timesheets store DOLLARS in `ts.total` (convert `Math.round(Number(ts.total)*100)`); split timesheets (`timesheetCostCodes`) distribute the header total proportionally with the remainder on the last split so the per-code sum equals the timesheet total. Rejected timesheets are excluded (matches the actual-costs labour definition).
