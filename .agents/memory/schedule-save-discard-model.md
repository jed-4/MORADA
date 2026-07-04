---
name: Schedule Save/Discard editing model
description: How the web Gantt schedule edit lifecycle (snapshot/commit/discard) works and its safety rules.
---

The web Gantt schedule replaced the old "Unlock/Lock" toggle with a Save/Discard editing model backed by a JSON snapshot column.

- `schedules.editSnapshot` (json) holds the full array of `schedule_items` captured when editing begins. Column is ensured idempotently at startup (ensureTenancyColumns) because the deploy build runs no migration.
- Three endpoints (all `requireAuth` + `enforceProjectCompany`):
  - `edit-begin`: snapshot current items → editSnapshot, set status `online`. 
  - `edit-commit` (Save): clear snapshot, set status `locked`.
  - `edit-discard`: diff-restore items back to the snapshot, then clear snapshot + lock.

**Discard is a minimal DIFF restore, NOT delete-all-then-reinsert** — this deliberately preserves notes/timesheets on surviving items. Order matters because `schedule_items` has cascade FKs to child items + activity_notes: (1) detach ALL parentItemId first so deleting session-created rows can't cascade a keeper, (2) delete rows present-now-but-absent-in-snapshot, (3) re-insert snapshot rows missing now with their ORIGINAL id + parentItemId null, (4) update every snapshot row back to original values incl. hierarchy. JSON ISO date strings must be coerced back to `Date` before writing.

**Why atomic matters:** each of begin/commit/discard must apply its item changes AND the status/lock-column change in ONE db.transaction. An earlier version did status update as a separate write via storage.updateScheduleStatus — a failure in step 2 could leave the schedule unlocked with a cleared snapshot (unrecoverable half-state). The lock columns (lockedBy/lockedByName/lockedAt) are computed inline (buildScheduleStatusUpdate) so the whole thing fits in the transaction; don't call storage.updateScheduleStatus from inside these.

**How to apply:** any new mutation to the edit lifecycle must stay inside the transaction. Client `finishEditAndNavigate` must check `res.ok` before navigating — on failure keep the user on the page with an error toast, or they lose work believing Save/Discard succeeded.

Gotcha: in server/routes.ts the module-level import is `users as usersTable`; `schema.users` is only valid inside functions that do a local `const schema = await import("@shared/schema")`. Use `usersTable` at module scope.
