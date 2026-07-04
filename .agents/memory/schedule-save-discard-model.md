---
name: Schedule Save/Discard editing model
description: Durable rules for the web Gantt schedule edit lifecycle (snapshot/commit/discard) and its leave-guard.
---

The web Gantt schedule uses a Save/Discard editing model (replaced the old Unlock/Lock toggle), backed by a JSON snapshot of `schedule_items` taken when editing begins. Three server ops: begin (snapshot + mark editing), commit/Save (clear snapshot + lock), discard (restore to snapshot + lock).

**Discard is a minimal DIFF restore, never delete-all-then-reinsert.** Rebuilding from scratch would drop notes/timesheets attached to surviving rows. Because `schedule_items` has cascade FKs to child items + activity_notes, restore order matters: detach all parent links first (so deleting session-created rows can't cascade a keeper), then delete extras, re-insert missing rows with their ORIGINAL ids, then re-apply values/hierarchy.
**Why:** preserving child data + stable ids is the whole point of a snapshot revert; a naive reinsert silently loses linked records.

**Each of begin/commit/discard must be ONE db.transaction covering BOTH the item changes and the status/lock-column change.** An earlier version updated status as a separate write; a mid-way failure left the schedule unlocked with a cleared snapshot — an unrecoverable half-state.
**How to apply:** any new edit-lifecycle mutation stays inside the transaction; don't split the lock/status write out.

**Never silently commit or discard when the user leaves with unsaved edits — always prompt Save/Discard.** This must hold across all leave paths: in-app links, programmatic route changes, browser Back, and refresh/tab-close.
- Browser Back is intercepted WITHOUT pushing sentinel history entries (those accumulated stale entries and broke normal Back after editing ended). Instead: on the back-triggered popstate, step forward once to cancel it and open the dialog; when the user confirms, step back for real. Two refs distinguish the self-triggered popstates (the forward-cancel and the real-back) from genuine user navigation.
- Refresh/close can only use the native beforeunload prompt (no custom dialog possible there); it must NOT commit/discard — pending edits stay intact so nothing is lost.
- Client must confirm the server op succeeded before navigating away; on failure keep the user on the page with an error toast, or they lose work believing it saved.
