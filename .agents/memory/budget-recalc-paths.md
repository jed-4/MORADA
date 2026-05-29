---
name: Budget recalc must hook every bill mutation path
description: Why project budget actuals go stale, and the full set of code paths that create/change bills + line items in BuildPro.
---

# Project budget actuals do not auto-update unless every bill-mutation path triggers recalc

To refresh a project's budget you must call BOTH `storage.calculateBudget(projectId)` (returns the budget row) THEN `storage.recalculateBudgetLineItems(budget.id)` (rebuilds per-cost-code lines, grouping bill_line_items by costCodeId; null → "uncategorized" bucket). Calling only one leaves stale data.

**Why:** the Budget page used to only recalc when the user pressed a manual button, so imported/edited bills showed $0 actuals. There is no DB trigger — recalc is application-level only.

**How to apply:** wrap recalc in try/catch (best-effort, never fatal to the mutation) and hook it into ALL bill / bill-line-item mutation paths. These are easy to miss because several bypass the CRUD routes:
- REST CRUD: `POST/PATCH/DELETE /api/bills`, `POST/PATCH/DELETE /api/bills/:billId/line-items` (line-item routes only know billId → resolve project via `storage.getBillById`). PATCH bill may reassign project → recalc both old and new.
- `POST /api/bills/:id/duplicate` (creates bill + copies line items).
- Xero import `POST /api/xero/bills/import` — recalc once per affected project at the END (collect a Set during the loop; do not recalc per-bill).
- `syncBillFromXeroInternal()` — pulls Xero totals/line items.
- `AutoBillCreatorService.processEmailInvoices()` (server/services/autoBillCreator.ts) — the single entry used by the email webhook route, the manual poll route, AND the background Gmail bill poller. Put recalc here (in the service) so all three callers are covered, not in each route.

Bill amounts are stored in CENTS throughout.
