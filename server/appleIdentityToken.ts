import crypto from 'crypto';

/**
 * Verifies Sign in with Apple identity tokens. Pure — no database — so it can
 * be tested on its own (server/__tests__/apple-auth-token.test.ts). The route
 * that uses it is in server/appleAuth.ts.
 */

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
// Native sign-in tokens are issued to the app's bundle id.
const APPLE_AUDIENCES = (process.env.APPLE_AUDIENCES || 'com.buildpro.mobile')
  .split(',').map(s => s.trim()).filter(Boolean);

export interface AppleIdentity {
  sub: string;
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

type Jwk = crypto.JsonWebKey & { kid: string };
let keyCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function appleKeys(forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && keyCache && Date.now() - keyCache.fetchedAt < 60 * 60 * 1000) {
    return keyCache.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Apple keys fetch failed: ${res.status}`);
  const body = await res.json() as { keys: Jwk[] };
  keyCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

const b64url = (s: string) => Buffer.from(s, 'base64url');
const truthy = (v: unknown) => v === true || v === 'true';

/**
 * Verify an Apple identity token: RS256 signature against Apple's published
 * keys, issuer, audience, expiry and — when the client sent one — the nonce.
 * The client hands Apple sha256(rawNonce) and sends us the raw value, so a
 * token lifted from another sign-in can't be replayed without its nonce.
 */
export async function verifyAppleIdentityToken(token: string, rawNonce?: string): Promise<AppleIdentity> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = JSON.parse(b64url(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64url(parts[1]).toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected token algorithm');

  let jwk = (await appleKeys()).find(k => k.kid === header.kid);
  // Apple rotates keys; an unknown kid means our cache may be stale.
  if (!jwk) jwk = (await appleKeys(true)).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    b64url(parts[2]),
  );
  if (!valid) throw new Error('bad signature');

  if (payload.iss !== APPLE_ISSUER) throw new Error('wrong issuer');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a: string) => APPLE_AUDIENCES.includes(a))) throw new Error('wrong audience');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) throw new Error('token expired');
  if (rawNonce !== undefined) {
    const expected = crypto.createHash('sha256').update(rawNonce).digest('hex');
    if (payload.nonce !== expected) throw new Error('nonce mismatch');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no subject');

  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: truthy(payload.email_verified),
    isPrivateEmail: truthy(payload.is_private_email),
  };
}
