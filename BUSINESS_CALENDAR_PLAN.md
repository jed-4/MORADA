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

Rebuild `BusinessCalendar` on **`EnhancedCalendar`**, and retire `MoradaCalendar`, `TaskCalendar`, and the `PersonalCalendar` page behind it.

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
| **Leave** | who's away | ❌ **not built** — see Phase 4 |
| **Meetings** | the meetings | ❌ **not built as scheduled events** — see Phase 6 |

**Optional layers** — every one of these already has a date column and no calendar surface:

| Layer | Column | |
|---|---|---|
| Deliveries due | `purchaseOrders.requiredByDate` | |
| RFQs closing | `rfqs.dueDate`, `rfqs.deadline` | |
| RFIs owed | `rfis.dueDate` | |
| Client selections due | `selections.deadline` | |
| Defects due | `defects.dueDate` | |
| Money in | `clientInvoices.dueDate` | permission-gated |
| ~~Money out~~ | ~~`bills.dueDate`~~ | **cut** — 26 Aug |
| Timesheets (actuals lookback) | `timesheets.date` | already built in the orphan `PersonalCalendar` |
| Site diary | `siteDiaryEntries.entryDateTime` | same |

**Build these as one server endpoint** returning a typed event array — `GET /api/business-calendar/events?startDate=&endDate=&layers=`. Nine client-side queries would be nine trans-Pacific round trips per navigation. One endpoint also gives one place to apply scoping, which matters for the money layers (see D7).

### D5 — Shared views are the entire point of a shared calendar

Three changes, all small:

1. Seed the default view **once per company**, not once per user.
2. Wire the existing `SavedViews` sharing UI into the page (it's written and unused).
3. Ship named starter views: *Site This Week*, *Deliveries & Inspections*, *Client-facing*.

A business calendar people actually use is one where the office manager builds "Deliveries This Fortnight" once and everyone opens it.

### D6 — Read-only *(revised 26 Aug — the drag rule was over-engineered)*

The first draft proposed drag-your-own-tasks-but-not-anyone-else's. That's a rule you'd have to *explain*, and it buys almost nothing: the case for dragging a task on the business calendar is you spotting one of your own tasks while looking at the company's week — which is a thing your own calendar already does better.

So: **the business calendar is read-only.** Click any chip to open its modal and change the date there.

What this deletes: an ownership branch through every drag, resize, and drop handler; the "why can't I move this one" question; and the risk of someone nudging a schedule item and cascading the Gantt. Schedule items open the detail modal, which already offers **"Book my time"** and a link through to Business → Schedule.

The surfaces stay honest: you plan on your calendar, you reschedule the job on the Gantt, and the business calendar shows you the truth of both. If drag turns out to be missed once it's in daily use, it's an easy addition later — the engine already supports it.

### D7 — Permissions and the money layers

There is **no `business.calendar` permission key** — `business.overheads` is the only `business.*` key in the codebase. Both current sources already respect project access server-side, so a restricted user genuinely sees a partial calendar today; that part is fine. Two gaps:

1. No way to hide the business calendar wholesale from a role.
2. The proposed money layers (`clientInvoices.dueDate`, `bills.dueDate`) expose commercial data to anyone who can open the tab. These need their own gate on the server, not just a hidden toggle in the UI.

Add `business.calendar` (view) and gate the financial layers behind the existing finance permissions inside the new endpoint.

### D8 — Leave is a first-class business event *(added 26 Aug)*

Leave is the biggest genuine hole in "all things within the business" — knowing who's away is most of what a shared calendar is for.

**Scope it as marking leave, not as leave management.** The full thing — requests, approvals, accrual, balances, public holidays, payroll — is a separate product decision. What's needed here is: an admin (or the employee) marks someone as away, and it shows on the calendar.

Minimal model — a `leave_entries` table:

| Column | Note |
|---|---|
| `userId` | who's away |
| `startDate` / `endDate` | inclusive, day-granular |
| `isHalfDay` + `halfDayPeriod` | AM/PM — a half day off is common and an all-day chip lies about it |
| `leaveType` | annual / sick / unpaid / RDO / public holiday — a `field_categories` picker, so you can edit the list without a migration |
| `note` | optional |
| `createdBy`, `companyId` | audit + tenancy |

Renders as a **person band**, not a chip: leave is duration, exactly like a work bar, and the same reasoning from D2 applies — five all-day chips per person per week would swamp the grid. In the by-person view (D3) it's a shaded column.

This also fills in `/business/leave`, which is a `ComingSoonPage` today: the tab becomes the list-and-edit surface for the same table.

**Deliberately deferred:** approval workflow, balances, accrual, and payroll or Xero integration. Add them if and when leave becomes its own project.

### D9 — Meetings get scheduled in Morada, not inferred from minutes *(added 26 Aug)*

The first draft proposed reading `minutes.meetingDate` as the meetings layer. That's backwards: `minutes` is a record of a meeting that **already happened**, so a calendar built on it can only ever show you the past. A business calendar's job is to show you Thursday's site meeting *before* Thursday.

So meetings become a real scheduled entity — a `meetings` table with `startsAt` / `endsAt`, attendees (both Morada users and contacts), location or video link, and an optional `projectId`. Then:

- **Forward:** schedule a meeting → it appears on every attendee's calendar *and* the business calendar.
- **Back:** `minutes.meetingId` FK, so recording the minutes attaches them to the meeting they came from, instead of the two being unrelated rows that happen to share a date.

Note `scheduleItems.type` already includes `"meeting"` — but those live inside a *project schedule*, with Gantt semantics and dependencies. A Tuesday management meeting is not a Gantt row. These are different things and should stay separate.

This is the largest single piece of new build in the plan, which is why it's sequenced last.


---

## Part 3 — Phased implementation

Ordered so each phase ships on its own, and so the two-bug correctness fix lands as a small reviewable diff *before* the engine swap makes the file unrecognisable.

### Phase 0 — Correctness (small diff, current engine) ✅ *(done 27 Aug — `b8fe2436`)*

No migration. No new endpoint.

1. Task assignee: match `assigneeIds` array **or** legacy `assigneeId`, at the event-mapping site and in both filter paths.
2. Schedule-item assignee: resolve `assignedToId` against **contacts**, not users; surface the cached `assignedToName` / `assignedToColor` that already sit on the row.
3. Decide what "View as User" means for a schedule item assigned to a subbie — proposal: it drops out of a per-user view, because no Morada user owns it.

**Ships:** the filters on the page start telling the truth. Roughly a day.

**Verification:** two fixtures — one task assigned only via `assigneeIds`, one schedule item assigned to a contact — must appear under the right person and disappear under the wrong one. Delete fixtures afterwards.

### Phase 1 — Engine swap

No migration. Split into two commits, because the risky half should be provably data-neutral. **The verification method is Part 3a**, including the one decision it surfaces that has to be made rather than proven.

#### 1a — Extract the transform (pure refactor) ✅ *(done 27 Aug)*

Lift the `filteredEvents` `useMemo` body verbatim into [`shared/businessCalendarEvents.ts`](shared/businessCalendarEvents.ts) as a pure function:

```
buildBusinessCalendarEvents({
  tasks, scheduleItems, schedules, projects, users,
  completedStatusKey, filters, viewAsUserId, showParentItems, showChildItems,
}): CalendarEvent[]
```

**The extraction is genuinely mechanical, and that's been checked, not assumed.** The memo's dependency array lists ten values, and scanning the body for free identifiers turns up nothing outside them — no closure over `currentDate`, `calendarMode`, `displayOptions`, or `user`. So there is no latent staleness bug for the extraction to accidentally "fix", which is the usual way a supposedly pure refactor changes behaviour.

Two freebies while in there: `deterministicProjectColor` is duplicated verbatim in `BusinessCalendar` and `UserCalendar` and moves into the shared module; and `companySettings` is fetched at [`:160`](client/src/pages/BusinessCalendar.tsx:160) and **never read** — a wasted round trip on every page load, deleted.

`CalendarEvent` also moved to [`shared/calendarEvent.ts`](shared/calendarEvent.ts), re-exported from `EnhancedCalendar` so every existing import path still works. Without that, `shared/` would have had to import from `client/`, and the fingerprint harness would drag React into a Node script.

**Result:** `BusinessCalendar.tsx` 1,448 → 1,284 lines, and the harness reports all 34 states identical to the pre-extraction implementation, in four timezones.

#### 1b — Swap the engine ✅ *(done 27 Aug)*

`MoradaCalendar` → `EnhancedCalendar`, with the transform untouched. Smaller than it sounds — the call site is eight props, and two whole adapter layers disappear:

| Today | After |
|---|---|
| `filteredEvents` (`CalendarEvent[]`) → `toMoradaEvent()` → `moradaEvents` | `filteredEvents` passed straight through — `EnhancedCalendar` already takes `CalendarEvent[]` |
| `displayOptions` hand-rolled into `meta.lines` | `displayOptions` is a native prop |
| `toMoradaView(calendarMode)` | `calendarMode` used directly |

The `displayOptions` change also fixes the gap Phase 0 hit: `MoradaCalendar`'s `block` chip variant never renders the extra lines, so "Show assignee" is invisible on week-view timed events today. `EnhancedCalendar` renders display options itself.

Read-only per D6 — but *not* by omitting the handlers, which was the original plan and was wrong. Without them a chip still lifts, follows the cursor, and silently does nothing on drop, and every task carries a completion checkbox that no-ops. `EnhancedCalendar` gained an explicit `readOnly` prop instead.

✅ **Mini-month and keyboard shortcuts adopted** (28 Aug). They lived inline in `UserCalendar`, not the engine, so they were extracted rather than copied: [`useCalendarShortcuts`](client/src/hooks/useCalendarShortcuts.ts) and [`CalendarDateJumper`](client/src/components/CalendarDateJumper.tsx). The hook takes the list of views a surface actually offers, so `a` switches the business calendar to agenda and is inert on the user calendar, whose switcher has no agenda button to show as selected.

**Two bugs the swap surfaced, both fixed here:**
- `displayOptions.showTime` was shadowed by a local `const showTime = event.startTime || event.endTime`, so the "Time" toggle did nothing. The old engine honoured it, so the swap would have shipped this as a regression.
- Project / assignee / status lines were gated behind `!showResizeHandles`, so "Show assignee" did nothing on week- and day-view timed blocks — on *either* engine. Now rendered there too; a short block clips rather than growing.

---

### Phase 2 — The band layer ✅ *(done 28 Aug)*

No migration.

1. Add `mode: "personal" | "business"` to `scheduleItemTier` (D2). Personal behaviour unchanged.
2. Point the page at `/api/schedule-items/calendar` and pass `mode=business`; render `bands` through the `projectBands` prop `EnhancedCalendar` already accepts.
3. Carry the per-project **Band / Full** toggle across from the user calendar's Projects filter, persisted in the saved view.

**Ships:** the flood goes away, and the "which jobs are running this week" strip appears. Biggest single perceived improvement — same as Phase 1 was on the user calendar.

### Phase 3 — Sources ✅ *(done 28 Aug)*

No migration. Every column listed in D4 already exists.

1. New endpoint `GET /api/business-calendar/events?startDate=&endDate=&layers=`, project-access scoped, the invoice layer permission-gated. One round trip per navigation, not one per layer.
2. The optional layers behind toggles in the filter bar, persisted per saved view.
3. Port the timesheet / site-diary lookback rendering out of `PersonalCalendar` before Phase 7 deletes that page. ✅ — both are layers now, and company-wide rather than one user's.

⚠️ **`checkUserPermission` returns `true` for every key when the caller holds a built-in admin / owner / general-manager role.** So the invoices gate protects the layer from ordinary team members, not from an owner. That is the app's existing model, not something this endpoint chose, but it means "gated" here does not mean "hidden from everyone without the KPI permission".

**Ships:** "all things within the business" — as layers you switch on, not a wall of chips.

### Phase 4 — Leave ✅ *(done 28 Aug — migration 0061, dev only)*

**Migration:** one new table, `leave_entries` (D8). Take the next free number at implementation time — `0054` is in use on `feat/contacts-revamp`. Apply by hand via `psql`, dev then prod.

1. `leave_entries` table + CRUD endpoints, tenancy-scoped by `companyId`.
2. Leave types as a `field_categories` picker, so the list is editable without a migration.
3. Mark leave from the business calendar — select a person and a date range.
4. Render as a person band, with half-days rendering as a half-width segment.
5. `/business/leave` becomes the list-and-edit surface, replacing its `ComingSoonPage`.

**Ships:** who's away, visible to everyone, on the calendar they already open. The tab stops saying "coming soon".

**Explicitly not in scope:** requests, approvals, balances, accrual, payroll or Xero sync.

### Phase 5 — People axis ✅ *(done 29 Aug)*

No migration.

1. Grouping control: All / By person.
2. By-person day view — a column per team member, unassigned in its own column.
3. Person column headers show a load count; click through to that user's calendar.
4. Leave (Phase 4) shades that person's whole column.

**Ships:** "who's on what today" in one glance — the answer Business → Schedule can't give at day granularity.

### Phase 6 — Shared views ✅ *(done 29 Aug — migration 0062, dev only)*

Migration: likely one column (`isCompanyDefault` on `calendar_views`).

1. Company-level default view instead of per-user auto-creation.
2. Wire the existing `SavedViews` sharing UI.
3. ~~Seed the three starter views.~~ **Dropped.** Seeding *Site This Week* / *Deliveries & Inspections* / *Client-facing* means writing opinionated content into 14 companies' tab strips from a migration. The company default is justified because it replaces something the client was already auto-creating; named starter views are a content decision for whoever owns the calendar, not a schema change.
4. Clean up the orphaned per-user "All Events" rows already in prod.

**Ships:** a calendar the team shares rather than fifteen private copies of the same thing.

### Phase 7 — Retire the dead engines ✅ *(done 28 Aug)*

No migration. Once Phases 1–3 have landed and been eyeballed in prod.

Delete `client/src/components/calendar/` (8 files), `TaskCalendar.tsx`, and `PersonalCalendar.tsx` — 2,697 lines. **Keep the `/my-calendar` route as a redirect** to the user's own calendar, and repoint the Quick Actions "Schedule" button at the same place — see the note on this in Part 5, it dissolves the "is anyone using it" question rather than answering it.

**Ships:** one calendar engine instead of three. Every future fix lands everywhere.

### Phase 8 — Meetings

**Migration:** new `meetings` table plus `minutes.meeting_id` (D9). The largest build in the plan.

1. `meetings` table — `startsAt` / `endsAt`, attendee users and contacts, location or video link, optional `projectId`.
2. Create and edit a meeting from the business calendar; it lands on every attendee's own calendar too.
3. `minutes.meetingId` FK — recording minutes attaches them to the meeting, and a meeting shows whether its minutes exist yet.
4. Backfill is optional: existing `minutes` rows keep working with a null `meetingId`.

**Ships:** you schedule Thursday's site meeting in Morada and it's on everyone's calendar — instead of the calendar only ever showing meetings that already happened.

---

## Part 3a — The Phase 1 fingerprint

### What is actually invariant

Not the pixels. The swap *changes* what the grid looks like — that's the point of it. Screenshot-diffing would fail on every frame and prove nothing.

What must not move is **the event set**: the array the grid is handed. If `buildBusinessCalendarEvents` returns byte-identical output across every filter state before and after, then any visual difference is the renderer doing its job, and no task or schedule item silently appeared, vanished, changed colour, or landed on the wrong day.

1a makes that testable by turning a `useMemo` inside a 1,400-line component into a function you can call from a script.

### The harness

`scripts/calendar-fingerprint.ts`, run with `tsx` (this repo has no test runner; `scripts/` is the convention). For each state in the matrix it calls the transform and writes:

- **`fingerprint.txt`** — one line per state: `state-key  count  hash-ordered  hash-unordered`
- **`states/<state-key>.json`** — the full serialised event list, so a hash mismatch can be `diff`ed down to the offending event

Run it on `HEAD~1`, run it on `HEAD`, `diff` the two. The diff is the PR's proof.

**Two hashes, deliberately.** Order-insensitive (sorted by `startDate, startTime, id`) answers "is it the same set". Order-sensitive answers "is it in the same order" — which matters, because output order feeds render order and week-view lane layout. If the unordered hash matches and the ordered one doesn't, you know precisely what changed and can decide whether it's benign, instead of staring at one opaque mismatch.

**Serialise the render-relevant subset, not the whole object.** `id`, `title`, `startDate`, `endDate`, `startTime`, `endTime`, `color`, `projectId`, `projectColor`, `projectName`, `assigneeName`, `assigneeId`, `assigneeIds`, `type`, `status`, `isCompleted`, `templateId`. Hashing `resource` — the entire raw task row — would make the fingerprint churn on unrelated schema additions; assert `resource.id === id` separately instead.

**Pin the timezone.** `TZ=Australia/Sydney` for both runs, because `dueDate` is a timestamp at local midnight and date bucketing is local. Then run one extra pass under `TZ=UTC` and `TZ=America/New_York`: if those two disagree with each other in ways the Sydney run doesn't, there is timezone-dependent logic worth knowing about before it reaches a builder in another state.

### The corpus — this is the part that decides whether any of it means anything

**The dev database cannot prove this.** Phase 0 measured it: four dated tasks, all legacy-assignee, and **zero** schedule items. A fingerprint over that would pass whatever we broke.

So the corpus is generated, and generated to hit the axes that actually branch:

**Tasks** — legacy `assigneeId` only / `assigneeIds` only / both / multi-assignee / unassigned; with and without `dueDate`; timed and untimed; project-scoped, business-scoped, and `projectId: null`; a project with `color` set and one without (the `deterministicProjectColor` path); completed and not; every status key.

**Schedule items** — parent, child, and orphan; every `type` (`task` / `milestone` / `inspection` / `delivery` / `meeting`); contact-assigned, unassigned, and business-assigned in **all three storage forms** (`assignedCompanyId`, the `assignedToId: null` + cached-name convention, and the legacy `assignedToId: "company:<uuid>"`); single-day, multi-day, and missing `endDate`.

**Boundaries** — events on the first and last day of the range, events straddling it, a DST changeover, and 31 December.

### The state matrix

`calendarMode` is **not** an axis. `dateRange` derives from `currentDate` alone ([`:152`](client/src/pages/BusinessCalendar.tsx:152)) and mode never reaches the transform, so month/week/agenda produce the same event set. That drops the matrix by two thirds.

What remains: `filters.projects` (none / one / two / all), `filters.status`, `filters.assignees`, `filters.eventTypes` (none / tasks / schedule-items / both), `filters.dateFrom`+`dateTo` (four combinations), `viewAsUserId` (all / a user with events / a user with none), and `showParentItems` × `showChildItems` (four).

Full cartesian is tens of thousands and mostly redundant. Instead: each axis swept against a fixed baseline, plus a hand-picked set of nasty combinations — project filter **and** assignee filter **and** children hidden together, where a filter-ordering bug would show and a single-axis sweep would not. Around 60–100 states. Sub-second in Node.

### Proving the harness can fail

A fingerprint that always passes is worse than none, because it manufactures confidence. So before trusting it: mutate the transform deliberately — invert one filter comparison, drop the legacy `assigneeId` from `taskAssigneeIds`, off-by-one the parent/child test — and confirm each mutation produces a diff, naming the states it moved. Record that output in the PR. If a mutation passes clean, the matrix has a hole and the corpus needs another axis.

### What the fingerprint does not cover

It proves the data is unchanged. It says nothing about the half of the swap that is most likely to break, so that half gets a written checklist instead:

- **Click-through** — task chip opens `TaskEditModal`, schedule chip opens the detail dialog, both with the right record.
- **Saved views** — load, edit, save, delete; the filters JSON round-trips; the default view still auto-selects.
- **Mode persistence** — a saved `calendarMode` still restores.
- **Empty and loading states** — the skeleton, and a filter combination matching nothing.
- **Mobile** — see below.
- **Screenshots** — month and week, business calendar beside user calendar, as the evidence that it now looks like one product.

---

### Three things the fingerprint cannot settle, and one is a real decision

**1. The two engines do not have the same views.**

| | month | week | day | agenda | roster |
|---|---|---|---|---|---|
| `MoradaCalendar` (today) | ✅ | ✅ | — | ✅ | — |
| `EnhancedCalendar` (after) | ✅ | ✅ | ✅ | **—** | ✅ |

So the swap **cannot** be behaviour-preserving on modes: it gains day and loses agenda. And `EnhancedCalendar` has no mobile handling at all — no `useIsMobile`, no fallback — whereas `MoradaCalendar` force-switches to agenda below `md`. **On a phone, the business calendar would go from a readable list to a 24-hour time grid.** That's a regression, and it's the kind that only shows up on someone's phone on site.

Recommendation: **port `AgendaView` into `EnhancedCalendar` as a fifth mode before swapping.** It's 118 lines, it already consumes this exact event shape, it keeps the mobile fallback, it lets Phase 7 actually delete `components/calendar/`, and the user calendar gains an agenda view on mobile for free — which it does not have today.

**2. Saved views holding `calendarMode: "day"`.** `toMoradaView` maps anything that isn't month or week to agenda, so a legacy `"day"` row currently renders as agenda. After the swap it renders as an actual day view. That is the correct outcome and a silent change of what an existing saved view does — worth a one-line note rather than a migration.

**3. `roster` mode.** `EnhancedCalendar` supports it (week view with infinite horizontal scroll). Not exposed in Phase 1 — it overlaps with the by-person axis in Phase 5 and should be decided there, not inherited by accident.

---

## Part 4 — Sequencing summary

| Phase | Theme | Migration | Depends on |
|---|---|---|---|
| 0 | Correctness — two assignee bugs ✅ | — | — |
| 1 | Engine swap to `EnhancedCalendar` (+ port `AgendaView`) | — | 0 (smaller diff) |
| 2 | Tiering + project band row ✅ | — | 1 |
| 3 | Sources / layers endpoint ✅ | — | 1 |
| 4 | **Leave** ✅ | `leave_entries` (0061, prod-pending) | 1 |
| 5 | People axis / by-person day view ✅ | — | 0, reads 4 |
| 6 | Shared + company-default views ✅ | 0062, prod-pending | — |
| 7 | Delete the dead engines ✅ | — | 1, 3 |
| 8 | **Meetings** | `meetings` + FK | 1 |

Phases 0–2 change how the page feels and touch no schema — that's the first shippable chunk. Phase 3 makes it the whole business. Phases 4 and 8 are the two real builds. Phases 6–7 are the tidy-up that stops this drifting apart again.

---

## Part 5 — Decisions, and what's still open

### Settled 26 August

| # | Decision |
|---|---|
| 1 | **Read-only.** The drag-your-own-tasks rule was over-engineered and is dropped — see D6. |
| 2 | **Leave is in scope** as *marking* leave, not leave management — Phase 4, D8. |
| 3 | **Client invoice due dates in, bill due dates out.** The invoice layer stays permission-gated. |
| 5 | **Meetings get scheduled in Morada** rather than inferred from minutes — Phase 8, D9. |

### 4 — `/my-calendar`: the question is dissolved, not answered

**I could not verify whether anyone uses it, and neither can telemetry.** For the record, what was checked:

- **Sentry has essentially no tracing data.** The `javascript-react` project holds two transaction names totalling 960 spans across 90 days (`/accept-invite/*` and `/projects/*`). No `/my-calendar` — but with a sample that thin, absence there is not evidence of absence.
- **No pageview logging exists in the app.** The `activities` table is an entity feed (created / updated / approved), not navigation.
- **The API calls can't isolate it.** `PersonalCalendar`'s most distinctive query, `/api/company/site-diary-entries`, is also used by the Site Diary page, so hits on it prove nothing.

So Phase 7 **redirects `/my-calendar` at the user's own calendar instead of deleting the route.** Anyone with it bookmarked, and the Quick Actions button, land on the calendar that's actually maintained. The page component still gets deleted; nobody hits a 404; and the usage question stops mattering.

---

## Traps carried over from the user calendar

- **`Task` is `any`.** `notes` is declared `pgTable` with an `any` annotation, so TypeScript will not catch a misspelled task field. Both Phase 0 bugs are exactly this failure mode. Verify field names against `shared/schema.ts` by hand.
- **`dueDate` is local midnight.** A task on Wed 29 AEST serialises as `2026-07-28T14:00:00Z`. Slicing the ISO string looks like an off-by-one and isn't — check the rendered column.
- **Latency.** Neon is `us-east-1`, you are in AU: ~400ms per round trip. Never add a per-item query; one endpoint per navigation.
- **Migrations by hand.** `db:push` was removed from `postMerge` for proposing DROPs. Apply migrations manually via `psql`, dev then prod.
