import { useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, ChevronLeft, Building2, HardHat, Package, Star, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { apiRequest } from "@/lib/queryClient";
import { PriceList, type PriceListHandle } from "@/components/systems/PriceList";
import { PriceListFormModal } from "@/components/systems/PriceListFormModal";
import type { PriceList as PriceListType } from "@shared/schema";

const KIND_META = {
  supplier: { label: "Supplier", icon: Building2 },
  labour: { label: "Labour", icon: HardHat },
  internal: { label: "Internal", icon: Package },
} as const;

function formatEffective(list: PriceListType): string | null {
  const from = list.effectiveFrom ? new Date(list.effectiveFrom) : null;
  const to = list.effectiveTo ? new Date(list.effectiveTo) : null;
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Until ${fmt(to)}`;
  return null;
}

export default function PriceListPage() {
  const { id } = useParams<{ id: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const priceListRef = useRef<PriceListHandle>(null);

  const { data: list, isLoading, isError } = useQuery<PriceListType>({
    queryKey: ["/api/price-lists", id],
    queryFn: () => apiRequest(`/api/price-lists/${id}`, "GET"),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full" data-testid="price-list-page">
        <div className="h-9 border-b border-border flex items-center px-2 gap-2">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-3 space-y-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !list) {
    return (
      <div className="flex flex-col h-full" data-testid="price-list-page">
        <div className="h-9 bg-background flex items-center px-2 border-b border-border flex-shrink-0">
          <Link href="/price-lists" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3 w-3" />
            Price Lists
          </Link>
        </div>
        <EmptyState
          variant="inline"
          icon={Package}
          title="Price list not found"
          description="It may have been deleted, or belong to another company."
        />
      </div>
    );
  }

  const meta = KIND_META[list.kind as keyof typeof KIND_META] ?? KIND_META.internal;
  const KindIcon = meta.icon;
  const effective = formatEffective(list);

  return (
    <div className="flex flex-col h-full" data-testid="price-list-page">
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/price-lists"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
            data-testid="link-back-to-lists"
          >
            <ChevronLeft className="h-3 w-3" />
            Price Lists
          </Link>
          <span className="text-muted-foreground/50 text-xs">/</span>

          <div className="flex items-center gap-1.5 min-w-0">
            <KindIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold truncate">{list.name}</h2>
            {list.isDefault && <Star className="h-3 w-3 fill-primary text-primary shrink-0" aria-label="Default list" />}
          </div>

          <Badge variant="outline" className="h-4 text-label shrink-0">{meta.label}</Badge>
          {list.isArchived && <Badge variant="secondary" className="h-4 text-label shrink-0">Archived</Badge>}

          <div className="relative w-56 shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 pl-7 text-xs border rounded-md"
              data-testid="input-search-price-list"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {effective && (
            <span className="text-label text-muted-foreground hidden lg:inline">{effective}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowEditModal(true)}
            data-testid="button-edit-list-details"
          >
            <Pencil className="h-3 w-3 mr-1" />
            Details
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => priceListRef.current?.openAddModal()}
            data-testid="button-add-price-list-item"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <PriceList
          ref={priceListRef}
          searchQuery={searchQuery}
          priceListId={list.id}
          kind={list.kind as "supplier" | "labour" | "internal"}
        />
      </div>

      <PriceListFormModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        list={list}
      />
    </div>
  );
}
