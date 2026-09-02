/**
 * Tests for shared/templateOptionSync.ts — the diff that keeps
 * selection_template_options in step with templateData.
 *
 * Getting this wrong is quiet and expensive: delete a row that should have
 * survived and a template loses an option the next time anyone applies it;
 * create instead of update and the template gains a duplicate on every save.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/template-option-sync.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { planTemplateOptionSync, type ExistingLink } from "../../shared/templateOptionSync";
import { extractTemplateOptions } from "../../shared/templateOptions";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.message ?? err}`);
    process.exitCode = 1;
  }
}

const opts = (data: any[]) => extractTemplateOptions({ templateData: data }).options;
const link = (id: string, key: string | null, productId = 1): ExistingLink =>
  ({ id, templateOptionId: key, productId });

check("a template with no rows yet creates every option", () => {
  const plan = planTemplateOptionSync([], opts([{ id: "a", name: "Quad" }, { id: "b", name: "Ogee" }]));
  assert.deepStrictEqual(plan.creates.map((o) => o.templateOptionId), ["a", "b"]);
  assert.strictEqual(plan.updates.length, 0);
  assert.strictEqual(plan.deletes.length, 0);
});

check("an unchanged template updates in place and creates nothing", () => {
  const plan = planTemplateOptionSync(
    [link("L1", "a"), link("L2", "b")],
    opts([{ id: "a", name: "Quad" }, { id: "b", name: "Ogee" }]),
  );
  assert.strictEqual(plan.creates.length, 0);
  assert.deepStrictEqual(plan.updates.map((u) => u.link.id), ["L1", "L2"]);
  assert.strictEqual(plan.deletes.length, 0);
});

check("an option removed from the blob deletes its row", () => {
  const plan = planTemplateOptionSync(
    [link("L1", "a"), link("L2", "b")],
    opts([{ id: "a", name: "Quad" }]),
  );
  assert.deepStrictEqual(plan.deletes.map((d) => d.id), ["L2"]);
  assert.deepStrictEqual(plan.updates.map((u) => u.link.id), ["L1"]);
});

check("an option added to the blob creates one row, leaving the rest alone", () => {
  const plan = planTemplateOptionSync(
    [link("L1", "a")],
    opts([{ id: "a", name: "Quad" }, { id: "c", name: "New" }]),
  );
  assert.deepStrictEqual(plan.creates.map((o) => o.templateOptionId), ["c"]);
  assert.deepStrictEqual(plan.updates.map((u) => u.link.id), ["L1"]);
  assert.strictEqual(plan.deletes.length, 0);
});

check("rows the blob never described are preserved, not deleted", () => {
  // A NULL templateOptionId means the row came from somewhere else — a future
  // "add to library" UI. A blob sync has no authority over it. Deleting these
  // would make every template save quietly destroy hand-added options.
  const plan = planTemplateOptionSync(
    [link("L1", "a"), link("HAND", null)],
    opts([{ id: "a", name: "Quad" }]),
  );
  assert.deepStrictEqual(plan.preserved.map((p) => p.id), ["HAND"]);
  assert.strictEqual(plan.deletes.length, 0);
});

check("clearing a template's options deletes its rows but keeps hand-added ones", () => {
  const plan = planTemplateOptionSync([link("L1", "a"), link("HAND", null)], opts([]));
  assert.deepStrictEqual(plan.deletes.map((d) => d.id), ["L1"]);
  assert.deepStrictEqual(plan.preserved.map((p) => p.id), ["HAND"]);
});

check("duplicate existing rows converge — first updated, rest deleted", () => {
  // Only reachable through a partial write or a hand-edited database; the
  // partial unique index prevents it otherwise. The sync must resolve it rather
  // than fail on every save from then on.
  const plan = planTemplateOptionSync(
    [link("L1", "a"), link("L2", "a"), link("L3", "a")],
    opts([{ id: "a", name: "Quad" }]),
  );
  assert.deepStrictEqual(plan.updates.map((u) => u.link.id), ["L1"]);
  assert.deepStrictEqual(plan.deletes.map((d) => d.id).sort(), ["L2", "L3"]);
});

check("positional keys survive an unrelated edit to another option", () => {
  // Neither option has a stored id, so both are keyed by position. Renaming the
  // second must update its row, not delete and recreate it — recreating would
  // orphan the product row and lose its images.
  const before = opts([{ name: "A" }, { name: "B" }]);
  const existing = [link("L1", before[0].templateOptionId), link("L2", before[1].templateOptionId)];
  const plan = planTemplateOptionSync(existing, opts([{ name: "A" }, { name: "B renamed" }]));
  assert.strictEqual(plan.creates.length, 0);
  assert.strictEqual(plan.deletes.length, 0);
  assert.deepStrictEqual(plan.updates.map((u) => u.link.id), ["L1", "L2"]);
  assert.strictEqual(plan.updates[1].option.name, "B renamed");
});

check("reordering options without stored ids rewrites in place — the known cost", () => {
  // Documented in shared/templateOptions.ts: with no stored id the key IS the
  // position, so a reorder reassigns rows rather than moving them. Nothing is
  // created or deleted, but L1 now holds what used to be L2's option. Pinned so
  // the behaviour is a decision rather than a surprise.
  const existing = [link("L1", "idx:0"), link("L2", "idx:1")];
  const plan = planTemplateOptionSync(existing, opts([{ name: "B" }, { name: "A" }]));
  assert.strictEqual(plan.creates.length, 0);
  assert.strictEqual(plan.deletes.length, 0);
  assert.strictEqual(plan.updates[0].option.name, "B");
  assert.strictEqual(plan.updates[0].link.id, "L1");
});

check("the legacy format syncs by its nested key", () => {
  const plan = planTemplateOptionSync(
    [link("L1", "idx:0/0"), link("L2", "idx:1/0")],
    opts([
      { itemName: "Gutter", options: [{ name: "Quad" }] },
      { itemName: "Fascia", options: [{ name: "Monument" }] },
    ]),
  );
  assert.strictEqual(plan.creates.length, 0);
  assert.strictEqual(plan.deletes.length, 0);
  assert.deepStrictEqual(plan.updates.map((u) => u.link.id), ["L1", "L2"]);
});

check("a nameless option is not synced, and does not delete a neighbour's row", () => {
  // extractTemplateOptions drops nameless options with a warning, so they never
  // reach the plan. The row for a REAL option beside one must still be updated.
  const plan = planTemplateOptionSync([link("L1", "idx:0")], opts([{ name: "Quad" }, { sku: "NO-NAME" }]));
  assert.deepStrictEqual(plan.updates.map((u) => u.link.id), ["L1"]);
  assert.strictEqual(plan.deletes.length, 0);
  assert.strictEqual(plan.creates.length, 0);
});

check("planning twice in a row is a no-op the second time", () => {
  // Convergence: applying the plan then re-planning must want nothing further.
  const options = opts([{ id: "a", name: "Quad" }, { name: "B" }]);
  const first = planTemplateOptionSync([], options);
  const afterApply = first.creates.map((o, i) => link(`L${i}`, o.templateOptionId));
  const second = planTemplateOptionSync(afterApply, options);
  assert.strictEqual(second.creates.length, 0);
  assert.strictEqual(second.deletes.length, 0);
  assert.strictEqual(second.updates.length, options.length);
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.log("SOME TESTS FAILED");
