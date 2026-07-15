# Morada Mobile — Structure Assessment & Top-Tier UX Roadmap

**Date:** 15 July 2026
**Benchmark:** ClickUp Mobile, Notion Mobile
**Context:** follows MOBILE_APP_AUDIT.md (bugs fixed) and the plum rebrand. This is about structure and feel, not correctness.

---

## Part 1 — Where the app is at

### What's already strong
- **Functional breadth**: 23 screens covering diary, schedule, tasks, timesheets, messaging, notes, checklists, receipts — most competitors' mobile apps do less.
- **Correctness/stability**: post-audit, server errors surface properly, offline sync works, sessions are handled, money/dates are right.
- **Theme system**: one token file, light/dark parity, now on-brand (plum). Screens consume tokens.
- **Foundations**: SecureStore auth, offline queue with app-level sync, Sentry, OTA updates, push routing.

### The structural reality (hard numbers)

| Signal | Value | Top-tier expectation |
|---|---|---|
| Shared UI components | **3** (vs 23 screens, ~27k lines) | 30–60 primitives; screens are thin compositions |
| Largest screens | 3,023 / 2,664 / 2,360 / 2,214 / 2,088 lines | 200–400 lines; features split into components |
| `Alert.alert` calls | **144** (errors, confirms, success, pickers) | Native alerts only for destructive confirms; toasts/undo for the rest |
| Hand-rolled `<Modal>`s | **40** | Bottom sheets with gestures (one shared component) |
| Skeleton loaders | **0** (25 screens use bare spinners) | Skeletons/cached-first rendering everywhere |
| Animation library | **none** (no Reanimated, 5 files use basic `Animated`) | Reanimated springs on every interaction |
| Gesture library | **none** (1 swipe reference) | Swipe actions, drag-reorder, sheet gestures throughout |
| Haptics | **0** | Haptic feedback on completion, selection, errors |
| Global search | **none** (per-screen only) | Universal search is a core surface |
| Global quick-add | partial (More panel) | A "+" reachable from anywhere, capture in <2 taps |
| Toast/undo system | **none** | Undo-instead-of-confirm for most actions |

**The one-line diagnosis:** the app is a broad, now-correct *forms-and-lists* app built entirely from React Native primitives. ClickUp and Notion feel different not because of features but because of an **interaction layer** (physics, gestures, haptics, sheets) and a **component system** (one way to render a row, a sheet, an empty state) that this app doesn't have yet.

### Why it feels the way it does — the five gaps

1. **Interaction physics.** Every transition is a hard cut; modals pop instead of sliding; nothing responds to drag. Notion's polish is mostly springs + gestures on ordinary lists.
2. **Blocking feedback.** 144 system alerts means the OS interrupts the user constantly — errors, successes, and confirmations all feel like errors. Top-tier apps almost never show a system alert.
3. **Loading states.** Full-screen spinners on 25 screens. ClickUp shows cached content instantly and refreshes silently; first-ever loads get skeletons that match the layout.
4. **No universal surfaces.** No global search, no omnipresent quick-add, no long-press context menus. Every job requires navigating to the right screen first.
5. **Screen monoliths.** 2–3k-line screens mean every new pattern gets re-implemented slightly differently (the audit found 4 time-formatters, 3 month-grids, 2 More menus). Drift is structural, not a discipline problem.

---

## Part 2 — The roadmap

All libraries below are bundled in Expo Go SDK 54 — nothing here requires a native build.

### Phase 1 — Interaction foundation + design kit (the multiplier)

**Add the missing layer** (one-time setup):
- `react-native-reanimated` + `react-native-gesture-handler` — springs and gestures
- `@gorhom/bottom-sheet` — replaces the 40 hand-rolled modals
- `expo-haptics` — selection/success/warning feedback
- `@shopify/flash-list` — fast lists for the big screens

**Build `src/components/ui/` (~15 primitives), each replacing a repeated hand-rolled pattern:**

| Component | Replaces |
|---|---|
| `Sheet` (gesture bottom sheet: detail / form / picker variants) | 40 modals |
| `Toast` + `useUndo` (undo pill like Notion's) | ~100 of the 144 alerts |
| `ListRow` (icon/avatar + title + meta + trailing, swipe actions) | every screen's bespoke rows |
| `Skeleton` (layout-matched shimmer) + cached-first screen pattern | 25 spinner screens |
| `EmptyState` / `ErrorState` (illustration, message, action) | ~20 hand-rolled empties |
| `StatusPill`, `Avatar`, `SectionHeader`, `FAB`, `Chip`, `SearchBar`, `Button`, `Input`, `DateField` | per-screen drift |

**Feel rules to adopt app-wide:** system `Alert` only for irreversible destructive confirms; everything else is a toast (with Undo where possible). Every tap acknowledges in <100ms (optimistic UI + haptic). Never show a full-screen spinner when cached data exists.

*This phase is the multiplier — everything after it gets faster and more consistent.*

### Phase 2 — Decompose the monoliths

Split the five 2k+ line screens into feature components built on the kit (SiteDiaryList 3,023 → ~6 components; Calendar 2,664 → view components already identified in the audit; Dashboard, Schedule, Timesheets similarly). Merge MoreScreen/MorePanel. Target: no screen file over ~500 lines. This is where the remaining audit "improvement" items (shared month-grid, voice-recorder hook, picker sheet) land naturally.

### Phase 3 — Universal surfaces (the ClickUp/Notion signature moves)

1. **Global quick-add**: a FAB/center-tab "+" from anywhere → bottom sheet with Task / Diary entry / Photo / Note / Timesheet — pre-filled with current project context. Field workers capture in two taps.
2. **Global search** (⌘K equivalent): one search screen over projects, tasks, diary, notes, messages with recents and type-filters. Needs one server endpoint (`/api/search?q=`) — the highest-value backend addition on this list.
3. **Long-press context menus** on every row (complete / assign / reschedule / delete) via the sheet.
4. **Swipe actions**: complete/delete on tasks, checklist items, notifications.
5. **Drag interactions**: drag-to-reschedule in Calendar week view and Gantt bars; drag-reorder in CustomizeHome (the copy already promises it).

### Phase 4 — Depth & delight

- Screen transitions and shared-element feel (native-stack options + Reanimated layout animations).
- Onboarding: 3-screen intro + progressive empty states that teach ("Create your first project →").
- Notification grouping + in-app notification center polish.
- Rich-text fidelity in the note editor (render bold/italic/links read-only first; edit later).
- App icon/splash refresh on the plum brand; App Store screenshots.
- (Native-build only, later: home-screen widgets, Live Activity for running timers — the single most "pro" feature for a field app.)

### Sequencing note

Phases 1→2 are internal quality (users feel speed and consistency); Phase 3 is where users *say* "this feels like ClickUp"; Phase 4 is finish. Phases 1 and 3.1/3.4 (quick-add, swipes) can ship inside two focused work sessions each; Phase 2 is the long tail and can proceed screen-by-screen behind everything else.

---

## Workspace (Dashboard) redesign — agreed plan (15 Jul 2026)

Decisions from Jed on the five critique points: header rework yes; project colours stay custom but the **web** colour picker gets constrained to a curated Morada palette; tasks become one grouped card; the floating Clock In bar is **removed**, replaced by a live clocked-in card that only appears while a timer runs; unified card system yes.

**A. Mobile — DashboardScreen rebuild (visual template for all screens)**
1. **Header**: muted "Tuesday 15 July · Good afternoon" over large ink "Jed"; bell + avatar right; remove the invisible white wordmark; greeting condenses on scroll.
2. **Live timer card** (replaces the floating bar): rendered only while clocked in — plum card, pulsing dot, count-up elapsed time, project + cost code, tap → clock-out confirm sheet. Not clocked in → card absent entirely (clock-in lives in Timesheets). Remove floating bar and its content overlap.
3. **Project cards**: card background = 12% tint of the project colour, colour dot + initials, name in ink, phase as chip, fixed width, snap paging, "All projects →" end card. Off-palette legacy colours are softened by the tint treatment automatically.
4. **Today's Tasks**: one grouped card with hairline dividers; circular checkboxes (spring + haptic); project dot per row; completed rows collapse under a "Completed (n)" toggle; progress ring beside the section title replaces "5/5".
5. **Unified card anatomy + polish**: one radius/border/shadow spec, section headers with count + chevron action, meta text wraps instead of truncating, 4pt spacing grid, skeleton first-load, staggered section entrance, press-scale on cards.

**B. Web — curated project-colour palette**
Constrain the project colour picker (create/edit project) to ~10 Morada-harmonised hues (teal, sage, amber, coral, rose, lavender, plum, slate-blue, terracotta, sand) by swapping the picker's source list; existing project colours are left untouched in data — the mobile tint treatment renders them gracefully either way.

## Messages upgrade (16 Jul 2026)

The backend is already a full chat platform (reactions, threads, edits, deletes, attachments, pins, scheduling, mentions, typing, presence, read receipts, Socket.IO) that powers the web app; mobile used only list-channels / fetch-100 / post-plain-text / poll. Nearly every gap was integration, not new features.

- **Phase 1 (done)** — Socket.IO real-time (server: `io.engine.use(mobileSessionMiddleware)` so the socket handshake accepts mobile's X-Session-ID; web cookie path untouched), optimistic send with pending/failed/tap-to-retry, kit parity (Sheet/Toast/Skeleton/PressableScale/haptics). Polling demoted to a 60s fallback while connected.
- **Phase 2 (done)** — mention chips + @-autocomplete (display↔markup round-trip), long-press sheet (copy/react/edit/delete), live reactions (bulk endpoint returns a **map keyed by messageId**, not an array), photo attachments (`pendingAttachmentPaths` takes **objects** `{objectPath, fileName, …}`, not strings).
- **Phase 3 (in progress)** — inverted list + scroll-up history pagination via the `before` param, typing indicators, and investigation-gated read receipts / presence dots / pinned-channel sorting (the live `socketManager.ts` may not emit `messages_read` or presence events — only the dead `server/messaging/socket.ts` does; skip rather than force).
- **Client-facing channels (queued)** — `channels.isClientFacing` exists and web uses it (eye icon, Client badge, create toggle); mobile ignores it, so a supervisor on site cannot tell whether the client can read the channel they're typing in. Wire it up: amber-tinted eye avatar + CLIENT pill in the list, a persistent header badge while composing, and the create toggle. Amber over red — red means error/over-budget in this palette; amber means caution.

## Suggested definition of "top-tier" (acceptance checklist)

- [ ] Zero system alerts outside destructive confirms
- [ ] Every screen renders cached content instantly; skeletons only on first-ever load
- [ ] All modals are gesture-dismissable bottom sheets
- [ ] Every mutation is optimistic with undo (no "Are you sure?" for reversible things)
- [ ] Global "+" and global search reachable from every tab
- [ ] Long-press menus + swipe actions on all primary rows
- [ ] Haptics on complete/select/error
- [ ] No screen file > 500 lines; new screens composed from `ui/` primitives
- [ ] 60fps on iPhone 12-class hardware in lists of 500+ items
