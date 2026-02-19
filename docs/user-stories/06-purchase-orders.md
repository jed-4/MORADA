# BuildPro User Stories: Purchase Orders

## Epic Overview

### Description
The Purchase Orders system enables builders to formally order materials and services from suppliers for their construction projects. It supports two PO types (Main and Site), a multi-step approval and sending workflow, line item management with GST calculations, supplier e-signatures, reusable templates, and integration with estimates, cost codes, and subcontractor timesheets.

### Business Value
- Formalises procurement with a clear paper trail for every order
- Tracks material and service costs against project budgets via cost codes
- Automates PO numbering with configurable company-level prefixes
- Reduces manual effort through templates, estimate imports, and bulk item creation
- Supports approval thresholds to control on-site purchasing authority
- Enables supplier acknowledgement via tokenised e-signature portal

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner, manages multiple projects | Overview of all purchase orders, approval of site POs, cost control |
| **Project Manager** | Manages specific projects | Create POs for materials/services, track order status, manage supplier relationships |
| **Site Supervisor** | On-site team lead | Raise site POs for urgent materials, attach receipts, track deliveries |
| **Office Admin** | Administrative support | Process POs, manage templates, coordinate with suppliers, handle attachments |
| **Subcontractor** | External supplier/trade | Receive POs, acknowledge/accept orders, submit signed acceptance |

---

## User Stories

### 1. PO Creation & Management

#### US-PO001: Create a Purchase Order
**As a** project manager  
**I want to** create a new purchase order for a project  
**So that** I can formally order materials or services from a supplier

**Acceptance Criteria:**
- [x] User can create a PO from the Purchase Orders list page
- [x] User must select a project before creating a PO (project selection dialog)
- [x] PO number is auto-generated from company settings (prefix + year + sequential number, e.g., PO-2025-001)
- [x] PO is created with "Draft" status and navigates to the detail page for editing
- [x] Two PO types supported: Main PO and Site PO
- [x] PO is linked to the creating user (createdById)
- [x] PO is accessible from both the business-level list and the project-level list

**Priority:** Must Have  
**Status:** Implemented

---

#### US-PO002: Edit Purchase Order Details
**As a** project manager  
**I want to** edit the details of a purchase order  
**So that** I can specify what is being ordered, from whom, and delivery requirements

**Acceptance Criteria:**
- [x] User can edit PO header fields: name/title, description
- [x] User can set a required-by date for the order
- [x] User can enter a delivery address and delivery instructions
- [x] User can add/edit scope of work using a rich text editor
- [x] User can import scope content from the linked project
- [x] User can add/edit terms and conditions
- [x] Changes are saved via explicit Save button
- [x] Unsaved changes are tracked and indicated to the user
- [x] Non-draft POs are locked (read-only) to prevent editing after sending

**Priority:** Must Have  
**Status:** Implemented

---

#### US-PO003: Select/Change Supplier
**As a** project manager  
**I want to** select or change the supplier on a purchase order  
**So that** the PO is addressed to the correct supplier with their contact details displayed

**Acceptance Criteria:**
- [x] Supplier card displays supplier name, email, phone, and address on the detail page
- [x] Suppliers are sourced from contacts with type "supplier" or "subcontractor"
- [ ] Searchable supplier picker allows selecting/changing the supplier on the detail page
- [ ] Supplier name is cached on the PO for display even without a contact record

**Priority:** Must Have  
**Status:** Partially Implemented (display only, no picker to change supplier)

---

#### US-PO004: Delete a Purchase Order
**As a** project manager  
**I want to** delete a purchase order that is no longer needed  
**So that** I can keep my PO list clean and accurate

**Acceptance Criteria:**
- [x] User can delete a PO from the list page via action menu
- [x] Deleting a PO cascades to remove all associated items, attachments, and signatures
- [x] User receives confirmation of deletion

**Priority:** Must Have  
**Status:** Implemented

---

#### US-PO005: Duplicate a Purchase Order
**As a** project manager  
**I want to** duplicate an existing purchase order  
**So that** I can quickly create similar orders without re-entering all the details

**Acceptance Criteria:**
- [x] Duplicate action available in list page row actions
- [ ] Duplicate action available in detail page actions dropdown
- [ ] Duplicated PO is created with a new PO number, "Draft" status, and all details/items copied
- [ ] User is navigated to the new duplicated PO

**Priority:** Should Have  
**Status:** Partially Implemented (action button exists on detail page but not wired)

---

### 2. Line Items

#### US-PO010: Add Line Items
**As a** project manager  
**I want to** add line items to a purchase order  
**So that** I can specify exactly what materials or services are being ordered

**Acceptance Criteria:**
- [x] User can add individual line items with: description, quantity, unit, unit price
- [x] Each item has a GST-free toggle
- [x] Each item can be assigned a cost code (via searchable cost code selector)
- [x] Line total is auto-calculated (quantity x unit price)
- [x] Items are added via "Add Item" button

**Priority:** Must Have  
**Status:** Implemented

---

#### US-PO011: Edit Line Items Inline
**As a** project manager  
**I want to** edit line items directly in the table  
**So that** I can quickly update quantities, prices, and descriptions without opening a separate form

**Acceptance Criteria:**
- [x] All item fields are editable inline (description, quantity, unit, unit price, GST-free, cost code)
- [x] Changes are saved automatically on field change
- [x] Line totals update in real-time as quantity or price changes
- [x] Items are locked when PO is not in draft status

**Priority:** Must Have  
**Status:** Implemented

---

#### US-PO012: Reorder Line Items
**As a** project manager  
**I want to** reorder line items via drag-and-drop  
**So that** I can organise the PO in a logical sequence

**Acceptance Criteria:**
- [x] Line items can be reordered using drag handles
- [x] New order is persisted to the server
- [x] Drag-and-drop is disabled when PO is locked (non-draft)

**Priority:** Should Have  
**Status:** Implemented

---

#### US-PO013: Delete Line Items
**As a** project manager  
**I want to** remove line items from a purchase order  
**So that** I can correct mistakes or remove items no longer needed

**Acceptance Criteria:**
- [x] User can delete individual items via a delete button on each row
- [x] Delete button is visible on row hover
- [x] Totals update after deletion
- [x] Delete is disabled when PO is locked

**Priority:** Must Have  
**Status:** Implemented

---

#### US-PO014: Bulk Import Items from Estimate
**As a** project manager  
**I want to** import line items from a project estimate  
**So that** I can quickly populate a PO with items already defined in the budget

**Acceptance Criteria:**
- [x] Backend endpoint supports bulk creation of items with source estimate tracking
- [ ] UI for selecting and importing items from project estimates
- [ ] Source estimate item IDs are preserved for traceability

**Priority:** Should Have  
**Status:** Partially Implemented (backend only)

---

### 3. Financial Calculations

#### US-PO020: GST Calculations
**As a** project manager  
**I want to** see accurate GST calculations on my purchase orders  
**So that** I can track tax-inclusive and tax-exclusive costs correctly

**Acceptance Criteria:**
- [x] PO supports three GST modes: inclusive, exclusive, GST-free
- [x] GST toggle on the detail page controls whether GST is included in totals
- [x] Individual items can be marked as GST-free (exempt from 10% GST)
- [x] Subtotal, GST amount (10%), and total are auto-calculated and displayed
- [x] All financial values are stored in cents (integer) for precision
- [x] Currency is displayed in AUD format

**Priority:** Must Have  
**Status:** Implemented

---

### 4. PO List View

#### US-PO030: View Purchase Orders List
**As a** builder/owner  
**I want to** see all purchase orders in a searchable, filterable table  
**So that** I can quickly find and manage orders across my projects

**Acceptance Criteria:**
- [x] Table displays: PO number, name, type, project, supplier, date, status, amount
- [x] Real-time search across PO number, name, description, project name, and supplier name
- [x] Filter by PO type (All / Main / Site) via tab-style selector
- [x] Filter by status with count badges
- [x] Filter by supplier via dropdown
- [x] Filter by project (when not in project context)
- [x] Project-level view shows only POs for that project

**Priority:** Must Have  
**Status:** Implemented

---

#### US-PO031: Customise Table Columns
**As a** project manager  
**I want to** customise which columns are visible, their order, and their widths  
**So that** I can tailor the view to show the information most relevant to me

**Acceptance Criteria:**
- [x] Column visibility toggles via a columns popover
- [x] Column order customisation via drag-and-drop in the popover
- [x] Column width resizing by dragging column borders
- [x] Column preferences persist in local storage
- [x] Hidden column count indicator on the columns button

**Priority:** Should Have  
**Status:** Implemented

---

#### US-PO032: Status Filter Alignment
**As a** project manager  
**I want to** filter by all possible PO statuses  
**So that** I can find orders in any stage of the workflow

**Acceptance Criteria:**
- [ ] Status filter tabs match the full status enum: Draft, Pending Approval, Sent, Acknowledged, Accepted, Partially Received, Completed, Billed, Cancelled
- [x] Status counts are displayed next to each filter tab

**Priority:** Should Have  
**Status:** Not Implemented (list page currently shows only 5 of 9 statuses)

---

### 5. PO Workflow & Sending

#### US-PO040: Send PO to Supplier
**As a** project manager  
**I want to** send a purchase order to the supplier  
**So that** they receive the formal order and can begin fulfilling it

**Acceptance Criteria:**
- [x] "Send to Supplier" button visible on draft POs
- [x] Backend endpoint updates status to "sent", records sent timestamp and email
- [ ] Send action triggers an email notification to the supplier with PO details
- [ ] Confirmation dialog before sending
- [ ] PO becomes locked (read-only) after sending

**Priority:** Must Have  
**Status:** Partially Implemented (backend route exists, frontend button not wired)

---

#### US-PO041: Approval Workflow for Site POs
**As a** builder/owner  
**I want to** require approval for site POs above a certain value  
**So that** I can control spending and prevent unauthorised purchases

**Acceptance Criteria:**
- [x] PO schema supports: requiresApproval flag, approval threshold (cents), approvedById, approvedAt
- [ ] Site POs above the threshold automatically move to "Pending Approval" status
- [ ] Authorised users can approve or reject pending POs
- [ ] Approved POs can then be sent to the supplier
- [ ] Auto-approve for POs below the threshold

**Priority:** Should Have  
**Status:** Partially Implemented (schema only, no UI workflow)

---

#### US-PO042: Status Progression
**As a** project manager  
**I want to** track the status of a purchase order through its lifecycle  
**So that** I know where each order stands

**Acceptance Criteria:**
- [x] Status badge displayed on list and detail views with colour coding
- [x] UI currently supports 5 statuses: Draft, Sent, Approved, Received, Cancelled
- [ ] Expand UI to support the full 9-status enum: Draft, Pending Approval, Sent, Acknowledged, Accepted, Partially Received, Completed, Billed, Cancelled
- [ ] Status transitions enforced (e.g., cannot go from Draft to Completed)
- [ ] Status change history/audit trail

**Priority:** Must Have  
**Status:** Partially Implemented (5 of 9 statuses displayed in UI, transitions not enforced)

---

### 6. Supplier E-Signature

#### US-PO050: Request Supplier Signature
**As a** project manager  
**I want to** send a signature request to the supplier  
**So that** they can formally acknowledge and accept the purchase order

**Acceptance Criteria:**
- [x] Backend generates a unique, time-limited token for the supplier
- [x] Backend sends an email with a link to the signature portal
- [ ] UI button/action on the detail page to request a signature
- [ ] Signature request records the supplier's email

**Priority:** Should Have  
**Status:** Partially Implemented (backend route exists, no UI trigger)

---

#### US-PO051: Supplier Signature Portal
**As a** supplier  
**I want to** view the purchase order details and submit my signature  
**So that** I can formally accept the order

**Acceptance Criteria:**
- [x] Backend endpoints exist: fetch PO for signing via token, submit signature
- [x] Signature schema supports: name, email, role, signature image, audit trail (IP, user agent, timestamp)
- [x] Token-based access with expiry for security
- [ ] Frontend portal page for suppliers to view PO and submit signature
- [ ] Portal displays PO details and line items in a clean read-only layout

**Priority:** Should Have  
**Status:** Partially Implemented (backend endpoints exist, no frontend portal page)

---

### 7. Attachments

#### US-PO060: Upload Attachments
**As a** project manager  
**I want to** attach files and photos to a purchase order  
**So that** I can include supporting documents, receipts, or delivery photos

**Acceptance Criteria:**
- [x] Backend supports creating and deleting attachments with file metadata
- [x] Attachments can be flagged as receipts (for OCR processing)
- [x] OCR data stored for receipt attachments (via Mindee integration)
- [ ] File upload UI on the purchase order detail page
- [ ] Attachment list with preview, download, and delete actions

**Priority:** Should Have  
**Status:** Partially Implemented (backend only, no UI)

---

### 8. Templates

#### US-PO070: Manage PO Templates
**As a** office admin  
**I want to** create and manage reusable purchase order templates  
**So that** I can standardise common orders and speed up PO creation

**Acceptance Criteria:**
- [x] Templates page lists all templates for the company
- [x] Create a template with: name, description, category, scope, default items
- [x] Edit and update existing templates
- [x] Delete templates
- [x] Templates can have favourite cost codes for quick selection (for site POs)
- [x] Templates organised by category (using template categories system)
- [x] Template detail page with full editing

**Priority:** Should Have  
**Status:** Implemented

---

#### US-PO071: Apply Template to New PO
**As a** project manager  
**I want to** apply a template when creating a new purchase order  
**So that** the scope and items are pre-filled, saving me time

**Acceptance Criteria:**
- [ ] Template selector available during or after PO creation
- [ ] Applying a template populates scope, terms, and line items
- [ ] User can modify pre-filled content after applying the template

**Priority:** Should Have  
**Status:** Not Implemented

---

### 9. Subcontractor PO Generation

#### US-PO080: Generate POs from Subcontractor Timesheets
**As a** project manager  
**I want to** generate purchase orders from approved subcontractor timesheets  
**So that** I can formalise payment for subcontractor work based on their logged hours

**Acceptance Criteria:**
- [x] Dialog shows subcontractor timesheets awaiting PO generation
- [x] User can select multiple timesheets for batch PO creation
- [x] User selects a project for the generated PO
- [x] Line items are created from timesheet data with source tracking

**Priority:** Should Have  
**Status:** Implemented

---

### 10. Print & Export

#### US-PO090: Print / PDF Export
**As a** project manager  
**I want to** generate a professional PDF of the purchase order  
**So that** I can print it or send it as a formal document

**Acceptance Criteria:**
- [ ] "Print / PDF" action available in the detail page actions menu
- [ ] PDF includes: PO number, supplier details, project details, scope, line items, totals, T&Cs
- [ ] PDF is branded with company details
- [ ] PDF can be downloaded or opened in a new tab for printing

**Priority:** Must Have  
**Status:** Not Implemented (action button exists but not wired)

---

#### US-PO091: Email PO to Supplier
**As a** project manager  
**I want to** email the purchase order directly to the supplier  
**So that** I can send it without leaving the application

**Acceptance Criteria:**
- [ ] "Email to Supplier" action available in the detail page actions menu
- [ ] Email includes PO PDF as an attachment
- [ ] Supplier email is pre-filled from the contact record
- [ ] Email sending is recorded on the PO (sentAt, sentToEmail)

**Priority:** Must Have  
**Status:** Not Implemented (action button exists but not wired)

---

### 11. Settings & Configuration

#### US-PO100: Company PO Number Configuration
**As a** builder/owner  
**I want to** configure the PO numbering prefix and starting number  
**So that** PO numbers match my company's conventions

**Acceptance Criteria:**
- [x] Company settings include PO prefix (default "PO-") and start number (default 1000)
- [x] PO numbers follow the format: {prefix}{year}-{sequential} (e.g., PO-2025-001)
- [x] Separate numbering for main POs and site POs

**Priority:** Should Have  
**Status:** Implemented

---

### 12. Permissions

#### US-PO110: Role-Based Access Control
**As a** builder/owner  
**I want to** control who can view, create, edit, and delete purchase orders  
**So that** I can restrict access based on team roles

**Acceptance Criteria:**
- [x] Purchase orders permission defined in Roles & Permissions: view, add, edit, delete
- [x] Permission key: `financial.purchase_orders`
- [x] Built-in admin roles bypass permission checks
- [ ] Permission checks enforced on all frontend actions and backend routes

**Priority:** Must Have  
**Status:** Partially Implemented (permissions defined, enforcement may be incomplete)

---

## Technical Notes

### Data Model
- Financial values stored in cents (integer) for precision — displayed as AUD currency
- Supplier linked via `contacts` table (contactType = 'supplier' or 'subcontractor')
- Source tracking: POs can be traced back to estimates (`sourceEstimateId`) and RFQ quotes (`sourceQuoteIds`)
- Cost codes on line items link to the budget tracking system
- Scope stage linking (`scopeStageId`) enables PO display within the project scope view
- Line items support source tracking from timesheets (`sourceTimesheetId`) for subcontractor PO generation

### API Routes
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/purchase-orders` | List POs (filters: projectId, status, poType) |
| GET | `/api/purchase-orders/:id` | Get single PO |
| GET | `/api/purchase-orders/next-number/:type` | Get next PO number |
| POST | `/api/purchase-orders` | Create PO |
| PATCH | `/api/purchase-orders/:id` | Update PO |
| DELETE | `/api/purchase-orders/:id` | Delete PO |
| POST | `/api/purchase-orders/:id/send` | Send PO to supplier |
| GET | `/api/purchase-orders/:poId/items` | List PO items |
| POST | `/api/purchase-orders/:poId/items` | Create item |
| POST | `/api/purchase-orders/:poId/items/bulk` | Bulk create items |
| POST | `/api/purchase-orders/:poId/items/reorder` | Reorder items |
| PATCH | `/api/purchase-order-items/:id` | Update item |
| DELETE | `/api/purchase-order-items/:id` | Delete item |
| GET | `/api/purchase-orders/:poId/attachments` | List attachments |
| POST | `/api/purchase-orders/:poId/attachments` | Create attachment |
| DELETE | `/api/purchase-order-attachments/:id` | Delete attachment |
| GET | `/api/purchase-orders/:poId/signatures` | List signatures |
| POST | `/api/purchase-orders/:poId/request-signature` | Request signature |
| GET | `/api/purchase-orders/sign/:token` | Get PO for signing (public) |
| POST | `/api/purchase-orders/sign/:token` | Submit signature (public) |
| GET | `/api/purchase-order-templates` | List templates |
| GET | `/api/purchase-order-templates/:id` | Get template |
| POST | `/api/purchase-order-templates` | Create template |
| PATCH | `/api/purchase-order-templates/:id` | Update template |
| DELETE | `/api/purchase-order-templates/:id` | Delete template |

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/purchase-orders` | PurchaseOrders | Business-level PO list |
| `/purchase-orders/new` | PurchaseOrderDetail | Create new PO |
| `/purchase-orders/:id` | PurchaseOrderDetail | PO detail/edit |
| `/projects/:projectId/purchase-orders` | Dashboard | Project-level PO list (via dashboard tab) |
| `/projects/:projectId/purchase-orders/new` | PurchaseOrderDetail | Create project PO |
| `/projects/:projectId/purchase-orders/:poId` | PurchaseOrderDetail | Project PO detail |
| `/po-templates` | POTemplates | Template list |
| `/po-templates/:templateId` | POTemplateDetail | Template detail |

---

## Known Issues

1. **Status filter mismatch** — List page shows 5 status options (draft, sent, approved, received, cancelled) but the schema defines 9 statuses. Needs alignment.
2. **Stubbed actions on detail page** — Print/PDF, Email to Supplier, Duplicate, and Send to Supplier buttons exist but have empty onClick handlers.
3. **No supplier picker** — Detail page displays supplier info but has no way to select or change the supplier.
4. **No attachment UI** — Backend supports attachments but no upload/view interface on the detail page.
5. **No signature request UI** — Backend supports signature workflow but no trigger button on the detail page.
6. **Template application** — Templates can be managed but cannot be applied to a new PO from the creation flow.

---

## Document Change Log

| Date | Changes |
|------|---------|
| 2026-02-19 | Initial user story document created based on current implementation analysis |

---

## Summary: Implementation Coverage

| Area | Stories | Implemented | Partial | Not Started |
|------|---------|-------------|---------|-------------|
| Creation & Management | 5 | 3 | 2 | 0 |
| Line Items | 4 | 3 | 1 | 0 |
| Financial Calculations | 1 | 1 | 0 | 0 |
| List View | 3 | 2 | 0 | 1 |
| Workflow & Sending | 3 | 0 | 3 | 0 |
| Supplier E-Signature | 2 | 0 | 2 | 0 |
| Attachments | 1 | 0 | 1 | 0 |
| Templates | 2 | 1 | 0 | 1 |
| Subcontractor PO | 1 | 1 | 0 | 0 |
| Print & Export | 2 | 0 | 0 | 2 |
| Settings | 1 | 1 | 0 | 0 |
| Permissions | 1 | 0 | 1 | 0 |
| **Total** | **26** | **12** | **10** | **4** |
