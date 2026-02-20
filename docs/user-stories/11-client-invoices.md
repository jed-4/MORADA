# Client Invoices - User Stories

## Epic Overview
Client Invoices enable builders to bill their clients for project work. The system supports two invoicing methods: Progress Payments (percentage of contract price from estimates) and Cost Plus (actual costs from bills with markup). Invoices can link to estimates, variations, bills, and allowances, and include a full payment tracking workflow from draft through to paid status.

## Business Value
For Australian residential builders, timely and accurate invoicing is essential for cash flow management. The dual invoicing method support (progress payments vs cost plus) accommodates both fixed-price contracts and time-and-materials arrangements common in the industry. Integration with estimates, variations, and bills ensures invoice accuracy and eliminates double data entry. Payment tracking helps builders monitor outstanding receivables and maintain healthy cash flow - critical for sustaining construction operations.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Create and send invoices to clients |
| Admin | Office Administrator | Manage invoicing, track payments, reconcile accounts |
| Bookkeeper | Financial Controller | Monitor receivables, ensure accurate billing |
| Client | Homeowner | Receive and pay invoices |

## User Stories

### US-CI001: View All Client Invoices
**As an** Admin, **I want to** view a list of all client invoices, **so that** I can monitor billing status across projects.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display invoices in a table with invoice number, name, project, created date, due date, total, paid, balance, sync status, and status columns
- [ ] Support filtering by status (draft, sent, partial, paid, overdue)
- [ ] Support text search by invoice number and project name
- [ ] Show summary totals (total, paid, balance) in the toolbar
- [ ] Show invoice count badge

---

### US-CI002: View Invoice Summary Banner
**As an** Admin, **I want to** see a summary banner showing total amounts, breakdown, and key metrics, **so that** I can quickly understand the financial position.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display total amount prominently
- [ ] Show breakdown by contract price and variations (progress payments) or bills/timesheets and markup (cost plus)
- [ ] Show paid percentage, invoiced percentage, and remaining percentage metrics
- [ ] Use gradient banner with clear typography

---

### US-CI003: Create New Invoice
**As an** Admin, **I want to** create a new client invoice, **so that** I can bill the client for work completed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Auto-generate unique invoice number
- [ ] Require project selection and auto-populate client from project
- [ ] Auto-populate name with "Invoice [Month Year]" format
- [ ] Set invoice date to today by default
- [ ] Support optional due date
- [ ] Support introduction text, closing text, and terms and conditions (rich text)
- [ ] Default status to "draft"

---

### US-CI004: Configure Progress Payments Invoice
**As an** Admin, **I want to** create an invoice using the progress payments method, **so that** I can bill a percentage of the contract price.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select invoicing method as "progress_payments"
- [ ] Select an estimate to link to the invoice
- [ ] Set progress percentage (25%, 50%, 75%, 100%, or custom)
- [ ] Calculate contract price as estimate total multiplied by progress percentage
- [ ] Allow linking approved variations to include in the invoice
- [ ] Calculate subtotal as contract price plus variations plus custom lines

---

### US-CI005: Configure Cost Plus Invoice
**As an** Admin, **I want to** create an invoice using the cost plus method, **so that** I can bill actual costs with a markup.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select invoicing method as "cost_plus"
- [ ] Select bills to include in the invoice
- [ ] Set markup percentage (markupPercent field)
- [ ] Calculate markup amount from bills total
- [ ] Calculate subtotal as bills total plus custom lines
- [ ] Calculate total as subtotal plus markup plus GST

---

### US-CI006: Add Custom Line Items
**As an** Admin, **I want to** add custom line items to an invoice, **so that** I can include additional charges or adjustments.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add lines with description, quantity, unit price, and taxable flag
- [ ] Auto-calculate line total (quantity x unit price)
- [ ] Support sort ordering
- [ ] Store prices in cents for precision

---

### US-CI007: Edit Custom Line Items
**As an** Admin, **I want to** edit existing line items on an invoice, **so that** I can correct billing details.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update description, quantity, unit price, and taxable status
- [ ] Recalculate line total on changes
- [ ] Persist changes via PATCH endpoint

---

### US-CI008: Delete Custom Line Items
**As an** Admin, **I want to** remove line items from an invoice, **so that** I can correct billing errors.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete individual line items
- [ ] Recalculate invoice totals after deletion
- [ ] Handle both existing (persisted) and new (unsaved) line items

---

### US-CI009: Calculate Invoice Financials with GST
**As an** Admin, **I want to** see auto-calculated subtotal, markup, GST, and total, **so that** I know the exact amount to bill.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Calculate subtotal based on invoicing method
- [ ] Calculate markup amount for cost plus invoices (markupPercent applied)
- [ ] Calculate GST at 10% on taxable items
- [ ] Calculate total as subtotal plus markup plus GST
- [ ] Display amounts in AUD currency format
- [ ] Store all amounts in cents (subtotal, markupAmount, gstAmount, totalAmount)

---

### US-CI010: Link Estimate to Invoice
**As an** Admin, **I want to** link an estimate to an invoice, **so that** I can base billing on the contract price.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select from project estimates via GET /api/client-invoices/:id/estimates
- [ ] Store link via POST /api/client-invoices/:id/estimates
- [ ] Include progress percentage in the link
- [ ] Fetch estimate items to calculate contract price

---

### US-CI011: Link Variations to Invoice
**As an** Admin, **I want to** link approved variations to an invoice, **so that** change order costs are properly billed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Multi-select from project variations via GET /api/client-invoices/:id/variations
- [ ] Store links in invoiceVariations junction table via POST
- [ ] Include variation totals in invoice calculations
- [ ] Available for progress payments invoicing method

---

### US-CI012: Link Bills to Invoice
**As an** Admin, **I want to** link bills to an invoice, **so that** actual costs are passed through to the client.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Multi-select from project bills via GET /api/client-invoices/:id/bills
- [ ] Store links via POST /api/client-invoices/:id/bills
- [ ] Include bill totals in invoice calculations
- [ ] Available for cost plus invoicing method

---

### US-CI013: Link Allowances to Invoice
**As an** Admin, **I want to** link allowances to an invoice, **so that** allowance items are included in billing.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Junction table invoiceAllowances links allowances to invoices
- [ ] Include allowance amounts in invoice calculations

---

### US-CI014: Record Payment
**As an** Admin, **I want to** record a payment against an invoice, **so that** I can track what has been received.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Open payment dialog from invoice detail
- [ ] Enter amount, payment date, payment method, reference, and notes
- [ ] Payment methods: Bank Transfer, Credit Card, Cash, Cheque, Other
- [ ] Update invoice paidAmount and balanceAmount
- [ ] Auto-update status to "partial" if partially paid
- [ ] Auto-update status to "paid" if fully paid
- [ ] Store payment in clientInvoicePayments table

---

### US-CI015: View Payment History
**As an** Admin, **I want to** view all payments recorded against an invoice, **so that** I can track the payment timeline.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] List all payments with date, amount, method, reference, and notes
- [ ] Show payments on invoice detail page
- [ ] Fetch from GET /api/client-invoices/:id/payments

---

### US-CI016: Send Invoice to Client
**As an** Admin, **I want to** mark an invoice as sent, **so that** I can track which invoices have been delivered to clients.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update status from "draft" to "sent"
- [ ] Record sentDate timestamp
- [ ] Show sync indicator in invoices list (checkmark for sent, clock for unsent)
- [ ] Log activity on send

---

### US-CI017: Update Invoice Details
**As an** Admin, **I want to** edit an existing invoice, **so that** I can correct or update billing information.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Load existing invoice data into form
- [ ] Update all editable fields (name, dates, intro/closing text, terms, notes)
- [ ] Recalculate financial totals
- [ ] Handle line item additions, updates, and deletions
- [ ] Log activity on update

---

### US-CI018: Delete Invoice
**As an** Admin, **I want to** delete an invoice, **so that** I can remove erroneous or duplicate invoices.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete option available from invoice actions menu
- [ ] Remove invoice and associated line items and payments
- [ ] Refresh invoices list after deletion

---

### US-CI019: Track Invoice Status Lifecycle
**As an** Admin, **I want to** track invoices through their lifecycle, **so that** I can manage the billing process.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status transitions: draft -> sent -> partial -> paid
- [ ] Overdue status for invoices past due date
- [ ] Status badges with appropriate colours and icons
- [ ] Automatic status update on payment recording

---

### US-CI020: Filter Invoices by Status
**As an** Admin, **I want to** filter invoices by status, **so that** I can focus on invoices needing attention.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status filter popover with all status options (draft, sent, partial, paid, overdue)
- [ ] Show count per status in filter options
- [ ] Apply filter to API query
- [ ] Show active filter indicator

---

### US-CI021: Search Invoices
**As an** Admin, **I want to** search invoices by number or project name, **so that** I can quickly find a specific invoice.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Search input in toolbar
- [ ] Filter matching invoice number or project name
- [ ] Real-time client-side filtering

---

### US-CI022: View Invoices within Project Context
**As a** Builder/PM, **I want to** view invoices scoped to a specific project, **so that** I can see billing for that project only.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Filter invoices by projectId from URL
- [ ] Hide project column in table
- [ ] Navigate to project-scoped detail view

---

### US-CI023: Display Currency in AUD Format
**As an** Admin, **I want to** see all amounts formatted in Australian dollars, **so that** invoices are properly localised.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Use en-AU locale for number formatting
- [ ] Currency symbol: AUD ($)
- [ ] Whole numbers display without decimal places
- [ ] Fractional amounts display with 2 decimal places

---

### US-CI024: Log Invoice Activity
**As an** Admin, **I want to** have invoice activities automatically logged, **so that** there is an audit trail.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Log activity on invoice creation
- [ ] Log activity on invoice update
- [ ] Log activity on invoice send
- [ ] Log activity when invoice is fully paid
- [ ] Include invoice number and entity ID in activity records

---

## Technical Notes
- All monetary amounts stored in cents (integer) for precision
- Invoice numbers are auto-generated and unique
- Invoicing method determined per invoice: progress_payments or cost_plus
- Progress payments calculate from estimate total multiplied by progress percentage
- Cost plus calculates from linked bills plus markup percentage
- GST calculated at 10% (Australian standard) on taxable items
- Payment recording auto-updates invoice status based on balance
- Rich text supported for introduction text, closing text, and terms and conditions
- Client auto-populated from project's linked client contact
- Junction tables: invoiceVariations, invoiceAllowances for linking related records

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/client-invoices | List invoices (with optional projectId, status params) |
| POST | /api/client-invoices | Create a new invoice |
| GET | /api/client-invoices/:id | Get a single invoice |
| PATCH | /api/client-invoices/:id | Update an invoice |
| DELETE | /api/client-invoices/:id | Delete an invoice |
| GET | /api/client-invoices/:id/items | Get invoice line items |
| POST | /api/client-invoices/:id/items | Add a line item |
| PATCH | /api/client-invoice-items/:id | Update a line item |
| DELETE | /api/client-invoice-items/:id | Delete a line item |
| GET | /api/client-invoices/:id/payments | Get payment history |
| POST | /api/client-invoices/:id/payments | Record a payment |
| GET | /api/client-invoices/:id/estimates | Get linked estimates |
| POST | /api/client-invoices/:id/estimates | Link an estimate |
| GET | /api/client-invoices/:id/variations | Get linked variations |
| POST | /api/client-invoices/:id/variations | Link a variation |
| GET | /api/client-invoices/:id/bills | Get linked bills |
| POST | /api/client-invoices/:id/bills | Link a bill |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /client-invoices | ClientInvoices.tsx | Invoice list with summary banner |
| /client-invoices/:id | ClientInvoiceDetail.tsx | Invoice detail/edit form |
| /client-invoices/new | ClientInvoiceDetail.tsx | Create new invoice |
| /projects/:projectId/client-invoices | ClientInvoices.tsx | Project-scoped invoice list |
| /projects/:projectId/client-invoices/:invoiceId | ClientInvoiceDetail.tsx | Project-scoped invoice detail |
| /projects/:projectId/client-invoices/new | ClientInvoiceDetail.tsx | Create invoice within project |

## Known Issues / Future Enhancements
- [ ] No PDF generation/export for invoices
- [ ] No email sending of invoices to clients
- [ ] No recurring invoice support
- [ ] No credit note functionality
- [ ] No integration with accounting software (Xero, MYOB)
- [ ] Duplicate invoice action in menu is not yet functional
- [ ] No late payment reminder automation

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 24
- Implemented: 24
- Partially Implemented: 0
- Not Implemented: 0
