# BuildPro User Stories: Tasks

## Epic Overview

### Description
The Tasks system is the core work management feature of BuildPro, enabling builders and their teams to create, assign, track, and complete work items across projects and at the business level. Tasks integrate with calendars, support recurring schedules, and provide multiple views to suit different workflows.

### Business Value
- Centralizes all work items in one system
- Improves team accountability through clear assignments and due dates
- Reduces missed deadlines with reminders and calendar integration
- Supports both project-specific and business-wide task management
- Enables workflow customization through saved views and filters

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner, manages multiple projects | High-level overview of all tasks, delegation, deadline tracking |
| **Project Manager** | Manages specific projects | Task creation, assignment, progress tracking, team coordination |
| **Site Supervisor** | On-site team lead | View assigned tasks, update status, add notes, complete checklists |
| **Office Admin** | Administrative support | Business-level tasks, scheduling, document coordination |
| **Subcontractor** | External team member | View assigned tasks, mark completion, communicate issues |

---

## User Stories

### 1. Task Creation & Management

#### US-T001: Create a Task
**As a** project manager  
**I want to** create a new task with a title, description, due date, and priority  
**So that** I can capture work that needs to be done and track it in the system

**Acceptance Criteria:**
- [x] User can create a task from multiple entry points: *(Note #1)*
  - Global header "New" button → New Task option
  - Dashboard widgets (Tasks widget, My Tasks widget, My Day widget)
  - Tasks page (project-level and business-level)
  - Calendar views (click to add)
- [x] Task has required field: title
- [x] Task has optional fields: description, due date, priority, assignee, labels
- [x] Task is saved immediately and appears in relevant views
- [x] User receives confirmation of task creation
- [x] All users can create tasks *(Note #35)*
- [x] Default priority is "Low" when not specified *(Note #43)*
- [x] "Add Task" inline row available at bottom of list view *(Note #26)*

**Inline Creation Defaults:** *(Note #51)*
When tasks are created inline, the following data is automatically applied based on context:
- **Project List View**: `projectId` = current project, `taskContextType` = "project", `status` = default from field categories
- **Business List View**: `taskContextType` = "business", `status` = default from field categories, `projectId` = null (displays as "Business")
- **Kanban Column**: Inherits column's status (e.g., creating in "In Progress" column sets status to that column's key)
- **Task Modal (via + button)**: `projectId` from prop, `scope` derived (project if projectId given, business otherwise)
- **Server-side auto-derived**: `companyId`, `ownerId`, `ownerName` from authenticated user

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T002: Edit a Task
**As a** team member  
**I want to** edit task details after creation  
**So that** I can update information as requirements change

**Acceptance Criteria:**
- [x] User can edit all task fields from the task detail modal
- [x] Changes are saved automatically or on explicit save
- [x] All users can update tasks *(Note #37)*
- [ ] Edit history is preserved (activity feed)
- [ ] Other viewers see updates in real-time *(Note #7)*

**Modal Behavior:** *(Notes #5, #6)*
- When clicking a task **from the Tasks page**: Opens with full edit modal directly
- When clicking a task **from other pages, widgets, calendar**: Opens with detail modal first (read-only view)
- Detail modal has an "Edit" button that switches to the full edit modal

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T003: Delete a Task
**As a** project manager  
**I want to** delete tasks that are no longer needed  
**So that** I can keep my task list clean and relevant

**Acceptance Criteria:**
- [x] User can delete a task from the task detail modal (3-dot menu)
- [x] Confirmation dialog always appears: "Are you sure?" *(Note #8)*
- [x] Deleted tasks are removed from all views
- [ ] Deletion is logged in activity feed
- [ ] Delete permission is controlled by Roles & Permissions *(Note #38)*

**Priority:** Must Have  
**Status:** Implemented (core functionality complete, activity logging and permissions pending)

---

#### US-T004: Assign a Task
**As a** project manager  
**I want to** assign tasks to specific team members  
**So that** everyone knows who is responsible for each piece of work

**Acceptance Criteria:**
- [x] User can assign **multiple team members** to a task *(Note #28)*
- [x] Assignees can be selected from a searchable dropdown
- [x] Assignees can be changed inline from list view *(Note #50 - Fixed)*
- [x] Assigned users see the task in their personal task list
- [ ] Assignment changes trigger notifications *(Note #9)*

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T005: Set Task Priority
**As a** project manager  
**I want to** set priority levels on tasks (Urgent, High, Medium, Low)  
**So that** the team knows which tasks to focus on first

**Acceptance Criteria:**
- [x] Priority can be set during creation or editing
- [x] Priority is visually indicated (color, icon, badge)
- [x] Tasks can be filtered and sorted by priority
- [x] Default priority is "Low" *(Note #43)*
- [ ] Default priority is configurable at company level

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T006: Duplicate a Task
**As a** project manager  
**I want to** duplicate an existing task  
**So that** I can quickly create similar tasks without re-entering all details

**Acceptance Criteria:** *(Note #52)*
- [x] "Duplicate" option available in task 3-dot menu
- [x] Opens new task modal pre-filled with copied data:
  - Title appended with "(Copy)"
  - Same status, priority, assignees, labels
  - Checklist items copied (uncompleted)
- [x] No ID assigned until saved (creates new task)
- [x] User can modify any field before saving

**Priority:** Should Have  
**Status:** Implemented

---

#### US-T007: Make Task Private
**As a** team member  
**I want to** mark a task as private  
**So that** only assigned users can see it

**Acceptance Criteria:** *(Note #34)*
- [x] Toggle or option to mark task as "Private"
- [x] Private tasks only visible to assigned users
- [x] Private indicator shown on task card/row
- [ ] Admins can view all private tasks (configurable)

**Priority:** Should Have  
**Status:** Implemented

---

### 2. Task Views

#### US-T010: View Tasks in List Format
**As a** team member  
**I want to** view tasks in a sortable, filterable list  
**So that** I can quickly scan and find specific tasks

**Acceptance Criteria:**
- [x] List displays task title, status, assignee, due date, priority
- [x] Columns are resizable and reorderable
- [x] List supports sorting by any column
- [x] List supports filtering by status, assignee, priority, due date
- [x] Clicking a task opens the detail modal
- [x] Inline editing available for key fields (status, priority, assignee, due date) *(Note #50)*
- [x] "Add Task" inline row at bottom of table *(Note #26)*

**Consistency Requirement:** *(Note #45)*
- Tasks pages must look identical across Business, Personal, and Project contexts
- Same columns, styling, and behavior in all task list views

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T011: View Tasks in Kanban Board
**As a** project manager  
**I want to** view tasks on a Kanban board  
**So that** I can visualize workflow and move tasks through stages

**Acceptance Criteria:**
- [x] Board displays columns for each status (To Do, In Progress, Done)
- [x] Tasks are displayed as cards within columns
- [x] Cards can be dragged between columns to change status
- [x] Cards show key info: title, assignee, due date, priority
- [x] Columns show task count
- [x] Board can be grouped by different fields: status, priority, user, labels *(Note #10)*
- [x] Card visibility settings popover to select which data is shown *(Note #11)*
- [x] 3-dot menu on cards works correctly *(Note #44 - To Fix)*
- [ ] Project > Tasks drag-and-drop in board view *(Note #25 - To Fix)*

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T012: View Tasks in Calendar
**As a** team member  
**I want to** view tasks on a calendar  
**So that** I can see when work is due and plan my schedule

**Acceptance Criteria:**
- [x] Calendar shows month, week, and day views
- [x] Tasks appear on their due date
- [x] Tasks are color-coded by project (Notion-style colors)
- [x] Clicking a task opens the detail modal first (read-only) *(Note #2)*
- [x] User can switch to edit mode from the detail modal
- [x] Tasks can be dragged to reschedule

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T013: Save Custom Views
**As a** project manager  
**I want to** save my current filters and settings as a named view  
**So that** I can quickly return to frequently-used configurations

**Acceptance Criteria:**
- [x] User can save current filter/sort/group settings as a named view
- [x] Saved views appear in a dropdown for quick selection
- [x] Views can be edited and deleted
- [x] Views are personal to the user (not shared by default)
- [x] Saved views include both filters AND view style (list/board/calendar) *(Note #12)*
- [x] New views can be drag-and-drop reordered *(Note #24)*

**Filter Behavior:** *(Note #23)*
- Filter popovers should stay open until user clicks away
- Allows selecting multiple filter options before closing

**Priority:** Should Have  
**Status:** Implemented

---

### 3. Task Context

#### US-T020: Create Business-Level Tasks
**As a** office admin  
**I want to** create tasks that belong to the business rather than a specific project *(Note #13)*  
**So that** I can track administrative and operational work

**Acceptance Criteria:**
- [x] Tasks can be assigned to the business (not a project)
- [x] Business tasks appear in a dedicated Business Tasks view
- [x] Business tasks are accessible in the Business section of the app *(Note #14)*
- [x] Business tasks have the same features as project tasks

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T021: Create Project-Level Tasks
**As a** project manager  
**I want to** create tasks within a specific project  
**So that** all project-related work is organized together

**Acceptance Criteria:**
- [x] Tasks can be assigned to a specific project
- [x] Project tasks appear in the project's task list
- [x] Project tasks inherit project-level defaults (if configured)
- [ ] Tasks can be moved between projects

**Priority:** Must Have  
**Status:** Implemented

---

### 4. Recurring Tasks & Operational Task Templates

#### Terminology Clarification *(Notes #15, #16, #17, #40)*

| Term | Location | Description |
|------|----------|-------------|
| **Operational Task Templates** | Operations > Task Templates | Repeated operational tasks for the business. Visible in Default Diary view. These form the recurring operational rhythm of the business. |
| **Task Templates** | Resources > Templates > Tasks | Reusable task configurations that can be applied when creating new tasks or building Workflows in Operations. These are NOT recurring. |
| **Standard Recurring Tasks** | Any task with "Recurring" enabled | Simple repeating tasks created from any regular task with recurrence settings. |

**Naming Consideration:** *(Note #16)*
Consider renaming "Operational Task Templates" to better distinguish them. Options to consider:
- "Recurring Operations"
- "Operational Routines"
- "Weekly Operations"
- "Default Diary Tasks"

---

#### US-T030: Create Operational Task Template
**As a** operations manager  
**I want to** create recurring operational task templates  
**So that** regular business operations are automatically scheduled

**Acceptance Criteria:** *(Notes #15, #20, #21)*
- [x] User can create templates in Operations > Task Templates
- [x] User can set recurrence: daily, weekly, monthly
- [x] Daily recurrence has option to include/exclude weekends *(Note #20)*
- [x] User can specify which days of the week (for weekly)
- [x] User can set start and end dates for the recurrence
- [x] Template stores all task details to be copied to generated tasks
- [x] Templates visible in Default Diary view *(Note #15)*
- [x] When template is set to "Business" scope, task is assigned to business correctly *(Note #21 - To Verify)*

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T031: Standard Task Recurrence
**As a** team member  
**I want to** set a regular task to repeat on a schedule  
**So that** I don't have to manually recreate recurring work

**Acceptance Criteria:** *(Notes #18, #19, #27)*
- [x] Any standard task can have recurring settings enabled
- [x] Recurring options appear in the task edit modal
- [x] When task recurs, it copies status, assignee, etc. from the original task *(Note #27)*
- [x] System generates tasks 2 weeks in advance
- [x] Generated tasks are linked to their source task
- [x] Duplicate tasks are not created for the same date

**Important Distinction:** *(Note #19)*
Standard recurring tasks operate similarly to Operational Task Templates but come from a different place (individual tasks vs. Operations section).

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T032: Sync Template Changes to Generated Tasks
**As a** operations manager  
**I want to** update existing generated tasks when I modify a template  
**So that** changes apply to all relevant tasks

**Acceptance Criteria:** *(Note #47)*
- [x] Changes to Operational Task Template sync to future uncompleted tasks
- [x] Button labeled "Update Tasks" (or "Generate Tasks") applies changes
- [x] Example: Changing duration from 60 mins to 30 mins updates all existing operational tasks
- [x] Completed tasks and manually modified tasks are preserved
- [x] Completed checklist items are preserved during sync

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T033: Modify Individual Recurring Instance
**As a** team member  
**I want to** modify a single instance of a recurring task  
**So that** I can handle exceptions without changing the whole series

**Acceptance Criteria:**
- [x] User can edit a single instance without affecting others
- [x] Modified instances are preserved during template sync
- [x] User can reschedule individual instances (moves dueDate, occurrenceDate tracks original)
- [ ] Modified instances visually marked as "modified"

**Priority:** Should Have  
**Status:** Implemented

---

### 5. Task Checklists

#### US-T040: Add Checklist to Any Task
**As a** project manager  
**I want to** add a checklist of subtasks to any task  
**So that** I can break down complex work into steps

**Acceptance Criteria:** *(Notes #4, #29)*
- [x] User can add multiple checklist items to **any task** (not just templates)
- [x] Checklists available in task edit modal for all task types
- [x] Checklist items can be checked/unchecked
- [x] Checklist items can be reordered via drag-and-drop *(Note #22)*
- [x] Checklist items can be edited and deleted
- [x] Task shows checklist completion progress (e.g., "3/5")
- [x] Auto-complete: When all checklist items are completed, task status changes to "Done"
- [x] Unchecking an item on a completed task reverts status

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T041: Assign Checklist Items to Users
**As a** project manager  
**I want to** assign individual checklist items to specific users  
**So that** team members know which steps they're responsible for

**Acceptance Criteria:** *(Note #30)*
- [x] Each checklist item can have an assignee
- [x] Assignee must be someone already assigned to the parent task
- [x] Assignee shown with avatar on checklist item
- [x] "Unassigned" option to clear assignee

**Priority:** Should Have  
**Status:** Implemented

---

#### US-T042: Use Checklist Templates
**As a** project manager  
**I want to** apply predefined checklist templates to tasks  
**So that** I can quickly add standard checklists

**Acceptance Criteria:** *(Note #49)*
- [x] Checklist templates can be linked to tasks
- [x] Link to existing checklist groups from Checklists section
- [ ] Applied template items can be modified per-task
- [ ] Templates are organized by category

**Priority:** Should Have  
**Status:** Implemented

---

### 6. Task Labels

#### US-T045: Add Labels to Tasks
**As a** project manager  
**I want to** add labels/tags to tasks  
**So that** I can categorize and filter tasks by custom criteria

**Acceptance Criteria:** *(Note #3)*
- [x] User can add labels to a task from the task detail/edit modal
- [x] Labels displayed as colored badges on the task
- [x] Labels can be selected from a company-wide tag library
- [x] Custom fields available via "Activated Labels" system *(Note #3)*
- [x] Multiple labels can be applied to a single task
- [x] Labels can be removed from tasks
- [x] Tasks can be filtered by label
- [x] Board view supports grouping by labels

**Priority:** Should Have  
**Status:** Implemented

---

#### US-T046: Manage Task Tag Library
**As an** admin  
**I want to** create and manage a library of task tags  
**So that** the team has consistent labels to use across tasks

**Acceptance Criteria:**
- [ ] Admin can create new tags with name and color
- [ ] Admin can edit existing tag names and colors
- [ ] Admin can delete unused tags
- [x] Tags are company-wide and shared by all users

**Priority:** Should Have  
**Status:** Partial

---

### 7. Personal Workspace

#### US-T050: View My Tasks
**As a** team member  
**I want to** see all tasks assigned to me across all projects **and the business** *(Note #31)*  
**So that** I know what I need to work on

**Acceptance Criteria:**
- [x] My Tasks widget shows tasks where I am assignee
- [x] Includes both project tasks AND business tasks *(Note #31)*
- [x] Tasks are sorted by due date or priority
- [x] Overdue tasks are highlighted
- [x] Quick actions available (complete, reschedule)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T051: View My Day
**As a** team member  
**I want to** see today's tasks and calendar events in one view  
**So that** I can plan my day effectively

**Acceptance Criteria:**
- [x] My Day shows tasks due today
- [x] My Day shows calendar events for today
- [x] Items are displayed in chronological order
- [x] Quick actions available for tasks

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T052: View Week Calendar
**As a** team member  
**I want to** see my tasks and events for the current week  
**So that** I can plan ahead and manage my workload

**Acceptance Criteria:**
- [x] Week view shows 7 days with timeline
- [x] Tasks and events are displayed at their scheduled times
- [x] Tasks can be dragged to reschedule
- [x] Tasks can be resized to change duration

**Priority:** Should Have  
**Status:** Implemented

---

### 8. Reminders & Notifications

#### US-T060: Set Task Reminder
**As a** team member  
**I want to** set a reminder for a task  
**So that** I don't forget about upcoming deadlines

**Acceptance Criteria:** *(Notes #32, #53, #54)*
- [x] User can set reminder time (e.g., 1 hour before, 1 day before)
- [x] Reminder appears in notification bell at scheduled time *(Note #53)*
- [x] User can set multiple reminders per task
- [x] Reminders can be set during task **creation** (not just editing) *(Note #54)*
- [x] Reminder notification defaults to task name *(Note #54)*
- [ ] Reminders can be dismissed or snoozed

**How Reminders Work:** *(Note #32)*
1. User sets reminder in task modal (creation or edit)
2. ReminderProcessor runs every minute checking for due reminders
3. When reminder fires, creates entry in `notifications` table
4. Notification appears in NotificationBell with link to task

**Priority:** Should Have  
**Status:** Implemented

---

#### US-T061: Task Assignment Notifications
**As a** team member  
**I want to** receive a notification when I'm assigned to a task  
**So that** I know about new responsibilities

**Acceptance Criteria:** *(Note #9)*
- [ ] User receives notification when assigned by another team member
- [ ] Notification includes task title and assigner name
- [ ] Notification links to the task
- [ ] Can be enabled/disabled per user

**Priority:** Should Have  
**Status:** Planned

---

### 9. Task Duration & Time

#### US-T070: Set Task Duration
**As a** team member  
**I want to** set start and end times for a task  
**So that** I can schedule work blocks in my calendar

**Acceptance Criteria:** *(Note #48)*
- [x] Task has start time and end time fields
- [x] Duration can be set via text box or time selector
- [x] Auto-duration calculation available
- [ ] Require end time to save task when start time is set *(Note #48 - To Implement)*

**Priority:** Should Have  
**Status:** Implemented

---

### 10. Permissions & Access Control

#### US-T080: Task Permissions
**As an** admin  
**I want to** control who can create, view, edit, and delete tasks  
**So that** I can manage access appropriately for different team members

**Acceptance Criteria:** *(Notes #33, #35-39, #46)*

| Permission | Default | Description |
|------------|---------|-------------|
| **Create** | All users | All users can create tasks *(Note #35)* |
| **Read** | All users | All users can see tasks *(Note #36)* |
| **Update** | All users | All users can update tasks *(Note #37)* |
| **Delete** | Configurable | Permission toggle - lower ranked users can be restricted *(Note #38)* |

- [ ] Tasks section available in Roles & Permissions settings *(Note #39)*
- [ ] Permission checks enforced on all task operations
- [ ] Private tasks visible only to assignees regardless of permissions *(Note #34)*

**Priority:** Should Have  
**Status:** Planned (needs Roles & Permissions integration)

---

### 11. Bulk Operations

#### US-T090: Bulk Task Operations
**As a** project manager  
**I want to** select and update multiple tasks at once  
**So that** I can efficiently manage large numbers of tasks

**Acceptance Criteria:** *(Note #41)*
- [ ] Multi-select mode in list view
- [ ] Bulk status change
- [ ] Bulk assignee change
- [ ] Bulk delete with confirmation
- [ ] Bulk reschedule

**Implementation Consideration:** *(Note #41)*
How should bulk selection work?
- Checkbox on each row?
- Shift+click range selection?
- Select all in current filter?

**Priority:** Should Have  
**Status:** Planned

---

### 12. File Attachments

#### US-T095: Attach Files to Tasks
**As a** team member  
**I want to** attach files to a task  
**So that** relevant documents are easily accessible

**Acceptance Criteria:** *(Note #42)*
- [x] "Upload File" option in task modal dropdown menu
- [x] "From Google Drive" option to link Drive files
- [x] Files stored in Replit Object Storage
- [x] Attachments displayed in task detail view
- [ ] Attachments can be downloaded or removed

**Priority:** Should Have  
**Status:** Implemented

---

## Current State Summary

### Implemented Features
- Full task CRUD operations with confirmation dialogs
- List, Kanban, and Calendar views with consistent styling
- Task assignment to multiple users with inline editing
- Business-level and project-level task contexts
- Operational Task Templates with Default Diary view
- Standard task recurrence (daily, weekly, monthly)
- Template sync to generated tasks (preserving completed items)
- Checklists on all tasks with drag-and-drop reordering
- Checklist item assignment to task assignees
- Personal workspace (My Tasks, My Day, Week Calendar)
- Saved views with filters and view style combined
- Drag-and-drop rescheduling in calendar
- Task reminders with notification bell integration
- Reminder setting during task creation
- Task labels/tags with company-wide tag library
- Multiple task creation entry points (header, widgets, pages, calendar, inline)
- Detail modal opens first from calendar/widgets (view before edit)
- Board view grouping by status, priority, labels, user
- Card visibility settings in board view
- Task duplication with copied checklist items
- Private task toggle
- File attachments (Object Storage and Google Drive)

### Known Issues to Fix
- *(Note #25)* Project > Tasks board view drag-and-drop not working
- *(Note #44)* Board view 3-dot menu on cards not working
- *(Note #45)* Task pages need identical styling across business/personal/project
- *(Note #21)* Verify business task templates assign correctly

### Pending Implementation
- *(Note #7)* Real-time updates for other viewers
- *(Note #9)* Assignment notifications
- *(Note #38)* Delete permission in Roles & Permissions
- *(Note #39)* Tasks section in Roles & Permissions
- *(Note #41)* Bulk operations
- *(Note #46)* Notifications settings per section
- *(Note #48)* Require end time when start time is set

---

## Task Templates Distinction *(Notes #15, #17, #40)*

### Operational Task Templates (Operations > Task Templates)
- Purpose: Repeated operational tasks that form the business rhythm
- Location: Operations section
- Behavior: Auto-generate tasks based on schedule
- View: Visible in Default Diary
- Example: "Weekly Site Inspection", "Friday Payroll Review"

### Task Templates (Resources > Templates > Tasks)
- Purpose: Reusable task configurations for quick task creation
- Location: Resources > Templates
- Behavior: Applied on-demand when creating new tasks
- Use Case: Building Workflows in Operations, quick task creation
- Example: "New Project Kickoff Checklist", "Client Handover Tasks"

**These are separate concepts and should not be confused.**

---

## Future Enhancements

| Enhancement | Description | Priority | Notes |
|-------------|-------------|----------|-------|
| Task Dependencies | Link tasks that must complete before others can start | Nice to Have | |
| Time Tracking | Log time spent on tasks | Nice to Have | |
| Task Comments | Add threaded comments to tasks | Should Have | |
| Real-time Collaboration | See others' changes without refresh | Should Have | Note #7 |
| Mobile Offline | View and update tasks without internet | Nice to Have | |

---

## Permissions Reference *(Note #46)*

Each section of the app should have its own Roles & Permissions and Notifications settings. For Tasks:

### Task Permissions (to be added to Roles & Permissions)
- `tasks.create` - Create new tasks
- `tasks.read` - View tasks
- `tasks.update` - Edit task details
- `tasks.delete` - Delete tasks
- `tasks.assign` - Assign users to tasks
- `tasks.manage_templates` - Create/edit Operational Task Templates

### Task Notifications (to be added to Notification Settings)
- Task assigned to me
- Task I created was completed
- Task reminder due
- Task due date approaching
- Checklist item assigned to me

---

## Document Change Log

| Date | Changes |
|------|---------|
| 2026-02-04 | Comprehensive update incorporating all 54 requirement notes |
| 2026-02-04 | Added checklist drag-and-drop reorder (Bug #22) |
| 2026-02-04 | Fixed inline assignee editing (Bug #50) |
| 2026-02-04 | Added sections: Duplicate Task, Private Tasks, Permissions, Bulk Operations |
| 2026-02-04 | Clarified Operational Task Templates vs Task Templates distinction |
| 2026-02-04 | Added inline creation defaults documentation |
| 2026-02-04 | Added reminder creation during new task creation |

---

## Notes Reference

The following notes were incorporated into this document:

1. Task creation entry points - US-T001
2. Calendar modal behavior - US-T012
3. Custom fields/Labels - US-T045
4. Checklists on all tasks - US-T040
5. Modal behavior from Tasks page vs other pages - US-T002
6. Detail modal edit button - US-T002
7. Real-time updates - US-T002, Future
8. Delete confirmation - US-T003
9. Assignment notifications - US-T061
10. Board grouping options - US-T011
11. Card visibility settings - US-T011
12. Saved views include view style - US-T013
13. Business tasks clarification - US-T020
14. Business section access - US-T020
15. Operational Task Templates in Default Diary - US-T030
16. Naming consideration - Terminology section
17. Template distinction - Terminology section
18. Standard recurring different from templates - US-T031
19. Same behavior, different source - US-T031
20. Daily recurrence weekend option - US-T030
21. Business template assignment - US-T030
22. Checklist drag-and-drop - US-T040
23. Filter popover behavior - US-T013
24. View reordering - US-T013
25. Board drag-and-drop issue - Known Issues
26. Add Task inline row - US-T001, US-T010
27. Recurring copies original settings - US-T031
28. Multiple assignees - US-T004
29. Checklists on all tasks - US-T040
30. Checklist item assignee - US-T041
31. My Tasks includes business - US-T050
32. Reminder mechanism - US-T060
33. Permissions section needed - US-T080
34. Private tasks - US-T007
35-38. Permission defaults - US-T080
39. Tasks in Roles & Permissions - US-T080
40. Template distinction - Terminology section
41. Bulk operations - US-T090
42. File attachments - US-T095
43. Default priority Low - US-T005
44. Board 3-dot menu issue - Known Issues
45. Consistent task pages - US-T010, Known Issues
46. Per-section permissions/notifications - Permissions Reference
47. Template sync to tasks - US-T032
48. Task duration/end time - US-T070
49. Attach checklists - US-T042
50. Inline assignee editing - US-T004
51. Inline creation defaults - US-T001
52. Duplicate task - US-T006
53. Reminder notifications - US-T060
54. Reminder on creation - US-T060
