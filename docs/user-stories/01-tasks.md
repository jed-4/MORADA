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
- [ ] User can create a task from multiple entry points (quick add, task list, calendar)
- [ ] Task has required field: title
- [ ] Task has optional fields: description, due date, priority, assignee
- [ ] Task is saved immediately and appears in relevant views
- [ ] User receives confirmation of task creation

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T002: Edit a Task
**As a** team member  
**I want to** edit task details after creation  
**So that** I can update information as requirements change

**Acceptance Criteria:**
- [ ] User can edit all task fields from the task detail modal
- [ ] Changes are saved automatically or on explicit save
- [ ] Edit history is preserved (activity feed)
- [ ] Other viewers see updates in real-time or on refresh

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T003: Delete a Task
**As a** project manager  
**I want to** delete tasks that are no longer needed  
**So that** I can keep my task list clean and relevant

**Acceptance Criteria:**
- [ ] User can delete a task from the task detail modal (3-dot menu)
- [ ] Confirmation dialog prevents accidental deletion
- [ ] Deleted tasks are removed from all views
- [ ] Deletion is logged in activity feed

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T004: Assign a Task
**As a** project manager  
**I want to** assign tasks to specific team members  
**So that** everyone knows who is responsible for each piece of work

**Acceptance Criteria:**
- [ ] User can assign one or more team members to a task
- [ ] Assignees can be selected from a searchable dropdown
- [ ] Assigned users see the task in their personal task list
- [ ] Assignment changes trigger notifications (if enabled)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T005: Set Task Priority
**As a** project manager  
**I want to** set priority levels on tasks (Urgent, High, Medium, Low)  
**So that** the team knows which tasks to focus on first

**Acceptance Criteria:**
- [ ] Priority can be set during creation or editing
- [ ] Priority is visually indicated (color, icon, badge)
- [ ] Tasks can be filtered and sorted by priority
- [ ] Default priority is configurable at company level

**Priority:** Must Have  
**Status:** Implemented

---

### 2. Task Views

#### US-T010: View Tasks in List Format
**As a** team member  
**I want to** view tasks in a sortable, filterable list  
**So that** I can quickly scan and find specific tasks

**Acceptance Criteria:**
- [ ] List displays task title, status, assignee, due date, priority
- [ ] Columns are resizable and reorderable
- [ ] List supports sorting by any column
- [ ] List supports filtering by status, assignee, priority, due date
- [ ] Clicking a task opens the detail modal

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T011: View Tasks in Kanban Board
**As a** project manager  
**I want to** view tasks on a Kanban board  
**So that** I can visualize workflow and move tasks through stages

**Acceptance Criteria:**
- [ ] Board displays columns for each status (To Do, In Progress, Done)
- [ ] Tasks are displayed as cards within columns
- [ ] Cards can be dragged between columns to change status
- [ ] Cards show key info: title, assignee, due date, priority
- [ ] Columns show task count

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T012: View Tasks in Calendar
**As a** team member  
**I want to** view tasks on a calendar  
**So that** I can see when work is due and plan my schedule

**Acceptance Criteria:**
- [ ] Calendar shows month, week, and day views
- [ ] Tasks appear on their due date
- [ ] Tasks are color-coded by project or priority
- [ ] Clicking a task opens the detail modal
- [ ] Tasks can be dragged to reschedule

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T013: Save Custom Views
**As a** project manager  
**I want to** save my current filters and settings as a named view  
**So that** I can quickly return to frequently-used configurations

**Acceptance Criteria:**
- [ ] User can save current filter/sort/group settings as a named view
- [ ] Saved views appear in a dropdown for quick selection
- [ ] Views can be edited and deleted
- [ ] Views are personal to the user (not shared by default)

**Priority:** Should Have  
**Status:** Implemented

---

### 3. Task Context

#### US-T020: Create Business-Level Tasks
**As a** office admin  
**I want to** create tasks that belong to the business, not a specific project  
**So that** I can track administrative and operational work

**Acceptance Criteria:**
- [ ] Tasks can be created without a project assignment
- [ ] Business tasks appear in a dedicated Business Tasks view
- [ ] Business tasks are accessible from the main navigation
- [ ] Business tasks have the same features as project tasks

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T021: Create Project-Level Tasks
**As a** project manager  
**I want to** create tasks within a specific project  
**So that** all project-related work is organized together

**Acceptance Criteria:**
- [ ] Tasks can be assigned to a specific project
- [ ] Project tasks appear in the project's task list
- [ ] Project tasks inherit project-level defaults (if configured)
- [ ] Tasks can be moved between projects

**Priority:** Must Have  
**Status:** Implemented

---

### 4. Recurring Tasks

#### US-T030: Create Recurring Task Template
**As a** project manager  
**I want to** create a recurring task that repeats on a schedule  
**So that** regular work items are automatically generated

**Acceptance Criteria:**
- [ ] User can set recurrence: daily, weekly, monthly, or custom
- [ ] User can specify which days of the week (for weekly)
- [ ] User can set start and end dates for the recurrence
- [ ] Template stores all task details to be copied to generated tasks

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T031: Generate Recurring Task Instances
**As a** system  
**I want to** automatically generate task instances from recurring templates  
**So that** users don't have to manually create repeating tasks

**Acceptance Criteria:**
- [ ] System generates tasks 2 weeks in advance
- [ ] Generated tasks are linked to their template
- [ ] Duplicate tasks are not created for the same date
- [ ] Changes to template sync to future uncompleted tasks

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T032: Modify Individual Recurring Instance
**As a** team member  
**I want to** modify a single instance of a recurring task  
**So that** I can handle exceptions without changing the whole series

**Acceptance Criteria:**
- [ ] User can edit a single instance without affecting others
- [ ] Modified instances are marked as "modified"
- [ ] Template changes don't overwrite modified instances
- [ ] User can reschedule individual instances

**Priority:** Should Have  
**Status:** Implemented

---

### 5. Task Checklists

#### US-T040: Add Checklist to Task
**As a** project manager  
**I want to** add a checklist of subtasks to a task  
**So that** I can break down complex work into steps

**Acceptance Criteria:**
- [ ] User can add multiple checklist items to a task
- [ ] Checklist items can be checked/unchecked
- [ ] Checklist items can be reordered
- [ ] Checklist items can be edited and deleted
- [ ] Task shows checklist completion progress

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T041: Use Checklist Templates
**As a** project manager  
**I want to** apply predefined checklist templates to tasks  
**So that** I can quickly add standard checklists

**Acceptance Criteria:**
- [ ] Checklist templates can be created and saved
- [ ] Templates can be applied to any task
- [ ] Applied template items can be modified per-task
- [ ] Templates are organized by category

**Priority:** Should Have  
**Status:** Implemented

---

### 6. Personal Workspace

#### US-T050: View My Tasks
**As a** team member  
**I want to** see all tasks assigned to me across all projects  
**So that** I know what I need to work on

**Acceptance Criteria:**
- [ ] My Tasks widget shows tasks where I am assignee
- [ ] Tasks are sorted by due date or priority
- [ ] Overdue tasks are highlighted
- [ ] Quick actions available (complete, reschedule)

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T051: View My Day
**As a** team member  
**I want to** see today's tasks and calendar events in one view  
**So that** I can plan my day effectively

**Acceptance Criteria:**
- [ ] My Day shows tasks due today
- [ ] My Day shows calendar events for today
- [ ] Items are displayed in chronological order
- [ ] Quick actions available for tasks

**Priority:** Must Have  
**Status:** Implemented

---

#### US-T052: View Week Calendar
**As a** team member  
**I want to** see my tasks and events for the current week  
**So that** I can plan ahead and manage my workload

**Acceptance Criteria:**
- [ ] Week view shows 7 days with timeline
- [ ] Tasks and events are displayed at their scheduled times
- [ ] Tasks can be dragged to reschedule
- [ ] Tasks can be resized to change duration

**Priority:** Should Have  
**Status:** Implemented

---

### 7. Reminders & Notifications

#### US-T060: Set Task Reminder
**As a** team member  
**I want to** set a reminder for a task  
**So that** I don't forget about upcoming deadlines

**Acceptance Criteria:**
- [ ] User can set reminder time (e.g., 1 hour before, 1 day before)
- [ ] Reminder appears in the system at scheduled time
- [ ] User can set multiple reminders per task
- [ ] Reminders can be dismissed or snoozed

**Priority:** Should Have  
**Status:** Implemented

---

## Current State Summary

### Implemented Features
- Full task CRUD operations
- List, Kanban, and Calendar views
- Task assignment and priority
- Business-level and project-level tasks
- Recurring tasks with templates
- Checklists within tasks
- Personal workspace (My Tasks, My Day, Week Calendar)
- Saved views with filters
- Drag-and-drop rescheduling
- Task reminders

### Known Limitations
- No real-time collaboration (requires refresh to see others' changes)
- No task dependencies (e.g., Task B blocked by Task A)
- No time tracking on tasks
- No task templates (separate from recurring)

---

## Future Enhancements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| Task Dependencies | Link tasks that must complete before others can start | Nice to Have |
| Time Tracking | Log time spent on tasks | Nice to Have |
| Task Templates | Save task configurations as reusable templates | Nice to Have |
| Bulk Operations | Select and update multiple tasks at once | Should Have |
| Task Comments | Add threaded comments to tasks | Should Have |
| File Attachments | Attach files directly to tasks | Should Have |
| Mobile Offline | View and update tasks without internet | Nice to Have |

---

## Document Template Notes

This document follows the BuildPro User Story Template structure:

1. **Epic Overview** - High-level description and business value
2. **User Personas** - Who uses this feature
3. **User Stories** - Detailed stories with acceptance criteria
4. **Current State** - What's implemented vs. planned
5. **Future Enhancements** - Roadmap items

Use this same structure for all feature areas (Estimates, Schedules, Contacts, etc.)
