// Run: npx tsx server/__tests__/po-accept-token.test.ts
import assert from "node:assert";

import { poAcceptToken, readPoAcceptToken, poAcceptUrl } from "../utils/poAcceptToken";

// The secret is read when signing, so setting it here is early enough.
process.env.SESSION_SECRET = "test-secret";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const id = "9b8a8120-5acc-4358-8492-880ba9415e3d";
check("a token reads back to its PO", () => assert.equal(readPoAcceptToken(poAcceptToken(id)), id));
check("the same PO always gets the same link", () => assert.equal(poAcceptToken(id), poAcceptToken(id)));
check("swapping the PO id is refused", () => {
  const sig = poAcceptToken(id).split(".")[1];
  assert.equal(readPoAcceptToken(`d03ea6b1-b23e-40b1-a837-8a3a8914d28e.${sig}`), null);
});
check("a tampered signature is refused", () => assert.equal(readPoAcceptToken(poAcceptToken(id).slice(0, -1) + "x"), null));
check("junk is refused", () => {
  assert.equal(readPoAcceptToken("nope"), null);
  assert.equal(readPoAcceptToken(`${id}.`), null);
});
check("a different secret gives a different token", () => {
  const before = poAcceptToken(id);
  process.env.SESSION_SECRET = "other";
  assert.notEqual(poAcceptToken(id), before);
  assert.equal(readPoAcceptToken(before), null);
  process.env.SESSION_SECRET = "test-secret";
});
check("link lands on the portal page", () =>
  assert.equal(poAcceptUrl("https://app.example.com/", id), `https://app.example.com/portal/po/${poAcceptToken(id)}`));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
