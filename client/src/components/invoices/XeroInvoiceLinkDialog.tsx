import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search, AlertTriangle, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCents } from "@shared/money";
import { cn } from "@/lib/utils";

/**
 * Point a Morada client invoice at an invoice that already exists in Xero —
 * e.g. it was pushed twice and the linked copy was deleted, or it was raised
 * in Xero directly. Nothing is written to Xero; Morada links to the chosen
 * invoice and pulls its status and payments.
 */

interface Candidate {
  xeroInvoiceId: string;
  invoiceNumber: string | null;
  reference: string | null;
  contactName: string | null;
  date: string | null;
  status: string;
  totalCents: number;
  amountPaidCents: number;
  linkedToInvoiceId: string | null;
  linkedToInvoiceNumber: string | null;
}

interface CandidatesResponse {
  clientName: string | null;
  filteredByClient: boolean;
  moradaTotalCents: number;
  candidates: Candidate[];
}

const STATUS_LABEL: Record<string, string> = {
  AUTHORISED: "Awaiting payment",
  PAID: "Paid",
  SUBMITTED: "Awaiting approval",
};

function formatXeroDate(d: string | null): string {
  if (!d) return "—";
  const ms = /\/Date\((\d+)/.exec(d)?.[1];
  const date = ms ? new Date(Number(ms)) : new Date(d);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
}

export function XeroInvoiceLinkDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber?: string | null;
}) {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setSearchInput(""); setSearch(""); setSelectedId(null); }
  }, [open]);

  // Debounce the Xero search — each keystroke would be a Xero API call.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, error } = useQuery<CandidatesResponse>({
    queryKey: [`/api/xero/client-invoices/${invoiceId}/link-candidates`, search],
    queryFn: async () => {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/xero/client-invoices/${invoiceId}/link-candidates${qs}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not load invoices from Xero");
      return body;
    },
    enabled: open,
    staleTime: 30_000,
  });

  const selected = data?.candidates.find((c) => c.xeroInvoiceId === selectedId) ?? null;
  const totalsDiffer = !!selected && !!data && selected.totalCents !== data.moradaTotalCents;

  const linkMutation = useMutation({
    mutationFn: async (xeroInvoiceId: string) =>
      apiRequest(`/api/xero/client-invoices/${invoiceId}/link`, "POST", { xeroInvoiceId }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${invoiceId}/payments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      toast({
        title: `Linked to Xero ${res?.xeroInvoiceNumber ? `#${res.xeroInvoiceNumber}` : "invoice"}`,
        description: res?.totalsMatch === false
          ? `Xero's total is ${formatCents(res.xeroTotalCents)} — different from this invoice. Check which one is right.`
          : "Status and payments now follow that Xero invoice.",
        variant: res?.totalsMatch === false ? "destructive" : undefined,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't link",
        description: err?.payload?.message || err?.payload?.error || err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-testid="dialog-link-xero-invoice">
        <DialogHeader>
          <DialogTitle>Link to a Xero invoice</DialogTitle>
          <DialogDescription>
            Pick the invoice in Xero that {invoiceNumber || "this invoice"} should follow. Nothing changes in Xero —
            Morada links to it and takes its status and payments from there.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Xero by invoice number or reference…"
            className="pl-8 h-8 text-sm"
            data-testid="input-search-xero-invoices"
          />
        </div>
        {data && (
          <p className="text-xs text-muted-foreground -mt-1">
            {search
              ? `Matching "${search}" across all of Xero.`
              : data.filteredByClient
              ? `Showing ${data.clientName || "this client"}'s invoices in Xero.`
              : "This client isn't linked to a Xero contact, so these are your most recent sales invoices — search to narrow it down."}
          </p>
        )}

        <div className="border rounded-md max-h-[340px] overflow-auto overscroll-contain" data-testid="list-xero-invoices">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading from Xero…
            </div>
          ) : error ? (
            <div className="py-8 px-4 text-sm text-destructive text-center">{(error as Error).message}</div>
          ) : !data?.candidates.length ? (
            <div className="py-8 px-4 text-sm text-muted-foreground text-center">No matching invoices in Xero.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left">
                  <th className="doc-col-label px-3 py-2">Number</th>
                  <th className="doc-col-label px-2 py-2">Date</th>
                  <th className="doc-col-label px-2 py-2">Status</th>
                  <th className="doc-col-label px-2 py-2 text-right">Total</th>
                  <th className="doc-col-label px-2 py-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c) => {
                  const taken = !!c.linkedToInvoiceId;
                  const isSelected = c.xeroInvoiceId === selectedId;
                  const sameTotal = c.totalCents === data.moradaTotalCents;
                  return (
                    <tr
                      key={c.xeroInvoiceId}
                      onClick={() => !taken && setSelectedId(c.xeroInvoiceId)}
                      className={cn(
                        "border-b last:border-b-0",
                        taken ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover-elevate",
                        isSelected && "bg-primary/10",
                      )}
                      data-testid={`row-xero-invoice-${c.xeroInvoiceId}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{c.invoiceNumber || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-[200px]">
                          {taken
                            ? `Already linked to ${c.linkedToInvoiceNumber || "another invoice"}`
                            : [c.contactName, c.reference].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{formatXeroDate(c.date)}</td>
                      <td className="px-2 py-2 text-xs">{STATUS_LABEL[c.status] || c.status}</td>
                      <td className={cn("px-2 py-2 text-right money whitespace-nowrap", sameTotal && "text-sage font-medium")}>
                        {formatCents(c.totalCents, { alwaysShowDecimals: true })}
                      </td>
                      <td className="px-2 py-2 text-right money whitespace-nowrap text-muted-foreground">
                        {formatCents(c.amountPaidCents, { alwaysShowDecimals: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalsDiffer && data && selected && (
          <div className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber-light px-3 py-2 text-xs" data-testid="warning-xero-total-differs">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber flex-shrink-0" />
            <span>
              Xero's total is {formatCents(selected.totalCents, { alwaysShowDecimals: true })}; this invoice is{" "}
              {formatCents(data.moradaTotalCents, { alwaysShowDecimals: true })}. You can still link it, but check it's the right one.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => selected && linkMutation.mutate(selected.xeroInvoiceId)}
            disabled={!selected || linkMutation.isPending}
            data-testid="button-confirm-link-xero"
          >
            {linkMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
            Link {selected?.invoiceNumber ? `#${selected.invoiceNumber}` : "invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
