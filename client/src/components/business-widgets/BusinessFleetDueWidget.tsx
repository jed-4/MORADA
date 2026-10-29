import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, Truck } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { ASSETS_KEY, DueChip, relativeDays, shortDate } from "@/components/assets/assetsShared";
import type { AssetListRow } from "@shared/schema";
import {
  COMPLIANCE_KIND_LABELS,
  METER_UNIT,
  complianceDue,
  serviceDue,
  todayKey,
  type ComplianceKind,
  type DueState,
  type MeterType,
} from "@shared/assets";

interface DueRow {
  key: string;
  assetId: string;
  assetName: string;
  rego: string | null;
  what: string;
  state: DueState;
  /** "in 12 days · 10 Nov 26" or "1,800 km over". */
  when: string;
  sort: number;
}

const RANK: Record<DueState, number> = { overdue: 0, due_soon: 1, ok: 2 };
const MAX_ROWS = 8;

/**
 * Everything in the asset register that's overdue or due in the next 30 days —
 * rego, insurance, services — soonest first. Shares its query with the Assets
 * page, so opening one warms the other.
 */
export default function BusinessFleetDueWidget({ onSetTitleAction }: WidgetProps) {
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = useQuery<AssetListRow[]>({ queryKey: ASSETS_KEY });

  useEffect(() => {
    onSetTitleAction?.({ label: "Open the asset register", onClick: () => navigate("/business/assets") });
    return () => onSetTitleAction?.(null);
  }, [onSetTitleAction, navigate]);

  const rows = useMemo<DueRow[]>(() => {
    if (!data) return [];
    const today = todayKey();
    const out: DueRow[] = [];
    for (const a of data) {
      if (a.status === "archived" || a.status === "sold") continue;
      for (const item of a.complianceItems) {
        const due = complianceDue(item, today);
        if (due.state === "ok") continue;
        out.push({
          key: `c-${item.id}`,
          assetId: a.id,
          assetName: a.name,
          rego: a.rego,
          what: item.label || COMPLIANCE_KIND_LABELS[item.kind as ComplianceKind] || item.kind,
          state: due.state,
          when: `${relativeDays(due.daysLeft)} · ${shortDate(item.expiryDate)}`,
          sort: due.daysLeft,
        });
      }
      for (const s of a.serviceSchedules) {
        const due = serviceDue(s, a, today);
        if (due.unknown || due.state === "ok") continue;
        const unit = METER_UNIT[a.meterType as MeterType] ?? "";
        const when =
          due.drivenBy === "meter" && due.meterLeft != null
            ? due.meterLeft < 0
              ? `${(-due.meterLeft).toLocaleString("en-AU")} ${unit} over`
              : `${due.meterLeft.toLocaleString("en-AU")} ${unit} to go`
            : `${relativeDays(due.daysLeft)} · ${shortDate(due.dueDate)}`;
        out.push({
          key: `s-${s.id}`,
          assetId: a.id,
          assetName: a.name,
          rego: a.rego,
          what: s.label,
          state: due.state,
          when,
          // A km-driven row has no date to sort on; overdue ones go first.
          sort: due.daysLeft ?? (due.state === "overdue" ? -1 : 0),
        });
      }
    }
    return out.sort((x, y) => RANK[x.state] - RANK[y.state] || x.sort - y.sort);
  }, [data]);

  if (isLoading) return <WidgetSkeleton />;
  if (error || !data) return <WidgetError onRetry={() => refetch()} />;
  if (data.length === 0) {
    return <WidgetEmpty icon={Truck} message="No assets yet. Add your vehicles under Business → Assets." />;
  }
  if (rows.length === 0) {
    return <WidgetEmpty icon={CheckCircle2} message="Nothing due in the next 30 days." />;
  }

  const overdue = rows.filter((r) => r.state === "overdue").length;
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <div className="flex h-full flex-col gap-2 min-h-0" data-testid="widget-fleet-due">
      <p className="text-xs text-muted-foreground">
        {overdue > 0 && <span className="font-semibold text-foreground">{overdue} overdue · </span>}
        {rows.length - overdue} due in 30 days
      </p>
      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
        {shown.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => navigate(`/business/assets/${r.assetId}`)}
              className="w-full flex items-center gap-2 py-1.5 text-left hover-elevate rounded-sm"
              data-testid={`row-fleet-due-${r.key}`}
            >
              <DueChip state={r.state} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">
                  {r.what} <span className="text-muted-foreground font-normal">— {r.assetName}{r.rego ? ` (${r.rego})` : ""}</span>
                </div>
                <div className="text-data text-muted-foreground truncate">{r.when}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > MAX_ROWS && (
        <button type="button" onClick={() => navigate("/business/assets")} className="text-xs text-primary hover:underline self-start">
          {rows.length - MAX_ROWS} more
        </button>
      )}
    </div>
  );
}
