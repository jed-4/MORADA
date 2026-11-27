# Build order

Jed reviews on his phone (and an unfolded Fold for phase 5). He doesn't use a terminal, so keep him out of command-line steps. When something needs a command (install, run, build), do it yourself, then tell him in plain words what to open and what to look at.

## Ground rules (apply to every phase)

1. **Stop after each screen.** When a screen is done, stop and post a short review note: what changed, which Figma frame and PNG to compare against, anything you weren't sure about, and how Jed can see it (e.g. "open Projects → 45 Pheasant Point → Scope"). Wait for his "approved" or his feedback before starting the next screen. Within a screen, do it in one pass. Don't stop for every component.
2. **Presentation only.** Keep existing data fetching, API calls, stores, navigation routes/params, permissions and business logic. Change the render layer. If a design needs data the app doesn't have (e.g. weather on diary rows, photo counts), render it only when present and list it in your review note. Don't invent endpoints.
3. **Reuse components.** Every screen is built from `COMPONENTS.md` parts. If you need a new pattern, make it a shared component, not a one-off.
4. **Never hardcode colours, font sizes, radii or spacing.** Import from the theme. A hex code in a screen file is a bug.
5. **Never hardcode Figma content.** All names, addresses, prices and counts in the PNGs are dummy data.
6. **Match the PNG.** Before calling a screen done, compare your screen side by side with `screens/<file>.png` at 390 dp wide (phone) or 1024 dp (Duo), and tick its "Done when" list in BUILD-SPEC.md.
7. **Small commits** per component / screen with clear messages, so any screen can be rolled back on its own.
8. **Don't touch** Variations or Documents beyond applying shared components (they aren't designed yet).

## Phase 0: Recon (no code changes)
- Read BUILD-SPEC.md, COMPONENTS.md, GOTCHAS.md, tokens/theme.ts.
- Map the repo: navigation, screen files for each screen in the spec, theme/styling system, icon set, font loading, image component(s).
- Post a short plan to Jed: which files map to which screens, what you'll replace, any risks. **Wait for a go-ahead.**

## Phase 1: Tokens + fonts
- Add `theme.ts` (merge into the existing theme if there is one; keep old export names working).
- Load Inter 400/500/600/700. Set the default text style to Inter 14 `text`.
- Set app background to `bg`.
- Investigate the **product image loading bug** now (see GOTCHAS #3) and report findings. Don't fix the styling yet.
- Stop → Jed review (expect small visual shifts app-wide).

## Phase 2: Shared components
Build in this order (each with a quick preview screen/story if the repo has one):
1. Card, Divider, ProjectSquare, StatusDot, ProgressLine, Checkbox, Avatar, UnreadBadge
2. PageHeader (+ variants), UnderlineTabs, Segmented, GroupHeader (+ collapsed row, section-card header)
3. ListRow, PropertyRow, FilterChips, CaptureChip/CreateChip, SectionTile
4. FAB, TabBar (phone), BottomSheet, BottomActionBar, EmptyState
5. SmartImage / Thumb with fallback
6. CalendarBlock, GanttBar, NowLine/TodayMarker/DayDivider, CommentComposer
- Swap the global tab bar to the new `TabBar`.
- Stop → Jed review of the tab bar + a components preview.

## Phase 3: Phone screens (one at a time, stop after each)
Order follows the most-used flows first:
1. P01 Workspace
2. P02 Projects
3. P03 Project detail
4. P07 Project tasks
5. P08 Schedule: List, then Gantt, then Calendar (one review for all three is fine)
6. P09 Scope
7. P10 Selections → P11 Selection detail
8. P12 Defects: List, Empty, Add
9. P13 Site diary list → P14 Entry
10. P15 Checklists → P16 Checklist detail
11. P17 Labour hours → P18 Labour code detail
12. P04 Messages
13. P05 Calendar (Week + List)
14. P06 More sheet

## Phase 4: Polish pass
- Check every screen against its "Done when" list; fix spacing drift.
- Tabular numbers everywhere numbers stack (GOTCHAS #1).
- Long-text and empty-data checks (very long project names, no photos, zero tasks).
- Android + iOS check (shadows, font weights, safe areas).
- Stop → Jed review.

## Phase 5: Duo / wide layouts
- Add a `useIsWide()` hook: `width >= 700 && width > height` (from `useWindowDimensions`, so it updates live on fold/unfold).
- Duo `TabBar` variant (centred icon + label, tint pill).
- `MasterDetail` layout + `ProjectRail`.
- Screens, stopping after each: D01 Workspace → D02 Project detail (rail) → D03 Tasks → D04 Schedule Gantt → D05 Selections → D06 Site diary → D07 Messages.
- Folding/unfolding must keep the current selection and scroll position where possible. On narrow screens, the same data shows as the phone push-navigation flow.
