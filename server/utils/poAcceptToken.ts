import { createHmac, timingSafeEqual } from "crypto";

// The link a trade gets to accept a PO. It's the PO id plus a signature, so
// nothing has to be stored and re-sending gives the same link. It can't be
// forged without SESSION_SECRET; what it allows is limited by the PO's own
// status (only a Sent PO can be accepted).

function sign(poId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(`po-accept:${poId}`).digest("base64url").slice(0, 32);
}

export function poAcceptToken(poId: string): string {
  return `${poId}.${sign(poId)}`;
}

/** The PO id the token is for, or null if it isn't genuine. */
export function readPoAcceptToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const poId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(poId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? poId : null;
}

export function poAcceptUrl(baseUrl: string, poId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/portal/po/${poAcceptToken(poId)}`;
}
