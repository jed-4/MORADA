/**
 * Morada design tokens (revamp v1, approved by Jed, Nov 2026)
 * Source: Figma file purB3wnrQmpAgjBmG4fQiP, page "Revamp".
 * Values were measured from the approved frames. The local Figma *variables* in that
 * file are an OLD palette (bg #F6F3EE etc.). Ignore them and use this file.
 *
 * Rules:
 *  - Never hardcode a hex value in a screen or component. Import from here.
 *  - If you need a colour that is not here, add a named token (and tell Jed). Don't inline it.
 *  - Sizes are in dp (Figma px at 1x = dp).
 */

// ─── Colour ────────────────────────────────────────────────────────────────
export const colors = {
  // Surfaces
  bg: '#FBFAF8',            // app background (every screen)
  surface: '#FFFFFF',       // cards, tab bar, inputs
  border: '#EBE8E3',        // 1px card borders, row dividers, header rules
  hairline: '#EFECE8',      // calendar/gantt grid lines, thumbnail border
  track: '#ECE9E4',         // empty part of 3px progress lines
  greyFill: '#F2F0EC',      // weekend columns, internal calendar events, no-image tiles, empty-state circle, initials avatars (Duo)
  avatarFill: '#F1EEEA',    // initials avatars (phone Messages), segmented-control background
  thumbFill: '#F5F4F2',     // product thumbnail background
  pillFill: '#F4F2EF',      // Workspace "Project: Choose" pill
  dashedBorder: '#D6D1CA',  // Add-defect photo tiles (Take photo / Library)
  grabber: '#DDD9D3',       // bottom-sheet grabber, inactive carousel dot
  scrim: 'rgba(31,28,26,0.38)', // behind bottom sheets (#1F1C1A @ 38%)

  // Text
  text: '#1F1D1B',          // primary text, titles (measured in Figma; most common)
  textBody: '#2F2B27',      // calendar event titles, chat/comment bodies
  textLong: '#3D3934',      // long-form paragraphs: scope bullet lines, notes
  textPreview: '#5C5751',   // site-diary 2-line previews
  muted: '#9B968F',         // ALL secondary text: meta, counts, labels, dates
  mutedStrong: '#8A857E',   // Workspace v4 only (date line, stage text). Prefer `muted` elsewhere.
  faint: '#B4AFA8',         // inactive tab labels/icons, bullets, input placeholders, "·" separators
  placeholderLarge: '#C9C4BC', // big borderless field placeholders ("Defect title")
  icon: '#6B665F',          // line icons in lists, initials text

  // Accent (use sparingly: active tab, today, links, FAB, checked boxes, progress fill, unread)
  accent: '#7E6C98',
  link: '#5F4E78',          // links, emails, product codes, chip labels on tint, active phone tab label
  tint: '#F3F0F7',          // accent tint: capture chips, selected list row (Duo), active Duo tab, avatar
  todayColumn: '#F6F4F9',   // calendar week: today column wash
  accentDisabled: '#DCD5E6',// disabled primary button (Save & next)
  accentLine: 'rgba(126,108,152,0.35)', // thin "Today" divider line in Schedule list
  ganttToday: 'rgba(126,108,152,0.60)', // 2px today line in Gantt
  onAccent: '#FFFFFF',

  // Calendar internal (non-project) events
  internalFill: '#F2F0EC',
  internalStrip: '#C9C4BC',

  // Status dots (7dp dots + muted word; never pills)
  status: {
    done: '#6FBF8E',        // Done / Approved / Accepted / Closed
    inProgress: '#7E6C98',  // In progress (schedule)
    upcoming: '#C9C4BC',    // Upcoming / Not selected / Capture (task status)
    pending: '#E0A84E',     // Pending (selections) / Open (defects)
    pendingText: '#B7862F', // the word "Pending" next to an amber dot
    sent: '#6FA0D2',        // Sent to trade
    rejected: '#D9776B',    // Rejected dot
  },

  // The ONE warning colour: muted warm red
  danger: '#C4574B',        // over budget (hours, bar, "+3h over"), overdue dates, "Rejected" word, destructive menu items

  // Scope item type dots (6dp)
  type: {
    scope: '#A595C4',
    material: '#D9A38F',
  },

  // Gantt trade colours (bar = tint fill + 3dp strip)
  trade: {
    slate: { strip: '#8E9AAF', fill: '#EAEBEC' },
    blue:  { strip: '#6FA0D2', fill: '#E5ECF2' },
    teal:  { strip: '#5FB3B3', fill: '#E2EFED' },
    leave: { strip: '#B9B4AC', fill: '#F0EFEC' },
  },

  // Dummy project colours used in Figma. REAL project colours come from project data;
  // these are only fallbacks / for Storybook. Project squares render at 90% opacity.
  projectFallback: ['#B6A6D0', '#E9C866', '#7FCB9B', '#D97C93', '#E58E66', '#6FC1C1', '#8FBF8A', '#F0A868', '#E8A0B4', '#7CC4A0'],
} as const;

/** Project-colour tint used for calendar blocks / agenda: 16% of the project colour over colors.bg. */
export function projectTint(hex: string, amount = 0.16, base: string = colors.bg): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex), [r0, g0, b0] = p(base);
  const mix = (c: number, b: number) => Math.round(b + (c - b) * amount);
  return '#' + [mix(r1, r0), mix(g1, g0), mix(b1, b0)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
// Calendar week blocks + all-day chips (on bg): projectTint(c). Blocks sitting on a white card (Calendar LIST view): projectTint(c, 0.16, colors.surface).

// ─── Typography (Inter) ──────────────────────────────────────────────────────
// Load Inter 400/500/600/700 (expo-google-fonts: Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold).
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

// size / lineHeight measured from Figma text boxes (auto line height ≈ 1.2×).
export const type = {
  display:      { fontFamily: fonts.bold,     fontSize: 30, lineHeight: 36 }, // "Jed", "Projects", "Messages" tab-root titles
  displayDuo:   { fontFamily: fonts.bold,     fontSize: 28, lineHeight: 34 }, // Duo Workspace "Jed"
  title:        { fontFamily: fonts.bold,     fontSize: 24, lineHeight: 29 }, // Project name, "Tasks", diary entry date, labour code title
  heading:      { fontFamily: fonts.bold,     fontSize: 22, lineHeight: 27 }, // "November 2026", checklist detail title, "47h"
  headingSemi:  { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 29 }, // Duo task title, Add-defect title field
  pageTitle:    { fontFamily: fonts.bold,     fontSize: 20, lineHeight: 24 }, // one-row headers: "‹ Schedule", "‹ Scope", Duo pane titles
  detailTitle:  { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 24 }, // Selection detail product name
  emptyTitle:   { fontFamily: fonts.regular,  fontSize: 17, lineHeight: 21 }, // "No defects"
  price:        { fontFamily: fonts.regular,  fontSize: 17, lineHeight: 21 }, // Project detail "$486k"
  cardTitle:    { fontFamily: fonts.bold,     fontSize: 16, lineHeight: 19 }, // Projects list card name
  sheetTitle:   { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 19 }, // "New defect", profile name, conversation header
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 18 }, // section CARD headers (Workspace, Project detail)
  rowTitle:     { fontFamily: fonts.regular,  fontSize: 15, lineHeight: 18 }, // list row titles, group headers
  rowTitleStrong:{ fontFamily: fonts.semibold, fontSize: 15, lineHeight: 18 }, // unread thread name
  rowTitleMedium:{ fontFamily: fonts.medium,  fontSize: 15, lineHeight: 18 }, // Workspace v4 rows only
  bodyLong:     { fontFamily: fonts.regular,  fontSize: 15, lineHeight: 22 }, // diary entry blocks
  checklistItem:{ fontFamily: fonts.regular,  fontSize: 15, lineHeight: 21 }, // checklist items (wrap)
  body:         { fontFamily: fonts.regular,  fontSize: 14, lineHeight: 17 }, // property rows, compact rows, tabs
  bodyRead:     { fontFamily: fonts.regular,  fontSize: 14, lineHeight: 21 }, // scope bullets, notes
  bodyPreview:  { fontFamily: fonts.regular,  fontSize: 14, lineHeight: 20 }, // diary previews, comments, empty helper
  meta:         { fontFamily: fonts.regular,  fontSize: 13, lineHeight: 16 }, // muted meta, counts, group labels
  metaMedium:   { fontFamily: fonts.medium,   fontSize: 13, lineHeight: 16 }, // Workspace v4 counts
  metaSemi:     { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 16 }, // Workspace v4 capture chips / label
  caption:      { fontFamily: fonts.regular,  fontSize: 12, lineHeight: 15 }, // second line of rows, dates, block labels
  tile:         { fontFamily: fonts.regular,  fontSize: 11.5, lineHeight: 14 }, // section tile labels
  micro:        { fontFamily: fonts.regular,  fontSize: 11, lineHeight: 13 }, // phone tab labels, badges, status word in selection rows, calendar event titles
  tiny:         { fontFamily: fonts.regular,  fontSize: 10, lineHeight: 12 }, // calendar hour labels, gantt weekday letters, event times
  initials:     { fontFamily: fonts.regular,  fontSize: 9,  lineHeight: 11 }, // 20dp initials avatars
  duoTab:       { fontFamily: fonts.regular,  fontSize: 13, lineHeight: 16 },
} as const;

/** Use on every number that should line up: prices, hours, counts, dates in columns. */
export const tabular = { fontVariant: ['tabular-nums'] as const };

// ─── Radii ─────────────────────────────────────────────────────────────────
export const radii = {
  xs: 2,      // progress lines, 3dp colour bars
  squareSm: 3,// 10–12dp project squares
  squareMd: 4,// 14–16dp project squares, gantt bars
  sm: 5,      // 18dp project square, checkboxes, calendar event blocks/chips
  seg: 6,     // segmented-control inner segment
  md: 8,      // thumbnails, filter chips, Duo tab pill, Duo selected row
  badge: 9,   // unread badge (18dp tall)
  lg: 10,     // section tiles, buttons, inputs, photos, create chips
  card: 12,   // ALL cards
  section: 14,// Workspace v4 section cards
  sheet: 20,  // bottom sheet top corners
  fab: 26,    // 52dp FAB
  pill: 999,
} as const;

// ─── Spacing ───────────────────────────────────────────────────────────────
export const space = {
  screenX: 16,          // phone horizontal padding
  screenTop: 4,         // phone content top padding under status bar (inner screens)
  screenBottom: 24,
  section: 14,          // vertical gap between blocks on inner screens
  sectionRoot: 24,      // gap on tab-root screens (Projects 24, Messages 22, Workspace 28)
  groupHeaderToCard: 8, // group header → its card
  cardX: 14,            // card horizontal padding (rows sit inside this)
  rowY: 11,             // typical row vertical padding (10–12)
  rowGap: 12,           // gap between row lead / text / trailing
  propRowY: 10,         // property rows (38dp tall)
  inline: 6,            // dot → word, square → project name
  inlineSm: 4,
  tabGap: 20,           // between underline tabs
  duoPaneX: 24,
  duoPaneTop: 12,
  duoMainX: 28,
} as const;

// ─── Sizes ────────────────────────────────────────────────────────────────
export const size = {
  tabBarPhone: 83,      // incl. 28dp bottom inset padding; icons 22, label 11
  tabBarDuo: 56,
  fab: 52,
  fabIcon: 24,
  fabInset: 16,         // from right edge and from top of tab bar (phone); Duo: 24 right, 20 above tab bar
  statusDot: 7,
  typeDot: 6,
  checkbox: 18,         // soft-square, 1.5dp #C9C4BC border; checked = accent fill + 12dp white check
  taskCircle: 20,       // round task checkbox (icon/circle)
  projectSquare: { header: 10, row: 14, card: 18, rail: 16, taskHeader: 12 },
  thumb: 48,
  progress: 3,
  underline: 2,
  icon: { nav: 22, header: 20, row: 16, caret: 12, meta: 13 },
  railWidth: 88,
  listPane: { tasks: 400, selections: 420, diary: 400, messages: 380 },
} as const;

// ─── Elevation ─────────────────────────────────────────────────────────────
// Only the FAB and bottom sheets have shadows. Cards never do.
export const shadow = {
  fab: { shadowColor: '#2B2624', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  // Figma: drop shadow #2B2624 14%, y 6, blur 20 (RN shadowRadius ≈ blur/2)
  sheet: { shadowColor: '#2B2624', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
} as const;

export const breakpoints = {
  /** Two-pane / Duo layouts when width >= 700 AND width > height (unfolded Fold, tablets landscape). */
  wide: 700,
} as const;

export const theme = { colors, type, fonts, radii, space, size, shadow, breakpoints, tabular, projectTint };
export default theme;
