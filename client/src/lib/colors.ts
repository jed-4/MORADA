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
