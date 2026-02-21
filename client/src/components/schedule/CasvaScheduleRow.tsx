import { ScheduleItem } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Pencil, GripVertical, ChevronRight, ChevronDown, MoreVertical, Trash2, Copy, Check } from "lucide-react";
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
  type: boolean;
  dueDate: boolean;
  status: boolean;
  completion: boolean;
}

export interface CasvaScheduleRowProps {
  item: ScheduleItem;
  noteCount?: number;
  onEdit: () => void;
  onStatusChange?: (newStatus: string) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onCompletionToggle?: () => void;
  statusOptions?: StatusOption[];
  visibleColumns?: VisibleColumns;
  isDraggable?: boolean;
  dragAttributes?: any;
  dragListeners?: any;
  onDragHandleMouseDown?: (e: React.MouseEvent) => void;
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
  onDuplicate,
  onDelete,
  onCompletionToggle,
  statusOptions = [],
  visibleColumns = { item: true, assignee: true, type: true, dueDate: true, status: true, completion: true },
  isDraggable = false,
  dragAttributes,
  dragListeners,
  onDragHandleMouseDown,
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
        <TableCell className="h-8 py-0 pl-0">
          <div className="flex items-center gap-0">
            {isDraggable && (
              <div 
                className="cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5" 
                onMouseDown={onDragHandleMouseDown}
                {...dragAttributes} 
                {...dragListeners}
                data-testid="drag-handle"
              >
                <GripVertical className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            
            {hasSubtasks && onToggleCollapse ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse();
                }}
                className="p-0.5 hover-elevate rounded transition-transform flex-shrink-0 w-4 h-4 flex items-center justify-center"
                data-testid="button-toggle-collapse"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="w-4 h-4 flex-shrink-0" />
            )}
            
            <span 
              className="font-medium text-xs truncate" 
              style={{ paddingLeft: isSubtask ? '10px' : '0' }}
              data-testid="schedule-item-title"
            >
              {item.name}
            </span>
          </div>
        </TableCell>
      )}

      {/* Assignee Column */}
      {visibleColumns.assignee && (
        <TableCell className="w-32 h-8 py-0 overflow-hidden" data-testid="schedule-item-assignee">
          {item.assignedToName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar className="w-5 h-5 flex-shrink-0">
                <AvatarFallback className="text-[9px] bg-muted">
                  {item.assignedToName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate">
                {item.assignedToName}
              </span>
            </div>
          )}
        </TableCell>
      )}

      {/* Type Column */}
      {visibleColumns.type && (
        <TableCell className="w-24 h-8 py-0">
          {item.type && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">
              {item.type}
            </Badge>
          )}
        </TableCell>
      )}

      {/* Due Date & Duration Column */}
      {visibleColumns.dueDate && (
        <TableCell className="w-36 h-8 py-0">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-xs text-muted-foreground" data-testid="schedule-item-date-range">
              {dateRange}
            </span>
            {duration !== null && (
              <span className="text-xs text-muted-foreground/70">
                · {duration}d
              </span>
            )}
          </div>
        </TableCell>
      )}

      {/* Status Column */}
      {visibleColumns.status && (
        <TableCell className="w-32 h-8 py-0">
          <div className="flex items-center gap-1">
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
          </div>
        </TableCell>
      )}

      {/* Notes Column */}
      <TableCell className="w-8 h-8 py-0">
        <ActivityNotesPopover 
          scheduleItemId={item.id} 
          externalNoteCount={noteCount}
        />
      </TableCell>

      {/* Completion Column */}
      {visibleColumns.completion && (
        <TableCell className="w-28 h-8 py-0">
          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCompletionToggle?.();
              }}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer",
                (item.progressPercent || 0) === 100
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 hover:border-muted-foreground/70"
              )}
              data-testid={`completion-toggle-${item.id}`}
            >
              {(item.progressPercent || 0) === 100 && (
                <Check className="w-3 h-3" />
              )}
            </button>
            <span className="inline-flex items-center justify-center rounded-md bg-muted-foreground/20 text-muted-foreground text-[11px] font-medium px-2 py-0.5 min-w-[40px]">
              {item.progressPercent || 0} %
            </span>
          </div>
        </TableCell>
      )}

      {/* Actions Column */}
      <TableCell className="w-12 h-8 py-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid={`button-actions-${item.id}`}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            {onDuplicate && (
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                Duplicate
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </>
  );
}
