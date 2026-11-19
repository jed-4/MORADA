import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Send, Link2, Ban, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { formatCents } from "@shared/money";
import type { DefectTradeSummary } from "@shared/defectTrades";
import { invalidateDefectQueries } from "./defectStyles";

interface BackchargeList {
  items: Array<{
    defectId: string; ref: string; title: string; stage: string; cents: number; reason: string | null;
    costCodeLabel: string | null; contactName: string | null; backchargedAt: string | null;
  }>;
  totals: Array<{ contactId: string | null; contactName: string; count: number; totalCents: number; exGstCents: number; gstCents: number }>;
  totalCents: number;
}

/**
 * Per-trade view for a project (Defects v2 stages 2–3): each trade's defects
 * by stage, their link (sent / last viewed / digest), Send all open, Copy link,
 * Turn link off — and, for roles with the Bills permission, backcharges per
 * trade plus the list the office raises them from.
 */
export function DefectTradesSheet({
  projectId,
  open,
  onOpenChange,
  canEdit,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const canSeeMoney = usePermission("financial.bills", "view");
  const [emailNow, setEmailNow] = useState(true);
  const { data: trades = [], isLoading } = useQuery<DefectTradeSummary[]>({
    queryKey: ["/api/projects", projectId, "defect-trades"],
    enabled: open,
    staleTime: 0,
  });
  const { data: backcharges } = useQuery<BackchargeList>({
    queryKey: ["/api/defect-backcharges", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/defect-backcharges?projectId=${encodeURIComponent(projectId)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Couldn't load backcharges");
      return r.json();
    },
    enabled: open && canSeeMoney,
  });

  const refresh = () => {
    invalidateDefectQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "defect-trades"] });
  };
  const fail = (title: string) => (e: any) => toast({ title, description: e?.payload?.error || e?.message, variant: "destructive" });

  const sendAll = useMutation({
    mutationFn: (contactId: string) => apiRequest(`/api/projects/${projectId}/defect-trades/${contactId}/send`, "POST", { emailNow }),
    onSuccess: (r: any) => {
      refresh();
      toast({
        title: `${r.contactName}: ${r.sent ? `${r.sent} sent` : "nothing new to send"}${r.emailed ? ", emailed" : ""}`,
        description: r.emailError || (r.emailed ? undefined : "They'll get it in tomorrow's 7am digest."),
        variant: r.emailError ? "destructive" : undefined,
      });
    },
    onError: fail("Couldn't send"),
  });
  const copyLink = useMutation({
    mutationFn: (contactId: string) => apiRequest(`/api/projects/${projectId}/defect-trades/${contactId}/link`, "POST"),
    onSuccess: async (r: any) => {
      refresh();
      try {
        await navigator.clipboard.writeText(r.url);
        toast({ title: "Link copied" });
      } catch {
        toast({ title: "Trade link", description: r.url });
      }
    },
    onError: fail("Couldn't get the link"),
  });
  const revoke = useMutation({
    mutationFn: (contactId: string) => apiRequest(`/api/projects/${projectId}/defect-trades/${contactId}/revoke`, "POST"),
    onSuccess: (r: any) => { refresh(); toast({ title: r?.revoked ? "Link turned off" : "No live link to turn off" }); },
    onError: fail("Couldn't turn the link off"),
  });

  const totalFor = (contactId: string) => backcharges?.totals.find((t) => t.contactId === contactId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border space-y-1">
          <SheetTitle className="text-base">Trades</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Each trade gets one private link for this job showing only their defects, and a 7am email when something is new or overdue.
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {canEdit && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={emailNow} onCheckedChange={(v) => setEmailNow(!!v)} data-testid="trades-email-now" />
              "Send all open" also emails the trade now (otherwise it waits for the digest)
            </label>
          )}
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && trades.length === 0 && (
            <div className="text-sm text-muted-foreground">No defects have a trade yet. Pick one on a defect and send it.</div>
          )}
          {trades.map((t) => {
            const live = t.counts.sent + t.counts.accepted + t.counts.rejected;
            const toSend = t.counts.open;
            const money = canSeeMoney ? totalFor(t.contactId) : undefined;
            return (
              <div key={t.contactId} className="rounded-md border border-border p-3 space-y-2" data-testid={`trade-row-${t.contactId}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{t.contactName}</div>
                    <div className="text-[11px] text-muted-foreground">{t.contactEmail || "No email address"}</div>
                  </div>
                  {t.overdue > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded text-[10px] font-semibold px-1.5 py-0.5 bg-[hsl(var(--coral-light))] text-[hsl(var(--coral))]">
                      <AlertTriangle className="h-3 w-3" /> {t.overdue} overdue
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span><b className="text-foreground">{toSend}</b> not sent</span>
                  <span><b className="text-foreground">{live}</b> with trade</span>
                  <span><b className="text-foreground">{t.counts.fixed}</b> fixed – to check</span>
                  <span><b className="text-foreground">{t.counts.closed}</b> closed</span>
                  {money && <span>Backcharges <b className="text-foreground tabular-nums">{formatCents(money.totalCents, { alwaysShowDecimals: true })}</b> inc GST</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t.link
                    ? t.link.live
                      ? `Link live since ${format(new Date(t.link.createdAt), "d MMM")} · ${t.link.lastViewedAt ? `last opened ${formatDistanceToNow(new Date(t.link.lastViewedAt), { addSuffix: true })}` : "not opened yet"}${t.link.lastDigestAt ? ` · digest checked ${format(new Date(t.link.lastDigestAt), "d MMM")}` : ""}`
                      : "Link turned off"
                    : "No link yet"}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {t.link?.live && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={revoke.isPending} onClick={() => revoke.mutate(t.contactId)} data-testid={`trade-revoke-${t.contactId}`}>
                        <Ban className="h-3.5 w-3.5" /> Turn link off
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={copyLink.isPending} onClick={() => copyLink.mutate(t.contactId)} data-testid={`trade-copy-${t.contactId}`}>
                      <Link2 className="h-3.5 w-3.5" /> Copy link
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={sendAll.isPending || toSend + live === 0}
                      onClick={() => sendAll.mutate(t.contactId)}
                      data-testid={`trade-send-all-${t.contactId}`}
                    >
                      <Send className="h-3.5 w-3.5" /> Send all open
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {canSeeMoney && backcharges && backcharges.items.length > 0 && (
            <div className="pt-3 border-t border-border space-y-2" data-testid="backcharge-list">
              <div className="flex items-baseline justify-between">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Backcharges to raise</div>
                <div className="text-xs">
                  Total <b className="tabular-nums">{formatCents(backcharges.totalCents, { alwaysShowDecimals: true })}</b> inc GST
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground text-left">
                    <th className="py-1 font-medium">Defect</th>
                    <th className="py-1 font-medium">Trade</th>
                    <th className="py-1 font-medium">Cost code</th>
                    <th className="py-1 font-medium text-right">Inc GST</th>
                  </tr>
                </thead>
                <tbody>
                  {backcharges.items.map((b) => (
                    <tr key={b.defectId} className="border-t border-border align-top">
                      <td className="py-1.5 pr-2">
                        <div className="font-medium">{b.ref} {b.title}</div>
                        {b.reason && <div className="text-muted-foreground">{b.reason}</div>}
                      </td>
                      <td className="py-1.5 pr-2">{b.contactName ?? "—"}</td>
                      <td className="py-1.5 pr-2">{b.costCodeLabel ?? "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCents(b.cents, { alwaysShowDecimals: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground">Recorded only — raise these with the trade (or in Xero) yourself.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
