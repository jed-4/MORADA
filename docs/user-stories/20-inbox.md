# BuildPro User Stories: Inbox (Notifications)

## Epic Overview

### Description
The Inbox system provides a centralised notification hub for BuildPro users. It delivers real-time notifications for task assignments, @mentions, reminders, approvals, and other project events. Users can view, read, dismiss, and deep-link into the relevant entity from each notification. The system includes a header bell icon with unread count badge, scheduled reminder notifications, and real-time delivery via Socket.io.

### Business Value
- Ensures team members never miss critical project updates like task assignments, approvals, or deadline reminders
- Reduces reliance on external communication tools (email, SMS) by centralising notifications within the platform
- Improves response times by providing real-time notification delivery with deep links to actionable items
- Supports scheduled reminders for follow-ups, due dates, and recurring tasks

---

## User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Builder/Owner** | Business owner, manages multiple projects | Approval notifications, high-priority alerts, cross-project overview |
| **Project Manager** | Manages specific projects | Task updates, team activity, deadline reminders |
| **Site Supervisor** | On-site team lead | Task assignments, schedule changes, mention notifications |
| **Office Admin** | Administrative support | Document notifications, invoice alerts, reminder management |
| **Team Member** | General project contributor | Task assignments, @mentions, due date reminders |

---

## User Stories

### 1. Viewing Notifications

#### US-IN001: View Notifications List
**As a** team member
**I want to** view all my notifications in a list
**So that** I can see what requires my attention

**Acceptance Criteria:**
- [x] Notification list accessible from the header bell icon
- [x] Notifications displayed in reverse chronological order
- [x] Each notification shows: title, message, timestamp, read/unread state
- [x] Unread notifications visually distinguished from read ones
- [x] Notification list loads with pagination or virtual scrolling
- [x] Empty state displayed when no notifications exist

**Priority:** Must Have
**Status:** Implemented

---

#### US-IN002: Unread Count Badge
**As a** team member
**I want to** see a badge on the notification bell showing unread count
**So that** I know at a glance if I have pending notifications

**Acceptance Criteria:**
- [x] Unread count badge displayed on the notification bell icon in the header
- [x] Badge shows the numeric count of unread notifications
- [x] Badge is hidden when unread count is zero
- [x] Count updates in real-time when new notifications arrive
- [x] Mobile header also displays the notification bell with unread badge
- [x] Unread count fetched via dedicated API endpoint

**Priority:** Must Have
**Status:** Implemented

---

#### US-IN003: Notification Grouping by Date
**As a** team member
**I want to** see notifications grouped by date (Today, Yesterday, Earlier)
**So that** I can quickly scan recent vs older notifications

**Acceptance Criteria:**
- [x] Notifications grouped under date headers
- [x] "Today" group for same-day notifications
- [x] "Yesterday" group for previous day
- [x] "Earlier" group for older notifications
- [x] Relative timestamps within each group (e.g., "2 hours ago")

**Priority:** Should Have
**Status:** Implemented

---

### 2. Managing Notifications

#### US-IN004: Mark Notification as Read
**As a** team member
**I want to** mark a notification as read
**So that** I can track which notifications I have reviewed

**Acceptance Criteria:**
- [x] Clicking on a notification marks it as read
- [x] Read state persisted via API (PATCH endpoint)
- [x] `readAt` timestamp recorded
- [x] Visual styling changes to indicate read state
- [x] Unread count badge updates immediately

**Priority:** Must Have
**Status:** Implemented

---

#### US-IN005: Mark All Notifications as Read
**As a** team member
**I want to** mark all notifications as read in one action
**So that** I can clear my notification backlog quickly

**Acceptance Criteria:**
- [x] "Mark All Read" button available in the notification list
- [x] All unread notifications for the current user are marked as read
- [x] Unread count badge resets to zero
- [x] API endpoint handles bulk update efficiently
- [x] Confirmation not required (immediate action)

**Priority:** Should Have
**Status:** Implemented

---

#### US-IN006: Dismiss a Notification
**As a** team member
**I want to** dismiss a notification I no longer need
**So that** I can keep my notification list clean and focused

**Acceptance Criteria:**
- [x] Dismiss button (or swipe action) on each notification
- [x] Dismissed notification removed from the list
- [x] Dismiss action persisted via API
- [x] Dismissed notifications do not reappear

**Priority:** Should Have
**Status:** Implemented

---

#### US-IN007: Delete a Notification
**As a** team member
**I want to** permanently delete a notification
**So that** I can remove notifications that are no longer relevant

**Acceptance Criteria:**
- [x] Delete action available on notifications
- [x] Notification permanently removed from the database
- [x] Unread count updated if the deleted notification was unread

**Priority:** Should Have
**Status:** Implemented

---

### 3. Deep Linking

#### US-IN008: Navigate to Entity from Notification
**As a** team member
**I want to** click on a notification to navigate directly to the relevant entity
**So that** I can quickly take action on the notified item

**Acceptance Criteria:**
- [x] Each notification includes a deep link URL (`link` field)
- [x] Clicking the notification navigates to the linked page (e.g., task detail, bill detail)
- [x] Entity type and entity ID stored on the notification for routing
- [x] Notification is automatically marked as read when clicked
- [x] Deep links work for: tasks, bills, estimates, schedule items, invoices, defects, variations

**Priority:** Must Have
**Status:** Implemented

---

### 4. Notification Types

#### US-IN009: Task Assignment Notifications
**As a** team member
**I want to** receive a notification when a task is assigned to me
**So that** I know I have new work to action

**Acceptance Criteria:**
- [x] Notification created when a task is assigned to a user
- [x] Notification title includes the task name
- [x] Notification message includes who assigned the task
- [x] Deep link navigates to the task detail
- [x] Notification type: `task_assigned`

**Priority:** Must Have
**Status:** Implemented

---

#### US-IN010: @Mention Notifications
**As a** team member
**I want to** receive a notification when someone @mentions me in a note or comment
**So that** I can respond to the mention in context

**Acceptance Criteria:**
- [x] Notification created when a user is @mentioned in an activity note
- [x] Notification title indicates the mention context (e.g., schedule item name)
- [x] Notification message includes who mentioned the user
- [x] Deep link navigates to the entity where the mention occurred
- [x] Notification type: `task_mentioned`

**Priority:** Must Have
**Status:** Implemented

---

#### US-IN011: Task Completion Notifications
**As a** project manager
**I want to** receive a notification when a task I created or manage is completed
**So that** I can review the completed work

**Acceptance Criteria:**
- [x] Notification created when a task status changes to completed
- [x] Notification sent to the task creator and/or project manager
- [x] Notification title includes the task name
- [x] Deep link navigates to the completed task
- [x] Notification type: `task_completed`

**Priority:** Should Have
**Status:** Implemented

---

#### US-IN012: Reminder Notifications
**As a** team member
**I want to** receive scheduled reminder notifications
**So that** I am prompted to follow up on tasks, bills, or other items at the right time

**Acceptance Criteria:**
- [x] Reminder notifications created from the SetReminderDialog component
- [x] Reminders stored in `reminderNotifications` table with scheduled date/time
- [x] Reminder processor runs periodically to check for due reminders
- [x] Due reminders converted to standard notifications and delivered
- [x] Reminder includes the entity reference for deep linking
- [x] Users can set reminders on tasks, bills, and other entities

**Priority:** Should Have
**Status:** Implemented

---

### 5. Real-Time Updates

#### US-IN013: Real-Time Notification Delivery
**As a** team member
**I want to** receive notifications in real-time without refreshing the page
**So that** I am immediately aware of important updates

**Acceptance Criteria:**
- [x] Socket.io connection established for each authenticated user
- [x] New notifications pushed to connected clients in real-time
- [x] Unread count badge updates instantly when a new notification arrives
- [x] Notification list updates if the inbox is open
- [x] Graceful fallback if WebSocket connection is lost (poll on reconnect)

**Priority:** Must Have
**Status:** Implemented

---

#### US-IN014: Notification Sound
**As a** team member
**I want to** hear an optional sound when a new notification arrives
**So that** I am alerted even when not looking at the screen

**Acceptance Criteria:**
- [x] Notification sound plays when a new notification is received
- [x] Sound file stored in `client/public/sounds/`
- [x] Sound can be toggled on/off in user settings
- [x] Sound does not play if the browser tab is not focused (optional)

**Priority:** Could Have
**Status:** Implemented

---

### 6. Mobile Notifications

#### US-IN015: Mobile Notification Bell
**As a** site supervisor
**I want to** see notifications on my mobile device within the app
**So that** I can stay informed while on-site

**Acceptance Criteria:**
- [x] Notification bell icon displayed in the mobile app header
- [x] Unread count badge visible on the bell icon
- [x] Tap to open notification list
- [x] Notifications display with same information as desktop
- [x] Deep links navigate correctly within the mobile app

**Priority:** Must Have
**Status:** Implemented

---

## Technical Notes

### Data Model
- `notifications` table:
  - `userId` — recipient user ID
  - `companyId` — company scope
  - `type` — notification type enum (task_assigned, task_mentioned, task_completed, etc.)
  - `title` — notification title text
  - `message` — notification message/description
  - `link` — deep link URL for navigation
  - `entityType` — type of related entity (task, bill, estimate, etc.)
  - `entityId` — ID of the related entity
  - `isRead` — boolean read state
  - `readAt` — timestamp when marked as read
- `reminderNotifications` table:
  - Stores scheduled reminders with target date/time
  - Processed by a background reminder processor
  - Converted to standard notifications when due
- Real-time delivery via Socket.io events scoped to user sessions

### API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications for current user |
| GET | `/api/notifications/unread-count` | Get unread notification count |
| PATCH | `/api/notifications/:id/read` | Mark single notification as read |
| POST | `/api/notifications/mark-all-read` | Mark all notifications as read |
| POST | `/api/notifications/read-all` | Mark all notifications as read (alias) |
| POST | `/api/notifications/:id/dismiss` | Dismiss a notification |
| DELETE | `/api/notifications/:id` | Delete a notification |

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| — | NotificationBell (Header) | Notification bell with dropdown in main header |
| — | NotificationBell (Mobile) | Notification bell in mobile header |

---

## Known Issues / Future Enhancements

- [ ] No email notification delivery — all notifications are in-app only
- [ ] No push notification support for mobile (native push via FCM/APNs)
- [ ] No notification preferences per type (e.g., mute task assignment notifications)
- [ ] No notification digest/summary (e.g., daily email summary of unread notifications)
- [ ] No "snooze" functionality for reminders (dismiss and re-notify later)
- [ ] Bulk dismiss/delete not supported (only mark-all-read)
- [ ] No notification channels (e.g., separate urgent vs informational)
- [ ] Reminder notifications UI for managing scheduled reminders could be more discoverable

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

---

## Implementation Coverage Summary

| Area | Stories | Implemented | Partial | Not Started |
|------|---------|-------------|---------|-------------|
| Viewing Notifications | 3 | 3 | 0 | 0 |
| Managing Notifications | 4 | 4 | 0 | 0 |
| Deep Linking | 1 | 1 | 0 | 0 |
| Notification Types | 4 | 4 | 0 | 0 |
| Real-Time Updates | 2 | 2 | 0 | 0 |
| Mobile Notifications | 1 | 1 | 0 | 0 |
| **Total** | **15** | **15** | **0** | **0** |

- Total Stories: 15
- Implemented: 15
- Partially Implemented: 0
- Not Implemented: 0
