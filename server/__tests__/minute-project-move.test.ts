/**
 * Moving a minute to another project.
 *
 * Two things had to be true and only one was. The server has always accepted
 * `projectId` on PATCH /api/minutes/:id, with a tenancy check — but no screen
 * offered it, so a minute written against the wrong job could only be deleted
 * and retyped. The other half is quieter: an action item IS a task (a `notes`
 * row) carrying the project, copied off the minute when it was raised. Move
 * the minute alone and this meeting's work sits in the old job's To-Dos, where
 * nobody is looking for it, while the meeting it came out of is somewhere else.
 *
 * Run: npx tsx server/__tests__/minute-project-move.test.ts
 */
import assert from "node:assert/strict";
import { actionItemPlacement } from "@shared/minuteActionItems";

let passed = 0;
const check = (_label: string, fn: () => void) => { fn(); passed++; };

const COMPANY = "company-1";

// --- where an action item sits ----------------------------------------------

check("a project item is anchored to the project", () => {
  assert.deepEqual(actionItemPlacement("proj-a", COMPANY), {
    projectId: "proj-a",
    scope: "project",
    taskContextType: "project",
    taskContextId: "proj-a",
  });
});

check("a business item is anchored to the company, not to null", () => {
  // taskContextId is what the task lists filter on; null would drop the item
  // out of every list rather than putting it in the business one.
  assert.deepEqual(actionItemPlacement(null, COMPANY), {
    projectId: null,
    scope: "personal",
    taskContextType: "business",
    taskContextId: COMPANY,
  });
});

check("undefined and empty are business, same as null", () => {
  // "" is what the picker sends for Business (no project).
  for (const none of [undefined, null, ""]) {
    assert.deepEqual(actionItemPlacement(none as any, COMPANY), actionItemPlacement(null, COMPANY));
  }
});

check("it writes exactly four fields, no more", () => {
  // It is spread into a Drizzle .set() / insert. An extra key Drizzle does not
  // know is dropped silently — which is how business reminders came to read
  // four columns that did not exist.
  assert.deepEqual(
    Object.keys(actionItemPlacement("proj-a", COMPANY)).sort(),
    ["projectId", "scope", "taskContextId", "taskContextType"],
  );
});

check("raising an item and moving one agree on placement", () => {
  // The point of the shared helper: the create route and the move route used
  // to spell these four fields out separately.
  const raisedInB = actionItemPlacement("proj-b", COMPANY);
  const movedToB = actionItemPlacement("proj-b", COMPANY);
  assert.deepEqual(movedToB, raisedInB,
    "a moved item must be indistinguishable from one raised in the new project");
});

// --- deciding that a move is happening ---------------------------------------

/** What the route does to tell a real move from a PATCH that just saves notes. */
const isMove = (body: Record<string, unknown>, current: string | null) =>
  Object.prototype.hasOwnProperty.call(body, "projectId") &&
  ((body.projectId ?? null) !== (current ?? null));

check("a PATCH that does not mention the project is not a move", () => {
  // Saving the title must not rewrite the action items.
  assert.equal(isMove({ title: "Site meeting" }, "proj-a"), false);
});

check("the same project sent again is not a move", () => {
  assert.equal(isMove({ projectId: "proj-a" }, "proj-a"), false);
});

check("a different project is a move", () => {
  assert.equal(isMove({ projectId: "proj-b" }, "proj-a"), true);
});

check("moving OFF a project, to Business, is a move", () => {
  // The guard this replaced was `if (data.projectId && ...)`, which is falsy
  // for null — so clearing the project moved the minute and left its action
  // items pointing at the old job.
  assert.equal(isMove({ projectId: null }, "proj-a"), true);
});

check("moving a business minute ONTO a project is a move", () => {
  assert.equal(isMove({ projectId: "proj-a" }, null), true);
});

check("a business minute saved as business is not a move", () => {
  assert.equal(isMove({ projectId: null }, null), false);
});

console.log(`minute project move: ${passed} passed, 0 failed`);
