---
name: Notification push groups
description: How to add a new mobile-push notification type/event in BuildPro
---

Every `storage.createNotification(...)` row automatically dispatches a mobile push
(gated by the user's muted groups). So "add a push for event X" = create the right
notification row at the right moment; there is NO separate transport/device wiring.

**Why:** push dispatch is a hook on notification creation + a group-mute lookup, not
a per-event integration.

**How to apply when adding a NEW notification `type` string:**
1. Map the type into a group in `shared/notificationGroups.ts` (`PUSH_NOTIFICATION_GROUPS`).
   Unmapped types are always sent (can't be muted) — so it "works" but is un-mutable
   until grouped.
2. Mirror any NEW group key/label in `expo-mobile/src/screens/SettingsScreen.tsx`
   `PUSH_GROUPS` — it is HARDCODED, not imported from the shared file. Out-of-sync =
   a toggle that does nothing or a group with no toggle.
3. Mobile deep-linking lives in `expo-mobile/src/navigation/notificationRouting.ts`,
   which routes by `entityType`/`link` patterns (e.g. any `/projects/<id>...` link →
   ProjectDetail, `/messages?channel=` → thread). Set the notification `link`/`entityType`
   to match an existing pattern and no routing change is needed.

**Chat message notifications** are fanned out by `server/utils/chatNotifications.ts`,
shared by BOTH the REST create route (`POST /api/channels/:id/messages`) and the
socket `send_message` path so both transports notify identically. Precedence per user
(once only): explicit @mention → @channel/@here → generic `message_new`; the generic
`message_new` is intentionally skipped for currently-connected users to avoid spamming
an active conversation. Sender is never notified.

Domain event helpers (task_completed, timesheet_submitted/approved, note_assigned/
note_mention, schedule_assigned/schedule_changed) live in
`server/utils/domainNotifications.ts`; each is defensive (never throws) and skips the actor.
