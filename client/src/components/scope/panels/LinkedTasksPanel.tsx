import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckSquare, Plus, X } from "lucide-react";
import type { ProjectTaskForStage, ScopeStagePanelProps } from "../types";

export interface LinkedTasksPanelProps extends ScopeStagePanelProps {
  allProjectTasks: ProjectTaskForStage[];
  onLinkTask?: (taskId: string, stageId: string) => void;
  onUnlinkTask?: (taskId: string) => void;
}

export function LinkedTasksPanel({
  stageId,
  allProjectTasks,
  onLinkTask,
  onUnlinkTask,
}: LinkedTasksPanelProps) {
  const linkedTasks = allProjectTasks.filter(t => t.scopeStageId === stageId);
  const linkableTasks = allProjectTasks.filter(t => !t.scopeStageId);
  const showSection = linkedTasks.length > 0 || linkableTasks.length > 0;
  if (!showSection) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between px-2">
        <div className="text-data font-medium text-muted-foreground uppercase tracking-wide">
          Tasks
        </div>
        {linkableTasks.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover-elevate active-elevate-2"
                title="Link a task to this stage"
              >
                <Plus className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1" align="end">
              <div className="text-table font-medium text-muted-foreground px-2 py-1.5 border-b border-border mb-1">
                Link a task to this stage
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {linkableTasks.map((task) => (
                  <button
                    key={task.id}
                    className="w-full text-left px-2 py-1.5 rounded hover-elevate active-elevate-2 flex items-center gap-2"
                    onClick={() => onLinkTask?.(task.id, stageId)}
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{task.title}</div>
                      {task.statusName && (
                        <div className="text-data text-muted-foreground truncate">{task.statusName}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {linkedTasks.map((task) => (
        <div
          key={task.id}
          className="h-10 flex items-center gap-3 px-3 rounded-lg border border-border/50 bg-background/80 group"
        >
          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{task.title}</span>
              {task.statusName && (
                <span className="text-data px-1.5 py-0.5 rounded bg-muted text-secondary shrink-0">
                  {task.statusName}
                </span>
              )}
            </div>
          </div>
          <button
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover-elevate shrink-0"
            title="Unlink task from this stage"
            onClick={(e) => { e.stopPropagation(); onUnlinkTask?.(task.id); }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default LinkedTasksPanel;
