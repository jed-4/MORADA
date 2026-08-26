// Audit every stored colour hex against the palettes in client/src/lib/colors.ts.
//
//   node --env-file-if-exists=.env scripts/audit-color-usage.mjs
//   node --env-file-if-exists=.env scripts/audit-color-usage.mjs --json > audit.json
//
// Reports, per column: how many rows carry a colour, how many distinct values,
// and how many of those values are NOT in the Morada palette (i.e. would stop
// being re-selectable if that surface's picker switched).

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const sql = neon(url);
const asJson = process.argv.includes("--json");

// Parse the palettes straight out of the source so this can never drift.
const src = readFileSync(new URL("../client/src/lib/colors.ts", import.meta.url), "utf8");
function slice(decl) {
  const i = src.indexOf(decl);
  let j = src.indexOf("[", src.indexOf("=", i)), depth = 0, k = j;
  for (;;) {
    if (src[k] === "[") depth++;
    else if (src[k] === "]" && --depth === 0) break;
    k++;
  }
  return src.slice(j, k + 1);
}
const hexes = (seg) => [...seg.matchAll(/hex:\s*'(#[0-9A-Fa-f]{6})'/g)].map(m => m[1].toUpperCase());

const MORADA   = new Set(hexes(slice("export const MORADA_PALETTE_GROUPS")));
const BUILDPRO = new Set(hexes(slice("export const BUILDPRO_PALETTE")));
const PROJECT  = new Set(hexes(slice("export const MORADA_PROJECT_PALETTE")));

// column -> which picker feeds it today (see the consumer grep in colors.ts)
const TARGETS = [
  ["contacts",               "avatar_color",         "contacts picker (already Morada)"],
  ["contacts",               "schedule_color",       "ScheduleColorPicker → BuildPro"],
  ["schedule_items",         "color",                "ScheduleColorPicker → BuildPro"],
  ["schedule_items",         "assigned_to_color",    "mirror of contacts.schedule_color"],
  ["schedules",              "business_assign_color","ScheduleColorPicker → BuildPro"],
  ["focus_blocks",           "color",                "FocusBlockCreator → Morada"],
  ["takeoff_measurements",   "color",                "TakeoffColorPicker → BuildPro (held: contrast)"],
  ["takeoff_markups",        "color",                "TakeoffColorPicker → BuildPro (held: contrast)"],
  ["task_tags",              "color",                "TaskSettings → Morada"],
  ["task_templates",         "color",                "TaskSettings → Morada"],
  ["task_template_statuses", "color",                "TaskSettings → Morada"],
  ["field_options",          "color",                "FieldSettings → Morada"],
  ["custom_field_options",   "color",                "Settings → Morada"],
  ["supplier_labels",        "color",                "Settings → Morada"],
  ["teams",                  "color",                "Settings → Morada"],
  ["note_groups",            "color",                "unmapped"],
  ["system_folders",         "color",                "unmapped"],
  ["price_lists",            "colour",               "unmapped"],
  ["price_list_groups",      "colour",               "unmapped"],
  ["hbcf_projects",          "color",                "unmapped"],
  ["projects",               "color",                "ProjectSettings → Morada"],
];

const results = [];
for (const [table, column, picker] of TARGETS) {
  try {
    const rows = await sql(
      `SELECT upper(${column}) AS hex, count(*)::int AS n
         FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''
        GROUP BY 1 ORDER BY 2 DESC`
    );
    const total = rows.reduce((a, r) => a + r.n, 0);
    const values = rows.map(r => r.hex);
    const offPalette = rows.filter(r => !MORADA.has(r.hex));
    results.push({
      table, column, picker, rows: total, distinct: values.length,
      inMorada:   values.filter(h => MORADA.has(h)).length,
      inBuildpro: values.filter(h => BUILDPRO.has(h)).length,
      inProject:  values.filter(h => PROJECT.has(h)).length,
      offPaletteRows: offPalette.reduce((a, r) => a + r.n, 0),
      offPaletteValues: offPalette.map(r => `${r.hex}×${r.n}`),
    });
  } catch (e) {
    results.push({ table, column, picker, error: e.message.split("\n")[0] });
  }
}

if (asJson) { console.log(JSON.stringify(results, null, 1)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("table.column", 36), pad("rows", 6), pad("distinct", 9), pad("off-palette", 12), "picker");
console.log("-".repeat(110));
let totalRows = 0, totalOff = 0;
for (const r of results) {
  if (r.error) { console.log(pad(`${r.table}.${r.column}`, 36), "ERROR:", r.error); continue; }
  totalRows += r.rows; totalOff += r.offPaletteRows;
  console.log(
    pad(`${r.table}.${r.column}`, 36), pad(r.rows, 6), pad(r.distinct, 9),
    pad(`${r.offPaletteRows} rows / ${r.distinct - r.inMorada} vals`, 12), r.picker
  );
}
console.log("-".repeat(110));
console.log(`TOTAL ${totalRows} coloured rows, ${totalOff} of them off the Morada palette`);
console.log("\nOff-palette values by column:");
for (const r of results) {
  if (r.error || !r.offPaletteValues?.length) continue;
  console.log(`  ${r.table}.${r.column}: ${r.offPaletteValues.join(", ")}`);
}
