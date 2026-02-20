# Allowances (PC & PS Items) - User Stories

## Epic Overview
The Allowances system provides builders with a centralised view of all Prime Cost (PC) and Provisional Sum (PS) allowance items across a project. It aggregates data from estimates, bills, and timesheets to track budgeted allowances against actual expenditure. Builders can monitor variance, update allowance statuses, and ensure that PC/PS items are properly accounted for throughout the project lifecycle. This is critical for Australian residential construction where PC and PS allowances are standard contractual mechanisms.

## Business Value
PC and PS allowances are fundamental to Australian residential building contracts under HIA and MBA standards. Builders need to track these allowances carefully to manage client expectations and contractual obligations. The Allowances system provides real-time visibility into budgeted vs actual costs for each allowance item, helping builders identify variances early, communicate adjustments to clients, and maintain accurate project financials. Integration with bills and timesheets ensures all actual costs are captured automatically without manual reconciliation.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/Owner | Business owner, manages multiple projects | Monitor allowance variances, manage client expectations, ensure profitability |
| Project Manager | Manages specific projects | Track allowances, link bills to allowances, update statuses |
| Estimator | Dedicated costing role | Set allowance budgets in estimates, flag PC/PS items |
| Office Admin | Administrative support | Reconcile bills against allowances, generate reports |
| Client/Homeowner | Project client | Understand allowance budgets and any variations |

## User Stories

### US-AL001: View Project Allowances Summary
**As a** Builder/Owner, **I want to** view a summary of all allowances for a project, **so that** I can see the overall allowance budget and spending at a glance.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Aggregated view of all PC and PS allowance items for a project
- [ ] Display total budgeted allowance amount
- [ ] Display total actual spend against allowances
- [ ] Show overall variance (budget minus actual)
- [ ] Summary accessible via /api/projects/:projectId/allowances endpoint
- [ ] Currency displayed in AUD format

---

### US-AL002: View Allowance Items List
**As a** Project Manager, **I want to** view a list of all allowance items for a project, **so that** I can monitor each PC and PS item individually.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] List all allowance items with description, type (PC/PS), budgeted amount, actual spend, and variance
- [ ] Search across allowance item descriptions
- [ ] Filter by allowance type (Prime Cost, Provisional Sum)
- [ ] Filter by status (pending, in_progress, finalised)
- [ ] Show item count and total amounts
- [ ] Click row to navigate to allowance detail

---

### US-AL003: View Allowance Detail
**As a** Project Manager, **I want to** view the detailed breakdown of a specific allowance item, **so that** I can see all associated costs and their sources.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display allowance item details: description, quantity, unit price, total price
- [ ] Show linked estimate item reference (estimateItemId)
- [ ] Show all bill line items allocated to this allowance
- [ ] Show all timesheet entries allocated to this allowance
- [ ] Display running total of actual costs from bills and timesheets
- [ ] Show variance between budgeted and actual amounts

---

### US-AL004: Link Allowance to Estimate Item
**As an** Estimator, **I want to** allowance items to be linked to their source estimate items, **so that** I can trace allowance budgets back to the original estimate.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Allowance items linked via estimateItemId to estimate items marked as PC or PS
- [ ] Budgeted amount sourced from the estimate item's cost
- [ ] Description inherited from estimate item (can be overridden)
- [ ] Quantity and unit price from the estimate item
- [ ] All financial values stored in cents (integer) for precision

---

### US-AL005: Track Bill Allocations Against Allowances
**As a** Project Manager, **I want to** see which bill line items have been allocated to each allowance, **so that** I can track actual supplier costs against the allowance budget.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Bill line item allowances linked via billLineItemAllowances table
- [ ] Each allocation records: bill line item ID, allowance item ID, and allocated amount
- [ ] Multiple bill line items can be allocated to a single allowance
- [ ] Allocated amounts summed to show total actual spend from bills
- [ ] Bill reference details (bill number, supplier, date) displayed on allowance detail

---

### US-AL006: Create Bill Line Item Allowance Allocation
**As a** Project Manager, **I want to** allocate a bill line item to a specific allowance, **so that** the cost is tracked against the correct PC or PS item.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create allocation via POST /api/bill-line-item-allowances
- [ ] Select allowance item from project's available allowances
- [ ] Set allocated amount (defaults to bill line item total)
- [ ] Allocation amount stored in cents
- [ ] Validation ensures allocation doesn't exceed line item total

---

### US-AL007: Edit Bill Line Item Allowance Allocation
**As a** Project Manager, **I want to** edit an existing bill allowance allocation, **so that** I can correct the allocated amount or reassign to a different allowance.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update allocation via PATCH /api/bill-line-item-allowances/:id
- [ ] Change allocated amount
- [ ] Reassign to a different allowance item
- [ ] Totals recalculated after update

---

### US-AL008: Delete Bill Line Item Allowance Allocation
**As a** Project Manager, **I want to** remove a bill allowance allocation, **so that** I can correct mistakes in cost tracking.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete allocation via DELETE /api/bill-line-item-allowances/:id
- [ ] Allowance actual spend recalculated after deletion
- [ ] Confirmation before deletion

---

### US-AL009: Track Timesheet Allocations Against Allowances
**As a** Project Manager, **I want to** see which timesheet entries have been allocated to each allowance, **so that** I can track actual labour costs against PS labour allowances.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Timesheet allowances linked via timesheetAllowances table
- [ ] Each allocation records: timesheet entry ID, allowance item ID, and allocated amount
- [ ] Labour costs from timesheets summed to show total actual spend
- [ ] Timesheet reference details (date, worker, hours) displayed on allowance detail

---

### US-AL010: Create Timesheet Allowance Allocation
**As a** Project Manager, **I want to** allocate a timesheet entry to a specific allowance, **so that** labour costs are tracked against the correct PS item.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create allocation via POST /api/timesheet-allowances
- [ ] Select allowance item from project's available allowances
- [ ] Set allocated amount based on timesheet hours and rate
- [ ] Allocation amount stored in cents

---

### US-AL011: Edit Timesheet Allowance Allocation
**As a** Project Manager, **I want to** edit a timesheet allowance allocation, **so that** I can correct the allocated amount.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update allocation via PATCH /api/timesheet-allowances/:id
- [ ] Change allocated amount or reassign to different allowance
- [ ] Totals recalculated after update

---

### US-AL012: Delete Timesheet Allowance Allocation
**As a** Project Manager, **I want to** remove a timesheet allowance allocation, **so that** I can correct mistakes in labour cost tracking.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete allocation via DELETE /api/timesheet-allowances/:id
- [ ] Allowance actual spend recalculated after deletion

---

### US-AL013: Allowance Variance Analysis
**As a** Builder/Owner, **I want to** see the variance between budgeted and actual costs for each allowance, **so that** I can identify items that are over or under budget.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Variance calculated as budgeted amount minus actual spend
- [ ] Positive variance: under budget (green indicator)
- [ ] Negative variance: over budget (red indicator)
- [ ] Variance displayed on both list and detail views
- [ ] Percentage variance shown alongside dollar amounts

---

### US-AL014: Update Allowance Status
**As a** Project Manager, **I want to** update the status of an allowance item, **so that** I can track its progress through the project.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status values: Pending, In Progress, Finalised
- [ ] Pending: allowance budget set but no actual costs yet
- [ ] In Progress: some costs allocated, selection/procurement underway
- [ ] Finalised: all costs captured, allowance reconciled
- [ ] Status configurable via field settings with custom options
- [ ] Status badges with appropriate colours

---

### US-AL015: Navigate Allowances from Project
**As a** Project Manager, **I want to** access the allowances view from within the project context, **so that** I can quickly check allowance status while managing a project.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Allowances accessible as a project tab/section
- [ ] Project-level navigation to allowances list (Allowances.tsx)
- [ ] Click through to allowance detail (AllowanceDetail.tsx)
- [ ] Breadcrumb navigation back to project

---

## Technical Notes
- PC (Prime Cost) items represent materials/products where the builder estimates a cost but the client chooses the actual product (e.g., tiles, tapware)
- PS (Provisional Sum) items represent work where the exact cost is unknown at contract time (e.g., excavation, stormwater)
- All financial values stored in cents (integer) for precision, displayed in AUD format
- Allowance items are linked to estimate items via estimateItemId - the estimate is the source of truth for budgeted amounts
- Bill allocations tracked in billLineItemAllowances table, linking bill line items to allowance items
- Timesheet allocations tracked in timesheetAllowances table, linking timesheet entries to allowance items
- Project-level aggregation via GET /api/projects/:projectId/allowances provides the consolidated view
- Status workflow: Pending -> In Progress -> Finalised
- Variance = budgeted (from estimate) - actual (from bills + timesheets)
- Allowance status options are configurable via field settings (useAllowanceStatusOptions hook)

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects/:projectId/allowances | Get aggregated allowances for a project |
| GET | /api/bill-line-item-allowances | List bill line item allowance allocations |
| POST | /api/bill-line-item-allowances | Create a bill line item allowance allocation |
| GET | /api/bill-line-item-allowances/:id | Get a single allocation |
| PATCH | /api/bill-line-item-allowances/:id | Update a bill line item allowance allocation |
| DELETE | /api/bill-line-item-allowances/:id | Delete a bill line item allowance allocation |
| GET | /api/timesheet-allowances | List timesheet allowance allocations |
| POST | /api/timesheet-allowances | Create a timesheet allowance allocation |
| GET | /api/timesheet-allowances/:id | Get a single timesheet allocation |
| PATCH | /api/timesheet-allowances/:id | Update a timesheet allowance allocation |
| DELETE | /api/timesheet-allowances/:id | Delete a timesheet allowance allocation |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /projects/:projectId/allowances | Allowances.tsx | Project allowances list with search, filters, and summary |
| /projects/:projectId/allowances/:id | AllowanceDetail.tsx | Allowance detail with bill and timesheet allocations |

## Known Issues / Future Enhancements
- [ ] Client-facing allowance summary view showing budget vs actual per item
- [ ] Automatic allowance variation notifications when thresholds are exceeded
- [ ] PDF export of allowance summary for client reporting
- [ ] Integration with selections to auto-link selection costs to allowance items
- [ ] Allowance adjustment workflow for formally adjusting budgets mid-project
- [ ] Historical tracking of allowance changes over time
- [ ] Bulk allocation tool for assigning multiple bill items to allowances at once
- [ ] Dashboard widget showing top over-budget allowances across all projects

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 15
- Implemented: 15
- Partially Implemented: 0
- Not Implemented: 0
