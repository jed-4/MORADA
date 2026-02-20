# Budget Tracking - User Stories

## Epic Overview
Budget Tracking provides project-level financial oversight by aggregating data from estimates, variations, and bills into a consolidated budget view. Each project has one budget that tracks baseline amounts (from estimates), revised amounts (after variations), actual costs (from bills), forecast amounts, and variance analysis. A cost code breakdown shows budget vs actual at the line item level. Labour hours budgeting provides separate tracking of time-based resources.

## Business Value
For Australian residential builders, maintaining tight control over project budgets is essential for profitability. Construction projects frequently experience cost overruns from unexpected site conditions, material price fluctuations, and scope changes. The budget module provides real-time visibility into where money is being spent compared to what was estimated, allowing builders to identify cost overruns early and take corrective action. Labour hours tracking ensures adequate staffing without excessive overtime costs. Variance analysis by cost code helps builders improve future estimating accuracy.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Monitor project financial health, identify cost issues |
| Admin | Office Administrator | Track costs and ensure profitability |
| Estimator | Cost Estimator | Compare estimates to actuals for future accuracy |

## User Stories

### US-BU001: View Budget Overview
**As a** Builder/PM, **I want to** view the budget overview for a project, **so that** I can understand the project's financial health at a glance.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display four summary cards: Total Budget, Actual Spent, Remaining, and Forecast
- [ ] Show baseline amount (original estimate) and revised amount (after variations)
- [ ] Calculate and display percentage spent
- [ ] Show variance amount with colour coding (green for under budget, red for over budget)
- [ ] Display project phase badge

---

### US-BU002: Auto-Create Budget on First Access
**As a** Builder/PM, **I want to** have a budget automatically created when I first access the budget page, **so that** I do not need to manually set up the budget.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] GET /api/projects/:projectId/budget auto-creates if none exists
- [ ] One budget per project (unique projectId constraint)
- [ ] Initial amounts set to 0 until recalculated
- [ ] Budget status defaults to "active"

---

### US-BU003: Recalculate Budget from Source Data
**As a** Builder/PM, **I want to** recalculate the budget from latest estimates, variations, and bills, **so that** the budget reflects current project data.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Recalculate button in toolbar triggers POST /api/projects/:projectId/budget/calculate
- [ ] Update baselineAmount from project estimates
- [ ] Update revisedAmount incorporating approved variations
- [ ] Update actualAmount from approved bills
- [ ] Calculate forecastAmount and varianceAmount
- [ ] Show loading spinner during recalculation
- [ ] Display success toast on completion

---

### US-BU004: View Cost Code Breakdown
**As a** Builder/PM, **I want to** see budget vs actual costs broken down by cost code, **so that** I can identify which areas are over or under budget.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Table with columns: Cost Code, Budgeted, Actual, Variation, Forecast, Variance, Status
- [ ] Show cost code title and category
- [ ] Colour-coded variance amounts (green under budget, red over budget)
- [ ] Status badge per line item (Under, Over, On Track)
- [ ] Show count of cost codes in toolbar

---

### US-BU005: Recalculate Budget Line Items
**As a** Builder/PM, **I want to** recalculate the cost code breakdown, **so that** it reflects the latest data from estimates and bills.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Recalculate line items via POST /api/budgets/:budgetId/line-items/recalculate
- [ ] Update budgetedAmount, actualAmount, variationAmount, forecastAmount, and variance per cost code
- [ ] Calculate profitAmount per line item
- [ ] Cascade recalculation trigger from budget recalculate button

---

### US-BU006: Edit Budget Line Items
**As a** Builder/PM, **I want to** manually adjust budget line item amounts, **so that** I can override calculated values when needed.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit individual line item via PATCH /api/budget-line-items/:id
- [ ] Allow manual override of forecast amounts
- [ ] Recalculate variance on save

---

### US-BU007: View Budget Summary in Toolbar
**As a** Builder/PM, **I want to** see key budget metrics in the toolbar, **so that** I can monitor finances without scrolling.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show Budget, Spent, and Remaining amounts in toolbar
- [ ] Colour-code remaining amount based on positive/negative
- [ ] Switch between costs and hours summaries based on active tab

---

### US-BU008: View Labour Hours Budget Overview
**As a** Builder/PM, **I want to** view a summary of labour hours budgeted vs actual, **so that** I can manage workforce utilisation.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Five summary cards: Budgeted Hours, Pending Hours, Approved Hours, Remaining, Efficiency
- [ ] Calculate totals from all labour hour line items
- [ ] Show progress bar for efficiency percentage
- [ ] Hours formatted with one decimal place

---

### US-BU009: View Labour Hours by Cost Code
**As a** Builder/PM, **I want to** see labour hours broken down by cost code, **so that** I can identify time-intensive areas.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Table with columns: Cost Code, Budgeted Hours, Pending Hours, Approved Hours, Remaining, Status
- [ ] Colour-coded remaining hours
- [ ] Status badge per line item
- [ ] Progress bar per line item showing utilisation

---

### US-BU010: Recalculate Labour Hours Budget
**As a** Builder/PM, **I want to** recalculate labour hours from estimate labour items, **so that** the hours budget is up to date.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Recalculate via POST /api/projects/:projectId/labour-hours-budget/recalculate
- [ ] Update budgetedHours, pendingHours, approvedHours per cost code
- [ ] Trigger via recalculate button when on hours tab
- [ ] Show success toast on completion

---

### US-BU011: Toggle Between Costs and Hours Tabs
**As a** Builder/PM, **I want to** switch between cost budget and labour hours views, **so that** I can analyse different aspects of the budget.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Costs tab shows financial budget data
- [ ] Labour Hours tab shows time-based budget data
- [ ] Active tab styling with primary colour
- [ ] Toolbar summary updates based on active tab

---

### US-BU012: Display Variance Analysis
**As a** Builder/PM, **I want to** see variance analysis for each budget line item, **so that** I can understand where costs deviate from plan.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Calculate variance as budgeted minus actual
- [ ] Display variance amount with sign
- [ ] Colour code: green for positive (under budget), red for negative (over budget)
- [ ] Show variance percentage where applicable
- [ ] Badge variant: "Under", "Over", or "On Track"

---

### US-BU013: Track Budget Profit
**As a** Builder/PM, **I want to** see profit amount and percentage, **so that** I can track project profitability.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Calculate profitAmount from budget data
- [ ] Calculate profitPercent
- [ ] Store on budget record
- [ ] Display in budget overview

---

### US-BU014: Manage Budget Status
**As a** Builder/PM, **I want to** set the budget status, **so that** I can indicate the current state of the project budget.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Support statuses: active, completed, on_hold
- [ ] Update via PATCH /api/budgets/:id
- [ ] Display status badge on budget page
- [ ] Status reflects project lifecycle stage

---

### US-BU015: Hide Empty Cost Codes
**As a** Builder/PM, **I want to** hide cost codes with no budgeted or actual amounts, **so that** I can focus on active items.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle switch "Hide empty" in labour hours view
- [ ] Filter out items where budgeted, pending, and approved values are all zero
- [ ] Persist preference in localStorage
- [ ] Default to showing all items

---

### US-BU016: View Budget Loading State
**As a** Builder/PM, **I want to** see appropriate loading states while budget data is fetching, **so that** I know the page is loading.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Skeleton components for summary cards
- [ ] Skeleton rows for breakdown table
- [ ] Loading state for budget, line items, and labour hours queries independently

---

### US-BU017: Display Project Phase Context
**As a** Builder/PM, **I want to** see the current project phase on the budget page, **so that** I understand the project context.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show project phase badge (Lead, Pre-Construction, Construction, Post-Construction, Archive)
- [ ] Badge displayed next to page title
- [ ] Phase labels mapped from system phase codes

---

## Technical Notes
- All monetary amounts stored in cents (integer) for precision
- One budget per project enforced by unique constraint on projectId
- Budget auto-creates on first GET request if none exists
- Recalculation aggregates from estimates (baseline), variations (revised), and bills (actual)
- Labour hours budget is separate from cost budget but managed on same page via tabs
- Variance is positive when under budget, negative when over budget
- Budget line items use cached costCodeTitle and categoryTitle for display performance
- Labour hours stored as decimal strings with precision to 1 decimal place
- Budget statuses: active, completed, on_hold

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects/:projectId/budget | Get or auto-create project budget |
| POST | /api/projects/:projectId/budget/calculate | Recalculate budget from source data |
| PATCH | /api/budgets/:id | Update budget details |
| DELETE | /api/budgets/:id | Delete a budget |
| GET | /api/budgets/:budgetId/line-items | Get budget line items by cost code |
| POST | /api/budgets/:budgetId/line-items/recalculate | Recalculate line items |
| PATCH | /api/budget-line-items/:id | Update a budget line item |
| GET | /api/projects/:projectId/labour-hours-budget | Get labour hours budget |
| POST | /api/projects/:projectId/labour-hours-budget/recalculate | Recalculate labour hours |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /projects/:projectId/budget | Budget.tsx | Project budget overview with costs and hours tabs |

## Known Issues / Future Enhancements
- [ ] No budget forecasting based on project completion percentage
- [ ] No budget alerts or threshold notifications
- [ ] No budget comparison across projects
- [ ] No budget export to CSV/Excel
- [ ] No budget snapshots or historical tracking
- [ ] No integration with timesheet data for actual labour hours
- [ ] No earned value management (EVM) metrics

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 17
- Implemented: 17
- Partially Implemented: 0
- Not Implemented: 0
