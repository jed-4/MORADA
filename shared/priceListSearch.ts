/**
 * How a builder searches their price book.
 *
 * The search was one `LIKE '%<whatever you typed>%'`, which means the words had
 * to be adjacent AND in the catalogue's order. So "240 pine" found nothing,
 * because the item is called "240 x 45 T2 Pine" — you had to type the name
 * almost exactly, which defeats the point of searching.
 *
 * Nobody remembers a timber item as one string. They remember two or three
 * facts about it — a size, a species, a supplier — and they type those, in
 * whatever order they come to mind. So every WORD must match something, and
 * where each one matches does not matter:
 *
 *   "240 pine"       → 240 x 45 T2 Pine
 *   "pine 240"       → the same item
 *   "pine bunnings"  → pine items in the Bunnings book
 *
 * This is an AND of substrings, not a fuzzy match: every word still has to
 * appear somewhere. Typing more words narrows the list, which is what a builder
 * expects; a fuzzy matcher would widen it and surface near-misses on a screen
 * where picking the wrong line puts the wrong price in an estimate.
 */

/**
 * The most words we search on.
 *
 * Each word becomes its own LIKE in a query that already fires on every
 * keystroke, and past three or four the list is down to one item anyway. A
 * pasted description must not turn into forty clauses.
 */
export const MAX_SEARCH_TOKENS = 6;

/**
 * The words to match, lowercased, de-duplicated, longest first.
 *
 * Longest first so the cap keeps the most selective words: in "240 x 45 t2
 * pine" the "x" tells us nothing and "pine" tells us a lot. De-duplicated
 * because typing a word twice should not cost a clause.
 */
export function priceListSearchTokens(query: string): string[] {
  const words = (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    unique.push(w);
  }

  return unique
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_SEARCH_TOKENS);
}

/**
 * Does this item match every word typed?
 *
 * The shared definition of a hit, so the database query and anything filtering
 * in the browser cannot drift apart on what "matching" means. `haystack` is the
 * item's searchable text — its name, nickname, code and the book it lives in,
 * run together.
 */
export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const hay = (haystack ?? "").toLowerCase();
  return tokens.every((t) => hay.includes(t));
}
