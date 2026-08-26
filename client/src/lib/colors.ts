// ---------------------------------------------------------------------------
// MORADA_PALETTE — the canonical picker palette.
//
// Source: Figma "BUILDPRO" file, "Project Colour Palette" frame
// (node 1450:8706). 24 curated colours, all warm and muted, grouped the way
// they are grouped in the design. Hex values were read from the Figma node
// names, not sampled from a render — several swatches are drawn with an
// overlay, so sampling a screenshot gives values up to ~10% darker.
//
// This is the only entity palette. It replaced MORADA_PROJECT_PALETTE (10
// colours, project settings) and BUILDPRO_PALETTE (44, everything else), both
// deleted once no picker pointed at them. The one other palette in this file,
// MORADA_MARKUP_PALETTE, exists for a different medium — see its note.
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


// ---------------------------------------------------------------------------
// MORADA_MARKUP_PALETTE — takeoff only.
//
// Measurement and markup colours are strokes 1–3px wide drawn over PDF plans,
// not chrome sitting on app surfaces. They have to carry against white paper
// and stay tellable apart from one another; MORADA_PALETTE is warm and muted
// by design and cannot do that. Measured against white, only 5 of its 27
// colours reach 3:1 and 9 fall below 2:1.
//
// So these are derived from Morada hues rather than picked fresh: each keeps
// its source hue, takes 25% more chroma, and is darkened until it clears 4.5:1
// on white. The set was then chosen greedily for separation — every pair is at
// least ΔE 25 apart, which is what stops two measurements on one plan reading
// as the same colour. Names are plain drawing names; Blue, Indigo and Violet
// were the obvious picks and all three collided with the since-deleted
// BuildPro palette, hence Cobalt, Denim and Iris.
//
// The 4.5:1 target is for full-opacity strokes, which is how measurements are
// drawn. Two places composite instead — the in-progress guide line at 0.6 and
// some markup fills at 0.7 — and over white those land near 2.3:1 and 2.8:1.
// That is accepted: the guide line is a transient cursor affordance and the
// fills are large areas, neither of which is thin line work.
//
// Do NOT fold these into MORADA_PALETTE. At this saturation they would look
// wrong on a contact avatar or a status chip, which is exactly why the two
// sets are separate.
// ---------------------------------------------------------------------------
export const MORADA_MARKUP_PALETTE: MoradaSwatch[] = [
  { name: 'Ink',      hex: '#6C655F' },  // from Graphite #6B6560
  { name: 'Red',      hex: '#E22B3F' },  // from Rose Quartz #E8A0A8
  { name: 'Orange',   hex: '#CA4F19' },  // from Peach #E09878
  { name: 'Bronze',   hex: '#A96700' },  // from Amber #F0B964
  { name: 'Green',    hex: '#2A8645' },  // from Mint #96D4A8
  { name: 'Jade',     hex: '#2C8379' },  // from Seafoam #80C8C0
  { name: 'Cobalt',   hex: '#247DB0' },  // from Sky #80B8D8
  { name: 'Denim',    hex: '#4F73C8' },  // from Cornflower #7890C8
  { name: 'Iris',     hex: '#8860D1' },  // from Lavender #A890D4
  { name: 'Orchid',   hex: '#AE5898' },  // from Dusty Mauve #C090B4
  { name: 'Magenta',  hex: '#CF3F71' },  // from Mauve Rose #D484A0
];

export const MORADA_MARKUP_PALETTE_HEXES = MORADA_MARKUP_PALETTE.map(c => c.hex);

/** Name of a markup colour, for swatch tooltips in the takeoff picker. */
export function markupColorName(hex: string | null | undefined): string | undefined {
  if (!hex) return undefined;
  return MORADA_MARKUP_PALETTE.find(c => c.hex.toLowerCase() === hex.toLowerCase())?.name;
}

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

