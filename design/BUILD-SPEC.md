# Morada revamp: build spec

Figma file: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP (page **Revamp**)
Status: every screen in this document is **approved by Jed**. Superseded versions (v1/v2/v3 alternatives) are still in the Figma file. Ignore any frame not linked here.

Companion files:
- `tokens/theme.ts`: colours, type, radii, spacing, shadows (measured from Figma)
- `COMPONENTS.md`: shared components with specs. Build these before any screen.
- `BUILD-ORDER.md`: phases, plus the stop-for-review rule
- `GOTCHAS.md`: known traps (read before writing code)
- `screens/*.png`: 2× exports of every approved frame
- `reference/figma-layout-dump.txt`: machine dump of every approved frame (frame tree with size, auto-layout direction, gap, padding, radius, fill, stroke, font size/weight/colour, text). Search it by node id (e.g. `=== 44:136`) when you need an exact number this spec doesn't give.
- `reference/annotations.txt`: the designer's "what changed" notes from the Figma annotation frames

---

## 1. Overview

Morada is Lighthouse Projects & Construction's job-management app (projects, tasks, schedule, scope, selections, defects, site diary, checklists, labour hours, messages, calendar). This revamp is a **presentation-only** redesign: calmer, Notion-like, minimal. Data, navigation targets, API calls, permissions and business logic stay as they are.

Scope:
- **Phone (portrait, 390 dp reference width):** 18 screens / 27 frames (listed in §4).
- **Duo / unfolded / tablet landscape (1024 × 712 reference):** 7 screens. Two-pane layouts when width ≥ 700 dp and landscape (§5).

## 2. Tech assumptions

- Expo / React Native app (TypeScript). **First, look at the existing codebase.** Its navigation library, folder structure, state/data layer, styling approach (StyleSheet, styled-components, NativeWind, Tamagui, etc.) and icon set. Fit into them. Don't introduce a parallel structure.
- Put `tokens/theme.ts` where the repo keeps theme/constants (e.g. `src/theme/`). If a theme already exists, **replace its values** with these tokens and keep its export shape where you can, so existing imports keep working.
- Fonts: Inter 400/500/600/700 via `@expo-google-fonts/inter` (or the repo's existing font loader).
- Icons: Lucide (`lucide-react-native`) unless the repo already has a set. Mapping in COMPONENTS.md.
- Keep every existing data hook, query, mutation, navigation route and param. Only the render layer changes.
- All text in the Figma frames is **dummy data** (names, addresses, emails, prices, counts). Render real data from the app. Never hardcode Figma strings except fixed UI labels ("Show empty groups", "Collapse all", "Post to project chat", tab names, property labels).

## 3. Design principles (apply everywhere, including screens not designed yet)

1. **Notion-like minimal.** Off-white `bg #FBFAF8` canvas. Content sits in **white cards, 1 px `#EBE8E3` border, 12 radius, no shadow**. One bordered card per group, with items as rows separated by 1 px dividers. No card per item.
2. **One accent, used sparingly.** Purple `#7E6C98` only for: the active tab/underline, today markers, links (`#5F4E78`), checked boxes, progress fill, unread state, the FAB, primary buttons. Everything secondary is muted grey `#9B968F`.
3. **Sentence case. No caps labels.** "Site services", not "SITE SERVICES". No letter-spaced caps section labels. (Only exception: 3-letter weekday labels in the calendar/gantt day header, e.g. THU, which are approved as drawn.)
4. **Project colour = small solid square** (10–18 dp, 90% opacity) next to the project name. **No coloured left bars on cards or rows.** (Thin 3 dp strips appear only inside calendar/agenda/gantt blocks.)
5. **Status = small dot + muted word.** Never filled pills. (Green done/approved, purple in progress, grey upcoming/not selected, amber pending/open, blue sent to trade, red rejected.)
6. **Minimal headers.** Inner screens use one row: `‹ Title  ■ Project name  [quiet icons]`. Headers scroll away with content.
7. **Quiet view switches.** Inside a project: plain text tabs with a 2 dp purple underline on the active one. (Global Calendar tab keeps its small segmented control as approved.)
8. **Collapsible groups.** Sentence-case title + 12 dp chevron caret + muted count. Collapsed groups at the bottom become plain divider rows.
9. **Floating purple + button** (52 dp, bottom-right, 16 dp above the tab bar) replaces header "+" buttons and big centred CTAs on list screens.
10. **Calendar events = tinted blocks with a 3 dp left strip** in the project colour. Internal (non-project) events are grey `#F2F0EC` with a `#C9C4BC` strip. Short events (≤ 45 min) show the title only.
11. **Messages = Pinned group at top, then one "Recent" list, newest first.** No DM/channel/project grouping. Thread type shown by the lead: project square, muted "#", or initials circle.
12. **Over budget = one muted warm red `#C4574B`** (hours, bar, "+3h over"). Normal progress is purple. No green/blue remaining pills.
13. **Notion-style detail screens.** Title block, then a property list (muted label left, value right) in one card, then plain content blocks with small muted labels. Destructive actions live in the ••• menu.
14. **Images fail gracefully.** Missing or failed images show a soft grey tile with a small grey icon, never an empty coloured box.
15. **Numbers line up.** Tabular figures on prices, hours, counts, times.

---

## 4. Phone screens

Common to all phone frames unless noted: frame 390 × 844, status bar 50, content padding 16 left/right, phone `TabBar` 83 (Projects tab active for any in-project screen), `FAB` at x 322 y 693 (right 16, 16 above tab bar). Text colour `text #1F1D1B` unless noted; "muted" = `#9B968F`.

### P01 · Workspace (v4)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=29-276
- PNG: `screens/phone-01-workspace.png`
- Tab: Workspace active. No FAB (quick capture chips do this job).

Layout (Content: padding 8/16/24/16, gap 28):
1. **Greeting header** (358 × 54): date line "Saturday 21 November · Good afternoon" 13 Medium `mutedStrong`; name "Jed" `display` 30 Bold. Bell 22 at right.
2. **Quick capture** (gap 8): label row: "Quick capture" 13 SemiBold muted · spacer · project selector pill (radius 999, `pillFill`, padding 5/8/5/10, gap 5: Briefcase 13, "Project:" 12 `mutedStrong`, "Choose" 12 SemiBold `link`, ChevronDown 12). Then 4 `CaptureChip`s 85 × 40 (gap 6): Photo / Receipt / Defect (Hammer) / Clock in.
3. **Section cards** (`Card section`: radius 14, padding 14/14/6/16, gap 4). Each header: grey icon 16 · title 15 SemiBold · caret 12 · count 13 Medium muted · spacer · ChevronRight 16.
   - **Today** (CheckCircle): sub-labels "Tasks" and "Schedule · 1" 12 SemiBold muted (padding 6/0/2/0). Empty tasks: "Nothing due today" 14 `mutedStrong`. Schedule row (55 tall, padding 10/0, gap 12): 3 × 34 colour strip radius 2 (project colour) · title 15 Medium + project 13 `mutedStrong` · "Today" 13 Medium right.
   - **Projects 40** (Folder): max 5 rows (41 tall, padding 11, gap 10): `ProjectSquare 14` · name 15 Medium · Pin 12 if pinned · spacer · stage "Construction · Foundation" 13 `mutedStrong`. Then "+35 more ›" row 13 Medium muted (opens Projects tab). Pinned first, then most recent.
   - **Timesheets 7** (Clock): rows: 3 × 34 strip · project 15 Medium + "121 · Labour · Project management · Mon 16 Nov" 13 · hours "0.5h" 15 SemiBold right (tabular).
   - **Recent activity 10** (Activity): rows 41 (padding 9, gap 10): avatar 22 (circle, user colour, initials 9 Bold white) · text 14 · time "2d" 13 right.

Interactions: tap a section title to collapse/expand it (caret flips; collapsed = header only + count). The ChevronRight opens the full list (Projects tab, Calendar, Timesheets, Activity). Capture chips open the existing capture flows with the chosen project.

Done when:
- [ ] Four section cards, each collapsible, with the header pattern above
- [ ] Projects capped at 5 + "+N more", pinned first
- [ ] No "See all"/"Open calendar" text links
- [ ] Project picker pill works and feeds the capture chips
- [ ] Matches `phone-01-workspace.png` at 390 wide

### P02 · Projects (v4, colour square)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=29-136
- PNG: `screens/phone-02-projects.png`
- Tab: Projects active. No FAB (+ is in the title row).

Layout (padding 8/16/24/16, gap 24):
1. **RootTitle**: "Projects" 30 Bold · "40" 18 Regular muted · Search 22 + Plus 24 (gap 18).
2. **Groups** (gap 10 between header and cards): Pinned 2, Pre-construction 6, Construction 14, Post-construction 11 (collapsed by default). `GroupHeader` with padding-top 4 plus trailing ChevronRight 16.
3. **Project card** (`Card`, padding 12, gap 12, 63 tall; 76 with progress): `ProjectSquare 18` · column: row [Pin 12 if pinned · address 16 Bold · price "$486k" 15 Regular right] · client 13 muted. **Construction cards only** add a 3 dp progress line (10 below the text) in the project colour on `hairline` track. Cards stacked with 10 gap.
4. Post-construction collapsed: header only, with 1 px bottom divider.

Search open (from v3 annotation, not separately re-exported): tapping Search reveals a search field + `FilterChips` All / Mine / Construction / Post-con under the title.
Interactions: tap card → Project detail. Long-press → existing pin/unpin. Price uses short format ($486k, $1.19m), tabular.

Done when:
- [ ] Bordered white cards, no left bars, colour square only
- [ ] Only address bold; everything else regular; secondary text muted
- [ ] Progress line only on Construction cards
- [ ] Post-construction collapsed by default; groups toggle
- [ ] Search hidden until the icon is tapped

### P03 · Project detail (v3A, section row)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=33-136 · full scroll https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=33-454
- PNG: `screens/phone-03-project-detail.png`, `screens/phone-03-project-detail-full.png`

Layout:
1. **Nav bar** (34, padding 6/16/6/10): ChevronLeft 22 + "Projects" 15 `link` · spacer · More 22.
2. Content (padding 8/16/24/16, gap 14):
   - **Project header**: row (gap 10): `ProjectSquare 18` · name `title` 24 Bold · price 17 Regular right. Meta (padding-left 28, gap 10): "Client A · Construction · Frame" 14 muted; then 3 dp progress line (project colour on `hairline`).
   - **Section tiles row** (horizontal scroll, gap 8): 9 `SectionTile`s 76 × 64: Tasks 20, Schedule 2, Variations, Selections, Scope, Documents, Diary, Checklists, Defects (counts muted top-right). The last visible tile is cut off at the screen edge.
   - **Section cards** (`Card list`, padding 0/14/6/14) with `SectionCardHeader` (42, title 15 SemiBold + caret + muted count + ChevronRight 16), divider under the header:
     - **Overview** (open): `PropertyRow`s (36 tall, label 116 wide): Stage, Start, Est. completion, Supervisor, Client, Phone, Email (`link`), Address, Job number.
     - **Tasks 20** (open): "Nothing due today" 14 muted row, then upcoming rows: Circle 18 · title 14 · date 13 muted right.
     - **Schedule**, **Site diary** (open, same row pattern).
     - Collapsed cards (44 tall, header only): Variations, Selections, Scope, Documents, Checklists 4, Defects 5.
3. FAB (+) → opens a small sheet with Photo / Diary / Defect / Variation chips.

Done when:
- [ ] Single horizontally scrolling tile row under the header
- [ ] Overview is a Notion property list; stage is muted text, not a pill
- [ ] Every section card collapses; collapsed cards are 44 dp header-only
- [ ] FAB opens the capture sheet

### P04 · Messages (v3)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=35-136 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=35-314
- PNG: `screens/phone-04-messages.png`, `screens/phone-04-messages-full.png`
- Tab: Messages active. No FAB (compose icon in header).

Layout (padding 8/16/24/16, gap 22):
1. **RootTitle**: "Messages" 30 Bold · "4 unread" 14 muted · Search 22, SquarePen 22.
2. **Pinned** group: `GroupHeader` "Pinned 2 ›" then `Card list` of threads.
3. **Recent**: label "Recent" 13 muted (no caret, no count), then one `Card list` with **all other threads sorted by latest message, newest first**. Project threads, channels and DMs mixed.
4. **Thread row** (59–61 tall, padding 11, gap 12): lead 28 (project → `ProjectSquare 14`; channel → "#" 17 muted; person → initials circle 28 `avatarFill`, 11 `icon`) · column gap 2: [name 15 · time 12 muted right] / [preview 13 muted, 1 line · `UnreadBadge`].
   Unread: name SemiBold, time `accent`, badge `accent` with count.
   Time format: 2m, 14m, 1h, 3h, Yesterday, Thu, Mon, 12 Nov, 27 Oct, 17 Jul.

Done when:
- [ ] Only Pinned is grouped; everything else is one Recent list sorted newest first
- [ ] Unread shown only with purple time + badge + semibold name
- [ ] Lead marker reflects thread type
- [ ] Previews prefixed with sender ("Sam: …", "You: …")

### P05 · Calendar (v4): Week and List
- Figma Week: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=38-136 · List: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=38-325
- PNG: `screens/phone-05-calendar-week.png`, `screens/phone-05-calendar-list.png`
- Tab: Calendar active. FAB (+) → new event.

Week layout (Top: padding 6/12/0/12, gap 12):
1. **Header** (27): "November 2026" `heading` 22 Bold · ChevronLeft/Right 18 (gap 6) · spacer · "Today" 14 `accent` · Sliders 21 (gap 16).
2. **Segmented** List / Week / Month (178 × 32), Week active.
3. **Day header** (44): 44 gutter, 3 visible day columns (107 each): weekday 11 muted (THU) over date 15; today = 28 accent circle with white date, weekday `accent`.
4. **All-day row** (collapsed): "All day" 10 muted in the gutter, one line of `CalendarBlock` chips (21 tall), then "+3 more" + caret 12 to expand.
5. **Time grid**: 52 dp per hour, 6 AM–7 PM visible, hour labels 10 muted, lines 1 px `hairline`, column lines `hairline`. Today column wash `todayColumn`. Now line: 2 dp accent across today + 8 dp dot + "10:40" 10 accent in gutter; faint 1 dp accent across other days.
6. **Events** = `CalendarBlock` (radius 5, 3 dp strip, title 11 `textBody`, time 10 muted only if ≥ 49 dp tall). Project-linked → project tint/strip; internal (Sign on, Office stand-up, Financials review, Client weekly update) → `internalFill`/`internalStrip`.

List layout (padding 6/16/24/16, gap 16): same header + segmented (List active). Day groups: label 13 muted ("Today · Sat 21 Nov"), 8 gap, `Card list`; rows (67, padding 10, gap 12): time column 52 wide 13 muted ("All day", "8:00") · `CalendarBlock` list variant (tint = 16% over white, padding 6/8/6/9, title 15 `textBody`, sub 13 muted "8:00 – 9:00 · 26 Ocean St, Kiama"). A **Now** row in today's card: "10:40" 11 accent · 6 dot · 2 dp line.

Done when:
- [ ] One header row with month + arrows + Today + filter; view switch below
- [ ] Colour only for project-linked events; internal events grey
- [ ] Short events title-only; all-day collapses to one line + "+N more"
- [ ] Now line and today column match the PNG
- [ ] FAB replaces the header +

### P06 · More (v3, bottom sheet)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=39-136 (sheet node 39-325)
- PNG: `screens/phone-06-more.png`

Layout: dimmed screen behind (scrim `#1F1C1A` 38%). `BottomSheet` 689 tall from y 155 (padding 0/16/34/16, gap 14):
1. Grabber 36 × 5.
2. **Profile row** (55, bottom divider, gap 12): avatar 40 `tint` "J" 16 `link` · name 16 SemiBold + email 13 muted · ChevronRight 16.
3. **Create chips** (gap 8): New task (SquareCheck) · New note · Diary entry. Each `CreateChip` 114 × 34.
4. **Workspace card** (`Card list`): rows 45 (padding 12, gap 12): icon 20 `icon` · label 15 · count 13 muted · ChevronRight 16. Notes, Site diary, My tasks 20, Timesheets, Checklists, Schedule, Selections, My defects 5.
5. **Settings card**: Settings, Help & feedback, Sign out (label `muted`, LogOut icon).

Done when:
- [ ] Opens as a sheet over the current tab with scrim; swipe down / tap scrim closes
- [ ] No pastel tile grid; one plain list card + a settings card
- [ ] Create chips trigger the existing create flows

### P07 · Project tasks (v2)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=40-136
- PNG: `screens/phone-07-project-tasks.png`

Layout (padding 6/16/24/16, gap 20):
1. **TasksHeader** (48): back ChevronLeft 24 · column (gap 3): "Tasks" 24 Bold / [`ProjectSquare 12` + "45 Pheasant Point" 13 muted] · actions EyeOff (show/hide completed) + LayoutGrid (view) 20, gap 18.
2. **Groups** (Capture 3, Day, Week…): `GroupHeader` (no trailing chevron) + `Card list`.
3. **Task row** (padding 11, gap 12): Circle 20 (1 dp top offset) · column gap 2: title 15 (wraps to 2 lines) / meta 12 muted "Tue 24 Nov · SA" ("No due date · JS").
4. **Show empty groups** row: "Show empty groups" 13 muted · "Progress, Repeater" 13 `faint` · ChevronRight 14. Empty groups never render as headers.

Interactions: tap circle → complete (row fades to muted then leaves, or follows existing behaviour). Tap row → task detail (existing). EyeOff toggles completed tasks.
Done when:
- [ ] No tinted header bar, no coloured left bars, no caps group labels
- [ ] Empty groups folded into one "Show empty groups" line
- [ ] Long titles wrap to two lines

### P08 · Schedule: List (v4), Gantt (v3), Calendar (v3)
- Figma List: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=43-136 · Gantt: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=42-281 · Calendar: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=42-422
- PNG: `screens/phone-08-schedule-list.png`, `screens/phone-08-schedule-gantt.png`, `screens/phone-08-schedule-calendar.png`

Shared top (padding 4/16/24/16, gap 14 list / 12 others):
1. `PageHeader`: "Schedule" · ■ 45 Pheasant Point · Bell 20.
2. `UnderlineTabs`: List / Gantt / Calendar. On Gantt and Calendar the same row ends with `‹ Today ›` nav (no separate date row).

**List (v4)**:
- "8 earlier items done ›" 13 muted (expands older done items).
- **Day groups**: day label 13 muted ("Mon 16 Nov"), 6 gap, one `Card list` per day.
- **Item row** (55–56, padding 10, gap 12): column gap 2: title 15 / "16 – 17 Nov · Electrician D" 12 muted · `StatusDot` right (Done green, In progress purple, Upcoming grey). Done items: title muted.
- **Today marker** between past and upcoming days: "Today · Sat 21" 11 accent + 1 dp `accentLine`.
- The last card must clear the FAB.

**Gantt (v3)** (358 × 384 canvas, absolute layout):
- Item column 124 wide: names 12.5 `text`, sentence case. Row pitch 38, row lines 1 px `hairline`.
- Day columns 29.3 wide (7 days visible, Mon 16 – Mon 23): weekday letter 10 muted at y 4, date 12 at y 20; header rule 1 px `border` at y 40. "Nov" 13 in the corner above the item column.
- **Weekends** (Sat/Sun): `greyFill` columns through header and body.
- **Today**: 22 dp accent circle behind the date (white text, weekday accent), 2 dp `ganttToday` line down the body.
- Bars: `GanttBar` 22 tall, radius 4, trade tint + 3 dp strip (slate / blue / teal); date label 10 muted inside or after the bar. Off-range items: "25 ›" at the right edge.
- Horizontal swipe / ‹ › moves by a week; Today recentres.

**Calendar (v3)** (week, inside project):
- Day header 53 (bottom border): gutter 44 holds "Nov" 13; 3 day columns 105: weekday 10 muted, date 14 in 26 circle; today accent circle; weekend column `greyFill` (header + body).
- Time grid 50 dp per hour, same block/now-line rules as Calendar v4.

Done when:
- [ ] One header row, text tabs with purple underline, ‹ Today › in the tab row on Gantt/Calendar
- [ ] List: one card per day, status dots, today marker, earlier items collapsed
- [ ] Gantt: weekends grey, "Nov" in corner, today circle + line, tint+strip bars
- [ ] No second filled segmented control anywhere in Schedule

### P09 · Scope (v2)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=44-136 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=44-339
- PNG: `screens/phone-09-scope.png`, `screens/phone-09-scope-full.png`

Layout (padding 4/16/24/16, gap 14):
1. `PageHeader`: "Scope" · ■ project · Search + Sliders 20.
2. **Progress**: "4 of 18 done" … "22%" 13 muted, 6 gap, `ProgressLine`.
3. **Categories** (Site services 2/2, Demolition 0/3 …): `GroupHeader` + one `Card list`.
4. **Item** (padding 12, gap 8): row (gap 12): `Checkbox 18` (2 dp top offset) · column gap 3: title 15 / type: 6 dp dot (`type.scope` lilac or `type.material` salmon) + "Scope"/"Material" 12 muted · ChevronRight 16 (ChevronDown when expanded). Done items: title muted, checkbox filled.
5. **Expanded item**: "Scope lines" as a bulleted list, indented 30, gap 8: 4 dp `faint` bullet (centred on first line) + text `bodyRead` 14/21 `textLong`. Show the first **3–4 lines**, then "Show all · N more" 13 `accent`. Tap shows all.
6. **Collapsed categories** at the bottom as plain divider rows (Framing 2/4, Electrical, Plumbing…).

Done when:
- [ ] No caps, no category checkboxes, no coloured type pills
- [ ] One card per category, rows with dividers
- [ ] Expanded scope text is a readable bulleted list with Show all
- [ ] Progress line reflects real done/total

### P10 · Selections (v2)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=45-136 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=45-323
- PNG: `screens/phone-10-selections.png`, `screens/phone-10-selections-full.png`

Layout (padding 4/16/24/16, gap 14):
1. `PageHeader`: "Selections" · ■ project · Search 20 (tap → field + chips, like Projects).
2. **Progress**: "20 of 21 selected · 1 pending" + `ProgressLine`.
3. `UnderlineTabs`: By room / By category.
4. **Groups** (Ensuite 19/20 open; Kitchen 0/1, Laundry… collapsed rows at the bottom).
5. **Selection row** (69, padding 10, gap 12): `Thumb 48` (product image; **fallback tile** when missing/failed) · column gap 3: name 15 / "Basin wall mixer · ABI · 14275-LF" 12 muted (Category · Brand · Code) · right column (gap 5, right-aligned): qty "1 ea" 13 muted / `StatusDot` with 11 label (Approved green, Pending amber + `pendingText`, Not selected grey).

Done when:
- [ ] No search bar until tapped; tabs are underline style
- [ ] Rows in one card per room; status dots not pills
- [ ] Missing/failed images show the grey fallback tile (and the image bug is investigated, see GOTCHAS)

### P11 · Selection detail (v2)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=45-525 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=45-629
- PNG: `screens/phone-11-selection-detail.png`, `screens/phone-11-selection-detail-full.png`

Layout (padding 4/16/24/16, gap 14):
1. **DetailHeader**: ChevronLeft 22 · spacer · Share 20 · More 20.
2. **Image card** (`Card`, padding 18/0/12/0, centred): product image 190 × 190 (`contain`), carousel dots (6 dp, gap 6; active `accent`, others `grabber`). Swipe for more images. Fallback tile when no image.
3. **Title** (gap 4): name `detailTitle` 20 SemiBold (wraps) · "Ensuite · Basin wall mixer" 13 muted · status: dot + "Approved" 13 `text` + "· Sarah A, 12 Nov" 13 muted.
4. **Properties** `Card list` (rows 38, label 120): Brand, Product code (`link` + Copy 15 → copies to clipboard, toast), Quantity, Colour (12 dp swatch + name), Finish, Material, Price.
5. **Notes**: header "Notes" 15 + caret, then `Card padded` with text 14/21 `textLong`.
6. **Attachments 2**: card rows "Spec sheet – Elysian mixer.pdf" / "PDF · 1.2 MB" (opens file).
7. **Supplier**: property card (Supplier, Contact, Phone, Lead time).
8. **Activity 6**: collapsed header.
9. **BottomActionBar** (pinned above tab bar): secondary "Post to project chat" button.

Done when:
- [ ] No full-bleed lilac hero, no dark title band, no big filled purple button
- [ ] Product code copy works
- [ ] Sections collapse; Activity collapsed by default

### P12 · Defects (v2): List, Empty, Add
- Figma List: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=46-560 · Empty: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=46-394 · Add: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=46-452
- PNG: `screens/phone-12-defects-list.png`, `screens/phone-12-defects-empty.png`, `screens/phone-12-defects-add.png`
- FAB uses **Camera 22** (straight to capture).

**List** (padding 4/16/24/16, gap 14):
1. `PageHeader`: "Defects" · ■ project · Search + Sliders (Job stage, Mine, Overdue live behind Sliders).
2. `FilterChips` (scrolls): All 6 · Open 2 · Sent to trade 1 · Accepted 1 · Rejected 1 · Closed.
3. **Groups by location** (Ensuite 3, Kitchen, Living): `GroupHeader` + `Card list`.
4. **Defect row** (69, padding 10, gap 12): photo 48 radius 8 (fallback: grey tile + Camera icon) · column gap 4: [D-number 14 muted · title 15, full width, wraps] / meta (gap 4): `StatusDot` + word · "·" `faint` · trade · "·" · "Due 28 Nov" (overdue: "Overdue 18 Nov" in `danger`). Status colours: Open amber, Sent to trade blue, Accepted/Closed green, Rejected red dot + `danger` word.

**Empty**: header only (no chips/search when nothing to filter). `EmptyState`: CheckCheck icon, "No defects", "Walk the job and photograph anything that needs fixing…" FAB camera stays.

**Add** (full-screen modal, tab bar hidden; padding 4/16/24/16, gap 16):
1. **SheetHeader**: Cancel · "New defect" + ■ project · Done (accent).
2. Photo tiles (gap 10): two 174 × 84 tiles, radius 12, `surface`, 1 dp **dashed** `dashedBorder`, icon 22 `accent` + label 14: "Take photo" (Camera), "Library" (Image).
3. Captured photos row: 64 × 64 radius 10 thumbnails, gap 8 (tap to remove/preview).
4. Text fields (gap 8): title borderless `headingSemi` 22, placeholder "Defect title" `placeholderLarge`; notes 15, placeholder "Add notes (optional)".
5. Properties form card (rows 43): Location, Trade, Assignee, Due date, Priority → "Choose" muted + ChevronRight (open pickers).
6. **BottomActionBar**: "Done" plain + "Save & next →" (disabled `accentDisabled` until a title is entered).

Done when:
- [ ] Status in the meta line; title gets full width (no right status column)
- [ ] Chips only show statuses with counts; extra filters behind Sliders
- [ ] Empty state is calm, with no big centred pill button
- [ ] Add form saves with existing API; Save & next clears the form for the next defect

### P13 · Site diary list (v1)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=47-136 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=47-448
- PNG: `screens/phone-13-site-diary.png`, `screens/phone-13-site-diary-full.png`

Layout (padding 4/16/24/16, gap 14):
1. `PageHeader`: "Site diary" · ■ project · Search.
2. Count + filter row: "8 entries" 13 muted · "All types" 13 muted + ChevronDown 12 (template filter).
3. **Week groups**: header "This week" + caret · "16 – 22 Nov" muted · "4" muted. One `Card list` per week.
4. **Entry row** (padding 11, gap 4): [date "Fri 20 Nov" 15 · time "7:30 am" 13 muted · template "Daily log" 12 muted; non-daily types (Inspection, Delay) in `accent`] / preview of the first filled field (Work completed), 2 lines max, `bodyPreview` 14/20 `textPreview` / meta (gap 12, padding-top 2): Sun/Cloud/Rain 13 + "24°", Users 13 + "5", Camera 13 + "8", all 12 muted. Show only meta that exists.
5. FAB (+) → choose template → new entry.

Done when:
- [ ] Project name and "01. Daily Log – 13/11" never repeat in rows
- [ ] Grouped by week, newest first; template picker is the quiet filter + the FAB flow
- [ ] Preview clamps to 2 lines

### P14 · Site diary entry (v1)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=47-760 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=47-865
- PNG: `screens/phone-14-site-diary-entry.png`, `screens/phone-14-site-diary-entry-full.png`
- No FAB.

Layout (padding 4/16/24/16, gap 14):
1. **DetailHeader**: ChevronLeft 22 · More 22 (••• → Edit, Delete (`danger`)).
2. **Title**: date `title` 24 Bold "Fri 13 Nov" · "11:00 am · Daily log · ■ 45 Pheasant Point" 13 muted.
3. **Properties** `Card list` (label 104): Weather (Cloud 15 + "Overcast, 20°"), On site (Users 15 + names), Hours, Logged by.
4. **Content blocks** (gap 18): label 12 muted ("Work completed", "Issues / delays", "Deliveries", "Notes"), 5 gap, text `bodyLong` 15/22. Hide blocks with no content.
5. **Photos**: "Photos · 3" 12 muted/`faint`; strip of 80 × 80 radius 10 tiles, gap 8 (fallback tile for failed images), plus an add tile at the end. Tap → full-screen viewer.

Done when:
- [ ] Date is the title; template/project in the muted line
- [ ] Empty fields hidden; photo strip scrolls horizontally

### P15 · Checklists list (v1)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=48-136
- PNG: `screens/phone-15-checklists.png`

Layout (padding 4/16/24/16, gap 14):
1. `PageHeader`: "Checklists" · ■ project · Search.
2. **Active 4**: `GroupHeader` + `Card list`. Row (65, padding 12, gap 12): column gap 7: name 15 sentence case ("Contract to kick off · Rev 2") / ["28 of 58" 12 muted, 56 wide · `ProgressLine` flex, gap 10] · ChevronRight 16.
3. **Completed 2**, **Archived** as collapsed rows at the bottom.

Done when:
- [ ] No Active pills, no thick bars, no inline expansion. Tapping opens the detail screen

### P16 · Checklist detail (v1)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=48-244 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=48-382
- PNG: `screens/phone-16-checklist-detail.png`, `screens/phone-16-checklist-detail-full.png`

Layout (padding 4/16/24/16, gap 14):
1. **DetailHeader**: back + More.
2. **Title** (gap 6): name `heading` 22 Bold (wraps) · "3 of 71 · ■ 45 Pheasant Point" 13 muted · `ProgressLine` (4 top padding).
3. "Collapse all" 13 muted (toggles to "Expand all").
4. **Phase toggles**: "Phase 0 · Lock the job" 15 + caret · "Day 0–3" 13 muted · "3/12" 13 muted. Open phase → `Card list` of items. Phases 1–3 collapsed rows.
5. **Item row** (padding 11, gap 12): `Checkbox 18` (1 dp top) · column gap 3: text `checklistItem` 15/21 (wraps fully) / optional meta 12 muted "JS · 18 Nov" or "JS · Due 23 Nov". Checked: accent box + text `muted` + **strikethrough**.
6. No per-row ⋮. **Long-press or swipe** a row → Edit, Assign, Due date, Delete.

Done when:
- [ ] Phases sentence case with muted day range + count
- [ ] Checking an item animates fill + strikethrough and updates counts/progress
- [ ] Row actions via long-press/swipe only

### P17 · Labour hours (v1)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=49-136 · full https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=49-327
- PNG: `screens/phone-17-labour-hours.png`, `screens/phone-17-labour-hours-full.png`

Layout (padding 4/16/24/16, gap 14):
1. `PageHeader`: "Labour hours" · ■ project · Sliders 20 (filter).
2. **Summary** `Card padded` (12/14/14/14, gap 10): row (gap 6, baseline): "Used" 13 muted · "47h" `heading` 22 Bold · "of 214h" 14 muted · spacer · "167h left" 14 muted. Then `ProgressLine`. (Over total: bar + numbers `danger`.)
3. **Groups** Management "1.8 / 33h", On-site, Labourer: `GroupHeader` with muted used/budget.
4. **Code row** (padding 11/0/12/0, gap 8): row (gap 10): code "120" 13 muted (28 wide) · name 15 (no "Labour –" prefix) · hours right: used 14 `text` + "/ 15h" 14 muted (tabular). Below, indented 38: 3 dp `ProgressLine`.
   **Over budget**: used + budget in `danger`, bar full `danger`, plus "+3h over" 12 `danger` under it.
5. Tap row → Labour code detail. FAB (+) → log hours.

Done when:
- [ ] No caps, no green/blue pills; only purple progress + one red for over budget
- [ ] All hour figures use tabular numbers

### P18 · Labour code detail (v1)
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=49-518
- PNG: `screens/phone-18-labour-code-detail.png`

Layout (padding 4/16/24/16, gap 14):
1. DetailHeader (back + More).
2. Title: "Site establishment" 24 Bold · "124 · On-site labour · ■ 45 Pheasant Point" 13 muted.
3. Summary card (same as P17).
4. **By person**: label 12 muted; row of pills (radius 999, `surface` + border, padding 5/10/5/6, gap 6): avatar 20 `greyFill` initials 9 · name 13 · hours 13 muted.
5. **Logged hours** "4 entries": `Card list` rows (60, padding 11, gap 12): [name 15 · date 13 muted] / note 13 muted · hours 15 right (tabular).
6. FAB (+) → log hours for this code.

Done when:
- [ ] Person pills filter the entries list (tap to toggle) or are informational, matching existing behaviour

---

## 5. Duo / unfolded / tablet (wide) layouts

Breakpoint: **width ≥ 700 dp and width > height**. Reference canvas 1024 × 712: status bar 28, body 628, `TabBar` Duo 56. Everything below reuses the phone components. Only layout changes. Below the breakpoint, the phone screens are used unchanged.

Patterns:
- **Master-detail** (`MasterDetail`): Tasks, Selections, Site diary, Messages. List pane fixed width with 1 px right border; detail pane flex; both padding 12/24/16/24. Selected row gets `tint` (radius 8) inside a padding-4 card. On first open, select the first item (or show an empty "Select an item" state).
- **Project switcher rail** (`ProjectRail`) on Project detail.
- **Duo tab bar**: centred icon + label items; active = tint pill + accent.
- **FAB**: right 24, 20 above the tab bar (x 948, y 584 on the reference canvas).

### D01 · Duo Workspace
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=50-138 · PNG `screens/duo-01-workspace.png`
- Padding 10/28/0/28, gap 16. **Greeting** row: date line 13 muted + "Jed" `displayDuo` 28 Bold · bell 20 · avatar 32.
- **Columns** (gap 28): **Left 420**: "Quick capture" 13 muted + "Project: Choose ▾" (Choose `accent`); 4 capture tiles 99 × 76 (bordered cards, icon 20 + 12.5 label: Photo to diary, Receipt, Defect, Clock in); **Today** "3 events" → agenda `Card list` rows 54: time 58 wide 13 muted · 3 × 30 strip (project colour) · title 14 + project 12 muted; **My tasks** "4 due" → rows with Circle 18 · title 14 + "Today · 45 Pheasant Point" 12 muted. **Right 520**: header "Projects 40 · Search · All ›(accent)"; `Card list` rows 38: square 14 · name 14 · stage 13 muted · ChevronRight 14; then **Recent activity** rows (avatar · text · time).
- Tab Workspace active. FAB (+).
- Done when: two columns fill the width with no big empty area; uses phone row styles.

### D02 · Duo Project detail
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=50-334 · PNG `screens/duo-02-project-detail.png`
- **Rail** 88 (see `ProjectRail`): Menu icon, then projects (square 16, job number 11, short name 10); current = tint. Tap switches project in place.
- **Main** (padding 12/28/0/28, gap 16): header: "#6703" 13 muted over [square + name 24 Bold] · stage "Construction · Plaster" 13 muted · More 20. **Section tiles**: 9 × 80 × 66 in one row (Tasks, Schedule, Scope, Selections, Defects, Deliveries, Site diary, Checklists, Labour). **Columns** (gap 24): **Project info 516** (`GroupHeader` + property card: Client (tap → details), Address, Email (link), Phone, Job number) · **Tasks · today 340** ("20" muted, "All" accent; task rows) .
- Done when: rail switching works; no stacked coloured tiles; stage is muted text.

### D03 · Duo Tasks
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=51-136 · PNG `screens/duo-03-tasks.png`
- **List pane 400**: `PageHeader` "Tasks" + ■ project + actions; groups as phone P07 (cards padding 4, selected row tint).
- **Detail pane 624** (gap 14): header row "Capture · created by Jed Smith, 18 Nov" 13 muted · Edit 18 · More 20 (Delete task lives here, `danger`). Title `headingSemi` 22/29. Properties card (label 110): Status (dot + word), Priority, Assignee (avatar 20 + name), Due date (muted "No due date"), Project (square + name). "Activity 2" header; comments (avatar 28 · [name 13 + time muted] / text 14/20 `textBody`); `CommentComposer` "Add a comment…".
- Done when: no red outlined Delete button; comments post with existing API.

### D04 · Duo Schedule Gantt
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=51-326 · PNG `screens/duo-04-schedule-gantt.png`
- Main padding 12/24/16/24, gap 12: `PageHeader` (Bell, More) · `UnderlineTabs` with ‹ Today › · Gantt 976 × 440: item column 230 (13 Regular names, full text e.g. "Plumbing rough-in – return (mixers)"), 18 day columns × 41.4 (12–29 Nov), header 42, row pitch 36, weekends `greyFill`, today circle + 2 dp line, bars 22 tall with labels 10.5 muted. Leave/non-trade items use `trade.leave`.
- Done when: ~3 weeks visible; same visual rules as phone Gantt.

### D05 · Duo Selections
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=52-136 · PNG `screens/duo-05-selections.png`
- **List pane 420**: header, progress, underline tabs, room groups with phone rows (selected = tint).
- **Detail pane 604** (gap 16): header row: "Ensuite · Basin wall mixer" 13 muted · secondary button "Post to project chat" (30 tall, radius 8, padding 6/12) · Share 18 · More 20. **Top** (gap 20): image card 220 × 208 (carousel dots) + title column 316: name `headingSemi` 22/29, status line 14 (dot · Approved · "· Sarah A, 12 Nov" muted), notes 14/20 muted. **Props**: two property cards side by side (270 each, gap 16).
- Done when: no lilac hero / grey band; fallback tile shown when the image fails.

### D06 · Duo Site diary
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=52-370 · PNG `screens/duo-06-site-diary.png`
- **List pane 400**: header, "8 entries · All types ▾", week groups with phone rows (selected Fri 13 Nov = tint).
- **Entry pane 624** (gap 18): header: date 24 Bold + muted "11:00 am · Daily log · ■ 45 Pheasant Point" · Edit 18 · More 20. **Columns** (gap 20): Blocks 320 (content blocks as P14) · Side 236: property card (label 72) + "Photos · 3" grid of 72 × 72 tiles.
- Empty state (no entry selected): not drawn in Figma. If needed, use `EmptyState` with a BookOpen icon and "Select an entry" (it replaces the old book-icon placeholder).
- FAB (+).

### D07 · Duo Messages
- Figma: https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP?node-id=53-136 · PNG `screens/duo-07-messages.png`
- **List pane 380**: header "Messages" 20 Bold · Search 20 · Edit 19. "Pinned" (Pin 13 + label 13 muted) card; "Recent" label + card (newest first). Rows 53–54, padding 9/10, gap 12; selected = tint.
- **Conversation pane 644**: header 60 (padding 12/24, bottom border): channel icon 34 square radius 9 `greyFill` "#" · name 16 SemiBold + "7 members" 12 muted · Pin 18, Search 18, More 20. Thread (padding 16/24, gap 16): `DayDivider`s ("Thu 12 Nov", "Today"); messages: avatar 32 · [name 13 + time 12 muted] / body 14 `textBody`. Composer (padding 10/24/14/24): `ChatInput` with Paperclip, "Message Lighthouse team", Send.
- Tab Messages active. No FAB.
- Done when: Pinned then Recent rule holds; selecting a thread swaps the right pane without navigation.

---

## 6. Not designed yet

**Variations** and **Documents** have no approved design. When you touch them, apply §3 and the shared components: one-row `PageHeader`, groups + one card per group, status dots, property-list detail, FAB for create. Keep changes minimal, then stop and show Jed before going further.
