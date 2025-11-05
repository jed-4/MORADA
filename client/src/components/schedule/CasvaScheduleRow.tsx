import { ScheduleItem } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, GripVertical, ChevronRight, ChevronDown } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { TableCell } from "@/components/ui/table";

export interface CasvaScheduleRowProps {
  item: ScheduleItem;
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
      <TableCell className="h-10 py-1" style={{ paddingLeft: isSubtask ? '24px' : '8px' }}>
        <div className="flex items-center gap-2">
          {isDraggable && (
            <div 
              className="drag-handle-enhanced cursor-grab active:cursor-grabbing" 
              {...dragAttributes} 
              {...dragListeners}
              data-testid="drag-handle"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          
          {hasSubtasks && onToggleCollapse && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="p-0.5 hover-elevate rounded transition-transform duration-200"
              data-testid="button-toggle-collapse"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
          
          <span 
            className="font-medium text-sm truncate" 
            style={{ 
              fontFamily: isParent ? 'Clash Grotesk, sans-serif' : 'Manrope, sans-serif',
              fontSize: isParent ? '14px' : '13px'
            }}
            data-testid="schedule-item-title"
          >
            {item.name}
          </span>
        </div>
      </TableCell>

      {/* Assignee & Role Column */}
      <TableCell className="w-48 h-10 py-1">
        <div className="flex items-center gap-1.5">
          {item.assignedToName && (
            <span className="text-xs text-muted-foreground truncate" data-testid="schedule-item-assignee">
              {item.assignedToName}
            </span>
          )}
          {item.type && (
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              {item.type}
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Due Date & Duration Column */}
      <TableCell className="w-40 h-10 py-1">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground" data-testid="schedule-item-date-range">
            {dateRange}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {duration} {duration === 1 ? 'day' : 'days'}
          </span>
        </div>
      </TableCell>

      {/* Chips Column (RFQ/PO) */}
      <TableCell className="w-32 h-10 py-1">
        <div className="flex items-center gap-1 flex-wrap">
          {item.status && (
            <ColorChip type="status" value={item.status} />
          )}
        </div>
      </TableCell>

      {/* Actions Column */}
      <TableCell className="w-12 h-10 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="casva-edit-icon h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          data-testid={`button-edit-schedule-${item.id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </>
  );
}
