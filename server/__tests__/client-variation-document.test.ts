/**
 * The variation document sent to the phone app (server/clientVariationDocument.ts).
 *
 * Two things matter: it is the web's own document model (so the rows add up
 * to the Total, to the cent), and a column the builder hides never leaves the
 * server — not even as a zero.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/client-variation-document.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { buildClientVariationDocument } from "../clientVariationDocument";
import { projectClientVariationItems } from "../clientProjections";
import { DEFAULT_VARIATION_DOCUMENT_COLUMNS } from "@shared/variationDocumentColumns";
import { computeVariationTotals } from "@shared/variationTotals";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Two materials lines, a labour line, and one line hidden from the client.
const rawItems = [
  { id: "a", name: "Skylight", type: "Material", quantity: 1, unitPrice: 120000, totalPrice: 120000, unitCostExTax: 900, markupPercent: 25, taxable: true, showInPdf: true },
  { id: "b", name: "Flashing", type: "Material", quantity: 3, unitPrice: 3333, totalPrice: 9999, unitCostExTax: 25, markupPercent: 25, taxable: true, showInPdf: true },
  { id: "c", name: "Install", type: "Labour", quantity: 6, unitPrice: 9500, totalPrice: 57000, unitCostExTax: 75, markupPercent: 20, taxable: true, showInPdf: true },
  { id: "d", name: "Crane", type: "Equipment", quantity: 1, unitPrice: 40000, totalPrice: 40000, unitCostExTax: 350, taxable: true, showInPdf: false },
];

function payloadFor(columns = DEFAULT_VARIATION_DOCUMENT_COLUMNS) {
  const totals = computeVariationTotals({ items: rawItems as any });
  const hidden = rawItems.filter((i) => i.showInPdf === false);
  return {
    variation: { id: "v1", totalAmount: totals.totalCents, subtotal: totals.subtotalCents, gstAmount: totals.gstCents, globalMarkupAmount: 0 },
    items: projectClientVariationItems(rawItems, columns),
    bills: [],
    labourTotalCents: 0,
    notItemisedIncCents: computeVariationTotals({ items: hidden as any }).totalCents,
    columns,
  };
}

check("visible rows plus 'not itemised' add up to the Total, to the cent", () => {
  const doc = buildClientVariationDocument(payloadFor());
  const rows = doc.groups.reduce((s, g) => s + g.totalIncCents, 0) + doc.notItemisedIncCents + doc.globalMarkupIncCents;
  assert.strictEqual(rows, doc.totalCents);
  assert.ok(doc.notItemisedIncCents > 0, "the hidden crane line is still a charge");
});

check("hidden lines never appear as rows", () => {
  const doc = buildClientVariationDocument(payloadFor());
  assert.deepStrictEqual(doc.lines.map((l) => l.id), ["a", "b", "c"]);
});

check("groups by trade with the web's labels", () => {
  const doc = buildClientVariationDocument(payloadFor());
  assert.deepStrictEqual(doc.groups.map((g) => g.label), ["Materials", "Labour"]);
  assert.strictEqual(doc.grouped, DEFAULT_VARIATION_DOCUMENT_COLUMNS.grouping);
});

check("by default no cost or markup field is sent at all — not even as zero", () => {
  const doc = buildClientVariationDocument(payloadFor());
  for (const line of doc.lines) {
    assert.ok(!("unitCostExCents" in line), "unit cost must not be sent");
    assert.ok(!("markupPercent" in line), "markup % must not be sent");
    assert.ok(!("markupAmountExCents" in line), "markup amount must not be sent");
  }
});

check("a column switched off is absent; one switched on is present", () => {
  const cols = { ...DEFAULT_VARIATION_DOCUMENT_COLUMNS, quantity: false, amountInc: true, unitPriceInc: false };
  const doc = buildClientVariationDocument(payloadFor(cols));
  const line = doc.lines[0];
  assert.ok(!("quantity" in line));
  assert.ok(!("unitPriceIncCents" in line));
  assert.strictEqual(typeof line.amountIncCents, "number");
});

console.log(`\nclient-variation-document: ${passed} passed`);
