---
name: user_view_preferences as generic per-user KV store
description: Reuse the user_view_preferences table for new per-user settings instead of adding a table/routes.
---

`user_view_preferences` (table `user_view_preferences`) is effectively the
project's generic per-user key-value store, not just table/column layout state.
Each row is `(userId, viewKey, preferences: jsonb)` with a unique index on
`(userId, viewKey)`. Generic endpoints already exist:
- GET `/api/user-view-preferences/:viewKey` → row or `null`
- POST `/api/user-view-preferences` → `{ viewKey, preferences }` (upsert)
Server reads via `storage.getUserViewPreferences(userId, viewKey)` → row, then
`row.preferences`.

**Rule:** For a new *per-user* preference, pick a fresh `viewKey` and stash a
JSON blob here. Do NOT add a new table/migration/routes.

**Why:** Production is additive-migrations-only and the user wants minimal
surface area. This store already has working CRUD + per-user uniqueness, so a new
preference is zero schema/route change and zero deploy risk.

**How to apply:** e.g. mobile push opt-in uses viewKey `push-notification-prefs`
with `{ mutedGroups: string[] }`; the dashboard layout uses
`mobile-dashboard-layout`. The server can gate behavior by reading the same
viewKey it was saved under. Keep any client/server shared "keys" (e.g. group
keys) in one shared module when both sides touch them — but note the Expo app is
a separate build and may not import `shared/`, so a mirrored list + sync comment
is the pragmatic fallback.
