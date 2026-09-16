/**
 * Status chip resolution — client/src/lib/statusChip.ts, the one resolver the
 * estimate line chips, group chips and estimates board all draw through.
 *
 * Pins the four ways the estimate grid's status chips were wrong:
 *   1. A configured near-grey colour (Pending, #8A8680) fell through to a tone
 *      StatusBadge guessed from the key's wording — amber for "pending".
 *   2. The unset column defaults "incomplete" (lines) and "not_started" (groups)
 *      were never configured options, and rendered as "Todo" / "Not Started".
 *   3. A real status since removed from Field Settings must still render as
 *      itself, never be quietly relabelled as the default.
 *   4. A new row starts on the option marked default, not simply the first.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/status-chip.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  defaultStatusKey,
  effectiveStatusKey,
  nextStatusKey,
  resolveStatusChip,
  type FieldStatusOption,
} from "../../client/src/lib/statusChip";

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

// The estimate_item.status options as configured in dev, 2026-09-16.
const ITEM_STATUSES: FieldStatusOption[] = [
  { key: "pending", name: "Pending", color: "#8A8680", isActive: true, isDefault: true },
  { key: "quoted", name: "Quoted", color: "#F0B964", isActive: true, isDefault: false },
  { key: "confirmed", name: "Confirmed", color: "#82C8A2", isActive: true, isDefault: false },
  { key: "ordered", name: "Ordered", color: "#7890C8", isActive: true, isDefault: false },
  { key: "cancelled", name: "Cancelled", color: "#DA988A", isActive: true, isDefault: false },
];

console.log("\nstatus-chip");

// ── 1. Colour ────────────────────────────────────────────────────────────────

check("a configured grey resolves to the neutral tone, not an unset tone", () => {
  const chip = resolveStatusChip("pending", ITEM_STATUSES);
  assert.strictEqual(chip.label, "Pending");
  assert.strictEqual(chip.paint, undefined, "#8A8680 is too grey to tint");
  // Undefined here is the bug: StatusBadge then guesses a tone from the word
  // "pending", which it files under warning — amber.
  assert.strictEqual(chip.tone, "neutral");
});

check("a configured hued colour resolves to a contrast-checked paint pair", () => {
  for (const key of ["quoted", "confirmed", "ordered", "cancelled"]) {
    const chip = resolveStatusChip(key, ITEM_STATUSES);
    assert.ok(chip.paint, `${key} should carry its configured colour`);
    assert.match(chip.paint!.background, /^#[0-9a-f]{6}$/);
    assert.match(chip.paint!.foreground, /^#[0-9a-f]{6}$/);
    assert.notStrictEqual(chip.paint!.background, chip.paint!.foreground);
  }
});

check("each hued status gets a distinct colour, not one shared fallback", () => {
  const fills = ["quoted", "confirmed", "ordered", "cancelled"].map(
    (k) => resolveStatusChip(k, ITEM_STATUSES).paint!.background,
  );
  assert.strictEqual(new Set(fills).size, fills.length);
});

check("a status with no configured colour keeps the caller's fallback tone", () => {
  const opts: FieldStatusOption[] = [{ key: "draft", name: "Draft", color: null, isActive: true }];
  assert.strictEqual(resolveStatusChip("draft", opts, "info").tone, "info");
});

// ── 2. Unset column defaults ─────────────────────────────────────────────────

check("a line's unset default 'incomplete' resolves to the configured default", () => {
  assert.strictEqual(effectiveStatusKey("incomplete", ITEM_STATUSES), "pending");
  const chip = resolveStatusChip(effectiveStatusKey("incomplete", ITEM_STATUSES), ITEM_STATUSES);
  assert.strictEqual(chip.label, "Pending");
  assert.notStrictEqual(chip.label, "Todo");
});

check("a group's unset default 'not_started' resolves to the same default", () => {
  assert.strictEqual(effectiveStatusKey("not_started", ITEM_STATUSES), "pending");
});

check("an empty status resolves to the configured default", () => {
  assert.strictEqual(effectiveStatusKey(null, ITEM_STATUSES), "pending");
  assert.strictEqual(effectiveStatusKey("", ITEM_STATUSES), "pending");
});

check("a configured status is returned untouched", () => {
  assert.strictEqual(effectiveStatusKey("ordered", ITEM_STATUSES), "ordered");
});

check("with nothing configured, an unset marker is left as it is", () => {
  assert.strictEqual(effectiveStatusKey("incomplete", []), "incomplete");
});

// ── 3. Removed statuses are not misreported ──────────────────────────────────

check("a real status since removed from Field Settings still renders as itself", () => {
  const key = effectiveStatusKey("on_hold", ITEM_STATUSES);
  assert.strictEqual(key, "on_hold", "must not be relabelled as the default");
  assert.strictEqual(resolveStatusChip(key, ITEM_STATUSES).label, "On Hold");
});

// ── 4. Defaults and cycling ──────────────────────────────────────────────────

check("the option marked default wins over the first", () => {
  const opts: FieldStatusOption[] = [
    { key: "a", isActive: true },
    { key: "b", isActive: true, isDefault: true },
  ];
  assert.strictEqual(defaultStatusKey(opts), "b");
});

check("with no default marked, the first active option is used", () => {
  const opts: FieldStatusOption[] = [
    { key: "gone", isActive: false },
    { key: "first", isActive: true },
    { key: "second", isActive: true },
  ];
  assert.strictEqual(defaultStatusKey(opts), "first");
});

check("a default that has been deactivated is skipped", () => {
  const opts: FieldStatusOption[] = [
    { key: "old", isActive: false, isDefault: true },
    { key: "live", isActive: true },
  ];
  assert.strictEqual(defaultStatusKey(opts), "live");
});

check("nothing configured gives no default", () => {
  assert.strictEqual(defaultStatusKey([]), null);
  assert.strictEqual(defaultStatusKey(undefined), null);
});

check("cycling from an unset default steps to the option after the default", () => {
  const from = effectiveStatusKey("incomplete", ITEM_STATUSES);
  assert.strictEqual(nextStatusKey(from, ITEM_STATUSES), "quoted");
});

check("cycling wraps from the last option to the first", () => {
  assert.strictEqual(nextStatusKey("cancelled", ITEM_STATUSES), "pending");
});

console.log(`\nstatus-chip: ${passed} checks passed\n`);
