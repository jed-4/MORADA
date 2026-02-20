# Notes & Tasks - User Stories

## Epic Overview
Notes & Tasks is a unified system where the notes table serves dual purpose for both notes and tasks (type: "note" | "task"). Notes support rich text editing via Tiptap, while tasks include assignment, due dates, checklists, subtasks, and recurring schedules. Both can be scoped to personal, project, business, or system contexts, and organised into groups with template support for standardised workflows.

## Business Value
Australian residential builders need a flexible system to capture everything from quick site observations to structured task assignments. By unifying notes and tasks, builders can seamlessly transition a site observation into an actionable task without switching tools. Scoping ensures personal notes stay private while project notes are shared with the team. Templates with custom fields standardise common workflows like pre-start inspections or handover checklists, reducing errors and ensuring consistency across projects.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Create and manage tasks, assign work, track progress |
| Site Supervisor | Field Manager | Capture site notes, create tasks from observations |
| Admin | Office Administrator | Manage business-level notes and task templates |
| Team Member | General User | View assigned tasks, create personal notes and memos |

## User Stories

### US-NT001: Create a Note
**As a** Builder/PM, **I want to** create a new note, **so that** I can capture important information about a project or business matter.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create note with title and rich text content
- [ ] Select scope (personal, project, business)
- [ ] Set optional category, priority, and colour
- [ ] Support tags and labels for organisation
- [ ] Note created via POST /api/notes

---

### US-NT002: Create a Task
**As a** Builder/PM, **I want to** create a new task, **so that** I can assign work items to my team with clear deadlines.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create task with title, description, and type set to "task"
- [ ] Set status (todo, in-progress, done)
- [ ] Assign to one or multiple team members via assigneeIds
- [ ] Set due date and optional start/end times
- [ ] Set priority level (low, medium, high, urgent)
- [ ] Select task context (project or business)

---

### US-NT003: Rich Text Editing
**As a** Builder/PM, **I want to** use rich text formatting in my notes, **so that** I can create well-structured documents with headings, lists, and emphasis.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Tiptap editor with toolbar for formatting options
- [ ] Support headings, bold, italic, underline, strikethrough
- [ ] Support ordered and unordered lists
- [ ] Support code blocks and blockquotes
- [ ] Store content as HTML (contentHtml) and plain text (contentText) for search
- [ ] Content field stores raw editor state

---

### US-NT004: Scope Notes to Personal Context
**As a** Team Member, **I want to** create personal notes visible only to me, **so that** I can keep private observations and reminders.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set scope to "personal" when creating a note
- [ ] Personal notes only visible to the creator
- [ ] isPrivate flag for additional privacy control
- [ ] Personal notes accessible from user workspace

---

### US-NT005: Scope Notes to Project Context
**As a** Builder/PM, **I want to** create notes scoped to a specific project, **so that** the project team can access shared information.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set scope to "project" with associated project ID
- [ ] Project notes visible to all project team members
- [ ] Display project name in note listing
- [ ] Filter notes by project context

---

### US-NT006: Scope Notes to Business Context
**As an** Admin, **I want to** create business-level notes, **so that** company-wide information is accessible to all team members.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set scope to "business" for company-wide notes
- [ ] Business notes visible to all company users
- [ ] taskContextType set to "business" for business tasks
- [ ] Access business notes from the business section

---

### US-NT007: Assign Tasks to Team Members
**As a** Builder/PM, **I want to** assign tasks to one or more team members, **so that** responsibilities are clear and work is distributed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select multiple assignees via assigneeIds array
- [ ] Store assignee display names in assigneeNames
- [ ] Show assignee avatars on task cards
- [ ] Filter tasks by assignee
- [ ] Assignees receive notification of new assignment

---

### US-NT008: Set Due Dates and Time Ranges
**As a** Builder/PM, **I want to** set due dates and time ranges on tasks, **so that** my team knows when work needs to be completed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Date picker for dueDate field
- [ ] Optional startTime and endTime for time-specific tasks
- [ ] Record completedAt timestamp when task marked done
- [ ] Display overdue indicator for past-due tasks
- [ ] Sort tasks by due date

---

### US-NT009: Manage Task Checklists
**As a** Builder/PM, **I want to** add checklists to tasks, **so that** I can break down work into smaller steps and track completion.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add checklist items as JSON array on the task
- [ ] Mark individual checklist items as complete/incomplete
- [ ] Show checklist progress (e.g., 3/5 items done)
- [ ] Reorder checklist items
- [ ] Delete checklist items

---

### US-NT010: Create Subtasks
**As a** Builder/PM, **I want to** create subtasks under a parent task, **so that** I can decompose complex work into manageable pieces.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set parentTaskId to create hierarchical task relationship
- [ ] Display subtasks nested under parent task
- [ ] Track subtask completion independently
- [ ] Parent task shows subtask progress summary
- [ ] Navigate between parent and subtask views

---

### US-NT011: Set Up Recurring Tasks
**As a** Builder/PM, **I want to** create recurring tasks, **so that** regular activities like site inspections are automatically scheduled.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Configure recurrence pattern (daily, weekly, monthly)
- [ ] Set recurrence frequency and interval
- [ ] Define recurrence end date or occurrence count
- [ ] Auto-generate next task instance when current one completes
- [ ] Store recurring configuration fields on the task

---

### US-NT012: Organise Notes into Groups
**As a** Builder/PM, **I want to** organise notes and tasks into groups/folders, **so that** I can categorise related items together.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create note groups via note-groups CRUD endpoints
- [ ] Assign notes/tasks to groups via groupId
- [ ] Display groups as folders in the sidebar
- [ ] Reorder groups via PATCH reorder endpoint
- [ ] Move notes between groups

---

### US-NT013: Create Note Templates
**As an** Admin, **I want to** create note and task templates, **so that** my team can use standardised formats for common items.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create templates via note-templates CRUD endpoints
- [ ] Define template with default title, content, category, and priority
- [ ] Templates available when creating new notes/tasks
- [ ] Apply template to pre-fill note/task fields
- [ ] Manage templates from NoteTemplates.tsx

---

### US-NT014: Add Custom Fields to Templates
**As an** Admin, **I want to** add custom fields to note templates, **so that** templates can capture project-specific data.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add custom fields to templates via fields CRUD endpoints
- [ ] Support field types (text, number, date, select, checkbox)
- [ ] Reorder fields within a template
- [ ] Custom field values stored on note instances
- [ ] Validate required custom fields on submission

---

### US-NT015: Archive Notes and Tasks
**As a** Builder/PM, **I want to** archive completed notes and tasks, **so that** my active list stays clean while preserving historical records.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Archive note/task via POST /api/notes/:id/archive
- [ ] Set archivedAt timestamp on the record
- [ ] Hide archived items from default view
- [ ] Unarchive via POST /api/notes/:id/unarchive
- [ ] Filter to show/hide archived items

---

### US-NT016: Tag and Label Notes
**As a** Builder/PM, **I want to** add tags and labels to notes and tasks, **so that** I can categorise and filter items across multiple dimensions.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add multiple tags to a note/task
- [ ] Add labels for visual categorisation
- [ ] Filter notes/tasks by tag or label
- [ ] Display tags and labels on note/task cards
- [ ] Auto-suggest existing tags when typing

---

### US-NT017: Set Note/Task Colour
**As a** Team Member, **I want to** assign colours to notes and tasks, **so that** I can visually distinguish different types of items.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Colour picker with predefined colour options
- [ ] Apply colour to note/task card background or accent
- [ ] Colour visible in list and detail views
- [ ] Colour persisted on the note record

---

### US-NT018: Mark Tasks as Private
**As a** Team Member, **I want to** mark certain tasks as private, **so that** sensitive items are only visible to me and assigned users.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle isPrivate flag on task
- [ ] Private tasks visible only to creator and assignees
- [ ] Show privacy indicator icon on task card
- [ ] Private tasks excluded from team-wide views

---

### US-NT019: Search and Filter Notes/Tasks
**As a** Builder/PM, **I want to** search and filter notes and tasks, **so that** I can quickly find specific items.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Full-text search across title, contentText fields
- [ ] Filter by type (note/task), scope, status, priority
- [ ] Filter by assignee, due date range, tags
- [ ] Sort by created date, due date, priority
- [ ] Real-time search results as user types

---

### US-NT020: Update Task Status
**As a** Team Member, **I want to** update my task status, **so that** the team can see progress on assigned work.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Change status between todo, in-progress, and done
- [ ] Set completedAt timestamp when marked as done
- [ ] Clear completedAt when moving back from done
- [ ] Status change reflected in real-time for other viewers
- [ ] Update via PATCH /api/notes/:id

---

### US-NT021: View Notes in Detail
**As a** Builder/PM, **I want to** view a note or task in full detail, **so that** I can see all information including content, assignments, and history.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display full rich text content
- [ ] Show all metadata (assignees, due date, priority, status)
- [ ] Display checklist with progress
- [ ] Show subtasks list
- [ ] Display tags, labels, and custom field values
- [ ] Edit note/task inline from detail view

---

### US-NT022: Delete Notes and Tasks
**As a** Builder/PM, **I want to** delete notes and tasks, **so that** I can remove items that are no longer needed.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete note/task via DELETE /api/notes/:id
- [ ] Show confirmation dialog before deletion
- [ ] Remove associated subtasks and checklist data
- [ ] Refresh list after deletion

---

### US-NT023: Link Tasks to Checklist Instances
**As a** Builder/PM, **I want to** link tasks to checklist instances, **so that** tasks generated from checklists maintain their context.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set checklistInstanceId on task record
- [ ] Navigate from task to originating checklist
- [ ] Display checklist context on task detail
- [ ] Tasks linked to checklists inherit relevant metadata

---

## Technical Notes
- Notes and tasks share the same database table with type field distinguishing them
- Content stored in three formats: raw (content), HTML (contentHtml), plain text (contentText) for rendering and search
- Tiptap editor used on frontend for rich text editing
- Assignees stored as arrays (assigneeIds, assigneeNames) supporting multi-assignment
- Checklist stored as JSON array on the note record
- Subtasks use parentTaskId for hierarchical relationships
- Recurring task fields store recurrence configuration (pattern, frequency, interval, end conditions)
- Note groups support reordering via dedicated endpoint
- Note templates support custom fields with their own CRUD and reorder endpoints
- Notes.tsx (1732 lines) is the primary frontend component
- Scope determines visibility: personal (creator only), project (team), business (company), system (internal)

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notes | List notes/tasks with filters |
| POST | /api/notes | Create a new note or task |
| GET | /api/notes/:id | Get note/task details |
| PATCH | /api/notes/:id | Update a note or task |
| DELETE | /api/notes/:id | Delete a note or task |
| POST | /api/notes/:id/archive | Archive a note or task |
| POST | /api/notes/:id/unarchive | Unarchive a note or task |
| GET | /api/note-groups | List note groups |
| POST | /api/note-groups | Create a note group |
| PATCH | /api/note-groups/:id | Update a note group |
| DELETE | /api/note-groups/:id | Delete a note group |
| PATCH | /api/note-groups/reorder | Reorder note groups |
| GET | /api/note-templates | List note templates |
| POST | /api/note-templates | Create a note template |
| PATCH | /api/note-templates/:id | Update a note template |
| DELETE | /api/note-templates/:id | Delete a note template |
| GET | /api/note-templates/:id/fields | List template custom fields |
| POST | /api/note-templates/:id/fields | Add a custom field to template |
| PATCH | /api/note-template-fields/:id | Update a template custom field |
| DELETE | /api/note-template-fields/:id | Delete a template custom field |
| PATCH | /api/note-template-fields/reorder | Reorder template custom fields |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /notes | Notes.tsx | Notes and tasks listing with filters |
| /projects/:projectId/notes | Notes.tsx | Project-scoped notes and tasks |
| /note-templates | NoteTemplates.tsx | Manage note and task templates |

## Known Issues / Future Enhancements
- [ ] No drag-and-drop for task status changes (kanban board)
- [ ] No file attachments directly on notes/tasks
- [ ] No @mention support in note content
- [ ] No real-time collaborative editing
- [ ] No email notifications for task assignments
- [ ] No time tracking on tasks
- [ ] No task dependencies (blocked by / blocks)
- [ ] No Gantt view for task timelines
- [ ] No bulk task operations (assign, status change, archive)
- [ ] No calendar integration for task due dates

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 23
- Implemented: 23
- Partially Implemented: 0
- Not Implemented: 0
