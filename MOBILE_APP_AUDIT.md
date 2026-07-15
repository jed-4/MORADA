# Morada Mobile App (Expo) Audit

**Date:** 15 July 2026
**Scope:** all 23 screens, 3 components, and core infrastructure (auth, API layer, offline queue, navigation, push, theme) in `expo-mobile/` (~29,000 lines), reviewed in four parallel passes.
**Status:** report only — no changes made.

---

## Executive summary

The app is functionally broad and the foundations are mostly sound (SecureStore session handling, a real offline queue, Sentry, OTA updates, a proper theme module). The debt clusters into six systemic problems that account for the large majority of individual findings:

1. **`apiRequest()` never throws on HTTP errors** (`src/services/api.ts:36-61`) — it returns the raw `fetch` Response, and 25+ call sites never check `res.ok`. Any server rejection (validation, permissions, expired session) shows **success** to the user and the data is silently lost. This single flaw produces the worst user-facing bugs, including a receipt-capture flow that says "Receipt Submitted" for a rejected bill.
2. **Offline sync is broken end-to-end.** Offline-created site diary entries are stored locally but *never enqueued* — they sit on the device forever. The queue that does exist only drains while the Timesheets screen is open. Editing an offline entry while online creates a server duplicate. Failed photo/voice uploads silently persist device-local `file://` URIs to the server, corrupting entries for every other user.
3. **Session token leak (security).** The note editor attaches `X-Session-ID` to image requests for **any** `http` URL, so a note containing an externally-hosted image (easily created on web) exfiltrates the auth token to a third-party host.
4. **UTC/local date mixing.** At least six sites take the UTC date (`.toISOString()` / `.split('T')[0]`) for what should be a local (AEST, +10) calendar day — timesheets and diary entries can appear on the wrong day, and due dates can display a day early.
5. **Money/GST convention violations.** Receipt capture posts `tax: 0` on an inc-GST amount (violating the 10% GST rule); the timesheet edit path computes `total` as a dollars-decimal string where the convention is integer cents — a potential 100× mismatch.
6. **Polling everywhere, no lifecycle awareness.** Messages list polls 3 endpoints every 5s, threads every 3s, unread counts every 10s and 30s, and the Calendar refires nine API calls on every focus — none paused when the app is backgrounded. This is the app's main battery/data cost.

Cross-cutting quality issues: fetch errors rendered as empty states ("No projects found" when offline), hardcoded slate/Tailwind hexes bypassing `src/theme.ts` (including **menu labels that are near-invisible in light mode** in More menu), unvirtualized long lists, and heavy duplication (MoreScreen ≈ MorePanel, task/checklist/diary logic copy-pasted across screens with drift).

---

## Critical

| # | Location | Issue | Fix |
|---|---|---|---|
| C1 | `NoteEditorScreen.tsx:656-661` | `X-Session-ID` header sent with image requests to **any** external host — auth token exfiltration via notes containing external images | Only attach the header when `src.startsWith(API_BASE_URL)` |
| C2 | `ReceiptCaptureScreen.tsx:123-140` | Receipt submit never checks `res.ok`; server 400 → "Receipt Submitted" alert and the bill is lost in the field | Check `res.ok`, surface server error, keep form state |
| C3 | `SiteDiaryListScreen.tsx:937` | Offline-created diary entries are saved to AsyncStorage but never enqueued to the offline queue — they never sync, ever ("will sync when you have a connection" is false) | Call `addToQueue({type:'create-diary-entry',...})` on offline create; remove local copy on success |
| C4 | `src/services/api.ts:36-61` + 25+ call sites | `apiRequest` returns raw Response; non-2xx treated as success across Tasks, ProjectTasks, Checklists, Scope, Schedule, More, Notifications save paths | Make `apiRequest` (or a new `apiMutate`) throw on `!res.ok`; audit all callers |

## High

| # | Location | Issue | Fix |
|---|---|---|---|
| H1 | `SiteDiaryScreen.tsx:706-712`, `SiteDiaryListScreen.tsx:983-988` | Editing an offline-created entry while online POSTs a new server entry but keeps the local one → permanent duplicate + phantom "pending sync" | Remove from `offlineEntries` after successful POST of an `_offline_` entry |
| H2 | `SiteDiaryScreen.tsx:463,685`, `SiteDiaryListScreen.tsx:725-740,957-968`, `offlineQueue.ts:116,127` | Failed uploads push the local `file://` URI into the server payload — entry corrupted for all other devices, no user feedback | Fail the save / mark for retry instead of substituting the local URI |
| H3 | `offlineQueue.ts:135-140` + `SiteDiaryScreen.tsx:646-656` | Offline **edit** of a diary entry PATCHes raw local photo URIs (no upload pass, unlike create) and drops voice notes | Reuse the create-path upload loop for `edit-diary-entry`; include `_voiceNotes` |
| H4 | `TimesheetsScreen.tsx:769` (only caller of `syncQueue`) | Offline queue drains only while Timesheets screen is open — diary/checklist actions queued elsewhere wait indefinitely | Move sync to an app-level NetInfo listener + AppState foreground trigger |
| H5 | `NoteEditorScreen.tsx:344-355,397-403` | Unmount cleanup clears the 1.5s autosave debounce without flushing — leaving quickly silently drops the edit | Flush pending save on unmount/`beforeRemove` |
| H6 | `CalendarScreen.tsx:569-580,586` | Stale-closure on `selectedViewId`: every focus re-applies the default view, clobbering the user's chosen view/filters | One-time init guard or ref-based read |
| H7 | `ScheduleScreen.tsx:457` | Linked tasks fetched via `/api/projects/${item.scheduleId}/tasks` (schedule id where project id expected) — never loads | Pass `selectedProjectId` |
| H8 | `ScheduleScreen.tsx:929-1090` | Gantt renders per-day grid lines *per row* (~7,200 Views for 40 items × 180 days) — jank/OOM on device | Draw grid columns once, absolutely positioned; window rows |
| H9 | `CalendarScreen.tsx:485,504`; `TasksScreen.tsx:267,391`; `ProjectTasksScreen.tsx:878,1079`; `SiteDiaryListScreen.tsx:126-128,518-521`; `ProjectDetailScreen.tsx:230-247` | UTC date taken for local calendar day (AEST +10) — events/entries on wrong day, due dates a day early | One shared local-date helper (`toLocalDateStr` etc.), use everywhere |
| H10 | `TasksScreen.tsx:392/404`, `ProjectTasksScreen.tsx:304/321`, NoteEditor parse | Mobile edits strip HTML and PATCH plain text back — destroys rich text authored on web | Only send `content` if edited; longer-term, rich-text-safe editing |
| H11 | `TimesheetsScreen.tsx:983-1009` | Edit deletes all cost-code splits then creates one (data loss on multi-split, no rollback on partial failure); `total` sent as dollars-decimal string vs cents convention — possible 100× mismatch | Verify server units; compute cents with `Math.round`; replace splits server-side |
| H12 | `ReceiptCaptureScreen.tsx:122-135` | Posts `subtotal: totalCents, tax: 0` for an inc-GST amount — bills carry $0 GST | `subtotal = Math.round(total/1.1); tax = total - subtotal` |
| H13 | `BusinessDashboardScreen.tsx:85-94` | "Hours (Week)" sums **all** timesheets (`weekStart` computed but unused); "Active Timers" counts completed entries | Filter by week / `clockInTime && !clockOutTime` |
| H14 | `MoreScreen.tsx:267-292`, `MorePanel.tsx:352-382` | Hardcoded dark-slate hexes (`#e2e8f0` labels on white) — menu labels near-invisible in light mode | Use theme tokens |
| H15 | `src/services/api.ts` + `AuthContext` | No global 401 handling and no request timeouts — expired sessions fail screen-by-screen with generic errors; hung requests spin forever | On 401: clear session + return to login; add `AbortController` timeout |

## Medium (grouped)

**Silent failures / error-as-empty-state**
- `NotesListScreen:217`, `ProjectsScreen:105`, `NotificationsScreen:86`, `MessagesScreen:117`, `BusinessDashboardScreen:59` — fetch failures render "No X yet" empties. Add a shared error+retry state (ClientDetailScreen already has the right pattern).
- `MessageThreadScreen:162-180` — failed send silently restores old draft (can overwrite newer typing), no alert.
- `NotificationsScreen:133-143` — mark-all-read optimistic with silent catch.
- `NoteEditorScreen:437,459` — autosave failure resets to 'idle' with no signal.
- All screens: fetch errors are console-only; none report to Sentry despite it being wired up.

**Wrong data displayed**
- `SiteDiaryScreen:1283-1288`, `SiteDiaryListScreen:1911-1915` — detail modal renders fields from the *default* template, not the entry's template.
- `SiteDiaryScreen:692-694` — removing the last voice note doesn't persist.
- `ProjectTasksScreen:253-269` — tasks with unknown statuses invisible when "hide done" (default on).
- `ScheduleScreen:1340-1543` — edit sheet uses hardcoded 5-status list while cards use server statuses; custom statuses unselectable.
- `TasksScreen:423-431` — toggle-done hardcodes `'done'`/`'todo'` ignoring company status options; ProjectTasks' `doneStatus = last option` heuristic equally fragile.
- `ChecklistsScreen:171,264` — items sorted alphabetically, ignoring the authored `order` field.
- `ScopeScreen:244-282` — stage counts computed from different filtered lists; can show "3/2".
- `ScheduleScreen:625-626` — new-item duration in calendar days, ignoring `include_saturday`/`include_sunday` working-day rules.
- Dashboard vs Timesheets: clock-in state diverges (Dashboard only fetches on mount) and cost-code requirement disagrees.

**Refetch/poll storms & performance**
- `MessagesScreen:105-132` (3 endpoints / 5s incl. static assignable-users), `MessageThreadScreen:154` (full list / 3s), `AppNavigator:169-224` (10s + 30s unread polls) — no AppState pause, no in-flight guard.
- `CalendarScreen:376-398` — nine API calls per focus incl. entire company diary history; `:598` minute-tick re-renders whole screen in all views; `:1103+` week view mounts 120 day columns.
- `SiteDiaryListScreen:372-384` — full refetch + spinner on every focus and day swipe; `:523-561` unmemoized deep search per keystroke.
- `ChecklistsScreen:152-156`, `ScheduleScreen:342-402` — double/triple fetches from overlapping effects.
- Unvirtualized `.map` lists: `TasksScreen:606-685`, `ProjectTasksScreen:577-648`, `ChecklistsScreen:682-699`, `MessagesScreen:340-374` (list inside `ListHeaderComponent`, `data={[]}`).

**Input/validation**
- `ReceiptCaptureScreen:100` — accepts negatives; `parseFloat("12,50")` → 12 on comma-decimal keyboards.
- `TasksScreen:406,883` — free-text date input (`new Date('garbage')`) while ProjectTasks has a proper date picker.
- `SiteDiaryListScreen:884-999` — required template fields not validated.
- `CustomizeHomeScreen:102-145` — unserialized fire-and-forget preference saves can persist stale layout (SettingsScreen's `saveChain` pattern solves this).

**Resource leaks / lifecycle**
- `SiteDiaryScreen` & `SiteDiaryListScreen` — no unmount cleanup for recording/sound/interval refs; navigating away mid-recording leaks the session, mid-playback keeps playing.
- `CalendarScreen:272` — module-level `defaultViewCreated`/`cleanupRan` survive logout across account switches.
- `TasksScreen:259-272` — deep-link modal reopens after every refetch.
- `ReceiptCaptureScreen:57-80,148` — unhandled `launchCameraAsync` rejection from effect; `StyleSheet.create` in render body.
- `offlineQueue.ts:167-197` — no concurrency lock on `syncQueue` (double-drain risk → duplicate clock-ins); 4xx retried like network errors; failed actions auto-discarded after one alert (`TimesheetsScreen:773`).

## Low (condensed)

- "2 entryies pending sync" pluralization (`SiteDiaryScreen:993`); voice notes counted as photos (`countPhotos`, both diary screens); `maxPhotos` read from wrong template after switching; in-render `fields.sort()` mutating state (3 sites).
- Login: missing `textContentType`/`autoComplete` (no password-manager autofill); OAuth `sessionId` in URL param — never log the redirect URL; silent no-op branch on success-without-session.
- Theming drift: Tailwind/slate hexes across TasksScreen, ProjectDetail, SiteDiaryList, Schedule, Timesheets, Projects, TaskComments; own-message bubble ~2:1 contrast in dark mode (`MessageThreadScreen:240`); hardcoded `paddingTop: 56` instead of `useSafeAreaInsets()` on 6 screens.
- Dead/diverged code: MoreScreen note modal unreachable, `messages` coming-soon in MoreScreen but live in MorePanel; Dashboard `upcomingSchedule`/`categoryTiles` computed but unrendered; unused helpers in Schedule.
- `Dimensions.get` at module load (wrong after rotation); numbered lists share one counter across a note; timesheet grid hides entries outside 05:00–22:00 while still counting them; activity feed marks all "seen" before loading; checklist notes read-modify-write JSON string (concurrent writers lose notes); `p.color` used but absent from the `Project` type; diary `Image` requests carry no auth header (verify serve endpoint works without one) and NoteEditor bakes absolute hosts into stored HTML.
- `AppNavigator:299` — `isLoading` renders `null` (white flash at launch); duplicate route name "Schedule"/"Checklists" in two stacks; Calendar tab has no stack wrapper (inconsistent headers/navigation).

---

## Improvements (beyond bug fixes)

1. **Harden the API layer once** — `apiMutate<T>` that throws on `!res.ok` with the server message, request timeouts, global 401 → logout, and a `getAuthedImageSource()` helper. Structurally eliminates the two biggest bug classes (C1, C2, C4, H15 and ~10 medium findings).
2. **App-level offline sync service** — NetInfo + AppState listeners driving `syncQueue()` and the diary offline store; idempotency keys on queued actions; distinguish 4xx (drop + surface) from network failures (retry); a small global "pending sync" indicator.
3. **Shared date module** (`src/lib/dates.ts`): `toLocalDateStr`, `fromLocalDateStr`, `isOverdue`, `relativeDay` — fixes the whole UTC/local class and the four duplicated relative-time formatters.
4. **`useApiList(path)` hook** returning `{data, loading, error, refresh}` with cached-first render — uniform loading/error/empty states, removes ~40 lines per screen, fixes error-as-empty-state everywhere.
5. **Poll hygiene**: one shared polling hook with AppState pause, in-flight guard, and backoff; incremental message fetch (`?after=`); date-ranged diary/timesheet endpoints (the app currently pulls entire company history).
6. **Component extraction** (biggest maintainability wins): merge MoreScreen+MorePanel; shared `TaskDetailSheet`, `ChecklistInstanceCard`, bottom-sheet picker, month-grid builder, `useVoiceRecorder`; split the four 2,000+-line screens (SiteDiaryList, Calendar, Dashboard, Schedule) into feature components.
7. **Theme compliance pass** — replace remaining raw hexes with `theme.*` tokens (same exercise as the web audit); add `useSafeAreaInsets()` to the 6 hardcoded headers; memoize the per-screen `colors` remap or drop it.
8. **Report failures to Sentry** — the SDK is integrated but every catch swallows; add breadcrumbs + capture in the shared API layer.
9. **UX polish**: unsaved-changes guards (diary form, task edit, note flush); confirm on note delete; password-manager autofill on login; splash instead of white flash; error retry states.
10. **Verify server-side authorization** for role-gated financials (`ProjectDetailScreen:96` hides UI client-side) and the uploads serve endpoint.

## Suggested fix order

1. **Day 1 — the API layer** (C4 + C2 + H15): throw on `!res.ok`, timeouts, 401 handling. Highest bug-per-line-changed ratio in the codebase.
2. **Security patch** (C1): one-line condition on the image auth header.
3. **Offline integrity** (C3, H1-H4): enqueue diary creates, app-level sync, stop persisting `file://` URIs, dedupe offline edits.
4. **Date + money correctness** (H9, H11, H12): shared date helper; fix GST and timesheet totals.
5. **Quick visible wins** (H13, H14, H6, H7): business dashboard numbers, More-menu contrast, calendar view reset, linked tasks.
6. Then work down the medium list, folding fixes into the shared-infrastructure improvements (1-5 above) rather than patching sites one by one.
