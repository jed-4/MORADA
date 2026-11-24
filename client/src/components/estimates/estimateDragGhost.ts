/**
 * The bar that follows the cursor while a line or group is dragged on an
 * estimate grid. Shared by the estimate and the estimate template.
 *
 * A plain DOM element moved on pointermove, not a React overlay, so it tracks
 * the cursor with no re-render per frame. Rows deliberately don't slide out of
 * the way during a drag (see SortableRow), so without this nothing on screen
 * follows the cursor at all — the template had no ghost, and a drag there
 * looked like it wasn't happening.
 *
 * Returns the cleanup: call it when the drag ends or is cancelled.
 */
export function startDragGhost(sourceEl: HTMLElement, label: string, initialY?: number): () => void {
  const sourceRect = sourceEl.getBoundingClientRect();
  const ghost = document.createElement("div");
  Object.assign(ghost.style, {
    position: "fixed",
    zIndex: "9999",
    pointerEvents: "none",
    width: `${sourceRect.width}px`,
    height: `${Math.round(sourceRect.height) || 32}px`,
    top: `${sourceRect.top}px`,
    left: `${sourceRect.left}px`,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    // Tokens, not a baked lavender — the literal ignored dark mode.
    background: "hsl(var(--primary) / 0.25)",
    borderLeft: "2px solid hsl(var(--primary))",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    cursor: "grabbing",
    overflow: "hidden",
    fontSize: "12px",
    // The theme tokens are bare HSL triplets: `var(--foreground)` on its own
    // is not a valid colour, so it silently fell back to inherited.
    color: "hsl(var(--foreground))",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  } as Partial<CSSStyleDeclaration>);
  ghost.textContent = label;
  document.body.appendChild(ghost);

  const startY = initialY ?? sourceRect.top + sourceRect.height / 2;
  const onMove = (e: PointerEvent) => {
    ghost.style.top = `${sourceRect.top + (e.clientY - startY)}px`;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  return () => {
    window.removeEventListener("pointermove", onMove);
    ghost.remove();
  };
}
