/**
 * The floating pill that appears when lines or groups are ticked on an
 * estimate grid: clear, a count, the page's actions, and delete.
 *
 * Shared by the estimate page and the estimate-template page. The template
 * page used to draw its own strip at the top of the grid with hand-sized
 * buttons beside the standard Edit button, so the controls didn't match each
 * other or the estimate page.
 *
 * Page-specific actions (Edit, the estimate's Create menu) go in `children`.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";

interface Props {
  itemCount: number;
  groupCount: number;
  onClear: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  children?: React.ReactNode;
}

export function EstimateSelectionBar({ itemCount, groupCount, onClear, onDelete, deleteDisabled, children }: Props) {
  if (itemCount === 0 && groupCount === 0) return null;
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg flex items-center gap-2 px-2 py-1.5"
      data-testid="bulk-action-bar"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        data-testid="button-clear-selection"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </Button>
      <span className="text-sm font-medium whitespace-nowrap" data-testid="text-selected-count">
        {itemCount > 0 && `${itemCount} item${itemCount !== 1 ? "s" : ""}`}
        {itemCount > 0 && groupCount > 0 && ", "}
        {groupCount > 0 && `${groupCount} group${groupCount !== 1 ? "s" : ""}`}
        {" selected"}
      </span>
      {children}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={deleteDisabled}
        data-testid="button-bulk-delete"
        title="Delete selected"
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}
