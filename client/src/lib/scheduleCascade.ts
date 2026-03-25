import { differenceInDays, addDays, format } from "date-fns";
import type { ScheduleItem } from "@shared/schema";

export type CascadeUpdate = { id: number | string; startDate: string; endDate: string };

function parseLocalMidnight(d: string | Date): Date {
  const r = typeof d === "string" ? new Date(d + "T00:00:00") : new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function countWorkingDays(
  start: Date,
  end: Date,
  isNonWorking: (d: Date) => boolean,
): number {
  let count = 0;
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  if (s > e) return 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (!isNonWorking(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function addWorkingDays(
  date: Date,
  days: number,
  isNonWorking: (d: Date) => boolean,
): Date {
  let d = new Date(date);
  let remaining = Math.abs(days);
  const step = days >= 0 ? 1 : -1;
  while (remaining > 0) {
    d = new Date(d);
    d.setDate(d.getDate() + step);
    if (!isNonWorking(d)) remaining--;
  }
  return d;
}

function snapToWorkingDay(
  date: Date,
  direction: "forward" | "backward",
  isNonWorking: (d: Date) => boolean,
): Date {
  const r = new Date(date);
  const step = direction === "forward" ? 1 : -1;
  while (isNonWorking(r)) r.setDate(r.getDate() + step);
  return r;
}

function getItemDeps(
  item: ScheduleItem,
): Array<{ id: number | string; type: string; lag: number }> {
  return ((item.dependencies ?? []) as Array<{
    id: number | string;
    type?: string;
    lag?: number;
  }>).map(d => ({ id: d.id, type: d.type ?? "FS", lag: d.lag ?? 0 }));
}

function getChildrenRecursive(
  parentId: number | string,
  allItems: ScheduleItem[],
): ScheduleItem[] {
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
): ScheduleItem[] {
  const visited = new Set<number | string>();
  const result: ScheduleItem[] = [];
  const queue: Array<number | string> = [rootId];
  visited.add(rootId);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const it of allItems) {
      if (!visited.has(it.id) && getItemDeps(it).some(d => String(d.id) === String(cur))) {
        visited.add(it.id);
        result.push(it);
        queue.push(it.id);
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
  const { movedItemId, originalStart, newStart, allItems, isNonWorking } = params;

  const totalOffset = differenceInDays(
    parseLocalMidnight(newStart),
    parseLocalMidnight(originalStart),
  );
  if (totalOffset === 0) return [];

  const snapDir: "forward" | "backward" = totalOffset > 0 ? "forward" : "backward";

  const dependentItems = getAllDownstreamSuccessors(movedItemId, allItems);
  const childItems = getChildrenRecursive(movedItemId, allItems);

  const depChildIds = new Set<number | string>();
  const depChildItems: ScheduleItem[] = [];
  for (const depItem of dependentItems) {
    const children = getChildrenRecursive(depItem.id, allItems);
    for (const child of children) {
      if (!depChildIds.has(child.id) && !dependentItems.some(d => d.id === child.id)) {
        depChildIds.add(child.id);
        depChildItems.push(child);
      }
    }
  }

  const snapDepItem = (depItem: ScheduleItem): CascadeUpdate => {
    const depStart = parseLocalMidnight(depItem.startDate as string);
    const depEnd = parseLocalMidnight(depItem.endDate as string);
    const depWorkingDuration = countWorkingDays(depStart, depEnd, isNonWorking);
    let depNewStart = addDays(depStart, totalOffset);
    depNewStart = snapToWorkingDay(depNewStart, snapDir, isNonWorking);
    const depNewEnd = addWorkingDays(depNewStart, depWorkingDuration > 0 ? depWorkingDuration - 1 : 0, isNonWorking);
    return {
      id: depItem.id,
      startDate: format(depNewStart, "yyyy-MM-dd"),
      endDate: format(depNewEnd, "yyyy-MM-dd"),
    };
  };

  const snapChildItem = (childItem: ScheduleItem): CascadeUpdate => {
    const childStart = parseLocalMidnight(childItem.startDate as string);
    const childEnd = parseLocalMidnight(childItem.endDate as string);
    const origStartMidnight = parseLocalMidnight(originalStart);
    const newStartMidnight = parseLocalMidnight(newStart);
    const relativeWD = countWorkingDays(origStartMidnight, childStart, isNonWorking);
    const childWorkingDuration = countWorkingDays(childStart, childEnd, isNonWorking);
    const depNewStart = addWorkingDays(newStartMidnight, relativeWD, isNonWorking);
    const depNewEnd = addWorkingDays(depNewStart, childWorkingDuration > 0 ? childWorkingDuration - 1 : 0, isNonWorking);
    return {
      id: childItem.id,
      startDate: format(depNewStart, "yyyy-MM-dd"),
      endDate: format(depNewEnd, "yyyy-MM-dd"),
    };
  };

  const updates: CascadeUpdate[] = [];

  for (const child of childItems) {
    if (!dependentItems.some(d => d.id === child.id)) {
      updates.push(snapChildItem(child));
    }
  }

  for (const depItem of dependentItems) {
    updates.push(snapDepItem(depItem));
  }

  for (const depChild of depChildItems) {
    updates.push(snapDepItem(depChild));
  }

  return updates;
}
