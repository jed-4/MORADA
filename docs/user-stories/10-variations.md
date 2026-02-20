# Variations (Change Orders) - User Stories

## Epic Overview
Variations (also known as change orders) allow builders to formally document, price, and track changes to the original project scope. Each variation goes through an approval workflow from draft to approved/rejected, with full financial tracking including GST calculations and integration with client invoicing.

## Business Value
For Australian residential builders, variations are a critical part of project management. Building projects frequently encounter changes - from client-requested upgrades to unforeseen site conditions. Having a structured variation process ensures all changes are documented, priced accurately (including GST), approved before work begins, and properly invoiced to clients. This protects both the builder and the homeowner, maintains project profitability, and provides a clear audit trail for dispute resolution.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Create, manage and track variations through approval workflow |
| Estimator | Cost Estimator | Price variation line items accurately with cost codes |
| Admin | Office Administrator | Track variation financials and link to invoices |
| Client | Homeowner | Review and approve/reject proposed variations |

## User Stories

### US-VA001: View All Variations
**As a** Builder/PM, **I want to** view a list of all variations across projects, **so that** I can monitor outstanding change orders.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display variations in a table with number, name, project, status, total, and deadline columns
- [ ] Support filtering by status (draft, action, pending, approved, rejected)
- [ ] Support text search across variation name, number, and description
- [ ] Show variation count badge
- [ ] When accessed within a project context, hide the project column

---

### US-VA002: View Variations in Kanban View
**As a** Builder/PM, **I want to** view variations in a kanban board grouped by status, **so that** I can quickly see the pipeline of change orders.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display columns for Draft, Action, Pending, Approved, and Rejected
- [ ] Show variation cards with name, number, project, total amount, and deadline
- [ ] Show count badge per column
- [ ] Cards are clickable to navigate to detail view

---

### US-VA003: Create New Variation
**As a** Builder/PM, **I want to** create a new variation for a project, **so that** I can document a proposed change order.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Auto-generate variation number in format "XXXX-VO-XXX" (e.g. "4501-VO-017")
- [ ] Require project selection and variation name
- [ ] Support optional approval deadline date picker
- [ ] Support optional days changed field
- [ ] Support introduction and closing text fields
- [ ] Default status to "draft"
- [ ] Navigate to variation detail on successful creation

---

### US-VA004: Edit Variation Details
**As a** Builder/PM, **I want to** edit an existing variation's details, **so that** I can update the change order information.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Load existing variation data into form fields
- [ ] Allow editing name, deadline, days changed, introduction text, and closing text
- [ ] Allow editing relatedTo field for cross-referencing
- [ ] Recalculate financial totals on save
- [ ] Show current status badge in header
- [ ] Log activity on successful update

---

### US-VA005: Add Variation Line Items
**As an** Estimator, **I want to** add line items to a variation, **so that** I can itemise the costs of the change order.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add new cost lines with description, quantity, unit price, and cost code
- [ ] Auto-calculate total price (quantity x unit price)
- [ ] Support sort ordering of line items
- [ ] Store prices in cents for precision
- [ ] Display line items in a table format

---

### US-VA006: Edit Variation Line Items
**As an** Estimator, **I want to** edit existing line items on a variation, **so that** I can correct pricing or descriptions.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update description, quantity, unit price, and cost code
- [ ] Recalculate line total when quantity or unit price changes
- [ ] Persist changes via PATCH /api/variation-items/:id

---

### US-VA007: Delete Variation Line Items
**As an** Estimator, **I want to** remove line items from a variation, **so that** I can correct the scope of the change order.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete individual line items
- [ ] Recalculate variation totals after deletion
- [ ] Persist deletion via DELETE /api/variation-items/:id

---

### US-VA008: Link Line Items to Cost Codes
**As an** Estimator, **I want to** assign cost codes to variation line items, **so that** variation costs feed into the project budget.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Searchable cost code selector on each line item
- [ ] Cost code assignment persisted on save
- [ ] Variation amounts feed into budget variation amounts via cost code linkage
- [ ] Cost codes from the project's cost code library are available

---

### US-VA009: Calculate Variation Financials
**As a** Builder/PM, **I want to** see auto-calculated subtotal, GST, and total amounts, **so that** I know the exact cost of the variation.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Calculate subtotal from sum of all line item totals
- [ ] Calculate GST at 10% on taxable line items
- [ ] Calculate total as subtotal + GST
- [ ] Display all amounts in AUD currency format
- [ ] Store amounts in cents for precision

---

### US-VA010: Track Paid and Balance Amounts
**As a** Builder/PM, **I want to** track how much has been paid on each variation, **so that** I can monitor outstanding balances.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Paid amount field on the variation record
- [ ] Balance amount auto-calculated (totalAmount - paidAmount)
- [ ] Paid and balance amounts stored in cents
- [ ] Financial summary displays subtotal, GST, total, paid, and balance

---

### US-VA011: Move Variation to Action Status
**As a** Builder/PM, **I want to** move a draft variation to "Action" status, **so that** I can signal it needs attention before sending for approval.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show "Move to Action" button only when status is "draft"
- [ ] Update status to "action" on click
- [ ] Invalidate variation queries to refresh UI
- [ ] Show success toast notification

---

### US-VA012: Send Variation for Approval
**As a** Builder/PM, **I want to** send a variation for client approval, **so that** I can get authorisation before proceeding with the work.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show "Send for Approval" button only when status is "action"
- [ ] Update status to "pending" on click
- [ ] Show loading state during submission
- [ ] Show success toast notification

---

### US-VA013: Approve Variation
**As a** Builder/PM, **I want to** approve a pending variation, **so that** I can authorise the change order to proceed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show "Approve" button only when status is "pending"
- [ ] Open confirmation dialog before approving
- [ ] Record approvedBy (current user ID) and approvedDate
- [ ] Update status to "approved"
- [ ] Log approval activity

---

### US-VA014: Reject Variation with Reason
**As a** Builder/PM, **I want to** reject a pending variation with a reason, **so that** I can document why the change order was declined.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Show "Reject" button only when status is "pending"
- [ ] Open dialog to enter rejection reason
- [ ] Require rejection reason text (rejectionReason field)
- [ ] Update status to "rejected" with rejectionReason stored
- [ ] Log rejection activity

---

### US-VA015: Delete Variation
**As a** Builder/PM, **I want to** delete a variation, **so that** I can remove erroneous or duplicate change orders.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete variation via DELETE /api/variations/:id
- [ ] Remove associated line items
- [ ] Refresh variations list after deletion

---

### US-VA016: Filter Variations by Status
**As a** Builder/PM, **I want to** filter variations by status, **so that** I can focus on variations requiring my attention.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status filter popover with all status options (draft, action, pending, approved, rejected)
- [ ] Show count per status in filter options
- [ ] Apply filter to both table and kanban views
- [ ] Show active filter indicator badge

---

### US-VA017: Search Variations
**As a** Builder/PM, **I want to** search variations by name, number, or description, **so that** I can quickly find a specific change order.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Search input in toolbar
- [ ] Filter variations matching search term in name, number, or description
- [ ] Real-time filtering as user types

---

### US-VA018: View Variations within Project Context
**As a** Builder/PM, **I want to** view variations scoped to a specific project, **so that** I can see only relevant change orders.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] When accessed via /projects/:projectId/variations, filter to that project
- [ ] Hide project column in table view
- [ ] Navigate to project-scoped detail view on row click

---

### US-VA019: Link Variation to Client Invoice
**As an** Admin, **I want to** link approved variations to client invoices, **so that** variation costs are properly billed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Junction table invoiceVariations links variations to invoices
- [ ] Select variations when creating/editing a client invoice
- [ ] Include variation amounts in invoice total calculations

---

### US-VA020: Track Variation Approval Deadline
**As a** Builder/PM, **I want to** set and track approval deadlines on variations, **so that** I can ensure timely decision-making.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Date picker for approval deadline
- [ ] Display deadline in variations list table
- [ ] Display deadline on kanban cards
- [ ] Format dates in dd MMM yyyy format

---

### US-VA021: Track Days Changed by Variation
**As a** Builder/PM, **I want to** record the number of days a variation adds or removes from the schedule, **so that** I can track impact on project timeline.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Numeric input for days changed
- [ ] Positive values indicate added days, negative indicate reduced days
- [ ] Stored on variation record
- [ ] Displayed on variation detail page

---

### US-VA022: Log Variation Activity
**As a** Builder/PM, **I want to** have variation activities automatically logged, **so that** there is an audit trail of all changes.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Log activity on variation creation
- [ ] Log activity on variation update
- [ ] Log activity on variation approval
- [ ] Log activity on variation rejection
- [ ] Include variation name and entity ID in activity records

---

## Technical Notes
- All monetary amounts stored in cents (integer) to avoid floating point precision issues
- Variation numbers auto-generated on backend in format "XXXX-VO-XXX" where XXXX is project prefix
- GST calculated at 10% (Australian standard) on taxable line items only
- Frontend converts between dollars (display) and cents (storage) on form submission/load
- Activity logging uses the shared activityLogger utility
- Status workflow: Draft -> Action -> Pending -> Approved / Rejected
- Approval tracking via approvedBy (user ID), approvedDate, and rejectionReason fields
- Line items linked to cost codes for budget integration
- Variations linked to client invoices via invoiceVariations junction table

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/variations | List all variations (with optional projectId, status query params) |
| POST | /api/variations | Create a new variation |
| GET | /api/variations/:id | Get a single variation |
| PATCH | /api/variations/:id | Update a variation (including status changes) |
| DELETE | /api/variations/:id | Delete a variation |
| GET | /api/variations/:id/items | Get line items for a variation |
| POST | /api/variations/:id/items | Add a line item to a variation |
| PATCH | /api/variation-items/:id | Update a variation line item |
| DELETE | /api/variation-items/:id | Delete a variation line item |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /variations | Variations.tsx | Variations list (table/kanban) |
| /variations/:id | VariationDetail.tsx | Variation detail/edit form |
| /variations/new | VariationDetail.tsx | Create new variation |
| /projects/:projectId/variations | Variations.tsx | Project-scoped variations list |
| /projects/:projectId/variations/:variationId | VariationDetail.tsx | Project-scoped variation detail |
| /projects/:projectId/variations/new | VariationDetail.tsx | Create variation within project |

## Known Issues / Future Enhancements
- [ ] No PDF export for variations currently
- [ ] No email notification to clients when variation is sent for approval
- [ ] No attachment support on variations (photos, drawings)
- [ ] Kanban drag-and-drop between columns not implemented
- [ ] No bulk actions (approve/reject multiple variations)
- [ ] No variation templates for common scope changes
- [ ] No digital signature capture for client approval

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 22
- Implemented: 22
- Partially Implemented: 0
- Not Implemented: 0
