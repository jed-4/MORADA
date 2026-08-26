# Morada Business Calendar — "What is the company doing this week"

**Date:** 26 August 2026
**Branch:** `feat/business-calendar`
**Surface:** Business → Calendar (`/business/calendar`)
**Companion doc:** [`CALENDAR_ROADMAP.md`](CALENDAR_ROADMAP.md) — the user calendar, Phases 0–3 shipped

**Goal:** the business calendar looks and behaves exactly like the user calendar, but answers a different question. The user calendar answers *"what do I have to turn up to."* The business calendar answers *"what is the company doing, and who's doing it."* Same grid, different lens.

---

## Part 1 — Where it's at

### What exists

`/business/calendar` renders [`BusinessCalendar.tsx`](client/src/pages/BusinessCalendar.tsx) (1,421 lines) inside the Business tab shell. It pulls **two** sources:

| Source | Endpoint | Scoping |
|---|---|---|
| Tasks | `/api/tasks?startDate=&endDate=` ([:162](client/src/pages/BusinessCalendar.tsx:162)) | server-side: private tasks and project access already filtered |
| Schedule items | `/api/schedule-items/all?startDate=&endDate=` ([:172](client/src/pages/BusinessCalendar.tsx:172)) | server-side: project access only |

Both are converted to `CalendarEvent`s client-side, filtered client-side, and rendered through **`MoradaCalendar`** — month / week / agenda, read-only. Clicking a task opens `TaskEditModal`; clicking a schedule item opens a detail dialog.

Chrome that's already there and works: saved-view tabs with a settings dialog (display-on-cards toggles), project / status / assignee / event-type / date-range filters, parent-vs-child schedule item toggles, and a "View as User" select.

**In short: it is the user calendar as it stood in July, on an older engine, with an all-users filter instead of a me filter.** Every 2026 calendar improvement — bands, timeboxing, day view, drag, keyboard nav, mini-month — landed on the other engine and never reached this page.

### Four things that are actually broken

**1. The assignee filter silently drops most tasks.**
[`:264`](client/src/pages/BusinessCalendar.tsx:264) reads `task.assigneeId` — the *legacy single* column. Tasks assigned through `assigneeIds` (the array, which is the normal path) come through with `assigneeId: null`, so both "View as User" ([`:336`](client/src/pages/BusinessCalendar.tsx:336)) and the Assignee filter quietly exclude them. This is the same class of bug Phase 0 of the user-calendar roadmap fixed *server-side*; it never reached this page because this page filters in the browser.

Worth restating the roadmap's warning: `shared/schema.ts` declares `export const notes: any = pgTable(...)`, so `Task` infers as `any` and **the compiler will not catch a wrong field name here.**

**2. Schedule-item assignee names never resolve — not once.**
[`:307`](client/src/pages/BusinessCalendar.tsx:307) does `users.find(u => u.id === item.assignedToId)`. But `scheduleItems.assignedToId` references **`contacts`** ([`schema.ts:3747`](shared/schema.ts:3747)) — subbies and suppliers, not Morada users. A contact id never matches a user id, so `assigneeName` is null for every schedule item on the page: the "Show assignee" card option does nothing for them, and the assignee filter discards all of them.

**3. The flood — worse here than it ever was on the personal calendar.**
Every schedule item in range becomes a chip competing for space with real appointments. On one user's calendar that produced an all-day row reading "+4 more". Company-wide it is every active job's every work bar, at once. The fix already exists and this page doesn't call it: [`shared/scheduleVisibility.ts`](shared/scheduleVisibility.ts) and `GET /api/schedule-items/calendar` returning `{ events, bands }` ([`routes.ts:30392`](server/routes.ts:30392)).

**4. "Business" saved views are private.**
Every user silently gets their own `All Events` row in `calendar_views` ([`:206`](client/src/pages/BusinessCalendar.tsx:206)). The table has a `sharedWith` column, `getCalendarViews` already unions in views shared with you ([`storage.ts:21509`](server/storage.ts:21509)), and [`SavedViews.tsx`](client/src/components/SavedViews.tsx) contains a complete share-with-users UI — **which nothing imports.** All three calendar pages import only its `CalendarView` *type*. So the shared calendar currently has no shared views.

### Two structural facts worth knowing before planning

**There are three calendar implementations, and the unification went backwards.**

| Engine | Used by | Capability |
|---|---|---|
| `EnhancedCalendar` (1,967 lines) | User calendar (`/users/:id/calendar`) | day / week / month / roster, drag-reschedule, resize, project bands, focus blocks, unscheduled tray, completion checkboxes, current-time line |
| `MoradaCalendar` (`components/calendar/`, 829 lines) | **Business calendar**, `/my-calendar` | month / week / agenda, read-only |
| — | `TaskCalendar.tsx` | **no consumers at all** |

A commit dated 2025-11-04 titled *"Unify all calendar views into a single, consistent component"* created `MoradaCalendar`. Every calendar feature built in 2026 then went into `EnhancedCalendar` instead. There is also a **third calendar page** — [`PersonalCalendar.tsx`](client/src/pages/PersonalCalendar.tsx) at `/my-calendar`, reachable only from the Quick Actions widget's "Schedule" button — which is on the `MoradaCalendar` engine and, oddly, is the *only* page that renders timesheet and site-diary events ([`:471`](client/src/pages/PersonalCalendar.tsx:471), [`:494`](client/src/pages/PersonalCalendar.tsx:494)).

**Business → Schedule already owns the Gantt.** [`BusinessSchedule.tsx`](client/src/pages/BusinessSchedule.tsx) plus [`CompanyWorkload.tsx`](client/src/pages/CompanyWorkload.tsx) give the company-wide bar chart and per-contact / per-team swimlanes. The calendar must not become a second Gantt. **Schedule = how the jobs run over months. Calendar = what happens on which day.**

---

## Part 2 — How it should work

### D1 — One engine, two lenses

Rebuild `BusinessCalendar` on **`EnhancedCalendar`**, and retire `MoradaCalendar`, `TaskCalendar`, and the `/my-calendar` page.

This is the decision that delivers "it needs to look like the user calendar" — not by restyling, but by being the same component. It also means every future calendar feature lands on both surfaces at once, instead of the split that produced today's gap. `MoradaCalendar`'s only two live consumers are the two pages this plan replaces, so the whole directory goes.

### D2 — Company-wide density needs the tier discipline *more*, and a different rule

Reuse `scheduleVisibility.ts`, but the tier test has to change for this surface.

Today `scheduleItemTier` promotes **business-assigned** items to chips, because on a personal calendar "in-house" is a proxy for "might be me". Company-wide that proxy inverts: in-house work is the *bulk* of the schedule, so the current rule would put nearly everything back on the grid as chips.

On the business calendar the axis is not *whose* but **what kind of time**:

| Tier | What | Renders as |
|---|---|---|
| **Event** | Point-in-time commitments: `milestone` / `inspection` / `delivery` / `meeting`, plus any item carrying a `startTime` | Chip on the grid |
| **Band** | Duration: multi-day work bars, whoever owns them | One slim band per project per contiguous stretch |

Implementation is small: add a `mode: "personal" | "business"` parameter to `scheduleItemTier` that skips the `isBusinessAssigned` clause and adds the has-a-time clause. `computeProjectBands` needs no change.

**The band row becomes the most valuable thing on the page.** One glance at the week tells you which jobs are running, without reading a single chip — which is exactly the question a builder opens a business calendar to answer.

### D3 — A people axis, done properly

Once the two assignee bugs are fixed, offer three groupings:

| Grouping | What it answers | Notes |
|---|---|---|
| **All** *(default)* | everything on one grid | today's behaviour, but correct |
| **By person** | "who is where today" | day view with a column per team member — the thing the user calendar structurally cannot do |
| **By project** | "what's on for this job" | colour is already project-derived; grouping makes a week readable per job |

Recommend shipping **All** and **By person**. By-project can wait — the band row covers most of that need.

Note "By person" is not the same as `CompanyWorkload`'s swimlanes: that groups *schedule items by contact* (subbies) over weeks. This groups *everything, by Morada user*, within a day.

### D4 — Sources: two rings, not one dump

"All things within the business" is the right ambition and the wrong default. Nine layers switched on at once is unreadable, and each is a query against a database ~400ms away. So: a **core ring** on by default, and **optional layers** off by default, persisted per saved view.

**Core**

| Source | Why it's core | Status |
|---|---|---|
| Schedule items, tiered | the jobs | ✅ endpoint exists, needs the `business` mode |
| Tasks, all assignees | the work | ✅ exists, assignee resolution broken |
| Meetings (`minutes.meetingDate`) | the meetings | ⚠️ table exists, on no calendar today |
| Leave | who's away | ❌ **not built** — `/business/leave` is a `ComingSoonPage` |

**Optional layers** — every one of these already has a date column and no calendar surface:

| Layer | Column |
|---|---|
| Deliveries due | `purchaseOrders.requiredByDate` |
| RFQs closing | `rfqs.dueDate`, `rfqs.deadline` |
| RFIs owed | `rfis.dueDate` |
| Client selections due | `selections.deadline` |
| Defects due | `defects.dueDate` |
| Money in | `clientInvoices.dueDate` |
| Money out | `bills.dueDate` |
| Timesheets (actuals lookback) | `timesheets.date` — already built in the orphan `PersonalCalendar` |
| Site diary | `siteDiaryEntries.entryDateTime` — same |

**Build these as one server endpoint** returning a typed event array — `GET /api/business-calendar/events?startDate=&endDate=&layers=`. Nine client-side queries would be nine trans-Pacific round trips per navigation. One endpoint also gives one place to apply scoping, which matters for the money layers (see D7).

### D5 — Shared views are the entire point of a shared calendar

Three changes, all small:

1. Seed the default view **once per company**, not once per user.
2. Wire the existing `SavedViews` sharing UI into the page (it's written and unused).
3. Ship named starter views: *Site This Week*, *Deliveries & Inspections*, *Client-facing*.

A business calendar people actually use is one where the office manager builds "Deliveries This Fortnight" once and everyone opens it.

### D6 — Read-mostly, and deliberately so

The user calendar is a planner — you drag your own things around. The business calendar is mostly a *window*, because dragging someone else's schedule item cascades the Gantt through dependency reflow.

Proposed rule:

- **Tasks** you own or are assigned to: draggable and resizable, same as the user calendar.
- **Everyone else's tasks**: click to open, no drag.
- **Schedule items**: never draggable here. Open the detail modal, which already offers **"Book my time"** (Phase 3, built) and a link through to Business → Schedule.

This keeps the surfaces honest: you plan on your calendar, you reschedule the job on the Gantt, and the business calendar shows you the truth of both.

### D7 — Permissions and the money layers

There is **no `business.calendar` permission key** — `business.overheads` is the only `business.*` key in the codebase. Both current sources already respect project access server-side, so a restricted user genuinely sees a partial calendar today; that part is fine. Two gaps:

1. No way to hide the business calendar wholesale from a role.
2. The proposed money layers (`clientInvoices.dueDate`, `bills.dueDate`) expose commercial data to anyone who can open the tab. These need their own gate on the server, not just a hidden toggle in the UI.

Add `business.calendar` (view) and gate the financial layers behind the existing finance permissions inside the new endpoint.

---

## Part 3 — Phased implementation

Ordered so each phase ships on its own, and so the two-bug correctness fix lands as a small reviewable diff *before* the engine swap makes the file unrecognisable.

### Phase 0 — Correctness (small diff, current engine)

No migration. No new endpoint.

1. Task assignee: match `assigneeIds` array **or** legacy `assigneeId`, at the event-mapping site and in both filter paths.
2. Schedule-item assignee: resolve `assignedToId` against **contacts**, not users; surface the cached `assignedToName` / `assignedToColor` that already sit on the row.
3. Decide what "View as User" means for a schedule item assigned to a subbie — proposal: it drops out of a per-user view, because no Morada user owns it.

**Ships:** the filters on the page start telling the truth. Roughly a day.

**Verification:** two fixtures — one task assigned only via `assigneeIds`, one schedule item assigned to a contact — must appear under the right person and disappear under the wrong one. Delete fixtures afterwards.

### Phase 1 — Engine swap, behaviour-preserving

No migration.

1. Replace `MoradaCalendar` with `EnhancedCalendar` in `BusinessCalendar`, keeping every existing filter, saved view, and display option working identically.
2. Adopt the user calendar's own header: mini-month jump, keyboard shortcuts (`t` / `←` / `→` / `d` `w` `m`), day view.
3. Wire `hideInternalHeader` and render the page's own nav, exactly as `UserCalendar` does.

**Ships:** it looks like the user calendar, because it *is* the user calendar's grid.

**Verification:** fingerprint-diff the rendered event set before and after — same events, same days, same colours — the way PR #43 proved zero behaviour change on `ProjectScope`. Screenshot both surfaces side by side.

### Phase 2 — The band layer

No migration.

1. Add `mode: "personal" | "business"` to `scheduleItemTier` (D2). Personal behaviour unchanged.
2. Point the page at `/api/schedule-items/calendar` and pass `mode=business`; render `bands` through the `projectBands` prop `EnhancedCalendar` already accepts.
3. Carry the per-project **Band / Full** toggle across from the user calendar's Projects filter, persisted in the saved view.

**Ships:** the flood goes away, and the "which jobs are running this week" strip appears. Biggest single perceived improvement — same as Phase 1 was on the user calendar.

### Phase 3 — Sources

Probably no migration. Every column listed in D4 already exists — with one caveat: `minutes` has `meetingDate` and `location` but **no end time**, so a meeting renders as a point, not a block, unless a `duration_minutes` column is added.

1. New endpoint `GET /api/business-calendar/events` with a `layers` parameter, project-access scoped, finance layers permission-gated.
2. Meetings from `minutes` into the core ring.
3. The nine optional layers behind toggles in the filter bar, persisted per saved view.
4. Port the timesheet / site-diary lookback rendering out of `PersonalCalendar` before that page is deleted.

**Ships:** "all things within the business" — as layers you switch on, not a wall of chips.

### Phase 4 — People axis

No migration.

1. Grouping control: All / By person.
2. By-person day view — a column per team member, unassigned in its own column.
3. Person column headers show a load count; click through to that user's calendar.

**Ships:** "who's on what today" in one glance — the answer Business → Schedule can't give at day granularity.

### Phase 5 — Shared views

Migration: likely one column (`isCompanyDefault` on `calendar_views`) — take the next free number at implementation time; `0054` is in use on `feat/contacts-revamp`.

1. Company-level default view instead of per-user auto-creation.
2. Wire the existing `SavedViews` sharing UI.
3. Seed the three starter views.
4. Clean up the orphaned per-user "All Events" rows already in prod.

**Ships:** a calendar the team shares rather than fifteen private copies of the same thing.

### Phase 6 — Retire the dead engines

No migration. Pure deletion, once Phases 1–3 have landed and been eyeballed in prod.

Delete `client/src/components/calendar/` (8 files), `TaskCalendar.tsx`, `PersonalCalendar.tsx`, and the `/my-calendar` route; repoint the Quick Actions "Schedule" button at the user calendar.

**Ships:** one calendar engine instead of three. Every future fix lands everywhere.

### Phase 7 — Leave *(blocked — separate build)*

Leave is the largest genuinely missing business source, and it is not a calendar feature: it needs a request/approve flow, a balance model, and a table. `/business/leave` is a `ComingSoonPage` today. **Scope it separately**; the calendar consumes it in an afternoon once it exists.

---

## Part 4 — Sequencing summary

| Phase | Theme | Migration | Depends on |
|---|---|---|---|
| 0 | Correctness — two assignee bugs | — | — |
| 1 | Engine swap to `EnhancedCalendar` | — | 0 (smaller diff) |
| 2 | Tiering + project band row | — | 1 |
| 3 | Sources: meetings + layers endpoint | probably none | 1 |
| 4 | People axis / by-person day view | — | 0 |
| 5 | Shared + company-default views | 1 column | — |
| 6 | Delete the two dead engines | — | 1, 3 |
| 7 | Leave | new table | a separate build |

Phases 0–2 are what change how the page feels, and none of them touch the schema. Phase 3 is where it becomes "the whole business". Phases 5–6 are the tidy-up that stops this drifting apart again.

---

## Open questions

1. **Write access.** D6 proposes: drag your own tasks, never drag schedule items. Is read-mostly right, or do you want to reschedule the job from here too?
2. **Leave.** It's the biggest hole in "all things within the business". Worth scoping as its own build now, or park it?
3. **Money layers.** Invoice and bill due dates on the business calendar — genuinely useful, or is that Metrics' job? It's the only part of this plan that puts commercial figures on a screen the whole team opens.
4. **`/my-calendar`.** Confirm nobody uses it before Phase 6 deletes it. It's reachable only from the Quick Actions "Schedule" button, but that button is on the dashboard.
5. **Meetings.** `minutes` records a meeting *after* the fact. Is there an intent to schedule meetings in Morada, or should the meetings layer be Google-sourced instead?

---

## Traps carried over from the user calendar

- **`Task` is `any`.** `notes` is declared `pgTable` with an `any` annotation, so TypeScript will not catch a misspelled task field. Both Phase 0 bugs are exactly this failure mode. Verify field names against `shared/schema.ts` by hand.
- **`dueDate` is local midnight.** A task on Wed 29 AEST serialises as `2026-07-28T14:00:00Z`. Slicing the ISO string looks like an off-by-one and isn't — check the rendered column.
- **Latency.** Neon is `us-east-1`, you are in AU: ~400ms per round trip. Never add a per-item query; one endpoint per navigation.
- **Migrations by hand.** `db:push` was removed from `postMerge` for proposing DROPs. Apply migrations manually via `psql`, dev then prod.
