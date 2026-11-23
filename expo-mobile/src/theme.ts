import { Appearance, useColorScheme } from 'react-native';

// ── Colour tokens ─────────────────────────────────────────────────────────
// Mirrors client/src/index.css (plum rebrand). Interactive purple is
// `primary` (plum); `lavender` is a decorative accent and never carries
// white text.
const light = {
  // Surfaces
  // Revamp v1 (Nov 2026): surfaces, borders, text and brand now point at the
  // approved design tokens below (`colors`). Old names are kept so every
  // existing screen picks up the new palette without an import change.
  background:   '#FBFAF8', // colors.bg
  card:         '#FFFFFF', // colors.surface
  nav:          '#FBFAF8', // colors.bg — headers sit on the canvas
  subtle:       '#F3F0F7', // colors.tint
  // Borders
  border:       '#EBE8E3', // colors.border
  borderStrong: '#D6D1CA', // colors.dashedBorder
  // Text. Revamp v1 muted is lighter than the old sunlight-tuned #6E6A64
  // (about 2.9:1 on bg) — approved in the design; revisit if it's hard to
  // read outdoors.
  textPrimary:   '#1F1D1B', // colors.text
  textSecondary: '#6B665F', // colors.icon
  textMuted:     '#9B968F', // colors.muted
  // Brand
  primary:      '#7E6C98', // colors.accent
  primaryHover: '#5F4E78', // colors.link
  primaryLight: '#F3F0F7', // colors.tint
  // Organic accents
  teal:         '#70CAD0',
  tealLight:    '#E8F6F8',
  sage:         '#82C8A2',
  sageLight:    '#EBF6F0',
  amber:        '#D4B670',
  amberLight:   '#F8F3E8',
  coral:        '#DA988A',
  coralLight:   '#F9EFEC',
  rose:         '#D08AAF',
  roseLight:    '#F8ECF2',
  lavender:     '#A68AC7',
  lavenderLight:'#F3F0F7',
  // Accent TEXT inks. The accents above are decorative (1.8–2.4:1 on white)
  // — use these when a sage/amber/coral/teal hue has to be READ (labels,
  // counts, small icons). All ≥ 5:1 on background, card and their own wash.
  sageText:     '#33724F',
  amberText:    '#80621C',
  coralText:    '#A44D3C',
  tealText:     '#24727A',
  // Status — `statusX` is the TEXT/icon colour (on card/background/its own
  // wash); `statusXSolid` is for solid fills that carry white text. In light
  // mode they're the same; in dark mode the text role lightens (see below).
  // Inks darkened for sunlight: success 5.6 / 6.1 / 5.3 (bg / card / wash),
  // warning 5.3 / 5.7 / 5.1, info 5.4 / 5.9 / 5.3. Danger already passed.
  statusSuccess:      '#2F6E50',
  statusSuccessBg:    '#E9F3EE',
  statusSuccessSolid: '#2F6E50',
  statusWarning:      '#84601E',
  statusWarningBg:    '#F8F2E7',
  statusDanger:       '#B03838',
  statusDangerBg:     '#F8EAEA',
  statusDangerSolid:  '#B03838',
  statusInfo:         '#4563A6',
  statusInfoBg:       '#F1F4FB',
};

const dark = {
  background:   '#302E2A',
  card:         '#3B3934',
  nav:          '#242320',
  subtle:       '#4C464A',
  border:       '#48443E',
  borderStrong: '#3A3835',
  textPrimary:   '#E8E4DC',
  // Lifted so muted text clears 4.5:1 on the dark card (was 3.2:1).
  textSecondary: '#B8B4AC',
  textMuted:     '#A6A29A',
  primary:      '#7E6C98',
  primaryHover: '#93819F',
  primaryLight: '#4C464A',
  teal:         '#70CAD0',
  tealLight:    '#475956',
  sage:         '#82C8A2',
  sageLight:    '#4B584C',
  amber:        '#D4B670',
  amberLight:   '#5D5441',
  coral:        '#DA988A',
  coralLight:   '#5E4E47',
  rose:         '#D08AAF',
  roseLight:    '#5C4B4F',
  lavender:     '#A68AC7',
  lavenderLight:'#534B54',
  // On dark surfaces the pastel accents already read (4.9–6.1:1 on card).
  sageText:     '#82C8A2',
  amberText:    '#D4B670',
  coralText:    '#DA988A',
  tealText:     '#70CAD0',
  // Status in dark mode: the TEXT role lightens to the same hue's pastel and
  // the wash drops to 10% alpha — the light-mode inks (#3C8160 etc.) sit at
  // only 1.7–2.4:1 on a dark card, well under the 4.5:1 minimum. These clear
  // it (4.7–5.1:1). `statusXSolid` stays dark so white text on a filled
  // button/badge still reads.
  statusSuccess:      '#82C8A2',
  statusSuccessBg:    '#82C8A21A',
  statusSuccessSolid: '#3C8160',
  statusWarning:      '#D4B670',
  statusWarningBg:    '#D4B6701A',
  statusDanger:       '#EFA39C',
  statusDangerBg:     '#EFA39C1A',
  statusDangerSolid:  '#B03838',
  statusInfo:         '#A8C0EC',
  statusInfoBg:       '#A8C0EC1A',
};

// ── Typography scale ──────────────────────────────────────────────────────
export const fontSize = {
  xxs:     8,
  label:   9,
  data:    10,
  table:   11,
  xs:      12,
  bodySm:  13,
  sm:      14,
  bodyLg:  15,
  base:    16,
  lg:      18,
  xl:      20,
  xxl:     24,
  display: 28,
  hero:    36,
};

/**
 * Cap on Dynamic Type for dense UI (rows, chips, headers). Text still grows
 * with the iPhone's Larger Text setting up to 1.4x, so it stays readable
 * without rows breaking apart at the accessibility sizes. Applied per <Text>
 * (React 19 dropped defaultProps on function components, so there is no
 * reliable global default).
 */
export const MAX_FONT_SCALE = 1.4;

export const fontWeight = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
};

// ── Spacing & radius ──────────────────────────────────────────────────────
export const radius = {
  sm:   4,
  md:   6,
  lg:   8,
  xl:   12,
  xxl:  16,
  full: 9999,
};

// ── Schedule type colours (mirrors web TYPE_COLORS — task = --primary) ────
export const typeColors = {
  task:       '#7E6C98',
  milestone:  '#D4B670',
  inspection: '#82C8A2',
  delivery:   '#70CAD0',
  meeting:    '#DA988A',
  leave:      '#D08AAF',
};

// ── Project chip colours (fallback cycle when a project has no colour) ────
export const projectColors = [
  '#70CAD0', '#A68AC7', '#82C8A2', '#D4B670',
  '#DA988A', '#D08AAF', '#87749A', '#4ECAC8',
];

// ── Hook ──────────────────────────────────────────────────────────────────
export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

/**
 * The theme for the CURRENT colour scheme, for module-level helpers that
 * can't call a hook (e.g. getStatusColor(status) outside a component). Read it
 * at call time — never capture it in a module constant — so a screen that
 * re-renders on a light/dark switch (every screen does, via useTheme) picks up
 * the new inks. Prefer useTheme() inside components.
 */
export function currentTheme(): Theme {
  return Appearance.getColorScheme() === 'dark' ? dark : light;
}

export { light as lightTheme, dark as darkTheme };

// ══════════════════════════════════════════════════════════════════════════
// Revamp v1 design tokens (approved Nov 2026)
// Source: design/tokens/theme.ts, measured from the approved Figma frames
// (file purB3wnrQmpAgjBmG4fQiP, page "Revamp"). The Figma *variables* are an
// old palette — these values win. New UI imports from here; never inline a
// hex, font size, radius or spacing value in a screen or component.
// ══════════════════════════════════════════════════════════════════════════

const designLight = {
  // Surfaces
  bg: '#FBFAF8',            // app background (every screen)
  surface: '#FFFFFF',       // cards, tab bar, inputs
  border: '#EBE8E3',        // 1px card borders, row dividers, header rules
  hairline: '#EFECE8',      // calendar/gantt grid lines, thumbnail border
  track: '#ECE9E4',         // empty part of 3px progress lines
  greyFill: '#F2F0EC',      // weekend columns, internal events, no-image tiles, empty-state circle
  avatarFill: '#F1EEEA',    // initials avatars, segmented-control background
  thumbFill: '#F5F4F2',     // product thumbnail background
  pillFill: '#F4F2EF',      // Workspace "Project: Choose" pill
  dashedBorder: '#D6D1CA',  // Add-defect photo tiles
  grabber: '#DDD9D3',       // bottom-sheet grabber, inactive carousel dot
  scrim: 'rgba(31,28,26,0.38)', // behind bottom sheets

  // Text
  text: '#1F1D1B',          // primary text, titles
  textBody: '#2F2B27',      // calendar event titles, chat/comment bodies
  textLong: '#3D3934',      // long-form paragraphs: scope bullets, notes
  textPreview: '#5C5751',   // site-diary 2-line previews
  muted: '#9B968F',         // ALL secondary text: meta, counts, labels, dates
  mutedStrong: '#8A857E',   // Workspace only (date line, stage text)
  faint: '#B4AFA8',         // inactive tabs, bullets, placeholders, "·" separators
  placeholderLarge: '#C9C4BC', // big borderless field placeholders
  icon: '#6B665F',          // line icons in lists, initials text

  // Accent (sparingly: active tab, today, links, FAB, checked, progress, unread)
  accent: '#7E6C98',
  link: '#5F4E78',
  tint: '#F3F0F7',
  todayColumn: '#F6F4F9',
  accentDisabled: '#DCD5E6',
  accentLine: 'rgba(126,108,152,0.35)',
  ganttToday: 'rgba(126,108,152,0.60)',
  onAccent: '#FFFFFF',

  // Calendar internal (non-project) events
  internalFill: '#F2F0EC',
  internalStrip: '#C9C4BC',

  // Status dots (7dp dot + muted word; never pills)
  status: {
    done: '#6FBF8E',
    inProgress: '#7E6C98',
    upcoming: '#C9C4BC',
    pending: '#E0A84E',
    pendingText: '#B7862F',
    sent: '#6FA0D2',
    rejected: '#D9776B',
  },

  // The one warning colour
  danger: '#C4574B',

  // Scope item type dots
  type: { scope: '#A595C4', material: '#D9A38F' },

  // Gantt trade colours (bar = tint fill + 3dp strip)
  trade: {
    slate: { strip: '#8E9AAF', fill: '#EAEBEC' },
    blue:  { strip: '#6FA0D2', fill: '#E5ECF2' },
    teal:  { strip: '#5FB3B3', fill: '#E2EFED' },
    leave: { strip: '#B9B4AC', fill: '#F0EFEC' },
  },

  // Fallback project colours (real colours come from project data). Squares render at 90% opacity.
  projectFallback: ['#B6A6D0', '#E9C866', '#7FCB9B', '#D97C93', '#E58E66', '#6FC1C1', '#8FBF8A', '#F0A868', '#E8A0B4', '#7CC4A0'],
};

export type DesignColors = typeof designLight;

/**
 * Dark-mode equivalents. Not part of the approved (light-only) design: same
 * roles mapped onto the app's existing dark surfaces so dark mode keeps
 * working. Status / trade / project hues are shared with light.
 */
const designDark: DesignColors = {
  ...designLight,
  bg: '#302E2A',
  surface: '#3B3934',
  border: '#48443E',
  hairline: '#433F3A',
  track: '#4A4640',
  greyFill: '#45423D',
  avatarFill: '#45423D',
  thumbFill: '#45423D',
  pillFill: '#45423D',
  dashedBorder: '#5A554E',
  grabber: '#5A554E',
  scrim: 'rgba(0,0,0,0.5)',
  text: '#E8E4DC',
  textBody: '#DDD8CF',
  textLong: '#D2CDC4',
  textPreview: '#BDB8AF',
  muted: '#A6A29A',
  mutedStrong: '#A6A29A',
  faint: '#827D76',
  placeholderLarge: '#6F6A63',
  icon: '#B8B4AC',
  accent: '#9C8AB8',
  link: '#C3B5DA',
  tint: '#4C464A',
  todayColumn: '#3A3640',
  accentDisabled: '#5A5266',
  accentLine: 'rgba(156,138,184,0.45)',
  ganttToday: 'rgba(156,138,184,0.70)',
  internalFill: '#45423D',
  internalStrip: '#6F6A63',
  status: { ...designLight.status, pendingText: '#E0A84E', inProgress: '#9C8AB8' },
  danger: '#EFA39C',
};

/** Light design colours, for module-level code. Inside components prefer useColors(). */
export const colors = designLight;
export const darkColors = designDark;

/** Design colours for the current light/dark scheme. */
export function useColors(): DesignColors {
  return useColorScheme() === 'dark' ? designDark : designLight;
}

/** Design colours for the current scheme, read at call time (non-hook helpers). */
export function currentColors(): DesignColors {
  return Appearance.getColorScheme() === 'dark' ? designDark : designLight;
}

/** Project-colour tint for calendar blocks / agenda: `amount` of the project colour over `base`. */
export function projectTint(hex: string, amount = 0.16, base: string = designLight.bg): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex);
  const [r0, g0, b0] = p(base);
  const mix = (c: number, b: number) => Math.round(b + (c - b) * amount);
  return '#' + [mix(r1, r0), mix(g1, g0), mix(b1, b0)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ─── Typography (Inter) ──────────────────────────────────────────────────
// Loaded in App.tsx via @expo-google-fonts/inter. Use these explicit families
// rather than fontWeight: Android won't pick the SemiBold file from a weight.
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  display:       { fontFamily: fonts.bold,     fontSize: 30, lineHeight: 36 },
  displayDuo:    { fontFamily: fonts.bold,     fontSize: 28, lineHeight: 34 },
  title:         { fontFamily: fonts.bold,     fontSize: 24, lineHeight: 29 },
  heading:       { fontFamily: fonts.bold,     fontSize: 22, lineHeight: 27 },
  headingSemi:   { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 29 },
  pageTitle:     { fontFamily: fonts.bold,     fontSize: 20, lineHeight: 24 },
  detailTitle:   { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 24 },
  emptyTitle:    { fontFamily: fonts.regular,  fontSize: 17, lineHeight: 21 },
  price:         { fontFamily: fonts.regular,  fontSize: 17, lineHeight: 21 },
  cardTitle:     { fontFamily: fonts.bold,     fontSize: 16, lineHeight: 19 },
  sheetTitle:    { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 19 },
  sectionTitle:  { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 18 },
  rowTitle:      { fontFamily: fonts.regular,  fontSize: 15, lineHeight: 18 },
  rowTitleStrong:{ fontFamily: fonts.semibold, fontSize: 15, lineHeight: 18 },
  rowTitleMedium:{ fontFamily: fonts.medium,   fontSize: 15, lineHeight: 18 },
  bodyLong:      { fontFamily: fonts.regular,  fontSize: 15, lineHeight: 22 },
  checklistItem: { fontFamily: fonts.regular,  fontSize: 15, lineHeight: 21 },
  body:          { fontFamily: fonts.regular,  fontSize: 14, lineHeight: 17 },
  bodyRead:      { fontFamily: fonts.regular,  fontSize: 14, lineHeight: 21 },
  bodyPreview:   { fontFamily: fonts.regular,  fontSize: 14, lineHeight: 20 },
  meta:          { fontFamily: fonts.regular,  fontSize: 13, lineHeight: 16 },
  metaMedium:    { fontFamily: fonts.medium,   fontSize: 13, lineHeight: 16 },
  metaSemi:      { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 16 },
  caption:       { fontFamily: fonts.regular,  fontSize: 12, lineHeight: 15 },
  captionSemi:   { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 15 },
  tile:          { fontFamily: fonts.regular,  fontSize: 11.5, lineHeight: 14 },
  micro:         { fontFamily: fonts.regular,  fontSize: 11, lineHeight: 13 },
  tiny:          { fontFamily: fonts.regular,  fontSize: 10, lineHeight: 12 },
  ganttName:     { fontFamily: fonts.regular,  fontSize: 12.5, lineHeight: 15 },
  initials:      { fontFamily: fonts.regular,  fontSize: 9,  lineHeight: 11 },
  duoTab:        { fontFamily: fonts.regular,  fontSize: 13, lineHeight: 16 },
} as const;

/** Use on every number that should line up: prices, hours, counts, dates in columns. */
export const tabular = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };

// ─── Radii ───────────────────────────────────────────────────────────────
export const radii = {
  xs: 2,
  squareSm: 3,
  squareMd: 4,
  sm: 5,
  seg: 6,
  md: 8,
  badge: 9,
  lg: 10,
  card: 12,
  section: 14,
  sheet: 20,
  fab: 26,
  pill: 999,
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────
export const space = {
  screenX: 16,
  screenTop: 4,
  screenBottom: 24,
  section: 14,
  sectionRoot: 24,
  groupHeaderToCard: 8,
  cardX: 14,
  rowY: 11,
  rowGap: 12,
  propRowY: 10,
  inline: 6,
  inlineSm: 4,
  tabGap: 20,
  duoPaneX: 24,
  duoPaneTop: 12,
  duoMainX: 28,
} as const;

// ─── Sizes ───────────────────────────────────────────────────────────────
export const size = {
  tabBarPhone: 83,
  tabBarDuo: 56,
  fab: 52,
  fabIcon: 24,
  fabInset: 16,
  statusDot: 7,
  typeDot: 6,
  checkbox: 18,
  taskCircle: 20,
  projectSquare: { header: 10, row: 14, card: 18, rail: 16, taskHeader: 12 },
  thumb: 48,
  progress: 3,
  underline: 2,
  border: 1,
  icon: { nav: 22, header: 20, row: 16, caret: 12, meta: 13 },
  railWidth: 88,
  listPane: { tasks: 400, selections: 420, diary: 400, messages: 380 },
} as const;

// ─── Elevation: only the FAB and bottom sheets have shadows ──────────────
export const shadow = {
  fab: { shadowColor: '#2B2624', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  sheet: { shadowColor: '#2B2624', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
} as const;

export const breakpoints = {
  /** Two-pane layouts when width >= 700 AND width > height. */
  wide: 700,
} as const;

// ─── Component geometry (design/COMPONENTS.md) ───────────────────────────
// The fixed measurements of each shared component, so components/kit never
// inlines a number. Screens use the components, not these values.
export const metrics = {
  iconStroke: 1.7,
  iconStrokeActive: 1.8,
  checkStroke: 2.5,
  disabledOpacity: 0.5,
  pressedOpacity: 0.6,
  solidPressedOpacity: 0.9,
  inlineGap: 6,
  hitSlop: 10,
  longPressMs: 450,
  minHit: 44,
  card: { sectionPad: { top: 14, right: 14, bottom: 6, left: 16 }, sectionGap: 4, padTop: 12, padBottom: 14, notesPadY: 12, duoPad: 4 },
  square: {
    radius: { header: 3, taskHeader: 3, row: 4, rail: 4, card: 5 },
    opacity: 0.9,
  },
  pageHeader: { height: 28, padY: 2, gap: 4, projectPadLeft: 8, projectGap: 6, actionGap: 18, back: 22, backTasks: 24, rootAction: 22 },
  sheetHeader: { height: 44, sideWidth: 70 },
  underlineTabs: { height: 27, gap: 20, underlineGap: 7, navGap: 14, navIcon: 16 },
  segmented: { height: 32, pad: 2, gap: 2, segPadY: 5, segPadX: 12 },
  groupHeader: { height: 18, gap: 8, toggleGap: 4, collapsedRowPad: 11, sectionCardPad: 12, sectionIcon: 16 },
  listRow: { padY: 11, gap: 12, bodyGap: 2 },
  propertyRow: { padY: 9, gap: 10, labelWidth: 116, formPadY: 12, copyIcon: 15, swatch: 12, avatar: 20, valueIcon: 15 },
  statusDot: { gap: 5 },
  checkbox: { borderWidth: 1.5, check: 12 },
  progress: { labelGap: 6, inlineLabelWidth: 56, inlineGap: 10 },
  fab: { cameraIcon: 22 },
  tabBar: { padTop: 8, padX: 8, minPadBottom: 8, icon: 22, gap: 3, badgeOffsetX: 10, badgeOffsetY: -4 },
  filterChip: { gap: 2, padY: 5, padX: 10, innerGap: 5 },
  captureChip: {
    workspace: { width: 85, height: 40, icon: 16, gap: 4 },
    sheet: { width: 114, height: 34, padY: 9, padX: 4, icon: 15, gap: 6 },
    duo: { width: 99, height: 76, icon: 20, gap: 6 },
  },
  sectionTile: { width: 76, height: 64, pad: { top: 9, right: 4, bottom: 9, left: 7 }, icon: 18, gap: 8 },
  avatar: {
    row: { size: 28, font: 11 },
    duo: { size: 32, font: 11 },
    activity: { size: 22, font: 9 },
    chip: { size: 20, font: 9 },
    profile: { size: 40, font: 16 },
  },
  badge: { height: 18, padX: 6 },
  emptyState: { gap: 10, padBottom: 80, circle: 56, icon: 26, maxWidth: 250 },
  sheet: { grabberWidth: 36, grabberHeight: 5, grabberTop: 8, padX: 16, padBottom: 34, gap: 14 },
  actionBar: { padY: 10, padX: 16, buttonHeight: 39, primaryWidth: 140, primaryHeight: 40, icon: 16, gap: 12, savePadLeft: 20 },
  thumb: { fallbackIcon: 18, diary: 80 },
  calendarBlock: {
    strip: 3,
    tint: 0.16,
    tintDark: 0.28,
    weekPad: { top: 5, right: 5, left: 6 },
    listPad: { y: 6, right: 8, left: 9 },
    showTimeMinHeight: 49,
    allDayHeight: 21,
    agendaWidth: 3,
    agendaHeight: 32,
  },
  ganttBar: { height: 22, strip: 3, labelPadX: 6, minLabelWidth: 44 },
  divider: { gap: 10, nowDot: 7, nowLine: 2 },
  workspace: {
    contentTop: 8,
    sectionGap: 28,
    headerIcon: 22,
    headerGap: 2,
    captureGap: 8,
    chipGap: 6,
    pill: { padTop: 5, padRight: 8, padBottom: 5, padLeft: 10, gap: 5, icon: 13, caret: 12, maxName: 150 },
    subLabelPad: { top: 6, bottom: 2 },
    row: { padY: 11, gap: 10, pin: 12 },
    agendaRow: { padY: 10, gap: 12 },
    activityRow: { padY: 9, gap: 10 },
    maxProjects: 5,
    maxTimesheets: 5,
    menuWidth: 220,
    menuTop: 64,
    menuIcon: 18,
    clockGap: 12,
  },
  projects: {
    contentTop: 8,
    groupGap: 24,
    cardGap: 10,
    groupTopPad: 4,
    cardPad: 12,
    cardInnerGap: 12,
    progressTop: 10,
    searchHeight: 40,
    searchGap: 10,
    searchIcon: 16,
  },
  projectDetail: {
    navHeight: 34,
    navPad: { top: 6, right: 16, bottom: 6, left: 10 },
    navGap: 2,
    contentTop: 8,
    contentGap: 14,
    headerGap: 10,
    metaPadLeft: 28,
    metaGap: 10,
    tileGap: 8,
    cardPadBottom: 6,
    maxTaskRows: 5,
    maxDiaryRows: 3,
  },
  projectTasks: {
    headerTop: 6,
    headerBottom: 4,
    listTop: 16,
    groupGap: 20,
    circleOffset: 1,
    emptyGroupsIcon: 14,
    boardCardGap: 8,
  },
  schedule: {
    top: 4,
    gapList: 14,
    gapOther: 12,
    dayLabelGap: 6,
    dayGroupGap: 14,
    gantt: {
      nameCol: 124,
      nameColWide: 220,
      rowHeight: 38,
      headerHeight: 48,
      todayCircle: 22,
      todayLine: 2,
      barInset: 2,
      visibleDays: 7,
      visibleDaysWide: 14,
      depArrow: 4,
    },
    calendar: {
      headerHeight: 53,
      gutter: 44,
      dayWidth: 105,
      hourHeight: 50,
      dateCircle: 26,
      startHour: 6,
      endHour: 18,
      blockInset: 3,
    },
  },
  scope: {
    gap: 14,
    itemPadY: 12,
    checkOffset: 2,
    itemBodyGap: 3,
    detailIndent: 30,
    bulletGap: 8,
    bullet: 4,
  },
  selections: {
    rowPadY: 10,
    rowBodyGap: 3,
    trailingGap: 5,
    groupLimit: 7,
    heroImage: 190,
    heroPad: { top: 18, bottom: 12 },
    dot: 6,
    dotGap: 6,
    titleGap: 4,
    optionThumb: 48,
    propLabel: 120,
    fileIcon: 32,
  },
  defects: {
    rowPadY: 10,
    rowGap: 4,
    groupGap: 14,
    photoTile: { height: 84, icon: 22 },
    capturedThumb: 64,
    capturedGap: 8,
    formGap: 16,
    fieldGap: 8,
  },
  diary: {
    propLabel: 104,
    metaTop: 2,
    blockGap: 18,
    labelGap: 5,
    photoGap: 8,
  },
  checklists: {
    rowPadY: 12,
    rowGap: 7,
    checkOffset: 1,
    itemGap: 3,
  },
  labour: {
    gap: 14,
    summaryGap: 10,
    summaryRowGap: 6,
    rowPadTop: 11,
    rowPadBottom: 12,
    rowGap: 8,
    rowInnerGap: 10,
    codeWidth: 28,
    barIndent: 38,
  },
  composer: { height: 42, padY: 11, padRight: 12, padLeft: 14, gap: 10, icon: 18 },
} as const;
