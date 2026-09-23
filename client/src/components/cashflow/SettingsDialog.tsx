import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateCashflow, money, SETTINGS_KEY, type SettingsResponse } from "./cashflowShared";

const fieldClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35";

interface Draft {
  bufferDollars: number | null;
  clientPayDays: number | null;
  supplierPayDays: number | null;
  defaultMarginPercent: number | null;
  defaultPeriod: "month" | "fortnight";
  fortnightAnchor: string;
  basFrequency: "quarterly" | "monthly";
  basViaAgent: boolean;
  manualOpeningDollars: number | null;
  bankAccountIds: string[] | null;
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const { data } = useQuery<SettingsResponse>({ queryKey: SETTINGS_KEY, enabled: open });
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!open || !data) return;
    const s = data.settings;
    setDraft({
      bufferDollars: s.bufferCents / 100,
      clientPayDays: s.clientPayDays,
      supplierPayDays: s.supplierPayDays,
      defaultMarginPercent: s.defaultMarginPercent,
      defaultPeriod: s.defaultPeriod === "fortnight" ? "fortnight" : "month",
      fortnightAnchor: s.fortnightAnchor ?? "",
      basFrequency: s.basFrequency === "monthly" ? "monthly" : "quarterly",
      basViaAgent: s.basViaAgent,
      manualOpeningDollars: s.manualOpeningBalanceCents == null ? null : s.manualOpeningBalanceCents / 100,
      bankAccountIds: s.bankAccountIds,
    });
  }, [open, data]);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      apiRequest("/api/cashflow/settings", "PATCH", {
        bufferCents: Math.round((d.bufferDollars ?? 0) * 100),
        clientPayDays: d.clientPayDays ?? 0,
        supplierPayDays: d.supplierPayDays ?? 0,
        defaultMarginPercent: d.defaultMarginPercent ?? 0,
        defaultPeriod: d.defaultPeriod,
        fortnightAnchor: d.fortnightAnchor || null,
        basFrequency: d.basFrequency,
        basViaAgent: d.basViaAgent,
        manualOpeningBalanceCents: d.manualOpeningDollars == null ? null : Math.round(d.manualOpeningDollars * 100),
        bankAccountIds: d.bankAccountIds && d.bankAccountIds.length > 0 ? d.bankAccountIds : null,
      }),
    onSuccess: () => {
      invalidateCashflow();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Couldn't save the settings", variant: "destructive" }),
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const opening = data?.opening;
  const xeroAccounts = opening?.source === "xero" ? opening.accounts : [];
  const chosen = new Set(draft?.bankAccountIds ?? xeroAccounts.map((a) => a.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Forecast settings</DialogTitle>
          <DialogDescription>These apply to the whole business.</DialogDescription>
        </DialogHeader>
        {!draft ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Safety buffer ($)</Label>
                <NumericInput value={draft.bufferDollars} min={0} onCommit={(v) => set("bufferDollars", v)} className={fieldClass} data-testid="input-settings-buffer" />
                <p className="text-xs text-muted-foreground">Warns when the balance drops below this.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Show by</Label>
                <Select value={draft.defaultPeriod} onValueChange={(v) => { if (v) set("defaultPeriod", v as Draft["defaultPeriod"]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="fortnight">Fortnight</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Clients pay after (days)</Label>
                <NumericInput integer value={draft.clientPayDays} min={0} max={365} onCommit={(v) => set("clientPayDays", v)} className={fieldClass} data-testid="input-settings-client-days" />
              </div>
              <div className="space-y-1.5">
                <Label>You pay suppliers after (days)</Label>
                <NumericInput integer value={draft.supplierPayDays} min={0} max={365} onCommit={(v) => set("supplierPayDays", v)} className={fieldClass} data-testid="input-settings-supplier-days" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default margin (%)</Label>
                <NumericInput integer value={draft.defaultMarginPercent} min={0} max={99} onCommit={(v) => set("defaultMarginPercent", v)} className={fieldClass} />
                <p className="text-xs text-muted-foreground">Estimates costs for jobs with no budget.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Pay cycle starts</Label>
                <Input type="date" value={draft.fortnightAnchor} onChange={(e) => set("fortnightAnchor", e.target.value)} />
                <p className="text-xs text-muted-foreground">Lines fortnights up with pay days.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>BAS</Label>
                <Select value={draft.basFrequency} onValueChange={(v) => { if (v) set("basFrequency", v as Draft["basFrequency"]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Lodged by an agent</Label>
                  <p className="text-xs text-muted-foreground">Later quarterly due dates.</p>
                </div>
                <Switch checked={draft.basViaAgent} onCheckedChange={(v) => set("basViaAgent", v)} />
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg border p-3">
              <Label>Opening balance</Label>
              {opening?.source === "xero" ? (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs text-muted-foreground">From Xero. Tick the accounts that count as cash for the business.</p>
                  {xeroAccounts.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={chosen.has(a.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(chosen);
                          if (v === true) next.add(a.id); else next.delete(a.id);
                          set("bankAccountIds", Array.from(next));
                        }}
                      />
                      <span className="flex-1">{a.name}</span>
                      <span className="tabular-nums text-muted-foreground">{money(a.balanceCents)}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {opening?.error ?? "Xero isn't connected, so enter today's bank balance."}
                  </p>
                  <NumericInput
                    value={draft.manualOpeningDollars}
                    onCommit={(v) => set("manualOpeningDollars", v)}
                    placeholder="e.g. 184320"
                    className={fieldClass}
                    data-testid="input-settings-opening"
                  />
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => draft && save.mutate(draft)} disabled={!draft || save.isPending} data-testid="button-save-settings">
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
