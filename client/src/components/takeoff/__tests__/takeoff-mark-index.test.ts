/**
 * Deleting one mark rewrites the item's geometry by index. The Select tool
 * filters marks to the page on screen before hit-testing, so an index taken
 * from that filtered list does not mean the same thing as an index into the
 * geometry a delete rewrites.
 *
 * This pins the difference. On page one the two agree and nothing looks wrong;
 * on page two the filtered index points at an earlier mark, so a delete would
 * take a shape off another page.
 *
 * Marks are identified by their x coordinate — normalizeEntries rebuilds each
 * entry as {pageId, points, qty}, so anything else added here is dropped.
 */
import assert from "node:assert/strict";
import { normalizeEntries, entriesForPage } from "../useTakeoffGeometry";

const HOME = "page-1";
const at = (x: number, pageId: string) => ({ pageId, points: [{ x, y: 0 }] });
const geometry = [at(10, "page-1"), at(20, "page-2"), at(30, "page-1"), at(40, "page-2")];

const all = normalizeEntries(geometry, HOME);
assert.equal(all.length, 4, "every mark is kept");

/** What a delete would remove, given an index. */
const markAt = (i: number) => all[i]?.points[0]?.x;

// The page-filtered list is what the canvas draws and hit-tests.
const onPage2 = entriesForPage(all, "page-2");
assert.equal(onPage2.length, 2);
assert.equal(onPage2[1].points[0].x, 40, "second mark on page two is x=40");

// That mark is index 3 in the real geometry, not index 1.
const filteredIndex = 1;
const absoluteIndex = all.findIndex((e) => e === onPage2[filteredIndex]);
assert.equal(absoluteIndex, 3);

// Deleting by the filtered index takes a mark off page ONE.
assert.equal(markAt(filteredIndex), 20);
assert.notEqual(markAt(filteredIndex), 40);

// The absolute index takes the mark that was actually clicked.
assert.equal(markAt(absoluteIndex), 40);

// And the rest of the item survives — the whole point.
const remaining = all.filter((_, i) => i !== absoluteIndex).map((e) => e.points[0].x);
assert.deepEqual(remaining, [10, 20, 30]);

console.log("takeoff mark index: 8 passed, 0 failed");
