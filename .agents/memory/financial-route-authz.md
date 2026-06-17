---
name: Financial route authorization
description: Financial API endpoints must enforce permission + company scope server-side; frontend page gating is not sufficient.
---

# Financial route authorization

Any endpoint that reads or mutates financial data must enforce authorization
on the server, not rely on the frontend hiding the UI.

**Rule:**
- Read endpoints that expose financial figures (e.g. budget actuals, KPI
  amounts) must carry the same `requirePermission(...)` as the page that gates
  them. Example: the budget-actuals drill-down endpoint needs
  `requirePermission("financial.budget_actuals", "view")`, matching the budget
  line-items route — otherwise any authenticated same-company caller can read it.
- Mutate-by-id endpoints whose id is a child record (e.g.
  `PATCH /api/bill-payments/:id/void`, `DELETE /api/bill-payments/:id`) carry no
  company context in the id alone. Resolve the chain (payment → bill →
  companyId) and return 403 when the bill's company differs from the caller's;
  404 when the record doesn't exist.

**Why:** A code review caught that these routes only had `requireAuth`, so a
user from one company could void/delete another company's bill payments and read
financial actuals by guessing a project id. Frontend gating (`canViewActuals`)
hid the buttons but did not protect the API.

**How to apply:** When adding any `/api/...` route touching money, mirror the
permission + company-scope checks already used by sibling financial routes
(see the GET/POST `/api/bills/:id/payments` handlers for the bill→company
pattern, and the budget line-items / KPI routes for `requirePermission`).
