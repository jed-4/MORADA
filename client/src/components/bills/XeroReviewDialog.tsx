import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { CheckCircle2, Loader2, RefreshCw, Unlink, Trash2, ExternalLink, Ban } from "lucide-react";
import { SiXero } from "react-icons/si";

// The nightly Xero reconcile auto-applies safe drift (payments, status) but
// parks three kinds of change for a human. This is where they get resolved.
export type XeroReviewReason = "total_changed" | "voided_in_xero" | "missing_in_xero";

export interface XeroReviewBill {
  billId: string;
  billNumber: string;
  billDate: string | null;
  total: number | null; // cents inc GST
  status: string;
  xeroInvoiceId: string | null;
  reason: XeroReviewReason;
  changes: string[] | null;
  detectedAt: string | null;
  voidedAt: string | null;
  projectId: string | null;
  projectName: string | null;
  supplierName: string | null;
}

export interface XeroReviewResponse {
  count: number;
  bills: XeroReviewBill[];
}

export const XERO_REVIEW_QUERY_KEY = ["/api/xero/bills/review"] as const;

const REASON_META: Record<XeroReviewReason, { label: string; blurb: string; tone: string }> = {
  total_changed: {
    label: "Total changed",
    blurb: "The invoice total in Xero no longer matches this bill.",
    tone: "amber",
  },
  voided_in_xero: {
    label: "Voided in Xero",
    blurb: "This invoice was voided or deleted in Xero, but the bill still exists here.",
    tone: "coral",
  },
  missing_in_xero: {
    label: "Missing from Xero",
    blurb: "This bill is linked to a Xero invoice that Xero no longer returns.",
    tone: "coral",
  },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenBill: (bill: XeroReviewBill) => void;
}

export function XeroReviewDialog({ open, onOpenChange, onOpenBill }: Props) {
  const { toast } = useToast();
  // Which bill has an action in flight — keeps spinners on the right row.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<XeroReviewBill | null>(null);

  const { data, isLoading } = useQuery<XeroReviewResponse>({
    queryKey: XERO_REVIEW_QUERY_KEY,
    enabled: open,
  });

  const bills = data?.bills ?? [];

  const settle = (title: string, description?: string) => {
    queryClient.invalidateQueries({ queryKey: XERO_REVIEW_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
    toast({ title, description });
  };

  const fail = (e: Error) => toast({ title: "Didn't work", description: e.message, variant: "destructive" });

  // Accept Xero's version. Not offered for missing_in_xero — there's no invoice
  // left to pull from, so the request would just fail.
  // The endpoint is /api/xero/sync-bill-payment/:id — it pulls amounts, dates,
  // status and lines from Xero and clears the review flag, which is exactly
  // this button's job. There has never been a /api/bills/:id/sync-from-xero;
  // that path 404'd into the SPA catch-all, so every click came back as
  // "Unexpected token '<'" from index.html being parsed as JSON.
  const resync = useMutation({
    mutationFn: async (billId: string) => apiRequest(`/api/xero/sync-bill-payment/${billId}`, "POST"),
    onSuccess: () => settle("Synced from Xero", "The bill now matches Xero."),
    onError: fail,
    onSettled: () => setBusyId(null),
  });

  const dismiss = useMutation({
    mutationFn: async (billId: string) => apiRequest(`/api/bills/${billId}/xero-review/dismiss`, "POST", {}),
    onSuccess: () => settle("Dismissed", "You won't be notified again unless Xero changes."),
    onError: fail,
    onSettled: () => setBusyId(null),
  });

  const unlink = useMutation({
    mutationFn: async (billId: string) => apiRequest(`/api/bills/${billId}/xero-review/unlink`, "POST", {}),
    onSuccess: () => settle("Unlinked from Xero", "The bill stays here but is no longer synced."),
    onError: fail,
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: async (billId: string) => apiRequest(`/api/bills/${billId}`, "DELETE"),
    onSuccess: () => settle("Bill deleted"),
    onError: fail,
    onSettled: () => setBusyId(null),
  });

  // Live sweep. Slow by nature (bulk Xero pull), hence the explicit button.
  const recheck = useMutation({
    mutationFn: async () => apiRequest("/api/xero/bills/review/refresh", "POST", {}) as Promise<{ needsReview: number; corrected: number }>,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: XERO_REVIEW_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: r.needsReview === 0 ? "All in sync with Xero" : `${r.needsReview} bill${r.needsReview === 1 ? "" : "s"} need review`,
        description: r.corrected > 0 ? `${r.corrected} corrected automatically.` : undefined,
      });
    },
    onError: fail,
  });

  const run = (m: { mutate: (id: string) => void }, billId: string) => {
    setBusyId(billId);
    m.mutate(billId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiXero className="w-4 h-4" /> Bills needing review
            </DialogTitle>
            <DialogDescription>
              Payments and status sync automatically overnight. These changes were held back because
              they'd rewrite or remove a bill — so they're yours to call.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
            </div>
          ) : bills.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center gap-2">
              <CheckCircle2 className="w-8 h-8" style={{ color: "hsl(var(--sage))" }} />
              <p className="text-sm font-medium">All caught up</p>
              <p className="text-xs text-muted-foreground">No bills are out of step with Xero.</p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-md border divide-y">
              {bills.map((b) => {
                const meta = REASON_META[b.reason] ?? REASON_META.total_changed;
                const busy = busyId === b.billId;
                const canResync = b.reason !== "missing_in_xero";
                return (
                  <div key={b.billId} className="p-3" data-testid={`xero-review-row-${b.billId}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{b.billNumber}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-0"
                            style={{
                              backgroundColor: `hsl(var(--${meta.tone}-light))`,
                              color: `hsl(var(--foreground))`,
                            }}
                          >
                            {b.reason === "voided_in_xero" && <Ban className="w-2.5 h-2.5 mr-1" />}
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {[b.supplierName, b.projectName].filter(Boolean).join(" · ") || "—"}
                          {b.total != null && <> · {formatCurrency(b.total)}</>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{meta.blurb}</p>
                        {b.changes && b.changes.length > 0 && (
                          <ul className="mt-1 text-xs list-disc list-inside" style={{ color: "hsl(var(--foreground))" }}>
                            {b.changes.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        )}
                        {b.detectedAt && (
                          <p className="text-[11px] text-muted-foreground mt-1">Flagged {formatDate(b.detectedAt)}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs flex-shrink-0"
                        onClick={() => onOpenBill(b)}
                        data-testid={`button-open-bill-${b.billId}`}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" /> Open
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {canResync && (
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          style={{ backgroundColor: "hsl(var(--primary))", color: "white" }}
                          disabled={busy}
                          onClick={() => run(resync, b.billId)}
                          data-testid={`button-resync-${b.billId}`}
                        >
                          {busy && resync.isPending
                            ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            : <RefreshCw className="w-3 h-3 mr-1" />}
                          Sync from Xero
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={busy}
                        onClick={() => run(unlink, b.billId)}
                        data-testid={`button-unlink-${b.billId}`}
                      >
                        <Unlink className="w-3 h-3 mr-1" /> Unlink
                      </Button>
                      {b.reason === "voided_in_xero" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busy}
                          onClick={() => setConfirmDelete(b)}
                          data-testid={`button-delete-${b.billId}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Delete
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={busy}
                        onClick={() => run(dismiss, b.billId)}
                        data-testid={`button-dismiss-${b.billId}`}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              disabled={recheck.isPending}
              onClick={() => recheck.mutate()}
              data-testid="button-xero-review-recheck"
            >
              {recheck.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Checking Xero…</>
                : <><RefreshCw className="w-4 h-4 mr-2" />Re-check now</>}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.billNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the bill from Morada for good, along with its line items and any budget
              it contributed to. If you'd rather keep the record, use Unlink instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) run(remove, confirmDelete.billId);
                setConfirmDelete(null);
              }}
              data-testid="button-confirm-delete-bill"
            >
              Delete bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
