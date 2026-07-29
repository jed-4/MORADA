// List row for the Selections page. Image-led, merged budget cell, relative
// deadline, sticky actions. Row click opens the full selection; the quick-view
// drawer is an explicit affordance (peek button / kebab item).

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, MoreVertical, Eye, Edit3, Copy, Trash2, ExternalLink, PanelRight } from "lucide-react";
import type { SelectionWithOptions } from "@shared/schema";
import {
  getDerivedStatus,
  getSelectedOption,
  getDeadlineMeta,
  getCategoryColour,
  OptionThumbStack,
  BudgetCell,
  SelectionStatusPill,
} from "./selectionHelpers";

export interface SelectionColumnVisibility {
  category: boolean;
  location: boolean;
  options: boolean;
}

export interface SelectionRowProps {
  selection: SelectionWithOptions;
  gridTemplate: string;
  columns: SelectionColumnVisibility;
  onOpenDrawer: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isChecked: boolean;
  projectId: string;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDraggable?: boolean;
}

export function SelectionRow({
  selection,
  gridTemplate,
  columns,
  onOpenDrawer,
  onEdit,
  onDelete,
  onDuplicate,
  isChecked,
  projectId,
  dragHandleProps,
  isDraggable = false,
}: SelectionRowProps) {
  const derived = getDerivedStatus(selection);
  const selectedOption = getSelectedOption(selection);
  const deadlineMeta = getDeadlineMeta(selection.deadline, derived);
  const purchaseOrderId = (selection as any).purchaseOrderId ?? null;
  const optionCount = selection.options?.length ?? 0;

  return (
    <div
      className={`group grid gap-3 items-center h-16 px-3 border-b border-border/70 cursor-pointer transition-colors ${
        isChecked ? "bg-primary/5" : "hover:bg-muted/40"
      }`}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={() => onEdit(selection.id)}
      data-testid={`row-selection-${selection.id}`}
    >
      {/* Drag handle */}
      <div
        className={`flex items-center justify-center flex-shrink-0 ${isDraggable ? "cursor-grab opacity-0 group-hover:opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={(e) => e.stopPropagation()}
        {...(isDraggable ? dragHandleProps : {})}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      {/* Image-led thumbnail */}
      <div className="flex items-center overflow-hidden">
        <OptionThumbStack selection={selection} size={48} />
      </div>

      {/* Name + meta line (meta only carries what isn't shown as a column) */}
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground truncate leading-tight" data-testid={`text-name-${selection.id}`}>
          {selection.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground truncate">
          {!columns.category && selection.category && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className="rounded-full" style={{ width: 6, height: 6, backgroundColor: getCategoryColour(selection.category) }} />
              {selection.category}
            </span>
          )}
          {!columns.category && selection.category && !columns.location && selection.room && (
            <span className="text-muted-foreground/40">·</span>
          )}
          {!columns.location && selection.room && <span className="shrink-0">{selection.room}</span>}
          {((!columns.category && selection.category) || (!columns.location && selection.room)) &&
            (selectedOption || optionCount > 0) && <span className="text-muted-foreground/40">·</span>}
          {selectedOption ? (
            <span className="truncate text-muted-foreground/70">{selectedOption.name}</span>
          ) : optionCount > 0 ? (
            <span className="truncate text-muted-foreground/70">
              {optionCount} option{optionCount === 1 ? "" : "s"} ready
            </span>
          ) : null}
        </div>
      </div>

      {/* Optional: Category column */}
      {columns.category && (
        <div className="flex items-center gap-1.5 min-w-0">
          {selection.category && (
            <>
              <span className="rounded-full shrink-0" style={{ width: 7, height: 7, backgroundColor: getCategoryColour(selection.category) }} />
              <span className="text-[11px] text-muted-foreground truncate">{selection.category}</span>
            </>
          )}
        </div>
      )}

      {/* Optional: Location column */}
      {columns.location && (
        <div className="text-[11px] text-muted-foreground truncate">{selection.room || ""}</div>
      )}

      {/* Status pill (+ PO link when ordered) */}
      <div className="min-w-0 flex items-center gap-1.5">
        <SelectionStatusPill derived={derived} />
        {purchaseOrderId && (
          <a
            href={`/projects/${projectId}/purchase-orders/${purchaseOrderId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#4a90d4] hover:underline shrink-0"
            data-testid={`chip-po-${selection.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            PO
          </a>
        )}
      </div>

      {/* Optional: Options count */}
      {columns.options && (
        <div className="text-center">
          {optionCount > 0 && (
            <span className="bg-muted/50 text-muted-foreground rounded-full text-[10px] font-medium px-2 py-0.5">
              {optionCount}
            </span>
          )}
        </div>
      )}

      {/* Merged budget cell (chip only — no bar in the list) */}
      <BudgetCell selection={selection} />

      {/* Relative deadline */}
      <div className={`text-[11px] truncate text-right ${deadlineMeta.className}`}>{deadlineMeta.text}</div>

      {/* Actions — sticky right per the app table standard */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-end gap-0.5 sticky right-0 h-full bg-gradient-to-l from-background via-background/95 to-transparent pl-2"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="h-6 w-6 rounded-md hover-elevate active-elevate-2 items-center justify-center text-muted-foreground hover:text-foreground hidden group-hover:flex"
              onClick={() => onOpenDrawer(selection.id)}
              data-testid={`button-peek-${selection.id}`}
              aria-label="Quick view"
            >
              <PanelRight className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Quick view</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
              data-testid={`button-actions-${selection.id}`}
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpenDrawer(selection.id)}>
              <Eye className="w-4 h-4 mr-2" />
              Quick View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(selection.id)}>
              <Edit3 className="w-4 h-4 mr-2" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(selection.id)} data-testid={`button-duplicate-${selection.id}`}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(selection.id)} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function SortableSelectionRow(props: SelectionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.selection.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SelectionRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}
