# Project Scope - User Stories

## Epic Overview
Project Scope provides a comprehensive system for defining, organising, and tracking the full scope of work for a construction project. Items are organised by stages (e.g., Prelim, Frame, Lockup, Fixing, Completion) and support rich text descriptions, multiple item types (scope, note, tool, material, checklist, proposal), gear lists with photo attachments, nested hierarchies, drag-and-drop reordering, completion tracking, and integration links to estimates, RFQs, purchase orders, and schedule items. Scope templates allow reuse across projects.

## Business Value
For Australian residential builders, clearly defining project scope is essential for avoiding disputes, managing client expectations, and ensuring all work is properly planned. The scope system serves as the single source of truth for what is included in a build - from structural elements to finish selections. Integration with estimates, RFQs, and schedules ensures scope items flow through the entire project lifecycle. Gear lists and checklists help site teams know exactly what tools and materials are needed for each task.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Define and manage project scope, track completion |
| Estimator | Cost Estimator | Link scope items to estimates and cost codes |
| Site Supervisor | On-site Manager | Track completion, manage gear lists and checklists |
| Admin | Office Administrator | Create scope templates for reuse across projects |

## User Stories

### US-SC001: View Project Scope
**As a** Builder/PM, **I want to** view the complete scope of work for a project organised by stages, **so that** I can understand the full extent of the build.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display scope items grouped by stages (Prelim, Frame, Lockup, Fixing, Completion)
- [ ] Show collapsible stage sections
- [ ] Display item details in a grid layout with columns for completion, checkbox, drag handle, name, type, description, and actions
- [ ] Show expand/collapse all functionality
- [ ] Support search filtering across item titles

---

### US-SC002: Create Scope Stages
**As a** Builder/PM, **I want to** create scope stages, **so that** I can organise scope items into logical construction phases.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add new stages with name
- [ ] Set display order for stages
- [ ] Stages are project-specific and company-scoped
- [ ] Support parent stage nesting (parentId for sub-stages)
- [ ] Stage includes optional checklist JSON

---

### US-SC003: Edit Scope Stages
**As a** Builder/PM, **I want to** edit scope stage names and order, **so that** I can reorganise the project structure.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit stage name inline
- [ ] Change stage display order
- [ ] Update via PATCH /api/scope-stages/:id

---

### US-SC004: Delete Scope Stages
**As a** Builder/PM, **I want to** delete scope stages, **so that** I can remove unnecessary sections.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete stage via DELETE /api/scope-stages/:id
- [ ] Handle or warn about items belonging to the stage
- [ ] Refresh scope view after deletion

---

### US-SC005: Add Scope Items
**As a** Builder/PM, **I want to** add scope items within a stage, **so that** I can define individual work packages.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add items with title, description (rich text via Tiptap), and item type
- [ ] Assign to a specific stage
- [ ] Set display order within stage
- [ ] Support inline title editing
- [ ] Auto-focus on newly added items

---

### US-SC006: Bulk Create Scope Items
**As a** Builder/PM, **I want to** create multiple scope items at once, **so that** I can quickly populate the project scope.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Bulk create endpoint POST /api/projects/:projectId/scope/bulk accepts array of items
- [ ] All items assigned to specified stage
- [ ] Auto-generate display orders

---

### US-SC007: Edit Scope Item Title Inline
**As a** Builder/PM, **I want to** edit scope item titles inline, **so that** I can quickly rename items without opening a dialog.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Click on title to enter edit mode
- [ ] Save on blur or Enter key
- [ ] Maintain local state for responsive editing
- [ ] Persist via PATCH /api/scope/:id on blur

---

### US-SC008: Edit Scope Item Description with Rich Text
**As a** Builder/PM, **I want to** write rich text descriptions for scope items, **so that** I can provide detailed specifications.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Tiptap rich text editor with bold, italic, underline, lists
- [ ] Toggle between view and edit mode
- [ ] Show description inline or in hover card
- [ ] Store as HTML content
- [ ] Support text, bullet, table, and image content types

---

### US-SC009: Set Scope Item Types
**As a** Builder/PM, **I want to** categorise scope items by type, **so that** I can distinguish between different kinds of work.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Support item types: scope, note, e-note, tool, material, proposal, checklist
- [ ] Display type badge with colour coding
- [ ] Select type from dropdown in item row
- [ ] Type label helper function for display

---

### US-SC010: Nest Scope Items (Parent-Child Hierarchy)
**As a** Builder/PM, **I want to** nest scope items under parent items, **so that** I can create hierarchical scope structures.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Items support parentId for nesting
- [ ] Indented display for child items
- [ ] Expand/collapse parent items
- [ ] Children follow parent sort order

---

### US-SC011: Drag and Drop Reorder Scope Items
**As a** Builder/PM, **I want to** drag and drop scope items to reorder them, **so that** I can organise items in the desired sequence.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Drag handle visible on hover
- [ ] Smooth drag animation with Y-axis constraint
- [ ] Drop indicator lines showing target position
- [ ] Placeholder maintains height during drag
- [ ] Persist new order via POST /api/scope/reorder
- [ ] Implemented via @dnd-kit/core and @dnd-kit/sortable

---

### US-SC012: Mark Scope Items as Complete
**As a** Site Supervisor, **I want to** mark scope items as complete, **so that** I can track progress on the build.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle completion via circle/checkmark button
- [ ] Record completedAt timestamp via isCompleted tracking
- [ ] Apply visual styling (opacity reduction, line-through on title)
- [ ] Completion state persists via PATCH /api/scope/:id

---

### US-SC013: Manage Gear Lists on Scope Items
**As a** Site Supervisor, **I want to** maintain a gear list for scope items, **so that** I know what tools and equipment are needed.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add gear items with name
- [ ] Toggle gear items as checked/unchecked
- [ ] Store gear list as JSON array on scope item (gearList field)
- [ ] Expandable gear list section per item

---

### US-SC014: Upload Gear Photos
**As a** Site Supervisor, **I want to** upload photos for gear list items, **so that** I can document equipment condition or setup.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Upload photo per gear item via multipart form
- [ ] Store in scopeGearPhotos table with photoUrl
- [ ] Display photo thumbnail in gear list
- [ ] Show upload progress indicator

---

### US-SC015: Manage Checklist Items on Scope Items
**As a** Site Supervisor, **I want to** add checklists to scope items, **so that** I can track detailed subtasks.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add checklist items with text
- [ ] Toggle individual checklist items as complete
- [ ] Delete checklist items
- [ ] Store as checklistItems JSON array with id, text, completed fields
- [ ] Auto-show checklist section for checklist-type items

---

### US-SC016: Link Scope Items to Estimates
**As an** Estimator, **I want to** link scope items to estimate items, **so that** I can track cost coverage of scope.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Store estimateItemId reference on scope item
- [ ] Display link indicator on scope item
- [ ] Navigate to linked estimate item

---

### US-SC017: Flag Scope Items for RFI
**As a** Builder/PM, **I want to** flag scope items that need a Request for Information, **so that** I can track outstanding clarifications.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] needsRfi boolean flag on scope item
- [ ] Visual indicator for items flagged as needing RFI
- [ ] Filter or highlight RFI-flagged items

---

### US-SC018: Link Scope Items to RFQs
**As a** Builder/PM, **I want to** link scope items to RFQs, **so that** I can track procurement for scope items.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Store rfqId reference on scope item
- [ ] Flag items that need RFQ (needsRfq field)
- [ ] Display link indicator

---

### US-SC019: Link Scope Items to Purchase Orders
**As a** Builder/PM, **I want to** link scope items to purchase orders, **so that** I can track material ordering.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Store poId reference on scope item
- [ ] Display link indicator

---

### US-SC020: Link Scope Items to Schedule Items
**As a** Builder/PM, **I want to** link scope items to schedule items, **so that** I can track when scope work is planned.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Store scheduleItemId reference on scope item
- [ ] Display link indicator

---

### US-SC021: Assign Cost Codes to Scope Items
**As an** Estimator, **I want to** assign cost codes to scope items, **so that** I can categorise costs.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Cost code select dropdown per scope item (costCodeId field)
- [ ] Store costCodeId on scope item
- [ ] Display cost code in item row

---

### US-SC022: Select Multiple Scope Items
**As a** Builder/PM, **I want to** select multiple scope items, **so that** I can perform bulk actions.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Checkbox per scope item
- [ ] Track selected items in Set
- [ ] Support for bulk delete action
- [ ] Visual highlighting of selected items

---

### US-SC023: Delete Scope Items
**As a** Builder/PM, **I want to** delete scope items, **so that** I can remove items no longer in scope.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete individual items via dropdown menu
- [ ] Confirm deletion dialog
- [ ] Support bulk deletion of selected items
- [ ] Refresh scope view after deletion

---

### US-SC024: Create Scope Templates
**As an** Admin, **I want to** save scope configurations as templates, **so that** I can reuse them across projects.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create template with name, description, and category
- [ ] Template stores scope item configurations as JSON
- [ ] Templates are company-scoped
- [ ] CRUD operations via /api/scope-templates

---

### US-SC025: Apply Scope Template to Project
**As a** Builder/PM, **I want to** apply a scope template to a project, **so that** I can quickly populate scope from a standard configuration.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Browse and search available templates
- [ ] Apply template via POST /api/scope-templates/:id/apply
- [ ] Preserve template structure and item details

---

### US-SC026: Add Scope Item to Template
**As a** Builder/PM, **I want to** add an individual scope item to an existing or new template, **so that** I can build up reusable templates.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] "Add to Template" option in item dropdown menu
- [ ] Dialog to select existing template or create new one via POST /api/scope-templates/:id/add-item
- [ ] Search and filter templates
- [ ] Copy item details (title, description, type, gear list) to template

---

### US-SC027: Export Scope as PDF
**As a** Builder/PM, **I want to** export the project scope as a PDF, **so that** I can share it with clients and stakeholders.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Generate PDF using @react-pdf/renderer
- [ ] Include all scope items organised by stage
- [ ] Convert Tiptap JSON/HTML descriptions to plain text for PDF
- [ ] Download via PDF button in toolbar

---

### US-SC028: Search Scope Items
**As a** Builder/PM, **I want to** search across all scope items, **so that** I can quickly find specific work packages.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Search input in scope toolbar
- [ ] Filter items matching search term in title or description
- [ ] Real-time filtering as user types
- [ ] Show/hide stages based on whether they contain matching items

---

## Technical Notes
- ProjectScope.tsx is 3490 lines - the largest single component in the application
- Uses @dnd-kit/core and @dnd-kit/sortable for drag and drop
- Uses Tiptap editor (StarterKit + Underline) for rich text descriptions
- Uses @react-pdf/renderer for PDF export
- Gear lists stored as JSON arrays on scope items (gearList field)
- Checklist items stored as JSON arrays with {id, text, completed} structure
- Height preservation refs used for smooth drag placeholders
- Scope items support multiple content types: text, bullet, table, image
- All items are company-scoped for multi-tenant isolation
- Scope stages support nesting via parentId
- Item types: e-note, scope, note, tool, material, proposal, checklist

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects/:projectId/scope | Get all scope items for a project |
| POST | /api/projects/:projectId/scope | Create a scope item |
| POST | /api/projects/:projectId/scope/bulk | Bulk create scope items |
| GET | /api/scope/:id | Get a single scope item |
| PATCH | /api/scope/:id | Update a scope item |
| DELETE | /api/scope/:id | Delete a scope item |
| POST | /api/scope/reorder | Reorder scope items |
| GET | /api/projects/:projectId/scope-stages | Get scope stages |
| POST | /api/projects/:projectId/scope-stages | Create a scope stage |
| PATCH | /api/scope-stages/:id | Update a scope stage |
| DELETE | /api/scope-stages/:id | Delete a scope stage |
| GET | /api/scope-templates | List scope templates |
| POST | /api/scope-templates | Create a scope template |
| GET | /api/scope-templates/:id | Get a scope template |
| PATCH | /api/scope-templates/:id | Update a scope template |
| DELETE | /api/scope-templates/:id | Delete a scope template |
| POST | /api/scope-templates/:id/apply | Apply template to project |
| POST | /api/scope-templates/:id/add-item | Add item to template |
| POST | /api/scope/gear-photos | Upload gear photo |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /projects/:projectId/scope | ProjectScope.tsx | Project scope management |
| /scope-templates | ScopeTemplates.tsx | Scope templates list |
| /scope-templates/:id | ScopeTemplateDetail.tsx | Scope template detail |

## Known Issues / Future Enhancements
- [ ] Component is very large (3490 lines) and could benefit from splitting into sub-components
- [ ] No scope item versioning/history tracking
- [ ] No client-facing scope view or approval workflow
- [ ] No scope-to-schedule auto-generation
- [ ] Image content type items do not have inline image display
- [ ] No scope item dependencies or predecessor relationships
- [ ] No scope progress percentage dashboard widget

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 28
- Implemented: 28
- Partially Implemented: 0
- Not Implemented: 0
