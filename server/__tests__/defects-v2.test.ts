/**
 * Defects v2: stage transitions, legacy status sync, numbering, due dates,
 * location paths and notification recipients (shared/defects.ts).
 * Run with:  NODE_ENV=test npx tsx server/__tests__/defects-v2.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  DEFECT_STAGES,
  DEFECT_TRANSITIONS,
  checkDefectTransition,
  allowedDefectTransitions,
  legacyStatusForStage,
  stageFromLegacyStatus,
  transitionSideEffects,
  formatDefectRef,
  defaultDefectDueDate,
  isDefectOverdue,
  buildLocationPaths,
  locationParentMakesCycle,
  defectNotifyRecipients,
  diffDefectFields,
  type DefectStage,
} from "@shared/defects";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const ALL = { canEdit: true, canClose: true };
const EDIT_ONLY = { canEdit: true, canClose: false };

console.log("defect transitions:");

check("exactly the transitions in the spec are allowed", () => {
  const expected: Record<DefectStage, DefectStage[]> = {
    open: ["sent", "fixed", "closed"],
    sent: ["accepted", "fixed", "open"],
    accepted: ["fixed", "open"],
    fixed: ["closed", "rejected"],
    rejected: ["accepted", "fixed"],
    closed: ["open"],
  };
  for (const from of DEFECT_STAGES) {
    for (const to of DEFECT_STAGES) {
      const r = checkDefectTransition(from, to, { ...ALL, note: "x" });
      const want = expected[from].includes(to);
      assert.strictEqual(r.ok, want, `${from} → ${to} should be ${want ? "allowed" : "refused"}`);
      if (!want) assert.strictEqual((r as any).status, 400);
    }
  }
  assert.deepStrictEqual(DEFECT_TRANSITIONS, expected);
});

check("unknown target stage is a 400", () => {
  const r = checkDefectTransition("open", "in_progress", ALL);
  assert.strictEqual(r.ok, false);
  assert.strictEqual((r as any).status, 400);
});

check("unknown current stage behaves like open", () => {
  assert.strictEqual(checkDefectTransition("weird", "sent", ALL).ok, true);
  assert.strictEqual(checkDefectTransition("weird", "accepted", ALL).ok, false);
});

check("fixed → closed needs close", () => {
  const r = checkDefectTransition("fixed", "closed", EDIT_ONLY);
  assert.strictEqual(r.ok, false);
  assert.strictEqual((r as any).status, 403);
  assert.strictEqual(checkDefectTransition("fixed", "closed", ALL).ok, true);
});

check("closed → open (reopen) needs close", () => {
  assert.strictEqual(checkDefectTransition("closed", "open", EDIT_ONLY).ok, false);
  assert.strictEqual(checkDefectTransition("closed", "open", ALL).ok, true);
});

check("open → closed also needs close (no way round the check)", () => {
  assert.strictEqual(checkDefectTransition("open", "closed", EDIT_ONLY).ok, false);
  assert.strictEqual(checkDefectTransition("open", "closed", ALL).ok, true);
});

check("fixed → rejected needs a note", () => {
  const blank = checkDefectTransition("fixed", "rejected", { ...ALL, note: "   " });
  assert.strictEqual(blank.ok, false);
  assert.strictEqual((blank as any).status, 400);
  assert.strictEqual(checkDefectTransition("fixed", "rejected", { ...ALL, note: "Still leaking" }).ok, true);
});

check("no edit and no close → 403", () => {
  const r = checkDefectTransition("open", "sent", { canEdit: false, canClose: false });
  assert.strictEqual(r.ok, false);
  assert.strictEqual((r as any).status, 403);
});

check("same stage is refused", () => {
  assert.strictEqual(checkDefectTransition("sent", "sent", ALL).ok, false);
});

check("buttons hide close/reopen without close", () => {
  assert.deepStrictEqual(allowedDefectTransitions("fixed", EDIT_ONLY), ["rejected"]);
  assert.deepStrictEqual(allowedDefectTransitions("closed", EDIT_ONLY), []);
  assert.deepStrictEqual(allowedDefectTransitions("fixed", ALL), ["closed", "rejected"]);
  assert.deepStrictEqual(allowedDefectTransitions("open", { canEdit: false, canClose: false }), []);
});

console.log("legacy status sync:");

check("stage → status", () => {
  assert.strictEqual(legacyStatusForStage("open"), "open");
  assert.strictEqual(legacyStatusForStage("sent"), "in_progress");
  assert.strictEqual(legacyStatusForStage("accepted"), "in_progress");
  assert.strictEqual(legacyStatusForStage("rejected"), "in_progress");
  assert.strictEqual(legacyStatusForStage("fixed"), "resolved");
  assert.strictEqual(legacyStatusForStage("closed"), "closed");
});

check("status → stage (backfill); custom keys → open", () => {
  assert.strictEqual(stageFromLegacyStatus("open"), "open");
  assert.strictEqual(stageFromLegacyStatus("in_progress"), "sent");
  assert.strictEqual(stageFromLegacyStatus("resolved"), "fixed");
  assert.strictEqual(stageFromLegacyStatus("closed"), "closed");
  assert.strictEqual(stageFromLegacyStatus("awaiting_client"), "open");
  assert.strictEqual(stageFromLegacyStatus(null), "open");
});

check("round trip: every stage's status maps back to a stage with the same status", () => {
  for (const s of DEFECT_STAGES) {
    const status = legacyStatusForStage(s);
    assert.strictEqual(legacyStatusForStage(stageFromLegacyStatus(status)), status);
  }
});

check("closing stamps closed_*; reopening clears them", () => {
  const now = new Date("2026-11-18T01:00:00Z");
  const actor = { id: "u1", name: "Sam" };
  const closed = transitionSideEffects("closed", actor, now);
  assert.strictEqual(closed.status, "closed");
  assert.strictEqual(closed.closedAt, now);
  assert.strictEqual(closed.closedBy, "u1");
  assert.strictEqual(closed.closedByName, "Sam");
  const reopened = transitionSideEffects("open", actor, now);
  assert.strictEqual(reopened.status, "open");
  assert.strictEqual(reopened.closedAt, null);
  assert.strictEqual(reopened.closedBy, null);
  assert.strictEqual(reopened.dateResolved, null);
  const fixed = transitionSideEffects("fixed", actor, now);
  assert.strictEqual(fixed.status, "resolved");
  assert.strictEqual(fixed.dateResolved, now);
  assert.strictEqual(fixed.closedAt, null);
});

console.log("numbering, dates, locations:");

check("D-014", () => {
  assert.strictEqual(formatDefectRef(14), "D-014");
  assert.strictEqual(formatDefectRef(1), "D-001");
  assert.strictEqual(formatDefectRef(1234), "D-1234");
});

check("default due dates by job stage", () => {
  const from = new Date(2026, 0, 1, 9, 0, 0);
  const days = (js: string) => Math.round((defaultDefectDueDate(js, from).getTime() - from.getTime()) / 86400000);
  assert.strictEqual(days("construction"), 14);
  assert.strictEqual(days("pre_handover"), 7);
  assert.strictEqual(days("handover"), 10);
  assert.strictEqual(days("dlp"), 28);
  assert.strictEqual(days("warranty"), 28);
  assert.strictEqual(days("nonsense"), 14);
});

check("overdue ignores fixed and closed", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  const past = "2026-11-01T00:00:00Z";
  assert.strictEqual(isDefectOverdue({ stage: "sent", dueDate: past }, now), true);
  assert.strictEqual(isDefectOverdue({ stage: "fixed", dueDate: past }, now), false);
  assert.strictEqual(isDefectOverdue({ stage: "closed", dueDate: past }, now), false);
  assert.strictEqual(isDefectOverdue({ stage: "open", dueDate: null }, now), false);
  assert.strictEqual(isDefectOverdue({ stage: "open", dueDate: "2026-12-01" }, now), false);
});

check("location paths", () => {
  const rows = [
    { id: "a", parentId: null, name: "Level 1" },
    { id: "b", parentId: "a", name: "Kitchen" },
    { id: "c", parentId: "b", name: "Island" },
  ];
  const p = buildLocationPaths(rows);
  assert.strictEqual(p.get("c"), "Level 1 › Kitchen › Island");
  assert.strictEqual(p.get("a"), "Level 1");
  // A loop can't hang it.
  const loop = buildLocationPaths([{ id: "x", parentId: "y", name: "X" }, { id: "y", parentId: "x", name: "Y" }]);
  assert.ok(loop.get("x"));
  assert.strictEqual(locationParentMakesCycle(rows, "a", "c"), true);
  assert.strictEqual(locationParentMakesCycle(rows, "c", "a"), false);
  assert.strictEqual(locationParentMakesCycle(rows, "a", "a"), true);
});

check("recipients: owner + watchers + mentions, minus the actor, no duplicates", () => {
  const r = defectNotifyRecipients({ actorUserId: "me", ownerUserId: "o", watcherIds: ["me", "w", "o"], mentionIds: ["m", "w"] });
  assert.deepStrictEqual(r.sort(), ["m", "o", "w"]);
});

check("field diff", () => {
  const d = diffDefectFields({ title: "A", trade: null, dueDate: new Date("2026-01-01T00:00:00Z") }, { title: "B", trade: "", dueDate: new Date("2026-01-01T00:00:00Z") });
  assert.deepStrictEqual(d, { title: ["A", "B"] });
});

console.log(`\n${passed} passed`);
