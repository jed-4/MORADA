/**
 * "Show allowance pricing" in the proposal's Estimate section.
 *
 * Run:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/proposal-allowance-pricing.test.ts
 *
 * Jed: "tiles, I toggle the allowance pricing on, it shows in the allowance
 * line item, qty, unit ex inc tax, amount inc tax". Before this the only way to
 * price an allowance inside the estimate table was to switch the amount columns
 * on, which prices every line in the job.
 *
 * The figures matter more than the layout: an allowance quoted here at one
 * number and on the Allowances page at another is the failure to avoid. Since
 * #184 an allowance prints as ENTERED in the estimate — qty x unit cost inc
 * GST, no line markup, no builder's margin — so these expect the cost-based
 * figures, and the last check renders both sections together and requires them
 * to agree.
 */
import assert from "node:assert";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ProposalDocument } from "../../client/src/components/proposals/pdf/ProposalDocument";

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { console.error(`  ✗ ${name}`); throw err; }
}

const BASE_TOGGLES = {
  description: true, quantity: false, unit: false, markup: false,
  unitCostExTax: false, unitCostIncTax: false, amountExTax: false, amountIncTax: false,
  showSubtotals: true, showZeroLines: true, showColumnHeader: true, showAllowanceType: true,
};

const GROUPS = [
  { id: "g1", estimateId: "e1", name: "Bathroom", description: null, parentGroupId: null, order: 0, proposalVisible: true },
];
const item = (id: string, name: string, cost: number, qty: number, over: Record<string, unknown> = {}) => ({
  id, estimateId: "e1", groupId: "g1", name, description: null, quantity: qty, unitType: "m2",
  unitCostExTax: cost, markupPercent: 0, wastagePercent: 0, proposalVisible: true,
  shownAs: null, allowance: "None", order: 0, ...over,
});

/* Margin 25%, GST 10%. Allowance figures are the ESTIMATE's allowance: cost
   x 1.1 for GST and nothing else. The margin shows up only in the estimate's
   own total, which is why the last check pins that at the marked-up number. */
const ITEMS = [
  // 40 m2 at $80 = $3,200 cost → $4,000 ex, $4,400 inc; unit $100 ex / $110 inc.
  item("tiles", "Tiles", 80, 40, { allowance: "Prime Cost" }),
  // A provisional sum, quantity 1.
  item("plumb", "Plumbing rough-in", 2000, 1, { allowance: "Provisional Sum", unitType: "item" }),
  // An ordinary line: never priced by this toggle.
  item("labour", "Tiling labour", 1500, 1),
  // An allowance the builder chose not to price.
  item("quiet", "Tapware", 900, 1, { allowance: "Prime Cost", shownAs: "included" }),
];

async function renderText(toggles: Record<string, unknown>, showGst = true) {
  const proposal = {
    id: "p1", proposalNumber: "P", name: "T", projectId: "x", estimateId: "e1",
    subtotal: 0, gstAmount: 0, totalAmount: 0, status: "draft", showPricing: true,
    layoutSettings: { showGst },
  };
  const sections = [{
    id: "s1", proposalId: "p1", sectionType: "estimate", name: "Estimate", order: 0, isEnabled: true,
    content: { columnToggles: toggles }, description: null, descriptionHtml: null,
    showPricing: true, showSubtotal: true,
  }];
  const buf = await renderToBuffer(createElement(ProposalDocument as any, {
    proposal, sections, companyName: "L", showGst,
    estimatesData: { e1: { estimate: { id: "e1", projectMarkupPercent: 25, taxRate: 10 }, groups: GROUPS, items: ITEMS } },
  }));
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let t = "";
  for (let i = 1; i <= doc.numPages; i++) {
    t += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str).join(" ");
  }
  // pdf.js splits some figures at the decimal point.
  return t.replace(/\s+/g, " ").replace(/(\d) \.(\d)/g, "$1.$2");
}

await check("off by default: an allowance prints no figures", async () => {
  const t = await renderText(BASE_TOGGLES);
  assert.ok(t.includes("Tiles"), "the line still prints");
  assert.ok(!t.includes("$4,400.00"), `no pricing expected — got: ${t.slice(0, 300)}`);
});

await check("on: the allowance shows qty, the inc-GST rate and the amount", async () => {
  const t = await renderText({ ...BASE_TOGGLES, allowancePricing: true });
  assert.ok(t.includes("40 m2"), `quantity and unit — got: ${t.slice(0, 400)}`);
  assert.ok(t.includes("× $88.00"), "the inc-GST rate");
  assert.ok(t.includes("= $3,520.00"), "the allowance amount inc GST");
  // One rate, not two: the ex-GST rate was dropped for length.
  assert.ok(!t.includes("$80.00"), `the ex-GST rate should be gone — got: ${t.slice(0, 400)}`);
});

await check("it prints the allowance, not the marked-up client price", async () => {
  // $4,400.00 is the line with the 25% margin on it. The Allowances page shows
  // $3,520.00 for the same tiles; both pages must say the same thing.
  const t = await renderText({ ...BASE_TOGGLES, allowancePricing: true });
  assert.ok(!t.includes("$4,400.00"), `the marked-up figure leaked — got: ${t.slice(0, 400)}`);
});

await check("it prices provisional sums too, not just prime cost", async () => {
  const t = await renderText({ ...BASE_TOGGLES, allowancePricing: true });
  assert.ok(t.includes("$2,200.00"), "the provisional sum's amount");
});

await check("ordinary lines are never priced by it", async () => {
  const t = await renderText({ ...BASE_TOGGLES, allowancePricing: true });
  // Tiling labour is $1,500 cost → $1,650.00 inc. It must not appear.
  assert.ok(!t.includes("$1,650.00"), `a non-allowance line was priced — got: ${t.slice(0, 400)}`);
  assert.ok(t.includes("Tiling labour"), "but the line itself still prints");
});

await check("a line shown as Included keeps its word instead of a figure", async () => {
  const t = await renderText({ ...BASE_TOGGLES, allowancePricing: true });
  // $900 cost → $990.00 inc. The builder said "Included"; a price under it
  // would contradict that.
  assert.ok(!t.includes("$990.00"), `an Included allowance was priced — got: ${t.slice(0, 400)}`);
});

await check("with GST off it prints ex-GST figures only", async () => {
  const t = await renderText({ ...BASE_TOGGLES, allowancePricing: true }, false);
  assert.ok(t.includes("$3,200.00"), `ex-GST amount — got: ${t.slice(0, 400)}`);
  assert.ok(t.includes("× $80.00"), "the rate falls back to ex GST");
  assert.ok(!t.includes("$88.00"), "no inc-GST figure when GST is off");
});

await check("the estimate total is untouched by the toggle", async () => {
  // cost 3,200 + 2,000 + 1,500 + 900 = 7,600 → 9,500 ex → 10,450 inc.
  for (const toggles of [BASE_TOGGLES, { ...BASE_TOGGLES, allowancePricing: true }]) {
    const t = await renderText(toggles);
    assert.ok(t.includes("$10,450.00"), "the estimate total moved");
  }
});

await check("the estimate section and the Allowances page quote the same figure", async () => {
  /* The point of the whole thing. Render both sections into one document and
     require the tiles to carry one number, not two. */
  const proposal = {
    id: "p1", proposalNumber: "P", name: "T", projectId: "x", estimateId: "e1",
    subtotal: 0, gstAmount: 0, totalAmount: 0, status: "draft", showPricing: true, layoutSettings: {},
  };
  const sections = [
    { id: "s1", proposalId: "p1", sectionType: "estimate", name: "Estimate", order: 0, isEnabled: true,
      content: { columnToggles: { ...BASE_TOGGLES, allowancePricing: true } },
      description: null, descriptionHtml: null, showPricing: true, showSubtotal: true },
    { id: "s2", proposalId: "p1", sectionType: "allowances", name: "Allowances", order: 1, isEnabled: true,
      content: {}, description: null, descriptionHtml: null, showPricing: true, showSubtotal: true },
  ];
  const buf = await renderToBuffer(createElement(ProposalDocument as any, {
    proposal, sections, companyName: "L",
    estimatesData: { e1: { estimate: { id: "e1", projectMarkupPercent: 25, taxRate: 10 }, groups: GROUPS, items: ITEMS } },
  }));
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let t = "";
  for (let i = 1; i <= doc.numPages; i++) {
    t += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str).join(" ");
  }
  t = t.replace(/\s+/g, " ").replace(/(\d) \.(\d)/g, "$1.$2");
  /* The Allowances table prints unit rates by default, not the line amount, so
     the rate is what both pages state — and it has to be the same rate. */
  const unitInc = (t.match(/\$88\.00/g) ?? []).length;
  assert.ok(unitInc >= 2, `the tiles rate should read $88.00 on both pages, found ${unitInc}`);
  assert.ok(t.includes("$3,520.00"), "the estimate section states the allowance amount");
  assert.ok(!t.includes("$4,400.00"), "a marked-up allowance figure reached the document");
  assert.ok(!t.includes("$110.00"), "a marked-up allowance RATE reached the document");
});

console.log(`\n${passed} allowance-pricing checks passed`);
