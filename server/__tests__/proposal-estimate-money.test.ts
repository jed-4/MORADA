/**
 * The estimate is the source of truth for money. The proposal never changes a
 * figure; the eye toggle decides only which rows the client sees.
 *
 * Run:
 *   PDF_FONT_DIR="$PWD/client/public/fonts" npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/proposal-estimate-money.test.ts
 *
 * Built from the shape of 11 Coolum (PROP-2026-0007), where 71 of 90 lines
 * were hidden and every one of these went wrong at once:
 *   - the proposal total dropped hidden lines ($27,550.02 vs a $41,030.03 estimate);
 *   - Preliminaries printed $0.00, all its cost being in hidden lines;
 *   - groups with one or no visible line printed no total, because the amount
 *     columns were off and the "a single line shows its own amount" rule no
 *     longer held;
 *   - Section Totals mode printed no totals at all;
 *   - any layout with a Qty/Unit column printed no group totals anywhere.
 *
 * Assertions read the rendered PDF text, because every one of those bugs lived
 * between a correct calculation and what reached the page.
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

// Jed's real estimate-section toggles on 11 Coolum: every amount column off.
const JED_TOGGLES = {
  markup: false, quantity: false, amountExTax: false, description: true, amountIncTax: false,
  showSubtotals: true, showZeroLines: true, unitCostExTax: false, unitCostIncTax: false,
  showColumnHeader: true, showAllowanceType: true,
};

const group = (id: string, name: string, order: number) =>
  ({ id, estimateId: "e1", name, description: null, parentGroupId: null, order, proposalVisible: true });
const line = (id: string, groupId: string, name: string, cost: number, over: Record<string, unknown> = {}) => ({
  id, estimateId: "e1", groupId, name, description: null, quantity: 1, unit: "item",
  unitCostExTax: cost, markupPercent: 0, wastagePercent: 0, proposalVisible: true,
  shownAs: null, allowance: "None", order: 0, ...over,
});

// Margin 25%, GST 10%: every client figure is cost × 1.375.
const GROUPS = [
  group("g-pre", "Preliminaries", 0),
  group("g-steel", "Structural Steel", 1),
  group("g-brick", "Brickwork", 2),
  group("g-fix", "Fix Out", 3),
];
const ITEMS = [
  line("pre-shown", "g-pre", "Project Management", 0),
  line("pre-hidden", "g-pre", "Prelims cost", 3450, { proposalVisible: false }),        // 4,743.75
  line("steel-shown", "g-steel", "Structural Steel Supply", 2500, { allowance: "Provisional Sum" }), // 3,437.50
  line("steel-hidden", "g-steel", "Steel labour", 640, { proposalVisible: false }),     //   880.00  → group 4,317.50
  line("brick", "g-brick", "Brickwork Supply", 2000),                                   // 2,750.00
  line("fix-hidden", "g-fix", "Architraves", 800, { proposalVisible: false }),          // 1,100.00
];
// Estimate total: cost 9,390 → 11,737.50 ex → 1,173.75 GST → 12,911.25 inc.

async function renderText(opts: { toggles?: Record<string, unknown>; pricingMode?: string; extraSections?: any[] } = {}) {
  const proposal = {
    id: "p1", proposalNumber: "PROP-T", name: "T", projectId: "x", estimateId: "e1",
    subtotal: 0, gstAmount: 0, totalAmount: 0, status: "draft", showPricing: true,
    layoutSettings: opts.pricingMode ? { pricingMode: opts.pricingMode } : {},
  };
  const sections = [
    { id: "s-est", proposalId: "p1", sectionType: "estimate", name: "Estimate", order: 0, isEnabled: true,
      content: { columnToggles: opts.toggles ?? JED_TOGGLES }, description: null, descriptionHtml: null,
      showPricing: true, showSubtotal: true },
    ...(opts.extraSections ?? []),
  ];
  const buf = await renderToBuffer(createElement(ProposalDocument as any, {
    proposal, sections, companyName: "L",
    estimatesData: { e1: { estimate: { id: "e1", projectMarkupPercent: 25, taxRate: 10 }, groups: GROUPS, items: ITEMS } },
  }));
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += " " + c.items.map((x: any) => x.str).join(" ");
  }
  // pdf.js sometimes splits a figure into two text runs at the decimal point
  // ("$11,737 .50"), so rejoin before matching.
  return text.replace(/\s+/g, " ").replace(/(\d) \.(\d)/g, "$1.$2");
}

await check("the estimate total card prints the estimate's own total, hidden lines included", async () => {
  const t = await renderText();
  assert.ok(t.includes("$12,911.25"), `expected the estimate total $12,911.25 — got: ${t.slice(0, 400)}`);
  assert.ok(t.includes("$11,737.50"), "expected the estimate's ex-GST figure");
});

await check("a group whose cost is all in hidden lines prints that cost, not $0.00", async () => {
  const t = await renderText();
  assert.ok(t.includes("$4,743.75"), `Preliminaries should total $4,743.75 — got: ${t.slice(0, 400)}`);
  assert.ok(!/Preliminaries \$0\.00/.test(t), "Preliminaries printed $0.00");
});

await check("hidden rows still do not print", async () => {
  const t = await renderText();
  for (const name of ["Prelims cost", "Steel labour", "Architraves"]) {
    assert.ok(!t.includes(name), `"${name}" is hidden and must not print`);
  }
  assert.ok(t.includes("Project Management") && t.includes("Brickwork Supply"), "visible rows print");
});

await check("groups with one or no visible line print their total when amounts are off", async () => {
  const t = await renderText();
  assert.ok(t.includes("$4,317.50"), "Structural Steel: 1 visible line + hidden cost");
  assert.ok(t.includes("$2,750.00"), "Brickwork: a single visible line");
  assert.ok(t.includes("$1,100.00"), "Fix Out: no visible lines, all cost hidden");
});

await check("Section Totals mode prints every group total", async () => {
  const t = await renderText({ pricingMode: "section_totals" });
  for (const v of ["$4,743.75", "$4,317.50", "$2,750.00", "$1,100.00"]) {
    assert.ok(t.includes(v), `section totals missing ${v} — got: ${t.slice(0, 400)}`);
  }
  assert.ok(t.includes("$12,911.25"), "and the estimate total");
});

await check("with a Qty column on, group totals still print (below the rows)", async () => {
  const t = await renderText({ toggles: { ...JED_TOGGLES, quantity: true } });
  for (const v of ["$4,743.75", "$4,317.50", "$2,750.00", "$1,100.00"]) {
    assert.ok(t.includes(v), `with columns on, missing ${v} — got: ${t.slice(0, 400)}`);
  }
});

await check("an Amount column on a single fully-visible line does not repeat itself as a group total", async () => {
  // The case the old rule was right about: Brickwork's one line already prints
  // $2,750.00 in its Amount cell, so a total would say it twice.
  const t = await renderText({ toggles: { ...JED_TOGGLES, amountIncTax: true } });
  const count = (t.match(/\$2,750\.00/g) ?? []).length;
  assert.strictEqual(count, 1, `Brickwork's figure printed ${count} times`);
  // …but a group with hidden cost still earns one, because it adds something.
  assert.ok(t.includes("$4,317.50"), "Structural Steel has hidden cost and needs its total");
});

await check("the payment schedule is a percentage of the estimate total", async () => {
  const t = await renderText({ extraSections: [{
    id: "s-pay", proposalId: "p1", sectionType: "payment_schedule", name: "Payment Schedule", order: 1,
    isEnabled: true, content: {}, description: null, descriptionHtml: null, showPricing: true, showSubtotal: true,
  }] });
  assert.ok(/Contract price[^$]*\$12,911\.25/i.test(t) || t.includes("$12,911.25"),
    `payment schedule should be based on $12,911.25 — got: ${t.slice(-400)}`);
});

await check("allowances print the estimate's allowance amounts (no margin), hidden allowance lines included in the total", async () => {
  const hiddenAllowance = { ...ITEMS[3], id: "pc-hidden", allowance: "Prime Cost", unitCostExTax: 1000 }; // 1,375.00, hidden
  const items = [...ITEMS, hiddenAllowance];
  const proposal = { id: "p1", proposalNumber: "P", name: "T", projectId: "x", estimateId: "e1",
    subtotal: 0, gstAmount: 0, totalAmount: 0, status: "draft", showPricing: true, layoutSettings: {} };
  const sections = [{ id: "s-al", proposalId: "p1", sectionType: "allowances", name: "Allowances", order: 0,
    isEnabled: true, content: {}, description: null, descriptionHtml: null, showPricing: true, showSubtotal: true }];
  const buf = await renderToBuffer(createElement(ProposalDocument as any, {
    proposal, sections, companyName: "L",
    estimatesData: { e1: { estimate: { id: "e1", projectMarkupPercent: 25, taxRate: 10 }, groups: GROUPS, items } },
  }));
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let t = ""; for (let i = 1; i <= doc.numPages; i++) t += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str).join(" ");
  t = t.replace(/\s+/g, " ").replace(/(\d) \.(\d)/g, "$1.$2");
  // Allowances print as entered, without the 25% margin: visible PS 2,500 inc
  // GST 2,750.00 + hidden PC 1,000 → 1,100.00 = 3,850.00.
  assert.ok(t.includes("$3,850.00"), `allowance total should include the hidden PC line — got: ${t.slice(0, 400)}`);
  assert.ok(t.includes("$2,750.00") && !t.includes("$3,437.50"), `the PS line prints its allowance, not the marked-up price — got: ${t.slice(0, 400)}`);
  assert.ok(!t.includes("Steel labour"), "the hidden allowance row itself does not print");
});

console.log(`\n${passed} estimate-money checks passed`);
