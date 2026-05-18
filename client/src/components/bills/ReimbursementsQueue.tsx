import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { CheckCircle2, XCircle, Banknote, FileText, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Bill, Project } from "@shared/schema";

type ReimbursableB = Bill & {
  supplierName?: string | null;
  creatorName?: string;
  projectName?: string;
};

interface MarkPaidDialogState {
  billId: string;
  total: number;
}

interface ReturnDialogState {
  billId: string;
}

interface ReimbursementsQueueProps {
  projectId?: string;
}

function reimbStatusBadge(status: string | null | undefined) {
  if (!status || status === "pending") return <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-xs">Pending</Badge>;
  if (status === "approved") return <Badge variant="outline" className="border-blue-500/40 text-blue-600 bg-blue-500/10 text-xs">Approved</Badge>;
  if (status === "paid") return <Badge variant="outline" className="border-green-500/40 text-green-600 bg-green-500/10 text-xs">Paid</Badge>;
  if (status === "rejected") return <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10 text-xs">Returned</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

export function ReimbursementsQueue({ projectId }: ReimbursementsQueueProps) {
  const { toast } = useToast();
  const [markPaidDialog, setMarkPaidDialog] = useState<MarkPaidDialogState | null>(null);
  const [returnDialog, setReturnDialog] = useState<ReturnDialogState | null>(null);
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payNotes, setPayNotes] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const qs = new URLSearchParams({ paidByEmployee: "true", ...(projectId ? { projectId } : {}) });
  const { data: bills = [], isLoading } = useQuery<ReimbursableB[]>({
    queryKey: ["/api/bills", { paidByEmployee: "true", ...(projectId ? { projectId } : {}) }],
    queryFn: async () => {
      const res = await fetch(`/api/bills?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load reimbursements");
      return res.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/teams"],
    queryFn: async () => {
      const res = await fetch("/api/teams", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const getUserName = (userId: string | null | undefined) => {
    if (!userId) return "Unknown";
    const member = teamMembers.find((m: any) => m.id === userId || m.userId === userId);
    if (member) return member.firstName ? `${member.firstName} ${member.lastName || ""}`.trim() : member.email;
    return "Team member";
  };

  const getUserInitials = (userId: string | null | undefined) => {
    const name = getUserName(userId);
    return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  };

  const approveMutation = useMutation({
    mutationFn: (billId: string) => apiRequest(`/api/bills/${billId}/reimbursement/approve`, "PATCH"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Reimbursement approved", description: "The worker has been notified." });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to approve", variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ billId, method, notes }: { billId: string; method: string; notes?: string }) =>
      apiRequest(`/api/bills/${billId}/reimbursement/mark-paid`, "PATCH", { method, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Marked as paid", description: "The worker has been notified." });
      setMarkPaidDialog(null);
      setPayMethod("bank_transfer");
      setPayNotes("");
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to mark paid", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ billId, reason }: { billId: string; reason?: string }) =>
      apiRequest(`/api/bills/${billId}/reimbursement/reject`, "PATCH", { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Receipt returned", description: "The worker has been notified." });
      setReturnDialog(null);
      setReturnReason("");
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to return", variant: "destructive" }),
  });

  const getFirstImageAttachment = (bill: ReimbursableB) => {
    const atts = Array.isArray((bill as any).attachmentUrls) ? (bill as any).attachmentUrls : [];
    return atts.find((a: any) => {
      const mime = typeof a === "string" ? "" : (a.mimeType || "");
      return mime.startsWith("image/");
    });
  };

  const getAttachmentUrl = (att: any) => {
    if (!att) return null;
    const path = typeof att === "string" ? att : att.objectPath;
    if (!path) return null;
    if (path.startsWith("/objects/") || path.startsWith("http")) return path;
    return path;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading reimbursements…
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <Banknote className="h-10 w-10 opacity-30" />
        <p className="text-sm">No reimbursement requests</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 p-3">
        {bills.map(bill => {
          const status = (bill as any).reimbursementStatus as string | null;
          const isPending = !status || status === "pending";
          const isApproved = status === "approved";
          const projectName = projects.find(p => p.id === bill.projectId)?.name;
          const imageAtt = getFirstImageAttachment(bill);
          const imageUrl = getAttachmentUrl(imageAtt);

          return (
            <div
              key={bill.id}
              className="rounded-md border border-border bg-card p-4 space-y-3"
            >
              {/* Header row */}
              <div className="flex items-start gap-3">
                {/* Receipt thumbnail */}
                <div className="h-14 w-14 rounded-md border border-border bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Receipt" className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-semibold text-foreground">
                      {formatCurrency(bill.total)}
                    </span>
                    {reimbStatusBadge(status)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {bill.notes || bill.billNumber}
                  </p>
                  {(bill as any).supplierName && (
                    <p className="text-xs text-muted-foreground">{(bill as any).supplierName}</p>
                  )}
                </div>

                {/* Worker avatar */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-muted">{getUserInitials((bill as any).createdById)}</AvatarFallback>
                  </Avatar>
                  <span className="text-[11px] text-muted-foreground text-right max-w-[80px] leading-tight">
                    {getUserName((bill as any).createdById)}
                  </span>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>{formatDate(bill.billDate?.toString() || "")}</span>
                {projectName && <><div className="w-px h-3 bg-border" /><span>{projectName}</span></>}
                {(bill as any).reimbursementMethod && (
                  <><div className="w-px h-3 bg-border" />
                  <span className="capitalize">{(bill as any).reimbursementMethod.replace(/_/g, " ")}</span></>
                )}
              </div>

              {/* Action buttons */}
              {(isPending || isApproved) && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {isPending && (
                    <>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-status-success text-white"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(bill.id)}
                        data-testid={`btn-approve-${bill.id}`}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-destructive border-destructive/30"
                        onClick={() => setReturnDialog({ billId: bill.id })}
                        data-testid={`btn-return-${bill.id}`}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Return
                      </Button>
                    </>
                  )}
                  {isApproved && (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setMarkPaidDialog({ billId: bill.id, total: bill.total })}
                      data-testid={`btn-mark-paid-${bill.id}`}
                    >
                      <Banknote className="h-3 w-3 mr-1" />
                      Mark as Paid
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mark as Paid dialog */}
      <Dialog open={!!markPaidDialog} onOpenChange={o => { if (!o) { setMarkPaidDialog(null); setPayMethod("bank_transfer"); setPayNotes(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>How was this reimbursed?</DialogTitle>
          </DialogHeader>
          {markPaidDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Reimbursement amount: <span className="font-semibold text-foreground">{formatCurrency(markPaidDialog.total)}</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "bank_transfer", label: "Bank Transfer" },
                  { value: "added_to_wages", label: "Added to Wages" },
                  { value: "cash", label: "Cash" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPayMethod(opt.value)}
                    className={cn(
                      "rounded-md border px-2 py-3 text-xs font-medium transition-colors",
                      payMethod === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover-elevate"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="pay-notes"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="e.g. Reference number, payroll period…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMarkPaidDialog(null); setPayNotes(""); }}>Cancel</Button>
            <Button
              disabled={markPaidMutation.isPending}
              onClick={() => markPaidDialog && markPaidMutation.mutate({ billId: markPaidDialog.billId, method: payMethod, notes: payNotes || undefined })}
              data-testid="btn-confirm-mark-paid"
            >
              {markPaidMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={!!returnDialog} onOpenChange={o => { if (!o) { setReturnDialog(null); setReturnReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Return Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason so the worker knows what to fix.</p>
            <div className="space-y-1.5">
              <Label htmlFor="return-reason">Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="return-reason"
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                placeholder="e.g. Missing cost code, not a valid business expense…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReturnDialog(null); setReturnReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => returnDialog && rejectMutation.mutate({ billId: returnDialog.billId, reason: returnReason || undefined })}
              data-testid="btn-confirm-return"
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Return Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
