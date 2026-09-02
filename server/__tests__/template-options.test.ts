/**
 * Tests for shared/templateOptions.ts — the reader that lifts options out of
 * `selection_templates.templateData` for the Product Library backfill.
 *
 * This is the risky half of the migration: the blob has two live formats, ids
 * are often missing, and getting the key wrong means either duplicate products
 * on every re-run or silently overwriting the wrong row.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/template-options.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { extractTemplateOptions, isLegacyTemplateData } from "../../shared/templateOptions";

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

// ── Format detection ─────────────────────────────────────────────────────────

check("empty and non-array templateData yield nothing, not a crash", () => {
  for (const data of [undefined, null, [], {}, "nope", 7]) {
    const r = extractTemplateOptions({ templateData: data as any });
    assert.deepStrictEqual(r.options, []);
    assert.strictEqual(r.isLegacy, false);
  }
});

check("legacy detection matches the app's own `itemName in data[0]` test", () => {
  assert.strictEqual(isLegacyTemplateData([{ itemName: "Gutter profile", options: [] }]), true);
  assert.strictEqual(isLegacyTemplateData([{ name: "Quad" }]), false);
  assert.strictEqual(isLegacyTemplateData([]), false);
  // Only the FIRST entry is inspected — same as the app. A mixed array is read
  // as whatever data[0] is, and this test pins that rather than pretending the
  // reader is cleverer than the writer.
  assert.strictEqual(isLegacyTemplateData([{ name: "Quad" }, { itemName: "x" }]), false);
});

// ── Flat (new) format ────────────────────────────────────────────────────────

check("flat format reads each entry as an option", () => {
  const r = extractTemplateOptions({
    category: "Roofing",
    templateData: [
      { id: "opt-a", name: "Quad", brand: "Colorbond", sku: "QD-1", unitCost: 8450, unitType: "lm" },
      { name: "Half round", unitCost: 9900 },
    ],
  });
  assert.strictEqual(r.isLegacy, false);
  assert.strictEqual(r.options.length, 2);
  assert.strictEqual(r.options[0].templateOptionId, "opt-a");
  assert.strictEqual(r.options[0].name, "Quad");
  assert.strictEqual(r.options[0].defaultUnitCost, 8450);
  assert.strictEqual(r.options[0].unitType, "lm");
  // No id stored -> positional fallback at its index.
  assert.strictEqual(r.options[1].templateOptionId, "idx:1");
});

check("the template's category is inherited when the option names none", () => {
  const r = extractTemplateOptions({
    category: "Roofing",
    templateData: [{ name: "Quad" }, { name: "Ogee", category: "Guttering" }],
  });
  assert.strictEqual(r.options[0].category, "Roofing");
  assert.strictEqual(r.options[1].category, "Guttering");
});

// ── Legacy (itemName) format ─────────────────────────────────────────────────

check("legacy format walks items and flattens their options", () => {
  const r = extractTemplateOptions({
    category: "Fallback",
    templateData: [
      { itemName: "Gutter profile", categoryName: "Roofing", options: [{ name: "Quad" }, { name: "Half round" }] },
      { itemName: "Fascia colour", categoryName: "Roofing", options: [{ id: "o-9", name: "Monument" }] },
    ],
  });
  assert.strictEqual(r.isLegacy, true);
  assert.strictEqual(r.options.length, 3);
  assert.deepStrictEqual(
    r.options.map((o) => o.templateOptionId),
    ["idx:0/0", "idx:0/1", "o-9"],
  );
  // categoryName wins over the template's own category.
  assert.strictEqual(r.options[0].category, "Roofing");
});

check("legacy items with no options contribute nothing and do not shift indices", () => {
  const r = extractTemplateOptions({
    templateData: [
      { itemName: "Empty", options: [] },
      { itemName: "Has one", options: [{ name: "Quad" }] },
    ],
  });
  assert.strictEqual(r.options.length, 1);
  // Index reflects the item's real position, so adding options to "Empty"
  // later cannot renumber this one.
  assert.strictEqual(r.options[0].templateOptionId, "idx:1/0");
});

check("legacy falls back to itemName, then the template category, for grouping", () => {
  const r = extractTemplateOptions({
    category: "Template cat",
    templateData: [
      { itemName: "Gutter profile", options: [{ name: "Quad" }] },
      { options: [{ name: "Orphan" }], itemName: "" },
    ],
  });
  assert.strictEqual(r.options[0].category, "Gutter profile");
  assert.strictEqual(r.options[1].category, "Template cat");
});

// ── Keys are stable and unique, which is what makes a re-run safe ────────────

check("keys are unique within a template in both formats", () => {
  const flat = extractTemplateOptions({
    templateData: [{ name: "A" }, { name: "B" }, { name: "C" }],
  });
  const legacy = extractTemplateOptions({
    templateData: [
      { itemName: "i0", options: [{ name: "A" }, { name: "B" }] },
      { itemName: "i1", options: [{ name: "A" }] },
    ],
  });
  for (const r of [flat, legacy]) {
    const keys = r.options.map((o) => o.templateOptionId);
    assert.strictEqual(new Set(keys).size, keys.length, `duplicate key in ${keys.join(", ")}`);
  }
});

check("extraction is deterministic — the same blob twice gives the same keys", () => {
  const blob = {
    templateData: [
      { itemName: "i", options: [{ name: "A" }, { id: "keep", name: "B" }] },
    ],
  };
  const a = extractTemplateOptions(blob);
  const b = extractTemplateOptions(blob);
  assert.deepStrictEqual(
    a.options.map((o) => o.templateOptionId),
    b.options.map((o) => o.templateOptionId),
  );
});

check("a stored id survives reordering; a positional key does not", () => {
  const before = extractTemplateOptions({ templateData: [{ name: "A" }, { id: "stable", name: "B" }] });
  const after = extractTemplateOptions({ templateData: [{ id: "stable", name: "B" }, { name: "A" }] });
  const idOf = (r: typeof before, name: string) => r.options.find((o) => o.name === name)!.templateOptionId;
  assert.strictEqual(idOf(before, "B"), "stable");
  assert.strictEqual(idOf(after, "B"), "stable");
  // Documented limitation, not an accident: with no stored id the key is the
  // position, so reordering rewrites rows in place on the next run. Acceptable
  // while templateData is still the source of truth.
  assert.strictEqual(idOf(before, "A"), "idx:0");
  assert.strictEqual(idOf(after, "A"), "idx:1");
});

// ── Money ────────────────────────────────────────────────────────────────────

check("unitCost passes through as cents", () => {
  const r = extractTemplateOptions({ templateData: [{ name: "Quad", unitCost: 8450 }] });
  assert.strictEqual(r.options[0].defaultUnitCost, 8450);
});

check("a non-integer unitCost is refused and reported, never rounded", () => {
  const r = extractTemplateOptions({ templateData: [{ name: "Quad", unitCost: 84.5 }] });
  // 84.5 is dollars written into a cents field. Copying it would be a 100x
  // error; rounding it would invent a price. Neither is acceptable silently.
  assert.strictEqual(r.options[0].defaultUnitCost, null);
  assert.strictEqual(r.warnings.length, 1);
  assert.match(r.warnings[0].reason, /not a whole number of cents/);
});

check("missing, null and non-numeric unitCost all become null without warning", () => {
  const r = extractTemplateOptions({
    templateData: [{ name: "A" }, { name: "B", unitCost: null }, { name: "C", unitCost: "8450" }],
  });
  assert.deepStrictEqual(r.options.map((o) => o.defaultUnitCost), [null, null, null]);
  assert.strictEqual(r.warnings.length, 0);
});

check("zero is a real price, not a missing one", () => {
  const r = extractTemplateOptions({ templateData: [{ name: "Included", unitCost: 0 }] });
  assert.strictEqual(r.options[0].defaultUnitCost, 0);
});

// ── Names and blanks ─────────────────────────────────────────────────────────

check("a nameless option is skipped and reported, since products.name is NOT NULL", () => {
  const r = extractTemplateOptions({
    templateData: [{ name: "Quad" }, { name: "   " }, { sku: "NO-NAME" }],
  });
  assert.strictEqual(r.options.length, 1);
  assert.strictEqual(r.warnings.length, 2);
  assert.deepStrictEqual(r.warnings.map((w) => w.templateOptionKey), ["idx:1", "idx:2"]);
});

check("blank strings become null rather than empty text", () => {
  const r = extractTemplateOptions({
    templateData: [{ name: "Quad", brand: "", sku: "  ", url: "", description: "" }],
  });
  const o = r.options[0];
  assert.strictEqual(o.brand, null);
  assert.strictEqual(o.sku, null);
  assert.strictEqual(o.url, null);
  assert.strictEqual(o.description, null);
});

check("names and codes are trimmed", () => {
  const r = extractTemplateOptions({ templateData: [{ name: "  Quad  ", sku: " QD-1 " }] });
  assert.strictEqual(r.options[0].name, "Quad");
  assert.strictEqual(r.options[0].sku, "QD-1");
});

// ── Images ───────────────────────────────────────────────────────────────────

check("imageUrl and imageUrls merge, de-duplicate, and keep their order", () => {
  const r = extractTemplateOptions({
    templateData: [{ name: "Quad", imageUrl: "/a.jpg", imageUrls: ["/a.jpg", "/b.jpg", "/c.jpg"] }],
  });
  assert.deepStrictEqual(r.options[0].imageUrls, ["/a.jpg", "/b.jpg", "/c.jpg"]);
});

check("image fields that are absent or malformed yield an empty list", () => {
  for (const opt of [{ name: "A" }, { name: "B", imageUrls: "not-an-array" }, { name: "C", imageUrl: 5 }]) {
    const r = extractTemplateOptions({ templateData: [opt as any] });
    assert.deepStrictEqual(r.options[0].imageUrls, []);
  }
});

// ── Hostile input ────────────────────────────────────────────────────────────

check("null entries and null option lists do not crash the walk", () => {
  const r = extractTemplateOptions({
    templateData: [{ itemName: "i", options: null }, null, { itemName: "j", options: [{ name: "Quad" }] }],
  });
  assert.strictEqual(r.options.length, 1);
  assert.strictEqual(r.options[0].templateOptionId, "idx:2/0");
});

// ── Per-use fields: the half that goes on selection_template_options ─────────
// These were dropped by the first draft of the extractor. Flipping /apply to
// read rows would then have silently substituted buildOption's defaults —
// including visibleToClient false -> true, which exposes an option the builder
// deliberately hid from the client, and gstInclusive true -> false, which is a
// money bug. Every one of them is pinned here.

check("every field /apply reads survives extraction", () => {
  const r = extractTemplateOptions({
    templateData: [{
      id: "o1", name: "Quad", brand: "Colorbond", sku: "QD-1", description: "150mm",
      category: "Guttering", subcategory: "Profiles", unitCost: 8450, unitType: "lm",
      url: "https://example.test/q", specifications: { finish: "Monument" },
      quantity: 12, markupPercent: 7.5, totalCost: 109_020,
      visibleToClient: false, gstInclusive: true, sortOrder: 3,
      imageUrls: ["/a.jpg"],
    }],
  });
  const o = r.options[0];
  assert.strictEqual(o.quantity, 12);
  assert.strictEqual(o.markupPercent, 7.5);
  assert.strictEqual(o.totalCost, 109_020);
  assert.strictEqual(o.visibleToClient, false);
  assert.strictEqual(o.gstInclusive, true);
  assert.strictEqual(o.sortOrder, 3);
  assert.deepStrictEqual(o.specifications, { finish: "Monument" });
});

check("visibleToClient false is preserved, never widened to null", () => {
  // The disclosure case. `|| null` here would hide the builder's intent and
  // /apply would default it back to true — showing the client an option that
  // was deliberately withheld.
  const r = extractTemplateOptions({ templateData: [{ name: "Hidden", visibleToClient: false }] });
  assert.strictEqual(r.options[0].visibleToClient, false);
});

check("absent booleans stay null so /apply applies its own default", () => {
  const r = extractTemplateOptions({ templateData: [{ name: "Plain" }] });
  assert.strictEqual(r.options[0].visibleToClient, null);
  assert.strictEqual(r.options[0].gstInclusive, null);
  // Null is not false. /apply turns null into true for visibleToClient and
  // false for gstInclusive; inventing a value here would pre-empt that.
});

check("zero quantity, zero markup and sortOrder 0 all survive", () => {
  const r = extractTemplateOptions({
    templateData: [{ name: "Zeroes", quantity: 0, markupPercent: 0, totalCost: 0, sortOrder: 0 }],
  });
  const o = r.options[0];
  assert.strictEqual(o.quantity, 0);
  assert.strictEqual(o.markupPercent, 0);
  assert.strictEqual(o.totalCost, 0);
  assert.strictEqual(o.sortOrder, 0);
});

check("non-numeric and non-boolean junk becomes null, not NaN or true", () => {
  const r = extractTemplateOptions({
    templateData: [{ name: "Junk", quantity: "12", markupPercent: NaN, visibleToClient: "yes", gstInclusive: 1 }],
  });
  const o = r.options[0];
  assert.strictEqual(o.quantity, null);
  assert.strictEqual(o.markupPercent, null);
  assert.strictEqual(o.visibleToClient, null);
  assert.strictEqual(o.gstInclusive, null);
});

check("specifications must be an object, not a string", () => {
  assert.strictEqual(extractTemplateOptions({ templateData: [{ name: "A", specifications: "finish: black" }] }).options[0].specifications, null);
  assert.strictEqual(extractTemplateOptions({ templateData: [{ name: "A" }] }).options[0].specifications, null);
});

check("legacy grouping is carried so items are not lost before they get a table", () => {
  const r = extractTemplateOptions({
    templateData: [
      { itemName: "Gutter profile", options: [{ name: "Quad" }] },
      { itemName: "Fascia colour", options: [{ name: "Monument" }] },
    ],
  });
  assert.deepStrictEqual(r.options.map((o) => [o.legacyItemIndex, o.legacyItemName]),
    [[0, "Gutter profile"], [1, "Fascia colour"]]);
});

check("the flat format carries no legacy grouping", () => {
  const r = extractTemplateOptions({ templateData: [{ name: "Quad" }] });
  assert.strictEqual(r.options[0].legacyItemIndex, null);
  assert.strictEqual(r.options[0].legacyItemName, null);
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.log("SOME TESTS FAILED");
