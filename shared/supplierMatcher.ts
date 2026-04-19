/**
 * Shared supplier-name matcher used by every bill import path:
 *   - OCR (client): client/src/pages/BillDetail.tsx (Apply OCR)
 *   - Email auto-importer (server): server/services/autoBillCreator.ts
 *   - Xero bulk import (server): server/routes.ts xero/bills/import
 *
 * Returns a structured result so callers can decide between
 *   (a) auto-applying the match,
 *   (b) prompting the user with a pre-seeded best guess, or
 *   (c) opening a blank picker / leaving the bill as a draft.
 */

export type SupplierCandidate = {
  id: string;
  /** Pass anything you have — name / company / firstName + lastName etc. */
  names: Array<string | null | undefined>;
};

export type SupplierMatch<T extends SupplierCandidate = SupplierCandidate> = {
  candidate: T;
  /** 0..1; higher is a more confident match. */
  confidence: number;
  reason:
    | "exact"
    | "normalized-exact"
    | "substring"
    | "token-set"
    | "initialism";
};

export type SupplierMatchResult<T extends SupplierCandidate = SupplierCandidate> = {
  /** High-confidence pick; safe to auto-apply. */
  match: SupplierMatch<T> | null;
  /** Up to 3 next-best guesses, sorted by confidence desc. Useful for "best guess" prompts. */
  nearMatches: Array<SupplierMatch<T>>;
};

/** Strip common AU business suffixes / connectors before fuzzy comparison. */
const SUFFIX_TOKENS = new Set([
  "pty",
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "llc",
  "the",
  "co",
  "company",
  "corp",
  "corporation",
  "australia",
  "au",
  "aus",
  "group",
  "holdings",
  "trust",
  "trustee",
  "trading",
  "as",
  "tas",
  "and",
  "&",
]);

/** Lowercase, trim, drop punctuation, collapse whitespace. */
function basicNormalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenise with suffix-stripping. Returns the meaningful tokens, in order. */
function tokenize(input: string): string[] {
  return basicNormalize(input)
    .split(" ")
    .filter((t) => t.length > 0 && !SUFFIX_TOKENS.has(t));
}

/** A "tight" normalized form: tokens joined with no separators. */
function tight(tokens: string[]): string {
  return tokens.join("");
}

/** Initialism of the first letters of every kept token (e.g. "John Smith Plumbing" -> "jsp"). */
function initialism(tokens: string[]): string {
  return tokens.map((t) => t[0] || "").join("");
}

/** Jaccard token-set similarity (0..1). */
function tokenSetOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter++;
  });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Score one candidate name against the search query. Returns the best score + reason. */
function scoreOne(
  searchTokens: string[],
  searchTight: string,
  searchInit: string,
  candidateRaw: string,
): { score: number; reason: SupplierMatch["reason"] } | null {
  const tokens = tokenize(candidateRaw);
  if (tokens.length === 0) return null;
  const tightStr = tight(tokens);
  const init = initialism(tokens);

  // 1. Exact (after normalization).
  if (tightStr === searchTight) {
    return { score: 1.0, reason: "normalized-exact" };
  }

  // 2. Strong substring containment (one fully inside the other).
  if (tightStr.length >= 4 && searchTight.length >= 4) {
    if (tightStr.includes(searchTight) || searchTight.includes(tightStr)) {
      const shorter = Math.min(tightStr.length, searchTight.length);
      const longer = Math.max(tightStr.length, searchTight.length);
      const ratio = shorter / longer;
      // 0.7 ratio → 0.85 confidence; 1.0 ratio → 0.95
      const score = 0.7 + 0.25 * ratio;
      if (ratio >= 0.5) return { score, reason: "substring" };
    }
  }

  // 3. Token-set overlap (handles re-orderings, extra tokens, missing tokens).
  const jacc = tokenSetOverlap(searchTokens, tokens);
  if (jacc >= 0.5) {
    return { score: 0.6 + 0.3 * jacc, reason: "token-set" };
  }

  // 4. Initialism match (e.g. "JS Plumbing" ↔ "John Smith Plumbing").
  // Only meaningful if both sides have ≥2 tokens or the short side is a pure initialism.
  if (init.length >= 2 && searchInit.length >= 2) {
    if (init === searchTight || tightStr === searchInit) {
      return { score: 0.78, reason: "initialism" };
    }
  }

  return null;
}

/**
 * Match a free-text supplier name against a list of supplier candidates.
 *
 * `highConfidence` controls the auto-apply threshold (default 0.85). A pick
 * scoring >= this is returned as `match`; everything else is a `nearMatch`.
 */
export function matchSupplier<T extends SupplierCandidate>(
  query: string | null | undefined,
  candidates: T[],
  opts?: { highConfidence?: number; mediumConfidence?: number },
): SupplierMatchResult<T> {
  const highConfidence = opts?.highConfidence ?? 0.85;
  const mediumConfidence = opts?.mediumConfidence ?? 0.55;

  if (!query) return { match: null, nearMatches: [] };
  const searchTokens = tokenize(query);
  if (searchTokens.length === 0) return { match: null, nearMatches: [] };
  const searchTight = tight(searchTokens);
  const searchInit = initialism(searchTokens);

  const scored: Array<SupplierMatch<T>> = [];

  for (const cand of candidates) {
    let best: { score: number; reason: SupplierMatch["reason"] } | null = null;
    for (const raw of cand.names) {
      if (!raw) continue;
      const s = scoreOne(searchTokens, searchTight, searchInit, raw);
      if (s && (!best || s.score > best.score)) best = s;
    }
    if (best && best.score >= mediumConfidence) {
      scored.push({ candidate: cand, confidence: best.score, reason: best.reason });
    }
  }

  scored.sort((a, b) => b.confidence - a.confidence);

  const top = scored[0];
  if (top && top.confidence >= highConfidence) {
    return { match: top, nearMatches: scored.slice(1, 4) };
  }
  return { match: null, nearMatches: scored.slice(0, 3) };
}
