// What are the 617 coloured field_options actually for?
//
//   node --env-file-if-exists=.env scripts/inspect-field-option-colors.mjs
//
// Groups by category so it is visible whether a colour carries meaning (red =
// blocked, green = done) or is just decoration. That decides whether a remap
// can be mechanical or has to be authored per option.

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const sql = neon(url);

const rows = await sql`
  SELECT c.label AS category, o.name AS option, upper(o.color) AS color,
         o.is_completed, o.is_actionable, o.system_phase, count(*)::int AS n
    FROM field_options o
    JOIN field_categories c ON c.id = o.category_id
   WHERE o.color IS NOT NULL AND o.color <> ''
   GROUP BY 1,2,3,4,5,6
   ORDER BY 1,2`;

const byCat = new Map();
for (const r of rows) {
  if (!byCat.has(r.category)) byCat.set(r.category, []);
  byCat.get(r.category).push(r);
}

console.log(`${rows.length} distinct (category, option, colour) combinations across ${byCat.size} categories\n`);
for (const [cat, opts] of [...byCat].sort((a, b) => b[1].length - a[1].length)) {
  const total = opts.reduce((a, o) => a + o.n, 0);
  console.log(`${cat}  —  ${opts.length} options, ${total} rows`);
  for (const o of opts.slice(0, 14)) {
    const flags = [o.is_completed && "completed", o.is_actionable && "actionable", o.system_phase]
      .filter(Boolean).join(" ");
    console.log(`   ${o.color}  ${String(o.n).padStart(3)}×  ${o.option}${flags ? "   [" + flags + "]" : ""}`);
  }
  if (opts.length > 14) console.log(`   … ${opts.length - 14} more`);
  console.log();
}

// Does one colour mean one thing, or many?
const meaning = new Map();
for (const r of rows) {
  if (!meaning.has(r.color)) meaning.set(r.color, new Set());
  meaning.get(r.color).add(r.option.toLowerCase());
}
console.log("Colour → distinct option names it is used for:");
for (const [c, names] of [...meaning].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${c}  ${names.size} name(s): ${[...names].slice(0, 6).join(", ")}${names.size > 6 ? " …" : ""}`);
}
