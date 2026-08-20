import { useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, ChevronRight, Building2, HardHat, Package, Star, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { apiRequest } from "@/lib/queryClient";
import { PriceList, type PriceListHandle } from "@/components/systems/PriceList";
import { PriceListFormModal } from "@/components/systems/PriceListFormModal";
import type { PriceList as PriceListType } from "@shared/schema";

type PriceListDetail = PriceListType & { supplierName: string | null };

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
  const [showEditModal, setShowEditModal] = useState(false);
  const priceListRef = useRef<PriceListHandle>(null);

  const { data: list, isLoading, isError } = useQuery<PriceListDetail>({
    queryKey: ["/api/price-lists", id],
    queryFn: () => apiRequest(`/api/price-lists/${id}`, "GET"),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex h-full flex-col" data-testid="price-list-page">
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="border border-border rounded-lg bg-card flex-shrink-0">
          <div className="h-9 flex items-center px-3">
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex-1 border-x border-b border-border rounded-b-lg bg-card p-3 space-y-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !list) {
    return (
      <div className="flex h-full flex-col" data-testid="price-list-page">
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <Link href="/price-lists" className="text-xs text-muted-foreground hover:text-foreground">
            Price Lists
          </Link>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">Not found</span>
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
    <div className="flex h-full flex-col" data-testid="price-list-page">
      {/* Breadcrumb strip — the list name lives here, not in the toolbar. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <Link
          href="/price-lists"
          className="text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-back-to-lists"
        >
          Price Lists
        </Link>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground truncate" data-testid="text-page-title">
          {list.name}
        </span>
        {list.isDefault && <Star className="h-3 w-3 fill-primary text-primary flex-shrink-0" aria-label="Default list" />}
      </div>

      {/* Whose prices these are. Controls all live in the toolbar below. */}
      <div className="flex-shrink-0 px-4 pt-1 pb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate" data-testid="text-list-supplier">
            {list.supplierName || list.name}
          </h1>
          {list.isArchived && (
            <Badge variant="secondary" className="h-4 text-label flex-shrink-0">Archived</Badge>
          )}
          {effective && (
            <span className="text-xs text-muted-foreground truncate hidden lg:inline">{effective}</span>
          )}
        </div>
      </div>

      {/* No card here any more — each group brings its own, like the sections on an
          allowance. A single full-bleed white panel stood out against the page. */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PriceList
          ref={priceListRef}
          priceListId={list.id}
          kind={list.kind as "supplier" | "labour" | "internal"}
          onEditList={() => setShowEditModal(true)}
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
