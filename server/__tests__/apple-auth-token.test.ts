/**
 * Sign in with Apple token verification (server/appleIdentityToken.ts).
 *
 * Signs tokens with a throwaway RSA key and serves its public half in place
 * of Apple's key endpoint, so every check — signature, issuer, audience,
 * expiry, nonce — is exercised without the network or a database.
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/apple-auth-token.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import crypto from "node:crypto";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any) => {
  if (String(url) === "https://appleid.apple.com/auth/keys") {
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  }
  return realFetch(url);
}) as typeof fetch;

const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function token(claims: Record<string, unknown>, opts: { kid?: string; key?: crypto.KeyObject } = {}) {
  const header = enc({ alg: "RS256", kid: opts.kid ?? KID });
  const payload = enc({
    iss: "https://appleid.apple.com",
    aud: "com.buildpro.mobile",
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: "001234.abcd",
    email: "jo@example.com",
    email_verified: "true",
    ...claims,
  });
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), opts.key ?? privateKey);
  return `${header}.${payload}.${sig.toString("base64url")}`;
}

async function main() {
  const { verifyAppleIdentityToken } = await import("../appleIdentityToken");
  let passed = 0;
  const ok = async (name: string, fn: () => Promise<void>) => {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  };
  const rejects = (name: string, t: string, nonce?: string, why?: RegExp) =>
    ok(name, () => assert.rejects(verifyAppleIdentityToken(t, nonce), why));

  await ok("accepts a valid token and reads its claims", async () => {
    const id = await verifyAppleIdentityToken(token({ is_private_email: "false" }));
    assert.deepStrictEqual(id, { sub: "001234.abcd", email: "jo@example.com", emailVerified: true, isPrivateEmail: false });
  });
  await ok("accepts boolean claims as well as Apple's string ones", async () => {
    const id = await verifyAppleIdentityToken(token({ email_verified: true, is_private_email: true }));
    assert.strictEqual(id.emailVerified, true);
    assert.strictEqual(id.isPrivateEmail, true);
  });
  await ok("accepts a matching nonce (token carries sha256 of the raw value)", async () => {
    await verifyAppleIdentityToken(token({ nonce: sha256("raw-nonce") }), "raw-nonce");
  });

  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await rejects("rejects a token signed by another key", token({}, { key: other }), undefined, /bad signature/);
  await rejects("rejects an unknown key id", token({}, { kid: "nope" }), undefined, /unknown signing key/);
  await rejects("rejects another issuer", token({ iss: "https://evil.example" }), undefined, /wrong issuer/);
  await rejects("rejects another app's audience", token({ aud: "com.other.app" }), undefined, /wrong audience/);
  await rejects("rejects an expired token", token({ exp: Math.floor(Date.now() / 1000) - 1 }), undefined, /expired/);
  await rejects("rejects a wrong nonce", token({ nonce: sha256("raw-nonce") }), "different", /nonce/);
  await rejects("rejects a missing nonce claim when one was sent", token({}), "raw-nonce", /nonce/);
  await rejects("rejects a token with no subject", token({ sub: "" }), undefined, /subject/);
  await rejects("rejects a non-JWT", "not.a-token", undefined, /malformed/);

  await ok("rejects a payload edited after signing", async () => {
    const [h, , s] = token({}).split(".");
    const forged = `${h}.${enc({ iss: "https://appleid.apple.com", aud: "com.buildpro.mobile", exp: 9999999999, sub: "someone-else" })}.${s}`;
    await assert.rejects(verifyAppleIdentityToken(forged), /bad signature/);
  });

  console.log(`\napple-auth-token: ${passed} passed`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
