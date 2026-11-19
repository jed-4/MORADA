import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Send, Link2, Check, Eye, Wrench, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { formatCents } from "@shared/money";
import { SENDABLE_STAGES, parseBackchargeDollars, type DefectTradeStatus } from "@shared/defectTrades";
import type { DefectView } from "@shared/defects";
import { invalidateDefectQueries } from "./defectStyles";

const NONE = "__none__";
const when = (iso: string | null | undefined) => (iso ? format(new Date(iso), "d MMM, h:mma") : null);

interface ContactOption { id: string; label: string; email: string | null }

function useTradeContacts(): ContactOption[] {
  const { data = [] } = useQuery<any[]>({ queryKey: ["/api/contacts"] });
  return useMemo(
    () => data
      .filter((c) => c && c.id)
      .map((c) => ({ id: c.id as string, label: (c.company?.trim() || c.name || "Unnamed") as string, email: (c.email ?? null) as string | null }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
}

/**
 * "Send to trade" + the trade status line (Defects v2 stage 2). Lives in the
 * defect drawer. Sending moves an open defect to Sent; "Email now" sends the
 * trade their link straight away (urgent) — otherwise it goes in their 7am
 * digest.
 */
export function DefectTradeSection({ defect, canEdit }: { defect: DefectView; canEdit: boolean }) {
  const { toast } = useToast();
  const contacts = useTradeContacts();
  const { data: status } = useQuery<DefectTradeStatus>({
    queryKey: ["/api/defects", defect.id, "trade-status"],
    staleTime: 0,
  });
  const [contactId, setContactId] = useState<string | null>(defect.assignedContactId);
  const urgent = defect.priority === "critical" || defect.priority === "high";
  const [emailNow, setEmailNow] = useState(urgent);
  useEffect(() => {
    setContactId(defect.assignedContactId);
    setEmailNow(defect.priority === "critical" || defect.priority === "high");
  }, [defect.id, defect.assignedContactId, defect.priority]);

  const refresh = () => {
    invalidateDefectQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ["/api/defects", defect.id, "trade-status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", defect.projectId, "defect-trades"] });
  };

  const send = useMutation({
    mutationFn: () => apiRequest(`/api/defects/${defect.id}/send-to-trade`, "POST", { contactId: contactId ?? undefined, emailNow }),
    onSuccess: (r: any) => {
      refresh();
      toast({
        title: r?.emailed ? `Sent and emailed to ${r.contactName}` : `Sent to ${r?.contactName ?? "the trade"}`,
        description: r?.emailError || (r?.emailed ? undefined : "They'll get it in tomorrow's 7am digest."),
        variant: r?.emailError ? "destructive" : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Couldn't send", description: e?.payload?.error || e?.message, variant: "destructive" }),
  });

  const copyLink = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${defect.projectId}/defect-trades/${contactId}/link`, "POST"),
    onSuccess: async (r: any) => {
      refresh();
      try {
        await navigator.clipboard.writeText(r.url);
        toast({ title: "Link copied", description: "It shows this trade only their own defects on this job." });
      } catch {
        toast({ title: "Trade link", description: r.url });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't get the link", description: e?.payload?.error || e?.message, variant: "destructive" }),
  });

  const canSend = canEdit && (SENDABLE_STAGES as readonly string[]).includes(defect.stage);
  const selected = contacts.find((c) => c.id === contactId);

  return (
    <div className="space-y-2" data-testid="drawer-trade-section">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Trade</Label>
      {status?.sentToTradeAt ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" data-testid="drawer-trade-status">
          <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" />Sent {when(status.sentToTradeAt)}</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />{status.tradeViewedAt ? `Viewed ${when(status.tradeViewedAt)}` : "Not viewed yet"}
          </span>
          {status.tradeMarkedFixedAt && (
            <span className="inline-flex items-center gap-1 text-[hsl(var(--sage))]">
              <Wrench className="h-3 w-3" />Fixed by trade {when(status.tradeMarkedFixedAt)}
            </span>
          )}
          {status.link && !status.link.live && <span>Link turned off</span>}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">Not sent to a trade yet.</div>
      )}

      {canEdit && (
        <div className="rounded-md border border-border p-2.5 space-y-2">
          <Select value={contactId ?? NONE} onValueChange={(v) => setContactId(v === NONE ? null : v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="drawer-trade-contact">
              <SelectValue placeholder="Pick the trade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No trade</SelectItem>
              {contactId && !contacts.some((c) => c.id === contactId) && (
                <SelectItem value={contactId}>{defect.assignedContactName ?? "Current trade"}</SelectItem>
              )}
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && !selected.email && (
            <div className="text-[11px] text-[hsl(var(--coral))]">This contact has no email — copy the link and send it yourself.</div>
          )}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={emailNow} onCheckedChange={(v) => setEmailNow(!!v)} data-testid="drawer-trade-email-now" />
            Email them now{urgent ? " (urgent)" : ""} — otherwise it's in their 7am digest
          </label>
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              disabled={!contactId || copyLink.isPending}
              onClick={() => copyLink.mutate()}
              data-testid="drawer-trade-copy-link"
            >
              <Link2 className="h-3.5 w-3.5" /> Copy link
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={!contactId || !canSend || send.isPending}
              onClick={() => send.mutate()}
              data-testid="drawer-send-to-trade"
            >
              <Send className="h-3.5 w-3.5" />
              {defect.stage === "open" ? "Send to trade" : "Send again"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface BackchargeView {
  cents: number;
  reason: string | null;
  costCodeId: string | null;
  costCodeLabel: string | null;
  contactId: string | null;
  contactName: string | null;
  backchargedAt: string | null;
  backchargedByName: string | null;
}

/**
 * "Backcharge to trade" (stage 3). Only for roles holding the Bills
 * permission; the server enforces it too. Amount is INC GST, stored in cents.
 * Nothing is sent to Xero — the office raises it from the backcharge list.
 */
export function DefectBackchargeSection({ defect, canEdit }: { defect: DefectView; canEdit: boolean }) {
  const { toast } = useToast();
  const canSee = usePermission("financial.bills", "view");
  const canWrite = usePermission("financial.bills", "edit") && canEdit;
  const contacts = useTradeContacts();
  const { data: costCodes = [] } = useQuery<any[]>({ queryKey: ["/api/cost-codes"], enabled: canWrite });
  const { data: bc } = useQuery<BackchargeView | null>({
    queryKey: ["/api/defects", defect.id, "backcharge"],
    enabled: canSee,
  });
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [costCodeId, setCostCodeId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);

  const startEdit = () => {
    setAmount(bc ? (bc.cents / 100).toFixed(2) : "");
    setReason(bc?.reason ?? "");
    setCostCodeId(bc?.costCodeId ?? null);
    setContactId(bc?.contactId ?? defect.assignedContactId);
    setEditing(true);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/defects", defect.id, "backcharge"] });
    queryClient.invalidateQueries({ queryKey: ["/api/defects", defect.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/defect-backcharges"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", defect.projectId, "defect-trades"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const cents = parseBackchargeDollars(amount);
      if (cents == null) throw new Error("Enter an amount over $0 (inc GST)");
      return apiRequest(`/api/defects/${defect.id}/backcharge`, "PUT", {
        amountCents: cents, reason, costCodeId, contactId,
      });
    },
    onSuccess: () => { refresh(); setEditing(false); toast({ title: "Backcharge saved" }); },
    onError: (e: any) => toast({ title: "Couldn't save the backcharge", description: e?.payload?.error || e?.message, variant: "destructive" }),
  });
  const clear = useMutation({
    mutationFn: () => apiRequest(`/api/defects/${defect.id}/backcharge`, "DELETE"),
    onSuccess: () => { refresh(); setEditing(false); toast({ title: "Backcharge removed" }); },
    onError: (e: any) => toast({ title: "Couldn't remove it", description: e?.payload?.error || e?.message, variant: "destructive" }),
  });

  if (!canSee) return null;

  return (
    <div className="space-y-2" data-testid="drawer-backcharge-section">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Backcharge</Label>
        {canWrite && !editing && (
          <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={startEdit} data-testid="drawer-backcharge-edit">
            <Receipt className="h-3 w-3" /> {bc ? "Edit" : "Backcharge to trade"}
          </Button>
        )}
      </div>
      {!editing && bc && (
        <div className="text-xs space-y-0.5" data-testid="drawer-backcharge-view">
          <div><span className="font-semibold tabular-nums">{formatCents(bc.cents, { alwaysShowDecimals: true })}</span> inc GST · {bc.contactName ?? "—"}</div>
          {bc.reason && <div className="text-muted-foreground">{bc.reason}</div>}
          <div className="text-[11px] text-muted-foreground">
            {[bc.costCodeLabel, bc.backchargedByName, bc.backchargedAt ? format(new Date(bc.backchargedAt), "d MMM yyyy") : null].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}
      {!editing && !bc && <div className="text-[11px] text-muted-foreground">No backcharge.</div>}
      {editing && (
        <div className="rounded-md border border-border p-2.5 space-y-2">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Input
              inputMode="decimal"
              placeholder="$ inc GST"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 text-xs"
              data-testid="drawer-backcharge-amount"
            />
            <Select value={contactId ?? NONE} onValueChange={(v) => setContactId(v === NONE ? null : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Trade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Pick the trade</SelectItem>
                {contactId && !contacts.some((c) => c.id === contactId) && (
                  <SelectItem value={contactId}>{defect.assignedContactName ?? "Current trade"}</SelectItem>
                )}
                {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Select value={costCodeId ?? NONE} onValueChange={(v) => setCostCodeId(v === NONE ? null : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cost code" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No cost code</SelectItem>
              {costCodeId && !costCodes.some((c) => c.id === costCodeId) && (
                <SelectItem value={costCodeId}>{bc?.costCodeLabel ?? "Current cost code"}</SelectItem>
              )}
              {costCodes.map((c) => <SelectItem key={c.id} value={c.id}>{[c.code, c.title].filter(Boolean).join(" · ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea
            rows={2}
            placeholder="What's it for? e.g. Re-sheeting damaged by plumber"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-xs"
            data-testid="drawer-backcharge-reason"
          />
          <div className="flex items-center justify-between">
            {bc ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-[hsl(var(--coral))]" disabled={clear.isPending} onClick={() => clear.mutate()}>
                Remove
              </Button>
            ) : <span />}
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!amount.trim() || !reason.trim() || !contactId || save.isPending}
                onClick={() => save.mutate()}
                data-testid="drawer-backcharge-save"
              >
                <Check className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Recorded only — nothing is sent to Xero. Raise it from the backcharge list.</p>
        </div>
      )}
    </div>
  );
}
