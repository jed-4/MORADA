import { useQuery } from "@tanstack/react-query";
import { CheckSquare, AlertTriangle, GitBranch, HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetError, WidgetEmpty } from "@/components/ui/widget-states";

interface NoteRow {
  id: string;
  type: string;
  status?: string | null;
  category?: string | null;
  tags?: string[] | null;
}
interface DefectRow {
  id: string;
  status: string;
}
interface VariationRow {
  id: string;
  status: string;
}

function isRfi(n: NoteRow): boolean {
  const cat = (n.category || "").toLowerCase();
  if (cat === "rfi") return true;
  const tags = (n.tags as string[] | null) || [];
  return Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === "rfi");
}

export default function OpenItemsWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();
  const projectId = currentProject?.id;

  const notesQ = useQuery<NoteRow[]>({
    queryKey: ["/api/notes", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const r = await fetch(`/api/notes?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
  });

  const defectsQ = useQuery<DefectRow[]>({
    queryKey: ["/api/defects", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const r = await fetch(`/api/defects?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
  });

  const variationsQ = useQuery<VariationRow[]>({
    queryKey: ["/api/variations", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const r = await fetch(`/api/variations?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
  });

  if (!projectId) return <WidgetEmpty message="Select a project to see open items" />;

  const isLoading = notesQ.isLoading || defectsQ.isLoading || variationsQ.isLoading;
  if (isLoading) return <WidgetSkeleton />;

  const isError = notesQ.isError || defectsQ.isError || variationsQ.isError;
  if (isError) {
    return (
      <WidgetError
        onRetry={() => {
          notesQ.refetch();
          defectsQ.refetch();
          variationsQ.refetch();
        }}
      />
    );
  }

  const notes = notesQ.data || [];
  const tasks = notes.filter((n) => n.type === "task" && n.status !== "done" && !isRfi(n)).length;
  const rfis = notes.filter((n) => isRfi(n) && n.status !== "done").length;
  const defects = (defectsQ.data || []).filter((d) => d.status === "open" || d.status === "in_progress").length;
  const variations = (variationsQ.data || []).filter(
    (v) => v.status === "pending" || v.status === "action" || v.status === "draft",
  ).length;

  const tiles = [
    {
      key: "tasks",
      label: "Open Tasks",
      count: tasks,
      icon: CheckSquare,
      to: `/tasks?projectId=${projectId}`,
      tone: "text-bp-teal",
    },
    {
      key: "defects",
      label: "Open Defects",
      count: defects,
      icon: AlertTriangle,
      to: `/defects?projectId=${projectId}`,
      tone: "text-bp-amber",
    },
    {
      key: "variations",
      label: "Pending Variations",
      count: variations,
      icon: GitBranch,
      to: `/variations?projectId=${projectId}`,
      tone: "text-bp-purple",
    },
    {
      key: "rfis",
      label: "Open RFIs",
      count: rfis,
      icon: HelpCircle,
      to: `/notes?projectId=${projectId}`,
      tone: "text-bp-coral",
    },
  ];

  const total = tasks + defects + variations + rfis;

  if (total === 0) {
    return <WidgetEmpty message="No open items — nice work!" />;
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-3" data-testid="widget-open-items">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <button
            type="button"
            key={t.key}
            onClick={() => setLocation(t.to)}
            className="flex flex-col gap-1 p-3 rounded-md border border-border text-left hover-elevate active-elevate-2"
            data-testid={`open-items-tile-${t.key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                {t.label}
              </span>
              <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${t.tone}`} />
            </div>
            <div className="text-2xl font-bold leading-tight">{t.count}</div>
          </button>
        );
      })}
    </div>
  );
}
