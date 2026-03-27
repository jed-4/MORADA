import { differenceInDays, addDays, format } from "date-fns";
import type { ScheduleItem } from "@shared/schema";

export type CascadeUpdate = { id: number | string; startDate: string; endDate: string };

export function parseScheduleDate(d: string | Date | null | undefined): Date {
  if (!d) return new Date(NaN);
  const r = typeof d === "string" ? new Date(d.substring(0, 10) + "T00:00:00") : new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

function countWD(start: Date, end: Date, isNonWorking: (d: Date) => boolean): number {
  let count = 0;
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  const forward = s <= e;
  const current = new Date(s);
  if (forward) {
    while (current < e) {
      if (!isNonWorking(current)) count++;
      current.setDate(current.getDate() + 1);
    }
  } else {
    while (current > e) {
      current.setDate(current.getDate() - 1);
      if (!isNonWorking(current)) count++;
    }
  }
  return count;
}

function addWD(date: Date, days: number, isNonWorking: (d: Date) => boolean): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  let remaining = Math.abs(days);
  const step = days >= 0 ? 1 : -1;
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (!isNonWorking(d)) remaining--;
  }
  return d;
}

function snapWD(date: Date, direction: "forward" | "backward", isNonWorking: (d: Date) => boolean): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const step = direction === "forward" ? 1 : -1;
  let guard = 14;
  while (isNonWorking(d) && guard-- > 0) {
    d.setDate(d.getDate() + step);
  }
  return d;
}

type NormDep = { id: number | string; type: string; lag: number };

function getItemDeps(item: ScheduleItem): NormDep[] {
  return ((item.dependencies ?? []) as Array<{
    id: number | string;
    type?: string;
    lag?: number;
  }>).map(d => ({ id: d.id, type: d.type ?? "FS", lag: d.lag ?? 0 }));
}

function getChildrenRecursive(parentId: number | string, allItems: ScheduleItem[]): ScheduleItem[] {
  const children: ScheduleItem[] = [];
  for (const ci of allItems) {
    if (String(ci.parentItemId) === String(parentId)) {
      children.push(ci, ...getChildrenRecursive(ci.id, allItems));
    }
  }
  return children;
}

function getAllDownstreamSuccessors(
  rootId: number | string,
  allItems: ScheduleItem[],
  depTypeFilter?: (type: string) => boolean,
): ScheduleItem[] {
  // Step 1: collect all reachable downstream successors via BFS.
  const reachable = new Set<string>();
  const queue: Array<string> = [String(rootId)];
  reachable.add(String(rootId));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const it of allItems) {
      const itId = String(it.id);
      if (!reachable.has(itId)) {
        const deps = getItemDeps(it).filter(d => String(d.id) === cur);
        const matching = depTypeFilter ? deps.some(d => depTypeFilter(d.type)) : deps.length > 0;
        if (matching) {
          reachable.add(itId);
          queue.push(itId);
        }
      }
    }
  }
  reachable.delete(String(rootId)); // root is the moved item, not a result

  // Step 2: build adjacency within the reachable set and compute in-degrees for
  //         Kahn's topological sort so diamond graphs are processed correctly.
  //
  //         In-degree counts only edges whose SOURCE is also in the reachable set
  //         (i.e. other downstream successors).  Edges from the root (moved item)
  //         are NOT counted so that direct root successors start with in-degree 0
  //         and seed the Kahn queue correctly.
  const itemById = new Map<string, ScheduleItem>();
  for (const it of allItems) if (reachable.has(String(it.id))) itemById.set(String(it.id), it);

  const inDegree = new Map<string, number>();
  const edges = new Map<string, string[]>(); // predecessor (within reachable) → successors
  for (const id of reachable) {
    inDegree.set(id, 0);
    edges.set(id, []);
  }
  for (const [id, item] of itemById) {
    for (const dep of getItemDeps(item)) {
      const predId = String(dep.id);
      const shouldInclude = depTypeFilter ? depTypeFilter(dep.type) : true;
      if (!shouldInclude) continue;
      // Only count edges from other reachable successors (NOT from rootId).
      if (reachable.has(predId)) {
        edges.get(predId)!.push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }
  }

  // Step 3: Kahn's algorithm — seeds with nodes that have no in-subgraph predecessors.
  const topoQueue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) topoQueue.push(id);
  }
  const sorted: ScheduleItem[] = [];
  while (topoQueue.length > 0) {
    const cur = topoQueue.shift()!;
    const item = itemById.get(cur);
    if (item) sorted.push(item);
    for (const next of (edges.get(cur) ?? [])) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) topoQueue.push(next);
    }
  }
  return sorted;
}

export function computeMoveCascade(params: {
  movedItemId: number | string;
  originalStart: Date;
  originalEnd: Date;
  newStart: Date;
  newEnd: Date;
  allItems: ScheduleItem[];
  isNonWorking: (d: Date) => boolean;
}): CascadeUpdate[] {
  const { movedItemId, originalStart, originalEnd, newStart, newEnd, allItems, isNonWorking } = params;

  const origStartMidnight = parseScheduleDate(originalStart);
  const newStartMidnight = parseScheduleDate(newStart);
  const newEndMidnight = parseScheduleDate(newEnd);

  const startOffset = differenceInDays(newStartMidnight, parseScheduleDate(originalStart));
  const endOffset = differenceInDays(newEndMidnight, parseScheduleDate(originalEnd));

  if (startOffset === 0 && endOffset === 0) return [];

  // Track updated start/end for every item we process so successive items in a
  // chain can reference their predecessor's new (cascade-computed) dates rather
  // than the raw calendar-day offset.  This is what preserves the stored lag gap.
  const updatedStartMap = new Map<string, Date>([[String(movedItemId), newStartMidnight]]);
  const updatedEndMap = new Map<string, Date>([[String(movedItemId), newEndMidnight]]);
  const updatesMap = new Map<string, CascadeUpdate>();

  // Fast lookup so every branch can resolve unchanged predecessor dates.
  const allItemsById = new Map<string, ScheduleItem>(allItems.map(i => [String(i.id), i]));

  const recordUpdate = (id: number | string, newS: Date, newE: Date) => {
    updatesMap.set(String(id), {
      id,
      startDate: format(newS, "yyyy-MM-dd"),
      endDate: format(newE, "yyyy-MM-dd"),
    });
    updatedStartMap.set(String(id), newS);
    updatedEndMap.set(String(id), newE);
  };

  // ── Resize-left (only start changes): cascade SS successors only ──────────
  if (startOffset !== 0 && endOffset === 0) {
    const ssSuccessors = getAllDownstreamSuccessors(
      movedItemId,
      allItems,
      type => type === "SS",
    );
    for (const succ of ssSuccessors) {
      const succStart = parseScheduleDate(succ.startDate as string);
      const succEnd = parseScheduleDate(succ.endDate as string);
      if (!isValidDate(succStart) || !isValidDate(succEnd)) continue;

      const deps = getItemDeps(succ);
      let requiredStart: Date | null = null;
      for (const dep of deps) {
        if (dep.type !== "SS") continue;
        // Use updated start if predecessor was moved; fall back to current value.
        const predStart = updatedStartMap.get(String(dep.id))
          ?? parseScheduleDate((allItemsById.get(String(dep.id))?.startDate as string | undefined));
        if (!predStart || !isValidDate(predStart)) continue;
        let cs = addDays(predStart, dep.lag);
        cs = snapWD(cs, "forward", isNonWorking);
        if (!requiredStart || cs > requiredStart) requiredStart = cs;
      }
      if (!requiredStart) continue;

      const workDuration = countWD(succStart, succEnd, isNonWorking);
      const newSuccEnd = addWD(requiredStart, workDuration, isNonWorking);
      recordUpdate(succ.id, requiredStart, newSuccEnd);
    }
    return Array.from(updatesMap.values());
  }

  // ── Regular move or resize-right ──────────────────────────────────────────
  // 1. Move direct children of the dragged item proportionally (working-day offset)
  const childItems = getChildrenRecursive(movedItemId, allItems);
  const allSuccessors = getAllDownstreamSuccessors(movedItemId, allItems);

  for (const child of childItems) {
    if (allSuccessors.some(s => s.id === child.id)) continue; // handled below
    const childStart = parseScheduleDate(child.startDate as string);
    const childEnd = parseScheduleDate(child.endDate as string);
    if (!isValidDate(childStart) || !isValidDate(childEnd)) continue;
    const relativeWD = countWD(origStartMidnight, childStart, isNonWorking);
    const childWorkDuration = countWD(childStart, childEnd, isNonWorking);
    const newChildStart = addWD(newStartMidnight, relativeWD, isNonWorking);
    const newChildEnd = addWD(newChildStart, childWorkDuration, isNonWorking);
    recordUpdate(child.id, newChildStart, newChildEnd);
  }

  // 2. Cascade each downstream dependency successor in BFS (topological) order.
  //    For each successor, compute the required start based on its predecessor's
  //    *new* dates and the stored lag — NOT by adding the raw calendar offset.
  //    This preserves the gap regardless of weekends or snap direction.
  //
  //    All predecessors (moved AND unmoved) are evaluated so that dragging an
  //    item backward cannot pull a successor past a constraint imposed by an
  //    unchanged predecessor.
  for (const succ of allSuccessors) {
    const succStart = parseScheduleDate(succ.startDate as string);
    const succEnd = parseScheduleDate(succ.endDate as string);
    if (!isValidDate(succStart) || !isValidDate(succEnd)) continue;
    const workDuration = countWD(succStart, succEnd, isNonWorking);

    const deps = getItemDeps(succ);
    let requiredStart: Date | null = null;

    for (const dep of deps) {
      const predIdStr = String(dep.id);
      let candidateStart: Date | null = null;

      if (dep.type === "FS" || dep.type === "SF") {
        // Use updated end if predecessor was moved; otherwise fall back to current value.
        const predEnd = updatedEndMap.get(predIdStr)
          ?? parseScheduleDate((allItemsById.get(predIdStr)?.endDate as string | undefined));
        if (predEnd && isValidDate(predEnd)) {
          let cs = addDays(predEnd, dep.lag + 1);
          cs = snapWD(cs, "forward", isNonWorking);
          candidateStart = cs;
        }
      } else if (dep.type === "SS") {
        const predStart = updatedStartMap.get(predIdStr)
          ?? parseScheduleDate((allItemsById.get(predIdStr)?.startDate as string | undefined));
        if (predStart && isValidDate(predStart)) {
          let cs = addDays(predStart, dep.lag);
          cs = snapWD(cs, "forward", isNonWorking);
          candidateStart = cs;
        }
      } else if (dep.type === "FF") {
        const predEnd = updatedEndMap.get(predIdStr)
          ?? parseScheduleDate((allItemsById.get(predIdStr)?.endDate as string | undefined));
        if (predEnd && isValidDate(predEnd)) {
          const newSuccEnd = snapWD(addDays(predEnd, dep.lag), "forward", isNonWorking);
          candidateStart = addWD(newSuccEnd, -workDuration, isNonWorking);
        }
      }

      // Multiple predecessors: take the latest required start so all constraints are met.
      if (candidateStart && (!requiredStart || candidateStart > requiredStart)) {
        requiredStart = candidateStart;
      }
    }

    if (!requiredStart) continue;

    const newSuccEnd = addWD(requiredStart, workDuration, isNonWorking);
    recordUpdate(succ.id, requiredStart, newSuccEnd);

    // Also move the successor's own children that aren't themselves in the successor list
    const succChildren = getChildrenRecursive(succ.id, allItems);
    for (const child of succChildren) {
      if (updatesMap.has(String(child.id))) continue;
      if (allSuccessors.some(s => s.id === child.id)) continue;
      const childStart = parseScheduleDate(child.startDate as string);
      const childEnd = parseScheduleDate(child.endDate as string);
      if (!isValidDate(childStart) || !isValidDate(childEnd)) continue;
      const relativeWD = countWD(succStart, childStart, isNonWorking);
      const childWorkDuration = countWD(childStart, childEnd, isNonWorking);
      const newChildStart = addWD(requiredStart, relativeWD, isNonWorking);
      const newChildEnd = addWD(newChildStart, childWorkDuration, isNonWorking);
      recordUpdate(child.id, newChildStart, newChildEnd);
    }
  }

  return Array.from(updatesMap.values());
}
