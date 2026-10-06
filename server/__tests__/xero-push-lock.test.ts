/**
 * One Morada bill must never become two Xero bills.
 *
 * BILL-1743 was pushed to Xero twice and exists there as two authorised ACCPAY
 * bills, one second apart, under the same Reference and with different account
 * codes. Nothing noticed: Morada stores one InvoiceID and has no idea the other
 * copy exists, so the supplier's invoice sits in the accounts twice.
 *
 * The cause was two pushes, not a double click. Saving a bill fires BOTH:
 *   - the save handler schedules an auto-push on a 2s debounce, and
 *   - the client then calls POST /api/xero/push-bill itself.
 * Usually the explicit push stores xero_invoice_id before the auto-push reads
 * the bill, so the second one updates. But the push makes several Xero round
 * trips before it creates anything, so when it runs slow the auto-push still
 * sees no link — and creates.
 *
 * `claimXeroPush` is the mutex that closes it. These tests run against the
 * database because that is the only place the guarantee means anything: it is
 * one conditional UPDATE, and what is being proved is that two callers racing
 * for the same row cannot both win.
 *
 * Needs DATABASE_URL. Writes only to a bill row it creates and deletes.
 *
 * Run with:  npx tsx server/__tests__/xero-push-lock.test.ts
 */

import "dotenv/config";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { bills as billsTable, companies } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  const [company] = await db.select().from(companies).limit(1);
  assert.ok(company, "needs at least one company in the database");

  const billId = randomUUID();
  await db.insert(billsTable).values({
    id: billId,
    companyId: company.id,
    billNumber: `TEST-LOCK-${billId.slice(0, 8)}`,
    status: "draft",
    billDate: new Date(),
  } as any);

  try {
    console.log("\nXero push lock\n");

    await test("two racing pushes: exactly one gets the claim", async () => {
      // The whole bug in one assertion. Before this guard both callers carried
      // on and both reached createBill.
      const results = await Promise.all([
        storage.claimXeroPush(billId),
        storage.claimXeroPush(billId),
        storage.claimXeroPush(billId),
        storage.claimXeroPush(billId),
      ]);
      assert.strictEqual(results.filter(Boolean).length, 1, `got ${results.filter(Boolean).length} winners`);
    });

    await test("a held claim keeps everyone else out", async () => {
      assert.strictEqual(await storage.claimXeroPush(billId), false);
    });

    await test("releasing lets the next push in", async () => {
      await storage.releaseXeroPush(billId);
      assert.strictEqual(await storage.claimXeroPush(billId), true);
      await storage.releaseXeroPush(billId);
    });

    await test("a crashed push does not wedge the bill forever", async () => {
      // A process that dies mid-push never releases. Without a stale timeout the
      // bill could never sync again — worse than the duplicate it prevents.
      await db.update(billsTable)
        .set({ xeroPushInFlightAt: new Date(Date.now() - 10 * 60 * 1000) })
        .where(eq(billsTable.id, billId));

      assert.strictEqual(await storage.claimXeroPush(billId, 5 * 60 * 1000), true, "10-minute-old claim is stale");
      await storage.releaseXeroPush(billId);

      await db.update(billsTable)
        .set({ xeroPushInFlightAt: new Date(Date.now() - 60 * 1000) })
        .where(eq(billsTable.id, billId));
      assert.strictEqual(await storage.claimXeroPush(billId, 5 * 60 * 1000), false, "1-minute-old claim is still live");
      await storage.releaseXeroPush(billId);
    });

    await test("the claim is per bill, not global", async () => {
      const otherId = randomUUID();
      await db.insert(billsTable).values({
        id: otherId,
        companyId: company.id,
        billNumber: `TEST-LOCK-${otherId.slice(0, 8)}`,
        status: "draft",
        billDate: new Date(),
      } as any);
      try {
        assert.strictEqual(await storage.claimXeroPush(billId), true);
        assert.strictEqual(await storage.claimXeroPush(otherId), true, "a different bill must still be pushable");
      } finally {
        await storage.releaseXeroPush(billId);
        await db.delete(billsTable).where(eq(billsTable.id, otherId));
      }
    });

    await test("release is safe to call when nothing is held", async () => {
      await storage.releaseXeroPush(billId);
      await storage.releaseXeroPush(billId);
      const [row] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
      assert.strictEqual(row.xeroPushInFlightAt, null);
    });

    console.log(`\n${passed} passed\n`);
  } finally {
    await db.delete(billsTable).where(eq(billsTable.id, billId));
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
