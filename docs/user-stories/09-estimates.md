# BuildPro User Stories: Estimates

## Epic Overview

### Description
The Estimates system is the financial backbone of BuildPro, allowing builders to create detailed cost breakdowns for construction projects. Estimates contain hierarchical groups of line items with cost codes, markup calculations, tax handling, and allowance tracking. The system supports versioning, locking, import/export, templates, collaborative notes, and generates summary financials that feed into budgets, proposals, and invoicing.

### Business Value
- Provides accurate project costing with builder cost, markup, and client pricing
- Supports hierarchical grouping for organised, scalable estimate structures
- Enables cost tracking through allowances (Prime Cost / Provisional Sum)
- Facilitates team collaboration via assignees, notes, and shared estimates
- Feeds into proposals for client-facing documents
- Integrates with budget tracking to compare estimated vs actual costs
- Supports import from CSV/Excel and templates for rapid estimate creation
- Versioning and locking prevent accidental changes to finalised estimates

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner, manages projects | Approve estimates, review pricing, control margins |
| **Estimator** | Dedicated costing role | Build detailed estimates, manage line items, calculate totals |
| **Project Manager** | Manages specific projects | Create estimates, assign team members, track costs |
| **Office Admin** | Administrative support | Import data, manage templates, generate proposals |

---

## User Stories

### 1. Estimate Creation & Management

#### US-ES001: Create an Estimate
**As an** estimator  
**I want to** create a new estimate for a project  
**So that** I can begin building a cost breakdown

**Acceptance Criteria:**
- [x] User can create an estimate from the Estimates list page
- [x] User enters an estimate name
- [x] Estimate is linked to a project
- [x] Estimate is created with version 1, "draft" status, and unlocked state
- [x] User is navigated to the estimate detail page after creation
- [x] Default markup percentage from project settings is applied

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES002: Edit Estimate Properties
**As an** estimator  
**I want to** edit the estimate name, status, and markup settings  
**So that** I can manage the estimate lifecycle

**Acceptance Criteria:**
- [x] Inline editing of estimate name (click to edit)
- [x] Inline editing of project markup percentage
- [x] Edit estimate dialog for name and status changes
- [x] Configurable tax rate (from company settings, default 10%)
- [x] Changes blocked when estimate is locked

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES003: Delete an Estimate
**As an** estimator  
**I want to** delete an estimate that is no longer needed  
**So that** I can keep my project's estimates organised

**Acceptance Criteria:**
- [x] Delete endpoint with cascade deletion of items and groups
- [x] Locked estimates cannot be deleted (409 Conflict response)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES004: Assign Team Members
**As a** project manager  
**I want to** assign team members to work on an estimate  
**So that** multiple people can collaborate on costing

**Acceptance Criteria:**
- [x] Multi-user select for assignees
- [x] Assignee IDs stored as array on the estimate
- [x] Owner tracked separately from assignees

**Priority:** Should Have  
**Status:** Implemented

---

### 2. Line Items

#### US-ES010: Add Line Items
**As an** estimator  
**I want to** add line items to an estimate  
**So that** I can itemise all materials, labour, and costs

**Acceptance Criteria:**
- [x] User can add items with: name, type, cost code, quantity, unit type, unit cost (ex tax)
- [x] Item types: Material, Labour, Subcontractor, Fee
- [x] Configurable unit types via field settings (each, m, m2, etc.)
- [x] Item-level markup percentage (overrides project markup when set)
- [x] Wastage percentage support (0%, 10%, 15%, 20%, etc.)
- [x] Items can be assigned to a group or remain ungrouped
- [x] Items can have sub-items (3-level nesting via parentItemId)
- [x] Server-side calculation of tax amount and price inc tax
- [x] Items are locked when estimate is locked

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES011: Edit Line Items Inline
**As an** estimator  
**I want to** edit line items directly in the grid  
**So that** I can quickly update quantities, costs, and details

**Acceptance Criteria:**
- [x] Click-to-edit on all item fields in the grid
- [x] CSS Grid-based layout for pixel-perfect column alignment
- [x] Configurable columns: cost code, item, description, status, proposal visibility, shown as, allowance, qty, wastage, unit, unit cost, unit inc, builder cost, builder inc, markup, amount, tax, amount inc, notes
- [x] Real-time calculation updates (builder cost, tax, client price)
- [x] Inline cost code selector (searchable)
- [x] Inline status selector (configurable via field settings)
- [x] Inline allowance type selector (None, Prime Cost, Provisional Sum)
- [x] Items are read-only when estimate is locked

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES012: Reorder Line Items
**As an** estimator  
**I want to** reorder line items via drag-and-drop  
**So that** I can organise items in a logical sequence

**Acceptance Criteria:**
- [x] Drag handles on each row
- [x] Drag-and-drop with visual drop indicators (above/below)
- [x] Items can be moved between groups
- [x] Order persisted to server
- [x] Placeholder shown during drag to prevent layout collapse
- [x] Disabled when estimate is locked

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES013: Delete Line Items
**As an** estimator  
**I want to** delete line items from the estimate  
**So that** I can remove items that are no longer needed

**Acceptance Criteria:**
- [x] Delete button via item action menu
- [x] Confirmation dialog before deletion
- [x] Bulk delete: select multiple items and delete in batch
- [x] Disabled when estimate is locked

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES014: Bulk Actions on Items
**As an** estimator  
**I want to** perform bulk actions on selected items  
**So that** I can efficiently update many items at once

**Acceptance Criteria:**
- [x] Checkbox selection on each item row
- [x] Select all / deselect all
- [x] Bulk delete with confirmation dialog
- [x] Bulk status change
- [x] Bulk move to group
- [x] Selected item count displayed in toolbar

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES015: Proposal Visibility Control
**As an** estimator  
**I want to** control which items appear in client proposals  
**So that** I can show the client only relevant line items

**Acceptance Criteria:**
- [x] "Proposal Visible" toggle (eye icon) on each item
- [x] "Shown As" field for custom display text in proposals
- [x] Proposal visibility column in the grid

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES016: Allowance Tracking
**As an** estimator  
**I want to** mark items as Prime Cost (PC) or Provisional Sum (PS) allowances  
**So that** I can track allowance allocations against actual costs from bills

**Acceptance Criteria:**
- [x] Allowance type selector: None, Prime Cost, Provisional Sum
- [x] Allowance status tracking: pending, in_progress, finalized
- [x] PC items support a separate PC markup percentage
- [x] Allowance items are referenced by bill line item allocations
- [x] Selection flag for items that link to project selections

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES017: Request for Quote Flag
**As an** estimator  
**I want to** flag items that need quotes from suppliers  
**So that** I can generate RFQs from the estimate

**Acceptance Criteria:**
- [x] Request for Quote toggle on each item
- [x] Items can be selected for RFQ creation
- [x] Create RFQ dialog integrates with estimate items

**Priority:** Should Have  
**Status:** Implemented

---

### 3. Groups

#### US-ES020: Create Groups
**As an** estimator  
**I want to** organise items into hierarchical groups  
**So that** I can structure the estimate logically (e.g., by trade, stage, or area)

**Acceptance Criteria:**
- [x] Create groups with name and optional description
- [x] Unlimited-depth nesting (sub-groups via parentGroupId)
- [x] Default cost code per group (auto-applies to new items in the group)
- [x] Collapsible groups for managing large estimates
- [x] Groups display item count and subtotals

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES021: Reorder Groups
**As an** estimator  
**I want to** reorder groups via drag-and-drop  
**So that** I can arrange sections in the preferred order

**Acceptance Criteria:**
- [x] Drag handles on group headers
- [x] Group reorder API with batch order update
- [x] Disabled when estimate is locked

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES022: Delete Groups
**As an** estimator  
**I want to** delete a group and its contents  
**So that** I can restructure the estimate

**Acceptance Criteria:**
- [x] Delete group with confirmation dialog
- [x] Cascade deletes all items within the group
- [x] Disabled when estimate is locked

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES023: Duplicate Groups
**As an** estimator  
**I want to** duplicate a group with all its items  
**So that** I can quickly create similar sections

**Acceptance Criteria:**
- [x] Duplicate group action in group menu
- [x] Creates a copy of the group with all items
- [x] Disabled when estimate is locked

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES024: Copy Group to Another Estimate
**As an** estimator  
**I want to** copy a group from one estimate to another  
**So that** I can reuse costing sections across projects

**Acceptance Criteria:**
- [x] Copy group action with target estimate selection
- [x] Creates a full copy including all items
- [x] Target estimate must not be locked

**Priority:** Could Have  
**Status:** Implemented

---

### 4. Financial Summary

#### US-ES030: View Estimate Summary
**As a** builder/owner  
**I want to** see a financial summary of the estimate  
**So that** I can review total costs, margins, and pricing

**Acceptance Criteria:**
- [x] Summary displays: subtotal, builder cost total, markup amount, subtotal with markup, tax amount, total
- [x] Summary includes item count
- [x] Summary is expandable/collapsible on the detail page
- [x] Summary is fetched via a dedicated API endpoint
- [x] Currency displayed in AUD format

**Priority:** Must Have  
**Status:** Implemented

---

### 5. Versioning & Locking

#### US-ES040: Lock/Unlock Estimate
**As a** builder/owner  
**I want to** lock an estimate to prevent changes  
**So that** finalised estimates are protected from accidental edits

**Acceptance Criteria:**
- [x] Lock button toggles estimate locked state
- [x] Locked estimates: items, groups, and properties are read-only
- [x] Locked estimates cannot be deleted
- [x] Lock/unlock visual indicator on the estimate header

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES041: Create Estimate Version
**As an** estimator  
**I want to** create a new version of an estimate  
**So that** I can revise pricing while preserving the previous version

**Acceptance Criteria:**
- [x] Version creation API endpoint
- [x] New version inherits data from the current version
- [x] Version number incremented

**Priority:** Should Have  
**Status:** Implemented

---

### 6. Import & Export

#### US-ES050: Import Items from CSV/Excel
**As an** estimator  
**I want to** import line items from a CSV or Excel file  
**So that** I can quickly populate an estimate from external data

**Acceptance Criteria:**
- [x] Import dialog with file upload
- [x] Column mapping for CSV/Excel fields to estimate item fields
- [x] Cost code matching (case-insensitive)
- [x] Group matching (creates groups if not found)
- [x] Batch import with server-side validation and calculation
- [x] Import summary with success/error counts

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES051: Import Full Estimate from Template
**As an** estimator  
**I want to** import a full estimate structure from a template  
**So that** I can start with pre-defined groups and items

**Acceptance Criteria:**
- [x] Import full estimate dialog
- [x] Select from available templates
- [x] Imports groups and items with hierarchical structure
- [x] Template data includes cost codes, quantities, and pricing

**Priority:** Should Have  
**Status:** Implemented

---

### 7. Estimate List Views

#### US-ES060: Business-Level Estimates List
**As a** builder/owner  
**I want to** see all estimates across all projects  
**So that** I can manage and monitor costing company-wide

**Acceptance Criteria:**
- [x] Grid view with estimate cards showing name, project, status, total
- [x] Kanban view with drag-and-drop between status columns
- [x] Search by estimate name or project name
- [x] Filter by project
- [x] Filter by status (configurable via field settings)
- [x] Status count badges
- [x] Card width settings (compact, comfortable, spacious)
- [x] Dragging between kanban columns updates estimate status

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES061: Project-Level Estimates
**As a** project manager  
**I want to** see all estimates for a specific project  
**So that** I can manage project costing in context

**Acceptance Criteria:**
- [x] Project estimates page with list of estimates
- [x] Navigate to estimate detail from the project context
- [x] Create new estimate within the project scope

**Priority:** Must Have  
**Status:** Implemented

---

### 8. Column Customisation & View Preferences

#### US-ES070: Customise Grid Columns
**As an** estimator  
**I want to** customise which columns are visible and their widths  
**So that** I can focus on the data most relevant to my current work

**Acceptance Criteria:**
- [x] 19 configurable columns with visibility toggles
- [x] Column width customisation (pixel-based)
- [x] Default column configuration with sensible widths
- [x] Horizontal scrolling for wide estimates

**Priority:** Should Have  
**Status:** Implemented

---

#### US-ES071: Persist View Preferences
**As an** estimator  
**I want to** save my column and filter preferences  
**So that** my preferred view is restored when I return

**Acceptance Criteria:**
- [x] User view preferences stored server-side (per-user)
- [x] Saves: column configuration, filter type, filter status, filter group
- [x] Preferences loaded on page load with merge handling for new columns
- [x] Preference changes auto-saved

**Priority:** Should Have  
**Status:** Implemented

---

### 9. Filtering & Search

#### US-ES080: Filter Items in Detail View
**As an** estimator  
**I want to** filter items by type, status, and group  
**So that** I can focus on specific parts of the estimate

**Acceptance Criteria:**
- [x] Filter by item type (Material, Labour, Subcontractor, Fee)
- [x] Filter by item status (configurable via field settings)
- [x] Filter by group
- [x] Search items by name/description
- [x] Filters persist in view preferences

**Priority:** Should Have  
**Status:** Implemented

---

### 10. Collaborative Notes

#### US-ES090: Estimate Notes
**As an** estimator  
**I want to** add running notes to an estimate  
**So that** team members can collaborate and track decisions

**Acceptance Criteria:**
- [x] Notes popover on the estimate detail page
- [x] Add notes with content and author tracking
- [x] Notes displayed in chronological order
- [x] Notes associated with estimate ID

**Priority:** Should Have  
**Status:** Implemented

---

### 11. Templates

#### US-ES100: Manage Estimate Templates
**As an** office admin  
**I want to** create and manage reusable estimate templates  
**So that** estimators can start with standardised structures

**Acceptance Criteria:**
- [x] Template list page with search and filtering
- [x] Create templates with: name, description, category
- [x] Template data stores hierarchical group/item structure as JSON
- [x] Template categories for organisation
- [x] Archive/unarchive templates
- [x] Public/private visibility flag
- [x] Edit and delete templates
- [x] Template detail page with full editing

**Priority:** Should Have  
**Status:** Implemented

---

### 12. Catalog Sidebar

#### US-ES110: Cost Catalog Sidebar
**As an** estimator  
**I want to** browse a cost catalog while building the estimate  
**So that** I can quickly add standard items with pre-set pricing

**Acceptance Criteria:**
- [x] Sidebar panel with catalog items
- [x] Searchable catalog
- [x] Add catalog items to the estimate

**Priority:** Could Have  
**Status:** Implemented

---

### 13. Undo Support

#### US-ES120: Undo Actions
**As an** estimator  
**I want to** undo recent actions in the estimate  
**So that** I can recover from mistakes without manually reverting changes

**Acceptance Criteria:**
- [x] Undo stack tracks recent changes
- [x] Undo button in the toolbar
- [x] Uses custom `useUndoStack` hook

**Priority:** Could Have  
**Status:** Implemented

---

### 14. Integration Points

#### US-ES130: Estimate to Proposal
**As a** project manager  
**I want to** generate client proposals from an estimate  
**So that** I can present pricing to clients in a professional format

**Acceptance Criteria:**
- [x] Full estimate data endpoint (estimate + groups + items) for proposal generation
- [x] Proposal-visible flag controls which items appear in proposals
- [x] "Shown As" allows custom display text per item

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES131: Estimate to Budget
**As a** builder/owner  
**I want to** estimates to feed baseline budget amounts  
**So that** I can track actual costs against estimated costs

**Acceptance Criteria:**
- [x] Estimate items linked to cost codes
- [x] Budget baseline amounts derived from estimate totals
- [x] Selected estimate tracked on the project (selectedEstimateId)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-ES132: Estimate Items to Purchase Orders
**As a** project manager  
**I want to** import estimate items into purchase orders  
**So that** I can order materials based on the estimate

**Acceptance Criteria:**
- [x] PO items can reference source estimate item IDs
- [x] Backend supports importing from estimate items

**Priority:** Should Have  
**Status:** Implemented

---

### 15. Settings

#### US-ES140: Company Estimate Number Configuration
**As a** builder/owner  
**I want to** configure the estimate numbering prefix  
**So that** estimate numbers match my company's conventions

**Acceptance Criteria:**
- [x] Company settings include estimate prefix (default "EST-") and start number (default 1000)

**Priority:** Should Have  
**Status:** Implemented

---

## Technical Notes

### Data Model
- Estimate values stored as doubles (dollars) — not cents
- Markup can be set at project level (projectMarkupPercent) or per item (markupPercent)
- Tax rate from company settings (default 10%)
- Hierarchical groups via `parentGroupId` self-reference with unlimited nesting
- Item nesting via `parentItemId` (up to 3 levels)
- Status managed via configurable field settings (not hardcoded enum)
- Versioning tracks version number; locked state prevents modifications

### Summary Calculation
```
Builder Cost = Unit Cost Ex Tax x Quantity
Markup Amount = Builder Cost x (Markup% / 100)
Client Price Ex Tax = Builder Cost + Markup Amount
Tax Amount = Client Price Ex Tax x (Tax Rate / 100)
Client Price Inc Tax = Client Price Ex Tax + Tax Amount
```

### API Routes
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/estimates` | List estimates (filter: projectId) |
| GET | `/api/estimates/:id` | Get single estimate |
| POST | `/api/estimates` | Create estimate |
| PATCH | `/api/estimates/:id` | Update estimate |
| DELETE | `/api/estimates/:id` | Delete estimate |
| GET | `/api/estimates/:id/items` | List items |
| GET | `/api/estimate-items/:id` | Get single item |
| POST | `/api/estimates/:id/items` | Create item (with server-side calc) |
| POST | `/api/estimates/:id/items/import` | Bulk import items |
| PATCH | `/api/estimate-items/:id` | Update item |
| DELETE | `/api/estimate-items/:id` | Delete item |
| GET | `/api/estimates/:id/groups` | List groups |
| POST | `/api/estimates/:id/groups` | Create group |
| PATCH | `/api/estimate-groups/:id` | Update group |
| DELETE | `/api/estimate-groups/:id` | Delete group |
| PATCH | `/api/estimate-groups/reorder` | Reorder groups |
| POST | `/api/estimate-groups/:id/duplicate` | Duplicate group |
| POST | `/api/estimate-groups/:id/copy` | Copy group to another estimate |
| POST | `/api/estimates/:id/version` | Create new version |
| POST | `/api/estimates/:id/lock` | Lock estimate |
| POST | `/api/estimates/:id/unlock` | Unlock estimate |
| GET | `/api/estimates/:id/summary` | Get financial summary |
| GET | `/api/estimates/:id/full` | Get full data (for proposals) |
| GET | `/api/estimates/:id/notes` | List notes |
| POST | `/api/estimates/:id/notes` | Add note |
| GET | `/api/estimate-templates` | List templates |
| GET | `/api/estimate-templates/:id` | Get template |
| POST | `/api/estimate-templates` | Create template |
| PATCH | `/api/estimate-templates/:id` | Update template |
| DELETE | `/api/estimate-templates/:id` | Delete template |
| GET | `/api/projects/:projectId/estimate-items` | Get items by project (for RFQ) |

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/estimates` | Estimates | Business-level estimates list (grid/kanban) |
| `/estimates/new` | EstimateDetail | Create new estimate |
| `/estimates/:id` | EstimateDetail | Estimate detail/edit |
| `/estimates/project/:projectId` | ProjectEstimates | Project-level estimates |
| `/projects/:projectId/estimates/:estimateId` | EstimateDetail | Project-scoped estimate detail |
| `/estimate-templates` | EstimateTemplates | Template list |
| `/estimate-templates/:id` | EstimateTemplateDetail | Template detail/edit |

---

## Known Issues

1. **Large estimate performance** — EstimateDetail.tsx is 6,774 lines; very large estimates may experience slow rendering.
2. **No estimate comparison** — No side-by-side comparison of estimate versions.
3. **No export to PDF** — Estimates can be used in proposals but cannot be directly exported as standalone PDF documents.
4. **Activity logging** — Status changes are logged but not all item-level operations are tracked.

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
| Line Items | 8 | 8 | 0 | 0 |
| Groups | 5 | 5 | 0 | 0 |
| Financial Summary | 1 | 1 | 0 | 0 |
| Versioning & Locking | 2 | 2 | 0 | 0 |
| Import & Export | 2 | 2 | 0 | 0 |
| List Views | 2 | 2 | 0 | 0 |
| Column Customisation | 2 | 2 | 0 | 0 |
| Filtering & Search | 1 | 1 | 0 | 0 |
| Collaborative Notes | 1 | 1 | 0 | 0 |
| Templates | 1 | 1 | 0 | 0 |
| Catalog Sidebar | 1 | 1 | 0 | 0 |
| Undo Support | 1 | 1 | 0 | 0 |
| Integration Points | 3 | 3 | 0 | 0 |
| Settings | 1 | 1 | 0 | 0 |
| **Total** | **35** | **35** | **0** | **0** |
