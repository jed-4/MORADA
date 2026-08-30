import { useEffect } from "react";
import type { EnhancedCalendarView } from "@/components/EnhancedCalendar";

/**
 * Keyboard navigation, the way a calendar you live in should work:
 * `t` = today, `←`/`→` = previous/next, `d` `w` `m` `a` = day/week/month/agenda.
 *
 * Deliberately conservative about when it fires — never while typing in a field or
 * a rich-text editor, never with a modifier held (so browser and OS shortcuts are
 * untouched), and never while a dialog or menu is open, since detail and edit
 * modals sit above the calendar and their own keys must win.
 */

const VIEW_KEYS: Record<string, EnhancedCalendarView> = {
  d: "day",
  w: "week",
  m: "month",
  a: "agenda",
};

export interface CalendarShortcutHandlers {
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onViewChange?: (view: EnhancedCalendarView) => void;
  /**
   * Which views this surface offers. A key for a view not listed is ignored, so a
   * calendar without an agenda mode never gets switched into one it can't show.
   */
  views?: readonly EnhancedCalendarView[];
  /** Set false to suspend the shortcuts without unmounting the caller. */
  enabled?: boolean;
}

export function useCalendarShortcuts({
  onToday,
  onPrevious,
  onNext,
  onViewChange,
  views,
  enabled = true,
}: CalendarShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // instanceof, not a truthiness check: an event dispatched on window has
      // target === window, which has no tagName or closest() and would throw.
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
        if (target.closest('[role="dialog"], [role="menu"], [role="listbox"], [contenteditable="true"]')) return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === "t" || e.key === "T") {
        onToday();
      } else if (e.key === "ArrowLeft") {
        onPrevious();
      } else if (e.key === "ArrowRight") {
        onNext();
      } else {
        const view = VIEW_KEYS[e.key.toLowerCase()];
        if (!view || !onViewChange) return;
        if (views && !views.includes(view)) return;
        onViewChange(view);
      }
      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Re-subscribed each render so the handlers close over the current date/mode.
  });
}
