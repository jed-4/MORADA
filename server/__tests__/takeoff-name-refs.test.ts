/**
 * Template take-off links by NAME — shared/quantityFormula.ts.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/takeoff-name-refs.test.ts
 */
import assert from "node:assert/strict";
import {
  checkTemplateFormula,
  evaluateQuantityFormula,
  extractNameRefs,
  extractTakeoffRefs,
  indexTakeoffByName,
  isWaitingFormula,
  linkTemplateFormula,
  resolveNameRefs,
} from "../../shared/quantityFormula";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { failed++; console.error(`✗ ${name}\n`, e); }
};

const index = indexTakeoffByName([
  { id: "a1", name: "Wall tiles" },
  { id: "b2", name: "Floor tiles" },
  { id: "c3", name: "Skirting" },
  { id: "c4", name: "skirting " }, // measured on a second plan
]);

test("names are read out of a formula, ids are not", () => {
  assert.deepEqual(extractNameRefs("{Wall tiles} * 1.1 + {takeoff:x9}"), ["Wall tiles"]);
  assert.deepEqual(extractNameRefs("{Wall tiles} + { wall  TILES }"), ["Wall tiles"]);
  assert.deepEqual(extractNameRefs("12"), []);
  assert.equal(isWaitingFormula("{takeoff:a1} * 2"), false);
  assert.equal(isWaitingFormula("{Floor tiles}"), true);
});

test("a unique name becomes its id; case and spacing don't matter", () => {
  const r = resolveNameRefs("{ wall TILES } * 1.1", index);
  assert.equal(r.formula, "{takeoff:a1} * 1.1");
  assert.deepEqual(r.linked, ["wall TILES"]);
  assert.deepEqual(r.waiting, []);
});

test("a name with no item waits; a name with two never guesses", () => {
  const r = resolveNameRefs("{Cornice} + {Skirting} + {Floor tiles}", index);
  assert.equal(r.formula, "{Cornice} + {Skirting} + {takeoff:b2}");
  assert.deepEqual(r.waiting, ["Cornice"]);
  assert.deepEqual(r.ambiguous, ["Skirting"]);
  assert.deepEqual(r.linked, ["Floor tiles"]);
  assert.deepEqual(extractTakeoffRefs(r.formula), ["b2"]);
});

test("a waiting formula never evaluates — it says what it's waiting for", () => {
  const r = evaluateQuantityFormula("{Cornice} * 2", new Map());
  assert.equal(r.ok, false);
  assert.match((r as any).error, /Waiting for take-off item "Cornice"/);
});

test("a fully linked formula evaluates like any other", () => {
  const r = resolveNameRefs("ROUND({Wall tiles} / 2.4)", index);
  const v = evaluateQuantityFormula(r.formula, new Map([["a1", 10]]));
  assert.deepEqual(v, { ok: true, value: 5 });
});

test("template formulas: shape is checked with every name standing in as 1", () => {
  assert.deepEqual(checkTemplateFormula(" {Wall tiles} * 1.1 "), {
    ok: true, formula: "{Wall tiles} * 1.1", names: ["Wall tiles"],
  });
  assert.equal(checkTemplateFormula("{Wall tiles} *").ok, false);
  assert.equal(checkTemplateFormula("{Wall tiles} / 0").ok, false);
  assert.equal(checkTemplateFormula("2 * 3").ok, false); // no item → just type the number
  assert.equal(checkTemplateFormula("{takeoff:a1}").ok, false); // ids mean one project
});

test("loading: fully matched → linked, evaluated, the take-off's number", () => {
  const q = new Map([["a1", 20], ["b2", 5]]);
  const r = linkTemplateFormula("{Wall tiles} * 1.1 + {floor tiles}", index, q);
  assert.equal(r.linked, true);
  assert.equal(r.formula, "{takeoff:a1} * 1.1 + {takeoff:b2}");
  assert.equal(r.quantity, 27);
});

test("loading: anything unmatched waits at 0 — never the template's number", () => {
  const r = linkTemplateFormula("{Wall tiles} + {Cornice}", index, new Map([["a1", 20]]));
  assert.equal(r.linked, false);
  assert.equal(r.quantity, 0);
  assert.equal(r.formula, "{takeoff:a1} + {Cornice}");
  assert.deepEqual(r.waitingFor, ["Cornice"]);
  // …and it links the rest later the same way.
  const later = resolveNameRefs(r.formula!, indexTakeoffByName([{ id: "a1", name: "Wall tiles" }, { id: "z9", name: "cornice" }]));
  assert.equal(later.formula, "{takeoff:a1} + {takeoff:z9}");
});

test("loading: no formula, a broken one, or one with ids → nothing stored, quantity kept", () => {
  for (const raw of [undefined, "", "  ", "{Wall tiles} *", "{takeoff:a1} * 2", 42]) {
    const r = linkTemplateFormula(raw, index, new Map());
    assert.equal(r.formula, null);
    assert.equal(r.quantity, null);
  }
});

console.log(`take-off name refs: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
