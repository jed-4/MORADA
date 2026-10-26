/**
 * Bulk edit and price-list linking on estimate TEMPLATES.
 *
 * A template line and an estimate line are the same idea stored differently:
 * different field names, and money in cents rather than dollars. Both features
 * reuse the estimate page's components, so everything they hand over arrives
 * in ESTIMATE-ITEM terms and has to be translated. These pin the translation
 * and the one rule that is enforced on the server for estimates and has to be
 * enforced here instead, because a template has no server.
 */
import assert from "node:assert/strict";
import { toTemplatePatch, unlinkIfRepriced, type TemplateItem } from "../TemplateEstimateGrid";

let passed = 0;
const check = (_label: string, fn: () => void) => { fn(); passed++; };

const costCodes = [{ id: "cc-1", code: "4-10", title: "Carpentry" }] as any[];

const line = (over: Partial<TemplateItem> = {}): TemplateItem => ({
  id: "i1", name: "Stud wall", sortOrder: 0, isGroup: false,
  unitPrice: 5000, unit: "m2", quantity: 1, markup: 10, type: "Material",
  ...over,
});

// --- the patch a bulk edit hands over --------------------------------------

check("a bulk cost is translated from dollars to cents", () => {
  // The estimate page works in dollars; a template stores cents. Getting this
  // wrong is a 100x error in a builder's cost.
  assert.deepEqual(toTemplatePatch({ unitCostExTax: 12.34 }, costCodes), { unitPrice: 1234 });
});

check("field names are translated, not passed through", () => {
  assert.deepEqual(toTemplatePatch({ unitType: "lm" }, costCodes), { unit: "lm" });
  assert.deepEqual(toTemplatePatch({ markupPercent: 15 }, costCodes), { markup: 15 });
});

check("a cost code carries its title across for display", () => {
  assert.deepEqual(toTemplatePatch({ costCode: "cc-1" }, costCodes),
    { costCodeId: "cc-1", costCodeTitle: "4-10 - Carpentry" });
});

check("fields a template has no room for are dropped", () => {
  // status and notes are estimate-only: a template has no workflow.
  assert.deepEqual(toTemplatePatch({ status: "done", notes: "x" }, costCodes), {});
});

check("an untouched field is never written", () => {
  // The patch must carry only what the menu actually set, or a bulk edit of
  // one field would blank every other field on every selected line.
  assert.deepEqual(toTemplatePatch({}, costCodes), {});
});

// --- the link, and when it breaks -------------------------------------------

check("typing a new cost takes the line off the catalogue", () => {
  const existing = line({ priceListItemId: "pl-1", unitPrice: 5000 });
  const patch = toTemplatePatch({ unitCostExTax: 60 }, costCodes);
  assert.deepEqual(unlinkIfRepriced(existing, patch, { unitCostExTax: 60 }), { priceListItemId: null });
});

check("picking from the catalogue does NOT unlink — that IS the link", () => {
  // Cost and link are written together, so the cost change must not undo it.
  const existing = line({ priceListItemId: "pl-1", unitPrice: 5000 });
  const data = { unitCostExTax: 60, priceListItemId: "pl-2" };
  assert.deepEqual(unlinkIfRepriced(existing, toTemplatePatch(data, costCodes), data), {});
});

check("re-saving the same cost keeps the link", () => {
  const existing = line({ priceListItemId: "pl-1", unitPrice: 5000 });
  const patch = toTemplatePatch({ unitCostExTax: 50 }, costCodes);
  assert.deepEqual(unlinkIfRepriced(existing, patch, { unitCostExTax: 50 }), {},
    "an unchanged cost is not a reprice");
});

check("editing anything else keeps the link", () => {
  const existing = line({ priceListItemId: "pl-1" });
  for (const data of [{ name: "Renamed" }, { quantity: 9 }, { markupPercent: 20 }, { unitType: "lm" }]) {
    assert.deepEqual(unlinkIfRepriced(existing, toTemplatePatch(data, costCodes), data), {},
      `${Object.keys(data)[0]} should not unlink`);
  }
});

check("an unlinked line is left alone", () => {
  const existing = line({ priceListItemId: undefined, unitPrice: 5000 });
  assert.deepEqual(unlinkIfRepriced(existing, toTemplatePatch({ unitCostExTax: 99 }, costCodes),
    { unitCostExTax: 99 }), {}, "there is no link to clear");
});

console.log(`template bulk edit + price link: ${passed} passed, 0 failed`);
