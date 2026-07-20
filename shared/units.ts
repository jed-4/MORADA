// Unit-of-measure normalization for Morada.
//
// The COMPANY-CONFIGURABLE canonical unit list lives in Field Settings under
// the `estimate_item.unit` field category (ea, m, m², m³, item, hr, day, load,
// tonne, kg, set by default). The estimate grid already renders that list. This
// module is the shared primitive for the OTHER problem: deciding whether two
// free-text unit strings from different surfaces (estimate line, price-list
// item, takeoff measurement, template) mean the SAME unit, despite the five
// historical spellings that accumulated across the app (`ea` vs `each`, `m²` vs
// `m2` vs `sqm`, `m`/`lm`/`lin_m`, `hr` vs `hour`, `t` vs `tonne`, `l` vs
// `litre`). Use `normalizeUnit` for storage/matching and `unitsMatch` to compare.
//
// It maps known spelling variants to a stable lowercase token. Unknown units
// pass through (trimmed + lowercased) so nothing is silently lost — a company
// can add custom units in Field Settings and they still round-trip.

const UNIT_ALIASES: Record<string, string> = {
  // count
  ea: "ea", each: "ea", pcs: "ea", pc: "ea", unit: "ea", no: "ea", nr: "ea",
  item: "item", items: "item",
  // linear
  m: "m", lm: "m", lin_m: "m", linm: "m", lineal: "m", lineal_m: "m",
  linear: "m", linear_m: "m",
  // area
  m2: "m2", "m²": "m2", sqm: "m2", sq_m: "m2", sqmt: "m2",
  // volume
  m3: "m3", "m³": "m3", cubm: "m3", cubic_m: "m3",
  // time
  hr: "hr", hour: "hr", hours: "hr", hrs: "hr",
  day: "day", days: "day",
  wk: "wk", week: "wk", weeks: "wk",
  // bulk / batch
  load: "load", loads: "load", lot: "lot", lots: "lot",
  t: "tonne", tonne: "tonne", tonnes: "tonne", ton: "tonne",
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
  l: "litre", litre: "litre", litres: "litre", liter: "litre",
  liters: "litre", ltr: "litre",
  // groupings
  set: "set", sets: "set", pack: "pack", packs: "pack",
  pair: "pair", pairs: "pair",
};

/**
 * Normalize a free-text unit string to a stable lowercase token for matching.
 * Known spelling variants collapse to one token; unknown units pass through
 * (trimmed + lowercased) so custom company units still round-trip. Returns ""
 * for null/undefined/blank.
 */
export function normalizeUnit(raw: string | null | undefined): string {
  if (raw == null) return "";
  const cleaned = String(raw).trim();
  if (!cleaned) return "";
  const key = cleaned.toLowerCase().replace(/\s+/g, "_");
  return UNIT_ALIASES[key] ?? cleaned.toLowerCase();
}

/** True when two unit strings mean the same unit (spelling-insensitive). */
export function unitsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}
