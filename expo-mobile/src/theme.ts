import { Appearance, useColorScheme } from 'react-native';

// ── Colour tokens ─────────────────────────────────────────────────────────
// Mirrors client/src/index.css (plum rebrand). Interactive purple is
// `primary` (plum); `lavender` is a decorative accent and never carries
// white text.
const light = {
  // Surfaces
  background:   '#F9F6F1',
  card:         '#FFFFFF',
  nav:          '#F5F0E9',
  subtle:       '#F1ECF6',
  // Borders
  // Borders — a step stronger than the web (#EAEAE8 / #D8D7D4) so card
  // edges still read in direct sunlight.
  border:       '#DEDCD8',
  borderStrong: '#C8C5C0',
  // Text — darkened for outdoor use. WCAG AA (4.5:1) on background, card
  // and nav: secondary 7.2 / 7.7 / 6.8, muted 5.0 / 5.4 / 4.7.
  // (Was #6B6560 = 5.3 / 5.7 and #8A8680 = 3.4 / 3.6 — muted failed.)
  textPrimary:   '#2C2825',
  textSecondary: '#57524D',
  textMuted:     '#6E6A64',
  // Brand
  primary:      '#87749A',
  primaryHover: '#7E6A92',
  primaryLight: '#F1ECF6',
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
  lavenderLight:'#F1ECF6',
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
  primary:      '#87749A',
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
  task:       '#87749A',
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
