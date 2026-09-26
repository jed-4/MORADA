/**
 * How deep a schedule may nest, and how a flat list of items is turned into the
 * contiguous parent→children→sub-children order both the Gantt and the row
 * drag code render from.
 *
 * This lived inside Gantt.tsx and only ever understood two levels: an item with
 * a grandparent was bucketed under a parent nobody read, so it silently never
 * drew — even though <MoradaScheduleList> has always rendered three levels of
 * the same data. Pulling it out here fixes that, gives the logic somewhere to
 * be tested without standing up React, and lets the schedule TEMPLATE Gantt
 * reuse exactly the ordering the project Gantt uses.
 *
 * Tests: server/__tests__/schedule-nesting.test.ts
 */

export const MAX_NEST_DEPTH = 2;

// Work out, for every visible id, which item it should RENDER under and how
// deep that puts it.
//
// The real parent chain can be arbitrarily deep (nothing in the API stops it)
// but the Gantt only draws MAX_NEST_DEPTH levels. Rather than let a too-deep
// item fall off the page — which is what used to happen, silently — it is
// re-attached to the ancestor that sits one level above the cap. So a
// great-grandchild draws as a sibling of its own parent instead of vanishing.
//
// `parentIdOf` holds REAL parent links; an ancestor that has been filtered out
// of `ids` (by search or a filter pill) is treated as absent, which promotes
// its descendants rather than orphaning them.
export function resolveDisplayParents(
  ids: string[],
  parentIdOf: Map<string, string | null | undefined>,
): { displayParentOf: Map<string, string | null>; depthOf: Map<string, number> } {
  const visible = new Set(ids);
  const displayParentOf = new Map<string, string | null>();
  const depthOf = new Map<string, number>();

  // Ancestors of `id` that are themselves visible, nearest first. A cyclic
  // parent link reports `cyclic` so the caller can strand the row at top level
  // rather than hanging the render — or, worse, leaving it with a parent that
  // is reachable only through itself, which would make it unreachable from any
  // root and so invisible.
  const chainOf = (id: string): { chain: string[]; cyclic: boolean } => {
    const chain: string[] = [];
    const seen = new Set<string>([id]);
    let cur = parentIdOf.get(id);
    while (cur && visible.has(cur)) {
      if (seen.has(cur)) return { chain, cyclic: true };
      chain.push(cur);
      seen.add(cur);
      cur = parentIdOf.get(cur);
    }
    return { chain, cyclic: false };
  };

  for (const id of ids) {
    const { chain, cyclic } = chainOf(id);
    const depth = cyclic ? 0 : Math.min(chain.length, MAX_NEST_DEPTH);
    depthOf.set(id, depth);
    // The ancestor at `depth - 1`. `chain` runs nearest-first, so the ancestor
    // at depth k is chain[chain.length - 1 - k]; for k = depth - 1 that is
    // chain[chain.length - depth].
    displayParentOf.set(id, depth === 0 ? null : chain[chain.length - depth] ?? null);
  }

  return { displayParentOf, depthOf };
}

// Given a flat sequence of visible item ids plus a parent lookup, produce a
// normalized order where every group (parent + its descendants) is contiguous:
// each top-level item appears in `flatOrder` sequence, immediately followed by
// its children (also in `flatOrder` sequence), each of those followed by its
// own children. This guarantees a stray item can never sit between a parent and
// its children — regardless of drag state — so the mid-drag view always matches
// what persists after a refresh.
export function buildNormalizedOrder(
  flatOrder: string[],
  parentIdOf: Map<string, string | null | undefined>,
  collapsedItems: Set<string>,
): string[] {
  const { displayParentOf } = resolveDisplayParents(flatOrder, parentIdOf);

  const topLevel: string[] = [];
  const kidsByParent = new Map<string, string[]>();
  for (const id of flatOrder) {
    const p = displayParentOf.get(id) ?? null;
    if (p) {
      let arr = kidsByParent.get(p);
      if (!arr) {
        arr = [];
        kidsByParent.set(p, arr);
      }
      arr.push(id);
    } else {
      topLevel.push(id);
    }
  }

  // Emit parent-then-descendants depth first.
  //
  // `reached` marks every id the walk *accounted for*, including the ones a
  // collapsed ancestor deliberately hides; `result` holds only the ids that
  // should actually draw. Keeping the two apart is what lets the safety net
  // below tell "hidden on purpose" from "unreachable by accident".
  const result: string[] = [];
  const reached = new Set<string>();
  const markSubtree = (id: string) => {
    if (reached.has(id)) return;
    reached.add(id);
    const kids = kidsByParent.get(id);
    if (kids) for (const k of kids) markSubtree(k);
  };
  const emit = (id: string) => {
    if (reached.has(id)) return;
    reached.add(id);
    result.push(id);
    if (collapsedItems.has(id)) {
      // Hidden by design — account for the subtree so it is not "rescued".
      const kids = kidsByParent.get(id);
      if (kids) for (const k of kids) markSubtree(k);
      return;
    }
    const kids = kidsByParent.get(id);
    if (kids) for (const k of kids) emit(k);
  };
  for (const pid of topLevel) emit(pid);
  // Safety net for the "no visible row is ever dropped" guarantee: anything the
  // walk could not reach at all (only possible via a malformed parent link) is
  // appended at top level rather than disappearing.
  for (const id of flatOrder) emit(id);
  return result;
}
