/**
 * Xero duplicate-bill cleanup integration tests (Task #366).
 *
 * A race in the Xero bill import (check-then-insert with no DB-level uniqueness)
 * created duplicate local bills for the same Xero invoice. server/services/
 * xeroBillDedup.ts collapses every (company_id, xero_invoice_id) group down to
 * the OLDEST bill, after moving payments / attachments / invoice & variation
 * links / PO matched_bill_id references onto the kept original.
 *
 * What is verified:
 *   1. Dry-run reports the correct counts and writes NOTHING.
 *   2. Real-run keeps only the oldest bill per group; copies are deleted.
 *   3. Payments on copies are repointed to the keeper.
 *   4. attachment_urls from copies are merged into the keeper (de-duplicated).
 *   5. invoice_bills / variation_bills links are repointed, collisions dropped.
 *   6. purchase_orders.matched_bill_id pointing at a copy is repointed.
 *   7. Copy line items are deleted with the copy (NOT reparented).
 *   8. The operation is idempotent — a second real-run is a no-op.
 *   9. Bills with a null xero_invoice_id are never touched.
 *
 * The test seeds a throwaway company + project directly through the storage /
 * db layer, exercises the service in-process, and deletes everything it created
 * in cleanup. Run with NODE_ENV=test so the production DB guard stays off.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/xero-bill-dedup.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { db, pool } from "../db";
import {
  bills as billsTable,
  billLineItems,
  billPayments,
  invoiceBills,
  variationBills,
  purchaseOrders,
  clientInvoices,
  variations,
  projects as projectsTable,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { dedupXeroBills } from "../services/xeroBillDedup";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.error(`  \u2717 ${name}\n      ${err?.stack || err?.message || err}`);
  }
}

const tag = `dedup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let companyId = "";
let userId = "";
let projectId = "";

async function insertBill(opts: {
  xeroInvoiceId: string | null;
  createdAt: Date;
  attachmentUrls?: unknown[];
}): Promise<string> {
  const id = randomUUID();
  await db.insert(billsTable).values({
    id,
    billNumber: `${tag}-BILL-${randomUUID().slice(0, 8)}`,
    companyId,
    projectId,
    billType: "bill",
    status: "draft",
    billDate: new Date(),
    subtotal: 1000,
    tax: 100,
    total: 1100,
    xeroInvoiceId: opts.xeroInvoiceId,
    attachmentUrls: (opts.attachmentUrls ?? []) as any,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  } as any);
  // A line item, so we can prove copy line items get deleted (not reparented).
  await db.insert(billLineItems).values({
    billId: id,
    description: "line",
    quantity: 1,
    unitPrice: 1000,
    total: 1000,
  } as any);
  return id;
}

async function countLineItems(billIds: string[]): Promise<number> {
  if (billIds.length === 0) return 0;
  const rows = await db
    .select({ id: billLineItems.id })
    .from(billLineItems)
    .where(inArray(billLineItems.billId, billIds));
  return rows.length;
}

async function main() {
  console.log(`\nXero bill dedup tests (tag ${tag})\n`);

  // ── Seed company + project ────────────────────────────────────────────────
  const user = await storage.createUser({
    email: `${tag}@dedup.local`,
    passwordHash: "x",
    firstName: "Dedup",
    lastName: "Test",
  } as any);
  userId = user.id;
  const company = await storage.createCompany({ name: `Dedup Co ${tag}` } as any, userId);
  companyId = company.id;
  projectId = randomUUID();
  await db.insert(projectsTable).values({
    id: projectId,
    name: `Dedup Project ${tag}`,
    companyId,
    projectSubStatus: "lead_new",
  } as any);

  const createdBillIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdVariationIds: string[] = [];
  const createdPoIds: string[] = [];

  try {
    const xeroId = `XINV-${tag}`;

    // Oldest = keeper. Two copies (newer).
    const t0 = new Date("2025-01-01T00:00:00Z");
    const t1 = new Date("2025-02-01T00:00:00Z");
    const t2 = new Date("2025-03-01T00:00:00Z");

    const keeperId = await insertBill({
      xeroInvoiceId: xeroId,
      createdAt: t0,
      attachmentUrls: [{ objectPath: "/objects/keeper.pdf", filename: "keeper.pdf" }],
    });
    const copy1Id = await insertBill({
      xeroInvoiceId: xeroId,
      createdAt: t1,
      attachmentUrls: [
        { objectPath: "/objects/copy1.pdf", filename: "copy1.pdf" },
        { objectPath: "/objects/keeper.pdf", filename: "keeper.pdf" }, // dup of keeper
      ],
    });
    const copy2Id = await insertBill({
      xeroInvoiceId: xeroId,
      createdAt: t2,
      attachmentUrls: [{ objectPath: "/objects/copy2.pdf", filename: "copy2.pdf" }],
    });
    // A manually-entered bill with no xeroInvoiceId — must never be touched.
    const manualId = await insertBill({ xeroInvoiceId: null, createdAt: t0 });
    createdBillIds.push(keeperId, copy1Id, copy2Id, manualId);

    // Payments: one on each copy.
    await db.insert(billPayments).values([
      { billId: copy1Id, amount: 500, paymentDate: new Date() },
      { billId: copy2Id, amount: 600, paymentDate: new Date() },
    ] as any);

    // Client invoices + links.
    //  - invA: keeper already linked; copy1 also linked (collision with keeper → dropped).
    //  - invB: BOTH copies linked, keeper has none → exactly one moved, the other
    //    dropped as a cross-copy duplicate (the case the first cut missed).
    const invA = randomUUID();
    const invB = randomUUID();
    await db.insert(clientInvoices).values([
      { id: invA, name: `${tag}-invA`, projectId, invoiceDate: new Date() },
      { id: invB, name: `${tag}-invB`, projectId, invoiceDate: new Date() },
    ] as any);
    createdInvoiceIds.push(invA, invB);
    await db.insert(invoiceBills).values([
      { invoiceId: invA, billId: keeperId },
      { invoiceId: invA, billId: copy1Id }, // collision with keeper → dropped
      { invoiceId: invB, billId: copy1Id }, // cross-copy dup with copy2's invB
      { invoiceId: invB, billId: copy2Id }, // → one moved, one dropped
    ] as any);

    // Variations + links.
    //  - varA: keeper already linked; copy2 also linked (collision → dropped).
    //  - varB: BOTH copies linked, keeper has none → one moved, one dropped.
    const varA = randomUUID();
    const varB = randomUUID();
    await db.insert(variations).values([
      { id: varA, variationNumber: `${tag}-VA`, projectId, name: "varA" },
      { id: varB, variationNumber: `${tag}-VB`, projectId, name: "varB" },
    ] as any);
    createdVariationIds.push(varA, varB);
    await db.insert(variationBills).values([
      { variationId: varA, billId: keeperId },
      { variationId: varA, billId: copy2Id }, // collision with keeper → dropped
      { variationId: varB, billId: copy1Id }, // cross-copy dup with copy2's varB
      { variationId: varB, billId: copy2Id }, // → one moved, one dropped
    ] as any);

    // PO with matched_bill_id pointing at copy1.
    const poId = randomUUID();
    await db.insert(purchaseOrders).values({
      id: poId,
      companyId,
      projectId,
      poNumber: `${tag}-PO`,
      poType: "main",
      createdById: userId,
      matchedBillId: copy1Id,
    } as any);
    createdPoIds.push(poId);

    // ── 1) Dry-run reports correctly and writes nothing ─────────────────────
    await test("dry-run reports correct counts and writes nothing", async () => {
      const before = await db
        .select({ id: billsTable.id })
        .from(billsTable)
        .where(eq(billsTable.xeroInvoiceId, xeroId));
      const report = await dedupXeroBills({ dryRun: true });
      const grp = report.groups.find((g) => g.xeroInvoiceId === xeroId);
      assert.ok(grp, "group not reported");
      assert.strictEqual(grp!.keeperBillId, keeperId, "keeper should be the oldest");
      assert.deepStrictEqual(grp!.copyBillIds.sort(), [copy1Id, copy2Id].sort());
      assert.strictEqual(grp!.paymentsMoved, 2, "payments count");
      assert.strictEqual(grp!.attachmentsMergedCount, 2, "copy1.pdf + copy2.pdf (keeper.pdf deduped)");
      assert.strictEqual(grp!.invoiceLinksMoved, 1, "exactly one invB link moved");
      assert.strictEqual(grp!.invoiceLinksDropped, 2, "invA collision + one cross-copy invB dup");
      assert.strictEqual(grp!.variationLinksMoved, 1, "exactly one varB link moved");
      assert.strictEqual(grp!.variationLinksDropped, 2, "varA collision + one cross-copy varB dup");
      assert.strictEqual(grp!.poMatchesRepointed, 1, "PO repointed");

      // Backup captures every row that would be deleted, including dropped links.
      const bk = report.backup.find((b) => b.xeroInvoiceId === xeroId);
      assert.ok(bk, "backup entry present");
      assert.strictEqual(bk!.deletedBills.length, 2, "both copies backed up");
      assert.strictEqual(bk!.deletedInvoiceBills.length, 2, "dropped invoice links backed up");
      assert.strictEqual(bk!.deletedVariationBills.length, 2, "dropped variation links backed up");

      // Nothing changed in the DB.
      const after = await db
        .select({ id: billsTable.id })
        .from(billsTable)
        .where(eq(billsTable.xeroInvoiceId, xeroId));
      assert.strictEqual(after.length, before.length, "dry-run must not delete bills");
      assert.strictEqual(after.length, 3, "all 3 bills still present after dry-run");
    });

    // ── 2-7) Real run ───────────────────────────────────────────────────────
    await test("real-run collapses the group and repoints dependent data", async () => {
      await dedupXeroBills({ dryRun: false });

      // Only the keeper remains for this xero invoice.
      const remaining = await db
        .select({ id: billsTable.id })
        .from(billsTable)
        .where(eq(billsTable.xeroInvoiceId, xeroId));
      assert.strictEqual(remaining.length, 1, "only one bill should remain");
      assert.strictEqual(remaining[0].id, keeperId, "the keeper should survive");

      // Copies are gone.
      const copies = await db
        .select({ id: billsTable.id })
        .from(billsTable)
        .where(inArray(billsTable.id, [copy1Id, copy2Id]));
      assert.strictEqual(copies.length, 0, "copies deleted");

      // Copy line items deleted (cascade), keeper's line item intact.
      assert.strictEqual(await countLineItems([copy1Id, copy2Id]), 0, "copy line items deleted");
      assert.strictEqual(await countLineItems([keeperId]), 1, "keeper line item NOT duplicated");

      // Payments moved to keeper.
      const pays = await db
        .select({ id: billPayments.id })
        .from(billPayments)
        .where(eq(billPayments.billId, keeperId));
      assert.strictEqual(pays.length, 2, "both payments now on keeper");

      // Attachments merged + de-duplicated on keeper.
      const [keeperRow] = await db
        .select({ attachmentUrls: billsTable.attachmentUrls })
        .from(billsTable)
        .where(eq(billsTable.id, keeperId));
      const paths = ((keeperRow.attachmentUrls as any[]) || []).map((a) => a.objectPath).sort();
      assert.deepStrictEqual(
        paths,
        ["/objects/copy1.pdf", "/objects/copy2.pdf", "/objects/keeper.pdf"],
        "attachments merged and de-duplicated",
      );

      // invoice_bills: keeper linked to invA and invB; the collision row dropped.
      const invLinks = await db
        .select({ invoiceId: invoiceBills.invoiceId })
        .from(invoiceBills)
        .where(eq(invoiceBills.billId, keeperId));
      assert.deepStrictEqual(invLinks.map((r) => r.invoiceId).sort(), [invA, invB].sort());

      // variation_bills: keeper linked to varA and varB; the collision dropped.
      const varLinks = await db
        .select({ variationId: variationBills.variationId })
        .from(variationBills)
        .where(eq(variationBills.billId, keeperId));
      assert.deepStrictEqual(varLinks.map((r) => r.variationId).sort(), [varA, varB].sort());

      // PO matched_bill_id repointed to keeper.
      const [po] = await db
        .select({ matchedBillId: purchaseOrders.matchedBillId })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId));
      assert.strictEqual(po.matchedBillId, keeperId, "PO repointed to keeper");
    });

    // ── 8) Idempotency ──────────────────────────────────────────────────────
    await test("second real-run is a no-op", async () => {
      const report = await dedupXeroBills({ dryRun: false });
      const grp = report.groups.find((g) => g.xeroInvoiceId === xeroId);
      assert.strictEqual(grp, undefined, "no duplicate group should remain");
    });

    // ── 9) Null xero_invoice_id untouched ───────────────────────────────────
    await test("manual bill with null xero_invoice_id is untouched", async () => {
      const [m] = await db
        .select({ id: billsTable.id })
        .from(billsTable)
        .where(eq(billsTable.id, manualId));
      assert.ok(m, "manual bill must still exist");
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failures.length) console.error("Failed:\n  - " + failures.join("\n  - "));
    await cleanup(createdBillIds, createdInvoiceIds, createdVariationIds, createdPoIds);
  }
}

async function cleanup(
  billIds: string[],
  invoiceIds: string[],
  variationIds: string[],
  poIds: string[],
) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM purchase_orders WHERE id = ANY($1)`, [poIds]],
    [`DELETE FROM variation_bills WHERE variation_id = ANY($1)`, [variationIds]],
    [`DELETE FROM invoice_bills WHERE invoice_id = ANY($1)`, [invoiceIds]],
    [`DELETE FROM variations WHERE id = ANY($1)`, [variationIds]],
    [`DELETE FROM client_invoices WHERE id = ANY($1)`, [invoiceIds]],
    [`DELETE FROM bills WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)`, [companyId]],
    [`DELETE FROM projects WHERE company_id = $1`, [companyId]],
    [`DELETE FROM sessions WHERE sess->>'userId' = $1`, [userId]],
    [`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM user_roles WHERE company_id = $1)`, [companyId]],
    [`DELETE FROM users WHERE company_id = $1`, [companyId]],
    [`DELETE FROM users WHERE id = $1`, [userId]],
    [`DELETE FROM user_roles WHERE company_id = $1`, [companyId]],
    [`DELETE FROM companies WHERE id = $1`, [companyId]],
  ];
  for (const [sql, params] of stmts) {
    try {
      await pool.query(sql, params);
    } catch (err: any) {
      console.warn(`[cleanup] skipped: ${err?.message || err}`);
    }
  }
}

main()
  .then(async () => {
    try {
      await pool.end();
    } catch {}
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("\nFATAL: test harness crashed\n", err);
    try {
      await cleanup([], [], [], []);
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });
