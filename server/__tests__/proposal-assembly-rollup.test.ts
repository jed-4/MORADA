/**
 * An assembly line prints its components' total on the proposal — and no
 * figure counts it twice.
 *
 * The assembly line carries no money of its own (shared/assemblies.ts); its
 * components do, and they drop in hidden from the client. Without the roll-up
 * the client's one visible line would print $0.00 — and with a careless one,
 * the group subtotal would add the components AND the rolled-up line.
 *
 * Run:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/proposal-assembly-rollup.test.ts
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ProposalDocument } from "../../client/src/components/proposals/pdf/ProposalDocument";
import { clientLineAmounts } from "../../shared/proposalTotals";
import { computeEstimateSummary, round2 } from "../../shared/pricing";

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { console.error(`  ✗ ${name}`); throw err; }
}

const money = (n: number) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const GROUPS = [{ id: "g1", estimateId: "e1", name: "Slab", description: null, parentGroupId: null, order: 0, proposalVisible: true }];
const base = { estimateId: "e1", groupId: "g1", description: null, markupPercent: 0, wastagePercent: 0,
  shownAs: null, allowance: "None", priceIncTax: 0, taxAmount: 0 };
const ITEMS = [
  { ...base, id: "asm", name: "Slab Pour", quantity: 100, unitType: "m2", unitCostExTax: 0, order: 0,
    proposalVisible: true, assemblyId: "A1", parentItemId: null },
  { ...base, id: "c1", name: "Concrete 25MPa", quantity: 10.5, unitType: "m3", unitCostExTax: 285, order: 0,
    proposalVisible: false, parentItemId: "asm", assemblyQtyMode: "per_unit", assemblyQtyFactor: 0.105 },
  { ...base, id: "c2", name: "SL82 mesh", quantity: 110, unitType: "m2", unitCostExTax: 9.4, order: 1,
    proposalVisible: false, parentItemId: "asm", assemblyQtyMode: "per_unit", assemblyQtyFactor: 1.1 },
  { ...base, id: "c3", name: "Pump hire", quantity: 1, unitType: "each", unitCostExTax: 1100, order: 2,
    proposalVisible: false, parentItemId: "asm", assemblyQtyMode: "fixed", assemblyQtyFactor: 1 },
  { ...base, id: "x", name: "Termite barrier", quantity: 1, unitType: "item", unitCostExTax: 900, order: 1,
    proposalVisible: true, parentItemId: null },
];
const ESTIMATE = { id: "e1", projectMarkupPercent: 25, taxRate: 10 };
const opts = { projectMarkupPercent: 25, taxRate: 10 };

const assemblyInc = round2(["c1", "c2", "c3"].reduce(
  (s, id) => s + clientLineAmounts(ITEMS.find((i) => i.id === id) as any, opts).incTax, 0));
const termiteInc = clientLineAmounts(ITEMS.find((i) => i.id === "x") as any, opts).incTax;
const estimateTotal = computeEstimateSummary(ITEMS as any, opts).total;

async function renderText(toggles: Record<string, unknown>) {
  const proposal = {
    id: "p1", proposalNumber: "PROP-T", name: "T", projectId: "x", estimateId: "e1",
    subtotal: 0, gstAmount: 0, totalAmount: 0, status: "draft", showPricing: true, layoutSettings: {},
  };
  const sections = [{
    id: "s-est", proposalId: "p1", sectionType: "estimate", name: "Estimate", order: 0, isEnabled: true,
    content: { columnToggles: toggles }, description: null, descriptionHtml: null, showPricing: true, showSubtotal: true,
  }];
  const buf = await renderToBuffer(createElement(ProposalDocument as any, {
    proposal, sections, companyName: "L",
    estimatesData: { e1: { estimate: ESTIMATE, groups: GROUPS, items: ITEMS } },
  }));
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += " " + c.items.map((x: any) => x.str).join(" ");
  }
  // pdf.js sometimes splits a figure into runs at the decimal point or the
  // thousands comma ("$7 ,048 .94"), so rejoin before matching.
  return text.replace(/\s+/g, " ").replace(/(\d) ([.,]\d)/g, "$1$2");
}

const AMOUNTS_ON = {
  description: true, quantity: true, unit: true, unitCostExTax: false, unitCostIncTax: true, markup: false,
  amountExTax: false, amountIncTax: true, showSubtotals: true, showZeroLines: false, showColumnHeader: true,
};

console.log("proposal assembly roll-up");

await check("the assembly row prints its components' total, not $0.00", async () => {
  const t = await renderText(AMOUNTS_ON);
  assert.ok(t.includes("Slab Pour"), "the assembly line prints");
  assert.ok(t.includes(money(assemblyInc)), `expected ${money(assemblyInc)} on the Slab Pour row — got: ${t.slice(0, 500)}`);
});

await check("its unit column is the components' cost per m², like any line's unit cost", async () => {
  const t = await renderText(AMOUNTS_ON);
  // Cost ex GST: 10.5 × 285 + 110 × 9.40 + 1 100 = 5 126.50 → 51.265 / m²; inc GST ×1.1 = 56.39
  assert.ok(t.includes("$56.39"), `expected the cost rate $56.39 inc GST — got: ${t.slice(0, 500)}`);
});

await check("hidden components do not print", async () => {
  const t = await renderText(AMOUNTS_ON);
  for (const name of ["Concrete 25MPa", "SL82 mesh", "Pump hire"]) assert.ok(!t.includes(name), `${name} printed`);
});

await check("the group total and estimate total count the assembly once", async () => {
  const t = await renderText(AMOUNTS_ON);
  const groupTotal = round2(assemblyInc + termiteInc);
  assert.ok(t.includes(money(groupTotal)), `expected group total ${money(groupTotal)}`);
  assert.ok(!t.includes(money(round2(groupTotal + assemblyInc))), "group total counted the assembly twice");
  assert.ok(t.includes(money(estimateTotal)), `expected estimate total ${money(estimateTotal)}`);
});

await check("with zero lines hidden, the assembly row still prints", async () => {
  // showZeroLines: false filters rows whose own amount is 0 — the assembly
  // line's own amount IS 0, so the filter must use the rolled-up figure.
  const t = await renderText({ ...AMOUNTS_ON, amountIncTax: false, quantity: false, unit: false, unitCostIncTax: false });
  assert.ok(t.includes("Slab Pour"), "the assembly line vanished as a $0 line");
});

console.log(`\n${passed} passed`);
