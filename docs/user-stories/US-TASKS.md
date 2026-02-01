# User Stories - Tasks

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

### Required Permissions
| Permission | Action | Description |
|------------|--------|-------------|
| `tasks.view` | view | Can view tasks assigned to them |

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

### Required Permissions
| Permission | Action | Description |
|------------|--------|-------------|
| `tasks.view` | view | Can view and set reminders on assigned tasks |

### Current Status
**Implemented** - Bell icon in task edit modal, reminders in notification system

---

## Task Permissions Reference

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
