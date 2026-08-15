/**
 * Cross-invoice claim guard — the rule that stops a variation already billed
 * to the client on one progress claim being billed again on another.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/invoice-claim-guard.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  summariseClaimsElsewhere,
  remainingClaimPercent,
  isFullyClaimedElsewhere,
  UNNUMBERED_INVOICE_LABEL,
} from "@shared/invoiceClaims";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Junction rows as /api/invoice-variations/by-project returns them.
const link = (invoiceId: string, invoiceNumber: string | null, variationId: string, claimPercent: number) =>
  ({ invoiceId, invoiceNumber, variationId, claimPercent });

const byVariation = (l: { variationId: string }) => l.variationId;

console.log("invoice claim guard:");

check("a variation with no links anywhere is fully claimable", () => {
  const claims = summariseClaimsElsewhere([], byVariation, "inv-2");
  assert.strictEqual(claims["var-1"], undefined);
  assert.strictEqual(remainingClaimPercent(claims["var-1"]), 100);
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), false);
});

check("THE BUG: a variation claimed 100% on another invoice is locked", () => {
  const claims = summariseClaimsElsewhere(
    [link("inv-1", "INV-1003", "var-1", 100)],
    byVariation,
    "inv-2",
  );
  assert.strictEqual(claims["var-1"].percent, 100);
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), true);
  assert.strictEqual(remainingClaimPercent(claims["var-1"]), 0);
  assert.deepStrictEqual(claims["var-1"].invoiceNumbers, ["INV-1003"]);
});

check("a partially claimed variation stays claimable for the remainder", () => {
  const claims = summariseClaimsElsewhere(
    [link("inv-1", "INV-1003", "var-1", 40)],
    byVariation,
    "inv-2",
  );
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), false);
  assert.strictEqual(remainingClaimPercent(claims["var-1"]), 60);
});

check("claims accumulate across several other invoices", () => {
  const claims = summariseClaimsElsewhere(
    [
      link("inv-1", "INV-1001", "var-1", 30),
      link("inv-2", "INV-1002", "var-1", 45),
    ],
    byVariation,
    "inv-3",
  );
  assert.strictEqual(claims["var-1"].percent, 75);
  assert.strictEqual(remainingClaimPercent(claims["var-1"]), 25);
  assert.deepStrictEqual(claims["var-1"].invoiceNumbers, ["INV-1001", "INV-1002"]);
});

check("30 + 30 + 40 across three invoices closes the variation out", () => {
  const claims = summariseClaimsElsewhere(
    [
      link("inv-1", "INV-1001", "var-1", 30),
      link("inv-2", "INV-1002", "var-1", 30),
      link("inv-3", "INV-1003", "var-1", 40),
    ],
    byVariation,
    "inv-4",
  );
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), true);
  assert.strictEqual(remainingClaimPercent(claims["var-1"]), 0);
});

check("the invoice being edited never counts its own claim against itself", () => {
  const claims = summariseClaimsElsewhere(
    [link("inv-1", "INV-1003", "var-1", 100)],
    byVariation,
    "inv-1", // editing the very invoice that holds the claim
  );
  assert.strictEqual(claims["var-1"], undefined);
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), false);
  assert.strictEqual(remainingClaimPercent(claims["var-1"]), 100);
});

check("on a NEW invoice every existing link counts as elsewhere", () => {
  const claims = summariseClaimsElsewhere(
    [link("inv-1", "INV-1003", "var-1", 100)],
    byVariation,
    undefined, // creating a new invoice — no id yet
  );
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), true);
});

check("UN-LINKING restores the variation — dropping the row frees it again", () => {
  const before = summariseClaimsElsewhere(
    [link("inv-1", "INV-1003", "var-1", 100)],
    byVariation,
    "inv-2",
  );
  assert.strictEqual(isFullyClaimedElsewhere(before["var-1"]), true);

  // Invoice INV-1003 is edited to drop the variation (or is deleted), so the
  // junction row is gone from the project's claim list.
  const after = summariseClaimsElsewhere([], byVariation, "inv-2");
  assert.strictEqual(isFullyClaimedElsewhere(after["var-1"]), false);
  assert.strictEqual(remainingClaimPercent(after["var-1"]), 100);
});

check("claims are scoped per line — one variation's claim never locks another", () => {
  const claims = summariseClaimsElsewhere(
    [link("inv-1", "INV-1003", "var-1", 100)],
    byVariation,
    "inv-2",
  );
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), true);
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-2"]), false);
});

check("an invoice with no number yet is still named in the note", () => {
  const claims = summariseClaimsElsewhere(
    [link("inv-1", null, "var-1", 100)],
    byVariation,
    "inv-2",
  );
  assert.deepStrictEqual(claims["var-1"].invoiceNumbers, [UNNUMBERED_INVOICE_LABEL]);
});

check("a repeated invoice number is only listed once", () => {
  const claims = summariseClaimsElsewhere(
    [
      link("inv-1", "INV-1001", "var-1", 20),
      link("inv-1", "INV-1001", "var-1", 20),
    ],
    byVariation,
    "inv-2",
  );
  assert.strictEqual(claims["var-1"].percent, 40);
  assert.deepStrictEqual(claims["var-1"].invoiceNumbers, ["INV-1001"]);
});

check("legacy over-claimed data reports 0 remaining, never negative", () => {
  const claims = summariseClaimsElsewhere(
    [
      link("inv-1", "INV-1001", "var-1", 100),
      link("inv-2", "INV-1002", "var-1", 100),
    ],
    byVariation,
    "inv-3",
  );
  assert.strictEqual(claims["var-1"].percent, 200);
  assert.strictEqual(remainingClaimPercent(claims["var-1"]), 0);
  assert.strictEqual(isFullyClaimedElsewhere(claims["var-1"]), true);
});

check("the same helper guards allowances, keyed by estimate item", () => {
  const allowanceLinks = [
    { invoiceId: "inv-1", invoiceNumber: "INV-1001", estimateItemId: "item-1", claimPercent: 100 },
  ];
  const claims = summariseClaimsElsewhere(allowanceLinks, (l) => l.estimateItemId, "inv-2");
  assert.strictEqual(isFullyClaimedElsewhere(claims["item-1"]), true);
});

console.log(`\n${passed} checks passed`);
