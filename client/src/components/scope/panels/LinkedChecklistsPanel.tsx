import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/EmptyState";
import { ClipboardList, Plus, Circle, CheckCircle2, X } from "lucide-react";
import type {
  LinkedChecklistItem,
  LinkedChecklistForStage,
  ProjectChecklistForStage,
  ScopeStagePanelProps,
} from "../types";

export function LinkedChecklistPopoverContent({
  checklistId,
  checklistName,
  status,
  completedCount,
  totalCount,
  onOpenFull,
}: {
  checklistId: string;
  checklistName: string;
  status: string;
  completedCount?: number;
  totalCount?: number;
  onOpenFull?: () => void;
}) {
  const { data: items, isLoading } = useQuery<LinkedChecklistItem[]>({
    queryKey: ["/api/checklist-instances", checklistId, "items"],
  });

  const sorted = (items ?? [])
    .slice()
    .sort((a, b) =>
      (a.groupOrder ?? 0) - (b.groupOrder ?? 0) || (a.order ?? 0) - (b.order ?? 0),
    );

  return (
    <div className="flex flex-col max-h-96">
      <div className="px-3 py-2 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{checklistName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="capitalize">{status.replace('_', ' ')}</span>
            {(totalCount ?? 0) > 0 && (
              <> · {completedCount ?? 0}/{totalCount} complete</>
            )}
          </div>
        </div>
        {onOpenFull && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenFull}
            data-testid="button-open-checklist-full"
          >
            Open
          </Button>
        )}
      </div>
      <div className="overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">Loading items…</div>
        ) : sorted.length === 0 ? (
          <EmptyState variant="inline" title="No items in this checklist." className="px-2 py-3" />
        ) : (
          sorted.map((it) => {
            const done = it.status === 'completed';
            const na = it.status === 'na';
            return (
              <div
                key={it.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md"
                data-testid={`popover-checklist-item-${it.id}`}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-status-success shrink-0 mt-0.5" />
                ) : na ? (
                  <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm ${done ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {it.description}
                  </div>
                  {it.groupName && (
                    <div className="text-xs text-muted-foreground">{it.groupName}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface LinkedChecklistsPanelProps extends ScopeStagePanelProps {
  linkedChecklists: LinkedChecklistForStage[];
  allProjectChecklists: ProjectChecklistForStage[];
  onLinkChecklist?: (checklistId: string, stageId: string) => void;
  onUnlinkChecklist?: (checklistId: string) => void;
  onNavigateToChecklists?: (stageId: string) => void;
}

export function LinkedChecklistsPanel({
  stageId,
  linkedChecklists,
  allProjectChecklists,
  onLinkChecklist,
  onUnlinkChecklist,
  onNavigateToChecklists,
}: LinkedChecklistsPanelProps) {
  const linkableChecklists = allProjectChecklists.filter(cl => !cl.scopeStageId);
  const showSection = linkedChecklists.length > 0 || linkableChecklists.length > 0;
  if (!showSection) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between px-2">
        <div className="text-data font-medium text-muted-foreground uppercase tracking-wide">
          Checklists
        </div>
        {linkableChecklists.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover-elevate active-elevate-2"
                title="Link a checklist to this stage"
              >
                <Plus className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1" align="end">
              <div className="text-table font-medium text-muted-foreground px-2 py-1.5 border-b border-border mb-1">
                Link a checklist to this stage
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {linkableChecklists.map((cl) => (
                  <button
                    key={cl.id}
                    className="w-full text-left px-2 py-1.5 rounded hover-elevate active-elevate-2 flex items-center gap-2"
                    onClick={() => onLinkChecklist?.(cl.id, stageId)}
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{cl.name}</div>
                      {(cl.totalCount ?? 0) > 0 && (
                        <div className="text-data text-muted-foreground">
                          {cl.completedCount ?? 0}/{cl.totalCount} items
                        </div>
                      )}
                    </div>
                    <span className={`text-data px-1.5 py-0.5 rounded shrink-0 ${
                      cl.status === 'completed' ? 'bg-status-success-bg text-status-success' : 'bg-muted text-secondary'
                    }`}>
                      {cl.status.replace('_', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {linkedChecklists.map((cl) => (
        <Popover key={cl.id}>
          <div
            className="h-10 flex items-center gap-3 px-3 rounded-lg border border-border/50 bg-background/80 hover-elevate group"
            data-testid={`linked-checklist-${cl.id}`}
          >
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex-1 min-w-0 text-left"
                data-testid={`button-open-checklist-popover-${cl.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{cl.name}</span>
                  <span className={`text-data px-1.5 py-0.5 rounded ${
                    cl.status === 'completed'
                      ? 'bg-status-success-bg text-status-success'
                      : cl.status === 'in_progress'
                        ? 'bg-status-info-bg text-status-info'
                        : 'bg-muted text-secondary '
                  }`}>
                    {cl.status.replace('_', ' ')}
                  </span>
                </div>
                {(cl.totalCount ?? 0) > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {cl.completedCount ?? 0}/{cl.totalCount} items
                  </div>
                )}
              </button>
            </PopoverTrigger>
            <button
              className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover-elevate shrink-0"
              title="Unlink checklist from this stage"
              onClick={(e) => { e.stopPropagation(); onUnlinkChecklist?.(cl.id); }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <PopoverContent
            align="start"
            className="w-96 p-0"
            data-testid={`popover-checklist-${cl.id}`}
          >
            <LinkedChecklistPopoverContent
              checklistId={cl.id}
              checklistName={cl.name}
              status={cl.status}
              completedCount={cl.completedCount}
              totalCount={cl.totalCount}
              onOpenFull={() => onNavigateToChecklists?.(stageId)}
            />
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

export default LinkedChecklistsPanel;
