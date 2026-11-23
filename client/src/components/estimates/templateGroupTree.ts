/**
 * Nested groups on an estimate TEMPLATE.
 *
 * A template stores its lines as one JSON array. A group is identified by its
 * NAME (lines point at it with `groupName`), and a group's own record is a row
 * with `isGroup: true`. Nesting adds one field to that row: `parentGroupName`.
 *
 * Group ORDER is the order of the group rows in the array — that is how the
 * grid has always read it — so a move is written by re-laying the group rows
 * out depth-first: every parent immediately followed by its subtree. Lines are
 * left exactly where they are; they only ever reference a group by name.
 *
 * Kept free of React so it can be tested with plain `npx tsx`.
 */
import { formatGroupPath, parseGroupPath } from "@shared/import";

/** The bucket for lines with no group. Shown as "General"; never nested. */
export const UNGROUPED = "ungrouped";

/** The fields of a template row this module reads or writes. */
export interface TemplateRowLike {
  id: string;
  name: string;
  isGroup: boolean;
  groupName?: string;
  parentGroupName?: string;
  sortOrder: number;
  isCollapsed?: boolean;
}

export const groupKey = (row: { name?: string }) => row.name || UNGROUPED;

/**
 * Every group in display order: group rows first (they carry the author's
 * order), then any group that exists only as a name on a line — every
 * template written before group rows did.
 */
export function templateGroupOrder<T extends TemplateRowLike>(items: T[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => {
    if (!seen.has(n)) { seen.add(n); order.push(n); }
  };
  items.filter((i) => i.isGroup).forEach((g) => add(groupKey(g)));
  items.filter((i) => !i.isGroup).forEach((i) => add(i.groupName || UNGROUPED));
  if (order.length === 0) order.push(UNGROUPED);
  return order;
}

/**
 * Each group's parent, or null for a top-level group.
 *
 * Defensive, because this is hand-editable JSON: a parent that names no group,
 * names itself, or closes a loop is read as top level. A loop would otherwise
 * make every group in it vanish — none of them would be top level, so nothing
 * would ever draw them.
 */
export function templateGroupParents<T extends TemplateRowLike>(items: T[]): Map<string, string | null> {
  const names = new Set(templateGroupOrder(items));
  const declared = new Map<string, string | null>();
  for (const g of items.filter((i) => i.isGroup)) {
    const name = groupKey(g);
    const p = g.parentGroupName;
    declared.set(
      name,
      p && p !== name && names.has(p) && p !== UNGROUPED && name !== UNGROUPED ? p : null,
    );
  }
  const parents = new Map<string, string | null>();
  for (const name of Array.from(names)) {
    // Walk up; if we come back round, this group's link is the one to cut.
    const seen = new Set<string>([name]);
    let cur = declared.get(name) ?? null;
    let loops = false;
    while (cur) {
      if (seen.has(cur)) { loops = true; break; }
      seen.add(cur);
      cur = declared.get(cur) ?? null;
    }
    parents.set(name, loops ? null : (declared.get(name) ?? null));
  }
  return parents;
}

/**
 * Write a group tree back into the template.
 *
 * `parentOf` and `orderOf` describe the tree wanted (order is per parent, only
 * relative order matters). Every group gets a real row — a name-only group is
 * given one here, carrying nothing but its name and place — and the rows are
 * laid out depth-first ahead of the lines.
 */
export function layoutTemplateGroups<T extends TemplateRowLike>(
  items: T[],
  parentOf: Map<string, string | null>,
  orderOf: Map<string, number>,
  newId: () => string = () => crypto.randomUUID(),
): T[] {
  const names = templateGroupOrder(items);
  const childrenOf = (parent: string | null) =>
    names
      .filter((n) => (parentOf.get(n) ?? null) === parent)
      .sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));

  const sequence: string[] = [];
  const placed = new Set<string>();
  const visit = (parent: string | null) => {
    for (const n of childrenOf(parent)) {
      if (placed.has(n)) continue;
      placed.add(n);
      sequence.push(n);
      visit(n);
    }
  };
  visit(null);
  // Anything unreachable (should not happen once parents are sanitised) is
  // kept at top level rather than dropped.
  names.forEach((n) => { if (!placed.has(n)) { placed.add(n); sequence.push(n); } });

  const rowByName = new Map<string, T>();
  items.filter((i) => i.isGroup).forEach((g) => {
    if (!rowByName.has(groupKey(g))) rowByName.set(groupKey(g), g);
  });

  // General (no group) is where ungrouped lines show; it is not a group of
  // its own, so it never gets a row made for it. One already there is kept.
  const named = sequence.filter((name) => name !== UNGROUPED || rowByName.has(name));
  const groupRows = named.map((name, idx) => {
    const parent = parentOf.get(name) ?? null;
    const existing = rowByName.get(name);
    const base = existing ?? ({ id: newId(), name, isGroup: true, isCollapsed: false } as unknown as T);
    const row = { ...base, sortOrder: idx } as T;
    if (parent) row.parentGroupName = parent;
    else delete row.parentGroupName;
    return row;
  });
  return [...groupRows, ...items.filter((i) => !i.isGroup)];
}

/** The current tree, as the maps layoutTemplateGroups takes. */
export function currentTree<T extends TemplateRowLike>(items: T[]) {
  const order = templateGroupOrder(items);
  return {
    parentOf: templateGroupParents(items),
    orderOf: new Map(order.map((n, i) => [n, i] as [string, number])),
  };
}

/** Every group nested anywhere under `root`. */
export function templateDescendants(parentOf: Map<string, string | null>, root: string): Set<string> {
  const out = new Set<string>();
  const queue = [root];
  while (queue.length) {
    const cur = queue.shift()!;
    parentOf.forEach((p, n) => {
      if (p === cur && !out.has(n)) { out.add(n); queue.push(n); }
    });
  }
  return out;
}

/**
 * What applying a template sends the estimate: each line with its group as a
 * PATH ("Kitchen > Joinery"), which the import route resolves into nested
 * sections, creating any that are missing. Lines are put in the template's
 * display order — group tree first, then each line's sortOrder — because the
 * route creates sections in the order it first meets them.
 */
export function linesForApply<T extends TemplateRowLike>(items: T[]): Array<{ line: T; groupPath: string }> {
  const parentOf = templateGroupParents(items);
  const order = templateGroupOrder(items);
  const orderOf = new Map(order.map((n, i) => [n, i] as [string, number]));

  // Depth-first index of each group, so a subgroup's lines follow its parent's.
  const dfsIndex = new Map<string, number>();
  const visit = (parent: string | null) => {
    order
      .filter((n) => (parentOf.get(n) ?? null) === parent)
      .sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0))
      .forEach((n) => {
        if (dfsIndex.has(n)) return;
        dfsIndex.set(n, dfsIndex.size);
        visit(n);
      });
  };
  visit(null);

  const pathOf = (name: string): string => {
    if (name === UNGROUPED) return "";
    const segments: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = name;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      segments.unshift(cur);
      cur = parentOf.get(cur) ?? null;
    }
    return formatGroupPath(segments);
  };

  return items
    .filter((i) => !i.isGroup)
    .map((line, arrayIndex) => ({ line, arrayIndex }))
    .sort((a, b) => {
      const ga = dfsIndex.get(a.line.groupName || UNGROUPED) ?? 0;
      const gb = dfsIndex.get(b.line.groupName || UNGROUPED) ?? 0;
      if (ga !== gb) return ga - gb;
      const so = (a.line.sortOrder ?? 0) - (b.line.sortOrder ?? 0);
      return so !== 0 ? so : a.arrayIndex - b.arrayIndex;
    })
    .map(({ line }) => ({ line, groupPath: pathOf(line.groupName || UNGROUPED) }));
}

/**
 * Bring imported Group values into a template's group tree.
 *
 * Each value is a PATH ("Kitchen > Joinery"): the line goes in the last
 * segment, and every segment the template doesn't have yet becomes a group
 * under the one before it. Groups the template already has keep their place.
 * Existing groups first, then new ones in the order the sheet mentions them.
 *
 * Returns the template with its group rows laid out (lines untouched) and each
 * raw value's leaf group name (undefined = ungrouped).
 */
export function placeImportedGroups<T extends TemplateRowLike>(
  base: T[],
  rawGroups: Array<string | undefined>,
  newId: () => string = () => crypto.randomUUID(),
): { items: T[]; leafOf: Map<string, string | undefined> } {
  const existing = new Set(templateGroupOrder(base));
  const t0 = currentTree(base);
  const laidOut = layoutTemplateGroups(base, t0.parentOf, t0.orderOf, newId);

  const newGroups: string[] = [];
  const sheetParent = new Map<string, string | null>();
  const leafOf = new Map<string, string | undefined>();
  for (const raw of rawGroups) {
    const key = raw ?? "";
    if (leafOf.has(key)) continue;
    const segments = parseGroupPath(raw).filter((s) => s.toLowerCase() !== UNGROUPED);
    segments.forEach((seg, i) => {
      if (existing.has(seg) || sheetParent.has(seg)) return;
      sheetParent.set(seg, i > 0 ? segments[i - 1] : null);
      newGroups.push(seg);
    });
    leafOf.set(key, segments.length ? segments[segments.length - 1] : undefined);
  }

  const groupRows = laidOut.filter((i) => i.isGroup);
  const lines = laidOut.filter((i) => !i.isGroup);
  const withNew = [
    ...groupRows,
    ...newGroups.map((name, i) => {
      const parent = sheetParent.get(name);
      return {
        id: newId(),
        name,
        isGroup: true,
        isCollapsed: false,
        sortOrder: groupRows.length + i,
        ...(parent ? { parentGroupName: parent } : {}),
      } as unknown as T;
    }),
    ...lines,
  ];
  const tree = currentTree(withNew);
  newGroups.forEach((name) => tree.parentOf.set(name, sheetParent.get(name) ?? null));
  return { items: layoutTemplateGroups(withNew, tree.parentOf, tree.orderOf, newId), leafOf };
}
