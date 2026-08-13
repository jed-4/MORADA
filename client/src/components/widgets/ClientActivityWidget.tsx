import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, FileText, MailCheck, ArrowRight } from "lucide-react";
import type { Activity } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatRelativeDistance } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

const CLIENT_TYPES = new Set(["invoice", "proposal", "estimate", "variation"]);
const CLIENT_ACTIONS = new Set([
  "sent",
  "submitted",
  "accepted",
  "approved",
  "paid",
  "rejected",
]);

// Good news sage, bad news coral, neutral stays muted
const ACTION_COLORS: Record<string, string> = {
  paid: "hsl(147 39% 30%)",
  accepted: "hsl(147 39% 30%)",
  approved: "hsl(147 39% 30%)",
  rejected: "hsl(11 52% 42%)",
};

function iconFor(type: string) {
  if (type === "invoice") return DollarSign;
  if (type === "proposal" || type === "estimate") return FileText;
  return MailCheck;
}

export default function ClientActivityWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions }: WidgetProps) {
  const { currentProject } = useProject();
  const [, navigate] = useLocation();
  const limit = (widget.config?.maxItems as number) || 6;

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; maxItems: number } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, maxItems: limit });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  const { data, isLoading, isError, refetch } = useQuery<Activity[]>({
    queryKey: ["/api/activities", currentProject?.id, "client", limit],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const r = await fetch(
        `/api/activities?projectId=${currentProject.id}&limit=50`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id,
  });

  // Header row: hover arrow to the project's Activity tab
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => navigate(`/projects/${currentProject.id}/activity`)}
              data-testid="client-activity-open-full"
              aria-label="Open activity"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All activity</TooltipContent>
        </Tooltip>
      ) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  if (isConfiguring && draft) {
    const cancelConfig = () => { setDraft(null); onCloseConfig?.(); };
    const saveConfig = () => {
      onUpdate?.({
        ...widget,
        title: draft.title.trim() || widget.title,
        config: { ...widget.config, maxItems: draft.maxItems },
      });
      setDraft(null);
      onCloseConfig?.();
    };
    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="client-activity-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={draft.title}
            onChange={e => setDraft(prev => prev && { ...prev, title: e.target.value })}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Max items to show
          </p>
          <Input
            type="number"
            min={3}
            max={20}
            value={draft.maxItems}
            onChange={e => {
              const n = parseInt(e.target.value);
              if (n >= 3 && n <= 20) setDraft(prev => prev && { ...prev, maxItems: n });
            }}
            className="h-8 text-xs w-20"
          />
        </section>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view client activity" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;

  const activities = (data || [])
    .filter((a) => CLIENT_TYPES.has(a.activityType) && CLIENT_ACTIONS.has(a.action))
    .slice(0, limit);

  if (activities.length === 0) {
    return <WidgetEmpty message="No client portal activity yet" />;
  }

  return (
    <div className="flex-1 overflow-auto space-y-3" data-testid="widget-client-activity">
      {activities.map((a) => {
        const Icon = iconFor(a.activityType);
        const actionColor = ACTION_COLORS[a.action];
        return (
          <div key={a.id} className="flex gap-3" data-testid={`client-activity-${a.id}`}>
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-bp-purple/10 text-bp-purple flex items-center justify-center">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">
                <span className="font-medium capitalize">{a.activityType}</span>{" "}
                <span
                  className={actionColor ? "font-medium" : "text-muted-foreground"}
                  style={actionColor ? { color: actionColor } : undefined}
                >
                  {a.action}
                </span>
                {a.entityName ? (
                  <span className="text-muted-foreground"> · {a.entityName}</span>
                ) : null}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatRelativeDistance(a.createdAt as any)}
                {a.userName ? ` · ${a.userName}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
