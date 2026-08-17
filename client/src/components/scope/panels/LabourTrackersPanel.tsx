import { Clock, X } from "lucide-react";
import type { LabourHoursBudget } from "@shared/schema";
import type { ScopeStagePanelProps, StageLabourTracker } from "../types";

export interface LabourTrackersPanelProps extends ScopeStagePanelProps {
  trackers: StageLabourTracker[];
  labourBudgetData: LabourHoursBudget[];
  onUpdateLabourTrackers?: (stageId: string, trackers: StageLabourTracker[]) => void;
}

export function LabourTrackersPanel({
  stageId,
  trackers,
  labourBudgetData,
  onUpdateLabourTrackers,
}: LabourTrackersPanelProps) {
  if (trackers.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between px-2">
        <div className="text-data font-medium text-muted-foreground uppercase tracking-wide">
          Labour Hours
        </div>
      </div>
      {trackers.map((tracker) => {
        const budgetRow = labourBudgetData.find(b => b.costCodeId === tracker.costCodeId);
        const name = budgetRow?.costCodeTitle || tracker.costCodeId;
        const budgeted = budgetRow ? (Number(budgetRow.budgetedHours) || 0) : 0;
        const approved = budgetRow ? (Number(budgetRow.approvedHours) || 0) : 0;
        const pct = budgeted > 0 ? Math.min(100, Math.round((approved / budgeted) * 100)) : 0;
        const isOver = approved > budgeted && budgeted > 0;
        return (
          <div
            key={tracker.costCodeId}
            className="h-10 flex items-center gap-3 px-3 rounded-lg border border-border/50 bg-background/80 group"
            data-testid={`labour-tracker-${stageId}-${tracker.costCodeId}`}
          >
            <Clock className="h-4 w-4 text-teal shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{name}</span>
                <span className="text-data text-muted-foreground shrink-0">
                  {approved.toFixed(1)} / {budgeted > 0 ? budgeted.toFixed(1) : '—'} hrs
                </span>
              </div>
              {budgeted > 0 && (
                <div className="h-1 mt-0.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isOver ? 'bg-coral' : 'bg-teal'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
            <button
              className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover-elevate shrink-0"
              title="Remove labour tracker"
              onClick={(e) => {
                e.stopPropagation();
                const updated = trackers.filter(t => t.costCodeId !== tracker.costCodeId);
                onUpdateLabourTrackers?.(stageId, updated);
              }}
              data-testid={`button-remove-labour-tracker-${stageId}-${tracker.costCodeId}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default LabourTrackersPanel;
