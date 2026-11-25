// Run: npx tsx server/__tests__/schedule-refs.test.ts
//
// The ids a schedule-item write points at (red team, 25 Nov 2026):
// - the dependency cycle check used to look one level deep only;
// - taskLinkOffsets let a move rewrite ANY company's task due dates.
import assert from "node:assert";
import { hasDependencyCycle, buildDependencyGraph, referencedTaskIds } from "../utils/scheduleRefs";
import { reflowLinkedTasks } from "../utils/scheduleTaskLinks";

let failed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failed++; console.error(`✗ ${name}\n  ${(e as Error).message}`); }
};

const rows = (links: Record<string, string[]>) =>
  Object.entries(links).map(([id, preds]) => ({ id, dependencies: preds.map((p) => ({ id: p, type: "FS", lag: 0 })) }));

(async () => {
  await test("no cycle in a straight chain", () => {
    assert.equal(hasDependencyCycle(buildDependencyGraph(rows({ A: [], B: ["A"], C: ["B"] }))), false);
  });

  await test("a diamond is not a cycle", () => {
    assert.equal(hasDependencyCycle(buildDependencyGraph(rows({ A: [], B: ["A"], C: ["A"], D: ["B", "C"] }))), false);
  });

  await test("three-step cycle is caught (the old check missed this)", () => {
    // B←A, C←B, then "A depends on C".
    const g = buildDependencyGraph(rows({ A: [], B: ["A"], C: ["B"] }), new Map([["A", ["C"]]]));
    assert.equal(hasDependencyCycle(g), true);
  });

  await test("self link is a cycle", () => {
    assert.equal(hasDependencyCycle(buildDependencyGraph(rows({ A: ["A"] }))), true);
  });

  await test("links to unknown ids are ignored, not a crash", () => {
    assert.equal(hasDependencyCycle(buildDependencyGraph(rows({ A: ["ghost"] }))), false);
  });

  await test("a 5,000-item chain does not blow the stack", () => {
    const links: Record<string, string[]> = { n0: [] };
    for (let i = 1; i < 5000; i++) links[`n${i}`] = [`n${i - 1}`];
    assert.equal(hasDependencyCycle(buildDependencyGraph(rows(links))), false);
  });

  await test("referencedTaskIds merges taskIds and offsets, deduped", () => {
    const ids = referencedTaskIds({ taskIds: ["t1", "t2"], taskLinkOffsets: [{ taskId: "t2" }, { taskId: "t3" }] });
    assert.deepEqual(ids.sort(), ["t1", "t2", "t3"]);
  });

  await test("reflow only touches allowed tasks", async () => {
    const touched: string[] = [];
    const storage = { updateTask: async (id: string) => { touched.push(id); return {}; } };
    const item = {
      startDate: "2026-11-02T00:00:00.000Z",
      endDate: "2026-11-06T00:00:00.000Z",
      taskLinkOffsets: [{ taskId: "mine" }, { taskId: "foreign" }],
    };
    const n = await reflowLinkedTasks(item, storage, new Set(["mine"]));
    assert.equal(n, 1);
    assert.deepEqual(touched, ["mine"]);
  });

  await test("reflow with no allow-list keeps old behaviour", async () => {
    const touched: string[] = [];
    const storage = { updateTask: async (id: string) => { touched.push(id); return {}; } };
    await reflowLinkedTasks({ startDate: "2026-11-02", taskLinkOffsets: [{ taskId: "a" }, { taskId: "b" }] }, storage);
    assert.deepEqual(touched, ["a", "b"]);
  });

  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log("\nall passed");
})();
