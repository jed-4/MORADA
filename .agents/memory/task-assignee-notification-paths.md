---
name: Task assignee notification fan-out
description: How task_assigned notifications are wired across every path that sets a task's assigneeId, and the diff-based no-op rule that prevents duplicates/self-notify.
---

Task assignment notifications must fire from every write path that sets an assignee, not just the edit form — and tasks actually support BOTH a legacy single `assigneeId` AND a multi `assigneeIds` array (the UI's multi-select assignee picker writes both). Don't assume "single assignee" from a stale audit — check the schema and the edit-form UI directly.

A single shared helper (`notifyTaskAssignment` in `server/utils/domainNotifications.ts`) does a set-diff against the *previous full task object* (not just a previous assignee id) — union of `assigneeId`+`assigneeIds` before vs. after — and notifies only users newly present in that union, minus the actor. Called from every path with `previousTask` (the pre-write task, or `null` for a brand-new task):

- POST /api/tasks (creation) — `previousTask: null`
- PATCH /api/tasks/:id (edit) — `previousTask: existingTask`
- POST /api/tasks/bulk-action `copyToProject` / `copyToBusiness` — the newly created copy carries over the source task's assignee(s), so it must also notify; `previousTask: null` since it's a new task row.

Rule baked into the helper: no-op if the assignee set didn't grow, no-op for an already-assigned user re-appearing (prevents duplicate notifications on a plain re-save), no-op if the new assignee is the actor themself (no self-notification). This mirrors the same set-diff pattern already used for notes (`collectNoteAssignees`).

**Why:** before this, only the PATCH edit path notified single-assignee changes; task creation, bulk-copy, and the entire `assigneeIds` multi-assignee array were silently un-notified — degrades silently (no error, just a missing notification), and a first-pass implementation that only diffed `assigneeId` passed code review only after the `assigneeIds` gap was caught.

**How to apply:** any new path that sets/copies an assignee on a task (recurring-task generation, subtask creation, etc., once those are implemented) should call the same helper with the correct `previousTask` rather than re-implementing notify logic inline.

Deliberately left out of scope: `POST /api/tasks/:id/subtasks` (its `createSubtask` throws "Not implemented" in DbStorage — non-functional feature) and recurring-task auto-generation paths (system/background jobs, not a user action).
