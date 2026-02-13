# BuildPro User Stories: Checklists

## Epic Overview

### Description
The Checklists system provides structured quality control, compliance tracking, and task verification for construction projects. It operates on a template-to-instance model: company admins create reusable checklist templates (Groups) containing checklists with individual items, and these templates are applied to specific projects as instances. Team members work through checklist items on-site, marking them complete, adding notes, and tracking progress. The system supports multiple response types, assignees at every level, linking to tasks and schedule items, and a dashboard widget for at-a-glance progress monitoring. The hierarchy is: **Groups > Checklists > Items**.

### Terminology & Hierarchy
The system uses a three-level hierarchy: **Groups > Checklists > Items**.

| System Term | User-Facing Term | Description |
|-------------|-----------------|-------------|
| Checklist Template | Group (template) | A reusable template in Resources > Templates containing checklists and items |
| Checklist Template Group | Checklist (within template) | A named checklist within a template (e.g., "ITP013 - Dilapidation Report") |
| Checklist Template Item | Item (within template) | An individual line item within a template checklist |
| Checklist Instance | Group (project) | A template applied to a specific project, containing checklists and items |
| Checklist Instance Group | Checklist (within project) | A checklist within a project group, with its own status and assignee |
| Checklist Instance Item | Item (within project) | An individual trackable item with completion status, assignee, notes, and response |

### Business Value
- Ensures consistent quality control processes across all projects
- Tracks compliance with building codes, inspections, and standards
- Provides visibility into project readiness and outstanding items
- Enables accountability through assignees and completion tracking
- Reduces rework by catching issues early through structured verification
- Supports audit trails with completion timestamps and user attribution

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner | Overview of all checklists across projects, compliance assurance, template management |
| **Project Manager** | Manages specific projects | Create and assign checklists, monitor progress, link to schedule items |
| **Site Supervisor** | On-site team lead | Work through checklist items on-site, add notes, mark completion |
| **Quality Manager** | Quality assurance | Define templates, review completed checklists, ensure standards met |
| **Office Admin** | Administrative support | Import/export templates, manage template library |

---

## User Stories

### 1. Checklist Template Management

#### US-CL001: Create a Checklist Template (Checklist Group)
**As a** quality manager  
**I want to** create a reusable checklist template with sub-checklists and items  
**So that** I can standardise quality control processes across all projects

**Acceptance Criteria:**
- [x] User can create a template from Resources > Templates > Checklists
- [x] Template has required fields: name, type (Task, Job, Estimation, Lead)
- [x] Template has optional field: description
- [x] Template is saved with creator attribution (createdBy, createdByName)
- [x] Created template appears in the templates list
- [x] Templates are company-isolated

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL002: Edit a Checklist Template
**As a** quality manager  
**I want to** edit an existing checklist template  
**So that** I can update standards and processes as they evolve

**Acceptance Criteria:**
- [x] User can edit template name, description, and type from the template detail page
- [x] Changes are saved and reflected in the templates list
- [x] Editing a template does not affect existing instances created from it

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL003: Delete a Checklist Template
**As a** quality manager  
**I want to** delete (archive) checklist templates that are no longer needed  
**So that** I can keep my template library clean and relevant

**Acceptance Criteria:**
- [x] User can delete a template from the templates list (3-dot menu)
- [x] Template is archived (isArchived flag)
- [x] Existing instances created from the template are not affected (templateId set to null via onDelete: "set null")

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL004: Duplicate a Checklist Template
**As a** quality manager  
**I want to** duplicate an existing checklist template  
**So that** I can quickly create variations of existing checklists

**Acceptance Criteria:**
- [x] "Duplicate" option available in template 3-dot menu
- [x] Creates a full copy of the template including all sub-checklists (groups) and items
- [x] Duplicate appears in templates list with copied data

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL005: Search Checklist Templates
**As a** quality manager  
**I want to** search through my checklist templates  
**So that** I can quickly find a specific template

**Acceptance Criteria:**
- [x] Search input on templates list page
- [x] Filters templates by name as user types

**Priority:** Should Have  
**Status:** Implemented

---

### 2. Template Sub-Checklists (Groups)

#### US-CL010: Add Sub-Checklist to Template
**As a** quality manager  
**I want to** add named sub-checklists (groups) within a template  
**So that** I can organise related items together (e.g., "Structural", "Electrical")

**Acceptance Criteria:**
- [x] User can add groups from the template detail page
- [x] Each group has a name and display order
- [x] Groups appear in the left panel of the two-panel template editor

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL011: Reorder Sub-Checklists
**As a** quality manager  
**I want to** reorder sub-checklists within a template via drag-and-drop  
**So that** I can arrange them in the logical order of the construction process

**Acceptance Criteria:**
- [x] Groups can be reordered via drag-and-drop in the left panel
- [x] Reorder is saved via POST to `/api/checklist-templates/:templateId/groups/reorder`
- [x] Optimistic update shows new order immediately

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL012: Move Sub-Checklist Between Templates
**As a** quality manager  
**I want to** move a sub-checklist from one template to another  
**So that** I can reorganise my template library without recreating items

**Acceptance Criteria:**
- [x] "Move to Template" option available in group 3-dot menu
- [x] User can select target template from a list
- [x] Group and all its items are moved to the target template

**Priority:** Nice to Have  
**Status:** Implemented

---

#### US-CL013: Edit and Delete Sub-Checklists
**As a** quality manager  
**I want to** edit or delete sub-checklists within a template  
**So that** I can maintain accurate template content

**Acceptance Criteria:**
- [x] User can rename a group (inline or via dialog)
- [x] User can delete a group (with cascade deletion of all items within)
- [x] Confirmation required before deletion

**Priority:** Must Have  
**Status:** Implemented

---

### 3. Template Items

#### US-CL020: Add Items to Sub-Checklist
**As a** quality manager  
**I want to** add individual checklist items to a sub-checklist  
**So that** each verification step is clearly defined

**Acceptance Criteria:**
- [x] User can add items from the right panel when a group is selected
- [x] Item has required field: description
- [x] Item has optional field: tooltip (additional notes shown underneath)
- [x] Item has response type: checkbox (default), text, single choice, multiple choice
- [x] For single/multiple choice, user can define response options
- [x] Items display in order within their group

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL021: Edit and Delete Template Items
**As a** quality manager  
**I want to** edit or delete items within a template sub-checklist  
**So that** I can keep checklist content accurate

**Acceptance Criteria:**
- [x] User can edit item description, tooltip, and response type
- [x] User can delete individual items
- [x] Changes are saved immediately

**Priority:** Must Have  
**Status:** Implemented

---

### 4. Template Import & Export

#### US-CL030: Import Checklists from Excel/CSV
**As an** office admin  
**I want to** import checklist templates from a spreadsheet  
**So that** I can quickly set up checklists from existing documentation

**Acceptance Criteria:**
- [x] Import dialog accessible from templates list page (Upload button)
- [x] Supports Excel (.xlsx) and CSV formats
- [x] Column mapping step: user maps spreadsheet columns to template fields (template name, description, type, group name, item description)
- [x] Preview of parsed data shown before import
- [x] Import creates templates, groups, and items in bulk
- [x] Success/error feedback with counts (templates created, groups created, items created, rows skipped)
- [x] Skipped rows reported when template name is missing

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL031: Export Checklists to JSON
**As an** office admin  
**I want to** export checklist templates  
**So that** I can back up my templates or share them with other companies

**Acceptance Criteria:**
- [x] Export available from templates list page (Download button)
- [x] Exports all templates with their groups and items
- [x] Exported in a format that can be re-imported

**Priority:** Nice to Have  
**Status:** Implemented

---

### 5. Checklist Instances (Project Checklists)

#### US-CL040: Create Checklist Instance for a Project
**As a** project manager  
**I want to** apply a checklist template to a specific project  
**So that** the team can work through the required verification steps

**Acceptance Criteria:**
- [x] "Add Checklist Group" button on project checklists page
- [x] Dialog to select a template from a searchable dropdown
- [x] Template selection auto-fills name and description
- [x] User can select which sub-checklists (groups) to include (select all / individual selection)
- [x] Optional fields: priority, due date, assignee
- [x] Instance is created with all selected groups and their items copied from the template
- [x] Instance appears in the project checklists list
- [x] Instance status defaults to "active" (displayed as "Upcoming")

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL041: Delete Checklist Instance
**As a** project manager  
**I want to** delete a checklist instance from a project  
**So that** I can remove checklists that are no longer relevant

**Acceptance Criteria:**
- [x] Delete option available in instance 3-dot menu
- [x] Confirmation dialog required
- [x] Deleting instance cascades to all groups and items within it

**Priority:** Must Have  
**Status:** Implemented

---

### 6. Project Checklists Page

#### US-CL050: View Project Checklists
**As a** project manager  
**I want to** view all checklists for a project  
**So that** I can monitor quality control progress

**Acceptance Criteria:**
- [x] Checklists page accessible from project navigation
- [x] Shows all checklist instances (groups) for the project
- [x] Each instance is collapsible, showing its sub-checklists (groups) when expanded
- [x] Sub-checklists show: name, status badge, priority badge, completion count, assignee avatar
- [x] Status tabs: All, Upcoming (active), Action (in_progress), Done (completed)
- [x] Tab counts shown for each status category

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL051: Filter and Search Checklists
**As a** project manager  
**I want to** filter and search checklists  
**So that** I can find specific items quickly

**Acceptance Criteria:**
- [x] Search input filters sub-checklists by name
- [x] Filter by assignee (dropdown of team members)
- [x] "Hide completed" toggle to exclude finished checklists
- [x] Status tabs filter by status category
- [x] Multiple filters can be combined

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL052: Expand Sub-Checklist to View Items
**As a** site supervisor  
**I want to** expand a sub-checklist to see its individual items  
**So that** I can review and work through the checklist

**Acceptance Criteria:**
- [x] Clicking the expand arrow on a sub-checklist reveals its items
- [x] Items loaded on-demand when first expanded
- [x] Items display: checkbox/response indicator, description, required badge, assignee
- [x] Items sorted by template-defined order
- [x] Inline "Add item" input at the bottom of expanded items

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL053: Toggle Checklist Item Status Inline
**As a** site supervisor  
**I want to** toggle checklist items between pending and completed directly from the list  
**So that** I can efficiently work through items on-site

**Acceptance Criteria:**
- [x] Clicking the checkbox toggles item between "pending" and "completed"
- [x] Completed items show with green checkmark
- [x] Completion records who completed it and when (completedBy, completedByName, completedAt)
- [x] Count updates in the sub-checklist header

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL054: Add Items Inline
**As a** site supervisor  
**I want to** quickly add new items to a sub-checklist  
**So that** I can capture additional verification points discovered on-site

**Acceptance Criteria:**
- [x] Text input at the bottom of expanded items list
- [x] Enter key or button creates the item
- [x] New item appears immediately in the list
- [x] Default response type is "checkbox"

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL055: Manage Checklist Items (3-Dot Menu)
**As a** project manager  
**I want to** rename or delete individual checklist items via a contextual menu  
**So that** I can manage items without accidental deletions

**Acceptance Criteria:**
- [x] 3-dot menu (MoreVertical icon) on each item row, visible on hover
- [x] Menu options: Rename, Delete
- [x] Rename activates inline text editing (Enter to save, Escape to cancel)
- [x] Delete removes the item immediately
- [x] Counts update accordingly

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL056: Change Sub-Checklist Status
**As a** project manager  
**I want to** advance a sub-checklist through status stages  
**So that** I can track its workflow progress

**Acceptance Criteria:**
- [x] Status button cycles through: Upcoming (active) → Action (in_progress) → Done (completed) → Upcoming
- [x] Moving to "Done" records completedAt, completedBy, completedByName
- [x] Moving back from "Done" clears completion data
- [x] Status badge updates with appropriate colour coding

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL057: Link Sub-Checklist to Task or Schedule Item
**As a** project manager  
**I want to** link a sub-checklist to a task or schedule item  
**So that** I can connect quality control activities to the project plan

**Acceptance Criteria:**
- [x] Link popover available on each sub-checklist row
- [x] Can link to a project task (from tasks list)
- [x] Can link to a schedule item (from schedule)
- [x] Linked item name displayed on the sub-checklist row
- [x] Link can be changed or removed

**Priority:** Should Have  
**Status:** Implemented

---

### 7. Checklist Instance Detail Page

#### US-CL060: View Checklist Instance Detail
**As a** site supervisor  
**I want to** view a checklist instance in full detail  
**So that** I can see all items, progress, and notes in one place

**Acceptance Criteria:**
- [x] Navigate to detail page by clicking checklist name in project checklists
- [x] Header shows: checklist name, priority badge, status badge, back button
- [x] Info bar shows: assignee, due date, item count, progress bar with percentage
- [x] Linked task/schedule item displayed in info bar
- [x] Items grouped by group name with collapsible sections

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL061: Toggle Individual Items
**As a** site supervisor  
**I want to** check/uncheck items and mark them as N/A  
**So that** I can record the verification results

**Acceptance Criteria:**
- [x] Checkbox to toggle between pending and completed
- [x] "N/A" option to mark an item as not applicable
- [x] Completed items show green checkmark with completer name and timestamp
- [x] N/A items show ban icon with attribution
- [x] Required items marked with asterisk badge
- [x] Progress bar and counts update in real-time

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL062: Assign Items to Team Members
**As a** project manager  
**I want to** assign individual checklist items to team members  
**So that** each person knows which items they are responsible for

**Acceptance Criteria:**
- [x] Assignee popover on each item row
- [x] Searchable list of team members
- [x] Selected assignee shown with avatar on the item row
- [x] "Unassign" option to clear assignee
- [x] assigneeId and assigneeName saved to the item

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL063: Add Notes to Checklist Items
**As a** site supervisor  
**I want to** add notes to individual checklist items  
**So that** I can record observations, issues, or additional context

**Acceptance Criteria:**
- [x] Notes icon/button on each item row
- [x] Notes dialog shows a feed of all notes with author and timestamp
- [x] User can add new notes (saved as JSON array with `{author, date, text, system?}`)
- [x] Legacy plain-text notes are handled gracefully
- [x] Multiple notes per item supported (chronological feed)
- [x] System notes added automatically on item completion/reopening (e.g., "Completed by Jed Smith")
- [x] System notes use `system: true` flag and display as italic, muted entries with CheckCircle2 icon
- [x] Notes icon only lights up (fills with brand colour) for human-written notes (`hasHumanNotes()` check)
- [x] System notes do not trigger the notes indicator

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL064: Expand/Collapse All Groups
**As a** site supervisor  
**I want to** expand or collapse all groups at once  
**So that** I can quickly navigate through a large checklist

**Acceptance Criteria:**
- [x] Toggle button in the header bar (ChevronsDownUp icon)
- [x] Expands all groups when any are collapsed
- [x] Collapses all groups when all are expanded
- [x] Tooltip shows current action ("Collapse all" / "Expand all")

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL065: Edit Checklist Instance Settings
**As a** project manager  
**I want to** edit the name, description, priority, due date, and assignee of a checklist instance  
**So that** I can update checklist details as the project evolves

**Acceptance Criteria:**
- [x] Settings dialog accessible from the gear icon in the header
- [x] Can edit: name, description, priority, due date, assignee
- [x] Changes saved and reflected immediately

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL066: Complete Entire Checklist
**As a** project manager  
**I want to** mark a checklist instance as complete  
**So that** I can sign off on the quality control process

**Acceptance Criteria:**
- [x] "Complete" button in header (green, with checkmark icon)
- [x] Button disabled until all items are completed (progress = 100%)
- [x] Completing records completedAt, completedBy, completedByName
- [x] Status changes to "completed" with green badge

**Priority:** Must Have  
**Status:** Implemented

---

#### US-CL067: Add New Items from Detail Page
**As a** site supervisor  
**I want to** add new items to the checklist from the detail page  
**So that** I can capture additional items discovered during inspection

**Acceptance Criteria:**
- [x] "Add Item" button in the header bar
- [x] Dialog to enter: group name, description, tooltip, required flag
- [x] New item appears in the appropriate group
- [x] Button hidden when checklist is completed

**Priority:** Should Have  
**Status:** Implemented

---

### 8. Dashboard Widget

#### US-CL070: Checklist Dashboard Widget
**As a** project manager  
**I want to** see checklist progress on the project dashboard  
**So that** I can monitor quality control at a glance without navigating away

**Acceptance Criteria:**
- [x] Checklist widget available in project dashboard widget registry
- [x] Shows checklist instances with expandable groups and items
- [x] Each instance shows: name, status badge, progress bar, completion count, assignee avatar
- [x] Expandable to show sub-checklists (groups) with their items
- [x] Items can be toggled (pending/completed) directly from the widget
- [x] Clicking checklist name navigates to the full detail page

**Priority:** Should Have  
**Status:** Implemented

---

#### US-CL071: Widget Configuration
**As a** project manager  
**I want to** configure the checklist widget  
**So that** I can customise what information is shown

**Acceptance Criteria:**
- [x] Configuration panel with: widget name, max checklists, wrap text toggle
- [x] Status filter: All, Actionable, Upcoming, Action, Done
- [x] Assignee filter: dropdown of team members
- [x] Hide completed options: hide completed groups, hide completed checklists, hide completed items
- [x] Configuration persisted to widget config

**Priority:** Nice to Have  
**Status:** Implemented

---

#### US-CL072: Widget Collapse State Persistence
**As a** project manager  
**I want** my expand/collapse state in the widget to be remembered  
**So that** I don't have to re-expand checklists every time I visit the dashboard

**Acceptance Criteria:**
- [x] Expand/collapse state saved to localStorage per project
- [x] State restored when returning to the dashboard
- [x] Separate state tracking for checklists and groups

**Priority:** Nice to Have  
**Status:** Implemented

---

### 9. Response Types

#### US-CL080: Multiple Response Types
**As a** quality manager  
**I want** checklist items to support different response types  
**So that** I can capture the right kind of data for each verification step

**Acceptance Criteria:**
- [x] Checkbox (default) - simple pass/fail toggle
- [x] Text - free-form text response (textResponse field)
- [x] Single choice - select one option from predefined list (selectedResponses field)
- [x] Multiple choice - select multiple options from predefined list (selectedResponses field)
- [x] Response options defined at template level and copied to instances
- [x] Response type icons shown on items (Type for text, CircleDot for single choice, ListChecks for multiple choice)

**Priority:** Should Have  
**Status:** Implemented

---

### 10. Checklist Status Triggers

#### US-CL090: Auto-Create Checklists on Project Status Change
**As a** quality manager  
**I want** checklists to be automatically created when a project reaches a specific status  
**So that** the right quality checks are triggered at the right stage of construction

**Acceptance Criteria:**
- [ ] Configuration in company settings to link project statuses to checklist templates
- [ ] When a project transitions to a configured status, the linked template is automatically instantiated
- [ ] Instance records which status triggered it (triggeredByStatus field)
- [ ] Triggers can be enabled/disabled (isActive flag)

**Data Model:**
- [x] `checklistStatusTriggers` table exists with companyId, projectStatus, templateId, isActive
- [ ] Trigger execution on project status change not yet implemented

**Priority:** Should Have  
**Status:** Partial (data model exists, trigger execution pending)

---

## Current State Summary

### Implemented Features
- Full template management (CRUD, duplicate, search)
- Template structure: templates → groups (sub-checklists) → items with ordering
- Drag-and-drop reordering of template groups
- Move groups between templates
- Import from Excel/CSV with column mapping
- Export templates
- Multiple response types: checkbox, text, single choice, multiple choice
- Project checklist instances created from templates with selective group inclusion
- Three-level hierarchy: instances (checklist groups) → groups (sub-checklists) → items
- Status workflow: Upcoming (active) → Action (in_progress) → Done (completed)
- Item toggling: pending ↔ completed, plus N/A option
- Assignees at all levels: instance, group, and item
- Linking groups to tasks and schedule items
- Inline item creation in project checklists
- Expand/collapse all groups
- Filtering: status tabs, search, assignee filter, hide completed
- Dashboard widget with configurable filters and persistent collapse state
- Completion tracking with attribution (who, when)
- Notes feed on items (JSON-based with author and timestamp)
- System notes on item completion/reopening with user attribution
- Notes indicator only highlights for human-written notes (hasHumanNotes check)
- 3-dot menu on items with inline Rename and Delete options
- File/photo attachments on items (max 3 files, 10MB each, Object Storage)
- Audit log tracking status changes, assignments, and item operations
- Activity Log viewable from group 3-dot menu
- User display names resolved from firstName/lastName fields (userDisplayName helper)
- Priority levels at instance and group level
- Due dates on instances
- Completion gating: "Complete" button disabled until 100% progress

### Known Limitations
- [ ] No bulk status change for checklist items
- [ ] No drag-and-drop reordering of instance items
- [ ] No permissions/RBAC for checklist operations
- [ ] Status triggers not yet executed on project status change (data model exists)
- [ ] No checklist-specific notifications (e.g., assigned to you, overdue)
- [ ] No export of completed checklist instances (e.g., PDF report)

---

## Future Enhancements

| Enhancement | Description | Priority | Status |
|-------------|-------------|----------|--------|
| Status Triggers | Auto-create checklists when project reaches a status | Should Have | Pending |
| PDF Export | Export completed checklist as a PDF report for records | Should Have | Pending |
| ~~File Attachments~~ | ~~Attach photos/documents to individual checklist items~~ | ~~Should Have~~ | Done |
| Notifications | Notify users when assigned to a checklist or item | Should Have | Pending |
| Permissions | RBAC for creating, editing, deleting, and completing checklists | Should Have | Pending |
| Bulk Operations | Bulk mark items as complete or N/A | Nice to Have | Pending |
| ~~Audit Log~~ | ~~Track all changes to checklist items with timestamps~~ | ~~Nice to Have~~ | Done |
| Offline Support | Allow checklist completion on mobile without connectivity | Nice to Have | Pending |
| Item Drag-and-Drop | Reorder items within groups via drag-and-drop | Nice to Have | Pending |

---

## Data Model Reference

### Template Layer (Resources > Templates)
```
checklistTemplates (Group - template)
  ├── id, name, description, type, createdBy, isArchived
  └── checklistTemplateGroups (Checklist - template)
       ├── id, templateId, name, order
       └── checklistTemplateItems (Item)
            ├── id, groupId, description, tooltip, order
            ├── responseType (checkbox|text|single_choice|multiple_choice)
            └── responseOptions (array of strings)
```

### Instance Layer (Project > Checklists)
```
checklistInstances (Group - project)
  ├── id, templateId, projectId, companyId, name, description
  ├── status (active|in_progress|completed|cancelled)
  ├── priority, dueDate, assigneeId, assigneeName
  ├── linkedTaskId, linkedScheduleItemId
  ├── completedAt, completedBy, completedByName
  └── checklistInstanceGroups (Checklist - project)
       ├── id, instanceId, name, order, status, priority
       ├── assigneeId, assigneeName
       ├── linkedTaskId, linkedScheduleItemId
       ├── completedAt, completedBy, completedByName
       └── checklistInstanceItems (Item - project)
            ├── id, instanceId, groupId, groupName, description, tooltip
            ├── order, groupOrder, isRequired
            ├── status (pending|completed|na)
            ├── responseType, responseOptions, textResponse, selectedResponses
            ├── assigneeId, assigneeName
            ├── completedAt, completedBy, completedByName
            ├── notes (JSON feed: [{author, date, text, system?}])
            └── attachmentIds (array of file keys, max 3 files, 10MB each)
```

### Audit Layer
```
checklistAuditEntries
  ├── id, instanceId, groupId, itemId, companyId, projectId
  ├── action (status_change|assignment_change|item_added|item_deleted|note_added|file_attached)
  ├── userId, userName
  ├── details (JSON: {field, oldValue, newValue, ...})
  └── createdAt
```

### Automation Layer
```
checklistStatusTriggers
  ├── id, companyId, projectStatus, templateId, isActive
  └── (trigger execution not yet implemented)
```

---

## Document Change Log

| Date | Changes |
|------|---------|
| 2026-02-12 | Initial user story document created based on comprehensive review of current implementation |
| 2026-02-13 | Updated terminology table to reflect Groups > Checklists > Items hierarchy |
| 2026-02-13 | US-CL055: Changed from "X icon delete" to 3-dot menu with Rename + Delete options |
| 2026-02-13 | US-CL063: Added system notes (completion/reopening), `system` flag, and `hasHumanNotes()` indicator logic |
| 2026-02-13 | US-CL080: Marked response type icons as implemented (Type, CircleDot, ListChecks) |
| 2026-02-13 | Marked file attachments as implemented (max 3 files, 10MB each, web + mobile) |
| 2026-02-13 | Marked audit log as implemented (checklistAuditEntries table, Activity Log in group menu) |
| 2026-02-13 | Added Audit Layer to data model reference |
| 2026-02-13 | Updated notes format in data model to include `system?` flag |
| 2026-02-13 | Fixed "Unknown" user display bug: uses `firstName`/`lastName` via `userDisplayName` helper |
