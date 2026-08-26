// ---------------------------------------------------------------------------
// MORADA_PALETTE — the canonical picker palette.
//
// Source: Figma "BUILDPRO" file, "Project Colour Palette" frame
// (node 1450:8706). 24 curated colours, all warm and muted, grouped the way
// they are grouped in the design. Hex values were read from the Figma node
// names, not sampled from a render — several swatches are drawn with an
// overlay, so sampling a screenshot gives values up to ~10% darker.
//
// This supersedes MORADA_PROJECT_PALETTE and BUILDPRO_PALETTE below, which are
// kept because pickers still point at them and existing rows hold their hexes.
// New pickers should use this one.
//
// The dots in the Figma frame marking some of these as "existing design token"
// are misleading, and an earlier version of this comment repeated the mistake.
// These are picker swatches — colours a user assigns to a contact or a tag —
// and they are a separate concern from the accent tokens in index.css, even
// where a name is shared. Coral, Sage and Teal happen to be the same value as
// --coral, --sage and --teal. Amber is NOT: this palette's Amber is #F0B964,
// while --amber is #D4B670, which matches Figma's own token frame exactly.
// There is no amber mismatch to fix.
//
// Lavender #A890D4 is likewise a swatch, not the brand colour. --primary ships
// #87749A deep plum and stays that way (decided 2026-08-26): the April 2026
// palette pass moved it deliberately, so Figma and the docs are what get
// corrected, not the ~1,600 usages across ~220 files. See CLAUDE.md.
// ---------------------------------------------------------------------------

export type MoradaSwatch = { name: string; hex: string };
export type MoradaSwatchGroup = { group: string; colors: MoradaSwatch[] };

export const MORADA_PALETTE_GROUPS: MoradaSwatchGroup[] = [
  {
    group: 'Warm',
    colors: [
      { name: 'Rose Quartz', hex: '#E8A0A8' },
      { name: 'Coral',       hex: '#DA988A' },
      { name: 'Peach',       hex: '#E09878' },
      { name: 'Dusty Red',   hex: '#C87878' },
      { name: 'Mauve Rose',  hex: '#D484A0' },
      { name: 'Blush',       hex: '#E8B0C0' },
    ],
  },
  {
    group: 'Earthy',
    colors: [
      { name: 'Apricot',     hex: '#E8B480' },
      { name: 'Warm Orange', hex: '#E09868' },
      { name: 'Amber',       hex: '#F0B964' },
      { name: 'Soft Yellow', hex: '#EAD070' },
      { name: 'Gold',        hex: '#D4A840' },
      { name: 'Ochre',       hex: '#C89050' },
    ],
  },
  {
    group: 'Natural',
    colors: [
      { name: 'Mint',        hex: '#96D4A8' },
      { name: 'Sage',        hex: '#82C8A2' },
      { name: 'Forest',      hex: '#68B088' },
      { name: 'Seafoam',     hex: '#80C8C0' },
      { name: 'Teal',        hex: '#70CAD0' },
      { name: 'Deep Teal',   hex: '#58A8B0' },
    ],
  },
  {
    group: 'Cool',
    colors: [
      { name: 'Sky',         hex: '#80B8D8' },
      { name: 'Cornflower',  hex: '#7890C8' },
      { name: 'Periwinkle',  hex: '#8888C4' },
      { name: 'Lavender',    hex: '#A890D4' },
      { name: 'Soft Purple', hex: '#B0A0C8' },
      { name: 'Dusty Mauve', hex: '#C090B4' },
    ],
  },
  // Neutrals. The Project Colour Palette frame has none, but the old palettes
  // did (BuildPro carried seven) and several surfaces need one — most of all
  // ScheduleColorPicker, where #9B9B9B is not just a colour but the "no colour
  // set" sentinel it also excludes from its auto-assign pool. Stone is ΔE 8.7
  // from that sentinel and is the intended replacement when that picker moves.
  //
  // Taken from the "1 — Colour Tokens" ramp in the same Figma file, so these
  // are the app's own neutrals rather than invented ones: Chalk = Grey-300,
  // Stone = Grey-400, Graphite = Grey-500. Named in the palette's own style
  // because that is what the picker shows.
  //
  // Only these three are usable as entity colours. White and Grey-100/200 are
  // surface tokens (--background, --sidebar, --border) and vanish against a
  // card; Grey-700 is --foreground and reads as text, not as a colour.
  //
  // Two things to fix upstream in Figma rather than here:
  //   • Grey-500 and Grey-600 are both #6B6560, and Grey-700 and Dark are both
  //     #2C2825 — two duplicate pairs in a nine-step ramp.
  //   • The ramp jumps ΔE 30 from Grey-300 (L* 86) to Grey-400 (L* 56) with
  //     nothing between, where every other step is ΔE 4–13. A mid step around
  //     L* 70 would even it out; deliberately not invented here.
  {
    group: 'Neutral',
    colors: [
      { name: 'Chalk',       hex: '#D8D7D4' },
      { name: 'Stone',       hex: '#8A8680' },
      { name: 'Graphite',    hex: '#6B6560' },
    ],
  },
];

export const MORADA_PALETTE: MoradaSwatch[] = MORADA_PALETTE_GROUPS.flatMap(g => g.colors);
export const MORADA_PALETTE_HEXES = MORADA_PALETTE.map(c => c.hex);

/** Look up a palette colour's name, for tooltips and a11y labels. */
export function moradaColorName(hex: string | null | undefined): string | undefined {
  if (!hex) return undefined;
  return MORADA_PALETTE.find(c => c.hex.toLowerCase() === hex.toLowerCase())?.name;
}

/** A palette colour at random — for seeding a new record's colour on create. */
export function randomPaletteColor(): string {
  return MORADA_PALETTE[Math.floor(Math.random() * MORADA_PALETTE.length)].hex;
}

/**
 * Stable colour for a contact/entity that has none set, so avatars vary
 * instead of every unset row rendering the same grey.
 */
export function paletteColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return MORADA_PALETTE[Math.abs(h) % MORADA_PALETTE.length].hex;
}

// Curated project-colour palette — the ONLY colours offered when picking a
// project colour (create dialog + project settings). Kept to 10 hues that
// harmonise with the Morada plum brand across web and mobile; other pickers
// (schedule, takeoff, focus blocks) still use the full BUILDPRO_PALETTE.
// Existing projects with legacy colours are untouched — renderers tint softly.
export const MORADA_PROJECT_PALETTE = [
  { name: 'Teal',       hex: '#70CAD0' },
  { name: 'Sage',       hex: '#82C8A2' },
  { name: 'Amber',      hex: '#D4B670' },
  { name: 'Coral',      hex: '#DA988A' },
  { name: 'Rose',       hex: '#D08AAF' },
  { name: 'Lavender',   hex: '#A68AC7' },
  { name: 'Plum',       hex: '#87749A' },
  { name: 'Slate blue', hex: '#597BC0' },
  { name: 'Terracotta', hex: '#C86840' },
  { name: 'Sand',       hex: '#C8B090' },
] as const;

export const MORADA_PROJECT_PALETTE_HEXES = MORADA_PROJECT_PALETTE.map(c => c.hex);

export const BUILDPRO_PALETTE = [
  // Purples
  { name: 'Mauve',       hex: '#d4b8ec' },
  { name: 'Lavender',    hex: '#a890d4' },
  { name: 'Lilac',       hex: '#c0a0e0' },
  { name: 'Violet',      hex: '#8868bc' },
  { name: 'Plum',        hex: '#6e4898' },
  // Pinks
  { name: 'Blush',       hex: '#f0b8c8' },
  { name: 'Rose',        hex: '#e088a8' },
  { name: 'Pink',        hex: '#d46890' },
  { name: 'Dusty rose',  hex: '#c07888' },
  { name: 'Berry',       hex: '#a85870' },
  // Blues
  { name: 'Periwinkle',  hex: '#90a0dc' },
  { name: 'Sky',         hex: '#70b0e8' },
  { name: 'Blue',        hex: '#4a90d4' },
  { name: 'Indigo',      hex: '#4464b8' },
  { name: 'Navy',        hex: '#385898' },
  // Teals
  { name: 'Seafoam',     hex: '#78c8c0' },
  { name: 'Teal',        hex: '#40a8b0' },
  { name: 'Cyan',        hex: '#58b8c8' },
  { name: 'Peacock',     hex: '#2890a0' },
  // Greens
  { name: 'Mint',        hex: '#90c8a8' },
  { name: 'Sage',        hex: '#68b088' },
  { name: 'Fern',        hex: '#78b870' },
  { name: 'Forest',      hex: '#488868' },
  { name: 'Olive',       hex: '#88a858' },
  // Ambers
  { name: 'Gold',        hex: '#e8c040' },
  { name: 'Amber',       hex: '#e8952a' },
  { name: 'Honey',       hex: '#d4a030' },
  { name: 'Mustard',     hex: '#c08820' },
  // Reds & Corals
  { name: 'Soft coral',  hex: '#f09090' },
  { name: 'Coral',       hex: '#e85b5b' },
  { name: 'Watermelon',  hex: '#e06878' },
  { name: 'Terracotta',  hex: '#c86840' },
  { name: 'Rust',        hex: '#b85838' },
  // Earth tones
  { name: 'Sand',        hex: '#c8b090' },
  { name: 'Taupe',       hex: '#b89878' },
  { name: 'Caramel',     hex: '#b07840' },
  { name: 'Mocha',       hex: '#906050' },
  // Soft greys
  { name: 'Cloud',       hex: '#e4e4e0' },
  { name: 'Silver',      hex: '#c8c8c4' },
  { name: 'Pebble',      hex: '#b0b0ac' },
  // Cool neutrals
  { name: 'Ash',         hex: '#a0a8b0' },
  { name: 'Slate',       hex: '#9b9b9b' },
  { name: 'Blue grey',   hex: '#8898a8' },
  { name: 'Charcoal',    hex: '#707070' },
];

export const BUILDPRO_PALETTE_HEXES = BUILDPRO_PALETTE.map(c => c.hex);
