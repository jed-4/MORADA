import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { Budget, Defect, Schedule, ScheduleItem } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}
function previousMonthKey(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ProjectHealthScoreWidget(_: WidgetProps) {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const budgetQ = useQuery<Budget>({
    queryKey: ["/api/projects", projectId, "budget"],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/budget`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
  });
  const defectsQ = useQuery<Defect[]>({
    queryKey: ["/api/defects", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/defects?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
  });
  const scheduleQ = useQuery<Schedule | null>({
    queryKey: ["/api/projects", projectId, "schedule"],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/schedule?category=construction`, {
        credentials: "include",
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
  });
  const itemsQ = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedules", scheduleQ.data?.id, "items"],
    queryFn: async () => {
      if (!scheduleQ.data?.id) return [];
      const r = await fetch(`/api/schedules/${scheduleQ.data.id}/items`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!scheduleQ.data?.id,
  });

  const score = useMemo(() => {
    if (!budgetQ.data && !defectsQ.data && !itemsQ.data) return null;
    const b = budgetQ.data;
    let budgetHealth = 80;
    if (b && b.revisedAmount > 0) {
      const pct = (b.actualAmount / b.revisedAmount) * 100;
      // 0% used → 100, 100% used → 60, >120% → 0
      budgetHealth = clamp(100 - Math.max(0, pct - 50) * 1.5);
    }

    const defects = defectsQ.data || [];
    const openDefects = defects.filter((d) => d.status === "open" || d.status === "in_progress").length;
    // 0 defects → 100, 10+ → 0
    const qualityHealth = clamp(100 - openDefects * 10);

    const items = itemsQ.data || [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const overdue = items.filter((it) => {
      if (it.status === "completed" || it.status === "cancelled") return false;
      if (!it.endDate) return false;
      return new Date(it.endDate as any) < now;
    }).length;
    // 0 overdue → 100, 5+ → 0
    const scheduleHealth = clamp(100 - overdue * 20);

    const composite = Math.round(budgetHealth * 0.4 + scheduleHealth * 0.3 + qualityHealth * 0.3);
    return {
      composite,
      budgetHealth: Math.round(budgetHealth),
      scheduleHealth: Math.round(scheduleHealth),
      qualityHealth: Math.round(qualityHealth),
      openDefects,
      overdue,
    };
  }, [budgetQ.data, defectsQ.data, itemsQ.data]);

  // Persist current-month + retrieve previous-month score for trend
  const [prevScore, setPrevScore] = useState<number | null>(null);
  useEffect(() => {
    if (!projectId || score == null) return;
    const cur = currentMonthKey();
    const prev = previousMonthKey();
    try {
      localStorage.setItem(`bp.health:${projectId}:${cur}`, String(score.composite));
      const raw = localStorage.getItem(`bp.health:${projectId}:${prev}`);
      setPrevScore(raw == null ? null : Number(raw));
    } catch {
      /* noop */
    }
  }, [projectId, score?.composite]);

  if (!currentProject) return <WidgetEmpty message="Select a project to see its health score" />;
  if (budgetQ.isLoading || defectsQ.isLoading || scheduleQ.isLoading || itemsQ.isLoading) {
    return <WidgetSkeleton />;
  }
  if (budgetQ.isError || defectsQ.isError) {
    return (
      <WidgetError
        onRetry={() => {
          budgetQ.refetch();
          defectsQ.refetch();
          scheduleQ.refetch();
          itemsQ.refetch();
        }}
      />
    );
  }
  if (!score) return <WidgetEmpty message="Not enough data to score project health" />;

  const tone =
    score.composite >= 75 ? "text-bp-green" : score.composite >= 50 ? "text-bp-amber" : "text-bp-coral";
  const ringStroke =
    score.composite >= 75
      ? "hsl(var(--bp-green))"
      : score.composite >= 50
        ? "hsl(var(--bp-amber))"
        : "hsl(var(--bp-coral))";
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const dash = (score.composite / 100) * circ;

  let DeltaIcon = Minus;
  let deltaTone = "text-muted-foreground";
  let deltaText = "vs last month";
  if (prevScore != null) {
    const d = score.composite - prevScore;
    if (d > 0) {
      DeltaIcon = ArrowUp;
      deltaTone = "text-bp-green";
      deltaText = `+${d} vs last month`;
    } else if (d < 0) {
      DeltaIcon = ArrowDown;
      deltaTone = "text-bp-coral";
      deltaText = `${d} vs last month`;
    } else {
      deltaText = "Steady vs last month";
    }
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3" data-testid="widget-health-score">
      <div className="flex items-center gap-4">
        <div className="relative w-[88px] h-[88px] flex-shrink-0">
          <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
            <circle cx="44" cy="44" r={radius} stroke="hsl(var(--bp-border))" strokeWidth="8" fill="none" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              stroke={ringStroke}
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold leading-none ${tone}`} data-testid="text-health-score">
              {score.composite}
            </span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="h-4 w-4 text-bp-purple" />
            Project health
          </div>
          <div className={`text-xs flex items-center gap-1 mt-0.5 ${deltaTone}`}>
            <DeltaIcon className="h-3 w-3" />
            {deltaText}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget</p>
          <p className="text-sm font-semibold">{score.budgetHealth}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Schedule</p>
          <p className="text-sm font-semibold">{score.scheduleHealth}</p>
          <p className="text-[10px] text-muted-foreground">{score.overdue} overdue</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Quality</p>
          <p className="text-sm font-semibold">{score.qualityHealth}</p>
          <p className="text-[10px] text-muted-foreground">{score.openDefects} defects</p>
        </div>
      </div>
    </div>
  );
}
