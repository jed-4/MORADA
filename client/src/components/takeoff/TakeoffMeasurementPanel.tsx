import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { TakeoffMeasurement, TakeoffCategory, TakeoffPlan } from "@shared/schema";

interface Props {
  projectId: string;
  plan: TakeoffPlan;
  measurements: TakeoffMeasurement[];
  categories: TakeoffCategory[];
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
  onAddClick: () => void;
}

export default function TakeoffMeasurementPanel({
  projectId,
  plan,
  measurements,
  categories,
  highlightedId,
  onHighlight,
  onAddClick,
}: Props) {
  const { toast } = useToast();
  const measurementsKey = ["/api/projects", projectId, "takeoff/measurements"];
  const pageMeasurementsKeyPrefix = ["/api/projects", projectId, "takeoff/pages"];

  const updateMeasurement = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TakeoffMeasurement> }) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/measurements/${id}`,
        "PATCH",
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementsKey });
      queryClient.invalidateQueries({ queryKey: pageMeasurementsKeyPrefix });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  const deleteMeasurement = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/measurements/${id}`,
        "DELETE",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementsKey });
      queryClient.invalidateQueries({ queryKey: pageMeasurementsKeyPrefix });
      toast({ title: "Deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, TakeoffMeasurement[]>();
    for (const meas of measurements) {
      const k = meas.categoryId ?? "__uncat__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(meas);
    }
    return m;
  }, [measurements]);

  const categoryName = (id: string) =>
    id === "__uncat__"
      ? "Uncategorised"
      : categories.find((c) => c.id === id)?.name ?? "Category";

  const groupTotals = (rows: TakeoffMeasurement[]) => {
    const byUnit = new Map<string, number>();
    for (const r of rows) {
      const u = r.unit || "";
      byUnit.set(u, (byUnit.get(u) ?? 0) + (r.quantity ?? 0));
    }
    return Array.from(byUnit.entries()).filter(([, v]) => v > 0);
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">This plan</div>
        <div className="text-sm font-medium truncate" title={plan.name}>
          {plan.name}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border flex items-center text-xs font-medium text-muted-foreground">
        <span className="flex-1">Name</span>
        <span className="w-20 text-right">Qty</span>
        <span className="w-8" />
      </div>

      <div className="flex-1 overflow-auto">
        {grouped.size === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No measurements on this plan yet.
          </div>
        ) : (
          Array.from(grouped.entries()).map(([catId, rows]) => {
            const totals = groupTotals(rows);
            return (
              <div key={catId}>
                <div className="px-3 py-1.5 bg-primary/5 flex items-center justify-between gap-2 sticky top-0 z-10">
                  <span className="text-xs font-medium">{categoryName(catId)}</span>
                  <div className="flex gap-1 flex-wrap">
                    {totals.map(([unit, total]) => (
                      <Badge key={unit} variant="secondary" className="text-[10px]">
                        {Math.round(total * 100) / 100} {unit}
                      </Badge>
                    ))}
                  </div>
                </div>
                {rows.map((m) => {
                  const isHighlighted = m.id === highlightedId;
                  return (
                    <div
                      key={m.id}
                      onMouseEnter={() => onHighlight(m.id)}
                      onMouseLeave={() => onHighlight(null)}
                      className={`flex items-center gap-2 px-3 py-2 border-b border-border ${
                        isHighlighted ? "bg-primary/5" : ""
                      }`}
                      data-testid={`panel-row-${m.id}`}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          updateMeasurement.mutate({
                            id: m.id,
                            data: { isVisible: !m.isVisible } as any,
                          })
                        }
                        data-testid={`button-toggle-visible-${m.id}`}
                      >
                        {m.isVisible ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: m.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" title={m.name}>
                          {m.name}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {m.measurementType}
                        </div>
                      </div>
                      <div className="text-sm tabular-nums w-20 text-right">
                        {Math.round((m.quantity ?? 0) * 100) / 100}
                        <span className="text-xs text-muted-foreground ml-1">{m.unit}</span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMeasurement.mutate(m.id)}
                        data-testid={`button-delete-${m.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-border">
        <Button
          onClick={onAddClick}
          className="w-full"
          data-testid="button-add-measurement"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add measurement
        </Button>
      </div>
    </div>
  );
}
