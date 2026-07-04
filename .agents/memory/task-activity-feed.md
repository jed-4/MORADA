---
name: Task activity merged into comments
description: How auto-generated task audit lines share the task comment feed (web + mobile)
---

Task changes (status/priority/title/due date/assignees/checklist) are logged to a
`task_activity` table and interleaved into the SAME feed as task comments, oldest-first,
rendered lighter + non-editable, behind a default-on show/hide toggle.

**Why:** #416 wanted an Asana/ClickUp "Activity & Comments" feed, not a separate audit log.

**How to apply:**
- Capture lives in `recordTaskActivity` in server/routes.ts — it diffs the full task row
  before vs after and writes one row per changed field. It is wired into BOTH
  PATCH /api/tasks/:id and PATCH /api/tasks/:id/status. Any NEW task-mutation path that
  changes those fields must also call it, or activity silently stops (same failure class
  as budget-recalc-paths / po-suggestion-paths).
- Capture is best-effort (try/catch) so a logging failure never breaks the task save.
- Reads: GET /api/tasks/:taskId/activity, company-scoped via getOwnedTask (404 cross-tenant).
- Activity produces NO notifications by design.
- Both web and mobile TaskComments.tsx fetch activity separately then merge by createdAt.
