import { ScheduleItem } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, GripVertical, ChevronRight, ChevronDown } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { TableCell } from "@/components/ui/table";
import { ActivityNotesPopover } from "@/components/ActivityNotesPopover";

export interface CasvaScheduleRowProps {
  item: ScheduleItem;
  noteCount?: number;
  onEdit: () => void;
  isDraggable?: boolean;
  dragAttributes?: any;
  dragListeners?: any;
  isParent?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isSubtask?: boolean;
  hasSubtasks?: boolean;
}

export function CasvaScheduleRow({ 
  item, 
  noteCount = 0,
  onEdit, 
  isDraggable = false,
  dragAttributes,
  dragListeners,
  isParent = false,
  isCollapsed = false,
  onToggleCollapse,
  isSubtask = false,
  hasSubtasks = false
}: CasvaScheduleRowProps) {
  const startDate = new Date(item.startDate);
  const endDate = new Date(item.endDate);
  const duration = differenceInDays(endDate, startDate) + 1;
  const dateRange = `${format(startDate, 'MMM d')}–${format(endDate, 'MMM d')}`;

  return (
    <>
      {/* Title Column with Drag Handle & Collapse */}
      <TableCell className="h-8 py-0" style={{ paddingLeft: isSubtask ? '20px' : '8px' }}>
        <div className="flex items-center gap-1.5">
          {isDraggable && (
            <div 
              className="drag-handle-enhanced cursor-grab active:cursor-grabbing" 
              {...dragAttributes} 
              {...dragListeners}
              data-testid="drag-handle"
            >
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          
          {hasSubtasks && onToggleCollapse && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="p-0.5 hover-elevate rounded transition-transform"
              data-testid="button-toggle-collapse"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              )}
            </button>
          )}
          
          <span 
            className="font-medium text-xs truncate" 
            data-testid="schedule-item-title"
          >
            {item.name}
          </span>
        </div>
      </TableCell>

      {/* Assignee & Role Column */}
      <TableCell className="w-48 h-8 py-0">
        <div className="flex items-center gap-1">
          {item.assignedToName && (
            <span className="text-[10px] text-muted-foreground truncate" data-testid="schedule-item-assignee">
              {item.assignedToName}
            </span>
          )}
          {item.type && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              {item.type}
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Due Date & Duration Column */}
      <TableCell className="w-40 h-8 py-0">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground" data-testid="schedule-item-date-range">
            {dateRange}
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            · {duration}d
          </span>
        </div>
      </TableCell>

      {/* Chips Column (RFQ/PO) */}
      <TableCell className="w-32 h-8 py-0">
        <div className="flex items-center gap-1 flex-wrap">
          {item.status && (
            <ColorChip type="status" value={item.status} />
          )}
          <ActivityNotesPopover 
            scheduleItemId={item.id} 
            externalNoteCount={noteCount}
          />
        </div>
      </TableCell>

      {/* Actions Column */}
      <TableCell className="w-12 h-8 py-0">
        <Button
          variant="ghost"
          size="icon"
          className="casva-edit-icon h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          data-testid={`button-edit-schedule-${item.id}`}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </TableCell>
    </>
  );
}
