/**
 * Redaction tests for server/selectionVisibility.ts — the rules that decide
 * what a trade, a foreman and a client each get back from the selections read
 * routes.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/selection-visibility.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  applySelectionVisibility,
  applySelectionVisibilityToOne,
  applyOptionVisibility,
  OPTION_MONEY_FIELDS,
  OPTION_NON_MONEY_FIELDS,
  CLIENT_OPTION_FIELDS,
  redactDecisionLogPrices,
  type SelectionViewer,
} from "../selectionVisibility";
import { getTableColumns } from "drizzle-orm";
import { selectionOptions } from "@shared/schema";
import { solvePricing, optionClientPriceCents } from "@shared/selectionPricing";
import { optionFromRows } from "@shared/applyTemplate";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}\n    ${err?.message}`);
    process.exitCode = 1;
  }
}

const TRADE: SelectionViewer = { isClient: false, canSeePending: false, canSeePricing: false };
const FOREMAN: SelectionViewer = { isClient: false, canSeePending: true, canSeePricing: false };
const PM: SelectionViewer = { isClient: false, canSeePending: true, canSeePricing: true };
// canSeePricing on a client = the role's portal.selections.pricing tick.
const CLIENT: SelectionViewer = { isClient: true, canSeePending: true, canSeePricing: false };
const CLIENT_WITH_PRICES: SelectionViewer = { isClient: true, canSeePending: true, canSeePricing: true };

const approvedOption = () => ({
  id: "opt-approved",
  name: "Zellige Lily",
  brand: "Concept Tile & Timber",
  sku: "ZL-100",
  quantity: 2,
  unitType: "m2",
  unitCost: 100_000,
  unitTax: 10_000,
  markupPercent: 10,
  totalCost: 242_000,
  gstInclusive: false,
  isSelectedByClient: true,
  approvedAt: new Date("2026-08-01"),
  attachments: [],
});

const rejectedOption = () => ({
  id: "opt-rejected",
  name: "Palermo Terrazzo",
  brand: "Signorino",
  quantity: 2,
  unitCost: 180_000,
  markupPercent: 10,
  totalCost: 435_600,
  gstInclusive: false,
  isSelectedByClient: false,
  approvedAt: null,
  attachments: [],
});

const approvedSelection = () => ({
  id: "sel-1",
  projectId: "proj-1",
  name: "Kitchen Splashback Tiles",
  category: "Tiles",
  room: "Kitchen",
  status: "approved",
  allowance: 200_000,
  clientCanSeePrice: false,
  notes: "Stack bond, not brick bond.",
  options: [approvedOption(), rejectedOption()],
});

const pendingSelection = () => ({
  id: "sel-2",
  projectId: "proj-1",
  name: "Kitchen Tapware",
  category: "Fixtures",
  room: "Kitchen",
  status: "pending",
  allowance: 160_000,
  clientCanSeePrice: false,
  deadline: new Date("2026-09-01"),
  options: [
    { ...rejectedOption(), id: "opt-a", isSelectedByClient: true, approvedAt: null },
    { ...rejectedOption(), id: "opt-b" },
  ],
});

console.log("\nselectionVisibility");

// ── Trade: approved only, spec only, no money ─────────────────────────────
check("trade sees an approved selection, but only the approved option", () => {
  const out = applySelectionVisibilityToOne(approvedSelection(), TRADE);
  assert.equal(out.name, "Kitchen Splashback Tiles");
  assert.equal(out.options.length, 1, "rejected options must not reach a trade");
  assert.equal(out.options[0].id, "opt-approved");
  assert.equal(out.notes, "Stack bond, not brick bond.", "trades notes must survive");
});

check("trade sees no costs, markup or allowance", () => {
  const out = applySelectionVisibilityToOne(approvedSelection(), TRADE);
  assert.equal(out.allowance, undefined);
  const opt = out.options[0];
  for (const field of ["unitCost", "unitTax", "markupPercent", "totalCost", "gstInclusive"]) {
    assert.equal(opt[field], undefined, `${field} leaked to a trade`);
  }
  assert.equal(opt.sku, "ZL-100", "spec fields must survive");
});

check("trade gets only a name and a marker for an unapproved selection", () => {
  const out = applySelectionVisibilityToOne(pendingSelection(), TRADE);
  assert.equal(out.name, "Kitchen Tapware");
  assert.equal(out.restricted, true);
  assert.equal(out.status, "awaiting_approval");
  assert.deepEqual(out.options, []);
  assert.equal(out.allowance, undefined);
  assert.equal(out.deadline, undefined, "a trade has no business with the client's deadline");
});

check("a client's pick that is NOT approved stays hidden from a trade", () => {
  // opt-a has isSelectedByClient but no approvedAt — the gate is approval.
  const out = applySelectionVisibilityToOne(pendingSelection(), TRADE);
  assert.equal(out.restricted, true);
  assert.deepEqual(out.options, []);
});

check("ordered/received selections reach a trade even without approvedAt", () => {
  const ordered = {
    ...pendingSelection(),
    status: "ordered",
    options: [{ ...rejectedOption(), id: "opt-chosen", isSelectedByClient: true }],
  };
  const out = applySelectionVisibilityToOne(ordered, TRADE);
  assert.equal(out.restricted, undefined);
  assert.equal(out.options.length, 1);
  assert.equal(out.options[0].totalCost, undefined);
});

// ── Foreman: pending yes, money no ────────────────────────────────────────
check("foreman sees unapproved selections and every option, but no money", () => {
  const out = applySelectionVisibilityToOne(pendingSelection(), FOREMAN);
  assert.equal(out.restricted, undefined);
  assert.equal(out.options.length, 2);
  assert.equal(out.allowance, undefined);
  assert.equal(out.options[0].unitCost, undefined);
  assert.equal(out.options[0].markupPercent, undefined);
});

// ── PM: untouched ─────────────────────────────────────────────────────────
check("pm payload is returned unchanged", () => {
  const input = approvedSelection();
  const out = applySelectionVisibilityToOne(input, PM);
  assert.strictEqual(out, input, "a fully-permitted viewer should not pay for a copy");
  assert.equal(out.allowance, 200_000);
  assert.equal(out.options[0].markupPercent, 10);
});

// ── Client: never the cost base ───────────────────────────────────────────
check("client never receives unit cost or markup", () => {
  const out = applySelectionVisibilityToOne(approvedSelection(), CLIENT);
  for (const opt of out.options) {
    assert.equal(opt.unitCost, undefined, "unitCost leaked to a client");
    assert.equal(opt.markupPercent, undefined, "markupPercent leaked to a client");
    assert.equal(opt.unitTax, undefined);
  }
  assert.equal(out.allowance, undefined);
});

check("client sees pending selections — choosing is the point", () => {
  const out = applySelectionVisibilityToOne(pendingSelection(), CLIENT);
  assert.equal(out.restricted, undefined);
  assert.equal(out.options.length, 2);
});

check("clientCanSeePrice yields a marked-up inc-GST price, not the cost", () => {
  const sel = { ...approvedSelection(), clientCanSeePrice: true };
  const out = applySelectionVisibilityToOne(sel, CLIENT_WITH_PRICES);
  const opt = out.options.find((o: any) => o.id === "opt-approved");
  // 100000c ex × 2 × 1.10 markup = 220000 ex → 242000 inc GST
  assert.equal(opt.totalCost, 242_000);
  assert.equal(opt.unitCost, undefined);
  assert.equal(opt.markupPercent, undefined);
  assert.equal(out.allowance, 200_000, "allowance is shown when prices are shown");
});

check("a client role without the prices tick gets no price even when the selection allows it", () => {
  const sel = { ...approvedSelection(), clientCanSeePrice: true };
  const out = applySelectionVisibilityToOne(sel, CLIENT);
  for (const opt of out.options) assert.equal(opt.totalCost, undefined, "price shown without the role tick");
  assert.equal(out.allowance, undefined);
});

check("options hidden from the client never reach them", () => {
  const sel = approvedSelection();
  sel.options = sel.options.map((o: any, i: number) => (i === 0 ? { ...o, visibleToClient: false } : o));
  const hiddenId = sel.options[0].id;
  const out = applySelectionVisibilityToOne(sel, CLIENT_WITH_PRICES);
  assert.ok(!out.options.some((o: any) => o.id === hiddenId), "hidden option leaked");
  const optionsOnly = applyOptionVisibility(sel.options, sel, CLIENT);
  assert.ok(!optionsOnly.some((o: any) => o.id === hiddenId), "hidden option leaked (options route)");
});

check("builder notes on a selection and its options never reach a client", () => {
  const sel: any = { ...approvedSelection(), notes: "chase the tiler" };
  sel.options = sel.options.map((o: any) => ({ ...o, notes: "order 2 weeks out" }));
  const out = applySelectionVisibilityToOne(sel, CLIENT);
  assert.equal(out.notes, undefined, "selection notes leaked");
  for (const opt of out.options) assert.equal(opt.notes, undefined, "option notes leaked");
  const optionsOnly = applyOptionVisibility(sel.options, sel, CLIENT);
  for (const opt of optionsOnly) assert.equal(opt.notes, undefined, "option notes leaked (options route)");
});

// ── The portal token is a shareable client link ───────────────────────────
check("portal token never reaches a trade, a foreman or a client", () => {
  const withToken = { ...approvedSelection(), portalToken: "abc123" };
  for (const [label, viewer] of [["trade", TRADE], ["foreman", FOREMAN], ["client", CLIENT]] as const) {
    const out = applySelectionVisibilityToOne(withToken, viewer);
    assert.equal(out.portalToken, undefined, `portalToken leaked to a ${label}`);
  }
  const pending = { ...pendingSelection(), portalToken: "abc123" };
  assert.equal(applySelectionVisibilityToOne(pending, TRADE).portalToken, undefined);
});

check("pm keeps the portal token", () => {
  const withToken = { ...approvedSelection(), portalToken: "abc123" };
  assert.equal(applySelectionVisibilityToOne(withToken, PM).portalToken, "abc123");
});

// ── List + options-only forms ─────────────────────────────────────────────
check("list form redacts every row", () => {
  const out = applySelectionVisibility([approvedSelection(), pendingSelection()], TRADE);
  assert.equal(out.length, 2);
  assert.equal(out[0].options.length, 1);
  assert.equal(out[1].restricted, true);
});

check("options-only form returns nothing for an unapproved parent", () => {
  const parent = pendingSelection();
  const out = applyOptionVisibility(parent.options, parent, TRADE);
  assert.deepEqual(out, []);
});

check("options-only form returns the approved option, stripped", () => {
  const parent = approvedSelection();
  const out = applyOptionVisibility(parent.options, parent, TRADE);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "opt-approved");
  assert.equal(out[0].totalCost, undefined);
});

check("redaction never mutates the caller's rows", () => {
  const input = approvedSelection();
  applySelectionVisibilityToOne(input, TRADE);
  assert.equal(input.allowance, 200_000, "input was mutated");
  assert.equal(input.options.length, 2, "input options were mutated");
  assert.equal(input.options[0].unitCost, 100_000);
});

// ── Guard rails: a new column can never slip out by default ───────────────
check("every selection_options column is classified money or non-money", () => {
  const columns = Object.keys(getTableColumns(selectionOptions));
  const classified = new Set<string>([...OPTION_MONEY_FIELDS, ...OPTION_NON_MONEY_FIELDS]);
  const unclassified = columns.filter((c) => !classified.has(c));
  assert.deepEqual(unclassified, [], `classify these in selectionVisibility.ts: ${unclassified.join(", ")}`);
  const stale = [...classified].filter((c) => !columns.includes(c));
  assert.deepEqual(stale, [], `listed but not a column: ${stale.join(", ")}`);
});

check("the client allow-list contains no money, no notes and no staff ids", () => {
  const forbidden = [...OPTION_MONEY_FIELDS.filter((f) => f !== "totalCost"), "totalCost", "notes", "approvedById", "productId"];
  for (const field of forbidden) {
    assert.ok(!(CLIENT_OPTION_FIELDS as readonly string[]).includes(field), `${field} is on the client allow-list`);
  }
});

check("a client is sent ONLY allow-listed option fields — unknown columns stay private", () => {
  const sel = { ...approvedSelection(), clientCanSeePrice: true };
  sel.options = sel.options.map((o: any) => ({
    ...o,
    unitCharge: 150_00,
    someFutureCostColumn: 99_99,
    notes: "internal",
    approvedById: "user-1",
    productId: 7,
  }));
  for (const viewer of [CLIENT, CLIENT_WITH_PRICES]) {
    const out = applySelectionVisibilityToOne(sel, viewer);
    const viaOptions = applyOptionVisibility(sel.options, sel, viewer);
    for (const opt of [...out.options, ...viaOptions]) {
      const extra = Object.keys(opt).filter((k) => k !== "totalCost" && !(CLIENT_OPTION_FIELDS as readonly string[]).includes(k));
      assert.deepEqual(extra, [], `client received: ${extra.join(", ")}`);
      assert.equal(opt.unitCost, undefined);
      assert.equal(opt.markupPercent, undefined);
      assert.equal(opt.unitCharge, undefined);
      assert.equal(opt.someFutureCostColumn, undefined);
    }
  }
});

check("a stored charge is the client's price: charge × qty, no cost, no markup", () => {
  const sel = { ...approvedSelection(), clientCanSeePrice: true };
  // $100 cost, $150 charge (50%), qty 2 → the client is shown $300.
  sel.options = sel.options.map((o: any) => ({ ...o, unitCost: 100_00, gstInclusive: true, markupPercent: 50, unitCharge: 150_00, quantity: 2 }));
  const out = applySelectionVisibilityToOne(sel, CLIENT_WITH_PRICES);
  for (const opt of out.options) {
    assert.equal(opt.totalCost, 300_00);
    assert.ok(!JSON.stringify(opt).includes("10000"), "the cost figure appears in the client payload");
  }
});

check("a trade without pricing access gets no charge either", () => {
  const sel = approvedSelection();
  sel.options = sel.options.map((o: any) => ({ ...o, unitCharge: 150_00 }));
  const out = applySelectionVisibilityToOne(sel, TRADE);
  for (const opt of out.options) assert.equal(opt.unitCharge, undefined);
});

// ── Cost / charge / markup solver ─────────────────────────────────────────
check("any two of cost / charge / markup give the third", () => {
  assert.deepEqual(solvePricing({ costCents: 100_00, chargeCents: null, markupPercent: 50 }, "markup"), { costCents: 100_00, chargeCents: 150_00, markupPercent: 50 });
  assert.deepEqual(solvePricing({ costCents: 100_00, chargeCents: 150_00, markupPercent: null }, "charge"), { costCents: 100_00, chargeCents: 150_00, markupPercent: 50 });
  assert.deepEqual(solvePricing({ costCents: null, chargeCents: 150_00, markupPercent: 50 }, "markup"), { costCents: 100_00, chargeCents: 150_00, markupPercent: 50 });
});

check("editing cost keeps the markup; editing charge keeps the cost and moves the markup", () => {
  const all = { costCents: 100_00, chargeCents: 150_00, markupPercent: 50 };
  assert.deepEqual(solvePricing({ ...all, costCents: 120_00 }, "cost"), { costCents: 120_00, chargeCents: 180_00, markupPercent: 50 });
  assert.deepEqual(solvePricing({ ...all, chargeCents: 149_00 }, "charge"), { costCents: 100_00, chargeCents: 149_00, markupPercent: 49 });
  assert.deepEqual(solvePricing({ ...all, markupPercent: 7.5 }, "markup"), { costCents: 100_00, chargeCents: 107_50, markupPercent: 7.5 });
});

check("markup is on cost, never margin, and a typed charge is never altered", () => {
  // $100 → $150 is 50% markup (it would be 33.33% margin).
  assert.equal(solvePricing({ costCents: 100_00, chargeCents: 150_00, markupPercent: null }, "charge").markupPercent, 50);
  const odd = solvePricing({ costCents: 33_33, chargeCents: 49_99, markupPercent: 12 }, "charge");
  assert.equal(odd.chargeCents, 49_99);
  assert.equal(odd.costCents, 33_33);
});

check("options priced before the charge existed keep their exact old price", () => {
  // 100000c ex × 2 × 1.10 = 220000 ex → 242000 inc GST, as before.
  assert.equal(optionClientPriceCents({ unitCost: 100_000, gstInclusive: false, markupPercent: 10, quantity: 2 }), 242_000);
  assert.equal(optionClientPriceCents({ unitCost: null, unitCharge: null }), null);
});

// ── Templates using a library product ─────────────────────────────────────
const libraryProduct = {
  name: "Mixer", brand: null, sku: null, description: null, category: null, subcategory: null,
  unitType: "ea", url: null, specifications: null,
  defaultUnitCost: 100_00, gstInclusive: true, defaultMarkupPercent: 50, defaultUnitCharge: 150_00,
};
const use = (over: Record<string, any> = {}) => ({
  quantity: 2, unitCostOverride: null, markupPercent: null, totalCost: null,
  visibleToClient: null, gstInclusive: null, sortOrder: null, optionCategory: null, ...over,
});

check("a template using a library product as priced inherits its markup and charge", () => {
  const opt = optionFromRows(libraryProduct, use() as any, []);
  assert.equal(opt.unitCost, 100_00);
  assert.equal(opt.gstInclusive, true);
  assert.equal(opt.markupPercent, 50);
  assert.equal(opt.unitCharge, 150_00);
  assert.equal(opt.totalCost, 300_00);
  assert.equal(optionClientPriceCents(opt), 300_00);
});

check("a template's own markup or cost wins over the library's charge", () => {
  const ownMarkup = optionFromRows(libraryProduct, use({ markupPercent: 20 }) as any, []);
  assert.equal(ownMarkup.unitCharge, undefined);
  assert.equal(ownMarkup.markupPercent, 20);
  assert.equal(optionClientPriceCents(ownMarkup), 240_00); // $100 inc × 2 × 1.2
  const ownCost = optionFromRows(libraryProduct, use({ unitCostOverride: 80_00, gstInclusive: false }) as any, []);
  assert.equal(ownCost.unitCharge, undefined);
  assert.equal(ownCost.unitCost, 80_00);
  assert.equal(ownCost.gstInclusive, false);
});

check("a product with no library pricing applies exactly as before", () => {
  const plain = { ...libraryProduct, gstInclusive: false, defaultMarkupPercent: null, defaultUnitCharge: null };
  const opt = optionFromRows(plain, use({ totalCost: 200_00 }) as any, []);
  assert.equal("unitCharge" in opt, false);
  assert.equal(opt.markupPercent, undefined);
  assert.equal(opt.totalCost, 200_00);
  assert.equal(opt.gstInclusive, undefined);
});

check("a template's own charge is kept to the cent when applied", () => {
  const opt = optionFromRows({ ...libraryProduct, defaultUnitCharge: null, defaultMarkupPercent: null }, use({ unitCostOverride: 100_00, gstInclusive: true, markupPercent: 49.99, unitCharge: 149_99, quantity: 3 }) as any, []);
  assert.equal(opt.unitCharge, 149_99);
  assert.equal(opt.totalCost, 449_97);
  assert.equal(optionClientPriceCents(opt), 449_97);
});

// ── Decision log prices ───────────────────────────────────────────────────
check("the decision log loses its price for readers who may not see prices", () => {
  const log = [
    { createdByName: "Decision log", content: "Jane chose “Zellige Lily” ($1,250.00 inc GST) — changed from “Subway”" },
    { createdByName: "Jane", content: "Can we do it for ($1,250.00 inc GST)?" },
  ];
  const hidden = redactDecisionLogPrices(log, false);
  assert.equal(hidden[0].content, "Jane chose “Zellige Lily” — changed from “Subway”");
  assert.equal(hidden[1].content, log[1].content, "a person's own words are never edited");
  assert.strictEqual(redactDecisionLogPrices(log, true), log);
});

// ── Client suggestions ────────────────────────────────────────────────────
check("a client sees that an option is their suggestion, and still no money", () => {
  const sel = { ...pendingSelection(), clientCanSeePrice: false };
  sel.options = sel.options.map((o: any, i: number) => (i === 0 ? { ...o, clientSuggested: true, suggestedBy: "Linda" } : o));
  const out = applySelectionVisibilityToOne(sel, CLIENT);
  assert.equal(out.options[0].clientSuggested, true);
  assert.equal(out.options[0].suggestedBy, "Linda");
  assert.equal(out.options[0].unitCost, undefined);
});

console.log(`\n${passed} passed\n`);
