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
  type SelectionViewer,
} from "../selectionVisibility";

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
const CLIENT: SelectionViewer = { isClient: true, canSeePending: true, canSeePricing: false };

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
  const out = applySelectionVisibilityToOne(sel, CLIENT);
  const opt = out.options.find((o: any) => o.id === "opt-approved");
  // 100000c ex × 2 × 1.10 markup = 220000 ex → 242000 inc GST
  assert.equal(opt.totalCost, 242_000);
  assert.equal(opt.unitCost, undefined);
  assert.equal(opt.markupPercent, undefined);
  assert.equal(out.allowance, 200_000, "allowance is shown when prices are shown");
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

console.log(`\n${passed} passed\n`);
