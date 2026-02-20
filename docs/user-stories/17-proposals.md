# Proposals (Client Proposals/Quotes) - User Stories

## Epic Overview
The Proposals system allows builders to create professional client-facing proposals and quotations from project estimates. Proposals are structured with customisable sections (cover page, scope, pricing, terms), support optional line items, and provide a complete client interaction workflow including viewing, acceptance with digital signature, and rejection with reason tracking. Proposals can be converted to invoices after acceptance and exported as branded PDFs for presentation.

## Business Value
For Australian residential builders, presenting a professional proposal is the critical step between estimating and winning a project. The Proposals system transforms detailed internal estimates into polished client documents with configurable pricing visibility, optional items for upselling, and a digital acceptance workflow that eliminates paperwork. Tracking when proposals are viewed, accepted, or rejected provides valuable sales pipeline insights. Automatic conversion to invoices after acceptance streamlines the transition from quoting to billing.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/Owner | Business owner, manages multiple projects | Review proposals, control pricing presentation, track win rates |
| Project Manager | Manages specific projects | Create proposals from estimates, present to clients, track responses |
| Office Admin | Administrative support | Generate PDFs, manage templates, process acceptances |
| Client/Homeowner | Project client | Review proposal, select optional items, accept or reject with signature |

## User Stories

### US-PR001: View All Proposals
**As a** Builder/Owner, **I want to** view a list of all proposals across projects, **so that** I can monitor the sales pipeline and track proposal statuses.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display proposals in a table with proposal number, name, project, client, total amount, status, and dates
- [ ] Support text search across proposal number, name, and client name
- [ ] Support status filter (all, draft, sent, viewed, accepted, rejected, expired)
- [ ] Show proposal count badges per status
- [ ] Show total amounts per status
- [ ] Click row to navigate to proposal detail

---

### US-PR002: Create a Proposal
**As a** Project Manager, **I want to** create a new proposal for a project, **so that** I can present pricing and scope to a client.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Auto-generate unique proposal number based on company prefix settings
- [ ] Set proposal name and link to a project
- [ ] Select source estimate (estimateId) to import pricing data
- [ ] Select client (clientId) from project contacts
- [ ] Default status to "draft"
- [ ] Navigate to proposal detail page after creation

---

### US-PR003: Create Proposal from Estimate
**As a** Project Manager, **I want to** generate a proposal directly from a completed estimate, **so that** I can quickly convert internal costing into a client-facing document.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select estimate as the source for the proposal
- [ ] Import estimate groups as proposal sections with estimateGroupId reference
- [ ] Import estimate items as proposal items with pricing
- [ ] Respect proposal visibility flags on estimate items (proposalVisible, shownAs)
- [ ] Financial totals (subtotal, GST, total) calculated from imported items

---

### US-PR004: Edit Proposal Details
**As a** Project Manager, **I want to** edit the proposal header details, **so that** I can customise the document before sending to the client.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit proposal name
- [ ] Set introduction text (intro) for the proposal opening
- [ ] Set closing text for the proposal conclusion
- [ ] Set terms and conditions
- [ ] Set expiry date for the proposal validity period
- [ ] Configure showPricing toggle to show/hide pricing from client
- [ ] Configure allowClientOptions toggle to let clients select optional items
- [ ] Changes saved via Save button with validation

---

### US-PR005: Delete a Proposal
**As a** Project Manager, **I want to** delete a proposal that is no longer needed, **so that** I can keep the proposals list organised.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete proposal via API with cascade deletion of sections, items, and acceptances
- [ ] Confirmation dialog before deletion
- [ ] Redirect to proposals list after deletion

---

### US-PR006: Proposal Status Workflow
**As a** Project Manager, **I want to** track each proposal through a defined status workflow, **so that** I know which proposals need follow-up.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status values: Draft, Sent, Viewed, Accepted, Rejected, Expired
- [ ] Draft: proposal being prepared
- [ ] Sent: proposal sent to client (sentDate recorded)
- [ ] Viewed: client has opened the proposal (viewedDate recorded)
- [ ] Accepted: client has accepted with signature (acceptedDate, acceptedByName, acceptedByEmail recorded)
- [ ] Rejected: client has declined (rejectedDate, rejectedReason recorded)
- [ ] Expired: proposal past expiry date
- [ ] Status badges with appropriate colours on list and detail views

---

### US-PR007: Manage Proposal Sections
**As a** Project Manager, **I want to** organise the proposal into sections, **so that** the document has a clear structure for the client.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add sections with type (cover, scope, estimate, terms, custom), title, and content
- [ ] Set sort order for section sequencing
- [ ] Link sections to estimate groups via estimateGroupId for pricing sections
- [ ] Configure showPrices and showQuantities per section
- [ ] Edit section title and content
- [ ] Delete sections
- [ ] Reorder sections via drag-and-drop or sort order adjustment

---

### US-PR008: Manage Proposal Items
**As a** Project Manager, **I want to** manage line items within proposal sections, **so that** I can present a detailed breakdown of scope and pricing.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add items with description, quantity, unit, unit price, and total price
- [ ] All financial values stored in cents (integer) for precision
- [ ] Items linked to proposal sections
- [ ] Edit item details inline
- [ ] Delete items from sections
- [ ] Items support sort ordering within sections

---

### US-PR009: Optional Items
**As a** Project Manager, **I want to** mark certain proposal items as optional, **so that** clients can choose add-on items beyond the base scope.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] isOptional flag on proposal items
- [ ] isSelected flag tracks whether client has chosen optional items
- [ ] Optional items visually distinguished in the proposal
- [ ] When allowClientOptions is enabled, clients can toggle optional item selection
- [ ] Total recalculated based on selected optional items

---

### US-PR010: Pricing Display Controls
**As a** Builder/Owner, **I want to** control how pricing is displayed in the proposal, **so that** I can choose between showing detailed line item pricing or just the total.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] showPricing toggle on the proposal: when disabled, hides all pricing from client view
- [ ] showPrices per section: control pricing visibility at section level
- [ ] showQuantities per section: control quantity visibility at section level
- [ ] Total amount always shown even when line item prices are hidden
- [ ] Builder always sees full pricing regardless of client visibility settings

---

### US-PR011: Financial Calculations
**As a** Project Manager, **I want to** proposal totals to be automatically calculated, **so that** financial figures are always accurate.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Subtotal calculated from all non-optional items plus selected optional items
- [ ] GST amount calculated at 10% (Australian standard rate)
- [ ] Total amount = subtotal + GST amount
- [ ] All values stored in cents (integer) for precision
- [ ] Currency displayed in AUD format
- [ ] Totals update when items are added, removed, or modified

---

### US-PR012: Send Proposal to Client
**As a** Project Manager, **I want to** send a proposal to the client, **so that** they can review and respond.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Send action updates status to "sent"
- [ ] sentDate timestamp recorded
- [ ] Client receives link to view the proposal
- [ ] Proposal becomes read-only for major structural changes after sending

---

### US-PR013: Client Views Proposal
**As a** Client/Homeowner, **I want to** view the proposal online, **so that** I can review the scope and pricing before making a decision.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Client accesses proposal via shared link
- [ ] viewedDate recorded when client first opens the proposal
- [ ] Proposal status updates to "viewed"
- [ ] Pricing displayed according to builder's visibility settings
- [ ] Optional items shown with selection toggles when allowClientOptions is enabled

---

### US-PR014: Client Accepts Proposal
**As a** Client/Homeowner, **I want to** accept the proposal with my digital signature, **so that** I can formally agree to the scope and pricing.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Accept action with digital signature capture
- [ ] Record acceptedDate timestamp
- [ ] Record acceptedByName and acceptedByEmail
- [ ] Store signature data on the proposal
- [ ] Status updates to "accepted"
- [ ] Acceptance record created in proposalAcceptances table
- [ ] Confirmation shown to client after acceptance

---

### US-PR015: Client Rejects Proposal
**As a** Client/Homeowner, **I want to** reject the proposal with a reason, **so that** the builder understands why I'm not proceeding.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Reject action with required reason text field
- [ ] Record rejectedDate timestamp
- [ ] Record rejectedReason text
- [ ] Status updates to "rejected"
- [ ] Builder notified of rejection with reason

---

### US-PR016: Proposal Expiry
**As a** Builder/Owner, **I want to** set an expiry date on proposals, **so that** pricing is only valid for a defined period.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Expiry date field (expiryDate) on the proposal
- [ ] Proposals past expiry date can be marked as "expired"
- [ ] Expired proposals cannot be accepted
- [ ] Expiry date displayed prominently on the proposal

---

### US-PR017: Generate Proposal PDF
**As a** Project Manager, **I want to** generate a branded PDF of the proposal, **so that** I can share a professional document with the client.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] PDF generation using @react-pdf/renderer with ProposalDocument component
- [ ] Includes cover page with company branding (CoverPage/CoverPageSection components)
- [ ] Includes estimate sections with pricing (EstimateSection component)
- [ ] Includes terms and conditions
- [ ] PDF preview toggle (PDFPreview component)
- [ ] Download button for saving PDF locally
- [ ] Section-based layout matching the proposal structure

---

### US-PR018: Convert Accepted Proposal to Invoice
**As a** Office Admin, **I want to** convert an accepted proposal into an invoice, **so that** I can begin the billing process without re-entering data.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Convert action available on accepted proposals
- [ ] Creates a new invoice with items and amounts from the proposal
- [ ] convertedToInvoiceId stored on the proposal for cross-reference
- [ ] Proposal items mapped to invoice line items
- [ ] Client details carried over to the invoice

---

### US-PR019: Archive Proposals
**As a** Builder/Owner, **I want to** archive old proposals, **so that** I can keep the active list focused on current opportunities.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] isArchived flag on proposals
- [ ] Archive/unarchive toggle action
- [ ] Archived proposals hidden from default list view
- [ ] Filter option to show archived proposals

---

### US-PR020: Proposal Section Editor
**As a** Project Manager, **I want to** use a visual section editor to build my proposal, **so that** I can easily arrange and customise the document layout.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] ProposalBuilder component for visual editing
- [ ] SectionEditor component for individual section customisation
- [ ] Add, edit, reorder, and delete sections
- [ ] Section types: cover page, scope/description, estimate/pricing, terms, custom content
- [ ] Rich text editing for custom content sections
- [ ] Real-time preview of section layout

---

## Technical Notes
- All financial values (subtotal, gstAmount, totalAmount, unitPrice, totalPrice) stored in cents (integer) for precision
- Proposal numbers are unique across the system (unique constraint on proposalNumber)
- Source estimate linked via estimateId - proposal items can reference estimate groups/items
- Sections use sortOrder for sequencing and estimateGroupId for linking to estimate groups
- Client acceptance records stored in proposalAcceptances table with full audit trail
- Signature data stored directly on the proposal record
- PDF generation uses @react-pdf/renderer with dedicated components:
  - ProposalDocument: main PDF layout
  - CoverPage/CoverPageSection: branded cover page
  - EstimateSection: pricing tables
  - PDFPreview: inline preview component
- Status workflow: Draft -> Sent -> Viewed -> Accepted/Rejected/Expired
- convertedToInvoiceId links accepted proposals to their generated invoices
- GST calculated at 10% (Australian standard rate)
- Optional items support allows upselling with client-selectable add-ons

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/proposals | List proposals (with optional projectId filter) |
| POST | /api/proposals | Create a new proposal |
| GET | /api/proposals/:id | Get a single proposal |
| PATCH | /api/proposals/:id | Update a proposal |
| DELETE | /api/proposals/:id | Delete a proposal (cascades to sections, items, acceptances) |
| GET | /api/proposals/:id/sections | Get sections for a proposal |
| POST | /api/proposals/:id/sections | Create a section |
| PATCH | /api/proposal-sections/:id | Update a section |
| DELETE | /api/proposal-sections/:id | Delete a section |
| GET | /api/proposal-sections/:id/items | Get items for a section |
| POST | /api/proposal-sections/:id/items | Create an item in a section |
| PATCH | /api/proposal-items/:id | Update an item |
| DELETE | /api/proposal-items/:id | Delete an item |
| GET | /api/proposals/:id/acceptances | Get acceptance records |
| POST | /api/proposals/:id/accept | Accept a proposal (with signature) |
| POST | /api/proposals/:id/reject | Reject a proposal (with reason) |
| POST | /api/proposals/:id/send | Send proposal to client |
| POST | /api/proposals/:id/convert-to-invoice | Convert accepted proposal to invoice |
| PATCH | /api/proposals/:id/archive | Archive/unarchive a proposal |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /proposals | Proposals.tsx | Business-level proposals list with search and filters |
| /proposals/:id | ProposalDetail.tsx | Proposal detail with section editor and client tracking |
| /projects/:projectId/proposals | Proposals.tsx | Project-scoped proposals list |
| /projects/:projectId/proposals/:id | ProposalDetail.tsx | Project-scoped proposal detail |

## Known Issues / Future Enhancements
- [ ] Email delivery of proposals to clients with tracking
- [ ] Proposal versioning (revise and re-send updated proposals)
- [ ] Client portal for viewing and accepting proposals online
- [ ] Proposal analytics (view rates, acceptance rates, average time to decision)
- [ ] Template library for standard proposal structures and content
- [ ] Multi-currency support for international projects
- [ ] Comparison view for multiple proposal versions
- [ ] Integration with scheduling to include estimated timeline in proposals
- [ ] Custom branding options per proposal (logo, colours, fonts)
- [ ] Automated follow-up reminders for proposals awaiting response

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 20
- Implemented: 20
- Partially Implemented: 0
- Not Implemented: 0
