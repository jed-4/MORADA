# Defects Management - User Stories

## Epic Overview

### Description
The Defects Management system enables builders to identify, track, and resolve construction defects across their projects. It supports categorisation by type (builder, subcontractor, client, warranty), priority levels, assignment to contacts and trades, cost impact tracking, photo attachments, and a full status workflow from open through to closed. The system is designed for Australian residential builders managing defect rectification during construction and warranty periods.

### Business Value
- Provides systematic tracking of all construction defects to ensure nothing falls through the cracks
- Enables accountability by assigning defects to specific contacts, trades, and responsible parties
- Tracks cost impact of defects against project budgets via cost code linking
- Supports warranty compliance with defect type categorisation and date tracking for Australian building warranty obligations
- Reduces rework costs by providing visibility into defect patterns and resolution timelines

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner, manages multiple projects | Defect overview across projects, cost impact visibility, warranty tracking |
| **Project Manager** | Manages specific projects | Create and assign defects, track resolution, manage due dates |
| **Site Supervisor** | On-site team lead | Log defects with photos from site, update resolution status |
| **Subcontractor** | External trade contractor | View assigned defects, update rectification status |
| **Client/Homeowner** | End customer | Report defects during handover and warranty period |

---

## User Stories

### 1. Defect Creation

#### US-DF001: Create a Defect
**As a** project manager
**I want to** create a new defect record for a project
**So that** I can formally track and manage its resolution

**Acceptance Criteria:**
- [x] User can create a defect from the Defects page
- [x] Required fields: title, project
- [x] Optional fields: description, location, type, priority, trade, assigned contact, due date, notes
- [x] Defect is created with "Open" status by default
- [x] `dateIdentified` is set to the creation date
- [x] `createdBy` and `createdByName` recorded from the current user
- [x] Defect appears in the project defect list immediately after creation

**Priority:** Must Have
**Status:** Implemented

---

#### US-DF002: Create Defect with Photo Attachments
**As a** site supervisor
**I want to** attach photos when creating a defect
**So that** the issue is visually documented for rectification

**Acceptance Criteria:**
- [x] File upload supports multiple image attachments (JPEG, PNG)
- [x] Attachments stored as JSON array of URLs on the defect record
- [x] Photos displayed as thumbnails on the defect detail view
- [x] Photos can be viewed in full size
- [x] Attachments can be added during creation or when editing

**Priority:** Must Have
**Status:** Implemented

---

### 2. Defect Categorisation

#### US-DF003: Categorise Defect by Type
**As a** project manager
**I want to** categorise defects by type (builder, subcontractor, client, warranty)
**So that** I can track responsibility and filter defects by category

**Acceptance Criteria:**
- [x] Defect type dropdown with options: Builder, Subcontractor, Client, Warranty
- [x] Builder: defects caused by the builder's own team
- [x] Subcontractor: defects caused by a subcontractor's work
- [x] Client: defects reported by the client/homeowner
- [x] Warranty: defects reported during the warranty/defect liability period
- [x] Type is filterable on the defect list view

**Priority:** Must Have
**Status:** Implemented

---

#### US-DF004: Set Defect Priority
**As a** project manager
**I want to** set a priority level on each defect
**So that** the team can focus on the most critical issues first

**Acceptance Criteria:**
- [x] Priority dropdown with options: Critical, High, Medium, Low
- [x] Critical: safety issue or structural concern requiring immediate attention
- [x] High: significant defect affecting livability or compliance
- [x] Medium: noticeable defect requiring rectification before handover
- [x] Low: minor cosmetic issue
- [x] Priority is visually indicated with colour coding
- [x] Priority is filterable and sortable on the defect list

**Priority:** Must Have
**Status:** Implemented

---

### 3. Assignment & Responsibility

#### US-DF005: Assign Defect to Contact
**As a** project manager
**I want to** assign a defect to a specific contact (subcontractor or supplier)
**So that** the responsible party is notified and accountable for rectification

**Acceptance Criteria:**
- [x] Contact selector for assigning a defect to a contact from the project's contact list
- [x] `assignedContactId` and `assignedContactName` stored on the defect
- [x] Assigned contact name displayed on the defect list and detail views
- [x] Defects filterable by assigned contact

**Priority:** Must Have
**Status:** Implemented

---

#### US-DF006: Assign Defect to Trade
**As a** project manager
**I want to** assign a defect to a specific trade category
**So that** I can group defects by trade for batch management and reporting

**Acceptance Criteria:**
- [x] Trade selector with common Australian building trades (e.g., Carpentry, Electrical, Plumbing, Plastering, Tiling, Painting, Roofing)
- [x] Trade stored on the defect record
- [x] Defects filterable by trade on the list view
- [x] Trade displayed on defect cards and table rows

**Priority:** Should Have
**Status:** Implemented

---

### 4. Status Workflow

#### US-DF007: Manage Defect Status
**As a** project manager
**I want to** update the status of a defect through its lifecycle
**So that** I can track progress from identification to closure

**Acceptance Criteria:**
- [x] Status options: Open, In Progress, Resolved, Closed
- [x] Open: defect has been identified but work has not started
- [x] In Progress: rectification work is underway
- [x] Resolved: rectification work is complete, pending review
- [x] Closed: defect has been verified as resolved and closed out
- [x] Status is visually indicated with colour-coded badges
- [x] Status change updates the defect record immediately

**Priority:** Must Have
**Status:** Implemented

---

#### US-DF008: Track Resolution Details
**As a** project manager
**I want to** record resolution details when a defect is resolved
**So that** there is a record of how the defect was rectified

**Acceptance Criteria:**
- [x] `dateResolved` timestamp recorded when status changes to Resolved
- [x] `resolvedBy` and `resolvedByName` recorded from the current user
- [x] Notes field allows recording of resolution method/details
- [x] Resolution date displayed on the defect detail view

**Priority:** Must Have
**Status:** Implemented

---

### 5. Due Dates & Scheduling

#### US-DF009: Set Defect Due Date
**As a** project manager
**I want to** set a due date for defect rectification
**So that** the team has a clear deadline for resolution

**Acceptance Criteria:**
- [x] Due date picker on the defect form
- [x] Overdue defects visually highlighted (e.g., red text or badge)
- [x] Due date displayed on defect list and detail views
- [x] Defects sortable by due date
- [x] Due date filterable (e.g., overdue, due this week, due this month)

**Priority:** Should Have
**Status:** Implemented

---

### 6. Cost Impact

#### US-DF010: Record Cost Impact
**As a** builder/owner
**I want to** record the cost impact of a defect
**So that** I can track the financial effect on the project budget

**Acceptance Criteria:**
- [x] Cost impact field (stored in cents for precision)
- [x] Cost displayed in AUD format
- [x] Cost code selector to link the defect cost to a budget line item
- [x] `costCodeId` stored on the defect for budget integration
- [x] Total defect costs visible in project reporting

**Priority:** Should Have
**Status:** Implemented

---

### 7. Defect List & Filtering

#### US-DF011: View Defect List
**As a** project manager
**I want to** view all defects for a project in a list or table
**So that** I can manage and monitor all project defects

**Acceptance Criteria:**
- [x] Table view displaying: title, type, priority, status, assigned contact, trade, due date, date identified
- [x] Defect list scoped to a specific project
- [x] Click on a defect row to open the detail/edit view
- [x] Empty state displayed when no defects exist

**Priority:** Must Have
**Status:** Implemented

---

#### US-DF012: Board View for Defects
**As a** project manager
**I want to** view defects in a Kanban-style board grouped by status
**So that** I can visually track defect progress across the workflow

**Acceptance Criteria:**
- [x] Board view with columns for each status: Open, In Progress, Resolved, Closed
- [x] Defect cards displayed in each column with key information (title, priority, assigned contact)
- [x] Drag-and-drop between columns to update status
- [x] Card count displayed on each column header
- [x] Toggle between table view and board view

**Priority:** Should Have
**Status:** Implemented

---

#### US-DF013: Filter Defects
**As a** project manager
**I want to** filter defects by status, priority, type, trade, and assigned contact
**So that** I can focus on specific subsets of defects

**Acceptance Criteria:**
- [x] Filter by status (Open, In Progress, Resolved, Closed)
- [x] Filter by priority (Critical, High, Medium, Low)
- [x] Filter by type (Builder, Subcontractor, Client, Warranty)
- [x] Filter by trade
- [x] Filter by assigned contact
- [x] Multiple filters can be applied simultaneously
- [x] Filter state persists during the session

**Priority:** Should Have
**Status:** Implemented

---

#### US-DF014: Search Defects
**As a** project manager
**I want to** search defects by keyword
**So that** I can quickly find specific defects by title, description, or location

**Acceptance Criteria:**
- [x] Search input field on the defects page
- [x] Real-time search across title, description, location, and notes
- [x] Search works in combination with filters
- [x] Search results update as the user types

**Priority:** Should Have
**Status:** Implemented

---

### 8. Defect Detail & Editing

#### US-DF015: Edit Defect Details
**As a** project manager
**I want to** edit all fields on an existing defect
**So that** I can update information as the defect progresses through resolution

**Acceptance Criteria:**
- [x] All defect fields are editable via a form dialog or detail view
- [x] Changes saved via PATCH API endpoint
- [x] Validation on required fields (title)
- [x] Edit form pre-populated with current defect data
- [x] Changes reflected immediately in the defect list

**Priority:** Must Have
**Status:** Implemented

---

#### US-DF016: Delete a Defect
**As a** project manager
**I want to** delete a defect that was entered in error
**So that** I can keep the defect records accurate

**Acceptance Criteria:**
- [x] Delete action available on the defect detail/edit view
- [x] Confirmation dialog before deletion
- [x] Defect permanently removed via DELETE API endpoint
- [x] Defect list updates after deletion

**Priority:** Must Have
**Status:** Implemented

---

#### US-DF017: Record Defect Location
**As a** site supervisor
**I want to** specify the location of a defect within the property
**So that** the rectification team can find and fix the issue efficiently

**Acceptance Criteria:**
- [x] Location text field for describing where the defect is (e.g., "Master bedroom - north wall", "Ensuite - shower recess")
- [x] Location displayed on defect list and detail views
- [x] Location searchable in the defect search

**Priority:** Should Have
**Status:** Implemented

---

#### US-DF018: Add Notes to Defect
**As a** project manager
**I want to** add notes and comments to a defect record
**So that** I can track communications and decisions about the defect

**Acceptance Criteria:**
- [x] Notes text area on the defect form
- [x] Notes can be updated at any time
- [x] Notes support free-text descriptions of discussions, decisions, and follow-ups

**Priority:** Should Have
**Status:** Implemented

---

## Technical Notes

### Data Model
- `defects` table:
  - `projectId` — linked project
  - `title` — defect title (required)
  - `description` — detailed description
  - `location` — physical location within the property
  - `type` — enum: builder, subcontractor, client, warranty
  - `priority` — enum: critical, high, medium, low
  - `status` — enum: open, in_progress, resolved, closed
  - `trade` — trade category (e.g., Carpentry, Electrical)
  - `assignedContactId`, `assignedContactName` — assigned responsible party
  - `dateIdentified` — date the defect was found
  - `dueDate` — deadline for rectification
  - `dateResolved` — date the defect was resolved
  - `notes` — free-text notes
  - `costImpact` — financial cost in cents (integer)
  - `costCodeId` — linked cost code for budget tracking
  - `attachments` — JSON array of attachment URLs (photos)
  - `createdBy`, `createdByName` — user who created the defect
  - `resolvedBy`, `resolvedByName` — user who resolved the defect

### API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/defects` | List defects (filter: projectId, status, priority, type) |
| POST | `/api/defects` | Create a new defect |
| GET | `/api/defects/:id` | Get single defect by ID |
| PATCH | `/api/defects/:id` | Update defect fields |
| DELETE | `/api/defects/:id` | Delete a defect |

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/projects/:projectId/defects` | Defects | Project-level defects page (490 lines) with table and board views |

---

## Known Issues / Future Enhancements

- [ ] No defect report generation (PDF export of defect list with photos)
- [ ] No automated notifications to assigned contacts when a defect is created or updated
- [ ] No defect templates for common defect types (e.g., pre-handover checklist items)
- [ ] No integration with building inspection checklists
- [ ] No defect analytics/dashboard (e.g., defects by trade, average resolution time)
- [ ] Photo annotation (marking up defect photos with arrows/circles) not supported
- [ ] No warranty period tracking with automatic defect type assignment
- [ ] No batch/bulk defect creation for pre-handover inspections
- [ ] No subcontractor portal view for assigned defects
- [ ] No defect recurrence tracking (linking related/repeat defects)

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

---

## Implementation Coverage Summary

| Area | Stories | Implemented | Partial | Not Started |
|------|---------|-------------|---------|-------------|
| Defect Creation | 2 | 2 | 0 | 0 |
| Categorisation | 2 | 2 | 0 | 0 |
| Assignment & Responsibility | 2 | 2 | 0 | 0 |
| Status Workflow | 2 | 2 | 0 | 0 |
| Due Dates & Scheduling | 1 | 1 | 0 | 0 |
| Cost Impact | 1 | 1 | 0 | 0 |
| List & Filtering | 4 | 4 | 0 | 0 |
| Detail & Editing | 4 | 4 | 0 | 0 |
| **Total** | **18** | **18** | **0** | **0** |

- Total Stories: 18
- Implemented: 18
- Partially Implemented: 0
- Not Implemented: 0
