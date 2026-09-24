/**
 * The Product Library's left pane: the group hierarchy, browsable.
 *
 * The page used to draw one flat card per LEAF group, labelled "Electrical ›
 * Exhaust fans". Siblings clustered because the labels sorted together, so it
 * read well enough at a dozen groups — but there was no indentation, no way to
 * collapse all of Electrical, and nothing that showed the shape of the tree.
 * The hierarchy was real in the data and invisible on screen.
 *
 * Counts are ROLLED UP: "Electrical 27" means 27 products at or beneath it. A
 * parent showing only what is filed directly against it reads as empty when all
 * the products sit one level down, which is the normal case.
 */
import { useMemo } from "react";
import { ChevronRight, ChevronDown, Package, Inbox, Layers } from "lucide-react";

export interface TreeGroup {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
}

/** Selection is a group id, or one of these two pseudo-nodes. */
export const ALL = "__all__";
export const UNFILED = "__unfiled__";

interface Node extends TreeGroup {
  children: Node[];
  /** Products filed directly against this group. */
  own: number;
  /** own + everything beneath it. */
  total: number;
}

function buildTree(groups: TreeGroup[], countByGroup: Map<string, number>): Node[] {
  const byId = new Map<string, Node>();
  for (const g of groups) {
    byId.set(g.id, { ...g, children: [], own: countByGroup.get(g.id) ?? 0, total: 0 });
  }
  const roots: Node[] = [];
  for (const node of Array.from(byId.values())) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    // A node whose parent is missing would otherwise vanish from the tree.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: Node[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  const totalRec = (n: Node): number => {
    n.total = n.own + n.children.reduce((s, c) => s + totalRec(c), 0);
    return n.total;
  };
  roots.forEach(totalRec);
  return roots;
}

/** Every id at or beneath `id` — what "include subgroups" resolves to. */
export function descendantIds(groups: TreeGroup[], id: string): Set<string> {
  const childrenOf = new Map<string | null, string[]>();
  for (const g of groups) {
    const k = g.parentId ?? null;
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k)!.push(g.id);
  }
  const out = new Set<string>([id]);
  const walk = (parent: string) => {
    for (const child of childrenOf.get(parent) ?? []) {
      if (out.has(child)) continue;   // a cycle would otherwise hang the walk
      out.add(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}

export function ProductGroupTree({
  groups, countByGroup, unfiledCount, totalCount,
  selected, onSelect, expanded, onToggle,
}: {
  groups: TreeGroup[];
  countByGroup: Map<string, number>;
  unfiledCount: number;
  totalCount: number;
  selected: string;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const roots = useMemo(() => buildTree(groups, countByGroup), [groups, countByGroup]);

  const row = (
    key: string, label: string, count: number, depth: number,
    icon: React.ReactNode, node?: Node,
  ) => {
    const isSelected = selected === key;
    const hasChildren = (node?.children.length ?? 0) > 0;
    const isOpen = expanded.has(key);
    return (
      <div key={key}>
        <button
          onClick={() => onSelect(key)}
          className={`w-full flex items-center gap-1.5 h-7 pr-2 rounded-md text-left transition-colors ${
            isSelected ? "bg-primary/10 text-primary" : "text-foreground hover-elevate"
          }`}
          style={{ paddingLeft: 6 + depth * 12 }}
          data-testid={`tree-node-${key}`}
        >
          {hasChildren ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onToggle(key); }}
              className="h-4 w-4 flex items-center justify-center text-muted-foreground flex-shrink-0 rounded hover-elevate"
              aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
              data-testid={`tree-toggle-${key}`}
            >
              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
          ) : (
            <span className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="flex-shrink-0 text-muted-foreground">{icon}</span>
          <span className="text-xs truncate flex-1 min-w-0">{label}</span>
          <span className={`text-[10px] tabular-nums flex-shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
            {count || ""}
          </span>
        </button>
        {hasChildren && isOpen && node!.children.map((c) =>
          row(c.id, c.name, c.total, depth + 1, <Package className="h-3 w-3" />, c),
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-0.5 py-1" data-testid="product-group-tree">
      {row(ALL, "All products", totalCount, 0, <Layers className="h-3 w-3" />)}
      {roots.map((n) => row(n.id, n.name, n.total, 0, <Package className="h-3 w-3" />, n))}
      {/* Always present, even at zero — it is the to-do list for anything that
          arrived without a home, and hiding it is how those get forgotten. */}
      {row(UNFILED, "Unfiled", unfiledCount, 0, <Inbox className="h-3 w-3" />)}
      {groups.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-2 py-3">
          No groups yet. Use <span className="text-foreground">Groups &amp; tags</span> to add one.
        </p>
      )}
    </div>
  );
}
