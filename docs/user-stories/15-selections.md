# Selections (Client Design Choices) - User Stories

## Epic Overview
The Selections system allows builders to present design choices and product options to clients for their residential construction projects. Builders create selection items organised by room and category (e.g., Kitchen Benchtop, Bathroom Tiles), add product options with pricing, and track client decisions through an approval workflow. The system supports allowance budgets, GST/markup calculations, templates for standard selections, and client visibility controls to manage what pricing information clients can see.

## Business Value
For Australian residential builders, managing client selections is a critical part of the construction process that directly impacts project timelines and budgets. The Selections system eliminates manual spreadsheets and email chains by providing a structured workflow for presenting options, tracking decisions, and managing allowance budgets. Client visibility controls allow builders to show or hide pricing strategically, while templates standardise common selection categories across projects. Integration with allowances ensures selections stay within budget parameters.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/Owner | Business owner, manages multiple projects | Control pricing visibility, manage allowances, approve selections |
| Project Manager | Manages specific projects | Create selections, present options, track client decisions |
| Interior Designer | Design consultant | Configure design selections, add product options with images |
| Office Admin | Administrative support | Manage templates, track deadlines, process selections |
| Client/Homeowner | Project client | Review options, make selections, stay within budget |

## User Stories

### US-SL001: View All Selections
**As a** Project Manager, **I want to** view a list of all selections for a project, **so that** I can monitor which design decisions have been made and which are pending.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display selections in a table with name, category, room, status, deadline, and allowance columns
- [ ] Support text search across selection name, category, and room
- [ ] Support status filter (all, draft, pending, approved, selected)
- [ ] Show selection count badges per status
- [ ] Project-level and business-level views supported
- [ ] Click row to navigate to selection detail

---

### US-SL002: Create a Selection
**As a** Project Manager, **I want to** create a new selection item for a project, **so that** I can present design choices to the client.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create selection with name, category, room, and description
- [ ] Set selection type: "selection" (product choice) or "design" (design decision)
- [ ] Default status to "draft"
- [ ] Link selection to a project
- [ ] Navigate to selection detail page after creation

---

### US-SL003: Edit Selection Details
**As a** Project Manager, **I want to** edit the details of a selection, **so that** I can update requirements before presenting to the client.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit name, category, room, and description
- [ ] Set selection type (selection/design)
- [ ] Set deadline for client decision
- [ ] Set allowance amount in cents (budget for this selection)
- [ ] Configure client visibility: clientCanChange (allow client to modify selection) and clientCanSeePrice (show pricing to client)
- [ ] Update status through the workflow
- [ ] Changes saved via Save button with validation

---

### US-SL004: Delete a Selection
**As a** Project Manager, **I want to** delete a selection that is no longer needed, **so that** I can keep the project selections organised.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete selection via API with cascade deletion of options, attachments, and client selections
- [ ] Confirmation dialog before deletion
- [ ] Redirect to selections list after deletion

---

### US-SL005: Selection Status Workflow
**As a** Project Manager, **I want to** track each selection through a defined status workflow, **so that** I know which selections need client input and which are finalised.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Status values: Draft, Pending, Approved, Selected
- [ ] Draft: selection being prepared by the builder
- [ ] Pending: sent to client for review and decision
- [ ] Approved: builder has approved the client's choice
- [ ] Selected: client has made their selection
- [ ] Status badges with appropriate colours on list and detail views

---

### US-SL006: Add Product Options to a Selection
**As a** Project Manager, **I want to** add product options to a selection, **so that** the client can choose from available products.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add options with name, description, SKU, brand, and category
- [ ] Set unit cost, unit tax, and total cost in cents
- [ ] Set quantity and unit type (each, m2, lm, etc.)
- [ ] Toggle GST inclusive pricing
- [ ] Set markup percentage per option
- [ ] Add product URL for external reference
- [ ] Options displayed in a list/grid on the selection detail page

---

### US-SL007: Edit Product Options
**As a** Project Manager, **I want to** edit product options on a selection, **so that** I can update pricing, availability, or details.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit all option fields inline or via edit dialog
- [ ] Update pricing (unitCost, unitTax, totalCost) with real-time recalculation
- [ ] Update quantity, unit type, and markup percentage
- [ ] Changes persisted via PATCH /api/selection-options/:id

---

### US-SL008: Delete Product Options
**As a** Project Manager, **I want to** remove product options from a selection, **so that** I can update the available choices.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete individual options via delete button
- [ ] Cascade deletion of associated attachments
- [ ] Refresh options list after deletion

---

### US-SL009: Client Visibility Controls
**As a** Builder/Owner, **I want to** control what pricing information clients can see, **so that** I can manage margin transparency strategically.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] clientCanSeePrice toggle: when disabled, pricing is hidden from client view
- [ ] clientCanChange toggle: when disabled, client cannot modify their selection after submitting
- [ ] visibleToClient flag per option: control which options the client can see
- [ ] Visibility settings applied to client portal/shared views

---

### US-SL010: Set Allowance Budget
**As a** Builder/Owner, **I want to** set an allowance budget for each selection, **so that** clients understand their included budget and any upgrade costs.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Allowance amount field in cents on the selection
- [ ] Display allowance vs selected option cost comparison
- [ ] Highlight when selected option exceeds allowance (over-budget indicator)
- [ ] Allowance integrates with project-level allowance tracking

---

### US-SL011: Attach Files to Options
**As a** Project Manager, **I want to** attach images and documents to product options, **so that** clients can see what each option looks like.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] File upload for each option (images, PDFs, documents)
- [ ] Multiple attachments per option via optionAttachments table
- [ ] Image preview/thumbnail display on option cards
- [ ] File download available for all attachment types

---

### US-SL012: GST and Markup Calculations
**As a** Builder/Owner, **I want to** manage GST and markup on selection options, **so that** pricing accurately reflects costs and margins.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] GST inclusive toggle per option (gstInclusive flag)
- [ ] Markup percentage per option for margin calculation
- [ ] Unit cost stored ex-GST in cents, unit tax calculated separately
- [ ] Total cost calculated as (unitCost + unitTax) x quantity
- [ ] All financial values stored in cents (integer) for precision
- [ ] Currency displayed in AUD format

---

### US-SL013: Product URL and SKU Tracking
**As a** Project Manager, **I want to** record product URLs and SKU numbers on options, **so that** I can reference supplier product pages and track specific products.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] URL field on each option for external product links
- [ ] SKU field for supplier product codes
- [ ] Brand field for manufacturer/supplier name
- [ ] Clickable URL opens in new tab

---

### US-SL014: Client Makes a Selection
**As a** Client/Homeowner, **I want to** select my preferred option from the choices presented, **so that** the builder knows my design preferences.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Client can mark an option as selected (isSelectedByClient flag)
- [ ] Client selection tracked in clientSelections table with timestamp
- [ ] Only one option can be selected per selection (unless configured otherwise)
- [ ] Selection status updates when client makes their choice
- [ ] Confirmation shown after selection is submitted

---

### US-SL015: Track Selection Deadlines
**As a** Project Manager, **I want to** set and track deadlines for client selections, **so that** design decisions don't delay the construction schedule.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Deadline date field on each selection
- [ ] Overdue selections highlighted in the list view
- [ ] Deadline displayed on selection detail page
- [ ] Sort/filter by deadline in the selections list

---

### US-SL016: Create Selection Templates
**As an** Office Admin, **I want to** create reusable selection templates, **so that** common selection categories can be standardised across projects.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Template list page (SelectionTemplates.tsx) with search
- [ ] Create templates with name, description, category, room, and default options
- [ ] Template detail page (SelectionTemplateDetail.tsx) for editing
- [ ] Template item detail page (SelectionTemplateItemDetail.tsx) for option editing
- [ ] Full CRUD operations via /api/selection-templates

---

### US-SL017: Create Selection from Template
**As a** Project Manager, **I want to** create a selection from a saved template, **so that** I can quickly set up standard selection categories with pre-defined options.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Template selection when creating a new selection
- [ ] Pre-populate selection name, category, room, and options from template
- [ ] User can modify pre-populated data before saving

---

### US-SL018: Organise Selections by Room
**As a** Project Manager, **I want to** organise selections by room (Kitchen, Bathroom, Living, etc.), **so that** clients can review choices room by room.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Room field on each selection
- [ ] Filter selections by room in the list view
- [ ] Room grouping option for organised display
- [ ] Common room values available as suggestions

---

### US-SL019: Organise Selections by Category
**As a** Project Manager, **I want to** categorise selections (Tiles, Benchtops, Tapware, Paint, etc.), **so that** similar selections are grouped together.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Category field on each selection
- [ ] Filter selections by category in the list view
- [ ] Category grouping option for organised display
- [ ] Common category values available as suggestions

---

### US-SL020: View Selection Summary
**As a** Builder/Owner, **I want to** see a summary of all selections with their allowance and actual cost status, **so that** I can monitor the overall budget impact of client choices.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Summary showing total allowance budget vs total selected costs
- [ ] Over/under budget indicator per selection
- [ ] Overall selections budget variance for the project
- [ ] Count of completed vs pending selections

---

## Technical Notes
- All financial values (unitCost, unitTax, totalCost, allowance) stored in cents (integer) for precision
- Selection types: "selection" for product choices, "design" for design decisions (e.g., layout, colour scheme)
- Status workflow: Draft -> Pending -> Selected -> Approved
- Client visibility controlled at selection level (clientCanSeePrice, clientCanChange) and option level (visibleToClient)
- Option attachments stored in optionAttachments table linked to selectionOptions
- Client selections tracked in clientSelections table with timestamp and user reference
- GST calculations: when gstInclusive is true, unitTax is extracted from totalCost; when false, unitTax is added on top
- Markup applied per-option for flexible margin management
- Templates store reusable selection structures with default options for rapid project setup

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/selections | List selections (with optional projectId filter) |
| POST | /api/selections | Create a new selection |
| GET | /api/selections/:id | Get a single selection |
| PATCH | /api/selections/:id | Update a selection |
| DELETE | /api/selections/:id | Delete a selection (cascades to options and attachments) |
| GET | /api/selections/:id/options | Get options for a selection |
| POST | /api/selections/:id/options | Create an option for a selection |
| GET | /api/selection-options/:id | Get a single option |
| PATCH | /api/selection-options/:id | Update an option |
| DELETE | /api/selection-options/:id | Delete an option |
| GET | /api/selection-options/:id/attachments | Get attachments for an option |
| POST | /api/selection-options/:id/attachments | Upload attachment to an option |
| DELETE | /api/option-attachments/:id | Delete an attachment |
| GET | /api/selections/:id/client-selections | Get client selection records |
| POST | /api/selections/:id/client-selections | Record a client selection |
| GET | /api/selection-templates | List selection templates |
| POST | /api/selection-templates | Create a template |
| GET | /api/selection-templates/:id | Get a template |
| PATCH | /api/selection-templates/:id | Update a template |
| DELETE | /api/selection-templates/:id | Delete a template |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /selections | Selections.tsx | Business-level selections list with search and filters |
| /selections/:id | SelectionDetail.tsx | Selection detail with options, attachments, and client tracking |
| /selection-templates | SelectionTemplates.tsx | Selection templates list |
| /selection-templates/:id | SelectionTemplateDetail.tsx | Selection template detail/edit |
| /selection-templates/:id/items/:itemId | SelectionTemplateItemDetail.tsx | Template item (option) detail/edit |
| /projects/:projectId/selections | Selections.tsx | Project-scoped selections list |
| /projects/:projectId/selections/:id | SelectionDetail.tsx | Project-scoped selection detail |

## Known Issues / Future Enhancements
- [ ] Client portal view for selections (dedicated client-facing interface)
- [ ] Email notification to clients when selections are ready for review
- [ ] Batch selection import from supplier product catalogues
- [ ] Photo comparison view for visual side-by-side option comparison
- [ ] Selection change log tracking all modifications and client interactions
- [ ] Integration with schedule to link selection deadlines to construction phases
- [ ] Supplier product feed integration for automatic pricing updates
- [ ] PDF export of selections summary for client presentation

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 20
- Implemented: 20
- Partially Implemented: 0
- Not Implemented: 0
