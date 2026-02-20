# Activity Feed - User Stories

## Epic Overview

### Description
The Activity Feed provides a comprehensive audit trail and collaboration system across BuildPro. It tracks all significant actions performed on projects — including task updates, estimate changes, bill submissions, variation approvals, invoice activity, and proposal actions. The system also supports schedule-level activity notes with @mentions, system-generated change tracking, and a configurable activity widget for dashboards.

### Business Value
- Provides complete project visibility so builders can see who did what and when across all project modules
- Enables team collaboration through @mention notifications and contextual activity notes on schedule items
- Supports accountability and compliance with automatic system-generated change logs for auditing
- Reduces miscommunication by centralising all project activity into a single, filterable feed

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner, manages multiple projects | High-level overview of project activity, accountability tracking |
| **Project Manager** | Manages specific projects | Detailed activity feed, schedule notes, team coordination |
| **Site Supervisor** | On-site team lead | View recent changes, add activity notes from site |
| **Office Admin** | Administrative support | Track document changes, review approval activity |
| **Team Member** | General project contributor | Stay informed of changes, respond to @mentions |

---

## User Stories

### 1. Project Activity Feed

#### US-AC001: View Project Activity Feed
**As a** project manager
**I want to** view a chronological feed of all activity on a project
**So that** I can stay informed about what is happening across all project areas

**Acceptance Criteria:**
- [x] Activity feed page displays all project-level activities in reverse chronological order
- [x] Each activity entry shows: user name, action description, timestamp, entity type
- [x] Activity feed loads with pagination or infinite scroll for performance
- [x] Activity entries are colour-coded or icon-coded by entity type
- [x] Empty state displayed when no activities exist

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC002: Filter Activity by Type
**As a** project manager
**I want to** filter the activity feed by entity type (tasks, estimates, bills, etc.)
**So that** I can focus on specific areas of project activity

**Acceptance Criteria:**
- [x] Filter controls for entity types: tasks, estimates, bills, variations, invoices, proposals, schedule, defects
- [x] Multiple filters can be applied simultaneously
- [x] Filter state persists during the session
- [x] Activity count updates to reflect filtered results
- [x] "All" option to clear filters and show everything

**Priority:** Should Have
**Status:** Implemented

---

#### US-AC003: Search Activity Feed
**As a** project manager
**I want to** search the activity feed by keyword
**So that** I can find specific activities or changes quickly

**Acceptance Criteria:**
- [x] Search input field on the activity feed page
- [x] Real-time search across activity descriptions and user names
- [x] Search results highlight matching text
- [x] Search works in combination with type filters

**Priority:** Should Have
**Status:** Implemented

---

### 2. Activity Logging

#### US-AC004: Log Task Activity
**As a** system
**I want to** automatically log all task-related actions
**So that** users can see a history of task changes

**Acceptance Criteria:**
- [x] Activity logged when a task is created, updated, completed, or deleted
- [x] Status changes recorded with old and new values
- [x] Assignment changes recorded with old and new assignee names
- [x] Priority changes recorded
- [x] Due date changes recorded
- [x] Activity entries reference the task entity for deep linking

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC005: Log Estimate Activity
**As a** system
**I want to** automatically log estimate-related actions
**So that** users can track changes to project costing

**Acceptance Criteria:**
- [x] Activity logged when an estimate is created, updated, locked, unlocked, or versioned
- [x] Status changes recorded with old and new values
- [x] Item additions and deletions logged
- [x] Group changes logged
- [x] Activity entries reference the estimate entity

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC006: Log Bill Activity
**As a** system
**I want to** automatically log bill-related actions
**So that** users can track invoice processing and approvals

**Acceptance Criteria:**
- [x] Activity logged when a bill is created, submitted, approved, rejected, or paid
- [x] Approval and rejection actions include approver name and comments
- [x] Status transitions recorded with old and new values
- [x] Activity entries reference the bill entity

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC007: Log Variation Activity
**As a** system
**I want to** automatically log variation-related actions
**So that** users can track contract variation changes and approvals

**Acceptance Criteria:**
- [x] Activity logged when a variation is created, updated, approved, or rejected
- [x] Status changes recorded
- [x] Financial impact changes recorded
- [x] Activity entries reference the variation entity

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC008: Log Invoice Activity
**As a** system
**I want to** automatically log client invoice actions
**So that** users can track invoicing lifecycle

**Acceptance Criteria:**
- [x] Activity logged when an invoice is created, sent, paid, or voided
- [x] Status changes recorded
- [x] Payment recording logged
- [x] Activity entries reference the invoice entity

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC009: Log Proposal Activity
**As a** system
**I want to** automatically log proposal actions
**So that** users can track client proposal lifecycle

**Acceptance Criteria:**
- [x] Activity logged when a proposal is created, sent, accepted, or declined
- [x] Status changes recorded
- [x] Activity entries reference the proposal entity

**Priority:** Must Have
**Status:** Implemented

---

### 3. Schedule Activity Notes

#### US-AC010: Add Activity Note to Schedule Item
**As a** project manager
**I want to** add activity notes to schedule items
**So that** I can record progress updates, decisions, and site notes in context

**Acceptance Criteria:**
- [x] Activity notes popover accessible from schedule item rows
- [x] User can type a note with free-text content
- [x] Note is saved with userId, userName, and timestamp
- [x] Note type set to "user" to distinguish from system-generated notes
- [x] Notes display in reverse chronological order within the popover
- [x] Note count badge shown on the schedule item row

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC011: @Mention Users in Activity Notes
**As a** project manager
**I want to** @mention team members in activity notes
**So that** they are notified and can follow up on the note

**Acceptance Criteria:**
- [x] @mention autocomplete dropdown when typing "@" in a note
- [x] User list filtered as the user types after "@"
- [x] Mentioned user IDs stored in `mentionedUserIds` array
- [x] Mentioned users receive a notification (via notification system)
- [x] @mentioned names are visually highlighted in the note text

**Priority:** Should Have
**Status:** Implemented

---

#### US-AC012: System-Generated Schedule Notes
**As a** system
**I want to** automatically create activity notes when schedule item properties change
**So that** all changes are tracked without manual logging

**Acceptance Criteria:**
- [x] System note created on status change (with old and new status in metadata)
- [x] System note created on date change (start/end date with old and new values)
- [x] System note created on dependency change
- [x] System note created on assignment change
- [x] System note created on priority change
- [x] System note created on progress change
- [x] System notes have type "system" to distinguish from user notes
- [x] Metadata stores `activityType`, `oldValue`, `newValue`, and `field`

**Priority:** Must Have
**Status:** Implemented

---

#### US-AC013: Edit Activity Note
**As a** project manager
**I want to** edit an activity note I previously wrote
**So that** I can correct mistakes or update information

**Acceptance Criteria:**
- [x] Edit button available on notes authored by the current user
- [x] Inline editing of note content
- [x] `isEdited` flag set to true and `editedAt` timestamp recorded
- [x] "Edited" indicator displayed on modified notes
- [x] System-generated notes cannot be edited

**Priority:** Should Have
**Status:** Implemented

---

#### US-AC014: Delete Activity Note
**As a** project manager
**I want to** delete an activity note I previously wrote
**So that** I can remove incorrect or irrelevant notes

**Acceptance Criteria:**
- [x] Delete button available on notes authored by the current user
- [x] Confirmation before deletion
- [x] Note is permanently removed
- [x] System-generated notes cannot be deleted

**Priority:** Should Have
**Status:** Implemented

---

#### US-AC015: Batch Activity Note Counts
**As a** frontend client
**I want to** fetch activity note counts for multiple schedule items in a single request
**So that** I can display note count badges efficiently without N+1 queries

**Acceptance Criteria:**
- [x] Batch endpoint accepts an array of schedule item IDs
- [x] Returns a map of scheduleItemId to note count
- [x] Used to display note count badges on the schedule view
- [x] Efficient database query (single query with GROUP BY)

**Priority:** Should Have
**Status:** Implemented

---

### 4. Activity Widget

#### US-AC016: Activity Feed Dashboard Widget
**As a** builder/owner
**I want to** see recent project activity in a dashboard widget
**So that** I can get a quick overview without navigating to the full activity page

**Acceptance Criteria:**
- [x] Activity widget displays recent activities on the project dashboard
- [x] Widget shows the most recent 10-20 activities
- [x] Each entry shows user, action, and relative timestamp
- [x] Click on an activity entry navigates to the relevant entity
- [x] Widget integrates with company-level activity feed settings for toggling visibility of activity types

**Priority:** Should Have
**Status:** Implemented

---

## Technical Notes

### Data Model
- Activities are stored in the existing `activities` table with fields for entityType, entityId, action, metadata, userId, and companyId
- Schedule activity notes use the `activityNotes` table with:
  - `userId`, `userName` — author of the note
  - `type` — "user" for manual notes, "system" for auto-generated
  - `content` — note text content
  - `activityType` — for system notes: status_change, date_change, dependency_change, assignment_change, priority_change, progress_change
  - `metadata` — JSON with `oldValue`, `newValue`, `field` for tracking changes
  - `mentionedUserIds` — array of user IDs mentioned with @
  - `isEdited`, `editedAt` — edit tracking for user notes
- Activity logging is performed via the `activityLogger` utility on the frontend and server-side middleware
- Company-level settings control which activity types are visible in the ActivityWidget

### API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/activities` | List activities (filter: projectId, entityType) |
| POST | `/api/activities` | Create activity entry |
| PATCH | `/api/activities/:id` | Update activity entry |
| POST | `/api/activity-notes/batch-counts` | Get note counts for multiple schedule items |
| PATCH | `/api/activity-notes/:id` | Update an activity note |
| DELETE | `/api/activity-notes/:id` | Delete an activity note |

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/projects/:projectId/activity` | ProjectActivity | Project-level activity feed (317 lines) |

---

## Known Issues / Future Enhancements

- [ ] Activity feed does not support real-time updates via WebSocket (currently requires page refresh)
- [ ] No export/download of activity history (e.g., PDF audit trail)
- [ ] Activity entries do not include file attachment changes
- [ ] No activity retention policy or archiving for old entries
- [ ] @mention notifications may not link directly to the specific activity note
- [ ] No user preference for activity feed notification frequency (instant vs digest)
- [ ] Business-level cross-project activity feed could benefit from additional filtering options

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

---

## Implementation Coverage Summary

| Area | Stories | Implemented | Partial | Not Started |
|------|---------|-------------|---------|-------------|
| Project Activity Feed | 3 | 3 | 0 | 0 |
| Activity Logging | 6 | 6 | 0 | 0 |
| Schedule Activity Notes | 6 | 6 | 0 | 0 |
| Activity Widget | 1 | 1 | 0 | 0 |
| **Total** | **16** | **16** | **0** | **0** |

- Total Stories: 16
- Implemented: 16
- Partially Implemented: 0
- Not Implemented: 0
