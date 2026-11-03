import assert from "node:assert";
import { decidePOAccess, narrowPOList, poActionFor, PO_MOUNT, type POGateInput } from "../poAccessPolicy";
import { updatePurchaseOrderItemSchema, updatePurchaseOrderSchema } from "../../shared/schema";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const me = { id: "u1", companyId: "c1", userCategory: "team" };
const base: POGateInput = { action: "view", baseUrl: PO_MOUNT, path: "/", user: me, hasPOPermission: false, hasBillView: false };
const sitePO = { companyId: "c1", poType: "site", createdById: "u1", supplierUserId: null };

console.log("action mapping");
check("each write maps to its permission action", () => {
  assert.equal(poActionFor("GET", PO_MOUNT, "/abc"), "view");
  assert.equal(poActionFor("POST", PO_MOUNT, "/"), "add");
  assert.equal(poActionFor("POST", PO_MOUNT, "/abc/duplicate"), "add");
  assert.equal(poActionFor("POST", PO_MOUNT, "/abc/send"), "send");
  assert.equal(poActionFor("POST", PO_MOUNT, "/bulk-status"), "edit");
  assert.equal(poActionFor("POST", PO_MOUNT, "/abc/items"), "edit");
  assert.equal(poActionFor("PATCH", PO_MOUNT, "/abc"), "edit");
  assert.equal(poActionFor("DELETE", PO_MOUNT, "/abc"), "delete");
  assert.equal(poActionFor("DELETE", PO_MOUNT, "/abc/items/i1"), "edit");
  assert.equal(poActionFor("DELETE", "/api/purchase-order-items", "/i1"), "edit");
});

console.log("access");
check("the permission allows everything it names", () => {
  assert.equal(decidePOAccess({ ...base, action: "delete", path: "/p1", hasPOPermission: true }), "full");
});
check("no permission: list is narrowed, main PO is refused", () => {
  assert.equal(decidePOAccess(base), "limited");
  assert.equal(decidePOAccess({ ...base, path: "/p1", po: { ...sitePO, poType: "main", createdById: "x" } }), "deny");
});
check("bill users can read but not write", () => {
  assert.equal(decidePOAccess({ ...base, path: "/p1", hasBillView: true }), "full");
  assert.equal(decidePOAccess({ ...base, action: "edit", path: "/p1", po: { ...sitePO, poType: "main" } }), "deny");
});
check("a site worker can raise and run their own site PO only", () => {
  assert.equal(decidePOAccess({ ...base, action: "add", body: { type: "site" } }), "limited");
  assert.equal(decidePOAccess({ ...base, action: "add", body: { type: "main" } }), "deny");
  assert.equal(decidePOAccess({ ...base, path: "/next-number/site" }), "limited");
  assert.equal(decidePOAccess({ ...base, action: "edit", path: "/p1", po: sitePO }), "limited");
  assert.equal(decidePOAccess({ ...base, action: "edit", path: "/p1", po: { ...sitePO, createdById: "x" } }), "deny");
});
check("a non-team user cannot raise a site PO", () => {
  assert.equal(decidePOAccess({ ...base, action: "add", body: { type: "site" }, user: { ...me, userCategory: "supplier" } }), "deny");
});
check("the supplier on a PO can read it, not change it", () => {
  const po = { ...sitePO, poType: "main", createdById: "x", supplierUserId: "u1" };
  assert.equal(decidePOAccess({ ...base, path: "/p1", po }), "limited");
  assert.equal(decidePOAccess({ ...base, action: "edit", path: "/p1", po }), "deny");
});
check("another company's PO is refused, even if the ids match", () => {
  assert.equal(decidePOAccess({ ...base, path: "/p1", po: { ...sitePO, companyId: "c2" } }), "deny");
});
check("items, attachments and templates need the permission", () => {
  assert.equal(decidePOAccess({ ...base, action: "edit", baseUrl: "/api/purchase-order-items", path: "/i1" }), "deny");
});
check("narrowed list keeps own site POs and POs I supply", () => {
  const rows = [
    { id: "own", poType: "site", createdById: "u1", supplierUserId: null },
    { id: "other", poType: "site", createdById: "x", supplierUserId: null },
    { id: "main", poType: "main", createdById: "u1", supplierUserId: null },
    { id: "mine", poType: "main", createdById: "x", supplierUserId: "u1" },
  ];
  assert.deepEqual(narrowPOList(rows, "u1").map((r) => r.id), ["own", "mine"]);
});

console.log("write whitelist");
check("PATCH drops tenant, number, money and Xero fields", () => {
  const out: any = updatePurchaseOrderSchema.parse({
    title: "t", companyId: "c2", projectId: "p2", poNumber: "X", total: 1, subtotal: 1, gstAmount: 1,
    createdById: "x", approvedById: "x", matchedBillId: "b", xeroPurchaseOrderId: "x",
  });
  assert.deepEqual(Object.keys(out), ["title"]);
});
check("PATCH adds no defaults, so a partial save cannot reset a field", () => {
  assert.deepEqual(updatePurchaseOrderSchema.parse({ supplierId: null, supplierUserId: "u" }), { supplierId: null, supplierUserId: "u" });
  assert.deepEqual(updatePurchaseOrderSchema.parse({ scopeStageId: "s" }), { scopeStageId: "s" });
});
check("a line cannot move PO or claim a timesheet", () => {
  const out: any = updatePurchaseOrderItemSchema.parse({ description: "d", purchaseOrderId: "p2", sourceTimesheetId: "t2" });
  assert.equal("purchaseOrderId" in out, false);
  assert.equal("sourceTimesheetId" in out, false);
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
