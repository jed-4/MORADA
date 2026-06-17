---
name: Budget actual-cost composition
description: What "actual cost" means in BuildPro's budget, and the trap that timesheet labour is excluded from the stored budget actuals.
---

The stored budget actuals are **bills-only** and do NOT include timesheet labour:
- per-cost-code `BudgetLineItem.actualAmount` = sum of bill line-item totals, EX-GST, credits subtracted.
- project `budget.actualAmount` = sum of bill header totals, INC-GST, no labour.

**Why it matters:** any "actual cost" / gross-margin / profit figure that should reflect
*total* cost incurred must ADD timesheet labour separately (`timesheets.total` =
duration × hourlyRate, dollars, no GST; exclude rejected). Bills alone understate cost.

**How to apply:** the project-level ex-GST actual cost (bills + labour, + future internal)
lives in its own dedicated endpoint, intentionally separate from `budget.actualAmount` so
existing "Spent" / business-metrics semantics are untouched. Don't fold labour into
`calculateBudget`/`recalculateBudgetLineItems` — that would silently change those other
consumers.

**Revenue side:** revised contract ex-GST (original contract + approved variations) comes
from the contract-metrics computation, which is now auth + company-scoped (it was previously
anonymous). Keep it at requireAuth + company scope, NOT the financial.budget_actuals
permission — many non-financial pages (project overview, variations, client invoices,
settings) consume it.
