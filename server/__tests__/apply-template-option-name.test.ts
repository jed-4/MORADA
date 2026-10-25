/**
 * A template option saved with no name must not land on the job with no name.
 *
 * Before 2026-09-13 a template option could be saved blank. The write-through
 * to `products` skips a blank name, so a template whose only option is blank
 * has no option rows and /apply falls back to the templateData blob — which
 * copied "" into selection_options.name. The job showed an option card with
 * just the brand, and an Edit dialog with an empty Option Name.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/apply-template-option-name.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { buildFlatApplyRows, buildLegacyApplyRows, optionNameOrFallback } from "../../shared/applyTemplate";
import { extractTemplateOptions } from "../../shared/templateOptions";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.message ?? err}`);
    process.exitCode = 1;
  }
}

let n = 0;
const ctx = { projectId: "p1", selectionType: "selection", newId: () => `id-${++n}` };

// The shape Jed's template had: the template's name says what the product is,
// and its one option carries only a brand and a link.
const berkshireOption = {
  name: "",
  brand: "Dulux",
  quantity: 1,
  unitType: "ea",
  url: "https://www.dulux.com.au/colour/whites-and-neutrals/berkshire-white/",
};

check("the blank option is what the product sync skips — so apply reads the blob", () => {
  const { options, warnings } = extractTemplateOptions({ templateData: [berkshireOption] } as any);
  assert.strictEqual(options.length, 0);
  assert.ok(warnings.some((w) => /no name/.test(w.reason)));
});

check("flat template: a blank option takes the template's name", () => {
  const rows = buildFlatApplyRows({ name: "Paint - General Dulux Berkshire" }, [berkshireOption], 0, ctx);
  assert.strictEqual(rows.options[0].name, "Paint - General Dulux Berkshire");
  assert.strictEqual(rows.options[0].brand, "Dulux");
  assert.strictEqual(rows.options[0].url, berkshireOption.url);
});

check("legacy template: a blank option takes its item's name", () => {
  const rows = buildLegacyApplyRows(
    [{ itemName: "Wall paint", options: [{ name: "   " }, { name: "Lexicon" }] }],
    ctx,
  );
  assert.deepStrictEqual(rows.options.map((o) => o.name), ["Wall paint", "Lexicon"]);
});

check("a named option is passed through untouched", () => {
  const rows = buildFlatApplyRows({ name: "Paint" }, [{ name: " Berkshire White " }], 0, ctx);
  assert.strictEqual(rows.options[0].name, " Berkshire White ");
});

check("no name anywhere still never writes a blank", () => {
  assert.strictEqual(optionNameOrFallback("", ""), "Untitled option");
  assert.strictEqual(optionNameOrFallback(undefined, null), "Untitled option");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
