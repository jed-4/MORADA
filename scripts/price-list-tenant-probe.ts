// Live cross-tenant probe for the price list. Creates rows under company A, then
// tries to reach them as company B. Every attempt must come back empty.
// Run: npx tsx --env-file-if-exists=.env scripts/price-list-tenant-probe.ts
import { storage } from "../server/storage";
import { db } from "../server/db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) process.exitCode = 1;
}

const companies = await db.select({ id: schema.companies.id, name: schema.companies.name })
  .from(schema.companies).limit(5);
if (companies.length < 2) {
  console.error("need at least two companies in the dev DB; found", companies.length);
  process.exit(1);
}
const [A, B] = companies;
console.log(`company A = ${A.name} (${A.id})`);
console.log(`company B = ${B.name} (${B.id})\n`);

const listA = await storage.createPriceList({
  name: `__probe ${Date.now()}`, kind: "supplier", companyId: A.id,
} as any);
const groupA = await storage.createPriceListGroup({
  name: "__probe group", priceListId: listA.id, companyId: A.id,
} as any);
const itemA = await storage.createPriceListItem({
  name: "__probe item", priceListId: listA.id, groupId: groupA.id,
  unitType: "ea", costPrice: 1234, companyId: A.id,
} as any);

try {
  // ── reads ──────────────────────────────────────────────────────────────────
  check("getPriceList as B is empty", !(await storage.getPriceList(listA.id, B.id)));
  check("getPriceListItem as B is empty", !(await storage.getPriceListItem(itemA.id, B.id)));
  check("getPriceListGroup as B is empty", !(await storage.getPriceListGroup(groupA.id, B.id)));

  const listsB = await storage.getPriceLists(B.id);
  check("getPriceLists as B excludes A's list", !listsB.some((l) => l.id === listA.id),
        `B sees ${listsB.length} list(s)`);
  const itemsB = await storage.getPriceListItems(B.id);
  check("getPriceListItems as B excludes A's item", !itemsB.some((i) => i.id === itemA.id));
  const groupsB = await storage.getPriceListGroups(B.id);
  check("getPriceListGroups as B excludes A's group", !groupsB.some((g) => g.id === groupA.id));

  // ── writes ─────────────────────────────────────────────────────────────────
  check("updatePriceList as B is refused", !(await storage.updatePriceList(listA.id, { name: "hijacked" }, B.id)));
  check("updatePriceListItem as B is refused", !(await storage.updatePriceListItem(itemA.id, { costPrice: 1 }, B.id)));
  check("updatePriceListGroup as B is refused", !(await storage.updatePriceListGroup(groupA.id, { name: "hijacked" }, B.id)));
  check("deletePriceListItem as B is refused", !(await storage.deletePriceListItem(itemA.id, B.id)));
  check("deletePriceListGroup as B is refused", !(await storage.deletePriceListGroup(groupA.id, B.id)));
  check("deletePriceList as B is refused", !(await storage.deletePriceList(listA.id, B.id)));

  const bulk = await storage.bulkUpdatePriceListItems([{ id: itemA.id, data: { costPrice: 1 } }], B.id);
  check("bulkUpdatePriceListItems as B touches nothing", bulk.length === 0);

  // the row must be untouched after all of that
  const still = await storage.getPriceListItem(itemA.id, A.id);
  check("A's item survives intact", !!still && still.costPrice === 1234 && still.name === "__probe item",
        `costPrice=${still?.costPrice}`);

  // ── review links (the two holes with no scoping at all) ────────────────────
  const [lineA] = await db.select({ id: schema.billLineItems.id })
    .from(schema.billLineItems)
    .innerJoin(schema.bills, eq(schema.billLineItems.billId, schema.bills.id))
    .innerJoin(schema.projects, eq(schema.bills.projectId, schema.projects.id))
    .where(eq(schema.projects.companyId, A.id)).limit(1);

  if (!lineA) {
    console.log("SKIP  review-link probe — company A has no bill line items");
  } else {
    check("createBillLineItemPriceLink as B is refused",
          !(await storage.createBillLineItemPriceLink({ billLineItemId: lineA.id, reviewStatus: "pending" } as any, B.id)));

    const linkA = await storage.createBillLineItemPriceLink({ billLineItemId: lineA.id, reviewStatus: "pending" } as any, A.id);
    check("createBillLineItemPriceLink as A succeeds", !!linkA);
    if (linkA) {
      check("updateBillLineItemPriceLink as B is refused",
            !(await storage.updateBillLineItemPriceLink(linkA.id, { reviewStatus: "skipped" }, B.id)));
      check("updateBillLineItemPriceLink as A succeeds",
            !!(await storage.updateBillLineItemPriceLink(linkA.id, { reviewStatus: "skipped" }, A.id)));
      check("link cannot point at another company's price item",
            !(await storage.updateBillLineItemPriceLink(linkA.id, { priceListItemId: itemA.id }, B.id)));
      await db.delete(schema.billLineItemPriceLinks).where(eq(schema.billLineItemPriceLinks.id, linkA.id));
    }
  }
} finally {
  // Cascade takes the group and item with the list.
  await storage.deletePriceList(listA.id, A.id);
  console.log("\nprobe rows cleaned up");
}
process.exit(process.exitCode ?? 0);
