/**
 * Pure helpers for checking the ids a schedule-item write points at.
 *
 * A schedule item carries several id lists that the server later ACTS on:
 * `dependencies` drive the date cascade, and `taskLinkOffsets` make the server
 * rewrite those tasks' due dates whenever the item moves. Every one of them has
 * to be checked before it is stored, not just the item's own id.
 */

/** Predecessor ids per item: `graph.get(x)` = the items `x` depends on. */
export type DependencyGraph = Map<string, string[]>;

/**
 * Whether following predecessor links from any item can lead back to itself.
 *
 * Walks the WHOLE chain. The dependency endpoint's old check re-read one item's
 * predecessor list at every level, so A→B→C plus "A depends on C" was accepted.
 */
export function hasDependencyCycle(graph: DependencyGraph): boolean {
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();

  const visit = (start: string): boolean => {
    // Iterative DFS: a long programme must not blow the stack.
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
    state.set(start, VISITING);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const preds = graph.get(frame.id) ?? [];
      if (frame.next >= preds.length) {
        state.set(frame.id, DONE);
        stack.pop();
        continue;
      }
      const pred = preds[frame.next++];
      const s = state.get(pred);
      if (s === VISITING) return true;
      if (s === DONE) continue;
      state.set(pred, VISITING);
      stack.push({ id: pred, next: 0 });
    }
    return false;
  };

  for (const id of Array.from(graph.keys())) {
    if (!state.has(id) && visit(id)) return true;
  }
  return false;
}

/** Builds a graph from schedule rows, with `overrides` replacing an item's stored links. */
export function buildDependencyGraph(
  items: Array<{ id: string; dependencies?: unknown }>,
  overrides: Map<string, string[]> = new Map(),
): DependencyGraph {
  const graph: DependencyGraph = new Map();
  for (const it of items) {
    const deps = Array.isArray(it.dependencies) ? (it.dependencies as any[]) : [];
    graph.set(String(it.id), deps.map((d) => String(d?.id)).filter(Boolean));
  }
  overrides.forEach((preds, id) => graph.set(id, preds));
  return graph;
}

/** Every task id a schedule-item payload refers to: `taskIds` plus `taskLinkOffsets[].taskId`. */
export function referencedTaskIds(data: { taskIds?: unknown; taskLinkOffsets?: unknown }): string[] {
  const ids = new Set<string>();
  if (Array.isArray(data.taskIds)) {
    for (const id of data.taskIds) if (id) ids.add(String(id));
  }
  if (Array.isArray(data.taskLinkOffsets)) {
    for (const o of data.taskLinkOffsets as any[]) if (o?.taskId) ids.add(String(o.taskId));
  }
  return Array.from(ids);
}
