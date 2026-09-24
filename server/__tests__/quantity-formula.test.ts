/**
 * Estimate quantity formulas — shared/quantityFormula.ts.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/quantity-formula.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  evaluateQuantityFormula,
  extractTakeoffRefs,
  isPlainNumber,
  formulaToDisplay,
  displayToFormula,
} from "../../shared/quantityFormula";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log("\nquantity-formula");

const TILES = "aaaa1111-2222-3333-4444-555566667777";
const WALLS = "bbbb1111-2222-3333-4444-555566667777";
const QTY = new Map([[TILES, 48.26], [WALLS, 17.03]]);
const value = (f: string, q: Map<string, number> = QTY) => {
  const r = evaluateQuantityFormula(f, q);
  assert.ok(r.ok, `expected ${f} to evaluate, got ${r.ok ? "" : r.error}`);
  return (r as { ok: true; value: number }).value;
};

// ── Arithmetic ───────────────────────────────────────────────────────────────

check("a plain number is a quantity", () => {
  assert.strictEqual(value("12"), 12);
  assert.strictEqual(value("12.5"), 12.5);
  assert.strictEqual(value(".5"), 0.5);
  assert.ok(isPlainNumber("12.5"));
  assert.ok(!isPlainNumber("12.5 + 1"));
});

check("the four operations, with the usual precedence", () => {
  assert.strictEqual(value("2 + 3 * 4"), 14);
  assert.strictEqual(value("(2 + 3) * 4"), 20);
  assert.strictEqual(value("10 / 4"), 2.5);
  assert.strictEqual(value("10 - 2 - 3"), 5);
  assert.strictEqual(value("-4 + 10"), 6);
});

check("× and ÷ mean what they look like", () => {
  assert.strictEqual(value("6 × 2"), 12);
  assert.strictEqual(value("6 ÷ 2"), 3);
});

check("ROUND goes UP to a whole number — you cannot buy 10.2 sheets", () => {
  assert.strictEqual(value("ROUND(10.2)"), 11);
  assert.strictEqual(value("ROUND(11)"), 11);
  assert.strictEqual(value("ROUND(10.2) + 2"), 13);
  assert.strictEqual(value("round(0.1)"), 1);
});

check("a result keeps 2dp, like every other quantity", () => {
  assert.strictEqual(value("10 / 3"), 3.33);
});

// ── Take-off references ──────────────────────────────────────────────────────

check("a reference is the measurement's own total", () => {
  assert.strictEqual(value(`{takeoff:${TILES}}`), 48.26);
});

check("a reference can be worked on like any number", () => {
  assert.strictEqual(value(`{takeoff:${TILES}} * 1.1`), 53.09);
  assert.strictEqual(value(`ROUND({takeoff:${TILES}} / 2.4)`), 21);
  assert.strictEqual(value(`{takeoff:${TILES}} + {takeoff:${WALLS}}`), 65.29);
});

check("every referenced item is reported, once, in order", () => {
  assert.deepStrictEqual(
    extractTakeoffRefs(`{takeoff:${WALLS}} + {takeoff:${TILES}} - {takeoff:${WALLS}}`),
    [WALLS, TILES],
  );
  assert.deepStrictEqual(extractTakeoffRefs("12 * 2"), []);
  assert.deepStrictEqual(extractTakeoffRefs(null), []);
});

check("a deleted take-off item fails the formula instead of zeroing the line", () => {
  const r = evaluateQuantityFormula(`{takeoff:${TILES}} + {takeoff:gone}`, QTY);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual((r as { missingRefs: string[] }).missingRefs, ["gone"]);
});

// ── Refusals ─────────────────────────────────────────────────────────────────

check("nonsense is refused, not guessed at", () => {
  for (const bad of ["", "   ", "2 +", "(2 + 3", "2 3 )", "2 + apples", "5 $ 3", "{takeoff:"]) {
    assert.strictEqual(evaluateQuantityFormula(bad, QTY).ok, false, `expected "${bad}" to fail`);
  }
});

check("dividing by zero is refused rather than becoming Infinity", () => {
  const r = evaluateQuantityFormula("10 / 0", QTY);
  assert.strictEqual(r.ok, false);
  assert.match((r as { error: string }).error, /zero/i);
});

check("nothing in a formula is ever executed", () => {
  // The text comes back out of the database, so the parser must reject code
  // rather than run it.
  for (const bad of [
    "process.exit(1)",
    "globalThis",
    "1;process.exit(1)",
    "(()=>1)()",
    "1 + [1]",
  ]) {
    assert.strictEqual(evaluateQuantityFormula(bad, QTY).ok, false, `expected "${bad}" to fail`);
  }
});

// ── Names on screen, ids in the column ───────────────────────────────────────

check("a formula reads as names", () => {
  assert.strictEqual(
    formulaToDisplay(`{takeoff:${TILES}} * 1.1`, new Map([[TILES, "Wall tiles"]])),
    "{Wall tiles} * 1.1",
  );
});

check("a deleted item still reads as something, not as a raw id", () => {
  assert.strictEqual(formulaToDisplay(`{takeoff:${TILES}}`, new Map()), "{deleted item}");
});

check("names typed back become ids", () => {
  const byName = new Map([["Wall tiles", [TILES]], ["Studs", [WALLS]]]);
  const r = displayToFormula("{Wall tiles} * 1.1", byName);
  assert.deepStrictEqual(r, { ok: true, formula: `{takeoff:${TILES}} * 1.1` });
});

check("the item picked from the list wins over a shared name", () => {
  const byName = new Map([["Tiles", [TILES, WALLS]]]);
  const picked = new Map([["Tiles", WALLS]]);
  assert.deepStrictEqual(
    displayToFormula("{Tiles}", byName, picked),
    { ok: true, formula: `{takeoff:${WALLS}}` },
  );
});

check("an ambiguous or unknown name is an error, never a guess", () => {
  const byName = new Map([["Tiles", [TILES, WALLS]]]);
  assert.strictEqual(displayToFormula("{Tiles}", byName).ok, false);
  assert.strictEqual(displayToFormula("{Nothing}", new Map()).ok, false);
});

check("an id already in the text is left alone", () => {
  assert.deepStrictEqual(
    displayToFormula(`{takeoff:${TILES}} + 1`, new Map()),
    { ok: true, formula: `{takeoff:${TILES}} + 1` },
  );
});

console.log(`\nquantity-formula: ${passed} checks passed\n`);
