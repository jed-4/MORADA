import { ScheduleItem } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, GripVertical, ChevronRight, ChevronDown } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { TableCell } from "@/components/ui/table";
import { ActivityNotesPopover } from "@/components/ActivityNotesPopover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StatusOption {
  id: string;
  value: string;
  label: string;
  color?: string;
}

interface VisibleColumns {
  item: boolean;
  assignee: boolean;
  dueDate: boolean;
  status: boolean;
}

export interface CasvaScheduleRowProps {
  item: ScheduleItem;
  noteCount?: number;
  onEdit: () => void;
  onStatusChange?: (newStatus: string) => void;
  statusOptions?: StatusOption[];
  visibleColumns?: VisibleColumns;
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
  onStatusChange,
  statusOptions = [],
  visibleColumns = { item: true, assignee: true, dueDate: true, status: true },
  isDraggable = false,
  dragAttributes,
  dragListeners,
  isParent = false,
  isCollapsed = false,
  onToggleCollapse,
  isSubtask = false,
  hasSubtasks = false
}: CasvaScheduleRowProps) {
  const hasValidDates = item.startDate && item.endDate;
  const startDate = hasValidDates ? new Date(item.startDate) : null;
  const endDate = hasValidDates ? new Date(item.endDate) : null;
  const duration = startDate && endDate ? differenceInDays(endDate, startDate) + 1 : null;
  const dateRange = startDate && endDate 
    ? `${format(startDate, 'MMM d')}–${format(endDate, 'MMM d')}`
    : 'No dates';

  return (
    <>
      {/* Title Column with Drag Handle & Collapse */}
      {visibleColumns.item && (
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
      )}

      {/* Assignee & Role Column */}
      {visibleColumns.assignee && (
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
      )}

      {/* Due Date & Duration Column */}
      {visibleColumns.dueDate && (
        <TableCell className="w-40 h-8 py-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground" data-testid="schedule-item-date-range">
              {dateRange}
            </span>
            {duration !== null && (
              <span className="text-[10px] text-muted-foreground/70">
                · {duration}d
              </span>
            )}
          </div>
        </TableCell>
      )}

      {/* Status Column */}
      {visibleColumns.status && (
        <TableCell className="w-32 h-8 py-0">
          <div className="flex items-center gap-1 flex-wrap">
            {item.status && onStatusChange && statusOptions.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="cursor-pointer hover-elevate rounded" data-testid={`status-dropdown-${item.id}`}>
                    <ColorChip type="status" value={item.status} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                  {statusOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (opt.value !== item.status) {
                          onStatusChange(opt.value);
                        }
                      }}
                      className={opt.value === item.status ? "bg-accent" : ""}
                      data-testid={`status-option-${opt.value}`}
                    >
                      <ColorChip type="status" value={opt.value} />
                      <span className="ml-2 text-xs">{opt.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : item.status ? (
              <ColorChip type="status" value={item.status} />
            ) : null}
            <ActivityNotesPopover 
              scheduleItemId={item.id} 
              externalNoteCount={noteCount}
            />
          </div>
        </TableCell>
      )}

      {/* Actions Column */}
      <TableCell className="w-12 h-8 py-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          data-testid={`button-edit-schedule-${item.id}`}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </TableCell>
    </>
  );
}
