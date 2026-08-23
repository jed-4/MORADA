import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCents } from "@shared/money";
import type { Contact, PriceList } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronRight, Filter, Loader2, Paperclip, Receipt, Search, Check } from "lucide-react";
import BillReviewResults, { type BatchResult } from "@/components/systems/BillReviewResults";

type BillRow = {
  id: string;
  billNumber: string;
  billDate: string | null;
  total: number;
  supplierId: string | null;
  supplierName: string | null;
  lineCount: number;
  priceReviewedAt: string | null;
  hasAttachment: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function AIPriceReviewPage() {
  const [supplierId, setSupplierId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [readSkus, setReadSkus] = useState(true);

  /** null until a search has actually been run — the page opens empty on purpose. */
  const [bills, setBills] = useState<BillRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<BatchResult | null>(null);

  const { data: suppliers = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", "supplier"],
    queryFn: () => apiRequest("/api/contacts?contactType=supplier", "GET"),
  });
  const { data: priceLists = [] } = useQuery<Array<PriceList & { itemCount: number }>>({
    queryKey: ["/api/price-lists"],
  });

  const effectiveListId = priceListId || priceLists[0]?.id || "";
  const activeFilterCount =
    (supplierId !== "all" ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const searchBills = useMutation({
    mutationFn: async (): Promise<BillRow[]> => {
      const params = new URLSearchParams();
      if (supplierId !== "all") params.set("supplierId", supplierId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (search.trim()) params.set("search", search.trim());
      return apiRequest(`/api/price-list/review/bills?${params.toString()}`, "GET");
    },
    onSuccess: (rows) => {
      setBills(rows);
      setResult(null);
      // Pre-select what has not been reviewed — the common intent, still undoable.
      setSelected(new Set(rows.filter((b) => !b.priceReviewedAt && b.lineCount > 0).map((b) => b.id)));
    },
  });

  const runReview = useMutation({
    mutationFn: async (): Promise<BatchResult> =>
      apiRequest("/api/price-list/review/batch", "POST", {
        priceListId: effectiveListId,
        billIds: Array.from(selected),
        readSkus,
        markReviewed: true,
      }),
    onSuccess: (data) => {
      setResult(data);
      setBills((prev) => prev?.map((b) =>
        selected.has(b.id) ? { ...b, priceReviewedAt: new Date().toISOString() } : b) ?? prev);
    },
  });

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selectable = (bills ?? []).filter((b) => b.lineCount > 0);
  const allSelected = selectable.length > 0 && selectable.every((b) => selected.has(b.id));

  return (
    <div className="flex h-full flex-col" data-testid="ai-price-review-page">
      <div className="flex flex-shrink-0 items-center gap-1 px-4 pb-1 pt-3">
        <span className="text-xs text-muted-foreground">Resources</span>
        <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
        <span className="text-xs font-medium text-foreground" data-testid="text-page-title">
          Bill price review
        </span>
      </div>

      <div className="flex-shrink-0 rounded-t-lg border border-border bg-card">
        <div className="flex h-9 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative w-40 flex-shrink-0">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Bill or supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchBills.mutate()}
                className="h-6 rounded-md border pl-7 text-xs"
                data-testid="input-search-bills"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="relative flex h-6 w-6 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="button-filter-bills"
                >
                  <Filter className="h-3 w-3" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1 -top-1 h-[14px] min-w-[14px] rounded-full bg-primary px-1 text-[9px] font-semibold leading-[14px] text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-60 space-y-2 p-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Supplier</label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-bill-supplier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All suppliers</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">From</label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="h-7 text-xs" data-testid="input-bill-date-from" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">To</label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      className="h-7 text-xs" data-testid="input-bill-date-to" />
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setSupplierId("all"); setDateFrom(""); setDateTo(""); }}
                    className="h-6 w-full rounded-md border border-border/50 text-xs hover-elevate active-elevate-2"
                    data-testid="button-clear-bill-filters"
                  >
                    Clear filters
                  </button>
                )}
              </PopoverContent>
            </Popover>

            <Select value={effectiveListId} onValueChange={setPriceListId}>
              <SelectTrigger className="h-6 w-44 flex-shrink-0 text-xs" data-testid="select-review-price-list">
                <SelectValue placeholder="Price list" />
              </SelectTrigger>
              <SelectContent>
                {priceLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {bills && selectable.length > 0 && (
              <button
                onClick={() => runReview.mutate()}
                disabled={!selected.size || !effectiveListId || runReview.isPending}
                className="flex h-6 w-auto items-center gap-0.5 rounded-md border border-primary/20 bg-primary px-2 text-xs text-white hover:bg-primary/90 active-elevate-2 disabled:opacity-50"
                data-testid="button-review-selected"
              >
                {runReview.isPending
                  ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Reading…</>
                  : `Review ${selected.size} bill${selected.size === 1 ? "" : "s"}`}
              </button>
            )}
            <button
              onClick={() => searchBills.mutate()}
              disabled={searchBills.isPending}
              className={`flex h-6 w-auto items-center gap-1 rounded-md border px-2 text-xs active-elevate-2 ${
                bills
                  ? "border-border/50 text-muted-foreground hover-elevate"
                  : "border-primary/20 bg-primary text-white hover:bg-primary/90"
              }`}
              data-testid="button-search-bills"
            >
              {searchBills.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" />Searching…</>
                : <><Search className="h-3 w-3" />Search bills</>}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-b-lg border-x border-b border-border bg-card">
        {!bills && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">Find the bills you want to check</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Narrow by supplier and date, then search. Pick the bills to read and their
              line items get compared against your price list.
            </p>
          </div>
        )}

        {bills && bills.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No bills match those filters</p>
            <p className="text-xs text-muted-foreground">Widen the date range or clear the supplier.</p>
          </div>
        )}

        {bills && bills.length > 0 && !result && (
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((b) => b.id)) : new Set())}
                aria-label="Select all bills"
                data-testid="checkbox-select-all-bills"
              />
              <span>{bills.length} bill{bills.length === 1 ? "" : "s"}</span>
              <label className="ml-auto flex cursor-pointer items-center gap-1.5">
                <Checkbox
                  checked={readSkus}
                  onCheckedChange={(v) => setReadSkus(!!v)}
                  data-testid="checkbox-read-skus"
                />
                <span>Read product codes from the attached documents</span>
              </label>
            </div>

            <div className="rounded-md border border-border">
              {bills.map((b, i) => (
                <div
                  key={b.id}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${i > 0 ? "border-t border-border" : ""} ${
                    b.lineCount === 0 ? "opacity-50" : ""
                  }`}
                  data-testid={`bill-row-${b.id}`}
                >
                  <Checkbox
                    checked={selected.has(b.id)}
                    disabled={b.lineCount === 0}
                    onCheckedChange={() => toggle(b.id)}
                    aria-label={`Select ${b.billNumber}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {b.billNumber}
                      {b.supplierName ? <span className="text-muted-foreground"> · {b.supplierName}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.billDate)} · {b.lineCount} line{b.lineCount === 1 ? "" : "s"} · {formatCents(b.total)}
                    </p>
                  </div>
                  {b.hasAttachment && (
                    <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
                  )}
                  {b.priceReviewedAt && (
                    <span className="flex flex-shrink-0 items-center gap-1 text-xs text-sage">
                      <Check className="h-3.5 w-3.5" />Reviewed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {result && <BillReviewResults result={result} priceListId={effectiveListId} />}
      </div>
    </div>
  );
}
