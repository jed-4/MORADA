import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus, Search, Building2, HardHat, Package, Archive, Star, MoreVertical, Pencil, Trash2,
  ChevronRight, Filter, X, ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { PriceList } from "@shared/schema";
import { PriceListFormModal } from "@/components/systems/PriceListFormModal";

type PriceListWithMeta = PriceList & { itemCount: number; supplierName: string | null };

/** `kind` is what stops every list looking the same — a rate card is not a supplier book. */
const KIND_META = {
  supplier: { label: "Supplier", icon: Building2, hint: "What you pay" },
  labour: { label: "Labour", icon: HardHat, hint: "Rate card" },
  internal: { label: "Internal", icon: Package, hint: "What you charge" },
} as const;

function formatEffective(list: PriceListWithMeta): string | null {
  const from = list.effectiveFrom ? new Date(list.effectiveFrom) : null;
  const to = list.effectiveTo ? new Date(list.effectiveTo) : null;
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Until ${fmt(to)}`;
  return null;
}

export default function PriceListsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingList, setEditingList] = useState<PriceListWithMeta | null>(null);

  const { data: lists = [], isLoading } = useQuery<PriceListWithMeta[]>({
    queryKey: ["/api/price-lists", kindFilter, showArchived],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (kindFilter !== "all") params.set("kind", kindFilter);
      if (showArchived) params.set("includeArchived", "true");
      const qs = params.toString();
      return apiRequest(`/api/price-lists${qs ? `?${qs}` : ""}`, "GET");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/price-lists/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Price list deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete price list", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      apiRequest(`/api/price-lists/${id}`, "PATCH", { isArchived }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: vars.isArchived ? "Price list archived" : "Price list restored" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update price list", description: error.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.supplierName || "").toLowerCase().includes(q) ||
      (l.description || "").toLowerCase().includes(q)
    );
  }, [lists, search]);


  const activeFilterCount = (kindFilter !== "all" ? 1 : 0) + (showArchived ? 1 : 0);

  return (
    <div className="flex h-full flex-col" data-testid="price-lists-page">
      {/* Breadcrumb strip — matches Tasks / Timesheets. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Resources</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Price Lists</span>
      </div>

      {/* Header panel — single condensed row, card top. */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 gap-2">
          {/* LEFT: search + filters */}
          <div className="flex items-center gap-1 min-w-0">
            <div className="relative w-44 flex-shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-6 pl-7 pr-6 py-0 text-xs border bg-transparent"
                data-testid="input-search-price-lists"
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

            {/* One filter control with a count badge, rather than a row of selects. */}
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
                      data-testid="button-filter-price-lists"
                      aria-label="Filter"
                    >
                      <Filter className="h-3 w-3" />
                      {activeFilterCount > 0 && (
                        <span
                          className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center"
                          data-testid="badge-filter-count"
                        >
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
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={kindFilter} onValueChange={setKindFilter}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-filter-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="labour">Labour</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs text-muted-foreground">Show archived</span>
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="h-3.5 w-3.5 rounded"
                    data-testid="checkbox-show-archived"
                  />
                </label>

                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setKindFilter("all"); setShowArchived(false); }}
                    className="w-full h-6 text-xs rounded-md border border-border/50 hover-elevate active-elevate-2"
                    data-testid="button-clear-filters"
                  >
                    Clear filters
                  </button>
                )}
              </PopoverContent>
            </Popover>

          </div>

          {/* RIGHT: compare + primary CTA */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate("/price-lists/search")}
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="button-compare-prices"
                  aria-label="Compare prices"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Compare prices across lists</TooltipContent>
            </Tooltip>

            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              onClick={() => { setEditingList(null); setShowFormModal(true); }}
              data-testid="button-new-price-list"
            >
              <Plus className="w-3 h-3" />
              <span>New Price List</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card p-3">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Package}
            title={search ? "No matching price lists" : "No price lists yet"}
            description={
              search
                ? "Try a different search."
                : "Create one per supplier, plus your own labour rates and design items."
            }
            action={search ? undefined : {
              label: "New Price List",
              icon: Plus,
              onClick: () => { setEditingList(null); setShowFormModal(true); },
              "data-testid": "button-create-first-price-list",
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((list) => {
              const meta = KIND_META[list.kind as keyof typeof KIND_META] ?? KIND_META.internal;
              const KindIcon = meta.icon;
              const effective = formatEffective(list);
              return (
                <div
                  key={list.id}
                  className={`group relative rounded-lg border bg-card p-3 hover-elevate transition ${list.isArchived ? "opacity-60" : ""}`}
                  style={list.colour ? { borderLeft: `3px solid ${list.colour}` } : undefined}
                  data-testid={`card-price-list-${list.id}`}
                >
                  <Link href={`/price-lists/${list.id}`} className="block">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <KindIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{list.name}</span>
                        {list.isDefault && (
                          <Star className="h-3 w-3 fill-primary text-primary shrink-0" aria-label="Default list" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <Badge variant="outline" className="h-4 text-label">{meta.label}</Badge>
                      {list.isArchived && (
                        <Badge variant="secondary" className="h-4 text-label">Archived</Badge>
                      )}
                      {list.supplierName && (
                        <span className="text-label text-muted-foreground truncate">{list.supplierName}</span>
                      )}
                    </div>

                    {list.description && (
                      <p className="text-label text-muted-foreground line-clamp-2 mb-2">{list.description}</p>
                    )}

                    <div className="flex items-center justify-between text-label text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                      </span>
                      {effective && <span>{effective}</span>}
                    </div>
                  </Link>

                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5" data-testid={`button-list-menu-${list.id}`}>
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingList(list); setShowFormModal(true); }}>
                          <Pencil className="h-3 w-3 mr-2" />
                          Edit details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => archiveMutation.mutate({ id: list.id, isArchived: !list.isArchived })}
                        >
                          <Archive className="h-3 w-3 mr-2" />
                          {list.isArchived ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            const msg = list.itemCount > 0
                              ? `Delete "${list.name}" and its ${list.itemCount} items? This cannot be undone.`
                              : `Delete "${list.name}"?`;
                            if (window.confirm(msg)) deleteMutation.mutate(list.id);
                          }}
                          data-testid={`button-delete-list-${list.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PriceListFormModal
        open={showFormModal}
        onOpenChange={(open) => {
          setShowFormModal(open);
          if (!open) setEditingList(null);
        }}
        list={editingList}
      />
    </div>
  );
}
