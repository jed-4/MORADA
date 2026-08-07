/**
 * Signed upload-grant tests — no database, no network.
 *
 * The grant is what replaced the validate-then-strip check on bill OCR. That
 * check compared the company segment of a caller-supplied objectPath against
 * the session and then discarded the segment, so an attacker put their OWN
 * company id in front of another tenant's UUID and the path resolved to that
 * tenant's invoice — returned AI-extracted.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/signed-grant.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "signed-grant-test-secret";

import assert from "node:assert";
import { signUploadGrant, verifyUploadGrant, signGrant, verifyGrant } from "../utils/signedGrant";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

const CO_A = "11111111-1111-1111-1111-111111111111";
const CO_B = "22222222-2222-2222-2222-222222222222";
const PATH_A = `/objects/company/${CO_A}/uploads/aaaa-1111`;
const PATH_B = `/objects/company/${CO_B}/uploads/bbbb-2222`;

console.log("\nsigned upload grants:\n");

check("a grant verifies for the path and company it was issued for", () => {
  assert.ok(verifyUploadGrant(signUploadGrant(PATH_A, CO_A), PATH_A, CO_A));
});

check("THE attack: own company id in front of another tenant's object", () => {
  // The forged path passes the old prefix check (the company segment is the
  // attacker's own) and strips to the victim's flat object.
  const victimUuid = PATH_B.split("/").pop()!;
  const forgedPath = `/objects/company/${CO_A}/uploads/${victimUuid}`;
  const grantForOwnFile = signUploadGrant(PATH_A, CO_A);
  assert.ok(
    !verifyUploadGrant(grantForOwnFile, forgedPath, CO_A),
    "a grant for one path authorised a different path — the whole point of the grant",
  );
});

check("a grant is not transferable to another company", () => {
  assert.ok(!verifyUploadGrant(signUploadGrant(PATH_A, CO_A), PATH_A, CO_B));
});

check("a grant is not transferable to another path", () => {
  assert.ok(!verifyUploadGrant(signUploadGrant(PATH_A, CO_A), PATH_B, CO_A));
});

check("an unsigned or hand-rolled grant is rejected", () => {
  const forged = Buffer.from(
    JSON.stringify({ kind: "object-upload", objectPath: PATH_A, companyId: CO_A, exp: Date.now() + 60000 }),
  ).toString("base64url");
  assert.ok(!verifyUploadGrant(forged, PATH_A, CO_A), "an unsigned body was accepted");
  assert.ok(!verifyUploadGrant(`${forged}.notasignature`, PATH_A, CO_A), "a bogus signature was accepted");
});

check("a body swapped onto a valid signature is rejected", () => {
  const real = signUploadGrant(PATH_A, CO_A);
  const signature = real.split(".")[1];
  const swapped = Buffer.from(
    JSON.stringify({ kind: "object-upload", objectPath: PATH_B, companyId: CO_A, exp: Date.now() + 60000 }),
  ).toString("base64url");
  assert.ok(!verifyUploadGrant(`${swapped}.${signature}`, PATH_B, CO_A));
});

check("an expired grant is rejected", () => {
  const expired = signGrant({ kind: "object-upload", objectPath: PATH_A, companyId: CO_A }, -1000);
  assert.ok(!verifyUploadGrant(expired, PATH_A, CO_A), "an expired grant was accepted");
});

check("a grant of a different kind cannot be replayed as an upload grant", () => {
  const other = signGrant({ kind: "something-else", objectPath: PATH_A, companyId: CO_A }, 60000);
  assert.ok(!verifyUploadGrant(other, PATH_A, CO_A));
});

check("two grants for the same path differ, and junk never throws", () => {
  assert.notStrictEqual(signUploadGrant(PATH_A, CO_A), signUploadGrant(PATH_A, CO_A));
  for (const junk of [undefined, null, "", "nodot", "a.b", 42, {}, "....."]) {
    assert.strictEqual(verifyGrant(junk), null, `junk: ${String(junk)}`);
    assert.strictEqual(verifyUploadGrant(junk, PATH_A, CO_A), false);
  }
});

console.log(`\nsigned upload grants: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
