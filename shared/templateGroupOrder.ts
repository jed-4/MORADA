/**
 * The company-wide order of groups in the Details and Labour template libraries.
 *
 * Both lists used to sort their groups alphabetically. The order is now whatever
 * the user drags it into, stored once for the company as a list of group names
 * (migration 0084). A group has no id of its own — it is its name on the template
 * rows — so names are what the stored order holds.
 *
 * Pure, so the rules can be tested without a browser.
 */

/**
 * `names` in the saved order.
 *
 * Saved names come first, in the order they were saved. Anything the saved order
 * doesn't mention — a group created since the last drag, or every group before
 * anyone has dragged at all — goes to the bottom alphabetically, so an untouched
 * list reads exactly as it always has. Saved names that no longer exist are
 * ignored, so a rename or a delete never needs the stored order updated.
 */
export function orderGroups(names: readonly string[], saved: readonly string[] | null | undefined): string[] {
  const present = new Set(names);
  const placed = new Set<string>();
  const out: string[] = [];
  for (const name of saved ?? []) {
    if (present.has(name) && !placed.has(name)) {
      out.push(name);
      placed.add(name);
    }
  }
  const rest = Array.from(present).filter((n) => !placed.has(n)).sort((a, b) => a.localeCompare(b));
  return out.concat(rest);
}

/**
 * The company-wide order after dragging `moved` onto `target`.
 *
 * A panel only shows the groups in the template that is open, but the order is
 * shared by every template. So the move is made against the WHOLE list — `all`,
 * every group name the company has, already in its current order — landing
 * `moved` where `target` is. Groups this template doesn't have keep their
 * relative places, instead of being shuffled by a drag that never showed them.
 *
 * Dragging down places it after the target, dragging up before it, matching
 * what a vertical sortable list shows while dragging.
 */
export function moveGroup(all: readonly string[], moved: string, target: string): string[] {
  const from = all.indexOf(moved);
  const to = all.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...all];
  const next = all.filter((n) => n !== moved);
  const targetIndex = next.indexOf(target);
  next.splice(from < to ? targetIndex + 1 : targetIndex, 0, moved);
  return next;
}
