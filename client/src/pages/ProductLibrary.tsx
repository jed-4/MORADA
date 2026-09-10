/**
 * Product Library — the list.
 *
 * Rebuilt to read as the price list does: the same page header, the same h-9
 * toolbar with a collapsed filter popover, the same group cards, the same
 * resizable columns from useResizableColumns, the same row height and hover.
 * Two grids that do the same job should not look like two different apps.
 *
 * A row opens /product-library/:id now. The old modal edited eight fields and
 * could not hold an image, which is thin for the record a client selection
 * points at.
 */
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Plus, Search, X, Filter, ChevronRight, ChevronDown,
  ChevronsUpDown, ChevronsDownUp, Loader2, Trash2, MoreVertical, FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/EmptyState";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResizableColumns, ColResizeHandle } from "@/components/useResizableColumns";
import { ProductTaxonomyDialog } from "@/components/ProductTaxonomyDialog";
import { ProductGroupTree, descendantIds, ALL, UNFILED } from "@/components/ProductGroupTree";
import { formatCents } from "@shared/money";

interface ProductImage { id: number; filePath: string; fileName: string | null }

interface ProductGroup { id: string; parentId: string | null; name: string; sortOrder: number }
interface ProductTag { id: string; name: string; colour: string | null; sortOrder: number }

interface Product {
  id: number;
  name: string;
  brand: string | null;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  defaultUnitCost: number | null;
  unitType: string | null;
  url: string | null;
  groupId: string | null;
  tagIds?: string[];
  images?: ProductImage[];
}

/** Same shape as the price list's GRID_COLUMNS so both grids resize alike. */
const GRID_COLUMNS = [
  { key: "name",        label: "Product",  defaultWidth: 280, required: true },
  { key: "sku",         label: "SKU",      defaultWidth: 120 },
  { key: "brand",       label: "Brand",    defaultWidth: 140 },
  { key: "subcategory", label: "Subcategory", defaultWidth: 140 },
  { key: "tags",        label: "Tags",     defaultWidth: 160 },
  { key: "unit",        label: "Unit",     defaultWidth: 70 },
  { key: "cost",        label: "Cost",     defaultWidth: 110, align: "right" as const },
];

const UNGROUPED = "__ungrouped__";

export default function ProductLibrary() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("all");
  // Where you are in the tree. ALL or UNFILED are pseudo-nodes; anything else is
  // a group id.
  const [branch, setBranch] = useState<string>(ALL);
  const [includeSub, setIncludeSub] = useState(true);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"category" | "none">("category");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  const { data: groups_ = [] } = useQuery<ProductGroup[]>({ queryKey: ["/api/product-groups"] });
  const { data: tags = [] } = useQuery<ProductTag[]>({ queryKey: ["/api/product-tags"] });

  const groupById = useMemo(() => new Map(groups_.map((g) => [g.id, g])), [groups_]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  /** "Roofing › Gutter" — a child reads as nonsense without its parent. */
  const groupLabel = (id: string | null): string => {
    if (!id) return "Unfiled";
    const g = groupById.get(id);
    if (!g) return "Unfiled";
    const parent = g.parentId ? groupById.get(g.parentId) : undefined;
    return parent ? `${parent.name} › ${g.name}` : g.name;
  };

  const gridCols = useResizableColumns("product-library", GRID_COLUMNS);
  // Mirrors the price list's `32px … 1fr 72px`: a 32px checkbox column (which is
  // also what insets the first cell from the card edge), the sized columns, 1fr
  // to soak up slack, then the actions column.
  const gridTemplate = `32px ${gridCols.gridTemplate} 1fr 72px`;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  /** Counts for the tree are of ALL products, not the filtered set — a count
   *  that moved as you typed would make the tree unreadable. */
  const countByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      if (!p.groupId) continue;
      m.set(p.groupId, (m.get(p.groupId) ?? 0) + 1);
    }
    return m;
  }, [products]);
  const unfiledCount = useMemo(() => products.filter((p) => !p.groupId).length, [products]);

  /** The branch, resolved to the set of group ids it covers. */
  const branchIds = useMemo(() => {
    if (branch === ALL || branch === UNFILED) return null;
    return includeSub ? descendantIds(groups_, branch) : new Set([branch]);
  }, [branch, includeSub, groups_]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return products.filter((p) => {
      if (branch === UNFILED) {
        if (p.groupId) return false;
      } else if (branchIds) {
        if (!p.groupId || !branchIds.has(p.groupId)) return false;
      }
      if (filterTag !== "all" && !(p.tagIds ?? []).includes(filterTag)) return false;
      if (!t) return true;
      return [p.name, p.brand, p.sku, p.subcategory, p.description]
        .some((f) => (f ?? "").toLowerCase().includes(t));
    });
  }, [products, search, branch, branchIds, filterTag]);

  const groups = useMemo(() => {
    if (groupBy === "none") {
      return [{ id: "all", name: "All products", items: filtered }];
    }
    const byGroup = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = p.groupId ?? UNGROUPED;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(p);
    }
    return Array.from(byGroup.entries())
      .map(([id, items]) => ({
        id,
        name: id === UNGROUPED ? "Unfiled" : groupLabel(id),
        items: items.slice().sort((x, y) => x.name.localeCompare(y.name)),
      }))
      // Unfiled last — it is a to-do list, not a category.
      .sort((a, b) => (a.id === UNGROUPED ? 1 : b.id === UNGROUPED ? -1 : a.name.localeCompare(b.name)));
  }, [filtered, groupBy, groupById]);

  const allExpanded = groups.every((g) => !collapsed.has(g.id));
  const activeFilterCount = (filterTag !== "all" ? 1 : 0) + (groupBy !== "category" ? 1 : 0);

  /** "Include subgroups" is meaningless on a leaf — only offer it where it does
   *  something. */
  const branchHasChildren = useMemo(
    () => groups_.some((g) => g.parentId === branch),
    [groups_, branch],
  );

  /** The branch's own label, for the header above the grid. */
  const branchLabel =
    branch === ALL ? "All products" :
    branch === UNFILED ? "Unfiled" :
    groupLabel(branch);

  const createMutation = useMutation({
    mutationFn: (groupId?: string | null) =>
      apiRequest("/api/products", "POST", {
        name: "New product",
        unitType: "ea",
        isActive: true,
        // Adding from inside a group files it there, so the new row does not
        // land in Unfiled and have to be moved.
        ...(groupId && groupId !== UNGROUPED ? { groupId } : {}),
      }),
    onSuccess: (p: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      // Straight into the detail page — a blank row in a grid is a dead end, and
      // naming a product is the first thing anyone wants to do.
      navigate(`/product-library/${p.id}`);
    },
    onError: (e: any) => toast({ title: "Could not create product", description: e?.message, variant: "destructive" }),
    onSettled: () => setCreating(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/products/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const cellFor = (p: Product, key: string) => {
    switch (key) {
      case "name":
        return (
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded border border-border bg-muted/40 overflow-hidden flex-shrink-0 flex items-center justify-center">
              {p.images?.[0] ? (
                <img src={p.images[0].filePath} alt="" className="h-full w-full object-cover" />
              ) : (
                <Package className="h-3 w-3 text-muted-foreground/50" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{p.name}</div>
              {p.description && (
                <div className="text-[10px] text-muted-foreground truncate">{p.description}</div>
              )}
            </div>
          </div>
        );
      case "sku":
        return <span className="text-xs text-muted-foreground truncate font-mono">{p.sku || "—"}</span>;
      case "brand":
        return <span className="text-xs text-muted-foreground truncate">{p.brand || "—"}</span>;
      case "subcategory":
        return <span className="text-xs text-muted-foreground truncate">{p.subcategory || "—"}</span>;
      case "tags": {
        const mine = (p.tagIds ?? []).map((id) => tagById.get(id)).filter(Boolean) as ProductTag[];
        if (mine.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-1 min-w-0">
            {mine.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="text-[10px] px-1.5 py-0.5 rounded-full border truncate max-w-[110px]"
                style={t.colour ? { borderColor: t.colour, color: t.colour } : undefined}
                title={t.name}
              >
                {t.name}
              </span>
            ))}
            {mine.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{mine.length - 2}</span>
            )}
          </div>
        );
      }
      case "unit":
        return <span className="text-xs text-muted-foreground">{p.unitType || "ea"}</span>;
      case "cost":
        return (
          <span className="text-xs text-right tabular-nums block">
            {p.defaultUnitCost != null ? formatCents(p.defaultUnitCost) : "—"}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="product-library-page">
      {/* Header — matches the price list detail page. */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">Product Library</h1>
          <span className="text-xs text-muted-foreground flex-shrink-0" data-testid="text-product-count">
            {products.length} {products.length === 1 ? "product" : "products"}
          </span>
        </div>
      </div>

      {/* Toolbar — the price list's h-9 row, same controls in the same order. */}
      <div className="h-9 flex items-center justify-between px-4 gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          {groupBy !== "none" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCollapsed(allExpanded ? new Set(groups.map((g) => g.id)) : new Set())}
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="button-toggle-expand"
                  aria-label={allExpanded ? "Collapse all" : "Expand all"}
                >
                  {allExpanded ? <ChevronsDownUp className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{allExpanded ? "Collapse all" : "Expand all"}</TooltipContent>
            </Tooltip>
          )}

          <div className="relative w-44 flex-shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-6 pl-7 pr-6 py-0 text-xs border bg-transparent"
              data-testid="input-search-products"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={`relative h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                      activeFilterCount > 0
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "border-border/50 text-muted-foreground"
                    }`}
                    data-testid="button-filter-products"
                    aria-label="Filter"
                  >
                    <Filter className="h-3 w-3" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Filter</TooltipContent>
            </Tooltip>

            <PopoverContent align="start" className="w-56 p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tag</Label>
                <Select value={filterTag} onValueChange={setFilterTag}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-filter-tag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Any tag</SelectItem>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Group by</Label>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-group-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category" className="text-xs">Category</SelectItem>
                    <SelectItem value="none" className="text-xs">Nothing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-full text-xs"
                  onClick={() => { setFilterTag("all"); setGroupBy("category"); }}
                  data-testid="button-clear-filters"
                >
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={() => setTaxonomyOpen(true)}
          data-testid="button-manage-taxonomy"
        >
          <FolderTree className="h-3 w-3" />
          Groups &amp; tags
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-xs flex-shrink-0"
          onClick={() => {
            setCreating(true);
            // Where you are is where it lands — otherwise every new product goes
            // to Unfiled and has to be moved.
            createMutation.mutate(branch === ALL || branch === UNFILED ? null : branch);
          }}
          disabled={creating}
          data-testid="button-add-product"
        >
          {creating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
          Add Product
        </Button>
        </div>
      </div>

      <ProductTaxonomyDialog open={taxonomyOpen} onOpenChange={setTaxonomyOpen} />

      <div className="flex-1 min-h-0 flex">
        {/* The hierarchy, browsable. Hidden on narrow screens, where search and
            the filter popover are the way through. */}
        <aside
          className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border overflow-y-auto px-2 py-1"
          data-testid="product-library-tree-pane"
        >
          <ProductGroupTree
            groups={groups_}
            countByGroup={countByGroup}
            unfiledCount={unfiledCount}
            totalCount={products.length}
            selected={branch}
            onSelect={setBranch}
            expanded={treeExpanded}
            onToggle={(id) => setTreeExpanded((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })}
          />
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Where you are, and whether you are seeing what sits beneath it. */}
          <div className="h-8 flex items-center gap-2 px-3 border-b border-border flex-shrink-0">
            <span className="text-xs font-medium truncate" data-testid="text-branch-label">{branchLabel}</span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </span>
            {branch !== ALL && branch !== UNFILED && branchHasChildren && (
              <label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer flex-shrink-0">
                <Checkbox
                  checked={includeSub}
                  onCheckedChange={(v) => setIncludeSub(v === true)}
                  aria-label="Include subgroups"
                  data-testid="checkbox-include-subgroups"
                />
                Include subgroups
              </label>
            )}
          </div>

      {/* Body — a card per group, exactly as the price list draws them. */}
      <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
        {isLoading ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Package}
            title={
              search || filterTag !== "all"
                ? "No products match your filters."
                : branch !== ALL
                  ? "Nothing filed here yet"
                  : groups_.length === 0
                    ? "Start with a group"
                    : "No products yet"
            }
            description={
              search || filterTag !== "all"
                ? undefined
                : branch !== ALL
                  ? "Add a product here, or pick another group on the left."
                  : groups_.length === 0
                    ? "A group is where products live — “Electrical”, then “Exhaust fans” under it. Tags come next: tag every Colorbond colour once and a whole selection can take the set in one go."
                    : "Add one here, or save an option to the library from any selection."
            }
            action={
              search || filterTag !== "all"
                ? undefined
                : groups_.length === 0 && branch === ALL
                  ? { label: "Groups & tags", onClick: () => setTaxonomyOpen(true), icon: FolderTree }
                  : {
                      label: "Add Product",
                      // Adding while a branch is selected files it there.
                      onClick: () => {
                        setCreating(true);
                        createMutation.mutate(branch === ALL || branch === UNFILED ? null : branch);
                      },
                      icon: Plus,
                    }
            }
            className="py-16"
          />
        ) : (
          groups.map((group) => {
            const expanded = !collapsed.has(group.id);
            return (
              <div
                key={group.id}
                className="bg-card rounded-md border border-border overflow-hidden"
                style={{ boxShadow: "var(--shadow-card)" }}
                data-testid={`section-group-${group.id}`}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {groupBy !== "none" && (
                      <button
                        onClick={() => setCollapsed((prev) => {
                          const next = new Set(prev);
                          next.has(group.id) ? next.delete(group.id) : next.add(group.id);
                          return next;
                        })}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={expanded ? "Collapse" : "Expand"}
                        data-testid={`button-collapse-${group.id}`}
                      >
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <span className="text-xs font-semibold">{group.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {group.items.length} {group.items.length === 1 ? "product" : "products"}
                    </span>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 border-t border-border overflow-x-auto dt-autohide-scrollbar">
                    <div style={{ minWidth: gridCols.minWidth + 44 }}>
                      <div
                        className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
                        style={{ gridTemplateColumns: gridTemplate }}
                      >
                        <span className="flex items-center justify-center">
                          <Checkbox
                            checked={group.items.length > 0 && group.items.every((i) => selected.has(i.id))}
                            onCheckedChange={(v) => setSelected((prev) => {
                              const next = new Set(prev);
                              group.items.forEach((i) => v ? next.add(i.id) : next.delete(i.id));
                              return next;
                            })}
                            aria-label="Select all in group"
                            data-testid={`select-all-${group.id}`}
                          />
                        </span>
                        {GRID_COLUMNS.map((c) => (
                          <span
                            key={c.key}
                            className={`relative select-none ${(c as any).align === "right" ? "text-right" : ""}`}
                            data-testid={`col-header-${c.key}`}
                          >
                            {c.label}
                            <ColResizeHandle
                              testId={`resize-${c.key}`}
                              onStart={(e) => gridCols.startResize(c.key, e.clientX, gridCols.widthFor(c.key, c.defaultWidth))}
                            />
                          </span>
                        ))}
                        <span />
                        <span />
                      </div>

                      {group.items.map((p) => (
                        <div
                          key={p.id}
                          className="group/row grid items-center py-2.5 border-b border-border gap-2 rounded-sm hover:bg-muted/30 cursor-pointer"
                          style={{ gridTemplateColumns: gridTemplate }}
                          onClick={() => navigate(`/product-library/${p.id}`)}
                          data-testid={`row-product-${p.id}`}
                        >
                          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selected.has(p.id)}
                              onCheckedChange={(v) => setSelected((prev) => {
                                const next = new Set(prev);
                                v ? next.add(p.id) : next.delete(p.id);
                                return next;
                              })}
                              aria-label={`Select ${p.name}`}
                              data-testid={`select-row-${p.id}`}
                            />
                          </div>
                          {GRID_COLUMNS.map((c) => (
                            <div key={c.key} className="min-w-0">{cellFor(p, c.key)}</div>
                          ))}
                          <span />
                          <div
                            className="flex items-center justify-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover/row:opacity-100"
                                  data-testid={`button-row-menu-${p.id}`}
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/product-library/${p.id}`} data-testid={`link-open-${p.id}`}>Open</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (window.confirm(`Delete "${p.name}"? It stays on any selection already using it.`)) {
                                      deleteMutation.mutate(p.id);
                                    }
                                  }}
                                  data-testid={`button-delete-${p.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => createMutation.mutate(group.id === UNGROUPED || groupBy === "none" ? null : group.id)}
                        className="w-full flex items-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground hover-elevate"
                        data-testid={`button-add-in-${group.id}`}
                      >
                        <Plus className="h-3 w-3" />
                        Add a product
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
