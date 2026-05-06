import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { WidgetProps } from "@/types/widgets";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";

interface VariationRow {
  id: string;
  ref: string;
  title: string;
  projectName: string;
  amount: number;
  daysWaiting: number;
  submittedBy: string;
}

interface VariationsResponse {
  variations: VariationRow[];
  totalValue: number;
  count: number;
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function daysClasses(days: number): { className: string; suffix: string } {
  if (days > 14) return { className: "text-bp-coral font-medium", suffix: " — overdue" };
  if (days >= 8) return { className: "text-bp-amber font-medium", suffix: "" };
  return { className: "text-bp-muted", suffix: "" };
}

export default function BusinessVariationsPendingWidget({}: WidgetProps) {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch } = useQuery<VariationsResponse>({
    queryKey: ["/api/business/variations-pending"],
  });

  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} message="Couldn't load variations." />;

  const variations = data?.variations ?? [];
  const count = data?.count ?? 0;
  const totalValue = data?.totalValue ?? 0;

  if (variations.length === 0) {
    return <WidgetEmpty message="No variations pending approval" />;
  }

  const visible = variations.slice(0, 5);

  return (
    <div className="flex flex-col h-full" data-testid="business-variations-pending-widget">
      {/* Stats row */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-bp-border">
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-bold text-bp-amber">{count}</span>
          <span className="text-[10px] text-bp-muted">pending</span>
        </div>
        <div className="w-px bg-bp-border h-4" />
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-bold text-bp-amber">{formatCurrency(totalValue)}</span>
          <span className="text-[10px] text-bp-muted">total value</span>
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        {visible.map((v, idx) => {
          const daysInfo = daysClasses(v.daysWaiting);
          return (
            <div
              key={v.id}
              className={`flex items-start gap-3 px-5 py-3 ${idx < visible.length - 1 ? "border-b border-bp-border" : ""}`}
              data-testid={`variation-row-${v.id}`}
            >
              <span className="text-[10px] font-semibold text-bp-amber w-16 shrink-0 mt-0.5">
                {v.ref}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[12px] font-medium text-bp-card-foreground truncate"
                  title={v.title}
                >
                  {v.title}
                </p>
                <p className="text-[10px] text-bp-muted truncate">{v.projectName}</p>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="text-[12px] font-semibold text-bp-card-foreground">
                  {formatCurrency(v.amount)}
                </span>
                <span className={`text-[10px] ${daysInfo.className}`}>
                  {v.daysWaiting} days{daysInfo.suffix}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {count > 5 && (
        <button
          type="button"
          onClick={() => navigate("/variations")}
          className="text-[11px] text-bp-purple font-medium px-5 py-2 border-t border-bp-border text-left hover:underline"
          data-testid="button-view-all-variations"
        >
          View all {count} variations →
        </button>
      )}
    </div>
  );
}
