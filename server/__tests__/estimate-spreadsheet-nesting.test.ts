/**
 * The estimate spreadsheet round trip, where nesting used to be lost.
 *
 * The sheet had one flat `Group` column holding a section's own name, and
 * sub-items came out as ordinary rows. So exporting a nested estimate and
 * importing it back promoted every subsection to the top level and every
 * sub-item to a line of its own — silently, since the import reported success
 * either way. The export toast even said "Re-imports cleanly".
 *
 * Two additions fix it: `Group` carries a PATH, and a `Sub-item` column marks
 * a row as hanging under the one above it.
 */
import assert from "node:assert/strict";
import {
  ESTIMATE_EXPORT_HEADERS,
  ESTIMATE_IMPORT_EXAMPLE_ROW,
  ESTIMATE_IMPORT_EXAMPLE_SUB_ROW,
  formatGroupPath,
  linkSubItemRows,
  parseGroupPath,
} from "../../shared/import";

let passed = 0;
const check = (_label: string, fn: () => void) => { fn(); passed++; };

// --- section paths ----------------------------------------------------------

check("a path round-trips", () => {
  assert.equal(formatGroupPath(["Kitchen", "Joinery"]), "Kitchen > Joinery");
  assert.deepEqual(parseGroupPath("Kitchen > Joinery"), ["Kitchen", "Joinery"]);
});

check("a top-level section is just its name, so old sheets still read", () => {
  assert.equal(formatGroupPath(["Kitchen"]), "Kitchen");
  assert.deepEqual(parseGroupPath("Kitchen"), ["Kitchen"]);
});

check("spacing around the separator is forgiven", () => {
  for (const written of ["Kitchen>Joinery", "Kitchen > Joinery", "Kitchen  >  Joinery", " Kitchen>Joinery "]) {
    assert.deepEqual(parseGroupPath(written), ["Kitchen", "Joinery"], written);
  }
});

check("a stray or doubled separator never makes a nameless section", () => {
  assert.deepEqual(parseGroupPath("Kitchen >> Joinery"), ["Kitchen", "Joinery"]);
  assert.deepEqual(parseGroupPath("> Kitchen >"), ["Kitchen"]);
  assert.deepEqual(parseGroupPath(">>>"), []);
});

check("an ungrouped line stays ungrouped", () => {
  assert.deepEqual(parseGroupPath(""), []);
  assert.deepEqual(parseGroupPath(null), []);
  assert.deepEqual(parseGroupPath(undefined), []);
  assert.equal(formatGroupPath([]), "");
  assert.equal(formatGroupPath([null, "", undefined]), "");
});

check("depth is not capped", () => {
  const deep = ["A", "B", "C", "D"];
  assert.deepEqual(parseGroupPath(formatGroupPath(deep)), deep);
});

// --- sub-items --------------------------------------------------------------

check("a sub-item hangs under the row above it", () => {
  // rows: 0 parent, 1 sub, 2 parent
  const links = linkSubItemRows([false, true, false]);
  assert.deepEqual([...links.entries()], [[1, 0]]);
});

check("consecutive sub-items are siblings, not a chain", () => {
  // The data model allows exactly one level of sub-item, so row 2 must hang
  // off row 0 as well — not off row 1.
  const links = linkSubItemRows([false, true, true, false, true]);
  assert.deepEqual([...links.entries()], [[1, 0], [2, 0], [4, 3]]);
});

check("a sheet that opens with a sub-item imports it as an ordinary line", () => {
  // Nothing precedes it to hang under. Dropping the row would lose the line.
  const links = linkSubItemRows([true, true, false, true]);
  assert.equal(links.has(0), false, "the first row has no parent, so it stands alone");
  assert.deepEqual([...links.entries()], [[1, 0], [3, 2]]);
});

check("a sheet with no sub-items links nothing", () => {
  assert.equal(linkSubItemRows([false, false, false]).size, 0);
  assert.equal(linkSubItemRows([]).size, 0);
});

check("every parent index points at a non-sub-item row", () => {
  const flags = [false, true, true, false, false, true, true, true];
  for (const [child, parent] of linkSubItemRows(flags)) {
    assert.equal(flags[parent], false, `row ${child} hangs off sub-item row ${parent}`);
    assert.ok(parent < child, "a parent always precedes its sub-item");
  }
});

// --- the sheet itself -------------------------------------------------------

check("the blank template carries every column", () => {
  for (const row of [ESTIMATE_IMPORT_EXAMPLE_ROW, ESTIMATE_IMPORT_EXAMPLE_SUB_ROW]) {
    assert.deepEqual(Object.keys(row).sort(), [...ESTIMATE_EXPORT_HEADERS].sort());
  }
  assert.ok(ESTIMATE_EXPORT_HEADERS.includes("Sub-item"));
  assert.ok(ESTIMATE_EXPORT_HEADERS.includes("Group"));
});

check("the blank template demonstrates both conventions", () => {
  // They cannot be guessed from the column names, and this download is where
  // a builder starts from scratch.
  assert.deepEqual(parseGroupPath(String(ESTIMATE_IMPORT_EXAMPLE_ROW.Group)).length, 2,
    "the example Group shows a nested path");
  assert.equal(ESTIMATE_IMPORT_EXAMPLE_ROW["Sub-item"], "");
  assert.equal(ESTIMATE_IMPORT_EXAMPLE_SUB_ROW["Sub-item"], "Yes");
  // And the pair actually links when read back.
  const links = linkSubItemRows([false, true]);
  assert.deepEqual([...links.entries()], [[1, 0]]);
});

console.log(`estimate spreadsheet nesting: ${passed} passed, 0 failed`);
