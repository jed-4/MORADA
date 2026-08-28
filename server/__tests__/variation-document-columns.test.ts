/**
 * Variation document column config — pure functions over
 * shared/variationDocumentColumns.ts. No DB, no server.
 *
 * The two properties worth locking down are both about NOT leaking:
 *
 *   1. Widening the column set must not retroactively expose a column on a
 *      document saved before that column existed. A variation saved under the
 *      0060 config has no stored value for unitCost or markup, and those must
 *      resolve to hidden. Defaulting missing keys to "visible" would have put
 *      every builder's cost prices in front of every client the moment this
 *      shipped.
 *   2. Nothing that reveals margin may default to on.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/variation-document-columns.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  DEFAULT_VARIATION_DOCUMENT_COLUMNS,
  MARGIN_REVEALING_COLUMNS,
  normaliseVariationColumnTemplates,
  normaliseVariationDocumentColumns,
  resolveVariationDocumentColumns,
  variationColumnsEqual,
} from "@shared/variationDocumentColumns";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

check("no margin-revealing column is visible by default", () => {
  assert.ok(MARGIN_REVEALING_COLUMNS.length > 0, "expected some to be flagged");
  for (const key of MARGIN_REVEALING_COLUMNS) {
    assert.strictEqual(
      DEFAULT_VARIATION_DOCUMENT_COLUMNS[key],
      false,
      `${key} must default to hidden`,
    );
  }
});

check("a config saved before the set widened does not expose the new columns", () => {
  // Exactly what migration 0060 stored.
  const legacy = { quantity: true, unitPrice: true, grouping: true, bills: true, contractSummary: true };
  const resolved = normaliseVariationDocumentColumns(legacy);
  assert.strictEqual(resolved.quantity, true, "explicit choice must survive");
  assert.strictEqual(resolved.unitPrice, true, "explicit choice must survive");
  assert.strictEqual(resolved.unitCost, false);
  assert.strictEqual(resolved.markupPercent, false);
  assert.strictEqual(resolved.markupAmount, false);
});

check("an explicit false is never upgraded to visible", () => {
  const resolved = normaliseVariationDocumentColumns({ unitPrice: false, description: false });
  assert.strictEqual(resolved.unitPrice, false);
  assert.strictEqual(resolved.description, false);
});

check("an explicit true on a margin column is honoured when asked for", () => {
  const resolved = normaliseVariationDocumentColumns({ unitCost: true, markupAmount: true });
  assert.strictEqual(resolved.unitCost, true);
  assert.strictEqual(resolved.markupAmount, true);
});

check("garbage resolves to the defaults rather than throwing", () => {
  for (const bad of [null, undefined, 42, "nope", [], { unitCost: "yes" }]) {
    const resolved = normaliseVariationDocumentColumns(bad);
    assert.deepStrictEqual(resolved, DEFAULT_VARIATION_DOCUMENT_COLUMNS);
  }
});

check("the per-variation choice beats the company default", () => {
  const resolved = resolveVariationDocumentColumns({ unitPrice: false }, { unitPrice: true });
  assert.strictEqual(resolved.unitPrice, false);
});

check("the company default applies when the variation has made no choice", () => {
  const resolved = resolveVariationDocumentColumns(null, { unitCost: true });
  assert.strictEqual(resolved.unitCost, true);
});

check("templates: malformed rows are dropped, not rendered", () => {
  const templates = normaliseVariationColumnTemplates([
    { id: "a", name: "Detailed", columns: { unitCost: true } },
    { id: "b" },                       // no name
    { name: "no id" },                 // no id
    null,
    "nope",
    { id: "c", name: "Lean", columns: null },
  ]);
  assert.strictEqual(templates.length, 2);
  assert.deepStrictEqual(templates.map((t) => t.name), ["Detailed", "Lean"]);
  assert.strictEqual(templates[0].columns.unitCost, true);
  // A template with no stored columns still resolves to a complete, safe config.
  assert.strictEqual(templates[1].columns.unitCost, false);
});

check("templates: a non-array is an empty list", () => {
  for (const bad of [null, undefined, {}, "x", 7]) {
    assert.deepStrictEqual(normaliseVariationColumnTemplates(bad), []);
  }
});

check("variationColumnsEqual compares every key", () => {
  const a = { ...DEFAULT_VARIATION_DOCUMENT_COLUMNS };
  const b = { ...DEFAULT_VARIATION_DOCUMENT_COLUMNS };
  assert.ok(variationColumnsEqual(a, b));
  b.costCode = !b.costCode;
  assert.ok(!variationColumnsEqual(a, b), "a single differing key must not compare equal");
});

console.log(`\nvariation-document-columns: ${passed} checks passed\n`);
