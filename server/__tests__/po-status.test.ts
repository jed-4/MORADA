// Run: npx tsx server/__tests__/po-status.test.ts
import assert from "node:assert";
import { canMovePOStatus, poStatusMoveError } from "../../shared/poStatus";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

console.log("Forward only");
check("every step forward is allowed", () => {
  const order = ["draft", "sent", "accepted", "invoiced", "partially_paid", "paid"];
  for (let i = 0; i < order.length; i++)
    for (let j = i + 1; j < order.length; j++)
      assert.ok(canMovePOStatus(order[i], order[j]), `${order[i]} → ${order[j]}`);
});
check("no step backwards", () => {
  assert.ok(!canMovePOStatus("sent", "draft"));
  assert.ok(!canMovePOStatus("invoiced", "sent"));
  assert.ok(!canMovePOStatus("accepted", "sent"));
  assert.ok(!canMovePOStatus("partially_paid", "invoiced"));
});
check("same status is a harmless no-op", () => {
  assert.ok(canMovePOStatus("invoiced", "invoiced"));
});
check("a missing status counts as draft", () => {
  assert.ok(canMovePOStatus(null, "sent"));
});

console.log("Cancel and paid");
check("cancel from anything but paid", () => {
  for (const s of ["draft", "sent", "accepted", "invoiced", "partially_paid"])
    assert.ok(canMovePOStatus(s, "cancelled"), s);
});
check("paid is final", () => {
  assert.ok(!canMovePOStatus("paid", "cancelled"));
  assert.ok(!canMovePOStatus("paid", "invoiced"));
});
check("nothing leaves cancelled", () => {
  assert.ok(!canMovePOStatus("cancelled", "draft"));
  assert.ok(!canMovePOStatus("cancelled", "paid"));
});
check("unknown status is refused", () => {
  assert.ok(!canMovePOStatus("draft", "approved"));
});
check("errors read plainly", () => {
  assert.equal(poStatusMoveError("invoiced", "sent"), "A purchase order can't go back from Invoiced to Sent.");
  assert.match(poStatusMoveError("paid", "cancelled"), /is paid/);
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
