# Morada User Calendar — "Life and Work in One" Roadmap

**Date:** 30 July 2026
**Benchmark:** Notion Calendar
**Goal:** the user calendar (`/users/:id/calendar`) becomes the one surface a Morada user opens each morning — personal life, in-house site work, and their own task plan on a single grid.

---

## Part 1 — Where it's at

### What already works

Three sources merge onto one grid in [`UserCalendar.tsx`](client/src/components/user-workspace/UserCalendar.tsx): Morada tasks (draggable, resizable, completable), project schedule items, and Google Calendar events. On top of that there are focus blocks, saved filter views, and day/week/month modes. The hard part — one grid, many sources — is done.

### The diagnosis

**The calendar doesn't know what's *yours*.** Everything below follows from that.

| Signal | Today | Should be |
|---|---|---|
| Schedule items filtered by user | **No filter at all** — whole company schedule | Only what you'd turn up for |
| Schedule → user link | **Impossible** — no user FK exists | Optional, on appointment-type items |
| Multi-assignee tasks on calendar | **Never appear** (wrong field name) | Appear |
| Task filtering | Client-side, after fetching all company tasks | Server-side |
| Google calendars | Primary only, one flat colour, read-only | All calendars, own colours, two-way |
| Task duration | Not modelled (`start = end = dueDate`) | Real duration, drag to timebox |

### Confirmed defects

1. **Schedule items are not filtered by user.**
   [`UserCalendar.tsx:261`](client/src/components/user-workspace/UserCalendar.tsx:261) puts `{ calendarUser: displayedUserId }` in the query key, but its `queryFn` calls `/api/schedule-items/all` with no parameters, and that endpoint ([`routes.ts:27151`](server/routes.ts:27151)) filters only by project access. `calendarUser` is a dead cache key. Result: the entire company construction schedule lands on every personal calendar.

2. **Schedule items cannot be assigned to a user.**
   `scheduleItems.assignedToId` → `contacts` (subbies/suppliers); `teamId` → `teams`, which is just id/name/colour with **no membership table**. There is no path from a schedule item to a Morada user. The existing `/api/schedule-items/user-assigned` endpoint compares `item.assignedToId === String(user.id)` — a contact ID against a user ID, which never matches — and admins bypass the filter entirely.

3. **~~Multi-assignee tasks are silently invisible.~~** *(Fixed 31 July 2026 — Phase 0.)*
   The client filter read `task.assignedTo`, which is not a column. Tasks live in the `notes` table and the real field is `assigneeIds`. `assignedTo` was also referenced in three places in `server/storage.ts`, and `DbStorage.getTasks` matched only the legacy single `assigneeId` in SQL. Both storage implementations and both client callers now match legacy-or-array.

   Root cause of why it went unnoticed: `shared/schema.ts` declares `export const notes: any = pgTable(...)`, so `Note`/`Task` infer as `any` and TypeScript never flagged the missing property. **Any future work on tasks should assume the compiler will not catch field-name errors.** The same class of bug is still live in `client/src/pages/Gantt.tsx:948`, which filters schedule items on a non-existent `item.assignedTo`.

4. **~~Events misaligned against the time scale.~~** *(Fixed 30 July 2026.)*
   The hour grid used a hardcoded `h-10` (40px) while events positioned at `HOUR_HEIGHT = 60`, so everything rendered 1.5× its true distance from midnight. All vertical sizing now derives from `HOUR_HEIGHT`.

### The conceptual problem

Tasks and schedule items are **different kinds of time**, and the calendar flattens them into one.

- **Schedule items are project duration.** Multi-day spans with dependencies, baselines, Gantt semantics. "Balcony Waterproofing & Tiling" running Thu–Sun isn't an appointment; it's a state the project is in. Rendering it as an all-day chip is a category error — and it's why the all-day row overflows with "+4 more".
- **Tasks are commitments**, but thinly modelled: a `dueDate` plus optional `startTime`/`endTime`, with the calendar always setting `startDate = endDate = dueDate`. No duration, no multi-day. A task is either a point on the grid or it falls into the all-day pile. `taskTemplates.estimatedDuration` already stores minutes and nothing uses it.

---

## Part 2 — The three design decisions

### Decision 1 — Schedule items: business-assigned by default, not all, not none

`AssigneeSelect.tsx:56` already offers `company:${authUser.companyId}` as an assignee, and `schedules` carries `businessAssignColor` / `businessAssignStatus`. **Business-assigned means your own company is doing it in-house**, as opposed to a subbie. That's precisely the line between "I might need to be there" and "someone else's problem" — and it already exists in the data model, so it needs no new concept.

Three visibility tiers:

| Tier | What | How it renders |
|---|---|---|
| **A. In-house work** | Business-assigned items (`company:<your companyId>`) | Chips on the grid |
| **B. Appointments** | `type` ∈ `milestone` / `inspection` / `delivery` / `meeting`, regardless of assignee | Chips on the grid — you may need to attend even if a subbie owns it |
| **C. Everyone else's work** | Subbie-assigned `task`-type bars | **Project phase band**, not chips (see below) |

Per-project opt-in overrides this for anyone who genuinely wants the full schedule on their calendar.

> **Data caveat:** business assignment currently *nulls out* `assignedToId` and keeps only the cached `assignedToName` ([`routes.ts` POST `/api/schedule-items`](server/routes.ts)). Detection today is "`assignedToId` is null AND `assignedToName` is not null" — fragile. Phase 1 adds an explicit `assignedCompanyId` column so the tier test is honest.

### Decision 2 — Don't assign users to schedule items. Book time against them.

The first draft of this plan proposed adding `assigned_user_ids` to `schedule_items`. **That was the wrong answer**, for the reason Jed identified: assigning yourself to "Framing Carpentry" would drop a five-day bar on your calendar, when the actual commitment is *one hour on Tuesday morning*. Ownership and calendar time are different things, and only the second belongs on the grid.

The right model is a **linked time booking**: a task, linked to the schedule item, carrying its own start and end time.

> Link a task to "Framing Carpentry", offset +0 days from start, 09:00–10:00.
> It appears on your calendar as a one-hour chip on Tuesday.
> If framing slips three days, the booking moves with it.

**Most of this already exists.** `scheduleItems.taskIds` and `scheduleItems.taskLinkOffsets` (`[{taskId, offsetDays, offsetFrom}]`) are live, and [`applyTaskOffsets`](client/src/pages/Schedule.tsx:782) already recomputes a linked task's `dueDate` from the schedule item's start or end date whenever the item moves. Tasks already carry `startTime`, `endTime`, and `assigneeIds`, and already render on the calendar.

The only gaps:

1. `applyTaskOffsets` writes `dueDate` only — it never sets `startTime`/`endTime`.
2. `taskLinkOffsets` has no time-of-day component, only whole days.
3. There's no one-click way to create the booking from a schedule item.

This is strictly better than user assignment: no new column on a hot table, no change to how schedules are built, and it works identically for both cases — attending a subbie's frame inspection, and doing a site visit partway through a multi-day work bar. `assigned_user_ids` is therefore **dropped from this plan**. If ownership-based filtering is wanted later it can return on its own merits, but it isn't what the calendar needs.

### Decision 3 — "Layer, not events" — what that actually means

This was the point that didn't land last time, so concretely:

**Today** every schedule item becomes a chip competing for space with your real appointments. Your Friday column in the screenshot has five all-day bars plus "+4 more", which pushes the actual time grid down and tells you nothing you can act on.

**A layer** means the tier-C work bars stop being chips and become a **slim band** — roughly 6–8px — sitting under each day's date header. Each active project gets one continuous coloured segment across the days it's running, with a tooltip or a click for detail. No text competing for space, no all-day overflow.

```
        MON 27      TUE 28      WED 29      THU 30      FRI 31
      ┌──────────────────────────────────────────────────────────┐
band  │▓▓▓▓▓▓▓▓ Smithies: waterproofing ▓▓▓▓│░░░ Chamberlain ░░░░│  ← 8px, glanceable
      ├──────────────────────────────────────────────────────────┤
ALLDAY│                        │ Tiles Delivery │                 │  ← tier B only
      ├──────────────────────────────────────────────────────────┤
 7AM  │                                                          │
 8AM  │            │ Frame inspection 8:00 │                      │  ← tier A + B
```

You glance at the band and know "Smithies is in waterproofing this week" without reading a single chip. Instead of eight all-day bars you get one thin band plus the two things you actually have to show up for. The all-day row goes back to meaning *all-day appointments*.

---

## Part 3 — Phased implementation

Ordered so each phase is shippable on its own. **Schedule noise is fixed before Google expands**, because tripling the number of Google events on top of today's flood would make the page worse, not better.

### Phase 0 — Correctness ✅ *(done — branch `feat/calendar-phase0`)*

No schema change. Pure bug fixes.

1. ✅ **Phantom `assignedTo` removed.** `DbStorage.getTasks` now matches `assigneeId = X OR assigneeIds @> [X]` via drizzle's `arrayContains`; `DbStorage.getTasksByUser` and both `MemStorage` equivalents use `assigneeIds`. A dead `assigneeType === 'user'` branch was also removed — those columns exist on `task_templates`, never on `notes`.
2. ✅ **Task filtering moved server-side.** `UserCalendar` and `usePersonalCalendarEvents` now request `/api/tasks?assigneeId=…` instead of fetching every company task and filtering in the browser. Deliberately *not* date-ranged: the assignee filter is the large win, and a `currentDate`-derived range would either refetch on every week navigation (~400ms each, AU ↔ us-east-1) or silently hide tasks outside the window. Revisit only if per-user payloads grow.
3. ✅ **`calendarUser` retired.** It was never sent to the server, so it implied a filter that did not exist; the schedule queries now share one honest cache entry.

**Blast radius (bigger than the calendar):** seven other callers hit `/api/tasks?assigneeId=` — `MyDayWidget`, `PersonalMetricsWidget`, `PersonalCalendarWidget`, `PersonalAISummaryWidget`, `CrossProjectDeadlinesWidget`, `UserTasks`, plus the calendar. All were missing multi-assignee tasks and are corrected by the same server fix.

**Verified:** with two fixtures (one assigned only via `assigneeIds`, one only via legacy `assigneeId`), `/api/tasks?assigneeId=` returned both; the array-only row would not have matched the old predicate. `tsc` error count in the touched files was 255 before and after — no new type errors. Fixtures removed afterwards.

**Ships:** tasks that were invisible appear, across the calendar and six widgets; the page stops shipping the whole company's task list to the browser.

### Phase 1 — Schedule visibility model ✅ *(done — branch `feat/calendar-phase0`)*

**No migration.** The planned `assigned_company_id` column was dropped from this phase: it makes the business-assigned test tidier but enables nothing, since the codebase already detects business assignment reliably (the same test it uses internally in the schedule-item PATCH path). Adding a column would have made the phase unverifiable without a manual `psql` run. It remains available as an optional cleanup — see `isBusinessAssigned`, which already reads an `assignedCompanyId` field first if one ever appears.

1. ✅ **Tier rules extracted** to [`shared/scheduleVisibility.ts`](shared/scheduleVisibility.ts) — `isBusinessAssigned`, `isAppointmentType`, `scheduleItemTier`, `computeProjectBands`. One place, unit-testable, shared by client and server. Handles all three storage forms of business assignment, including legacy `assignedToId = "company:<uuid>"` rows.
2. ✅ **New endpoint** `GET /api/schedule-items/calendar?startDate=&endDate=&fullScheduleProjects=` returning `{ events, bands }`, with the same project-access rules as `/all`.
3. ✅ **Retired `/api/schedule-items/user-assigned`** — nothing consumed it and its filter compared contact ids to user ids.
4. ✅ **Project band rendered** under the day headers in week/day view, horizontally scroll-synced with the header, all-day and time-grid rows. Labelled on the band's first visible day, `title` tooltip carries project, label and item count, max 3 stacked bands per day with a `+n` overflow.
5. ✅ **Per-project opt-in** — a `Band`/`Full` toggle beside each project in the calendar's Projects filter, persisted in `filters.fullScheduleProjects` and therefore in saved views.

Also fixed in passing: `CalendarFilters` did not declare `projectIds`/`statuses`, the field names UserCalendar's own inline filter panel reads *and* writes. The filters worked at runtime; only the shared type was wrong. Declaring them removed ~50 type errors.

**Verified on dev data:** 6 schedule items became 3 chips + 3 bands. The three promoted to chips were exactly the milestones (Concrete Slab, Lock-Up Stage, Practical Completion); the three banded were the multi-month work spans. With fixtures added to the current week, a subbie's 4-day framing bar rendered as one band labelled on its start day with continuation segments Wed–Fri and nothing on the weekend, while a subbie's frame inspection stayed a real 09:00 chip on the grid. Toggling that project to `Full` collapsed the band and restored per-day chips; toggling back restored the band. Fixtures removed afterwards.

**Ships:** the flood is gone. This is the single biggest perceived improvement.

### Phase 2 — Task timeboxing ✅ *(done — branch `feat/calendar-phase0`)*

**No migration.** The planned `duration_minutes` on `notes` isn't needed: a timeboxed task's duration is already `endTime − startTime`, and the length for a *newly* dropped task comes from `taskTemplates.estimatedDuration` (falling back to 30 minutes). Adding a third source of truth for duration would invite drift.

1. ✅ **Unscheduled tray** — collapsible right-hand panel listing due-but-untimed tasks, which no longer land in the all-day row. Shows tasks due up to the end of the visible range, including overdue ones with a count. Collapses to a 7px rail with a badge.
2. ✅ **Drag onto the grid** sets `startTime` *and* `endTime` — length from the task template's `estimatedDuration`, else 30 minutes.
3. ✅ **Already done** — the week renderer has always sized blocks from `endTime − startTime`; no change needed.
4. ✅ **Drag back to the tray** clears both times via a new unschedule mutation. *(Implemented; not yet exercised in the browser — see below.)*
5. ✅ **Focus block reconciliation** — dropping a task on a slot covered by a focus block also pins it to that block. This first required *wiring focus blocks onto this calendar at all*: `EnhancedCalendar` has always had a focus-block overlay with drag and resize, but **nothing ever passed the `focusBlocks` prop**, so it was dead code. Blocks were only on `/my-calendar` (`PersonalCalendar`), which has its own renderer. UserCalendar now fetches them (`?userId=` when an admin views someone else) along with each block's tasks, renders the overlay, and allows moving/resizing — editing only on your own page, since the API requires block ownership.

Pinning stays quiet on failure: the task was still timeboxed, which is what the user asked for. Unscheduling a task leaves it pinned — pinning records "this belongs to this block", which is independent of whether it currently has a time; unpin from the focus block panel.

**Server fix required:** clearing a task's times was impossible. `PATCH /api/tasks/:id` deleted null `startTime`/`endTime` from the body ("to avoid validation errors") because `insertNoteSchema` typed them `z.string().optional()` without `.nullable()`. The tray's drag-back returned 200 and silently did nothing. Both are fixed; empty strings are still stripped, and the create path is unchanged.

Also fixed: dragging an *existing* timed block used to move its start without its end, silently resizing it. Reschedule now carries the end time so a block keeps its length.

**Collision detection changed** from dnd-kit's default (rectangle overlap) to pointer-first with a `closestCenter` fallback. The default compares the dragged element's box, so a full-width tray item grabbed near its right edge dropped a whole column to the left of the cursor — observed in testing. This affects on-grid event drags too, making them cursor-accurate.

**Verified end to end** against the dev database, with a focus block on Wed 29 (13:00–15:00) and three fixture tasks:

- The tray rendered five untimed tasks — fixtures plus three real ones that had been buried in the all-day row — each with project name and colour; the all-day row went empty.
- Dragging a tray item into the focus block timeboxed it to `14:00`–`14:30` (the 30-minute default), and the chip rendered in the **Wed 29** column — confirming pointer-first collision lands drops where the cursor is.
- The same drop pinned the task: the block's `pinnedTaskIds` contained it, and it appeared both on the grid and inside the block overlay.
- Dragging the chip back to the tray cleared both times and returned it to the list.

> A caution for anyone reading verification output: `dueDate` is a timestamp at **local** midnight, so a task on Wed 29 AEST serialises as `2026-07-28T14:00:00Z`. Slicing the ISO string looks like an off-by-one-day bug and isn't — check the rendered column instead.

All fixtures were deleted afterwards and the dev DB confirmed clean.

**Ships:** the calendar becomes a planner. This is the Notion Calendar workflow and the piece you're most keen on.

### Phase 3 — Book my time against a schedule item ✅ *(done — branch `feat/calendar-phase0`)*

No new table, no migration. Extends the existing `taskIds` / `taskLinkOffsets` link.

1. ✅ `taskLinkOffsets` widened to `{taskId, offsetDays, offsetFrom, startTime?, endTime?}` — additive, so existing rows keep working. Times are only present on *bookings*; a plain due-date link is left alone.
2. ✅ **Reflow moved to the server** ([`server/utils/scheduleTaskLinks.ts`](server/utils/scheduleTaskLinks.ts)) and hooked into both the single-item PATCH and the bulk endpoint, firing when dates *or* offsets change. It writes `startTime`/`endTime` alongside `dueDate` so a booking keeps its hour. The old client-side `applyTaskOffsets` in Schedule.tsx is deleted — it only ever covered that one modal.
3. ✅ **"Book my time"** on any schedule item in the calendar's detail modal, via `POST /api/schedule-items/:id/book-time`. Creates a task assigned to you, inheriting the item's own times when it has them (an inspection at 9 books 9–10) else 09:00–10:00, and links it back. Adjust afterwards by dragging on the grid — Phase 2 made that cheap.
4. ⬜ Show existing bookings on the schedule item's detail panel. Not done; the link exists in `taskIds` so this is presentation-only.
5. ✅ Reflow now fires for **every** path — Schedule edit modal, single Gantt drag, and the bulk endpoint the Gantt uses for cascades.
6. ⬜ Calendar affordance linking a booking back to its schedule item. Not done.

**Two pre-existing bugs fixed to make this work:**
- `notes.author` is NOT NULL and is filled by the task-create *route*, not `storage.createTask`. Any other server-side caller of `createTask` hits a constraint violation.
- `POST /api/schedule-items/bulk` never validated its payload, so date strings reached Drizzle uncoerced and **any bulk date change threw `value.toISOString is not a function`**. It went unnoticed because the Gantt only ever sent `sortOrder` through it. Each item's `updates` now goes through `updateScheduleItemSchema`, the same schema the single PATCH uses.

**Verified** against the dev database: booking an inspection produced a task assigned to the user at 09:00–10:00 on the item's date, with `taskLinkOffsets` carrying the window. Moving the item **29 Jul → 3 Aug** via single PATCH moved the booking and kept 09:00–10:00; moving it **3 Aug → 27 Jul** via the bulk endpoint did the same. Fixtures removed afterwards. No new type errors (1414 both sides).

**Not verified in-browser:** the "Book my time" button click itself — the dev browser pane wedged with a zero-size viewport. The button is a thin wrapper over the endpoint above, and the one real risk (that a schedule event's `id` is the schedule item's id) was confirmed from the mapping in `UserCalendar`.

**Ships:** "I'm at the frame inspection 9–10am Tuesday" — one hour on your calendar, not a five-day bar, and it follows the schedule when the job moves.

### Phase 4 — Google multi-calendar + real colours

1. `/api/google-calendar/calendars` listing the user's calendar list.
2. Persist per-user calendar selections and replace the hardcoded `calendarId: 'primary'` ([`routes.ts:9250`](server/routes.ts:9250)) with a fan-out over selected calendars.
3. Carry each calendar's Google colour through instead of the single `#7aafff`.
4. Calendar picker in the settings dialog; toggles in the filter bar.
5. Surface `event.location` on chips — it's already fetched and currently discarded.

**Ships:** family calendar, partner's calendar, personal calendar. This is the "my whole life is here" moment.

### Phase 5 — Google two-way write

1. Create/update/delete endpoints; confirm the OAuth scope is read-write and re-consent if not.
2. Let Google events drag, resize, and edit like tasks do — remove the block at [`UserCalendar.tsx:246`](client/src/components/user-workspace/UserCalendar.tsx:246).
3. Optimistic updates with rollback, since every write is a trans-Pacific round trip.
4. Respect per-calendar `accessRole` — never offer edit on a read-only subscribed calendar.

**Ships:** you stop leaving Morada to move a meeting.

### Phase 6 — Local sync instead of live proxy

Migration: new `google_calendar_events` + `google_calendar_sync_state` tables.

1. Store events locally; refresh with Google's incremental sync tokens.
2. Register push webhooks (`watch`) so changes arrive rather than being polled.
3. Serve the calendar from the local table — instant paint, background refresh.
4. Reconciliation job for missed webhooks and expired channels.

**Ships:** the calendar opens instantly instead of waiting on a Google round trip (currently guarded by a 20s timeout).

### Phase 7 — Morada → Google publish

1. Per-user secret iCal feed exposing their tier A/B schedule items and timeboxed tasks.
2. Or write into a dedicated "Morada" Google calendar via the Phase 5 write path.
3. Settings toggle for what to publish.

**Ships:** your plan shows up in the phone's native calendar — which for anyone living in a truck matters more than anything in-app.

### Phase 8 — Differentiators (pick by appetite)

- **Availability / booking links** — "pick a time with Jed" for clients and consultants. Fits the existing onsite-consultation flow and is Notion Calendar's standout feature.
- **Natural-language quick add** — "Site meeting Tue 7am @ Smithies".
- **Join-meeting affordance** — detect Meet/Zoom links in event descriptions, surface a join button near the event time.
- **Teammate overlay** — view another user's calendar as a translucent layer for scheduling.
- **Timesheet actuals overlay** — planned vs actually-worked on the same grid.
- **Reminders as a source** — the tab exists; the events never reach the calendar.
- **Week templates** — stamp out a standard routine (the Sign On / PM Sweep / Estimating pattern is hand-maintained today).
- **Keyboard shortcuts + mini-month** — `t` for today, `w`/`m` for view, fast navigation.

---

## Part 4 — Sequencing summary

| Phase | Theme | Migration | Independent? |
|---|---|---|---|
| 0 | Correctness ✅ | — | Yes |
| 1 | Schedule visibility ✅ | — | Needs 0 |
| 2 | Task timeboxing ✅ | — | Yes |
| 3 | Time bookings on schedule items ✅ | — | Needs 0 |
| 4 | Google multi-calendar | — | Yes |
| 5 | Google two-way write | — | Needs 4 |
| 6 | Google local sync | 2 new tables | Needs 4 |
| 7 | Morada → Google | — | Needs 1, 2 |
| 8 | Differentiators | varies | Needs 4–6 |

Phases 0–3 are the ones that change how the page *feels* day to day, and only two of them touch the schema. Phases 4–6 are what make it the only calendar you open.

> **Migration numbering:** this checkout has up to `0028`, but `0029`–`0031` exist on the variations and dashboard-widgets branches. Take the next free number at implementation time rather than reserving one now. Per project convention, apply to prod manually via `psql` — never `db:push`.
