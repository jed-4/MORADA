# BuildPro User Stories: Calendar

## Epic Overview

### Description
The Calendar system provides builders and their teams with a unified time-based view of all activities — tasks, schedule items, meetings, and external Google Calendar events — across both personal and business contexts. It offers **Personal Calendar** (user-scoped), **Business Calendar** (company-wide), and **Project Calendar** (per-project) experiences. A custom-built **EnhancedCalendar** rendering engine powers all calendar views with month, week, day, and roster modes, drag-and-drop rescheduling, event resizing, timezone-aware display, and Notion-style colour coding. The system supports **saved views** with flexible filtering, **Google Calendar integration** (read-only, per-user OAuth), and **dashboard widgets** for at-a-glance scheduling visibility.

### Terminology & Hierarchy

| System Term | User-Facing Term | Description |
|-------------|-----------------|-------------|
| Personal Calendar | My Calendar | A user's personal view of their assigned tasks and Google Calendar events |
| Business Calendar | Business Calendar | Company-wide view of all tasks and schedule items across projects |
| Project Calendar | Project Calendar | Per-project calendar showing tasks and schedule items for a single project |
| Calendar View | Saved View | A named, persisted configuration of filters and display mode |
| Calendar Event | Event | A unified representation of a task, schedule item, or Google Calendar event |
| EnhancedCalendar | Calendar | The shared rendering engine used across all calendar pages |
| Google Calendar Event | Google Event | A read-only event synced from the user's connected Google Calendar |
| Roster View | Roster | A scrollable multi-week planning view for workload visibility |

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Dual Calendars** | Personal and Business calendars serve different needs — personal for individual workload, business for team-wide visibility |
| **Event Unification** | Tasks, schedule items, and Google Calendar events are normalised into a single `CalendarEvent` interface for consistent display |
| **Saved Views** | Named filter + display mode configurations persisted per user, with a default "All Events" view auto-created on first visit |
| **Drag-and-Drop** | Events can be dragged to new dates (month view) or time slots (week/day views) to reschedule with optimistic UI updates |
| **Event Resizing** | In week/day views, events with time slots can be resized by dragging top/bottom handles to adjust start/end times |
| **Google Calendar Integration** | Per-user OAuth connection to display Google Calendar events alongside BuildPro tasks (read-only, no modification) |
| **Timezone Support** | All events display in the user's configured timezone, with current-time indicators in week/day views |
| **Permission-Based Access** | Team calendar viewing requires the `projects.team_calendars` permission |

### View Modes

| Mode | Description | Available In |
|------|-------------|-------------|
| **Month** | Traditional month grid with event dots/chips per day | Personal, Business |
| **Week** | 7-day columnar view with hourly time slots and event blocks | Personal, Business |
| **Day** | Single-day detailed view with hourly time slots | Personal, Business |
| **Roster** | Multi-week scrollable planning view for workload overview | Personal, Business |

### Business Value
- Gives builders a single place to see everything happening across their business
- Reduces scheduling conflicts by showing tasks, schedule items, and personal events together
- Enables quick rescheduling through drag-and-drop without opening edit forms
- Improves team coordination through business-wide calendar visibility
- Saves time by integrating Google Calendar so users don't need to switch between apps
- Saved views let users create focused displays for different workflows (e.g., "This Week's Inspections", "My Tasks Only")

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner | Company-wide calendar visibility, team workload overview, quick rescheduling |
| **Project Manager** | Manages projects | Cross-project scheduling, identifying conflicts, drag-and-drop replanning |
| **Site Supervisor** | On-site team lead | Personal task calendar, daily schedule view, mobile access |
| **Office Admin** | Administrative support | Business calendar oversight, saved views for reporting, Google Calendar sync |
| **Subcontractor** | External trade | View assigned work windows (when schedule is online) |

---

## Feature Map

### 1. Personal Calendar

#### US-CAL-001: View Personal Calendar
**As a** team member,
**I want** to see all my assigned tasks and events on a calendar,
**So that** I can plan my work and see what's coming up.

**Acceptance Criteria:**
- Personal Calendar page is accessible via `/my-calendar` route
- Shows all tasks assigned to the current user that have a due date
- Displays tasks as coloured events using project colour coding
- Shows task completion status via strikethrough text and checkbox overlay
- Filters out tasks from deactivated recurring task templates
- Default view mode is "week"
- Loading skeleton shown while data is fetching

**Current Implementation:** Fully implemented in `PersonalCalendar.tsx`. Tasks are fetched, filtered by `assigneeId`, and rendered via `EnhancedCalendar`.

---

#### US-CAL-002: View Team Member Calendars
**As a** manager with team calendar permissions,
**I want** to view other team members' calendars,
**So that** I can check their availability and workload.

**Acceptance Criteria:**
- A user selector dropdown appears in the Personal Calendar header when the user has `projects.team_calendars` permission
- Selecting a team member shows their assigned tasks on the calendar
- Google Calendar events are only shown when viewing your own calendar (not other users')
- The displayed user's name appears in the header
- Users without the permission only see their own calendar (no selector shown)

**Current Implementation:** Fully implemented. Permission check via `/api/user-permissions`, user selector via dropdown, filtered task display per selected user.

---

#### US-CAL-003: Mark Tasks Complete from Calendar
**As a** team member,
**I want** to mark tasks as complete directly from the calendar,
**So that** I can update my progress without opening each task.

**Acceptance Criteria:**
- Each task event shows a completion checkbox overlay
- Clicking the checkbox toggles the task between completed and default (todo) status
- Status update uses the configurable status options from Field Categories
- Google Calendar events do not show completion checkboxes
- UI updates optimistically for immediate feedback

**Current Implementation:** Fully implemented via `handleEventComplete` callback and `updateTaskMutation`.

---

### 2. Business Calendar

#### US-CAL-004: View Business Calendar
**As a** builder/owner,
**I want** to see all tasks and schedule items across all projects on one calendar,
**So that** I can get a company-wide view of what's happening.

**Acceptance Criteria:**
- Business Calendar page is accessible via `/business/calendar` route
- Shows tasks from all projects (with due dates)
- Shows schedule items from all project schedules
- Events are colour-coded by project
- Schedule items show their schedule's project colour, or their own custom colour if set
- Both tasks and schedule items support drag-and-drop rescheduling
- Loading skeleton shown while data is fetching
- Date range filtering on API queries for performance (current view +/- 1 month buffer)

**Current Implementation:** Fully implemented in `BusinessCalendar.tsx`. Fetches tasks and schedule items with date range parameters, maps schedule items to projects via schedules lookup.

---

#### US-CAL-005: View as Specific User (Business Calendar)
**As a** manager,
**I want** to filter the business calendar to show only one team member's events,
**So that** I can review their workload.

**Acceptance Criteria:**
- A "View as" user selector dropdown in the Business Calendar header
- Options include "All Users" (default) plus all team members
- Selecting a user filters all events to only those assigned to that user
- This filter operates independently of the saved view assignee filter
- Selecting "All Users" shows all company events

**Current Implementation:** Fully implemented via `selectedViewUserId` state and filtering in `filteredEvents` memo.

---

### 3. Shared Calendar Features

#### US-CAL-006: Drag-and-Drop Rescheduling
**As a** project manager,
**I want** to drag events to new dates or time slots,
**So that** I can quickly reschedule without opening edit dialogs.

**Acceptance Criteria:**
- In month view: drag events between day cells to change the date
- In week/day views: drag events between time slots to change date and/or time
- Task events update `dueDate` and optionally `startTime`
- Schedule item events update `startDate`, `endDate`, and optionally `startTime`/`endTime` (preserving duration)
- Google Calendar events cannot be dragged (shows toast notification explaining to update in Google Calendar)
- Uses `@dnd-kit` library with mouse and touch sensors

**Current Implementation:** Fully implemented in both Personal and Business calendars via `rescheduleTaskMutation` and `rescheduleScheduleItemMutation`. Personal Calendar uses optimistic cache updates (direct `setQueryData`) to prevent snap-back during drag. Business Calendar uses cache invalidation on success (`invalidateQueries`) rather than optimistic updates.

---

#### US-CAL-007: Event Resizing
**As a** project manager,
**I want** to resize events by dragging their edges,
**So that** I can adjust start and end times visually.

**Acceptance Criteria:**
- In week/day views, events with time slots show resize handles on top and bottom edges
- Dragging the top handle adjusts the start time
- Dragging the bottom handle adjusts the end time
- Minimum event duration is enforced (events cannot be resized to zero)
- Both tasks and schedule items support resizing

**Current Implementation:** Fully implemented via `resizeTaskMutation` and `resizeScheduleItemMutation` with separate `@dnd-kit` draggable hooks for resize handles. Personal Calendar uses optimistic cache updates for resizing. Business Calendar uses cache invalidation on success.

---

#### US-CAL-008: Event Click / Detail View
**As a** team member,
**I want** to click on a calendar event to see its details or edit it,
**So that** I can review and update event information.

**Acceptance Criteria:**
- Clicking a task event opens the Task Edit Modal with full task details
- Clicking a Google Calendar event opens a detail popover showing title, time, location, and description
- Google Calendar events show a link to open in Google Calendar
- Task modal allows editing all task fields, deleting, and status changes
- Schedule item click should open a detail view (ideal behaviour)

**Current Implementation:** Partially implemented. Task click opens `TaskEditModal` for editing. Google Calendar event click opens a detail dialog. Schedule item click handling exists in BusinessCalendar but does not open a dedicated detail modal — this is a gap.

---

#### US-CAL-009: Saved Calendar Views
**As a** team member,
**I want** to save my filter and display settings as named views,
**So that** I can quickly switch between different calendar configurations.

**Acceptance Criteria:**
- A default "All Events" view is auto-created on first visit (per calendar type)
- Users can create new named views with current filters and display mode
- Views are saved per user and per calendar type (personal or business)
- Saved view includes: name, filters (projects, statuses, event types, assignees, date range), calendar mode (month/week/day)
- Selecting a view restores its saved filters and display mode
- Views can be updated (current filters/mode saved to selected view)
- Views can be deleted (with confirmation dialog)
- Duplicate default views are automatically cleaned up on load
- View tabs appear in the calendar header for quick switching

**Current Implementation:** Fully implemented with `calendarViews` database table, CRUD API routes (`/api/calendar-views`), and UI in both Personal and Business calendar pages.

---

#### US-CAL-010: Calendar Filtering (Notion-Style)
**As a** team member,
**I want** to filter calendar events by type, project, status, assignee, and date range,
**So that** I can focus on the events that matter to me.

**Acceptance Criteria:**
- Filter popover accessible via "Filters" button in calendar header
- Filter categories:
  - **Event Type**: Tasks, Schedule Items, Google Calendar (checkboxes)
  - **Projects**: List of all company projects with colour dots (checkboxes)
  - **Status**: List of configured status options (checkboxes)
  - **Assignee**: List of team members (checkboxes, business calendar only)
  - **Date Range**: From/To date pickers with human-readable range display
- Active filter count shown as badge on the Filters button
- Each filter section has a "Clear" link to reset that category
- "Clear All" button resets all filters
- Filters are applied client-side after data fetch
- Filters are persisted when saving a view

**Current Implementation:** Fully implemented in `CalendarFilters.tsx` component, used by both Personal and Business calendars.

---

### 4. Calendar Rendering Engine (EnhancedCalendar)

#### US-CAL-011: Month View
**As a** team member,
**I want** to see a traditional month grid with events shown on each day,
**So that** I can get an overview of the entire month.

**Acceptance Criteria:**
- Standard 7-column grid with configurable week start day (from company settings)
- Days from previous/next months shown in muted style
- Today's date highlighted with accent colour
- Events shown as coloured chips within day cells
- Overflow events indicated with "+N more" badge
- Day cells are drop targets for drag-and-drop rescheduling
- Component supports an `onDateClick` callback for day cell clicks (available but not used by current page implementations)

**Current Implementation:** Fully implemented in `EnhancedCalendar.tsx` month view renderer.

---

#### US-CAL-012: Week View
**As a** team member,
**I want** to see a detailed 7-day view with hourly time slots,
**So that** I can manage my daily schedule precisely.

**Acceptance Criteria:**
- 7-day columnar layout with hourly time slots (midnight to midnight)
- Auto-scrolls to 5am on initial load for practical visibility
- Events with start/end times positioned at correct time slots
- All-day events (no time) shown in a header row
- Current time indicator line (red) shown on today's column
- Events support drag-and-drop between time slots and between days
- Events support resize via top/bottom drag handles
- Configurable week start day from company settings

**Current Implementation:** Fully implemented with time-slot positioning, auto-scroll, and current-time indicator.

---

#### US-CAL-013: Day View
**As a** team member,
**I want** to see a single day's events in detail with hourly time slots,
**So that** I can focus on today's or a specific day's schedule.

**Acceptance Criteria:**
- Single-column view with hourly time slots
- Auto-scrolls to 5am on initial load
- Events positioned at correct time slots with duration-based height
- Current time indicator shown
- Events support drag-and-drop within time slots
- Events support resize via drag handles
- Navigation arrows to move between days

**Current Implementation:** Fully implemented, sharing the week view rendering engine with single-column mode.

---

#### US-CAL-014: Roster View
**As a** manager,
**I want** to see a multi-week scrollable view of events,
**So that** I can plan ahead and see team workload over several weeks.

**Acceptance Criteria:**
- Multi-week horizontal scrollable layout
- Each row represents a day with events listed
- Infinite scroll to load additional weeks as the user scrolls
- Events shown as compact chips with colour coding
- Navigation controls to jump forward/backward

**Current Implementation:** Fully implemented with infinite scroll expansion in `EnhancedCalendar.tsx`.

---

#### US-CAL-015: Timezone-Aware Display
**As a** team member working across time zones,
**I want** calendar events to display in my configured timezone,
**So that** I see accurate times for my location.

**Acceptance Criteria:**
- All event times displayed using the user's configured timezone (from user profile)
- Falls back to company timezone if user timezone is not set
- Current time indicator uses the user's timezone
- Today highlighting uses the user's timezone
- Timezone utility functions available via `useTimezone` hook

**Current Implementation:** Fully implemented via `useTimezone` hook and `formatInTimezone` / `isTodayInTimezone` utilities used throughout `EnhancedCalendar.tsx`.

---

#### US-CAL-016: Event Colour Coding
**As a** team member,
**I want** events to be colour-coded by project,
**So that** I can visually distinguish which project each event belongs to.

**Acceptance Criteria:**
- Events inherit their project's colour as the primary colour
- Schedule items can override with their own custom colour
- Colour generates a Notion-style palette (lighter background, darker text) for accessibility
- Completed events shown with muted/strikethrough styling
- Google Calendar events use a distinct colour scheme

**Current Implementation:** Fully implemented via `generateNotionColors` utility and project colour mapping in event creation.

---

### 5. Google Calendar Integration

#### US-CAL-017: Connect Google Calendar
**As a** team member,
**I want** to connect my Google Calendar account,
**So that** my personal events appear alongside my BuildPro tasks.

**Acceptance Criteria:**
- Google Calendar connection managed via user Profile page
- OAuth flow redirects to Google for authorization
- On successful connection, user's Google email and connection status are stored
- Connection status shown in Profile page with connected email display
- Disconnect option available to revoke access

**Current Implementation:** Fully implemented via `/api/google-calendar/auth-url`, `/api/google-calendar/callback`, `/api/google-calendar/status`, and `/api/google-calendar/disconnect` routes.

---

#### US-CAL-018: Display Google Calendar Events
**As a** team member with Google Calendar connected,
**I want** to see my Google Calendar events on my Personal Calendar,
**So that** I have a unified view of all my commitments.

**Acceptance Criteria:**
- Google Calendar events fetched via Google Calendar API
- Events displayed as read-only entries (cannot be edited, rescheduled, or completed in BuildPro)
- Events show title, time, location, and description
- Events use a distinct visual style (different colour/icon) to differentiate from BuildPro tasks
- Events only shown when viewing your own calendar (not when viewing team member calendars)
- Dragging a Google Calendar event shows a toast message directing the user to update it in Google Calendar
- Events fetched only when user is connected (checked via status endpoint)
- Graceful handling of expired/revoked tokens (returns empty array, no errors)

**Current Implementation:** Fully implemented in `PersonalCalendar.tsx` with conditional fetching based on connection status and user identity.

---

### 6. Dashboard Calendar Widgets

#### US-CAL-019: Day Calendar Widget
**As a** team member,
**I want** a compact daily calendar widget on my dashboard,
**So that** I can see today's events at a glance without leaving the dashboard.

**Acceptance Criteria:**
- Shows today's tasks and events in a compact time-slot format
- Widget is available in the personal dashboard widget registry
- Supports resize via the dashboard grid system
- Shows event colours and completion status

**Current Implementation:** Implemented in `DayCalendarWidget.tsx`.

---

#### US-CAL-020: Week Calendar Widget
**As a** team member,
**I want** a compact weekly calendar widget on my dashboard,
**So that** I can see this week's schedule at a glance.

**Acceptance Criteria:**
- Shows the current week's tasks and events in a compact format
- Widget is available in the personal dashboard widget registry
- Supports resize via the dashboard grid system

**Current Implementation:** Implemented in `WeekCalendarWidget.tsx`.

---

### 7. Project Calendar

#### US-CAL-021: View Project Calendar
**As a** project manager,
**I want** to see a calendar view specific to a single project,
**So that** I can focus on that project's timeline without cross-project noise.

**Acceptance Criteria:**
- Accessible via the project's Calendar tab (`/projects/:projectId/calendar`)
- Shows only tasks and schedule items for the selected project
- Uses the same EnhancedCalendar rendering engine as Personal and Business calendars
- Supports month, week, and day views
- Events colour-coded by type (task vs. schedule item)
- Drag-and-drop rescheduling for tasks and schedule items
- Filter by event type and status

**Current Implementation:** NOT IMPLEMENTED. The current `ProjectCalendar.tsx` component uses hardcoded mock data with a basic custom grid. It does not fetch real data, does not use `EnhancedCalendar`, and does not support any interactive features.

**Gap Analysis:**
- Replace `ProjectCalendar.tsx` mock implementation with real data fetching
- Integrate the `EnhancedCalendar` component
- Add project-scoped task and schedule item queries
- Connect drag-and-drop handlers for rescheduling
- Add filtering support

---

### 8. Navigation & Date Controls

#### US-CAL-022: Calendar Navigation
**As a** team member,
**I want** to navigate between dates using previous/next buttons and a "Today" shortcut,
**So that** I can quickly browse different time periods.

**Acceptance Criteria:**
- Previous/Next arrow buttons to navigate by the current view unit (month, week, day)
- "Today" button to jump back to the current date
- Current date range displayed in the header (e.g., "February 2026", "Feb 10 - 16")
- Navigation updates the data fetch range for efficient loading
- Date state lifted to parent component for coordination with filters

**Current Implementation:** Fully implemented in both Personal and Business calendar pages via `currentDate` state and `onCurrentDateChange` callback to `EnhancedCalendar`.

---

#### US-CAL-023: View Mode Switching
**As a** team member,
**I want** to switch between month, week, day, and roster views,
**So that** I can choose the level of detail that suits my current need.

**Acceptance Criteria:**
- View mode selector in the calendar header (Month / Week / Day / Roster buttons)
- Switching views preserves the current date context
- Selected view mode is saved when updating a saved view
- Default view mode is "week" for new views

**Current Implementation:** Fully implemented via `calendarMode` state and view selector buttons in both calendar pages.

---

### 9. Mobile Calendar

#### US-CAL-024: Mobile Calendar Section
**As a** team member using the mobile app,
**I want** to see my upcoming events on the mobile dashboard,
**So that** I can check my schedule on the go.

**Acceptance Criteria:**
- Calendar section visible on the mobile dashboard
- Shows upcoming tasks and events in a compact format
- Tapping an event navigates to its detail view
- Respects the same data sources as the web Personal Calendar

**Current Implementation:** Partially implemented as a collapsible section in the mobile `DashboardScreen.tsx`. Does not have a standalone calendar screen with full month/week/day views.

**Gap Analysis:**
- No standalone mobile calendar screen with view switching
- No drag-and-drop on mobile (touch gestures)
- No Google Calendar integration display on mobile
- No saved views on mobile

---

## Data Model

### Calendar Views Table (`calendar_views`)

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID primary key |
| companyId | varchar (FK) | Multi-tenant isolation |
| userId | varchar (FK) | Owner of the view |
| name | text | Display name (e.g., "All Events", "This Week's Tasks") |
| calendarType | text | "personal" or "business" |
| calendarMode | text | "month", "week", or "day" |
| filters | jsonb | Saved filter configuration |
| sharedWith | json | Array of user/role IDs for sharing (future) |
| isDefault | boolean | Whether this is the user's default view |
| sortOrder | integer | Tab ordering |
| isArchived | boolean | Soft delete |

### Calendar Event Interface (`CalendarEvent`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique event identifier |
| title | string | Event display name |
| startDate | Date | Event start date |
| endDate | Date | Event end date |
| startTime | string? | Start time (HH:mm format) |
| endTime | string? | End time (HH:mm format) |
| color | string? | Custom event colour |
| projectId | string? | Associated project |
| projectColor | string? | Project's colour for coding |
| type | enum | "task", "schedule", "meeting", "google-calendar" |
| status | string? | Current status |
| isCompleted | boolean? | Whether event is marked complete |
| description | string? | Event description |
| location | string? | Event location (Google Calendar) |
| templateId | string? | Recurring task template reference |
| tagIds | string[]? | Associated tags |
| isModified | boolean? | Whether rescheduled from original template time |
| resource | any? | Original task/event data for click handlers |

---

## API Endpoints

### Calendar Views

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/calendar-views?calendarType=personal\|business` | List views for current user |
| GET | `/api/calendar-views/:id` | Get a specific view |
| POST | `/api/calendar-views` | Create a new view |
| PATCH | `/api/calendar-views/:id` | Update view filters/mode |
| DELETE | `/api/calendar-views/:id` | Delete a view |
| POST | `/api/calendar-views/cleanup-duplicates` | Remove duplicate default views |

### Google Calendar

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/google-calendar/status` | Check connection status |
| GET | `/api/google-calendar/auth-url` | Get OAuth authorization URL |
| GET | `/api/google-calendar/callback` | OAuth callback handler |
| POST | `/api/google-calendar/disconnect` | Revoke connection |
| GET | `/api/google-calendar/events` | Fetch Google Calendar events |

### Supporting Endpoints (used by calendar)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks?startDate=&endDate=` | Fetch tasks with optional date range filter |
| PATCH | `/api/tasks/:id` | Update task (dueDate, startTime, endTime, status) |
| GET | `/api/schedule-items/all?startDate=&endDate=` | Fetch all schedule items with date range |
| PATCH | `/api/schedule-items/:id` | Update schedule item dates/times |

---

## Component Architecture

```
Pages
├── PersonalCalendar.tsx        — /my-calendar route
│   ├── EnhancedCalendar        — Rendering engine
│   ├── CalendarFilters          — Filter popover
│   ├── TaskEditModal            — Task editing on click
│   └── TaskDetailModal          — Task detail view
├── BusinessCalendar.tsx        — /business/calendar route
│   ├── EnhancedCalendar        — Rendering engine
│   ├── CalendarFilters          — Filter popover
│   └── TaskEditModal            — Task editing on click
├── Calendar.tsx                — /calendar route (project calendar stub)
│   └── ProjectCalendar.tsx     — Mock data implementation (needs replacement)

Components
├── EnhancedCalendar.tsx        — Core calendar rendering engine
│   ├── DraggableEvent          — Draggable event chip
│   ├── DroppableTimeSlot       — Drop target for time slots
│   └── DroppableDayCell        — Drop target for day cells
├── CalendarFilters.tsx         — Notion-style filter popover
└── SavedViews.tsx              — View management types/utilities

Dashboard Widgets
├── DayCalendarWidget.tsx       — Single-day compact widget
├── WeekCalendarWidget.tsx      — Weekly compact widget
├── PersonalCalendarWidget.tsx  — Personal calendar embed
└── usePersonalCalendarEvents.ts — Shared event fetching hook

Mobile
└── DashboardScreen.tsx         — Calendar section in mobile dashboard
```

---

## Known Gaps & Future Improvements

| Area | Gap | Priority |
|------|-----|----------|
| **Project Calendar** | Uses mock data; needs real data integration with EnhancedCalendar | High |
| **Schedule Item Detail** | No detail modal when clicking schedule items on Business Calendar | High |
| **Business Calendar Optimistic Updates** | Reschedule/resize mutations use cache invalidation, not optimistic updates (causes visual snap-back during drag) | Medium |
| **Mobile Calendar** | No standalone calendar screen; only dashboard section | Medium |
| **Event Creation** | No "New Event" creation from calendar (clicking empty time slot) | Medium |
| **Recurring Events** | No built-in recurring event support (relies on task templates) | Low |
| **View Sharing** | `sharedWith` field exists in schema but sharing UI not implemented | Low |
| **Google Calendar Write** | Google Calendar events are read-only; no two-way sync | Low |
| **Mobile Drag-and-Drop** | No touch-based rescheduling on mobile | Low |
| **Print View** | No print-friendly calendar layout | Low |
