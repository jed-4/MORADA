import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A textarea that grows to fit what is in it.
 *
 * The app has ~34 textareas pinned to `resize-none min-h-[Npx]`, which is a box
 * that is too tall when empty and too short the moment anyone writes a real
 * paragraph — the text then hides behind an inner scrollbar. Five files had
 * already grown their own `scrollHeight` handler for this; none of them was
 * shared. This is that handler, once.
 *
 * Growth is capped by `maxRows`. Past the cap the box stops growing and scrolls
 * — an unbounded textarea in a form pushes every control below it off-screen.
 */
export interface AutoTextareaProps extends React.ComponentProps<"textarea"> {
  /** Smallest height, in rows. */
  minRows?: number;
  /** Stop growing here and scroll instead. */
  maxRows?: number;
}

const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  ({ className, minRows = 2, maxRows = 16, value, onChange, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    // Merge the forwarded ref with the one we need for measuring.
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      const styles = window.getComputedStyle(el);
      const lineHeight = parseFloat(styles.lineHeight) || 20;
      const vPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const vBorder = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);

      // Collapse first: scrollHeight only ever reports >= current height, so a
      // box that has already grown will never shrink without this.
      el.style.height = "auto";
      const content = el.scrollHeight;
      const min = lineHeight * minRows + vPadding + vBorder;
      const max = lineHeight * maxRows + vPadding + vBorder;
      const next = Math.min(Math.max(content, min), max);
      el.style.height = `${next}px`;
      el.style.overflowY = content > max ? "auto" : "hidden";
    }, [minRows, maxRows]);

    // Re-measure when the value changes from outside (a template being applied,
    // a form reset), not only on keystrokes.
    React.useLayoutEffect(() => {
      resize();
    }, [resize, value]);

    // A textarea that starts hidden measures as 0 — a collapsed section, or a
    // tab that is not the active one. Re-measure when it becomes visible.
    React.useEffect(() => {
      const el = innerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => {
        if (el.offsetParent !== null) resize();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [resize]);

    return (
      <textarea
        ref={setRefs}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        rows={minRows}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/35",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-none overflow-hidden",
          className,
        )}
        {...props}
      />
    );
  },
);
AutoTextarea.displayName = "AutoTextarea";

export { AutoTextarea };
