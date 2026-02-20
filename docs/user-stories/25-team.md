# Team Management (Users, Roles & Permissions) - User Stories

## Epic Overview
Team Management handles the full lifecycle of users within a construction company, from invitation and onboarding to role assignment and permission management. The system provides granular role-based access control with 25 distinct permission areas, per-project access control, and user preference management. It ensures that builders can control exactly what each team member can see and do across the application.

## Business Value
Australian residential builders typically have diverse teams including project managers, site supervisors, estimators, administrators, and apprentices, each needing different levels of system access. Granular permissions ensure sensitive financial data is only visible to authorised personnel, while project access control allows builders to restrict team members to their assigned projects. This protects business data, maintains compliance with privacy obligations, and enables secure delegation as the business scales.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Owner/Director | Business Owner | Full control over team, roles, and permissions |
| Admin | Office Administrator | Manage team members, handle invitations and onboarding |
| Builder/PM | Project Manager | Manage project team assignments and access |
| Team Member | General User | View assigned projects, manage personal settings |

## User Stories

### US-TM001: View Team Members
**As an** Owner/Director, **I want to** view a list of all team members, **so that** I can see who is part of my company.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] List all company users via GET /api/users
- [ ] Display name, email, role, and status for each member
- [ ] Show user avatar or initials
- [ ] Support search and filtering
- [ ] Display in TeamManagement.tsx

---

### US-TM002: Invite New Team Members
**As an** Admin, **I want to** invite new users to the company, **so that** I can onboard new employees and subcontractors.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create new user via POST /api/users
- [ ] Send invitation email with login credentials
- [ ] Assign initial role during invitation
- [ ] Set user as active upon invitation acceptance
- [ ] Associate user with company via companyUsers

---

### US-TM003: Edit Team Member Details
**As an** Admin, **I want to** edit a team member's profile details, **so that** I can keep user information current.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update user details via PATCH /api/users/:id
- [ ] Edit name, email, phone, and role assignment
- [ ] Update job title and department
- [ ] Changes reflected immediately in team list
- [ ] Validate email uniqueness

---

### US-TM004: View User Profile
**As an** Admin, **I want to** view a team member's full profile, **so that** I can see their details, role, and project assignments.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Retrieve user details via GET /api/users/:id
- [ ] Display personal information, role, and permissions
- [ ] Show assigned projects
- [ ] Show activity history
- [ ] Display last login timestamp

---

### US-TM005: Create Custom Roles
**As an** Owner/Director, **I want to** create custom roles, **so that** I can define specific permission sets for different job functions.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create role via POST /api/user-roles
- [ ] Define role name and description
- [ ] Role available for assignment to team members
- [ ] Support multiple custom roles per company
- [ ] Display roles in RolesPermissions.tsx

---

### US-TM006: Configure Role Permissions
**As an** Owner/Director, **I want to** configure granular permissions for each role, **so that** I can control exactly what each role can access.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] View permissions via GET /api/user-roles/:roleId/permissions
- [ ] Set permissions via POST /api/user-roles/:roleId/permissions
- [ ] Support 25 permission areas (projects, estimates, schedules, budgets, etc.)
- [ ] Toggle view, create, edit, delete permissions per area
- [ ] Changes take effect immediately for all users with that role

---

### US-TM007: Edit Existing Roles
**As an** Owner/Director, **I want to** edit existing role definitions, **so that** I can adjust permissions as business needs change.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update role via PATCH /api/user-roles/:id
- [ ] Modify role name, description, and permissions
- [ ] Changes apply to all users currently assigned this role
- [ ] Prevent editing system-default roles

---

### US-TM008: Delete Custom Roles
**As an** Owner/Director, **I want to** delete custom roles that are no longer needed, **so that** I can keep the role list clean.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete role via DELETE /api/user-roles/:id
- [ ] Prevent deletion if users are currently assigned this role
- [ ] Show confirmation dialog before deletion
- [ ] Cannot delete system-default roles

---

### US-TM009: Reorder Roles
**As an** Owner/Director, **I want to** reorder roles in the list, **so that** the most important roles appear first.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Reorder roles via PATCH /api/user-roles/reorder
- [ ] Drag-and-drop or manual ordering in UI
- [ ] Persist order across sessions
- [ ] Display roles in configured order in assignment dropdowns

---

### US-TM010: Assign Users to Projects
**As a** Builder/PM, **I want to** assign team members to specific projects, **so that** they have access to the project's data and tasks.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set project access via POST /api/users/:userId/project-access
- [ ] View project access via GET /api/users/:userId/project-access
- [ ] Update project access via PUT /api/users/:userId/project-access
- [ ] Users can only see projects they are assigned to
- [ ] Display project team in ProjectTeam.tsx

---

### US-TM011: Manage Project Team
**As a** Builder/PM, **I want to** view and manage the team assigned to a project, **so that** I can ensure the right people are involved.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display project team members in ProjectTeam.tsx (265 lines)
- [ ] Add team members to the project
- [ ] Remove team members from the project
- [ ] Show each member's role and access level
- [ ] Filter assignable users for the project

---

### US-TM012: Get Assignable Users
**As a** Builder/PM, **I want to** see a list of users assignable to tasks and items, **so that** I can assign work to the right people.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Fetch assignable users via GET /api/users/assignable
- [ ] Return users who are active and have access to the current context
- [ ] Used in user selection dropdowns across the application
- [ ] Include user name, email, and avatar in results
- [ ] Filter by project context when applicable

---

### US-TM013: Change User Password
**As an** Admin, **I want to** change a team member's password, **so that** I can help users who are locked out of their accounts.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Change password via POST /api/users/:id/change-password
- [ ] Require current password for self-service change
- [ ] Admin can reset without knowing current password
- [ ] Enforce password strength requirements
- [ ] Log password change activity

---

### US-TM014: Send Password Reset Email
**As an** Admin, **I want to** send a password reset email to a team member, **so that** they can regain access to their account.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Send reset email via POST /api/users/:id/send-password-reset
- [ ] Generate secure reset token with expiry
- [ ] Email contains link to reset password form
- [ ] Token expires after configured time period
- [ ] Show success confirmation in UI

---

### US-TM015: Set User Timezone
**As a** Team Member, **I want to** set my timezone, **so that** dates and times throughout the application are displayed correctly for my location.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Update timezone via PATCH /api/users/:id/timezone
- [ ] Select from standard timezone list (Australian timezones prominent)
- [ ] All date/time displays respect user's timezone
- [ ] Default to AEST/AEDT for Australian users
- [ ] Persist timezone preference across sessions

---

### US-TM016: Manage Column Preferences
**As a** Team Member, **I want to** customise which columns are visible in table views, **so that** I can focus on the information most relevant to my role.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Save column preferences via user-column-preferences endpoints
- [ ] Show/hide columns in data tables
- [ ] Persist preferences per table/view
- [ ] Reorder columns within tables
- [ ] Reset to default column layout

---

### US-TM017: Manage View Preferences
**As a** Team Member, **I want to** save my preferred view settings, **so that** the application remembers my layout choices.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Save view preferences via user-view-preferences endpoints
- [ ] Remember sort order, filter settings, and view mode (list/board/calendar)
- [ ] Preferences per page/feature area
- [ ] Persist preferences across sessions
- [ ] Reset preferences to defaults

---

### US-TM018: Bulk Project Access Assignment
**As an** Admin, **I want to** assign a user to multiple projects at once, **so that** I can efficiently onboard new team members.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Select multiple projects for access assignment
- [ ] Apply access level across all selected projects
- [ ] Bulk update via PUT /api/users/:userId/project-access
- [ ] Show confirmation of projects assigned
- [ ] Display current project access for review

---

### US-TM019: Permission-Based UI Rendering
**As an** Owner/Director, **I want to** ensure UI elements are shown or hidden based on user permissions, **so that** users only see features they have access to.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Check user permissions before rendering menu items
- [ ] Hide action buttons for unauthorised operations
- [ ] Disable form fields for view-only access
- [ ] Backend validates permissions on all API requests
- [ ] 25 permission areas enforce across all features

---

## Technical Notes
- Users table stores core user data with company association via companyUsers
- userRoles table defines roles with 25 granular permission areas covering all application features
- Permission areas include: projects, estimates, schedules, budgets, variations, invoices, bills, contacts, files, notes, messages, team, settings, reports, templates, checklists, selections, allowances, defects, RFIs, RFQs, purchase orders, proposals, timesheets, site diary
- projectAccess table controls per-project user visibility and access
- companyUsers junction table manages team membership
- Frontend components: TeamManagement.tsx (401 lines), ProjectTeam.tsx (265 lines), RolesPermissions.tsx
- Timezone handling uses standard IANA timezone identifiers
- Column and view preferences stored per-user per-feature for personalised experience
- Password handling uses secure hashing (bcrypt)

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List all company users |
| POST | /api/users | Create/invite a new user |
| GET | /api/users/:id | Get user details |
| PATCH | /api/users/:id | Update user details |
| PATCH | /api/users/:id/timezone | Update user timezone |
| POST | /api/users/:id/change-password | Change user password |
| POST | /api/users/:id/send-password-reset | Send password reset email |
| GET | /api/users/assignable | Get users assignable to tasks/items |
| GET | /api/user-roles | List all roles |
| POST | /api/user-roles | Create a new role |
| PATCH | /api/user-roles/:id | Update a role |
| DELETE | /api/user-roles/:id | Delete a role |
| PATCH | /api/user-roles/reorder | Reorder roles |
| GET | /api/user-roles/:roleId/permissions | Get role permissions |
| POST | /api/user-roles/:roleId/permissions | Set role permissions |
| GET | /api/users/:userId/project-access | Get user's project access |
| POST | /api/users/:userId/project-access | Add project access for user |
| PUT | /api/users/:userId/project-access | Update/bulk set project access |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /team | TeamManagement.tsx | Company team member management |
| /projects/:projectId/team | ProjectTeam.tsx | Project-specific team management |
| /roles-permissions | RolesPermissions.tsx | Role and permission configuration |

## Known Issues / Future Enhancements
- [ ] No user deactivation workflow (soft disable vs. hard delete)
- [ ] No team member availability or capacity tracking
- [ ] No organisation chart or reporting structure
- [ ] No SSO (Single Sign-On) integration
- [ ] No two-factor authentication (2FA)
- [ ] No user groups or departments for bulk permission management
- [ ] No audit log for permission changes
- [ ] No time-limited project access (auto-expire after project completion)
- [ ] No mobile-specific permission settings
- [ ] No role templates for common construction team positions

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 19
- Implemented: 19
- Partially Implemented: 0
- Not Implemented: 0
