/**
 * Signed OAuth state tests.
 *
 * The bill-inbox OAuth callback is necessarily unauthenticated — Google
 * redirects the browser to it — so the `state` round-trip is the only thing
 * that tells the server which company the Gmail consent belongs to. Before
 * this was signed, anyone could hand an admin a callback URL naming any
 * company and bind their own Gmail account into that company's bill inbox
 * (and read every invoice that landed there).
 *
 * These are pure function tests — no database, no network.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/oauth-state.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "oauth-state-test-secret";

import assert from "node:assert";
import { signOAuthState, verifyOAuthState } from "../services/googleOAuthService";

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

const COMPANY_A = "11111111-1111-1111-1111-111111111111";
const COMPANY_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

console.log("oauth state:");

check("round-trips the issuing company and user", () => {
  const state = signOAuthState({ action: "bill-inbox", companyId: COMPANY_A, userId: USER_A });
  const verified = verifyOAuthState(state, "bill-inbox");
  assert.ok(verified, "expected the state we just signed to verify");
  assert.strictEqual(verified!.companyId, COMPANY_A);
  assert.strictEqual(verified!.userId, USER_A);
});

check("two states for the same company differ (nonce)", () => {
  const a = signOAuthState({ action: "bill-inbox", companyId: COMPANY_A, userId: USER_A });
  const b = signOAuthState({ action: "bill-inbox", companyId: COMPANY_A, userId: USER_A });
  assert.notStrictEqual(a, b, "states must not be replayable-by-construction");
});

check("rejects an unsigned state (the old format)", () => {
  const legacy = Buffer.from(
    JSON.stringify({ action: "bill-inbox", timestamp: Date.now() }),
  ).toString("base64");
  assert.strictEqual(verifyOAuthState(legacy, "bill-inbox"), null);
});

check("rejects a forged state naming another company", () => {
  // The attack: hand-roll a state pointing at company B and hope the server
  // trusts the body without checking the signature.
  const body = Buffer.from(
    JSON.stringify({
      action: "bill-inbox",
      companyId: COMPANY_B,
      userId: USER_A,
      nonce: "deadbeef",
      timestamp: Date.now(),
    }),
  ).toString("base64url");
  assert.strictEqual(verifyOAuthState(`${body}.notarealsignature`, "bill-inbox"), null);
});

check("rejects a body swapped onto a valid signature", () => {
  const state = signOAuthState({ action: "bill-inbox", companyId: COMPANY_A, userId: USER_A });
  const signature = state.split(".")[1];
  const swapped = Buffer.from(
    JSON.stringify({
      action: "bill-inbox",
      companyId: COMPANY_B,
      userId: USER_A,
      nonce: "deadbeef",
      timestamp: Date.now(),
    }),
  ).toString("base64url");
  assert.strictEqual(verifyOAuthState(`${swapped}.${signature}`, "bill-inbox"), null);
});

check("rejects a state signed for a different action", () => {
  const state = signOAuthState({ action: "calendar", companyId: COMPANY_A, userId: USER_A });
  assert.strictEqual(verifyOAuthState(state, "bill-inbox"), null);
});

check("rejects an expired state", () => {
  const realNow = Date.now;
  try {
    // Sign 11 minutes ago; the window is 10.
    Date.now = () => realNow() - 11 * 60 * 1000;
    const state = signOAuthState({ action: "bill-inbox", companyId: COMPANY_A, userId: USER_A });
    Date.now = realNow;
    assert.strictEqual(verifyOAuthState(state, "bill-inbox"), null);
  } finally {
    Date.now = realNow;
  }
});

check("rejects junk without throwing", () => {
  for (const junk of [undefined, null, "", "nodot", "a.b", 42, {}, "....."]) {
    assert.strictEqual(verifyOAuthState(junk, "bill-inbox"), null, `junk: ${String(junk)}`);
  }
});

console.log(`\noauth state: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
