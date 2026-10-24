/**
 * Where a drag will land, as the estimate grid's own drag handlers compute it.
 *
 * dnd-kit's `over` is not usable here: `closestCenter` resolves to whichever
 * droppable's centre is nearest, and a group card's rect encloses all of its
 * rows, so it wins over the row the cursor is actually on. Every handler works
 * from the cursor against measured header/row rects instead, and this is what
 * they pass around.
 *
 * - `above` / `below` — an insertion line. For a group drag it means "become a
 *   sibling of that group, before/after it", which is how a subgroup is
 *   promoted back out as well as how groups are reordered.
 * - `inside` — the nest gesture. Only produced for a group dragged over the
 *   middle band of another group's header, and never over itself or one of its
 *   own descendants.
 */
export type DropPosition = 'above' | 'below' | 'inside';

export type DropTarget = { id: string; position: DropPosition };

/** The middle band of a group header that means "nest into this group". */
export const NEST_ZONE_TOP = 0.3;
export const NEST_ZONE_BOTTOM = 0.7;

/** The subset of an estimate group this planner needs. */
export type GroupNode = {
  id: string;
  parentGroupId?: string | null;
  order?: number | null;
  isCollapsed?: boolean | null;
};

/**
 * Groups hidden inside a collapsed ancestor.
 *
 * They must not be drop targets. The collapse is a `grid-template-rows: 0fr`
 * wrapper with overflow hidden, so a hidden subgroup's header still MEASURES
 * its full height — it is clipped, not removed — and a rect-based hit test
 * happily offers a target the user cannot see, landing the drop somewhere
 * they never pointed at.
 */
export function hiddenGroupIds(groups: GroupNode[]): Set<string> {
  const hidden = new Set<string>();
  for (const g of groups) {
    if (!g.isCollapsed) continue;
    // Array.from, not for...of over the Set: this tsconfig's target rejects
    // iterating a Set directly (TS2802).
    for (const id of Array.from(descendantsOf(groups, g.id))) hidden.add(id);
  }
  return hidden;
}

/** One group's new place in the tree. */
export type GroupMove = { id: string; order: number; parentGroupId?: string | null };

/** Every group under `rootId`, at any depth. Visited-guarded, so corrupt data can't hang it. */
export function descendantsOf(groups: GroupNode[], rootId: string): Set<string> {
  const out = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const g of groups) {
      if (g.parentGroupId === current && !out.has(g.id)) {
        out.add(g.id);
        queue.push(g.id);
      }
    }
  }
  return out;
}

/**
 * Where a dragged group lands, as a complete set of moves.
 *
 * Two rules, and between them they cover every gesture:
 *
 *  - `inside` makes the dragged group the target's LAST child. Appending
 *    rather than inserting means a nest never silently reshuffles what is
 *    already in there.
 *  - `above` / `below` make it a SIBLING of the target, before or after it.
 *    One rule, three outcomes: reordering inside a level, nesting a level down
 *    by dropping beside an existing subgroup, and promoting a subgroup back
 *    out by dropping it beside a top-level group.
 *
 * What this replaced was "same level means reorder, otherwise nest", under
 * which nesting could not be reached at all on a flat estimate — every group
 * sits at the same level there, so the reorder branch always won — and
 * un-nesting was impossible at any time.
 *
 * Returns [] when the move is refused or is a no-op: dropping onto itself,
 * into its own subtree, or onto a target that isn't there.
 */
export function planGroupDrop(
  groups: GroupNode[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): GroupMove[] {
  const dragged = groups.find((g) => g.id === draggedId);
  const target = groups.find((g) => g.id === targetId);
  if (!dragged || !target || draggedId === targetId) return [];
  if (descendantsOf(groups, draggedId).has(targetId)) return [];

  const nesting = position === 'inside';
  const newParentId = nesting ? targetId : (target.parentGroupId ?? null);
  const oldParentId = dragged.parentGroupId ?? null;

  const byOrder = (a: GroupNode, b: GroupNode) => (a.order || 0) - (b.order || 0);
  const childrenOf = (parentId: string | null) =>
    groups.filter((g) => (g.parentGroupId ?? null) === parentId && g.id !== draggedId).sort(byOrder);

  const moves: GroupMove[] = [];
  const sequence = (list: GroupNode[], parentId: string | null) => {
    list.forEach((g, index) => {
      moves.push(
        g.id === draggedId
          ? { id: g.id, order: index, parentGroupId: parentId }
          : { id: g.id, order: index },
      );
    });
  };

  // Close the gap left behind, unless the group isn't changing parent.
  if (oldParentId !== newParentId) sequence(childrenOf(oldParentId), oldParentId);

  if (nesting) {
    sequence([...childrenOf(targetId), dragged], targetId);
    return moves;
  }

  const destination = childrenOf(newParentId);
  const targetIdx = destination.findIndex((g) => g.id === targetId);
  if (targetIdx === -1) return [];
  const insertAt = position === 'above' ? targetIdx : targetIdx + 1;
  sequence([...destination.slice(0, insertAt), dragged, ...destination.slice(insertAt)], newParentId);
  return moves;
}
