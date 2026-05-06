import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { WidgetProps } from "@/types/widgets";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { useFinancialPermission } from "@/hooks/use-permission";

interface ProjectMargin {
  id: string;
  name: string;
  revenue: number;
  costs: number;
  margin: number;
}

interface ProfitabilityResponse {
  projects: ProjectMargin[];
}

function marginColour(margin: number): string {
  if (margin >= 20) return "hsl(var(--bp-green))";
  if (margin >= 10) return "hsl(var(--bp-amber))";
  return "hsl(var(--bp-coral))";
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ProjectMargin;
  return (
    <div className="bg-bp-card border border-bp-border rounded-md shadow-sm p-2 text-[11px]">
      <p className="font-semibold text-bp-card-foreground">{row.name}</p>
      <p className="text-bp-muted">Margin: <span className="font-semibold text-bp-card-foreground">{row.margin.toFixed(1)}%</span></p>
      <p className="text-bp-muted">Revenue: <span className="text-bp-card-foreground">${row.revenue.toLocaleString()}</span></p>
      <p className="text-bp-muted">Costs: <span className="text-bp-card-foreground">${row.costs.toLocaleString()}</span></p>
    </div>
  );
}

export default function BusinessProfitabilityWidget({}: WidgetProps) {
  const canViewFinancials = useFinancialPermission();
  const { data, isLoading, isError, refetch } = useQuery<ProfitabilityResponse>({
    queryKey: ["/api/business/project-profitability"],
    enabled: canViewFinancials,
  });

  if (!canViewFinancials) {
    return <WidgetEmpty message="You don't have permission to view financial data." />;
  }
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} message="Couldn't load profitability." />;

  const projects = data?.projects ?? [];
  if (projects.length === 0) {
    return <WidgetEmpty message="No project profitability data yet — invoices and bills needed" />;
  }

  const chartHeight = projects.length * 36 + 16;

  return (
    <div className="flex flex-col h-full" data-testid="widget-project-profitability">
      <div className="px-5 py-3" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={projects}
            margin={{ left: 0, right: 40, top: 4, bottom: 4 }}
          >
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 11, fill: "hsl(var(--bp-card-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "hsl(var(--bp-subtle))" }}
            />
            <Bar dataKey="margin" radius={[0, 4, 4, 0]} minPointSize={4}>
              {projects.map((p) => (
                <Cell key={p.id} fill={marginColour(p.margin)} />
              ))}
              <LabelList
                dataKey="margin"
                position="right"
                formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                style={{ fontSize: 10, fontWeight: 500, fill: "hsl(var(--bp-card-foreground))" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="text-[10px] text-bp-muted flex gap-4 px-5 pb-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-bp-green" /> ≥20% Healthy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-bp-amber" /> 10–20% Watch
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-bp-coral" /> &lt;10% Concern
        </span>
      </div>
    </div>
  );
}
