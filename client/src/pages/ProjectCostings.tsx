import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileBarChart } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { formatCurrency } from "@/lib/formatters";
import type { Project, Estimate, EstimateItem } from "@shared/schema";

interface Params {
  projectId: string;
}

interface CostCode {
  id: string;
  code: string;
  title: string;
}

export default function ProjectCostings() {
  const { projectId } = useParams<Params>();

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const contractEstimateId = (project as any)?.selectedEstimateId as string | undefined;

  usePageTitle({ pageName: project ? `${project.name} · Costings` : "Costings" });

  const { data: estimate } = useQuery<Estimate>({
    queryKey: ["/api/estimates", contractEstimateId],
    enabled: !!contractEstimateId,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<EstimateItem[]>({
    queryKey: [`/api/estimates/${contractEstimateId}/items`],
    enabled: !!contractEstimateId,
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const costCodeMap = useMemo(() => {
    const m = new Map<string, CostCode>();
    for (const cc of costCodes) m.set(cc.id, cc);
    return m;
  }, [costCodes]);

  const groups = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; items: EstimateItem[]; totalExTax: number; totalIncTax: number }>();
    for (const item of items) {
      const key = item.costCode || "__uncategorized__";
      const cc = item.costCode ? costCodeMap.get(item.costCode) : undefined;
      const label = cc ? `${cc.code} — ${cc.title}` : (item.costCode || "Uncategorised");
      if (!buckets.has(key)) buckets.set(key, { key, label, items: [], totalExTax: 0, totalIncTax: 0 });
      const bucket = buckets.get(key)!;
      bucket.items.push(item);
      const exTax = (item.unitCostExTax || 0) * (item.quantity || 0);
      bucket.totalExTax += exTax;
      bucket.totalIncTax += item.priceIncTax || 0;
    }
    return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [items, costCodeMap]);

  const grandTotalExTax = groups.reduce((s, g) => s + g.totalExTax, 0);
  const grandTotalIncTax = groups.reduce((s, g) => s + g.totalIncTax, 0);

  if (projectLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!contractEstimateId) {
    return (
      <div className="p-6 max-w-2xl">
        <Card className="p-6 flex flex-col items-start gap-3">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">No contract estimate set</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The Costings page shows the line items of the contract estimate for this project.
            Approve an estimate revision to populate this page, the project budget and the
            labour-hours budget.
          </p>
          <Link href={`/projects/${projectId}/estimates`}>
            <Button size="sm" data-testid="button-go-to-estimates">Go to Estimates</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-semibold truncate" data-testid="text-costings-title">Costings</h1>
          {estimate?.name && (
            <Badge variant="secondary" className="text-xs">
              {estimate.name}
            </Badge>
          )}
        </div>
        <Link href={`/projects/${projectId}/estimates/${contractEstimateId}`}>
          <Button variant="outline" size="sm" data-testid="button-view-contract-estimate">
            View contract estimate
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {itemsLoading ? (
          <div className="text-sm text-muted-foreground">Loading items…</div>
        ) : items.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            The contract estimate has no items.
          </Card>
        ) : (
          <>
            {groups.map(group => (
              <Card key={group.key} className="overflow-hidden" data-testid={`costings-group-${group.key}`}>
                <div className="px-4 py-2 bg-muted/40 border-b flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{group.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {formatCurrency(group.totalIncTax)} inc. GST
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left font-medium px-4 py-2">Item</th>
                        <th className="text-right font-medium px-4 py-2 w-24">Qty</th>
                        <th className="text-left font-medium px-4 py-2 w-20">Unit</th>
                        <th className="text-right font-medium px-4 py-2 w-28">Unit cost</th>
                        <th className="text-right font-medium px-4 py-2 w-32">Total ex GST</th>
                        <th className="text-right font-medium px-4 py-2 w-32">Total inc GST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(item => {
                        const exTax = (item.unitCostExTax || 0) * (item.quantity || 0);
                        return (
                          <tr key={item.id} className="border-t" data-testid={`costings-item-${item.id}`}>
                            <td className="px-4 py-2">
                              <div className="font-medium">{item.name}</div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground">{item.description}</div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">{item.quantity}</td>
                            <td className="px-4 py-2 text-muted-foreground">{item.unitType}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(item.unitCostExTax || 0)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(exTax)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(item.priceIncTax || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}

            <Card className="p-4 flex items-center justify-between gap-4" data-testid="costings-totals">
              <span className="text-sm font-semibold">Total</span>
              <div className="flex items-baseline gap-6">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">ex GST</div>
                  <div className="text-base font-semibold tabular-nums">{formatCurrency(grandTotalExTax)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">inc GST</div>
                  <div className="text-base font-semibold tabular-nums">{formatCurrency(grandTotalIncTax)}</div>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
