// Run: npx tsx server/__tests__/paid-bill-lock.test.ts
//
// A paid bill is locked like Xero's, except where the cost lands (cost code,
// allowance, project), which Jed wants editable after payment (10 Nov 2026).
import assert from "node:assert";
import {
  activePaidCents,
  lockedHeaderChanges,
  stripDerivedTotals,
  lockedLineChanges,
  lockedLineFieldChanges,
} from "../services/paidBillLock";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const bill = {
  supplierId: "s1", billNumber: "BILL-1", billReference: "INV-9", taxMode: "inclusive", billType: "bill",
  billDate: new Date("2026-10-07T00:00:00Z"), dueDate: new Date("2026-11-07T00:00:00Z"), projectId: "p1",
};
const lines = [
  { id: "l1", description: "Fuel", quantity: 1, unit: "", unitPrice: 15000, tax: "GST on expenses", account: "449", total: 15000, costCodeId: "c1" },
  { id: "l2", description: "Oil", quantity: 2, unit: "L", unitPrice: 4500, tax: "GST on expenses", account: "449", total: 9000, costCodeId: null },
];

check("voided payments don't count", () => {
  assert.equal(activePaidCents([{ amount: 5000, isVoided: true }, { amount: 100 }]), 100);
});

check("a resave of the same header (dates as ISO strings) changes nothing", () => {
  assert.deepEqual(lockedHeaderChanges(bill, {
    ...bill, billDate: "2026-10-07T00:00:00.000Z", dueDate: "2026-11-07T00:00:00.000Z",
  }), []);
});

check("a stored date with a time of day matches the form's UTC midnight", () => {
  // Seen on dev: bill_date 2026-10-07 09:35:54Z, form sends 2026-10-07T00:00:00Z.
  assert.deepEqual(lockedHeaderChanges({ billDate: new Date("2026-10-07T09:35:54.439Z") }, { billDate: "2026-10-07T00:00:00.000Z" }), []);
  assert.deepEqual(lockedHeaderChanges({ billDate: new Date("2026-10-06T13:00:00Z") }, { billDate: "2026-10-07T00:00:00.000Z" }), []); // AEDT midnight
  assert.deepEqual(lockedHeaderChanges({ billDate: new Date("2026-10-07T09:35:54Z") }, { billDate: "2026-10-08T00:00:00.000Z" }), ["billDate"]);
});

check("project and notes may change; supplier and due date may not", () => {
  assert.deepEqual(lockedHeaderChanges(bill, { projectId: "p2", notes: "moved" }), []);
  assert.deepEqual(lockedHeaderChanges(bill, { supplierId: "s2", dueDate: "2026-12-01" }), ["supplierId", "dueDate"]);
});

check("derived totals are dropped, not compared", () => {
  const save: Record<string, unknown> = { total: 24001, subtotal: 1, tax: 2, roundingCents: 1, notes: "x" };
  stripDerivedTotals(save);
  assert.deepEqual(save, { notes: "x" });
});

check("re-allocating cost codes passes", () => {
  assert.equal(lockedLineChanges(lines, lines.map((l) => ({ ...l, costCodeId: "c9" }))), null);
});

check("numbers compare by value (string vs number)", () => {
  assert.equal(lockedLineChanges(lines, lines.map((l) => ({ ...l, quantity: String(l.quantity) }))), null);
});

check("changing an amount, adding or removing a line is refused", () => {
  assert.match(lockedLineChanges(lines, [{ ...lines[0], total: 16000 }, lines[1]])!, /total/);
  assert.match(lockedLineChanges(lines, [lines[0]])!, /added or removed/);
  assert.match(lockedLineChanges(lines, [...lines, { description: "new", total: 1 }])!, /added or removed/);
});

check("single-line edit: cost code free, unit price locked", () => {
  assert.deepEqual(lockedLineFieldChanges(lines[0], { costCodeId: "c2" }), []);
  assert.deepEqual(lockedLineFieldChanges(lines[0], { unitPrice: 1 }), ["unitPrice"]);
});

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("all passed");
