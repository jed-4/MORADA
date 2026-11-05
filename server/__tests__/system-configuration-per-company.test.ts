// Run: npx tsx server/__tests__/system-configuration-per-company.test.ts
//
// System configuration used to be one row for the whole app, so one
// company's admin saving a bill prefix changed every company's. Each company
// now has its own row (migration 0124). The DbStorage path was checked on dev
// (2026-11-04): a PUT changed only the caller's row, the other 17 kept BILL-.
import "dotenv/config";
import assert from "node:assert";
import { MemStorage } from "../storage";

let failed = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const storage = new MemStorage();

await check("one company's save does not change another's", async () => {
  await storage.updateSystemConfiguration("company-a", { billPrefix: "A-" } as any);
  await storage.updateSystemConfiguration("company-b", { billPrefix: "B-" } as any);
  assert.equal((await storage.getSystemConfiguration("company-a"))?.billPrefix, "A-");
  assert.equal((await storage.getSystemConfiguration("company-b"))?.billPrefix, "B-");
});

await check("a second save updates the company's own row", async () => {
  await storage.updateSystemConfiguration("company-a", { timezone: "Australia/Perth" } as any);
  const a = await storage.getSystemConfiguration("company-a");
  assert.equal(a?.timezone, "Australia/Perth");
  assert.equal(a?.billPrefix, "A-");
  assert.equal(a?.companyId, "company-a");
});

await check("a company with no row gets nothing of another company's", async () => {
  assert.equal(await storage.getSystemConfiguration("company-c"), undefined);
});

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("all passed");
process.exit(0);
