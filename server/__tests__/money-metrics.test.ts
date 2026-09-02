/**
 * Money-metric regression tests — reproduces the "20 Swan" figures that were
 * read off the live app on 2026-08-31 and proves the corrected values.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/money-metrics.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  summariseInvoices,
  isIssuedInvoice,
  invoiceBalanceCents,
  type InvoiceMoneyRow,
} from "@shared/invoiceMetrics";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const D = (dollars: number) => Math.round(dollars * 100);

// ── The 20 Swan invoice ledger, exactly as the live app showed it ────────────
// 7 invoices: 4 issued+paid, 1 partial (CI-005), 2 draft (CI-006, CI-02).
// Issued total $205,068.89 · drafts $27,197.76 · all seven $232,266.65.
const SWAN_INVOICES: InvoiceMoneyRow[] = [
  { status: "paid",    totalAmount: D(60000.00), paidAmount: D(60000.00), balanceAmount: 0 },
  { status: "paid",    totalAmount: D(44348.24), paidAmount: D(44348.24), balanceAmount: 0 },
  { status: "paid",    totalAmount: D(20174.12), paidAmount: D(20174.12), balanceAmount: 0 },
  { status: "paid",    totalAmount: D(20174.12), paidAmount: D(20174.12), balanceAmount: 0 },
  // CI-005 — partially paid: $60,372.41 billed, $60,000.01 received, $372.40 due.
  { status: "partial", totalAmount: D(60372.41), paidAmount: D(60000.01), balanceAmount: D(372.40) },
  // CI-006 + CI-02 — drafts, never issued to the client.
  { status: "draft",   totalAmount: D(10335.47), paidAmount: 0, balanceAmount: D(10335.47) },
  { status: "draft",   totalAmount: D(16862.29), paidAmount: 0, balanceAmount: D(16862.29) },
];

// Revised contract inc GST as the CASH page shows it.
const SWAN_CONTRACT_INC_GST = D(232266.60);

console.log("money metrics:");

console.log(" bug 1 — drafts must not count as invoiced:");

check("the ledger really does total $232,266.65 across all seven", () => {
  const all = SWAN_INVOICES.reduce((s, i) => s + (i.totalAmount || 0), 0);
  assert.strictEqual(all, D(232266.65));
});

check("invoiced counts issued only — $205,068.89, not $232,266.65", () => {
  const s = summariseInvoices(SWAN_INVOICES);
  assert.strictEqual(s.invoicedCents, D(205068.89));
  assert.strictEqual(s.issuedCount, 5);
});

check("drafts are reported separately — $27,197.76 across 2", () => {
  const s = summariseInvoices(SWAN_INVOICES);
  assert.strictEqual(s.draftCents, D(27197.76));
  assert.strictEqual(s.draftCount, 2);
});

check("% of contract is 88.3%, not 100%", () => {
  const s = summariseInvoices(SWAN_INVOICES);
  const pct = (s.invoicedCents / SWAN_CONTRACT_INC_GST) * 100;
  assert.strictEqual(pct.toFixed(1), "88.3");
});

check("remaining to invoice is ~$27,197.71, not $0.00", () => {
  const s = summariseInvoices(SWAN_INVOICES);
  const remaining = SWAN_CONTRACT_INC_GST - s.contractInvoicedCents;
  assert.strictEqual(remaining, D(27197.71));
  assert.ok(remaining > 0, "a job with two unsent drafts still has money to bill");
});

check("cost-plus invoices stay out of the contract remainder", () => {
  const s = summariseInvoices([
    ...SWAN_INVOICES,
    { status: "sent", totalAmount: D(5000), paidAmount: 0, balanceAmount: D(5000), invoicingMethod: "cost_plus" },
  ]);
  assert.strictEqual(s.contractInvoicedCents, D(205068.89));
  assert.strictEqual(s.invoicedCents, D(210068.89));
});

console.log(" bug 3 — outstanding must include a partial's unpaid remainder:");

check("outstanding is $372.40, not $0.00", () => {
  const s = summariseInvoices(SWAN_INVOICES);
  assert.strictEqual(s.outstandingCents, D(372.40));
  assert.strictEqual(s.outstandingCount, 1);
});

check("the old sent-totals-only rule really did return $0", () => {
  const legacy = SWAN_INVOICES
    .filter(i => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + (i.totalAmount || 0), 0);
  assert.strictEqual(legacy, 0);
});

check("a plain unpaid sent invoice is still outstanding at its full value", () => {
  const s = summariseInvoices([
    { status: "sent", totalAmount: D(1000), paidAmount: 0, balanceAmount: D(1000) },
  ]);
  assert.strictEqual(s.outstandingCents, D(1000));
});

check("drafts are never outstanding — they are not yet owed", () => {
  const s = summariseInvoices([
    { status: "draft", totalAmount: D(9999), paidAmount: 0, balanceAmount: D(9999) },
  ]);
  assert.strictEqual(s.outstandingCents, 0);
  assert.strictEqual(s.outstandingCount, 0);
});

check("cancelled invoices are void everywhere", () => {
  const s = summariseInvoices([
    ...SWAN_INVOICES,
    { status: "cancelled", totalAmount: D(50000), paidAmount: 0, balanceAmount: D(50000) },
  ]);
  assert.strictEqual(s.invoicedCents, D(205068.89));
  assert.strictEqual(s.outstandingCents, D(372.40));
  assert.strictEqual(s.countableCount, 7);
});

check("balance falls back to total - paid on legacy rows with no balance", () => {
  assert.strictEqual(
    invoiceBalanceCents({ status: "partial", totalAmount: D(100), paidAmount: D(30) }),
    D(70),
  );
  // A stored zero balance is honoured, not treated as missing.
  assert.strictEqual(
    invoiceBalanceCents({ status: "paid", totalAmount: D(100), paidAmount: D(100), balanceAmount: 0 }),
    0,
  );
});

check("issued-status gate covers approved/sent/partial/overdue/paid only", () => {
  for (const st of ["approved", "sent", "partial", "overdue", "paid"]) {
    assert.ok(isIssuedInvoice(st), `${st} should be issued`);
  }
  for (const st of ["draft", "cancelled"]) {
    assert.ok(!isIssuedInvoice(st), `${st} should not be issued`);
  }
});

console.log(` \n${passed} checks passed.`);
