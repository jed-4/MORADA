import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileSpreadsheet, ChevronRight, AlertCircle, Clock, CheckCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";
import type { Estimate, Project } from "@shared/schema";
import type { Widget } from "@/types/widgets";

interface ActionableEstimatesWidgetProps {
  widget: Widget;
  onUpdate: (widget: Widget) => void;
  isConfiguring: boolean;
  onCloseConfig: () => void;
  userId: string;
}

interface EstimateWithProject extends Estimate {
  projectName?: string;
  projectColor?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "bg-gray-500", icon: FileSpreadsheet },
  working: { label: "Working", color: "bg-blue-500", icon: Clock },
  locked: { label: "Locked", color: "bg-amber-500", icon: Lock },
  approved: { label: "Approved", color: "bg-green-500", icon: CheckCircle },
};

export default function ActionableEstimatesWidget({
  widget,
  onUpdate,
  isConfiguring,
  onCloseConfig,
  userId,
}: ActionableEstimatesWidgetProps) {
  const config = (widget.config as {
    showDraft?: boolean;
    showWorking?: boolean;
    showLocked?: boolean;
    onlyMyEstimates?: boolean;
    maxItems?: number;
  }) || {};

  const showDraft = config.showDraft ?? true;
  const showWorking = config.showWorking ?? true;
  const showLocked = config.showLocked ?? false;
  const onlyMyEstimates = config.onlyMyEstimates ?? true;
  const maxItems = config.maxItems ?? 5;

  const [configState, setConfigState] = useState({
    showDraft,
    showWorking,
    showLocked,
    onlyMyEstimates,
    maxItems,
  });

  const { data: estimates = [], isLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectMap = useMemo(() => {
    const map: Record<string, { name: string; color?: string }> = {};
    projects.forEach(p => {
      map[p.id] = { name: p.name, color: p.color || undefined };
    });
    return map;
  }, [projects]);

  const actionableEstimates = useMemo(() => {
    return estimates
      .filter(est => {
        if (est.status === "approved") return false;
        if (est.status === "draft" && !showDraft) return false;
        if (est.status === "working" && !showWorking) return false;
        if (est.status === "locked" && !showLocked) return false;
        if (onlyMyEstimates) {
          const isOwner = est.ownerId === userId;
          const assignees = est.assigneeIds ?? [];
          const isAssignee = Array.isArray(assignees) && assignees.includes(userId);
          if (!isOwner && !isAssignee) return false;
        }
        return true;
      })
      .map(est => ({
        ...est,
        projectName: projectMap[est.projectId]?.name,
        projectColor: projectMap[est.projectId]?.color,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, maxItems);
  }, [estimates, projectMap, showDraft, showWorking, showLocked, onlyMyEstimates, userId, maxItems]);

  const handleSaveConfig = () => {
    onUpdate({
      ...widget,
      config: configState,
    });
  };

  if (isConfiguring) {
    return (
      <div className="p-3 space-y-4">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Show estimates with these statuses:</p>
          
          <label className="flex items-start gap-2 cursor-pointer pb-2 border-b">
            <Checkbox
              checked={configState.onlyMyEstimates}
              onCheckedChange={(checked) => 
                setConfigState(prev => ({ ...prev, onlyMyEstimates: !!checked }))
              }
              className="mt-0.5"
            />
            <div>
              <span className="text-xs font-medium">Only show my estimates</span>
              <p className="text-[10px] text-muted-foreground">Filter to estimates where you are an owner or assignee</p>
            </div>
          </label>
          
          {[
            { key: "showDraft", label: "Draft", desc: "Estimates still being created" },
            { key: "showWorking", label: "Working", desc: "Estimates actively being worked on" },
            { key: "showLocked", label: "Locked", desc: "Estimates locked but not approved" },
          ].map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={configState[key as keyof typeof configState] as boolean}
                onCheckedChange={(checked) => 
                  setConfigState(prev => ({ ...prev, [key]: !!checked }))
                }
                className="mt-0.5"
              />
              <div>
                <span className="text-xs font-medium">{label}</span>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </label>
          ))}

          <div className="pt-2">
            <label className="text-xs text-muted-foreground">Max items to show</label>
            <select
              value={configState.maxItems}
              onChange={(e) => setConfigState(prev => ({ ...prev, maxItems: parseInt(e.target.value) }))}
              className="w-full mt-1 h-7 text-xs rounded-md border bg-background px-2"
            >
              {[3, 5, 10, 15, 20].map(n => (
                <option key={n} value={n}>{n} estimates</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onCloseConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse h-12 bg-muted rounded-md" />
        ))}
      </div>
    );
  }

  if (actionableEstimates.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full min-h-[120px]">
        <CheckCircle className="h-6 w-6 text-green-500 mb-2" />
        <p className="text-xs text-muted-foreground">All caught up! No actionable estimates.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-3">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="divide-y">
          {actionableEstimates.map(estimate => {
            const statusConfig = STATUS_CONFIG[estimate.status] || STATUS_CONFIG.draft;
            const StatusIcon = statusConfig.icon;

            return (
              <Link
                key={estimate.id}
                href={`/projects/${estimate.projectId}/estimates/${estimate.id}`}
                className="block px-3 py-2 hover-elevate cursor-pointer"
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded-sm flex items-center justify-center text-white ${statusConfig.color}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{estimate.name}</span>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 flex-shrink-0">
                        v{estimate.version}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {estimate.projectName && (
                        <span 
                          className="text-[10px] truncate"
                          style={{ color: estimate.projectColor || 'inherit' }}
                        >
                          {estimate.projectName}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(estimate.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {estimates.filter(e => e.status !== "approved").length > actionableEstimates.length && (
        <div className="flex-shrink-0 px-3 py-1.5 border-t bg-muted/30">
          <Link href="/estimates">
            <Button variant="ghost" size="sm" className="w-full h-6 text-[10px]">
              View all {estimates.filter(e => e.status !== "approved").length} estimates
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
