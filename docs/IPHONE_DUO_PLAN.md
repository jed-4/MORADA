# iPhone Duo — big-screen site app (exploration)

Status: exploration only, nothing built. Branch `feat/iphone-duo`, based on main @ 6b1b0327.

## Ground rules (from Jed, 2026-11-16)

- **Site version.** Only what the app already does — a bigger, better way to *view* it.
- **No take-offs.** Out of scope.
- Outer screen (folded) stays exactly as today. Everything here is for the unfolded inner screen.

## How the device works (unverified — secondary sources, check developer.apple.com)

- Outer ~5.4", inner ~7.6", same aspect ratio. Outer = compact width (phone), inner = regular width (small-iPad-like).
- The app's size changes *while running* (fold/unfold). Layouts must re-read size, not snapshot it.
- Apps built on older SDKs run letterboxed at phone size on the inner screen. Filling it needs Xcode 27.1 → an Expo SDK built against iOS 27. **Unknown: which Expo SDK that is and whether it's out.** We're on Expo 54 / RN 0.81.5.
- Reserved regions: fold crease + camera. Keep tap targets out of them (safe-area insets should cover it once on the new SDK).

## Step 0 — foundations (needed before any screen work)

1. **`useLayout()` hook** in `src/lib/` — one place that answers `isWide` (inner screen), `width`, `height`, from `useWindowDimensions()`. Breakpoint ≈ 600pt. Every screen below reads this; nobody hand-rolls widths.
2. **Kill the frozen-width snapshots.** These read the width ONCE at module load and will be wrong the moment you unfold:
   - `src/screens/ScheduleScreen.tsx:223` — `SCREEN_WIDTH` (today-scroll offset)
   - `src/screens/SiteDiaryListScreen.tsx:192` — `SCREEN_WIDTH` (day-swipe animation)
   - `src/components/calendar/MonthView.tsx:31` — cell width
   - `src/components/calendar/WeekView.tsx:30,33` — `GRID_COL_WIDTH` is an **exported constant**, so callers depend on it too
   - `src/screens/BusinessDashboardScreen.tsx:109` — tile size (inside render, but not reactive)
   - `src/screens/ProjectTasksScreen.tsx:506` — kanban column width (same)
   Safe to do now, on the current SDK — no visible change on a normal phone.
3. **Expo SDK upgrade** to whichever version targets iOS 27, + new App Store build. OTA can't deliver this. Separate PR, separate risk.
4. Decide `orientation: "portrait"` and `supportsTablet: false` in `app.config.js` — whether Apple treats the inner screen as iPad for these is unconfirmed.

## Screen-by-screen options (ranked by site value)

### 1. Projects → Project detail — **two panes** ⭐ do first
Today: `ProjectsList` → push `ProjectDetail` → push SiteDiary/Schedule/Checklists/Scope/Selections/Notes/Tasks/Receipts/Labour.
Wide: project list on the left (~320pt), project detail on the right. Tapping a section (Schedule, Diary…) replaces the right pane, list stays put. Switching job = one tap instead of back-back-tap.
This is the pattern every other screen reuses, so it earns the most.

### 2. Schedule — **more timeline, list beside Gantt**
Today: `list` / `gantt` toggle, fixed `DAY_WIDTH`.
Wide options:
- a. Gantt shows ~2.5× the days with the task-name column always visible (no toggle needed).
- b. Split: task list left, Gantt right, rows aligned; tap a task → detail as a side panel instead of a sheet.
Recommend (a) first; (b) is nicer but row alignment is real work in a 2.2k-line screen.

### 3. Calendar — **real week view**
Today: `WeekView` shows **3 days** (`GRID_COL_WIDTH = (W − labels) / 3`), month cells ≈ 46pt.
Wide: full 7-day week; month view with event titles in cells (not just dots); tapping an event opens a peek panel on the right instead of `EventPeekSheet` covering the grid.

### 4. Site diary — **list + entry side by side**
Today: day-by-day swipe list → push the entry.
Wide: day's entries left, selected entry (photos, weather, notes) right. Photos in a 3–4 column grid instead of a strip; tap → full-screen.

### 5. Selections (site spec view) — **spec sheet beside the list**
Today: list → push detail; spec PDFs open in `DocumentViewer` as a full-screen modal.
Wide: selection list left, detail + option images right; spec sheet opens in the right pane so you can flick between items while standing in the room.

### 6. Documents (`DocumentViewer`) — **bigger, no modal**
WebView already renders PDFs/images natively — on the inner screen it's simply a lot more readable. In two-pane layouts, open docs in the right pane rather than a full-screen modal. Little code.

### 7. Tasks / Project tasks — **kanban that fits**
Today: columns are 68–70% of the screen, so you see 1.4 columns and scroll sideways.
Wide: 3 columns visible, or list + detail panes.

### 8. Checklists / Prestarts — **list + checklist**
Checklist list left, the open checklist right. Prestart sign-off stays full-screen (it's a form flow — don't split it).

### 9. Dashboard / Business dashboard — **wider grid**
Widgets in 2 columns instead of 1; business dashboard tiles 6-across instead of 4.

### 10. Messages — **inbox + thread** (the standard iPad mail layout)

### Leave alone
Login, settings, receipt capture (camera), note editor (already full-screen writing), timesheets entry (already width-reactive; just lets the grid breathe).
Client mode screens: same patterns would apply later, but this is the *site* version — out of scope for now.

## Bottom sheets
10 files use `components/ui/Sheet`. On the inner screen a full-width bottom sheet looks stretched. Option: `Sheet` renders as a centred card (max ~520pt) when `isWide`. One change at the primitive, every sheet benefits — same principle as the web dialog-height rule (fix the primitive, never per call site).

## Suggested PR order
1. `useLayout()` + frozen-width fixes (ship on current SDK, no visible change).
2. `Sheet` caps its width when wide.
3. Expo SDK upgrade + fill the inner screen (letterbox → full) — new build.
4. Two-pane Projects (the shared `SplitView` component lands here).
5. Calendar 7-day week.
6. Schedule wider Gantt.
7. Diary, Selections, Tasks, Checklists, Messages on the same `SplitView`.

## Open questions
- Which Expo SDK supports iOS 27 / Xcode 27.1, and is it released?
- Does the inner screen honour `supportsTablet: false` / portrait lock, or does it rotate?
- Can we test without hardware? (Simulator for iPhone Duo in Xcode 27.1 — check.) Jed's own Duo is the real test device.
