# BuildPro User Stories: Schedule

## Epic Overview

### Description
The Schedule system is the backbone of project timeline management for residential builders. It provides a unified view of all project activities — tasks, milestones, inspections, deliveries, and meetings — across three complementary views: **Gantt chart**, **Calendar**, and **List**. The system supports dependencies between items, drag-and-drop reordering and resizing, hierarchical parent/child nesting, offline/online/locked status modes, reusable templates, CSV/Excel import, and a dashboard widget for at-a-glance project timeline visibility. Each schedule belongs to a single project, and schedule items can be linked to contacts (assignees), cost codes, checklists, tasks, and site diary entries.

### Terminology & Hierarchy

The schedule system uses a two-level hierarchy: **Schedule > Schedule Items**, with optional nesting via parent/child relationships.

| System Term | User-Facing Term | Description |
|-------------|-----------------|-------------|
| Schedule | Project Schedule | A per-project container holding all timeline items; has offline/online/locked status |
| Schedule Item | Item / Activity | An individual activity within a schedule (task, milestone, inspection, delivery, meeting) |
| Parent Item | Stage / Phase | A top-level schedule item that has children nested beneath it |
| Child Item | Sub-item | A schedule item nested under a parent for organisational grouping |
| Dependency | Dependency / Link | A relationship between two items defining execution order (FS, SS, FF, SF) |
| Schedule Template | Template | A reusable schedule blueprint saved from an existing schedule and applied to new projects |
| Template Item | Template Item | An item definition within a template (no dates, no assignees — just structure) |
| Activity Note | Note / Activity | Manual notes or system-generated activity log entries attached to items |
| Baseline | Baseline (planned) | Stored original start/end dates for tracking schedule variance (schema only, not yet rendered) |

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Schedule** | A project-level container (one per project) with offline/online/locked status |
| **Schedule Item** | An individual activity within a schedule (task, milestone, inspection, delivery, meeting) |
| **Dependency** | A relationship between two schedule items defining execution order (FS, SS, FF, SF) |
| **Template** | A reusable schedule blueprint that can be applied to new projects |
| **Activity Note** | Manual notes or system-generated activity log entries attached to schedule items |
| **Baseline** | Stored original start/end dates for tracking schedule variance (schema only, not yet rendered) |

### Status Modes

The schedule operates in three modes:

| Mode | Icon | Behaviour |
|------|------|-----------|
| **Offline** | Red dot | Schedule is in draft/planning mode. Only visible to the project team internally. Editable. |
| **Online** | Green dot | Schedule is published and visible. Editable. |
| **Locked** | Lock icon | Schedule is frozen. No edits allowed. Used to preserve a snapshot for contract or compliance purposes. |

### Business Value
- Provides builders with a visual timeline of all project activities
- Enables proactive identification of delays through dependency tracking
- Supports contract compliance by locking schedules at milestones
- Reduces data entry through templates and CSV/Excel import
- Improves field-to-office communication via mobile app access
- Links schedule items to cost codes for budget timeline correlation
- Tracks actual vs. planned dates for variance analysis

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner | High-level project timeline overview, locked schedule snapshots, cross-project visibility via dashboard widget |
| **Project Manager** | Manages project timeline | Create and adjust schedule items, manage dependencies, track progress, import from templates |
| **Site Supervisor** | On-site team lead | View upcoming activities on mobile, update item status and progress, add activity notes |
| **Subcontractor** | External trade | View assigned schedule items (when schedule is Online), understand upcoming work windows |
| **Office Admin** | Administrative support | Import schedules from spreadsheets, manage templates, apply templates to new projects |

---

## Feature Map

### 1. Schedule Container Management

#### US-SCH-001: Auto-Create Schedule
**As a** project manager,
**I want** a schedule to be automatically created when I navigate to the Schedule tab,
**So that** I don't have to manually initialise it.

**Acceptance Criteria:**
- When a user navigates to a project's Schedule page, if no schedule exists, one is auto-created with status "offline"
- The schedule is created with the default name "Project Schedule"
- Only one schedule can exist per project (enforced by unique constraint on `projectId`)

**Current Implementation:** Fully implemented. The `useEffect` in `Schedule.tsx` calls `createScheduleMutation` if no schedule is found.

---

#### US-SCH-002: Toggle Schedule Status (Offline / Online / Locked)
**As a** project manager,
**I want** to toggle my schedule between Offline, Online, and Locked states,
**So that** I can control visibility and prevent unwanted edits.

**Acceptance Criteria:**
- A toggle button in the header shows the current status (green dot = Online, red dot = Offline)
- Clicking the toggle switches between Offline and Online
- Locked status prevents all edits (Add Item, Load Template, Import buttons are disabled)
- Locked status records who locked it and when (`lockedBy`, `lockedByName`, `lockedAt`)

**Current Implementation:** Offline/Online toggle is implemented. Locked state disables action buttons. The Gantt view also has its own Online confirmation dialog for additional safety.

---

### 2. Schedule Items (CRUD)

#### US-SCH-003: Create Schedule Item
**As a** project manager,
**I want** to create schedule items with details including name, type, dates, assignee, priority, and parent grouping,
**So that** I can build out my project timeline.

**Acceptance Criteria:**
- "Add Item" button opens a dialog with fields: Name, Description, Notes, Type, Status, Priority, Start Date, End Date, Assignee, Parent Item, Progress %
- Type options: Task, Milestone, Inspection, Delivery, Meeting
- Priority options: Low, Medium, High, Urgent
- Status options are configurable via Field Settings (company-level)
- Assignee is selected from the Contacts list using a searchable dropdown
- Parent Item dropdown shows top-level items only (for nesting)
- Item is created with a `scheduleId` linking it to the project schedule
- Description and Notes fields are collapsible (auto-expand only if content exists)
- Form validation requires: Name, Start Date, End Date

**Current Implementation:** Fully implemented via dialog in `Schedule.tsx`.

---

#### US-SCH-004: Edit Schedule Item
**As a** project manager,
**I want** to edit existing schedule items,
**So that** I can adjust the timeline as the project progresses.

**Acceptance Criteria:**
- Clicking a schedule item in any view opens the edit dialog pre-populated with current values
- All fields from creation are editable
- Changes are saved via PATCH to `/api/schedule-items/:id`
- After saving, the item list refreshes automatically

**Current Implementation:** Fully implemented. The same dialog is reused for create and edit.

---

#### US-SCH-005: Inline Status Update
**As a** site supervisor,
**I want** to quickly change an item's status without opening the full edit dialog,
**So that** I can update progress efficiently from the field.

**Acceptance Criteria:**
- In List view: a status dropdown on each row allows inline status change
- In Gantt view: the status column shows a clickable badge that opens a status picker
- Status options come from Field Settings (configurable per company)
- Status changes use semantic colours from the configured options

**Current Implementation:** Fully implemented in both List view (CasvaScheduleList) and Gantt view.

---

#### US-SCH-006: Inline Completion Toggle
**As a** site supervisor,
**I want** to toggle an item between 0% and 100% complete with a single click,
**So that** I can quickly mark items done.

**Acceptance Criteria:**
- A checkbox or completion indicator on each row toggles between 0% and 100%
- The progress percent is stored and reflected in the Gantt bar fill

**Current Implementation:** Implemented in List view. Gantt view also supports drag-to-adjust progress on bars.

---

#### US-SCH-007: Delete Schedule Items (Single and Bulk)
**As a** project manager,
**I want** to delete individual or multiple schedule items,
**So that** I can clean up my schedule.

**Acceptance Criteria:**
- Individual delete via item context menu (Gantt) or action button
- Bulk delete via checkbox selection + "Delete Selected" button
- Bulk delete endpoint: `POST /api/schedule-items/bulk-delete` with `{ itemIds, projectId }`
- Deleting a parent item cascades to its children (enforced by DB foreign key)
- Confirmation dialog before destructive action

**Current Implementation:** Both single and bulk delete are implemented.

---

#### US-SCH-008: Duplicate Schedule Item
**As a** project manager,
**I want** to duplicate an existing schedule item,
**So that** I can quickly create similar items without re-entering all details.

**Acceptance Criteria:**
- "Duplicate" option available in the item context menu (Gantt view)
- Creates a copy with the same properties except ID and timestamps
- The duplicate appears in the schedule immediately

**Current Implementation:** Implemented in Gantt view context menu.

---

### 3. Gantt View

#### US-SCH-010: Gantt Chart Display
**As a** project manager,
**I want** to see my schedule as a Gantt chart with a left panel listing items and a right panel showing timeline bars,
**So that** I can visualise the project timeline.

**Acceptance Criteria:**
- Split-panel layout: left panel with item details, right panel with timeline bars
- Left panel shows: Task Name column + configurable columns (Status, Notes, Completion %, Assignee)
- Timeline bars are coloured by item colour, assigned contact colour, or type colour (fallback chain)
- Progress is shown as a filled portion within each bar
- Weekend columns are visually distinguished (lighter background)
- Current date (today) line is rendered on the timeline
- Parent items show child items nested beneath them, collapsible via chevron
- The left panel and timeline scroll are synchronised vertically

**Current Implementation:** Fully implemented in `Gantt.tsx` (~2950 lines).

---

#### US-SCH-011: Gantt Zoom Levels
**As a** project manager,
**I want** to zoom in and out of the timeline,
**So that** I can see daily detail or a monthly overview.

**Acceptance Criteria:**
- Three zoom levels: Day, Week, Month
- Day: Each column = 1 day, header shows day number + day name
- Week: Each column = 1 week, header shows "Wk N" with date range
- Month: Each column = 1 month, header shows month name
- Zoom controls (+/-) in the toolbar
- Zoom preference is saved per user (persisted via user view preferences)

**Current Implementation:** Fully implemented with Day/Week/Month zoom. Preferences auto-saved via debounced mutation.

---

#### US-SCH-012: Gantt Drag & Drop (Move and Resize Bars)
**As a** project manager,
**I want** to drag timeline bars to move items and drag the edges to resize them,
**So that** I can adjust the schedule visually.

**Acceptance Criteria:**
- Drag the centre of a bar to move it (shifts start + end dates by the same delta)
- Drag the left edge to adjust start date
- Drag the right edge to adjust end date
- Visual feedback during drag (bar follows cursor)
- On drop, the item is updated via PATCH API
- Minimum bar width of 1 day is enforced

**Current Implementation:** Fully implemented with mouse event handlers for move, resize-left, and resize-right operations.

---

#### US-SCH-013: Gantt Dependencies
**As a** project manager,
**I want** to create and manage dependencies between schedule items,
**So that** I can model the logical sequence of construction activities.

**Acceptance Criteria:**
- Four dependency types: Finish-to-Start (FS), Start-to-Start (SS), Finish-to-Finish (FF), Start-to-Finish (SF)
- Dependencies are created by dragging from one bar's anchor point to another bar's anchor point
- Anchor point position determines dependency type:
  - End → Start = FS (most common)
  - Start → Start = SS
  - End → End = FF
  - Start → End = SF
- Dependencies are rendered as connector lines (SVG paths) between bars
- Circular dependency detection prevents invalid links
- Dependencies can be deleted via click on the connector line or context menu
- Dependency details (type, lag) are stored in the `dependencies` JSON array on the schedule item
- Lag days (positive = delay, negative = lead) are supported in the schema

**Current Implementation:** Dependency creation via drag-and-drop is implemented. SVG connector rendering is implemented with all four types. Circular dependency validation is server-side. Hover and selection states on dependency lines. Delete via click on selected dependency.

---

#### US-SCH-014: Gantt Row Reordering (Drag & Drop)
**As a** project manager,
**I want** to drag rows in the left panel to reorder schedule items,
**So that** I can organise items in my preferred sequence.

**Acceptance Criteria:**
- Drag handle (grip icon) on each row in the left panel
- Uses @dnd-kit for accessible drag-and-drop
- Reorder is session-only (resets on page refresh) — does not persist to server
- Batch sort endpoint exists (`POST /api/schedule-items/batch-sort`) but is not currently connected to row drag

**Current Implementation:** Session-based row reordering is implemented. Server persistence of sort order via batch-sort endpoint is available but not wired to the drag interaction.

**Known Limitation:** Row order resets on page refresh. The batch-sort API exists but is not called after drag.

---

#### US-SCH-015: Gantt Column Configuration
**As a** project manager,
**I want** to show/hide and reorder columns in the Gantt left panel,
**So that** I can focus on the information I need.

**Acceptance Criteria:**
- Configurable columns: Status, Notes icon, Completion %, Assignee avatar
- Task Name and Menu columns are always visible
- Column visibility toggles via a "Columns" popover
- Column order is drag-reorderable within the popover
- Column widths are adjustable by dragging column borders
- All preferences (visibility, order, widths, left panel width) are saved per user via user view preferences API
- Preferences auto-save with a 1-second debounce

**Current Implementation:** Fully implemented with `@dnd-kit` for column reordering and user preference persistence.

---

#### US-SCH-016: Gantt Context Menu
**As a** project manager,
**I want** a right-click context menu on Gantt bars,
**So that** I can quickly access actions like edit, duplicate, and delete.

**Acceptance Criteria:**
- Right-click on a Gantt bar shows a context menu
- Menu options include: Edit, Duplicate, Delete, Set Colour
- Context menu positions near the cursor
- Clicking outside the menu closes it

**Current Implementation:** Implemented with dropdown menu options for edit, duplicate, delete, and colour picker.

---

#### US-SCH-017: Gantt Colour Picker
**As a** project manager,
**I want** to assign custom colours to schedule items,
**So that** I can visually categorise items on the Gantt chart.

**Acceptance Criteria:**
- Colour picker accessible via the context menu or dedicated icon
- Colour is saved to the `color` field on the schedule item
- If no custom colour is set, fallback chain: contact's `scheduleColor` → type colour
- Colour persists and is visible across all three views

**Current Implementation:** Implemented via `ScheduleColorPicker` component accessible from the Gantt context menu.

---

#### US-SCH-018: Gantt Progress Drag
**As a** project manager,
**I want** to drag the progress fill on a Gantt bar to adjust the completion percentage,
**So that** I can quickly update progress visually.

**Acceptance Criteria:**
- Dragging horizontally on the progress fill area adjusts `progressPercent` (0–100)
- Visual feedback shows the fill adjusting in real-time
- On release, the new percentage is saved via PATCH API

**Current Implementation:** Implemented with mouse drag handlers and real-time visual feedback.

---

#### US-SCH-019: Gantt Infinite Scroll Timeline
**As a** project manager,
**I want** the Gantt timeline to extend beyond the current item date range,
**So that** I can plan ahead without being constrained.

**Acceptance Criteria:**
- Timeline includes buffer days before the earliest item and after the latest item
- Default buffer: 14 days before, 28 days after
- The timeline auto-adjusts as items are added or moved

**Current Implementation:** Implemented via `timelineBuffer` state with configurable before/after padding.

---

### 4. List View

#### US-SCH-020: List View Display
**As a** project manager,
**I want** to see my schedule items in a tabular list format,
**So that** I can quickly scan and sort through items.

**Acceptance Criteria:**
- Table with configurable columns: Item (name), Assignee, Due Date, Status, Completion
- Parent/child hierarchy with collapsible groups
- Checkbox selection for bulk actions
- Inline status change via dropdown on each row
- Inline completion toggle via checkbox
- Note count indicator linking to activity notes
- Items show their type via coloured badges or indicators
- Click on a row opens the edit dialog

**Current Implementation:** Fully implemented via `CasvaScheduleList` and `CasvaScheduleRow` components.

---

#### US-SCH-021: List View Column Visibility
**As a** project manager,
**I want** to show/hide columns in the List view,
**So that** I can customise the table to my workflow.

**Acceptance Criteria:**
- Columns popover with checkboxes to toggle: Item, Assignee, Due Date, Status, Completion
- Column visibility is saved to `localStorage` (per-browser, not per-user)

**Current Implementation:** Implemented. Uses `localStorage` for persistence (not user view preferences like the Gantt view).

**Discrepancy:** List view uses `localStorage` while Gantt view uses the user view preferences API. Ideally both should use the same persistence mechanism for consistency.

---

### 5. Calendar View

#### US-SCH-030: Calendar View Display
**As a** project manager,
**I want** to see my schedule items on a calendar,
**So that** I can understand the timeline in a familiar date-based layout.

**Acceptance Criteria:**
- Calendar supports four sub-views: Month, Week, Day, Agenda
- Schedule items appear as events spanning their start-to-end date range
- Events are styled with the lilac brand colour (`#bba7db`)
- Weekend days have a distinct background colour
- Clicking an event opens the edit dialog
- Navigation controls (prev/next) move through calendar periods
- "Today" button returns to the current date

**Current Implementation:** Implemented using `react-big-calendar` with Moment.js localiser (en-gb locale). Custom CSS in `schedule-calendar.css`.

---

### 6. Search & Filters

#### US-SCH-040: Schedule Item Search
**As a** project manager,
**I want** to search schedule items by name, description, or assignee,
**So that** I can quickly find specific items.

**Acceptance Criteria:**
- Search input in the toolbar
- Filters across item name, description, and assignee name
- Results update in real-time as the user types
- Search applies to all three views (Gantt, List, Calendar)

**Current Implementation:** Implemented. Search is shared across views via the `ScheduleViewContext`.

---

#### US-SCH-041: Schedule Item Filters
**As a** project manager,
**I want** to filter schedule items by status, type, assignee, and date range,
**So that** I can focus on specific subsets of my schedule.

**Acceptance Criteria:**
- Filter dropdowns for: Status (from Field Settings), Type, Assignee (from Contacts), Date Range
- Date range options: All, Today, This Week, This Month, Overdue
- Filters apply to all three views
- Active filter count shown as a badge
- Filters can be reset to defaults

**Current Implementation:** Fully implemented with filter dropdowns in the toolbar. Filters are shared across views via context.

---

### 7. Templates

#### US-SCH-050: Save Schedule as Template
**As a** project manager,
**I want** to save my current schedule as a reusable template,
**So that** I can apply the same sequence of items to future projects.

**Acceptance Criteria:**
- "Save as Template" button in the Schedule toolbar (or via dropdown)
- Dialog prompts for: Template Name, Description, Category
- Template data includes: item name, description, notes, type, priority, duration, sort order
- Templates do not include: specific dates, assignees, or project-specific IDs
- Saved templates appear in the Schedule Templates page (Resources section)

**Current Implementation:** Implemented. Save mutation strips items to template-safe properties.

---

#### US-SCH-051: Load Template into Schedule
**As a** project manager,
**I want** to apply a template to my current schedule,
**So that** I can quickly populate a new project's timeline.

**Acceptance Criteria:**
- "Load Template" button opens a dialog listing available templates
- Selecting a template and confirming applies it via `POST /api/schedule-templates/:id/apply`
- Template items are created as new schedule items with dates calculated relative to the current date
- Existing items in the schedule are preserved (template items are appended)
- The template category and item count are shown in the selection dialog

**Current Implementation:** Implemented via `loadTemplateMutation` in `Schedule.tsx`.

---

#### US-SCH-052: Schedule Templates Management Page
**As a** builder/owner,
**I want** a dedicated page to manage all my schedule templates,
**So that** I can create, edit, duplicate, and delete templates.

**Acceptance Criteria:**
- Accessible via Resources > Schedule Templates in the navigation
- Lists all templates with: Name, Category, Item Count, Created Date
- Search templates by name
- Actions per template: Edit, Duplicate, Delete
- Click on a template navigates to the Template Detail page

**Current Implementation:** Implemented in `ScheduleTemplates.tsx` (1073 lines).

---

#### US-SCH-053: Schedule Template Detail Page
**As a** project manager,
**I want** to view and edit the items within a schedule template,
**So that** I can refine my template before applying it.

**Acceptance Criteria:**
- Shows template metadata (name, description, category) in an editable header
- Lists template items in both List and Gantt views
- Supports adding, editing, deleting, and reordering items within the template
- Items have: Name, Description, Duration, Type, Priority, Sort Order
- "Apply to Project" button allows applying the template to a selected project
- Excel import supported for bulk-adding items to the template
- Back navigation returns to the templates list

**Current Implementation:** Implemented in `ScheduleTemplateDetail.tsx` (1345 lines). Supports List/Gantt view toggle, item CRUD, and apply-to-project functionality.

---

### 8. Import / Export

#### US-SCH-060: Import Schedule from CSV/Excel
**As a** office admin,
**I want** to import schedule items from a CSV or Excel file,
**So that** I can migrate existing schedules from other software.

**Acceptance Criteria:**
- "Import" button opens the import dialog
- Supports CSV and Excel (.xlsx, .xls) file formats (parsed via `xlsx` library)
- Three-step wizard: 1) Upload file, 2) Map columns, 3) Preview and confirm
- Column mapping supports: Category, Name, Description, Duration, Assignee, Predecessors, Predecessor Relation
- Preview table shows mapped data before import
- Items are created via `POST /api/schedule-items/bulk-create`
- Import respects the current schedule's ID
- Error handling for invalid file formats or missing required fields

**Current Implementation:** Fully implemented in `ImportScheduleDialog.tsx` (670 lines). Three-step wizard with column mapping, preview, and bulk creation.

---

#### US-SCH-061: Export Schedule (Stub)
**As a** project manager,
**I want** to export my schedule as a PDF or spreadsheet,
**So that** I can share it with clients and stakeholders.

**Acceptance Criteria:**
- Export button exists in the toolbar (Download icon)
- Clicking it should generate a downloadable file

**Current Implementation:** The export button exists in the UI but has no functionality wired to it. This is a stub.

**Known Bug:** Export button is non-functional.

---

### 9. Activity Notes

#### US-SCH-070: Activity Notes on Schedule Items
**As a** project manager,
**I want** to add notes and see system-generated activity on schedule items,
**So that** I can track context and history for each item.

**Acceptance Criteria:**
- Activity notes panel accessible from each schedule item (via notes icon)
- Two note types: "user" (manual) and "system" (auto-generated)
- User notes include: author name, timestamp, content text
- Note count badge shown on the Gantt and List views
- Batch note count API (`POST /api/activity-notes/batch-counts`) for efficient loading
- Notes are ordered by creation date (newest first or oldest first)

**Current Implementation:** Implemented via `ActivityNotesPopover` component. Note counts are batch-loaded for all visible items.

---

### 10. Item Nesting / Hierarchy

#### US-SCH-080: Parent/Child Item Nesting
**As a** project manager,
**I want** to nest schedule items under parent items (stages/phases),
**So that** I can organise my schedule hierarchically.

**Acceptance Criteria:**
- Items can be assigned a `parentItemId` to create a hierarchy
- Parent items show a collapse/expand chevron
- Child items are indented under their parent in both Gantt and List views
- When creating an item, a "Parent Item" dropdown shows top-level items only
- Deleting a parent cascades to its children (DB foreign key)
- Nest/un-nest via drag-and-drop in the List view (`onNestItem` callback)

**Current Implementation:** Implemented in both Gantt and List views. Gantt renders children indented with collapsible parents.

---

### 11. Dashboard Widget

#### US-SCH-090: Schedule Dashboard Widget
**As a** builder/owner,
**I want** a schedule widget on my project dashboard,
**So that** I can see upcoming activities without navigating to the full schedule.

**Acceptance Criteria:**
- Widget appears on the project dashboard with configurable placement
- Four view modes: List, Day, Week, Month
- **List view:** Shows upcoming items sorted by date with status badges and assignee avatars
- **Day view:** Hour-by-hour timeline for the selected day, items positioned by start/end time
- **Week view:** Day columns with items stacked vertically
- **Month view:** Calendar grid with dot indicators for days that have items
- Navigation controls to move between days/weeks/months
- "Today" button returns to the current date
- Click on an item navigates to the full schedule page
- Timezone-aware date rendering via `useTimezone` hook
- Respects company week start day setting

**Current Implementation:** Fully implemented in `ScheduleWidget.tsx` (1124 lines). Registered in the widget registry.

---

### 12. Mobile App (Expo/React Native)

#### US-SCH-100: Mobile Schedule Screen
**As a** site supervisor,
**I want** to view and manage my project schedule on my mobile device,
**So that** I can stay up-to-date and update progress from the field.

**Acceptance Criteria:**
- Accessible via the Projects tab (project detail) or the More tab
- Three view modes: List, Gantt, Calendar
- Project selector dropdown at the top (grouped by project phase: Construction, Pre-construction, Lead, Post-construction)
- **List view:** Scrollable list of items with type colour indicator, status badge, assignee, and date range
- **Gantt view:** Horizontal scrollable Gantt chart with item bars on a day-column grid
- **Calendar view:** Month/Week/Day modes with items shown on their dates
- Item detail modal with: status update, progress slider, notes, and activity notes
- Add new item modal with: Name, Type, Start Date, End Date, Priority, Description, Notes
- Pull-to-refresh for data reload
- Dark mode support with lilac accent colours

**Current Implementation:** Fully implemented in `ScheduleScreen.tsx` (1733 lines).

---

#### US-SCH-101: Mobile Activity Notes
**As a** site supervisor,
**I want** to add and view activity notes on schedule items from my phone,
**So that** I can record on-site observations.

**Acceptance Criteria:**
- Activity notes section within the item detail modal
- Shows existing notes with author and timestamp
- Text input to add new notes
- Notes sync to the server immediately

**Current Implementation:** Implemented within the mobile schedule detail modal.

---

#### US-SCH-102: Mobile Schedule Item Creation
**As a** site supervisor,
**I want** to create new schedule items from the mobile app,
**So that** I can add items discovered in the field.

**Acceptance Criteria:**
- "+" floating action button on the schedule screen
- Add modal with: Name, Type (picker), Start Date, End Date, Priority (picker), Description, Notes
- Item is created via `POST /api/schedule-items` with the project's schedule ID
- The list refreshes after creation

**Current Implementation:** Implemented with a modal form and type/priority picker modals.

---

### 13. Cross-Feature Integrations

#### US-SCH-110: Link to Cost Codes
**As a** project manager,
**I want** to link schedule items to cost codes,
**So that** I can correlate timeline activities with budget categories.

**Acceptance Criteria:**
- Schedule items have `costCodeId` and `costCodeTitle` fields
- Linkage established during item creation or editing

**Current Implementation:** Schema supports it. UI for cost code selection is not prominently surfaced in the current item dialog.

---

#### US-SCH-111: Link to Checklists
**As a** project manager,
**I want** to link checklists to schedule items,
**So that** I can track quality control alongside the timeline.

**Acceptance Criteria:**
- Schedule items have a `checklistIds` JSON array
- Linked checklists are referenced by ID

**Current Implementation:** Schema supports it. UI for managing checklist links is not yet implemented in the item dialog.

---

#### US-SCH-112: Link to Tasks
**As a** project manager,
**I want** to link tasks to schedule items,
**So that** I can associate detailed task work with timeline activities.

**Acceptance Criteria:**
- Schedule items have a `taskIds` JSON array
- Linked tasks are referenced by ID

**Current Implementation:** Schema supports it. UI for managing task links is not yet implemented in the item dialog.

---

#### US-SCH-113: Link to Site Diary Entries
**As a** project manager,
**I want** to link site diary entries to schedule items,
**So that** I can connect daily field records to the timeline.

**Acceptance Criteria:**
- Schedule items have a `siteDiaryEntryIds` JSON array
- Linked entries are referenced by ID

**Current Implementation:** Schema supports it. UI for managing diary links is not yet implemented in the item dialog.

---

#### US-SCH-114: Link to Scope Stages
**As a** project manager,
**I want** to link schedule items to scope stages,
**So that** I can see how timeline activities align with the project scope.

**Acceptance Criteria:**
- Schedule items have a `scopeStageId` field (optional)
- Linkage established during item creation or via the scope section
- API endpoint: `POST /api/scope/:scopeItemId/link-schedule`

**Current Implementation:** Schema and API route are implemented. Scope-to-schedule linking is functional.

---

## API Reference

### Schedule Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectId/schedule` | Get the schedule for a project |
| POST | `/api/schedules` | Create a new schedule |
| PATCH | `/api/schedules/:id` | Update schedule metadata |
| PUT | `/api/schedules/:id/status` | Update schedule status (offline/online/locked) |
| DELETE | `/api/schedules/:id` | Delete a schedule |

### Schedule Item Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectId/schedule-items` | Get all items for a project's schedule |
| GET | `/api/schedules/:scheduleId/items` | Get items by schedule ID |
| GET | `/api/schedule-items/all` | Get all schedule items (cross-project) |
| GET | `/api/schedule-items/:id` | Get a single item |
| POST | `/api/schedule-items` | Create a schedule item |
| PATCH | `/api/schedule-items/:id` | Update a schedule item |
| POST | `/api/schedule-items/bulk` | Bulk update items |
| POST | `/api/schedule-items/bulk-create` | Bulk create items (import) |
| POST | `/api/schedule-items/batch-sort` | Batch update sort order |
| DELETE | `/api/schedule-items/:id` | Delete an item |
| POST | `/api/schedule-items/bulk-delete` | Bulk delete items |

### Dependency Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/schedule-items/:id/dependencies` | Add a dependency |
| PATCH | `/api/schedule-items/:id/dependencies/:predecessorId` | Update a dependency |
| DELETE | `/api/schedule-items/:id/dependencies/:predecessorId` | Remove a dependency |

### Activity Note Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schedule-items/:scheduleItemId/activity-notes` | Get notes for an item |
| POST | `/api/schedule-items/:scheduleItemId/activity-notes` | Add a note |
| POST | `/api/activity-notes/batch-counts` | Get note counts for multiple items |

### Template Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schedule-templates` | List all templates |
| GET | `/api/schedule-templates/:id` | Get a template |
| POST | `/api/schedule-templates` | Create a template |
| PATCH | `/api/schedule-templates/:id` | Update a template |
| DELETE | `/api/schedule-templates/:id` | Delete a template |
| POST | `/api/schedule-templates/:id/apply` | Apply template to a schedule |

---

## Data Model

### Schedule Table

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID, auto-generated |
| projectId | varchar (FK, unique) | One schedule per project |
| name | text | Default: "Project Schedule" |
| status | text | "offline" / "online" / "locked" |
| description | text | Optional |
| startDate | timestamp | Optional |
| endDate | timestamp | Optional |
| notes | text | Optional |
| createdBy | varchar (FK) | User who created |
| lockedBy | varchar (FK) | User who locked (if locked) |
| lockedByName | text | Cached name |
| lockedAt | timestamp | When locked |
| isArchived | boolean | Default: false |
| createdAt | timestamp | Auto |
| updatedAt | timestamp | Auto |

### Schedule Item Table

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID, auto-generated |
| scheduleId | varchar (FK) | Parent schedule |
| scopeStageId | varchar (FK) | Optional scope stage link |
| name | text | Required |
| description | text | Optional |
| type | text | "task" / "milestone" / "inspection" / "delivery" / "meeting" |
| status | text | Configurable via Field Settings |
| priority | text | "low" / "medium" / "high" / "urgent" |
| startDate | timestamp | Required |
| endDate | timestamp | Required |
| startTime | text | Optional HH:MM format |
| endTime | text | Optional HH:MM format |
| duration | integer | Days (default: 1) |
| actualStartDate | timestamp | Actual start for variance tracking |
| actualEndDate | timestamp | Actual end for variance tracking |
| assignedToId | varchar (FK) | Contact assigned |
| assignedToName | text | Cached for performance |
| assignedToColor | text | From contact's scheduleColor |
| groupId | varchar | Phase/stage grouping |
| groupName | text | Group display name |
| costCodeId | varchar (FK) | Linked cost code |
| costCodeTitle | text | Cached |
| dependencies | json | Array of `{ id, type, lag }` objects |
| predecessorIds | json | Legacy: array of item IDs |
| progressPercent | integer | 0–100 |
| completedAt | timestamp | When marked complete |
| notes | text | Plain text notes |
| notesHtml | text | Rich text notes |
| checklistIds | json | Array of checklist IDs |
| taskIds | json | Array of task IDs |
| attachments | json | Array of `{ url, name, type, size }` |
| siteDiaryEntryIds | json | Array of diary entry IDs |
| parentItemId | varchar (FK, self) | For nesting hierarchy |
| baselineStartDate | timestamp | Original planned start |
| baselineEndDate | timestamp | Original planned end |
| color | text | Custom colour override |
| sortOrder | integer | Display order |
| isCollapsed | boolean | Whether children are collapsed |
| createdAt | timestamp | Auto |
| updatedAt | timestamp | Auto |

---

## File Map

| File | Purpose | Lines |
|------|---------|-------|
| `shared/schema.ts` | Data model definitions for schedules, schedule items, activity notes, templates | ~200 lines of schedule schema |
| `client/src/pages/Schedule.tsx` | Main schedule page with view switching, item CRUD dialog, template/import controls | ~1836 |
| `client/src/pages/Gantt.tsx` | Gantt chart component with timeline rendering, drag/drop, dependencies, colour picker | ~2950 |
| `client/src/pages/ScheduleTemplates.tsx` | Template management list page | ~1073 |
| `client/src/pages/ScheduleTemplateDetail.tsx` | Template detail/edit page with item management and apply-to-project | ~1345 |
| `client/src/components/schedule/CasvaScheduleList.tsx` | List view table component | ~377 |
| `client/src/components/schedule/CasvaScheduleRow.tsx` | Individual row component for list view | varies |
| `client/src/components/schedule/ImportScheduleDialog.tsx` | CSV/Excel import wizard (3-step) | ~670 |
| `client/src/components/schedule/ScheduleColorPicker.tsx` | Colour picker for Gantt bars | varies |
| `client/src/components/widgets/ScheduleWidget.tsx` | Dashboard widget with List/Day/Week/Month views | ~1124 |
| `client/src/components/ActivityNotesPopover.tsx` | Activity notes popover for schedule items | varies |
| `client/src/contexts/ScheduleViewContext.tsx` | Shared context for schedule state across views | varies |
| `expo-mobile/src/screens/ScheduleScreen.tsx` | Mobile schedule screen with List/Gantt/Calendar views | ~1733 |
| `client/src/pages/schedule-calendar.css` | Custom CSS overrides for react-big-calendar | varies |
| `server/routes.ts` | API routes for all schedule endpoints | ~30 routes |

---

## Known Bugs

| # | Bug | Severity | Area |
|---|-----|----------|------|
| 1 | **Export button is non-functional** — The download button in the schedule toolbar exists but has no click handler or export logic | Medium | Schedule toolbar |
| 2 | **Row drag order not persisted** — Dragging rows to reorder in Gantt view only persists for the session; refreshing the page resets order. The batch-sort API exists but is not called | Low | Gantt view |
| 3 | **List view column preferences use localStorage** — Unlike the Gantt view which uses the user view preferences API, the List view saves column visibility to `localStorage`, meaning preferences don't sync across devices or browsers | Low | List view |

---

## Discoverability Issues

| # | Issue | Impact | Recommendation |
|---|-------|--------|----------------|
| 1 | **Dependency creation via drag is not documented in the UI** — Users must discover that dragging from bar edges creates dependencies; no tooltip or onboarding hint exists | High | Add a help tooltip or first-use guide on the Gantt view |
| 2 | **Progress drag on Gantt bars is hidden** — The ability to drag the progress fill within a bar is not visually indicated | Medium | Add a progress handle or cursor change on hover over the progress region |
| 3 | **Context menu requires right-click** — Right-click is uncommon on touch devices; the context menu (edit, duplicate, delete, colour) is not accessible via a long-press or visible button on touch screens | Medium | Add a "more" (three-dot) menu button on each bar for touch access |
| 4 | **Anchor points for dependency creation are not visible until hover** — Users must hover over bar edges to see the dependency anchors appear | Low | Consider making anchors subtly visible at all times, or showing them when a "link" mode is activated |

---

## Schema-Only Features (Not Yet Implemented in UI)

These fields exist in the database schema but have no UI for viewing or editing:

| Field | Description | Recommendation |
|-------|-------------|----------------|
| `baselineStartDate` / `baselineEndDate` | Baseline tracking for variance analysis | Render as a ghost bar behind the actual bar on the Gantt chart |
| `actualStartDate` / `actualEndDate` | Actual dates vs. planned dates | Show variance metrics in item detail or dashboard widget |
| `attachments` | File attachments on schedule items | Add an attachments section in the item edit dialog |
| `notesHtml` | Rich text notes | Integrate a rich text editor (Tiptap) in the notes field |
| `startTime` / `endTime` | Time-of-day for items | Show in the Calendar day view and item detail |
| `checklistIds` / `taskIds` / `siteDiaryEntryIds` | Cross-feature links | Add link management UI in the item edit dialog |
| `isCollapsed` | Persisted collapse state | Connect to Gantt collapse/expand so it persists server-side |
| `lag` (in dependencies) | Lead/lag days for dependency offsets | Add a lag input when creating/editing dependencies |

---

## Future Enhancements

| # | Enhancement | Priority | Complexity | Status |
|---|------------|----------|------------|--------|
| 1 | **Critical path highlighting** — Highlight the longest chain of dependent items | High | High | Not started |
| 2 | **Baseline comparison rendering** — Ghost bars showing original vs. current dates | High | Medium | Schema ready |
| 3 | **Export to PDF/Excel** — Wire the existing export button to generate downloadable files | High | Medium | Not started |
| 4 | **Persist row drag order** — Call batch-sort API after row drag in Gantt | Medium | Low | API ready |
| 5 | **Cross-feature link management UI** — UI for linking checklists, tasks, and diary entries to items | Medium | Medium | Schema ready |
| 6 | **Attachment management** — File upload/download on schedule items | Medium | Medium | Schema ready |
| 7 | **Rich text notes** — Replace plain text notes with Tiptap editor | Medium | Low | Schema ready |
| 8 | **Dependency lag/lead UI** — Input for lag days when creating dependencies | Medium | Low | Schema ready |
| 9 | **Non-working days configuration** — Define public holidays and custom non-working days | Medium | Medium | Not started |
| 10 | **Resource leveling** — Auto-adjust schedule to avoid over-allocation of contacts | Low | High | Not started |
| 11 | **Gantt zoom to fit** — Auto-zoom to fit all items on screen | Low | Low | Not started |
| 12 | **Mobile dependency viewing** — Show dependency lines on the mobile Gantt view | Low | Medium | Not started |
| 13 | **Schedule comparison (snapshot diff)** — Compare two locked schedule snapshots side-by-side | Low | High | Not started |
| 14 | **Auto-schedule (dependency-driven dates)** — Automatically adjust downstream dates when a predecessor moves | Low | High | Not started |
| 15 | **Unified list/gantt column preferences** — Migrate List view to use user view preferences API | Low | Low | Not started |
| 16 | **Weather integration on schedule** — Show weather forecasts for upcoming outdoor activities | Low | Medium | Not started |
