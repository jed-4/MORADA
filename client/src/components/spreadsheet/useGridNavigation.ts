import React, { useCallback, useRef, useState } from "react";

/**
 * Reusable spreadsheet-style keyboard navigation for a 2D cell grid.
 *
 * Model: the grid is `rows × cols` navigable cells. One cell is "active" at a
 * time. In NAV mode arrow keys / Tab / Enter move the active cell; the consumer
 * focuses the corresponding DOM node (a focusable wrapper) via `focusCell` so
 * the browser's focus ring / our highlight follows. EDIT mode is entered when
 * the user starts editing a cell (Enter / type / double-click) and exited on
 * Escape / commit — while editing, arrow keys belong to the cell's own editor,
 * not the grid.
 *
 * This is deliberately grid-agnostic: it knows nothing about what a cell
 * contains. Details, Labour, and (later) the estimate grid all drive it the
 * same way, so the spreadsheet feel is identical everywhere.
 */

export interface GridCoord {
  row: number;
  col: number;
}

export type GridMode = "nav" | "edit";

export interface UseGridNavigationOptions {
  /** Current grid size. Read lazily so it always reflects the latest render. */
  getDimensions: () => { rows: number; cols: number };
  /** Focus the DOM wrapper for a coord (consumer queries by data-attrs). */
  focusCell: (coord: GridCoord) => void;
  /**
   * Enter edit mode for the active cell. Return false if the cell can't be
   * edited (e.g. a read-only column) so navigation isn't swallowed.
   */
  beginEdit?: (coord: GridCoord, initialKey?: string) => boolean;
}

export interface GridNavigation {
  active: GridCoord | null;
  mode: GridMode;
  /** Attach to the grid container. Returns true if it handled the event. */
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Programmatically set the active cell (e.g. on click) and focus it. */
  setActive: (coord: GridCoord | null) => void;
  /** Exit edit mode back to navigation (call on commit / escape / blur). */
  endEdit: (opts?: { move?: "down" | "up" | "right" | "left" | "none" }) => void;
  isActive: (row: number, col: number) => boolean;
}

export function useGridNavigation(opts: UseGridNavigationOptions): GridNavigation {
  const [active, setActiveState] = useState<GridCoord | null>(null);
  const [mode, setMode] = useState<GridMode>("nav");
  const activeRef = useRef<GridCoord | null>(null);
  const modeRef = useRef<GridMode>("nav");

  const setActive = useCallback(
    (coord: GridCoord | null) => {
      activeRef.current = coord;
      setActiveState(coord);
      if (coord) opts.focusCell(coord);
    },
    [opts],
  );

  const setMode2 = useCallback((m: GridMode) => {
    modeRef.current = m;
    setMode(m);
  }, []);

  const clampAndSet = useCallback(
    (row: number, col: number) => {
      const { rows, cols } = opts.getDimensions();
      if (rows <= 0 || cols <= 0) return;
      const r = Math.min(rows - 1, Math.max(0, row));
      const c = Math.min(cols - 1, Math.max(0, col));
      setActive({ row: r, col: c });
    },
    [opts, setActive],
  );

  const move = useCallback(
    (dRow: number, dCol: number) => {
      const cur = activeRef.current ?? { row: 0, col: 0 };
      clampAndSet(cur.row + dRow, cur.col + dCol);
    },
    [clampAndSet],
  );

  const endEdit = useCallback<GridNavigation["endEdit"]>(
    (o) => {
      setMode2("nav");
      const cur = activeRef.current;
      switch (o?.move) {
        case "down": move(1, 0); break;
        case "up": move(-1, 0); break;
        case "right": move(0, 1); break;
        case "left": move(0, -1); break;
        default:
          // Re-focus the current cell wrapper so keyboard nav resumes.
          if (cur) opts.focusCell(cur);
      }
    },
    [move, opts, setMode2],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // While a cell's own editor is open, the grid stays out of the way.
      if (modeRef.current === "edit") return;
      if (!activeRef.current) {
        // First keypress with nothing selected — anchor at the top-left.
        if (
          e.key.startsWith("Arrow") ||
          e.key === "Tab" ||
          e.key === "Enter"
        ) {
          e.preventDefault();
          clampAndSet(0, 0);
        }
        return;
      }

      switch (e.key) {
        case "ArrowUp": e.preventDefault(); move(-1, 0); return;
        case "ArrowDown": e.preventDefault(); move(1, 0); return;
        case "ArrowLeft": e.preventDefault(); move(0, -1); return;
        case "ArrowRight": e.preventDefault(); move(0, 1); return;
        case "Tab": e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return;
        case "Enter":
          e.preventDefault();
          if (opts.beginEdit && opts.beginEdit(activeRef.current)) {
            setMode2("edit");
          } else {
            move(1, 0);
          }
          return;
        case " ": // space activates the cell (toggle checkbox, open editor)
          if (opts.beginEdit && opts.beginEdit(activeRef.current, " ")) {
            e.preventDefault();
            setMode2("edit");
          }
          return;
        case "Escape":
          return;
        default:
          // Type-to-edit: a single printable character starts editing.
          if (
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            opts.beginEdit
          ) {
            if (opts.beginEdit(activeRef.current, e.key)) {
              e.preventDefault();
              setMode2("edit");
            }
          }
          return;
      }
    },
    [clampAndSet, move, opts, setMode2],
  );

  const isActive = useCallback(
    (row: number, col: number) =>
      !!active && active.row === row && active.col === col,
    [active],
  );

  return { active, mode, onKeyDown, setActive, endEdit, isActive };
}
