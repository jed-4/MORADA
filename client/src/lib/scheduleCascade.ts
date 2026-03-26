import { differenceInDays, addDays, format } from "date-fns";
import type { ScheduleItem } from "@shared/schema";

export type CascadeUpdate = { id: number | string; startDate: string; endDate: string };

export function parseScheduleDate(d: string | Date | null | undefined): Date {
  if (!d) return new Date(NaN);
  const r = typeof d === "string" ? new Date(d + "T00:00:00") : new Date(d);
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
  const visited = new Set<number | string>();
  const result: ScheduleItem[] = [];
  const queue: Array<number | string> = [rootId];
  visited.add(rootId);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const it of allItems) {
      if (!visited.has(it.id)) {
        const deps = getItemDeps(it).filter(d => String(d.id) === String(cur));
        const matching = depTypeFilter ? deps.some(d => depTypeFilter(d.type)) : deps.length > 0;
        if (matching) {
          visited.add(it.id);
          result.push(it);
          queue.push(it.id);
        }
      }
    }
  }
  return result;
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
        const predNewStart = updatedStartMap.get(String(dep.id));
        if (!predNewStart) continue;
        // SS: successor starts dep.lag calendar days after predecessor's new start
        let cs = addDays(predNewStart, dep.lag);
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

      if ((dep.type === "FS" || dep.type === "SF") && updatedEndMap.has(predIdStr)) {
        // FS: start = predecessor new end + (lag + 1) calendar days, snapped forward
        const predNewEnd = updatedEndMap.get(predIdStr)!;
        let cs = addDays(predNewEnd, dep.lag + 1);
        cs = snapWD(cs, "forward", isNonWorking);
        candidateStart = cs;
      } else if (dep.type === "SS" && updatedStartMap.has(predIdStr)) {
        // SS: start = predecessor new start + lag calendar days, snapped forward
        const predNewStart = updatedStartMap.get(predIdStr)!;
        let cs = addDays(predNewStart, dep.lag);
        cs = snapWD(cs, "forward", isNonWorking);
        candidateStart = cs;
      } else if (dep.type === "FF" && updatedEndMap.has(predIdStr)) {
        // FF: end = predecessor new end + lag days; back-compute start from duration
        const predNewEnd = updatedEndMap.get(predIdStr)!;
        const newSuccEnd = snapWD(addDays(predNewEnd, dep.lag), "forward", isNonWorking);
        candidateStart = addWD(newSuccEnd, -workDuration, isNonWorking);
      }

      // Multiple predecessors: the successor must satisfy all constraints → use latest start
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
