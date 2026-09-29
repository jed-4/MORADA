/**
 * A draft invoice's dates follow its schedule item until set by hand or
 * approved — shared/invoiceScheduleDates.
 */
import assert from "node:assert";
import { dateOnly, followedDates, invoiceDateChanged, invoiceDateMode, itemClaimDate, scheduleMovedSinceLock, shiftedDueDate } from "@shared/invoiceScheduleDates";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

check("modes: follows while draft, pinned when set by hand, locked from approval on", () => {
  assert.strictEqual(invoiceDateMode({ status: "draft", scheduleItemId: "i" }), "follows");
  assert.strictEqual(invoiceDateMode({ status: "draft", scheduleItemId: "i", datePinned: true }), "pinned");
  for (const s of ["approved", "sent", "partial", "paid", "overdue"]) assert.strictEqual(invoiceDateMode({ status: s, scheduleItemId: "i" }), "locked");
  assert.strictEqual(invoiceDateMode({ status: "draft", scheduleItemId: null }), "unlinked");
});

check("a draft that was in Xero once (voided back to draft) stays locked", () => {
  assert.strictEqual(invoiceDateMode({ status: "draft", scheduleItemId: "i", xeroInvoiceId: "x-1" }), "locked");
});

check("the claim date is the actual finish once recorded, else the planned finish", () => {
  assert.strictEqual(itemClaimDate({ endDate: "2026-11-20T00:00:00.000Z" }), "2026-11-20");
  assert.strictEqual(itemClaimDate({ endDate: "2026-11-20T00:00:00.000Z", actualEndDate: "2026-11-12T00:00:00.000Z" }), "2026-11-12");
  // A date picked at local midnight in Sydney is stored the evening before in UTC.
  assert.strictEqual(itemClaimDate({ endDate: "2026-11-19T13:00:00.000Z" }), "2026-11-20");
});

check("stored as midnight UTC of the day", () => {
  assert.strictEqual(dateOnly("2026-11-20").toISOString(), "2026-11-20T00:00:00.000Z");
});

check("moving to the item's date keeps the invoice's terms", () => {
  const r = followedDates({ invoiceDate: "2026-10-01T00:00:00.000Z", dueDate: "2026-10-15T00:00:00.000Z" }, "2026-11-20")!;
  assert.deepStrictEqual([r.invoiceDate.toISOString().slice(0, 10), r.dueDate!.toISOString().slice(0, 10)], ["2026-11-20", "2026-12-04"]);
});

check("no due date stays no due date; already on the day → nothing to change", () => {
  assert.strictEqual(followedDates({ invoiceDate: "2026-10-01T00:00:00.000Z", dueDate: null }, "2026-11-20")!.dueDate, null);
  assert.strictEqual(followedDates({ invoiceDate: "2026-11-20T00:00:00.000Z" }, "2026-11-20"), null);
});

check("a hand-set date is a change of DAY, not of time", () => {
  assert.strictEqual(invoiceDateChanged("2026-11-20T00:00:00.000Z", "2026-11-20T09:30:00.000Z"), false);
  assert.strictEqual(invoiceDateChanged("2026-11-20T00:00:00.000Z", "2026-11-24T00:00:00.000Z"), true);
  assert.strictEqual(invoiceDateChanged("2026-11-20T00:00:00.000Z", undefined), false);
});

check("a locked invoice notes a schedule move of more than 3 days", () => {
  assert.strictEqual(scheduleMovedSinceLock({ invoiceDate: "2026-11-20T00:00:00.000Z" }, "2026-11-22"), null);
  assert.strictEqual(scheduleMovedSinceLock({ invoiceDate: "2026-11-20T00:00:00.000Z" }, "2026-12-01"), "2026-12-01");
});

check("a hand-moved invoice date moves its due date too (terms kept)", () => {
  const d = shiftedDueDate({ invoiceDate: "2026-11-20T00:00:00.000Z", dueDate: "2026-12-04T00:00:00.000Z" }, "2026-12-05T00:00:00.000Z");
  assert.strictEqual(d!.toISOString().slice(0, 10), "2026-12-19");
  assert.strictEqual(shiftedDueDate({ invoiceDate: "2026-11-20T00:00:00.000Z", dueDate: null }, "2026-12-05T00:00:00.000Z"), null);
});

check("negative terms are never carried forward", () => {
  const r = followedDates({ invoiceDate: "2026-12-05T00:00:00.000Z", dueDate: "2026-12-04T00:00:00.000Z" }, "2026-11-27")!;
  assert.strictEqual(r.dueDate!.toISOString().slice(0, 10), "2026-11-27");
});

console.log(`\ninvoice-schedule-dates: ${passed} passed`);
