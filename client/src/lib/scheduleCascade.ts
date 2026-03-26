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
  const origEndMidnight = parseScheduleDate(originalEnd);
  const newStartMidnight = parseScheduleDate(newStart);
  const newEndMidnight = parseScheduleDate(newEnd);

  const startOffset = differenceInDays(newStartMidnight, origStartMidnight);
  const endOffset = differenceInDays(newEndMidnight, origEndMidnight);

  if (startOffset === 0 && endOffset === 0) return [];

  const updatesMap = new Map<string, CascadeUpdate>();

  const recordUpdate = (update: CascadeUpdate) => {
    updatesMap.set(String(update.id), update);
  };

  if (startOffset !== 0) {
    const snapDir: "forward" | "backward" = startOffset > 0 ? "forward" : "backward";

    if (endOffset === 0) {
      const ssSuccessors = getAllDownstreamSuccessors(
        movedItemId,
        allItems,
        type => type === "SS",
      );
      for (const succ of ssSuccessors) {
        const succStart = parseScheduleDate(succ.startDate as string);
        const succEnd = parseScheduleDate(succ.endDate as string);
        if (!isValidDate(succStart) || !isValidDate(succEnd)) continue;
        const succWorkDuration = countWD(succStart, succEnd, isNonWorking);
        let succNewStart = addDays(succStart, startOffset);
        succNewStart = snapWD(succNewStart, snapDir, isNonWorking);
        const succNewEnd = addWD(succNewStart, succWorkDuration, isNonWorking);
        recordUpdate({
          id: succ.id,
          startDate: format(succNewStart, "yyyy-MM-dd"),
          endDate: format(succNewEnd, "yyyy-MM-dd"),
        });
      }
    } else {
      const dependentItems = getAllDownstreamSuccessors(movedItemId, allItems);
      const childItems = getChildrenRecursive(movedItemId, allItems);

      const depChildIds = new Set<number | string>();
      const depChildItems: ScheduleItem[] = [];
      for (const depItem of dependentItems) {
        for (const child of getChildrenRecursive(depItem.id, allItems)) {
          if (!depChildIds.has(child.id) && !dependentItems.some(d => d.id === child.id)) {
            depChildIds.add(child.id);
            depChildItems.push(child);
          }
        }
      }

      const shiftDepItem = (depItem: ScheduleItem): CascadeUpdate | null => {
        const depStart = parseScheduleDate(depItem.startDate as string);
        const depEnd = parseScheduleDate(depItem.endDate as string);
        if (!isValidDate(depStart) || !isValidDate(depEnd)) return null;
        const depWorkingDuration = countWD(depStart, depEnd, isNonWorking);
        let depNewStart = addDays(depStart, startOffset);
        depNewStart = snapWD(depNewStart, snapDir, isNonWorking);
        const depNewEnd = addWD(depNewStart, depWorkingDuration, isNonWorking);
        return {
          id: depItem.id,
          startDate: format(depNewStart, "yyyy-MM-dd"),
          endDate: format(depNewEnd, "yyyy-MM-dd"),
        };
      };

      const shiftChildItem = (childItem: ScheduleItem): CascadeUpdate | null => {
        const childStart = parseScheduleDate(childItem.startDate as string);
        const childEnd = parseScheduleDate(childItem.endDate as string);
        if (!isValidDate(childStart) || !isValidDate(childEnd)) return null;
        const relativeWD = countWD(origStartMidnight, childStart, isNonWorking);
        const childWorkingDuration = countWD(childStart, childEnd, isNonWorking);
        const depNewStart = addWD(newStartMidnight, relativeWD, isNonWorking);
        const depNewEnd = addWD(depNewStart, childWorkingDuration, isNonWorking);
        return {
          id: childItem.id,
          startDate: format(depNewStart, "yyyy-MM-dd"),
          endDate: format(depNewEnd, "yyyy-MM-dd"),
        };
      };

      for (const child of childItems) {
        if (!dependentItems.some(d => d.id === child.id)) {
          const u = shiftChildItem(child);
          if (u) recordUpdate(u);
        }
      }
      for (const depItem of dependentItems) {
        const u = shiftDepItem(depItem);
        if (u) recordUpdate(u);
      }
      for (const depChild of depChildItems) {
        const u = shiftDepItem(depChild);
        if (u) recordUpdate(u);
      }
    }
  }

  if (endOffset !== 0) {
    const snapDir: "forward" | "backward" = endOffset > 0 ? "forward" : "backward";
    const fsSuccessors = getAllDownstreamSuccessors(
      movedItemId,
      allItems,
      type => type === "FS" || type === "FF" || type === "SF",
    );
    for (const succ of fsSuccessors) {
      if (updatesMap.has(String(succ.id))) continue;
      const succStart = parseScheduleDate(succ.startDate as string);
      const succEnd = parseScheduleDate(succ.endDate as string);
      if (!isValidDate(succStart) || !isValidDate(succEnd)) continue;
      const succWorkDuration = countWD(succStart, succEnd, isNonWorking);
      let succNewStart = addDays(succStart, endOffset);
      succNewStart = snapWD(succNewStart, snapDir, isNonWorking);
      const succNewEnd = addWD(succNewStart, succWorkDuration, isNonWorking);
      recordUpdate({
        id: succ.id,
        startDate: format(succNewStart, "yyyy-MM-dd"),
        endDate: format(succNewEnd, "yyyy-MM-dd"),
      });
    }
  }

  return Array.from(updatesMap.values());
}
