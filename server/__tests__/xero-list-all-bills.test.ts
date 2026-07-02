/**
 * Xero listAllBills pagination unit tests (Task #389).
 *
 * The bill import preview must fetch EVERY page of Xero bills (100 per page),
 * not just the first — bills beyond the 100 most recent were silently missing
 * from the import list. These tests stub listBills (the single-page fetch) and
 * verify the aggregation loop in listAllBills:
 *
 *   1. A short (<100) page terminates pagination and all pages are aggregated.
 *   2. An exactly-100-bill final page followed by an empty page terminates.
 *   3. A mid-pagination 429 error propagates (no silent partial result).
 *   4. maxPages caps runaway pagination.
 *   5. Per-page options (modifiedSince, statuses, maxRetries) are forwarded.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/xero-list-all-bills.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { XeroService } from "../services/xeroService";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err?.message || err}`);
    console.error(`  ✗ ${name}: ${err?.message || err}`);
  }
}

function makeBills(count: number, pagePrefix: string): any[] {
  return Array.from({ length: count }, (_, i) => ({ InvoiceID: `${pagePrefix}-${i}` }));
}

/** Build a XeroService whose listBills is replaced with a scripted stub. */
function stubService(pages: (any[] | Error)[], calls: any[]): XeroService {
  const svc = new XeroService();
  (svc as any).listBills = async (_connectionId: string, opts: any) => {
    calls.push(opts);
    const idx = (opts.page || 1) - 1;
    const result = pages[idx];
    if (result === undefined) throw new Error(`unexpected page ${opts.page}`);
    if (result instanceof Error) throw result;
    return result;
  };
  return svc;
}

async function main() {
  console.log("Xero listAllBills pagination tests");

  await test("aggregates all pages and stops on a short page", async () => {
    const calls: any[] = [];
    const svc = stubService(
      [makeBills(100, "p1"), makeBills(100, "p2"), makeBills(37, "p3")],
      calls,
    );
    const all = await svc.listAllBills("conn-1", {});
    assert.strictEqual(all.length, 237, `expected 237 bills, got ${all.length}`);
    assert.strictEqual(calls.length, 3, `expected 3 page fetches, got ${calls.length}`);
    assert.strictEqual(all[0].InvoiceID, "p1-0");
    assert.strictEqual(all[236].InvoiceID, "p3-36");
  });

  await test("an exactly-100 final page is followed by one empty fetch then stops", async () => {
    const calls: any[] = [];
    const svc = stubService([makeBills(100, "p1"), []], calls);
    const all = await svc.listAllBills("conn-1", {});
    assert.strictEqual(all.length, 100);
    assert.strictEqual(calls.length, 2);
  });

  await test("single short page needs only one fetch", async () => {
    const calls: any[] = [];
    const svc = stubService([makeBills(5, "p1")], calls);
    const all = await svc.listAllBills("conn-1", {});
    assert.strictEqual(all.length, 5);
    assert.strictEqual(calls.length, 1);
  });

  await test("mid-pagination 429 propagates as an error (no silent partial set)", async () => {
    const calls: any[] = [];
    const rateLimitError = new Error(
      "Xero is rate-limiting requests right now (429). Please wait a minute and try again.",
    );
    const svc = stubService([makeBills(100, "p1"), rateLimitError], calls);
    await assert.rejects(
      () => svc.listAllBills("conn-1", { maxRetries: 0 }),
      /rate-limiting/,
    );
    assert.strictEqual(calls.length, 2);
  });

  await test("maxPages caps pagination", async () => {
    const calls: any[] = [];
    const svc = stubService(
      Array.from({ length: 10 }, (_, i) => makeBills(100, `p${i + 1}`)),
      calls,
    );
    const all = await svc.listAllBills("conn-1", { maxPages: 3 });
    assert.strictEqual(all.length, 300);
    assert.strictEqual(calls.length, 3);
  });

  await test("forwards modifiedSince / statuses / maxRetries to every page fetch", async () => {
    const calls: any[] = [];
    const svc = stubService([makeBills(100, "p1"), makeBills(1, "p2")], calls);
    const since = new Date("2026-01-01T00:00:00Z");
    await svc.listAllBills("conn-1", {
      modifiedSince: since,
      statuses: ["AUTHORISED"],
      maxRetries: 0,
    });
    assert.strictEqual(calls.length, 2);
    for (const [i, c] of calls.entries()) {
      assert.strictEqual(c.page, i + 1);
      assert.strictEqual(c.modifiedSince, since);
      assert.deepStrictEqual(c.statuses, ["AUTHORISED"]);
      assert.strictEqual(c.maxRetries, 0);
    }
  });

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.error(`FAIL: ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
