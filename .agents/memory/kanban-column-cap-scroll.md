---
name: Kanban column shrink-to-content + cap-and-scroll
description: Flex pattern for board columns that size to content but cap at the board height and scroll internally when tall
---

# Board columns: shrink to content, cap at board height, scroll internally

For a horizontal board (Kanban) where each column should (a) shrink to its
content and top-align when short, but (b) cap at the board-row height and scroll
its own list internally when taller than the board:

- Board row must be a **definite-height** flex container and use `items-start`
  (so columns are NOT stretched to equal height by the default
  `align-items: stretch`).
- Put the ONLY percentage height constraint (`max-h-full` = `max-height:100%`)
  on the **direct child** of that definite-height row. Percentage
  min/max-height only resolves against a parent with a definite height.
- The inner fill chain (wrapper -> column -> scrollable list) must use
  **flex-grow** (`flex-1 min-h-0`), NOT `h-full`/`height:100%`.

**Why:** `height:100%` needs the parent to expose a *resolvable definite*
height. A parent whose height comes only from `max-height` (auto height that
happens to be clamped) does NOT count — the child's `height:100%` falls back to
auto, so the column grows with content and the inner `overflow-y-auto` list
never becomes the scroll region (content spills past the board bottom).
`flex-1` resolves off the flex container's already-computed main size directly,
so it works whether the parent height is content-sized (short) or clamped by
`max-height` (tall). This exact `h-full` pitfall was rejected twice in review.

**How to apply (BuildPro TaskBoard):**
- Row: `flex flex-1 min-h-0 items-start ... overflow-x-auto`
- Column wrapper (direct child of row): `flex-shrink-0 flex flex-col max-h-full`
- DroppableColumn root: `flex flex-col flex-1 min-h-0` (NOT `h-full`)
- Card list (already): `flex-1 min-h-0 overflow-y-auto`

**Verification note:** the dev DB has no populated task rows, so a tall column
can't be shown with live data; the empty Kanban board still renders columns
(header + Add) and forcing the view (temporarily bypassing the server
`activeView` pref in Tasks.tsx) is the way to screenshot it.
