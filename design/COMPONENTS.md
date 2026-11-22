# Morada shared components

Build these first, in `src/components/ui/` (or wherever the repo keeps shared UI; follow the existing structure). Every value comes from `tokens/theme.ts`. No hex codes, font sizes or radii inline in screens.

Measurements are dp, taken from the approved Figma frames (390 × 844 phone, 1024 × 712 Duo). Each component lists where it is used so you can check it against the PNGs in `screens/`.

Icons: the Figma icons are **Lucide** paths (24 viewBox, round caps/joins). Use `lucide-react-native` (add it if the repo has no icon set; if the repo already uses one, map to the closest glyph). Stroke 1.6–1.8. Colours: `icon` in rows, `faint` for inactive tabs, `muted` for chevrons and carets, `accent` when active.

| Figma name | Lucide | Figma name | Lucide |
|---|---|---|---|
| chevL / chevR / chevD | ChevronLeft / ChevronRight / ChevronDown | plus | Plus |
| search | Search | sliders | SlidersHorizontal |
| bell | Bell | more | MoreHorizontal (•••) |
| house | House | briefcase | Briefcase |
| message | MessageSquare | calendar | Calendar |
| grid | LayoutGrid | camera | Camera |
| receipt | Receipt | hammer | Hammer |
| clock | Clock | circle | Circle (task checkbox) |
| check | Check | checkSquare | SquareCheck |
| checkCircle | CircleCheck | checkCheck | CheckCheck |
| pushpin | Pin | image | Image |
| users | Users | sun / cloud / rain | Sun / Cloud / CloudRain |
| share | Share | copy | Copy |
| edit / squarePen | SquarePen | send | Send |
| clip | Paperclip | menu | Menu |
| eyeOff | EyeOff | alert | TriangleAlert |
| truck | Truck | book | BookOpen |
| file | FileText | clipboard | ClipboardList |
| layers | Layers | folder | Folder |
| activity | Activity | settings | Settings |
| help | CircleHelp | logout | LogOut |
| palette | Palette | arrowR | ArrowRight |

> Caret: Inter has no usable ▸/▾ glyph. Carets after group titles are **ChevronDown / ChevronRight icons, 12dp, `muted`**. Never type a caret character.

---

## 1. `Screen`
- Background `colors.bg`. Safe-area aware (Figma status bar is 50dp; use the real inset).
- Phone content: horizontal padding 16, top padding 4 on inner screens (6–8 on tab roots), bottom padding 24 + room for the FAB (last card must clear the FAB: keep ≥ 84dp bottom padding when a FAB is shown).
- Scroll: one vertical ScrollView/FlatList. Headers scroll away with content (the "header folds away" behaviour); no sticky large headers.

## 2. `Card`
- `surface` fill, 1dp `border`, radius 12, **no shadow**.
- Variant `list`: padding 0 top/bottom, 14 left/right; children are `ListRow`s with a 1dp `border` divider between rows (not after the last).
- Variant `padded`: padding 12/14/14/14 (summary card) or 12/14 (notes card).
- Variant `section` (Workspace v4 only): radius 14, padding 14/14/6/16, gap 4.
- Duo list cards: padding 4 all round, rows are radius 8 so the selected row's `tint` sits inside the card.

## 3. `ProjectSquare`
- Solid square in the project's colour at 90% opacity. Sizes / radius: 10 r3 (one-row headers, meta lines), 12 r3 (Tasks header), 14 r4 (list rows, thread lead), 16 r4 (Duo rail), 18 r5 (project cards, project header).
- Replaces all coloured left bars. Never a circle, never a bar.

## 4. `PageHeader` (one-row, inner screens)
Height 28 (padding 2 top/bottom), horizontal row, gap 4:
`ChevronLeft 22 (text colour)` · title `type.pageTitle` (20 Bold) · project block (padding-left 8, gap 6: `ProjectSquare 10` + project name `type.meta`, `muted`) · flex spacer · action icons 20dp, gap 18, `icon` colour (search, sliders/filter, bell, share, more).
- Used on: Schedule, Scope, Selections, Defects, Site diary, Checklists, Labour hours.
- Variant **TasksHeader** (Project tasks): back 24, title `type.title` 24 Bold, project line underneath (square 12 + name 13 muted), actions eyeOff + grid 20.
- Variant **DetailHeader** (Selection detail, Diary entry, Checklist detail, Labour code): back chevron 22 on the left, right icons only (share 20, more 20, gap 18). The title sits below as its own block (see screens).
- Variant **RootTitle** (Projects, Messages): `type.display` 30 Bold + muted count (Projects "40" 18 Regular; Messages "4 unread" 14) + right actions 22dp, gap 18.
- Variant **SheetHeader** (Add defect): "Cancel" 15 muted left (70 wide), centre title 16 SemiBold + project line (square 10 + name 12 muted), "Done" 15 accent right. Height 44.

## 5. `UnderlineTabs` (view switch inside a project)
- Row, gap 20, bottom 1dp `border` rule across full width, height 27.
- Each tab: label `type.body` (14), `muted`; active label `accent`. Under each: 2dp underline radius 1, `accent` on the active tab only, 7dp below the label.
- Optional trailing **Nav** at the right end: `ChevronLeft 16` · "Today" 13 accent · `ChevronRight 16`, gap 14 (Schedule Gantt/Calendar).
- Used on: Schedule (List / Gantt / Calendar), Selections (By room / By category), Duo screens.

## 6. `Segmented` (Calendar tab only)
- Container 32 tall, radius 8, `avatarFill` background, padding 2, gap 2.
- Segment padding 5/12, radius 6, label 13 `muted`; active = `surface` + 1dp `border` + label `accent`.
- Only on the global Calendar tab (List / Week / Month). Project screens use `UnderlineTabs`.

## 7. `GroupHeader` (collapsible)
- Row, height 18, gap 8: Toggle (title `type.rowTitle` 15 Regular `text` + 12dp chevron, ChevronDown open / ChevronRight closed, gap 4) · muted meta(s) 13 (count "3", "19/20", "16 – 22 Nov", "Day 0–3", "1.8 / 33h") · optional trailing `ChevronRight 16` muted to open the full list.
- Tap the title row toggles. 8dp gap to the card below.
- **Collapsed group list**: when several groups are collapsed at the bottom of a screen, render them as plain rows (no card) of height 41 (padding 11), separated by 1dp `border` dividers: Framing 2/4, Electrical…, Kitchen 0/1, Completed 2, Archived…, Phase 1 · Pre-start  Day 4–14  0/18.
- **SectionCardHeader** (Workspace v4, Project detail cards): inside the card, height 42 (padding 12), title `type.sectionTitle` (15 SemiBold) + caret + muted count, trailing ChevronRight 16; a full-width divider below when open. Workspace v4 adds a 16dp grey line icon before the title.

## 8. `ListRow`
Horizontal, padding 10–12 vertical (11 typical), gap 12, divider 1dp `border` on top of every row except the first.
Slots: `lead` (checkbox / thumb 48 / avatar 28 / project square 14 / time column) · `body` (title `rowTitle` 15 + optional second line `caption` 12 `muted`, gap 2–3) · `trailing` (status, qty, hours, date 13 muted, chevron 16 muted).
- Titles wrap to 2 lines (`numberOfLines={2}`), never truncate to one line where Figma shows two (task titles, checklist items wrap fully).
- Done/complete rows: title colour `muted` (Schedule Done items, Scope done items) and strikethrough for checklist items.

## 9. `PropertyRow` (Notion-style property list inside a `Card list`)
- Height 36–38 (padding 9–10), gap 8–12. Label `type.body` 14 `muted`, fixed width 104–120 (116 Project detail, 120 Selection, 104 Diary, 110 Duo task). Value `type.body` 14 `text`, flexible.
- Value variants: link (`link` colour: email, product code + 15dp Copy icon), dot + word (status), avatar 20 + name, colour swatch 12 circle + name, project square 10 + name, icon 15 + text (weather, on site), muted placeholder ("No due date", "Choose").
- Form variant (Add defect): label 15 `text`, value "Choose" 15 `muted`, trailing ChevronRight 16, row 43 tall.

## 10. `StatusDot` + word
- 7dp circle + word `caption` 12 `muted` (11 in Selection rows), gap 5–6.
- Colours: `status.done` Done/Approved/Accepted/Closed · `status.inProgress` In progress · `status.upcoming` Upcoming/Not selected/Capture · `status.pending` Pending/Open (word "Pending" uses `status.pendingText`) · `status.sent` Sent to trade · `status.rejected` dot with word in `danger`.
- Never a filled pill.

## 11. `Checkbox`
- Soft square 18, radius 5. Unchecked: 1.5dp `placeholderLarge` (#C9C4BC) border, no fill. Checked: `accent` fill + white Check 12.
- Round task checkbox (Tasks, Workspace, Project detail): Lucide Circle 18–20, `faint`/`icon` stroke.
- Hit area ≥ 44dp.

## 12. `ProgressLine`
- 3dp tall, radius 2, `track` background, fill `accent`. Over budget: whole bar `danger`.
- With label above (Scope "4 of 18 done" … "22%", Selections "20 of 21 selected · 1 pending"): label row 13 muted, 6dp gap, then the line full width.
- Inline (Checklists list): "28 of 58" caption 56dp wide + line, gap 10.

## 13. `FAB`
- 52 circle, `accent`, white Plus 24 (Defects uses Camera 22). `shadow.fab`.
- Phone: absolute, right 16, bottom = tab bar height + 16. Duo: right 24, 20 above the tab bar.
- Present on: Project detail, Calendar (both views), Project tasks, Schedule (all views), Scope, Selections, Defects (camera), Site diary, Checklists, Labour hours, Duo Workspace / Project detail / Gantt / Site diary. Not on Workspace v4, Projects, Messages, detail screens, or forms.

## 14. `TabBar`
- **Phone**: 83 tall (padding 8/8/28/8), `surface`, 1dp `border` top. 5 items spaced evenly: icon 22 + label `micro` 11, gap 3. Inactive icon & label `faint`; active icon `accent` (stroke 1.8), label `link`.
  Items: Workspace (House), Projects (Briefcase), Messages (MessageSquare), Calendar (Calendar), More (LayoutGrid).
- **Duo**: 56 tall, items centred with gap 28. Each item horizontal: icon 18 + label 13, gap 7, padding 7/12, radius 8. Active: `tint` background, icon + label `accent`. Inactive: `muted`.

## 15. `FilterChips` (Defects status, Projects search)
- Horizontal scroll, gap 2. Chip padding 5/10, radius 8: label 13 `muted` + count 12 `faint`, gap 5. Active chip: `surface` + 1dp `border`, label and count `accent`.

## 16. `CaptureChip` / `CreateChip`
- Workspace v4: 85 × 40, radius 12, `tint`, icon 16 + label 13 SemiBold `link`, gap 4.
- More sheet: 114 × 34, radius 10, `tint`, padding 9/4, icon 15 + label 13 `link`, gap 6.
- Duo Workspace capture tiles: 99 × 76 bordered `Card`, icon 20 centred over label 12.5.

## 17. `SectionTile` (Project detail row)
- Phone: 76 × 64, radius 10, `surface` + `border`, padding 9/4/9/7. Top row: icon 18 `icon` + count 11 `muted` right. Label `type.tile` 11.5 `text` bottom.
- Horizontal scroll, gap 8; the last tile is cut off at the edge on purpose (shows it scrolls).
- Duo: 80 × 66, radius 12, all 9 fit in one row.

## 18. `CalendarBlock`
- Fill = project tint (`projectTint(projectColour)`; list variant on a white card: `projectTint(projectColour, 0.16, colors.surface)`) or `internalFill` for non-project events. 3dp strip on the left in the full project colour (or `internalStrip`). Radius 5, clips the strip.
- Text padding 5/5/0/6 (week) or 6/8/6/9 (list). Title 11 `textBody` (15 in list). Time 10 `muted` only when the block is ≥ 49dp tall (> 45 min); short events show title only.
- All-day chip: 21 tall, same treatment, title 11.
- Agenda strip (Workspace / Duo Today): 3 × 30–34 radius 2 bar in project colour beside the row text (this is the only place a bar appears, as a calendar marker, never on cards).

## 19. `GanttBar`
- Height 22, radius 4, fill `trade.*.fill`, strip 3 `trade.*.strip`. Date label ("12 – 16") 10 `muted` inside the bar when it fits, else just after it. Items outside the range show "25 ›" / "3 Dec ›" 10 muted at the right edge.

## 20. `Thumb` / image fallback
- 48 × 48, radius 8, `thumbFill` + 1dp `hairline` border, image `contain`.
- **No image / failed load**: `greyFill` tile, Lucide Image 18 `faint` centred. Same for defect photos (Camera icon) and diary photo tiles (80 × 80, radius 10).
- Always render through one `<SmartImage>` that handles loading, error and missing URL → fallback. See GOTCHAS.

## 21. `Avatar`
- Initials circle: 28 (`avatarFill`, initials 11 `icon`), 32 (Duo, `greyFill`), 22 (activity, project colour + white 9 Bold), 20 (assignee chips, `greyFill`, 9 text), 40 (profile, `tint`, 16 `link`).
- Channel lead: "#" 17 `muted`, no circle (phone). Duo conversation header: 34 square radius 9 `greyFill` with "#".

## 22. `UnreadBadge`
- 18 tall, min width 18, radius 9, `accent`, padding 0/6, count 11 white. The unread thread's name goes SemiBold and its time goes `accent`.

## 23. `EmptyState`
- Centred column, gap 10, bottom padding 80: 56 circle `greyFill` with 26 icon `icon`; title `type.emptyTitle` 17; helper `bodyPreview` 14 `muted`, max width 250, centred. No buttons; the FAB stays in its usual spot.

## 24. `BottomSheet`
- `bg` fill, top radius 20, `shadow.sheet`, padding 0/16/34/16, gap 14. Grabber 36 × 5 radius 3 `grabber`, 8 from top. Scrim `colors.scrim` over the screen behind.

## 25. `BottomActionBar`
- Selection detail: 60 tall, `bg`, 1dp top `border`, padding 10/16; one secondary button full width: `surface` + `border`, radius 10, height 39, MessageSquare 16 + "Post to project chat" 14 `accent`, centred.
- Add defect: 81 tall, `surface`, top border, padding 10/16/30/20, gap 12: "Done" 15 text (plain) + primary "Save & next →" 140 × 40 radius 10 (`accent`; disabled `accentDisabled`) with white 15 label + ArrowRight 16.

## 26. `CommentComposer` / `ChatInput`
- 42 tall, radius 10, `surface` + `border`, padding 11/12/11/14, gap 10–12: optional Paperclip 18 · placeholder 14 `faint` · Send 18.

## 27. `DayDivider` (chat), `TodayMarker` (Schedule list), `NowLine` (calendar)
- DayDivider: 1dp `border` line · label 12 `muted` · line, gap 10.
- TodayMarker: "Today · Sat 21" 11 `accent`, gap 8, then a 1dp `accentLine` to the edge.
- NowLine: time label 10–11 `accent` in the gutter, 6–8dp dot, 2dp `accent` line across today's column (faint 1dp accent across the other days in week view).

## 28. `MasterDetail` (Duo / wide)
- Row: list pane fixed width (`size.listPane.*`), 1dp `border` on its right; detail pane flex. Both panes padding 12/24/16/24.
- Selecting a row sets `tint` on that row (radius 8) and swaps the detail pane. No coloured left bars.
- Phone (narrow): list screen pushes the detail screen as today.

## 29. `ProjectRail` (Duo project detail)
- 88 wide, 1dp right `border`, padding-top 12, gap 4. Menu icon 20 at the top. Items 72 × 67, radius 8, centred column gap 5: `ProjectSquare 16`, job number 11, short name 10. Current project: `tint` background, number + name `accent`. Others: number `muted`, name `faint`.
