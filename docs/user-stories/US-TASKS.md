# User Stories - Tasks

## Permissions

### Permission Categories

| Permission Key | Name | Actions | Description |
|----------------|------|---------|-------------|
| `tasks.view` | View Tasks | view | View tasks in projects and business |
| `tasks.manage` | Manage Tasks | view, add, edit, delete | Create, edit and delete tasks |
| `tasks.assign` | Assign Tasks | view, edit | Assign tasks to team members |
| `tasks.templates` | Task Templates | view, add, edit, delete | Manage task templates and checklists |

### Permission Matrix by Role

| Role | View | Manage | Assign | Templates |
|------|------|--------|--------|-----------|
| Owner | Full | Full | Full | Full |
| Admin | Full | Full | Full | Full |
| General Manager | Full | Full | Full | Full |
| Project Manager | Full | Full | Full | View |
| Team Member | Own | Own | - | - |
| Subcontractor | Assigned | - | - | - |

### Notes
- Built-in admin roles (Owner, Admin, General Manager) automatically bypass permission checks
- "Own" means user can only view/edit tasks they are assigned to
- "Assigned" means user can only view tasks explicitly assigned to them
- Task templates are managed at the business level

---

## US-T050 - View All Assigned Tasks Across Projects

**As a** team member  
**I want to** see all tasks assigned to me across all projects and the business  
**So that** I can manage my workload from a single view

### Acceptance Criteria
- Display tasks from all projects where user is assigned
- Display business-level tasks assigned to user
- Support filtering by project, status, priority, due date
- Support board, list, and calendar views
- Allow drag-and-drop for status changes

### Current Status
**Implemented** - Available in User Workspace > My Tasks

---

## US-T060 - Task Reminders and Notifications

**As a** team member  
**I want to** set reminders on tasks  
**So that** I receive notifications before important deadlines

### Acceptance Criteria
- Bell icon button in task modal header for quick reminder access
- Quick options: 15 minutes, 1 hour, 3 hours, tomorrow morning
- Custom date/time option
- Reminders appear in notification bell
- Link from notification to task

### Current Status
**Implemented** - Bell icon in task edit modal, reminders in notification system

---

## US-T070 - Private Tasks

**As a** team member  
**I want to** mark a task as private  
**So that** only users assigned to the task can see it

### Acceptance Criteria
- Toggle switch in task modal to mark task as private
- Private tasks only visible to assigned users
- Private tasks display a lock icon indicator
- Private tasks excluded from unassigned user queries
- Admins/owners can still see all tasks for management purposes

### Current Status
**Implemented** - Toggle in task modal, filtering in task queries

---

## US-T071 - Task Delete Permissions

**As an** admin  
**I want to** control who can delete tasks  
**So that** lower-ranked users cannot accidentally remove important tasks

### Acceptance Criteria
- Delete action requires `tasks.manage` permission with delete action
- Users without permission see delete button disabled or hidden
- Error message shown if unauthorized user attempts delete
- Admins/owners always have delete access

### Current Status
**Implemented** - Permission check on DELETE /api/tasks/:id endpoint

---

## US-T072 - Bulk Task Operations

**As a** team member  
**I want to** perform actions on multiple tasks at once  
**So that** I can efficiently manage my workload

### Acceptance Criteria
- Select multiple tasks via checkboxes in list view
- Bulk change status across selected tasks
- Bulk copy tasks to another project
- Bulk copy tasks to business tasks
- Bulk delete selected tasks
- Clear selection option
- Show count of selected tasks

### Current Status
**Implemented** - Bulk toolbar with status change, copy to project/business, delete

---

## Template Naming Conventions

| Location | Name | Purpose |
|----------|------|---------|
| Operations > Operational Tasks | Operational Tasks | Recurring workflow templates for daily/weekly scheduling |
| Resources > Templates > Tasks | Template Tasks | Reusable task templates for general use |
