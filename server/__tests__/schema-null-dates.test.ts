// Run: npx tsx server/__tests__/schema-null-dates.test.ts
//
// z.coerce.date() turns null into new Date(null): 1 January 1970. On a
// nullable column, clearing a date must store NULL, so `.nullable()` has to
// wrap the coercion. This found 59 POs dated 1970 on prod (PR #354).
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  insertRfqSchema,
  insertRfiSchema,
  insertVariationSchema,
  insertClientInvoiceSchema,
  insertNoteSchema,
} from "../../shared/schema";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const field = (schema: any, key: string, value: unknown) => schema.shape[key].parse(value);

check("a cleared date stays cleared, it doesn't become 1970", () => {
  assert.strictEqual(field(insertRfqSchema, "dueDate", null), null);
  assert.strictEqual(field(insertRfqSchema, "deadline", null), null);
  assert.strictEqual(field(insertRfiSchema, "dueDate", null), null);
  assert.strictEqual(field(insertVariationSchema, "approvalDeadline", null), null);
  assert.strictEqual(field(insertClientInvoiceSchema, "dueDate", null), null);
  assert.strictEqual(field(insertNoteSchema, "completedAt", null), null);
});

check("a real date still parses", () => {
  const d = field(insertRfqSchema, "dueDate", "2026-11-20");
  assert.ok(d instanceof Date && d.getUTCFullYear() === 2026);
});

check("no optional date in the schema is left able to turn null into 1970", () => {
  // The three that remain sit on NOT NULL columns, where a date is required.
  const allowed = new Set(["signedAt", "dateIdentified", "triggeredAt"]);
  const offenders = readFileSync(new URL("../../shared/schema.ts", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*(\w+): z\.coerce\.date\(\)\.optional\(\)/)?.[1])
    .filter((f): f is string => !!f && !allowed.has(f));
  assert.deepStrictEqual(offenders, []);
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
