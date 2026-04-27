import { useColorScheme } from 'react-native';

// ── Colour tokens ─────────────────────────────────────────────────────────
const light = {
  // Surfaces
  background:   '#FAFAF8',
  card:         '#FFFFFF',
  nav:          '#F5F4F0',
  subtle:       '#F2EEF9',
  // Borders
  border:       '#EAEAE8',
  borderStrong: '#D8D7D4',
  // Text
  textPrimary:   '#2C2825',
  textSecondary: '#6B6560',
  textMuted:     '#8A8680',
  // Brand
  primary:      '#A890D4',
  primaryHover: '#9278C4',
  primaryLight: '#F2EEF9',
  // Organic accents
  teal:         '#70CAD0',
  tealLight:    '#DFF5F6',
  sage:         '#82C8A2',
  sageLight:    '#E0F5E9',
  amber:        '#D4B670',
  amberLight:   '#F7EDDA',
  coral:        '#DA988A',
  coralLight:   '#F7E5E2',
  rose:         '#D08AAF',
  roseLight:    '#F5E2EE',
  // Status
  statusSuccess:    '#82C8A2',
  statusSuccessBg:  '#E0F5E9',
  statusWarning:    '#D4B670',
  statusWarningBg:  '#F7EDDA',
  statusDanger:     '#DA988A',
  statusDangerBg:   '#F7E5E2',
  statusInfo:       '#70CAD0',
  statusInfoBg:     '#DFF5F6',
};

const dark = {
  background:   '#1C1B19',
  card:         '#252320',
  nav:          '#1C1B19',
  subtle:       '#2D2840',
  border:       '#2E2C29',
  borderStrong: '#3A3835',
  textPrimary:   '#E8E4DC',
  textSecondary: '#A8A49C',
  textMuted:     '#8A8680',
  primary:      '#A890D4',
  primaryHover: '#BEA8E0',
  primaryLight: '#2D2840',
  teal:         '#70CAD0',
  tealLight:    '#1A3035',
  sage:         '#82C8A2',
  sageLight:    '#1A2E22',
  amber:        '#D4B670',
  amberLight:   '#2E2410',
  coral:        '#DA988A',
  coralLight:   '#2E1A18',
  rose:         '#D08AAF',
  roseLight:    '#2A1A24',
  statusSuccess:    '#82C8A2',
  statusSuccessBg:  '#1A2E22',
  statusWarning:    '#D4B670',
  statusWarningBg:  '#2E2410',
  statusDanger:     '#DA988A',
  statusDangerBg:   '#2E1A18',
  statusInfo:       '#70CAD0',
  statusInfoBg:     '#1A3035',
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

// ── Schedule type colours (mirrors web TYPE_COLORS_HEX) ───────────────────
export const typeColors = {
  task:       '#A890D4',
  milestone:  '#D4B670',
  inspection: '#82C8A2',
  delivery:   '#70CAD0',
  meeting:    '#DA988A',
  leave:      '#D08AAF',
};

// ── Project chip colours (mirrors web PROJECT_COLORS) ─────────────────────
export const projectColors = [
  '#70CAD0', '#A890D4', '#82C8A2', '#D4B670',
  '#DA988A', '#D08AAF', '#9278C4', '#4ECAC8',
];

// ── Hook ──────────────────────────────────────────────────────────────────
export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export { light as lightTheme, dark as darkTheme };
