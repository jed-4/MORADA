import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Short-lived, server-issued, HMAC-signed claims.
 *
 * Generalised from the OAuth state signing added for the bill inbox. Use this
 * wherever the server needs to hand a client a value it will hand back, and
 * the server must be able to trust it — a claim the client cannot forge or
 * tamper with, and that expires.
 *
 * The object-storage case: the bucket is flat, and the company segment in
 * /objects/company/<id>/uploads/<uuid> is caller-supplied and stripped before
 * the storage lookup. Checking that segment against the session proves nothing,
 * because an attacker puts their OWN company id in front of someone else's
 * UUID. A grant issued at upload time binds the path to the company that
 * actually uploaded it, which the caller cannot rewrite.
 */

function getSigningKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required to sign grants");
  }
  return "buildpro-dev-signed-grant-key";
}

function computeSignature(body: string): string {
  return createHmac("sha256", getSigningKey()).update(body).digest("base64url");
}

export function signGrant(claims: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(
    JSON.stringify({
      ...claims,
      nonce: randomBytes(16).toString("hex"),
      exp: Date.now() + ttlMs,
    }),
  ).toString("base64url");
  return `${body}.${computeSignature(body)}`;
}

/**
 * Returns the claims when the grant is authentic and unexpired, otherwise
 * null. Never throws — callers are request handlers that must fail closed.
 */
export function verifyGrant(grant: unknown): Record<string, any> | null {
  if (typeof grant !== "string" || !grant.includes(".")) return null;
  const [body, signature] = grant.split(".", 2);
  if (!body || !signature) return null;

  const expected = Buffer.from(computeSignature(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 6 hours: long enough to upload, read with AI and retry; short enough that a leaked grant ages out. */
export const UPLOAD_GRANT_TTL_MS = 6 * 60 * 60 * 1000;

export function signUploadGrant(objectPath: string, companyId: string): string {
  return signGrant({ kind: "object-upload", objectPath, companyId }, UPLOAD_GRANT_TTL_MS);
}

/** True when `grant` was issued by us for exactly this path AND this company. */
export function verifyUploadGrant(grant: unknown, objectPath: string, companyId: string): boolean {
  const claims = verifyGrant(grant);
  if (!claims) return false;
  return (
    claims.kind === "object-upload" &&
    claims.objectPath === objectPath &&
    claims.companyId === companyId
  );
}
