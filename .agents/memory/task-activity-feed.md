---
name: Task activity merged into comments
description: Auto-generated task audit lines share the task comment feed (web + mobile)
---

Task field changes are logged and interleaved into the SAME feed as task comments,
oldest-first, rendered lighter + non-editable, behind a default-on show/hide toggle.

**Why:** the product wanted an Asana/ClickUp "Activity & Comments" feed, not a
separate audit log; activity must feel like part of the conversation.

**How to apply:**
- Capture is a single diff helper that compares the full task row before vs after an
  update and writes one activity entry per changed field. It must be invoked from
  EVERY task-mutation path (single-field PATCH, status PATCH, and bulk status change).
  This is the same failure class as budget-recalc / PO-suggestion paths: a new
  mutation route that skips the helper silently stops logging with no error.
- Prefer routing all task mutations through one shared "update + diff + log" helper so
  future paths can't drift.
- Capture is best-effort (wrapped so a logging failure never breaks the task save).
- Activity reads are company-scoped through the owned-task guard (404 cross-tenant).
- Activity produces NO notifications by design.
