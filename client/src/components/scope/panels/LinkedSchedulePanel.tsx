import { CalendarDays, ChevronRight } from "lucide-react";
import type { LinkedScheduleItemForStage, ScopeStagePanelProps } from "../types";

export interface LinkedSchedulePanelProps extends ScopeStagePanelProps {
  linkedScheduleItems: LinkedScheduleItemForStage[];
  onViewScheduleItem?: (itemId: string) => void;
}

export function LinkedSchedulePanel({
  linkedScheduleItems,
  onViewScheduleItem,
}: LinkedSchedulePanelProps) {
  if (linkedScheduleItems.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="text-data font-medium text-muted-foreground uppercase tracking-wide px-2">
        Linked Schedule Items
      </div>
      {linkedScheduleItems.map((item) => (
        <div
          key={item.id}
          className="h-10 flex items-center gap-3 px-3 rounded-lg border border-border/50 bg-background/80 hover-elevate cursor-pointer group"
          onClick={() => onViewScheduleItem?.(item.id)}
          data-testid={`linked-schedule-item-${item.id}`}
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{item.name}</span>
              <span className={`text-data px-1.5 py-0.5 rounded ${
                item.status === 'completed'
                  ? 'bg-status-success-bg text-status-success'
                  : item.status === 'in_progress'
                    ? 'bg-status-info-bg text-status-info'
                    : item.status === 'on_hold'
                      ? 'bg-status-warning-bg text-status-warning'
                      : 'bg-muted text-secondary'
              }`}>
                {item.status.replace('_', ' ')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {item.startDate && new Date(item.startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              {item.endDate && ` - ${new Date(item.endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
              {item.assignedToName && <span className="ml-2">({item.assignedToName})</span>}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  );
}

export default LinkedSchedulePanel;
