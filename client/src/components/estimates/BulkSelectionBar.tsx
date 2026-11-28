import { useEffect, useState, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The bar that replaces a grid's "add row" strip while rows are selected
 * (Details and Labour on an estimate). It holds the count, the actions passed
 * in as children, Delete (always confirmed) and a clear-selection ×.
 *
 * Esc clears the selection — unless focus is in a text box, where Esc belongs
 * to that editor.
 */
export function BulkSelectionBar({
  count,
  noun,
  onClear,
  onDelete,
  deleteNote,
  busy,
  children,
}: {
  count: number;
  /** "row" / "task" — pluralised here. */
  noun: string;
  onClear: () => void;
  onDelete?: () => void;
  /** Extra line in the delete confirmation (e.g. which rows can't go). */
  deleteNote?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = `${count} ${noun}${count === 1 ? "" : "s"}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // An open menu or dialog closes first; the next Esc clears.
      if (document.querySelector("[role=menu], [role=alertdialog], [role=dialog]")) return;
      onClear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClear]);

  return (
    <div
      className="flex-shrink-0 border-t border-primary/30 bg-primary/[0.06] px-3 py-1.5 flex items-center gap-1.5 flex-wrap"
      data-testid="bulk-selection-bar"
    >
      <span className="text-xs font-medium text-foreground mr-1 tabular-nums" data-testid="bulk-selection-count">
        {label} selected
      </span>
      {children}
      {onDelete && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
          onClick={() => setConfirming(true)}
          disabled={busy}
          data-testid="bulk-delete"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </Button>
      )}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 rounded hover-elevate"
        title="Clear selection (Esc)"
        data-testid="bulk-clear"
      >
        <X className="w-3 h-3" />
        Clear
      </button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone.{deleteNote ? ` ${deleteNote}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirming(false); onDelete?.(); }}
              data-testid="bulk-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Header checkbox state for a select-all box over `visibleIds`. */
export function selectAllState(selected: Set<string>, visibleIds: string[]): boolean | "indeterminate" {
  if (visibleIds.length === 0) return false;
  const n = visibleIds.filter(id => selected.has(id)).length;
  return n === 0 ? false : n === visibleIds.length ? true : "indeterminate";
}
