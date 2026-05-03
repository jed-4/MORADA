import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, ChevronDown, ChevronRight, Calculator } from "lucide-react";
import type { TakeoffMeasurement, TakeoffCategory, TakeoffPlan } from "@shared/schema";

interface Props {
  projectId: string;
}

export default function TakeoffMeasurementsTab({ projectId }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data: measurements = [], isLoading } = useQuery<TakeoffMeasurement[]>({
    queryKey: ["/api/projects", projectId, "takeoff/measurements"],
  });
  const { data: categories = [] } = useQuery<TakeoffCategory[]>({
    queryKey: ["/api/projects", projectId, "takeoff/categories"],
  });
  const { data: plans = [] } = useQuery<TakeoffPlan[]>({
    queryKey: ["/api/projects", projectId, "takeoff/plans"],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return measurements;
    return measurements.filter((m) => m.name.toLowerCase().includes(q));
  }, [measurements, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, TakeoffMeasurement[]>();
    for (const m of filtered) {
      const key = m.categoryId ?? "__uncat__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return groups;
  }, [filtered]);

  const planById = useMemo(() => {
    const m = new Map<string, TakeoffPlan>();
    plans.forEach((p) => m.set(p.id, p));
    return m;
  }, [plans]);

  const categoryName = (id: string) => {
    if (id === "__uncat__") return "Uncategorised";
    return categories.find((c) => c.id === id)?.name ?? "Category";
  };

  const totalsForGroup = (rows: TakeoffMeasurement[]) => {
    const byUnit = new Map<string, number>();
    for (const r of rows) {
      const u = r.unit || "";
      byUnit.set(u, (byUnit.get(u) ?? 0) + (r.quantity ?? 0));
    }
    return Array.from(byUnit.entries()).filter(([, v]) => v > 0);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Measurements</h2>
          <p className="text-sm text-muted-foreground">
            All measurements across every plan in this project
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search measurements"
            className="pl-8"
            data-testid="input-search-measurements"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 flex flex-col items-center justify-center gap-3 border-2 border-dashed">
          <Calculator className="h-10 w-10 text-muted-foreground" />
          <div className="text-base font-medium">No measurements yet</div>
          <div className="text-sm text-muted-foreground">
            Open a plan from the Plans tab to start measuring
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([catId, rows]) => {
            const isCollapsed = collapsed[catId] ?? false;
            const totals = totalsForGroup(rows);
            return (
              <Card key={catId} className="overflow-hidden">
                <button
                  onClick={() => setCollapsed((s) => ({ ...s, [catId]: !isCollapsed }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-primary/5 hover-elevate"
                  data-testid={`button-toggle-cat-${catId}`}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <span className="font-medium">{categoryName(catId)}</span>
                    <span className="text-xs text-muted-foreground">
                      {rows.length} item{rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {totals.map(([unit, total]) => (
                      <Badge key={unit} variant="secondary">
                        {Math.round(total * 100) / 100} {unit}
                      </Badge>
                    ))}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {rows.map((m) => {
                      const plan = planById.get(m.planId);
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                          data-testid={`row-measurement-${m.id}`}
                        >
                          <span
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: m.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{m.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {plan?.name ?? "Unknown plan"}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {m.measurementType}
                          </Badge>
                          <div className="text-sm tabular-nums w-28 text-right">
                            {Math.round((m.quantity ?? 0) * 100) / 100} {m.unit}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
