import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, Package, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SelectionWithOptions } from "@shared/schema";

interface TradesPortalData {
  project: { id: string; name: string; address?: string | null };
  selections: (SelectionWithOptions & { allowance?: number | null })[];
}

function formatCents(c: number | null | undefined) {
  if (c == null) return "—";
  return `$${(c / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}

function SelectionCard({ sel }: { sel: TradesPortalData["selections"][number] }) {
  const [open, setOpen] = useState(true);
  const approved = sel.options?.find((o: any) => o.approvedAt || o.isSelectedByClient);
  const allowanceCents = Number((sel as any).allowance) || 0;
  const selectedCost = Number(approved?.totalCost) || 0;
  const isOver = allowanceCents > 0 && selectedCost > allowanceCents;

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover-elevate text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="font-medium text-sm flex-1 min-w-0 truncate">{sel.name}</span>
        {sel.category && <Badge variant="outline" className="text-[10px]">{sel.category}</Badge>}
        {(sel as any).room && <Badge variant="outline" className="text-[10px]">{(sel as any).room}</Badge>}
        {approved && (
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Approved</span>
          </div>
        )}
        {isOver && (
          <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400">
            Over allowance
          </Badge>
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {/* Metadata row */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3">
            {allowanceCents > 0 && (
              <span>Allowance: <b className="text-foreground">{formatCents(allowanceCents)}</b></span>
            )}
            {approved && (
              <span>Selected: <b className={cn("tabular-nums", isOver ? "text-orange-600 dark:text-orange-400" : "text-foreground")}>{formatCents(approved.totalCost)}</b></span>
            )}
            {allowanceCents > 0 && approved && (
              <span>Variance: <b className={cn("tabular-nums", isOver ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400")}>
                {formatCents(selectedCost - allowanceCents)}
              </b></span>
            )}
            {(sel as any).deadline && (
              <span>Deadline: <b className="text-foreground">{new Date((sel as any).deadline).toLocaleDateString("en-AU")}</b></span>
            )}
          </div>

          {/* Options */}
          {sel.options && sel.options.length > 0 ? (
            <div className="space-y-2">
              {sel.options.map((opt: any) => {
                const isSelected = opt.isSelectedByClient || !!opt.approvedAt;
                const images = opt.attachments || [];
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "rounded-md border px-3 py-2.5 flex items-start gap-3 text-sm",
                      isSelected ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30" : "border-border bg-background"
                    )}
                  >
                    {images.length > 0 && (
                      <img
                        src={images[0].filePath}
                        alt={opt.name}
                        className="w-12 h-12 rounded object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("font-medium text-sm", isSelected && "text-green-700 dark:text-green-300")}>{opt.name}</span>
                        {isSelected && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                            Selected
                          </Badge>
                        )}
                      </div>
                      {(opt.brand || opt.sku) && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {[opt.brand, opt.sku].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {opt.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opt.description}</div>
                      )}
                    </div>
                    <div className="text-xs tabular-nums text-right shrink-0">
                      <div className="font-medium">{formatCents(opt.totalCost)}</div>
                      {opt.quantity && opt.quantity !== 1 && (
                        <div className="text-muted-foreground">{opt.quantity} × {formatCents(opt.unitCost)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No options added yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TradesPortal() {
  const { token } = useParams<{ token: string }>();
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data, isLoading, error } = useQuery<TradesPortalData>({
    queryKey: ["/api/portal/project", token, "trades"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/project/${token}/trades`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load portal");
      }
      return res.json();
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="font-semibold">Link not found</h2>
          <p className="text-sm text-muted-foreground">
            {(error as any)?.message || "This link may have expired or been removed."}
          </p>
        </div>
      </div>
    );
  }

  const { project, selections } = data;

  const categories = Array.from(new Set(selections.map((s: any) => s.category).filter(Boolean))) as string[];

  const filtered = categoryFilter
    ? selections.filter((s: any) => s.category === categoryFilter)
    : selections;

  // Group by category for display
  const groups: Record<string, typeof filtered> = {};
  for (const sel of filtered) {
    const cat = (sel as any).category || "Uncategorised";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(sel);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-start gap-3">
          <Package className="w-6 h-6 text-primary mt-0.5 shrink-0" />
          <div>
            <h1 className="text-lg font-semibold">{project.name}</h1>
            {project.address && (
              <p className="text-sm text-muted-foreground">{project.address}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Selections Schedule — Trades View</p>
          </div>
          <div className="ml-auto text-xs text-muted-foreground tabular-nums">
            {selections.length} selection{selections.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Filters */}
      {categories.length > 1 && (
        <div className="border-b border-border bg-background/80 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setCategoryFilter("")}
              className={cn(
                "h-6 px-2.5 rounded-md text-xs shrink-0 hover-elevate active-elevate-2 border border-transparent",
                !categoryFilter ? "bg-primary text-white" : "text-muted-foreground"
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? "" : cat)}
                className={cn(
                  "h-6 px-2.5 rounded-md text-xs whitespace-nowrap shrink-0 hover-elevate active-elevate-2 border border-transparent",
                  categoryFilter === cat ? "bg-primary text-white" : "text-muted-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">No selections found.</p>
          </div>
        ) : (
          Object.entries(groups).map(([cat, sels]) => (
            <div key={cat}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</h2>
              <div className="space-y-2">
                {sels.map((sel) => (
                  <SelectionCard key={sel.id} sel={sel} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border py-4">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-muted-foreground">
          Generated by Morada · For trade use only · Do not distribute
        </div>
      </div>
    </div>
  );
}
