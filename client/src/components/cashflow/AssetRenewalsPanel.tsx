import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { apiRequest } from "@/lib/queryClient";
import { invalidateCashflow, money, shortDate } from "./cashflowShared";

interface RenewalsResponse {
  enabled: boolean;
  next12MonthsCents: number;
  payments: { date: string; name: string; amountCents: number; assetId: string }[];
  overlap: { id: string; name: string; category: string | null; amountCents: number; frequency: string }[];
  missingAmount: number;
}

const KEY = ["/api/cashflow/asset-renewals"] as const;

/**
 * Rego, CTP and insurance renewals from the asset register, on the dates they
 * fall due — instead of (not as well as) a monthly "Vehicles" average. Off
 * until switched on, and says so loudly when the register already has a
 * vehicles expense that would double it.
 */
export function AssetRenewalsPanel() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const canEdit = usePermission("business.cashflow", "edit");
  const { data } = useQuery<RenewalsResponse>({ queryKey: KEY });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("/api/cashflow/asset-renewals", "PUT", { enabled }),
    onSuccess: () => invalidateCashflow(),
    onError: () => toast({ title: "Couldn't change that", variant: "destructive" }),
  });

  // Nothing to offer until a due date has an amount — and nothing to say if
  // it's off and there's nothing that could go in.
  if (!data || (!data.enabled && data.payments.length === 0)) return null;
  const doubled = data.enabled && data.overlap.length > 0;

  return (
    <Card className="px-4 py-3 flex flex-col gap-2" data-testid="card-asset-renewals">
      <div className="flex items-start gap-3">
        <Truck className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Vehicle renewals</h3>
          <p className="text-xs text-muted-foreground">
            Rego, CTP and insurance from the asset register, on the dates they fall due:{" "}
            <span className="font-medium text-foreground">{money(data.next12MonthsCents)}</span> over the next 12 months
            {data.missingAmount > 0 && ` · ${data.missingAmount} due date${data.missingAmount === 1 ? " has" : "s have"} no amount yet, so ${data.missingAmount === 1 ? "isn't" : "aren't"} included`}.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs shrink-0">
          {data.enabled ? "On the forecast" : "Off"}
          <Switch
            checked={data.enabled}
            disabled={!canEdit || toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v)}
            aria-label="Put vehicle renewals on the forecast"
            data-testid="switch-asset-renewals"
          />
        </label>
      </div>

      {data.overlap.length > 0 && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            doubled
              ? "border-[hsl(var(--status-warning-fg))]/30 bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]"
              : "border-border text-muted-foreground"
          }`}
          data-testid="note-asset-renewals-overlap"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            {doubled ? "Possibly counted twice: " : "Before switching on: "}
            {data.overlap.slice(0, 3).map((e) => `"${e.name}"`).join(", ")}
            {data.overlap.length > 3 ? ` and ${data.overlap.length - 3} more` : ""} in the register below{" "}
            {data.overlap.length === 1 ? "looks like it covers" : "look like they cover"} vehicles too. Lower{" "}
            {data.overlap.length === 1 ? "it" : "them"} by the rego and insurance, or turn {data.overlap.length === 1 ? "it" : "them"} off, so the money isn't in the forecast twice.
          </div>
        </div>
      )}

      {data.enabled && data.payments.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {data.payments.slice(0, 4).map((p, i) => (
            <li key={`${p.assetId}-${p.date}-${i}`} className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground tabular-nums w-16 shrink-0">{shortDate(p.date)}</span>
              <button type="button" className="flex-1 min-w-0 truncate text-left hover:underline" onClick={() => navigate(`/business/assets/${p.assetId}`)}>
                {p.name}
              </button>
              <span className="tabular-nums">{money(p.amountCents)}</span>
            </li>
          ))}
          {data.payments.length > 4 && <li className="text-[11px] text-muted-foreground pl-[76px]">and {data.payments.length - 4} more</li>}
        </ul>
      )}
    </Card>
  );
}
