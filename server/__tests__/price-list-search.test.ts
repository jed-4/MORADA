/**
 * Searching the price book from an estimate line.
 *
 * The search was one `LIKE '%<the whole query>%'`, so the words had to be
 * adjacent and in the catalogue's order: "240 pine" found nothing because the
 * item is "240 x 45 T2 Pine". These pin the rule that replaced it — every WORD
 * has to match something, and where each one matches doesn't matter.
 *
 * Run: npx tsx server/__tests__/price-list-search.test.ts
 */
import assert from "node:assert/strict";
import {
  priceListSearchTokens,
  matchesAllTokens,
  MAX_SEARCH_TOKENS,
} from "@shared/priceListSearch";

let passed = 0;
const check = (_label: string, fn: () => void) => { fn(); passed++; };

/** An item's searchable text, as the query builds it: name, nickname, code, book. */
const hay = (name: string, nickname = "", code = "", list = "") =>
  [name, nickname, code, list].join(" ").toLowerCase();

const PINE = hay("240 x 45 T2 Pine", "", "TP24045", "Bunnings");
const find = (q: string, h: string) => matchesAllTokens(h, priceListSearchTokens(q));

// --- the thing Jed actually asked for ---------------------------------------

check("'240 pine' finds '240 x 45 T2 Pine'", () => {
  assert.equal(find("240 pine", PINE), true);
});

check("word order does not matter", () => {
  for (const q of ["240 pine", "pine 240", "pine t2", "t2 240", "pine 45 240"]) {
    assert.equal(find(q, PINE), true, `"${q}" should find it`);
  }
});

check("the full name still works — nobody is punished for typing it out", () => {
  assert.equal(find("240 x 45 t2 pine", PINE), true);
});

check("a word that is not there still excludes the item", () => {
  // This is an AND of substrings, not a fuzzy match: more words must NARROW
  // the list. Picking the wrong line puts the wrong price in an estimate.
  assert.equal(find("240 merbau", PINE), false);
  assert.equal(find("pine 90", PINE), false);
});

check("a word can match the supplier's book", () => {
  // "pine from Bunnings" is a natural thing to type and each word is free to
  // match a different field.
  assert.equal(find("pine bunnings", PINE), true);
  assert.equal(find("pine officeworks", PINE), false);
});

check("a word can match the code", () => {
  assert.equal(find("tp24045", PINE), true);
  assert.equal(find("pine tp24045", PINE), true);
});

check("case and extra spacing are irrelevant", () => {
  assert.equal(find("  PINE   240  ", PINE), true);
  assert.equal(find("PiNe", PINE), true);
});

// --- tokenising --------------------------------------------------------------

check("the query splits on any run of whitespace", () => {
  assert.deepEqual(priceListSearchTokens("240  pine").sort(), ["240", "pine"]);
  assert.deepEqual(priceListSearchTokens("240\tpine\npine2").length, 3);
});

check("a repeated word costs nothing", () => {
  assert.deepEqual(priceListSearchTokens("pine pine pine"), ["pine"]);
});

check("the longest words survive the cap", () => {
  // Each word is a LIKE in a query that fires per keystroke, so the list is
  // capped — and "x" tells us nothing while "treated" tells us a lot.
  const tokens = priceListSearchTokens("a b c d e f g hardwood decking treated");
  assert.equal(tokens.length, MAX_SEARCH_TOKENS);
  for (const kept of ["hardwood", "decking", "treated"]) {
    assert.ok(tokens.includes(kept), `dropped the selective word "${kept}"`);
  }
});

check("an empty or whitespace query yields no words", () => {
  for (const q of ["", "   ", "\t\n", null as any, undefined as any]) {
    assert.deepEqual(priceListSearchTokens(q), []);
  }
});

check("no words matches nothing, rather than everything", () => {
  // The dangerous failure: an empty token list ANDed together is vacuously
  // true in SQL, which would return the entire price book.
  assert.equal(matchesAllTokens(PINE, []), false);
});

check("a single word behaves as it always did", () => {
  // The old behaviour has to survive: one word is still a plain substring.
  assert.equal(find("pine", PINE), true);
  assert.equal(find("ine", PINE), true, "mid-word substrings still match");
  assert.equal(find("spruce", PINE), false);
});

// --- shapes that must not crash ---------------------------------------------

check("a missing nickname or code does not blank the haystack", () => {
  // In Postgres anything || NULL is NULL, which is why the query COALESCEs
  // every optional field. The same item with no nickname and no code must
  // still be findable by its name.
  const bare = hay("240 x 45 T2 Pine", "", "", "Bunnings");
  assert.equal(find("240 pine", bare), true);
});

check("an empty haystack matches nothing without throwing", () => {
  assert.equal(matchesAllTokens("", ["pine"]), false);
  assert.equal(matchesAllTokens(null as any, ["pine"]), false);
});

console.log(`price list search: ${passed} passed, 0 failed`);
