# BuildPro User Stories: Bills

## Epic Overview

### Description
The Bills system allows builders to receive, record, and manage supplier invoices against their construction projects. It supports a full lifecycle from draft through approval to payment, with line items linked to cost codes and estimate allowances (Prime Cost / Provisional Sum). Bills integrate with OCR for automated invoice data extraction, budget tracking via cost codes, and price list verification.

### Business Value
- Centralises all supplier invoices with project-level tracking
- Automates data entry from scanned invoices via OCR (Mindee integration)
- Enforces approval workflows so only authorised users can approve expenditure
- Tracks actual spend against budgeted amounts through cost code linkage
- Supports GST-inclusive and GST-exclusive calculation modes for Australian tax compliance
- Links bill line items to estimate allowances for PC/PS cost tracking
- Provides visibility across projects with status-based filtering and totals

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner, manages multiple projects | Overview of all bills, approval control, cost tracking |
| **Project Manager** | Manages specific projects | Enter bills, track invoices, manage cost codes |
| **Site Supervisor** | On-site team lead | Upload receipts, record site purchases |
| **Office Admin** | Administrative support | Process invoices, manage bill data, reconcile payments |
| **Approver** | Authorised team member | Review and approve/reject bills before payment |

---

## User Stories

### 1. Bill Creation & Management

#### US-BI001: Create a Bill
**As a** project manager  
**I want to** create a new bill for a project  
**So that** I can record a supplier invoice against the project

**Acceptance Criteria:**
- [x] User can create a bill from the Bills list page
- [x] Bill number is auto-generated (format: BILL-{timestamp})
- [x] Bill is created with "Draft" status
- [x] User selects a project for the bill
- [x] User selects or creates a supplier for the bill
- [x] Two bill types supported: Bill and Credit
- [x] Navigates to the detail page for editing after creation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI002: Edit Bill Details
**As a** project manager  
**I want to** edit the details of a bill  
**So that** I can accurately record the supplier invoice information

**Acceptance Criteria:**
- [x] User can edit: bill number, project, supplier, bill type (bill/credit), status
- [x] User can set bill date and due date
- [x] User can enter a supplier reference number (their invoice number)
- [x] User can add notes and reminders
- [x] User can toggle "Send to Xero" for accounting integration
- [x] User can record paid amount
- [x] Changes are saved via Save button
- [x] Form uses validation (bill number, project, supplier required)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI003: Add Supplier Inline
**As a** project manager  
**I want to** add a new supplier directly from the bill form  
**So that** I don't have to leave the page to create a supplier record

**Acceptance Criteria:**
- [x] "Add Supplier" button opens an inline dialog
- [x] Quick-create form with name, email, phone, and supplier type
- [x] New supplier is immediately available for selection on the bill
- [x] Supplier types: Supplier, Trade, Subcontractor

**Priority:** Should Have  
**Status:** Implemented

---

#### US-BI004: Delete a Bill
**As a** project manager  
**I want to** delete a bill that was entered in error  
**So that** I can keep my records accurate

**Acceptance Criteria:**
- [x] User can delete a bill via the API
- [x] Deleting a bill cascades to remove all associated line items and approvals

**Priority:** Must Have  
**Status:** Implemented

---

### 2. Line Items

#### US-BI010: Add Line Items
**As a** project manager  
**I want to** add line items to a bill  
**So that** I can itemise what was invoiced

**Acceptance Criteria:**
- [x] User can add line items with: description, quantity, unit price
- [x] Each item has a GST toggle (GST on expenses / No GST)
- [x] Each item can be assigned a cost code (via searchable selector)
- [x] Each item can have a Xero account code
- [x] Line total is auto-calculated (quantity x unit price)
- [x] Three line types: Estimate, Item, Custom

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI011: Edit Line Items Inline
**As a** project manager  
**I want to** edit line items directly in the table  
**So that** I can quickly adjust quantities, prices, and descriptions

**Acceptance Criteria:**
- [x] All item fields are editable inline
- [x] Line totals update in real-time as quantity or price changes
- [x] Items are saved when the bill is saved

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI012: Delete Line Items
**As a** project manager  
**I want to** remove line items from a bill  
**So that** I can correct mistakes

**Acceptance Criteria:**
- [x] User can delete individual items via a delete button
- [x] Existing items are tracked for deletion on save (items removed from UI are deleted on the server)
- [x] Totals update after deletion

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI013: Link Line Items to Allowances
**As a** project manager  
**I want to** link bill line items to estimate allowances (PC/PS items)  
**So that** I can track actual spend against Prime Cost and Provisional Sum allowances

**Acceptance Criteria:**
- [x] Each line item has an "Applies to Allowances" toggle
- [x] When enabled, user can select a PC or PS allowance from the project's estimate
- [x] Allowance allocation amount is recorded (matching line total)
- [x] Allocations are created, updated, or deleted on save
- [x] Allowance data feeds into the Allowances tracking system

**Priority:** Should Have  
**Status:** Implemented

---

### 3. Financial Calculations

#### US-BI020: GST Calculations
**As a** project manager  
**I want to** see accurate GST calculations on my bills  
**So that** I can track tax amounts correctly

**Acceptance Criteria:**
- [x] Tax mode toggle: Inclusive vs Exclusive (controls how totals are calculated)
- [x] Individual items can be set to "GST on expenses" or "No GST"
- [x] Subtotal, GST (10%), and total are auto-calculated
- [x] Inclusive mode: GST is extracted from totals (total / 11)
- [x] Exclusive mode: GST is added on top (total x 0.1)
- [x] All financial values stored in cents (integer) for precision
- [x] Currency displayed in AUD format

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI021: Payment Tracking
**As a** project manager  
**I want to** record how much has been paid on a bill  
**So that** I can track outstanding amounts

**Acceptance Criteria:**
- [x] Paid amount field on the bill detail page
- [x] Amount due is calculated (total - paid amount)
- [x] Paid amount stored in cents

**Priority:** Must Have  
**Status:** Implemented

---

### 4. Bill List View

#### US-BI030: View Bills List
**As a** builder/owner  
**I want to** see all bills in a searchable, filterable list  
**So that** I can quickly find and manage invoices

**Acceptance Criteria:**
- [x] Table displays: bill number, reference, supplier, project, date, due date, status, total
- [x] Real-time search across bill number, reference, supplier name, and project name
- [x] Filter by status: All, Draft, Awaiting Approval, Awaiting Payment, Paid
- [x] Status count badges next to each filter tab
- [x] Status total amounts displayed below tabs
- [x] Project-level view shows only bills for that project
- [x] Row selection with checkboxes (select all / individual)
- [x] Click row to navigate to bill detail

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI031: Filter by Project Phase
**As a** builder/owner  
**I want to** filter bills by the project's current phase  
**So that** I can focus on bills for active or specific-phase projects

**Acceptance Criteria:**
- [x] Phase filter dropdown with project system phases
- [x] Bills are filtered based on their project's current phase

**Priority:** Should Have  
**Status:** Implemented

---

### 5. Approval Workflow

#### US-BI040: Submit Bill for Approval
**As a** project manager  
**I want to** submit a draft bill for approval  
**So that** it can be reviewed before payment is authorised

**Acceptance Criteria:**
- [x] "Submit for Approval" button available on draft bills
- [x] Validation before submission: supplier required, line items required, cost codes required on all items
- [x] Status changes to "Awaiting Approval" on submission
- [x] Validation errors displayed to user

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI041: Approve a Bill
**As an** approver  
**I want to** approve a bill that is awaiting approval  
**So that** it can proceed to payment

**Acceptance Criteria:**
- [x] "Approve" button available on bills with "Awaiting Approval" status
- [x] Only users with approval permission can approve
- [x] Approval can include optional comments
- [x] Status changes to "Awaiting Payment" after approval
- [x] Approval record created with approver details and timestamp
- [x] Activity logged when comments are added

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI042: Reject a Bill
**As an** approver  
**I want to** reject a bill that has issues  
**So that** it can be corrected before resubmission

**Acceptance Criteria:**
- [x] "Reject" button available on bills with "Awaiting Approval" status
- [x] Rejection requires a comment explaining the reason
- [x] Rejection dialog with comments text area
- [x] Only users with approval permission can reject
- [x] Rejection record created with reviewer details and comments
- [x] Status changes to "Draft" after rejection

**Priority:** Must Have  
**Status:** Implemented

---

#### US-BI043: View Approval History
**As a** project manager  
**I want to** see the approval history of a bill  
**So that** I can track who approved or rejected it and when

**Acceptance Criteria:**
- [x] Approval records fetched and displayed on the bill detail page
- [x] Each record shows: approver, status (approved/rejected), comments, timestamp

**Priority:** Should Have  
**Status:** Implemented

---

### 6. OCR / Invoice Scanning

#### US-BI050: Upload Invoice File
**As a** project manager  
**I want to** upload a PDF or image of a supplier invoice  
**So that** I can attach the source document and extract data automatically

**Acceptance Criteria:**
- [x] File upload via click or drag-and-drop
- [x] Supported file types: PDF, JPEG, JPG, PNG
- [x] File size and type validation with error messages
- [x] Uploaded file displayed with name and size

**Priority:** Should Have  
**Status:** Implemented

---

#### US-BI051: Process Invoice with OCR
**As a** project manager  
**I want to** extract data from the uploaded invoice automatically  
**So that** I don't have to manually type in all the details

**Acceptance Criteria:**
- [x] "Process with OCR" button triggers Mindee API processing
- [x] Loading state displayed while processing
- [x] Extracted data includes: reference number, dates, supplier name, line items
- [x] Results available for preview and review

**Priority:** Should Have  
**Status:** Implemented

---

#### US-BI052: Apply OCR Results
**As a** project manager  
**I want to** apply the extracted OCR data to the bill form  
**So that** fields are auto-populated with the scanned data

**Acceptance Criteria:**
- [x] "Apply OCR Data" button populates form fields from OCR results
- [x] Auto-fills: bill reference, bill date, due date, supplier (if matched)
- [x] Auto-creates line items from extracted invoice lines
- [x] Supplier matching by name (case-insensitive)
- [x] User can review and edit auto-populated data

**Priority:** Should Have  
**Status:** Implemented

---

### 7. Price List Integration

#### US-BI060: Link Line Items to Price List
**As a** builder/owner  
**I want to** link bill line items to price list entries  
**So that** I can track supplier pricing and identify unlinked items for review

**Acceptance Criteria:**
- [x] Bill line items can reference a price list item (priceListItemId)
- [x] API endpoint to find unlinked bill line items (`/api/bill-line-items/unlinked`)
- [x] API endpoint to link a bill line item to a price list item (`/api/bill-line-items/:id/link-price-item`)
- [x] Price link review tracking table with status (pending, linked, created, skipped)
- [ ] UI for reviewing and linking unlinked bill line items to price list

**Priority:** Should Have  
**Status:** Partially Implemented (backend routes exist, no review UI)

---

### 8. Budget Integration

#### US-BI070: Cost Code Tracking
**As a** builder/owner  
**I want to** bill line items to feed into budget tracking via cost codes  
**So that** I can see actual spend against budgeted amounts

**Acceptance Criteria:**
- [x] Each line item can be assigned a cost code
- [x] Cost code selector with searchable dropdown
- [x] Bill totals flow into budget "actual amount" calculations
- [x] Cost codes are required before submission for approval

**Priority:** Must Have  
**Status:** Implemented

---

### 9. Settings & Configuration

#### US-BI080: Company Bill Number Configuration
**As a** builder/owner  
**I want to** configure the bill numbering prefix  
**So that** bill numbers match my company's conventions

**Acceptance Criteria:**
- [x] Company settings include bill prefix (default "BILL-") and start number (default 1000)
- [x] Bill prefix and start number configurable in company settings

**Priority:** Should Have  
**Status:** Implemented

---

### 10. Xero Integration

#### US-BI090: Xero Sync Flag
**As a** office admin  
**I want to** flag bills for Xero synchronisation  
**So that** approved bills are sent to our accounting system

**Acceptance Criteria:**
- [x] "Send to Xero" checkbox on the bill detail form
- [x] Xero invoice ID field for tracking synced bills
- [x] Xero paid status tracking field
- [ ] Actual Xero API integration for pushing bills
- [ ] Bi-directional sync of payment status

**Priority:** Could Have  
**Status:** Partially Implemented (data fields exist, no live Xero sync)

---

### 11. Permissions

#### US-BI100: Role-Based Access Control
**As a** builder/owner  
**I want to** control who can view, create, edit, approve, and delete bills  
**So that** I can restrict financial access based on team roles

**Acceptance Criteria:**
- [x] Bill approval permission check enforced on approve/reject endpoints
- [x] `canUserApproveBills` check on backend
- [x] Frontend queries approval permission to show/hide approve/reject buttons
- [x] Permission key: `financial.bills` (view, add, edit, delete)

**Priority:** Must Have  
**Status:** Implemented

---

## Technical Notes

### Data Model
- Financial values stored in cents (integer) for precision — displayed as AUD currency
- Supplier linked via `contacts` table (contactType = 'supplier' or 'subcontractor')
- Bill types: "bill" (standard invoice) and "credit" (credit note)
- Status workflow: Draft -> Awaiting Approval -> Awaiting Payment -> Paid
- Approval records tracked in `billApprovals` table
- Line item allowance allocations tracked in `billLineItemAllowances` table
- Price list linking tracked in `billLineItemPriceLinks` table
- OCR data stored as JSON on the bill record (`ocrData` field)
- Attachment URLs stored as JSON array (`attachmentUrls` field)

### API Routes
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/bills` | List bills (filters: projectId, status) |
| GET | `/api/bills/:id` | Get single bill |
| POST | `/api/bills` | Create bill |
| PATCH | `/api/bills/:id` | Update bill |
| DELETE | `/api/bills/:id` | Delete bill |
| GET | `/api/bills/:id/line-items` | List line items |
| POST | `/api/bills/:billId/line-items` | Create line item |
| PATCH | `/api/bills/:billId/line-items/:id` | Update line item |
| DELETE | `/api/bills/:billId/line-items/:id` | Delete line item |
| GET | `/api/bills/:billId/line-item-allowances` | List allowance allocations |
| POST | `/api/bill-line-item-allowances` | Create allowance allocation |
| PATCH | `/api/bill-line-item-allowances/:id` | Update allowance allocation |
| DELETE | `/api/bill-line-item-allowances/:id` | Delete allowance allocation |
| GET | `/api/bills/:id/approvals` | List approvals |
| POST | `/api/bills/:id/approve` | Approve bill |
| POST | `/api/bills/:id/reject` | Reject bill |
| GET | `/api/bill-line-items/unlinked` | Get unlinked items for price review |
| PATCH | `/api/bill-line-items/:id/link-price-item` | Link to price list item |

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/bills` | Bills | Business-level bill list |
| `/bills/new` | BillDetail | Create new bill |
| `/bills/:id` | BillDetail | Bill detail/edit |
| `/projects/:projectId/bills` | Dashboard | Project-level bill list (via dashboard tab) |
| `/projects/:projectId/bills/new` | BillDetail | Create project bill |
| `/projects/:projectId/bills/:id` | BillDetail | Project bill detail |

---

## Known Issues

1. **Bill number format** — Currently uses timestamp-based format (BILL-{timestamp}), not the configurable prefix + sequential number from company settings.
2. **No bulk actions** — List page has row selection checkboxes but no bulk action buttons (e.g., bulk approve, bulk delete).
3. **Attachment storage** — `attachmentUrls` JSON array exists on the schema but file upload to object storage is not connected.
4. **No duplicate bill** — No duplicate/copy action available.
5. **Payment terms** — Payment terms enum exists on supplier schema but is not integrated into the bill due date calculation.

---

## Document Change Log

| Date | Changes |
|------|---------|
| 2026-02-19 | Initial user story document created based on current implementation analysis |

---

## Summary: Implementation Coverage

| Area | Stories | Implemented | Partial | Not Started |
|------|---------|-------------|---------|-------------|
| Creation & Management | 4 | 4 | 0 | 0 |
| Line Items | 4 | 4 | 0 | 0 |
| Financial Calculations | 2 | 2 | 0 | 0 |
| List View | 2 | 2 | 0 | 0 |
| Approval Workflow | 4 | 4 | 0 | 0 |
| OCR / Invoice Scanning | 3 | 3 | 0 | 0 |
| Price List Integration | 1 | 0 | 1 | 0 |
| Budget Integration | 1 | 1 | 0 | 0 |
| Settings | 1 | 1 | 0 | 0 |
| Xero Integration | 1 | 0 | 1 | 0 |
| Permissions | 1 | 1 | 0 | 0 |
| **Total** | **24** | **22** | **2** | **0** |
