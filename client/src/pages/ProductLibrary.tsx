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
  ChevronsUpDown, ChevronsDownUp, Loader2, Trash2, MoreVertical,
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
import { formatCents } from "@shared/money";

interface ProductImage { id: number; filePath: string; fileName: string | null }

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
  images?: ProductImage[];
}

/** Same shape as the price list's GRID_COLUMNS so both grids resize alike. */
const GRID_COLUMNS = [
  { key: "name",        label: "Product",  defaultWidth: 280, required: true },
  { key: "sku",         label: "SKU",      defaultWidth: 120 },
  { key: "brand",       label: "Brand",    defaultWidth: 140 },
  { key: "subcategory", label: "Subcategory", defaultWidth: 140 },
  { key: "unit",        label: "Unit",     defaultWidth: 70 },
  { key: "cost",        label: "Cost",     defaultWidth: 110, align: "right" as const },
];

const UNGROUPED = "__ungrouped__";

export default function ProductLibrary() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [groupBy, setGroupBy] = useState<"category" | "none">("category");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const gridCols = useResizableColumns("product-library", GRID_COLUMNS);
  // Mirrors the price list's `32px … 1fr 72px`: a 32px checkbox column (which is
  // also what insets the first cell from the card edge), the sized columns, 1fr
  // to soak up slack, then the actions column.
  const gridTemplate = `32px ${gridCols.gridTemplate} 1fr 72px`;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort() as string[],
    [products],
  );

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filterCategory !== "all") {
        const c = p.category ?? UNGROUPED;
        if (c !== filterCategory) return false;
      }
      if (!t) return true;
      return [p.name, p.brand, p.sku, p.subcategory, p.description]
        .some((f) => (f ?? "").toLowerCase().includes(t));
    });
  }, [products, search, filterCategory]);

  const groups = useMemo(() => {
    if (groupBy === "none") {
      return [{ id: "all", name: "All products", items: filtered }];
    }
    const byCat = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = p.category ?? UNGROUPED;
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(p);
    }
    return Array.from(byCat.entries())
      .sort(([a], [b]) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b)))
      .map(([id, items]) => ({
        id,
        name: id === UNGROUPED ? "Uncategorised" : id,
        items: items.slice().sort((x, y) => x.name.localeCompare(y.name)),
      }));
  }, [filtered, groupBy]);

  const allExpanded = groups.every((g) => !collapsed.has(g.id));
  const activeFilterCount = (filterCategory !== "all" ? 1 : 0) + (groupBy !== "category" ? 1 : 0);

  const createMutation = useMutation({
    mutationFn: (category?: string | null) =>
      apiRequest("/api/products", "POST", {
        name: "New product",
        unitType: "ea",
        isActive: true,
        ...(category ? { category } : {}),
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
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-filter-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                    ))}
                    <SelectItem value={UNGROUPED} className="text-xs">Uncategorised</SelectItem>
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
                  onClick={() => { setFilterCategory("all"); setGroupBy("category"); }}
                  data-testid="button-clear-filters"
                >
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <Button
          size="sm"
          className="h-6 px-2 text-xs flex-shrink-0"
          onClick={() => { setCreating(true); createMutation.mutate(null); }}
          disabled={creating}
          data-testid="button-add-product"
        >
          {creating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
          Add Product
        </Button>
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
            title={search || filterCategory !== "all" ? "No products match your filters." : "No products yet"}
            description={
              search || filterCategory !== "all"
                ? undefined
                : "Add one here, or save an option to the library from any selection."
            }
            action={
              search || filterCategory !== "all"
                ? undefined
                : { label: "Add Product", onClick: () => { setCreating(true); createMutation.mutate(null); }, icon: Plus }
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
  );
}
