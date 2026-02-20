# Requests for Quotation (RFQs) - User Stories

## Epic Overview
Requests for Quotation (RFQs) enable builders to request competitive pricing from multiple suppliers for materials and services. The system supports the full RFQ lifecycle: creation with line items from estimates, sending to multiple suppliers simultaneously, receiving and comparing quotes, follow-up reminders, supplier portal access for online quote submission, PDF generation, and reusable templates. RFQs integrate with the contacts system for supplier management and estimates for item sourcing.

## Business Value
For Australian residential builders, getting competitive pricing from suppliers is critical for maintaining project margins. The RFQ system streamlines the procurement process by allowing builders to send standardised quote requests to multiple suppliers, compare responses side-by-side, and accept the best offer. Automated follow-ups ensure suppliers respond on time. The supplier portal reduces back-and-forth communication by letting suppliers submit quotes directly into the system. Templates save time on recurring procurement needs.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/Owner | Business owner, manages multiple projects | Review quotes, compare pricing, approve suppliers |
| Project Manager | Manages specific projects | Create RFQs, send to suppliers, track responses |
| Estimator | Dedicated costing role | Generate RFQs from estimate items, compare pricing |
| Office Admin | Administrative support | Manage templates, track follow-ups, process quotes |
| Supplier | External supplier/subcontractor | View RFQ details, submit quotes via portal |

## User Stories

### US-RQ001: View All RFQs
**As a** Builder/Owner, **I want to** view a list of all RFQs across projects, **so that** I can monitor the procurement pipeline.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display RFQs in a table with number, title, project, suppliers, due date, status, and created date columns
- [ ] Support text search across title, number, and supplier names
- [ ] Support status filter dropdown (all, draft, sent, confirmed, quoted, accepted, declined, expired)
- [ ] Show RFQ count badge per status
- [ ] When accessed within project context, filter to that project and hide project column

---

### US-RQ002: View Empty State
**As a** Project Manager, **I want to** see a helpful empty state when no RFQs exist, **so that** I understand how to get started with procurement.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display icon, heading, and description when no RFQs exist
- [ ] Show "Create New RFQ" primary button
- [ ] Show "Create from Estimate" secondary button
- [ ] Distinguish between no RFQs at all and no matching search/filter results

---

### US-RQ003: Create New RFQ
**As a** Project Manager, **I want to** create a new RFQ for a project, **so that** I can request quotes from suppliers for specific scope items.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Auto-generate RFQ number based on company prefix settings (e.g. "XXXX-RFQ-XXX")
- [ ] Set title and description for the RFQ
- [ ] Set scope of work using rich text editor for formatted content
- [ ] Set response due date and work deadline
- [ ] Default status to "draft"
- [ ] Link RFQ to a project
- [ ] Navigate to RFQ detail page after creation

---

### US-RQ004: Select Multiple Suppliers
**As a** Project Manager, **I want to** select multiple suppliers for an RFQ, **so that** I can get competitive pricing from several sources.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Supplier selection popover with search functionality
- [ ] Multi-select checkboxes for suppliers from contacts with supplier/subcontractor type
- [ ] Display selected supplier names as removable badges
- [ ] Store supplierIds and supplierNames arrays on the RFQ record
- [ ] Each selected supplier receives their own portal access token

---

### US-RQ005: Add RFQ Line Items Manually
**As a** Project Manager, **I want to** add line items to an RFQ manually, **so that** I can specify exactly what I need quoted.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add items via dialog with description, quantity, unit, and notes fields
- [ ] Display items in a table with ordering support
- [ ] Edit and delete individual items inline
- [ ] Each item has a unique ID linked to the parent RFQ

---

### US-RQ006: Import Items from Estimate
**As an** Estimator, **I want to** import estimate items into an RFQ, **so that** I can quickly create quote requests from existing project estimates.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Import dialog showing project estimate items available for selection
- [ ] Multi-select estimate items to import
- [ ] Copy description, quantity, and unit from estimate items
- [ ] Store estimateItemId reference on each imported RFQ item for traceability
- [ ] Show success toast with count of imported items

---

### US-RQ007: Edit RFQ Line Items
**As a** Project Manager, **I want to** edit RFQ line items, **so that** I can correct quantities, descriptions, or units before sending.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit item via inline editing or edit dialog
- [ ] Update description, quantity, unit, and notes
- [ ] Persist changes via PATCH /api/rfq-items/:id
- [ ] Refresh item totals after editing

---

### US-RQ008: Delete RFQ Line Items
**As a** Project Manager, **I want to** remove line items from an RFQ, **so that** I can correct the scope of the request.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete individual items via delete button with confirmation
- [ ] Refresh items list after deletion
- [ ] Delete via DELETE /api/rfq-items/:id

---

### US-RQ009: Edit RFQ Details
**As a** Project Manager, **I want to** edit RFQ header details, **so that** I can update the request information before sending.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Inline editing of title
- [ ] Edit description and scope of work with rich text editor
- [ ] Update due date and deadline via date pickers
- [ ] Track unsaved changes with visible "Save" button
- [ ] Show RFQ number and status badge in header
- [ ] Add and manage file attachments (attachmentUrls and attachmentFileNames arrays)

---

### US-RQ010: Set Terms and Conditions
**As a** Builder/Owner, **I want to** set terms and conditions on an RFQ, **so that** suppliers understand the commercial engagement terms.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select from saved RFQ terms templates via termsTemplateId
- [ ] Auto-populate customTerms text from selected template
- [ ] Support custom terms text entry for one-off modifications
- [ ] Terms displayed on the supplier portal and in generated PDF

---

### US-RQ011: Add Internal Notes
**As a** Project Manager, **I want to** add internal notes to an RFQ, **so that** I can record team-only information not visible to suppliers.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Internal notes text field on the RFQ detail page
- [ ] Notes stored as internalNotes on the RFQ record
- [ ] Notes not visible on the supplier portal or generated PDF
- [ ] Persist via save action

---

### US-RQ012: Mark RFQ as External
**As a** Project Manager, **I want to** mark an RFQ as external, **so that** I can track quotes received outside the system (phone, email, etc.).

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle switch for isExternal flag on the RFQ form
- [ ] External RFQs can have manually entered quote data
- [ ] Display "External" badge in the RFQ header
- [ ] External flag stored on the RFQ record

---

### US-RQ013: Generate RFQ PDF
**As a** Project Manager, **I want to** generate a PDF version of the RFQ, **so that** I can share a formal document via email or print for suppliers.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Generate PDF using @react-pdf/renderer with RFQDocument component
- [ ] Include company details, RFQ number, title, scope, line items, terms, and due date
- [ ] Preview toggle to show/hide PDF preview inline
- [ ] Download button for saving PDF file locally
- [ ] PDF URL stored on the RFQ record (pdfUrl)

---

### US-RQ014: Send RFQ to Suppliers
**As a** Project Manager, **I want to** send an RFQ to selected suppliers, **so that** they can review the scope and provide their quotes.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Send button opens SendRFQDialog with supplier selection and message customisation
- [ ] Attach generated PDF to outgoing communication
- [ ] Update RFQ status to "sent"
- [ ] Record sentAt timestamp on the RFQ
- [ ] Generate portal tokens for each supplier
- [ ] Validation ensures at least one supplier and line items exist before sending

---

### US-RQ015: Upload Supplier Quote
**As a** Project Manager, **I want to** upload a quote received from a supplier, **so that** I can record and compare their pricing.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Upload quote dialog (UploadQuoteDialog component) with file selection
- [ ] Associate quote with specific supplier from the RFQ
- [ ] Store quote details including pricing per item in rfqQuotes table
- [ ] Include total amount, notes, and file attachments on the quote
- [ ] Update RFQ status to "quoted" when first quote is received

---

### US-RQ016: Compare Supplier Quotes
**As a** Builder/Owner, **I want to** compare quotes from multiple suppliers side by side, **so that** I can select the best value offer.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] QuoteComparisonView component with side-by-side layout
- [ ] Line-by-line pricing comparison across all quoting suppliers
- [ ] Highlight lowest price per item for easy identification
- [ ] Show total quote amounts per supplier
- [ ] Support accept/decline actions directly from comparison view

---

### US-RQ017: Accept Supplier Quote
**As a** Builder/Owner, **I want to** accept a supplier's quote, **so that** I can proceed with procurement from the selected supplier.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Accept action available on individual quotes
- [ ] Update RFQ status to "accepted"
- [ ] Record which supplier's quote was accepted
- [ ] Only one quote can be accepted per RFQ

---

### US-RQ018: Decline Supplier Quote
**As a** Builder/Owner, **I want to** decline a supplier's quote, **so that** I can document the decision and notify unsuccessful suppliers.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Decline action available on individual quotes
- [ ] Update quote status to "declined"
- [ ] RFQ status updated to "declined" if all quotes are declined

---

### US-RQ019: Configure Follow-Up Reminders
**As a** Project Manager, **I want to** set up automatic follow-up reminders, **so that** suppliers are reminded to respond before the deadline.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle followUpEnabled switch on RFQ detail
- [ ] Set followUpDaysBefore (number of days before due date to send reminder)
- [ ] Store follow-up configuration on the RFQ record
- [ ] Track followUpSentAt timestamp when reminder is sent
- [ ] Follow-up records stored in rfqFollowUps table with supplier and message details

---

### US-RQ020: Supplier Portal Access
**As a** Supplier, **I want to** access an RFQ via a unique portal link, **so that** I can view details and submit my quote online without needing login credentials.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Generate unique portal token per supplier per RFQ
- [ ] Public portal page (RFQPortal.tsx) accessible without authentication
- [ ] Display RFQ title, description, scope, line items, terms, and due date
- [ ] Allow supplier to submit their quote through the portal form
- [ ] Tokens stored in rfqPortalTokens table with expiry tracking

---

### US-RQ021: Create RFQ Templates
**As an** Office Admin, **I want to** create reusable RFQ templates, **so that** I can standardise recurring procurement requests.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Template list page (RfqTemplates.tsx) with search and filtering
- [ ] Create templates with name, description, default scope, terms, and line items
- [ ] Templates are company-scoped
- [ ] Full CRUD operations via /api/rfq-templates
- [ ] Template detail page (RfqTemplateDetail.tsx) with editing

---

### US-RQ022: Apply RFQ Template
**As a** Project Manager, **I want to** apply a saved template when creating an RFQ, **so that** I can save time on standard procurement requests.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Template selection dropdown when creating or editing an RFQ
- [ ] Auto-populate scope, terms, and line items from selected template
- [ ] User can modify pre-populated data before saving or sending

---

### US-RQ023: RFQ Status Workflow
**As a** Project Manager, **I want to** track the status of each RFQ through its lifecycle, **so that** I know which RFQs need attention.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status values: Draft, Sent, Confirmed, Quoted, Accepted, Declined, Expired
- [ ] Status badges with appropriate colours (draft: secondary, sent: blue, confirmed: green, quoted: amber, accepted: green, declined: red, expired: muted)
- [ ] Status transitions enforced logically
- [ ] Status filters and count badges on the RFQ list page

---

### US-RQ024: Navigate RFQs within Project Context
**As a** Project Manager, **I want to** view RFQs scoped to a specific project, **so that** I can see procurement activity for that project only.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Filter by projectId from URL params when accessed from project context
- [ ] Hide project column in table when viewing project-level RFQs
- [ ] Project-aware navigation paths for create and detail views
- [ ] Show project name in page header/breadcrumb

---

### US-RQ025: Attach Files to RFQ
**As a** Project Manager, **I want to** attach files (plans, specs, drawings) to an RFQ, **so that** suppliers have all the information they need to quote accurately.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] File upload with click or drag-and-drop support
- [ ] Multiple file attachments per RFQ
- [ ] Attachment URLs and file names stored as arrays (attachmentUrls, attachmentFileNames)
- [ ] Attachments visible on the RFQ detail page and supplier portal
- [ ] File download and preview available

---

## Technical Notes
- RFQ numbers auto-generated based on company prefix settings (e.g. "XXXX-RFQ-XXX")
- Multi-supplier support via supplierIds and supplierNames PostgreSQL arrays
- PDF generation uses @react-pdf/renderer with RFQDocument component
- Supplier portal uses token-based authentication (no login required) via rfqPortalTokens
- Follow-up reminders tracked with rfqFollowUps table and scheduled processing
- Quote comparison renders side-by-side with QuoteComparisonView component
- Send dialog (SendRFQDialog) handles distribution to suppliers
- Upload quote dialog (UploadQuoteDialog) handles file-based quote entry
- RFQ items can reference estimateItemId for traceability back to estimates
- Scope field supports rich text content via RichTextEditor component
- All financial values in quotes stored in cents (integer) for precision
- Status workflow: Draft -> Sent -> Confirmed -> Quoted -> Accepted/Declined/Expired

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/rfqs | List RFQs (with optional projectId filter) |
| POST | /api/rfqs | Create a new RFQ |
| GET | /api/rfqs/:id | Get a single RFQ |
| PATCH | /api/rfqs/:id | Update an RFQ |
| DELETE | /api/rfqs/:id | Delete an RFQ (cascades to items, quotes, follow-ups, tokens) |
| GET | /api/rfq-items | Get items for an RFQ (by rfqId query param) |
| POST | /api/rfq-items | Create an RFQ item |
| PATCH | /api/rfq-items/:id | Update an RFQ item |
| DELETE | /api/rfq-items/:id | Delete an RFQ item |
| GET | /api/rfqs/:id/quotes | Get quotes for an RFQ |
| POST | /api/rfq-quotes | Submit a quote |
| PATCH | /api/rfq-quotes/:id | Update a quote |
| DELETE | /api/rfq-quotes/:id | Delete a quote |
| GET | /api/rfq-follow-ups | Get follow-ups (by rfqId query param) |
| POST | /api/rfq-follow-ups | Create a follow-up record |
| PATCH | /api/rfq-follow-ups/:id | Update a follow-up |
| DELETE | /api/rfq-follow-ups/:id | Delete a follow-up |
| GET | /api/rfq-portal-tokens | Get portal tokens (by rfqId query param) |
| POST | /api/rfq-portal-tokens | Generate a portal token |
| DELETE | /api/rfq-portal-tokens/:id | Delete a portal token |
| GET | /api/rfq-templates | List RFQ templates |
| POST | /api/rfq-templates | Create a template |
| GET | /api/rfq-templates/:id | Get a template |
| PATCH | /api/rfq-templates/:id | Update a template |
| DELETE | /api/rfq-templates/:id | Delete a template |
| GET | /api/portal/:token | Access supplier portal (public, token-based) |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /rfqs | RFQs.tsx | Business-level RFQ list with search and filters |
| /rfqs/new | CreateRFQ.tsx | Create new RFQ |
| /rfqs/:id | RFQDetail.tsx | RFQ detail with items, quotes, attachments, and settings |
| /rfq-templates | RfqTemplates.tsx | RFQ templates list |
| /rfq-templates/:id | RfqTemplateDetail.tsx | RFQ template detail/edit |
| /projects/:projectId/rfqs | RFQs.tsx | Project-scoped RFQ list |
| /projects/:projectId/rfqs/new | CreateRFQ.tsx | Create RFQ within project context |
| /projects/:projectId/rfqs/:id | RFQDetail.tsx | Project-scoped RFQ detail |
| /portal/rfq/:token | RFQPortal.tsx | Supplier portal (public, no auth required) |

## Known Issues / Future Enhancements
- [ ] Email notification to suppliers when RFQ is sent (currently portal link only)
- [ ] Automatic expired status based on due date passing
- [ ] Email tracking (read receipts) for sent RFQs
- [ ] Automatic quote data extraction from uploaded documents via OCR
- [ ] Supplier rating/performance tracking based on quote response history
- [ ] Integration with purchase orders for converting accepted quotes to POs
- [ ] Bulk send RFQs to supplier panels/groups
- [ ] Quote revision support (supplier submits updated quote)

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 25
- Implemented: 25
- Partially Implemented: 0
- Not Implemented: 0
