import { useEffect } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  handler: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrl ? event.ctrlKey || event.metaKey : true;
        const altMatches = shortcut.alt ? event.altKey : true;
        const shiftMatches = shortcut.shift ? event.shiftKey : true;

        if (keyMatches && ctrlMatches && altMatches && shiftMatches) {
          // Don't trigger if user is typing in an input/textarea
          if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            (event.target instanceof HTMLElement && event.target.isContentEditable)
          ) {
            continue;
          }

          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, enabled]);
}

// Predefined Casva shortcuts
export const CASVA_SHORTCUTS = {
  GOTO_TASKS: { key: "g", description: "Go to Tasks" },
  GOTO_DASHBOARD: { key: "d", description: "Go to Dashboard" },
  NEW_ITEM: { key: "n", ctrl: true, description: "New Item (Ctrl+N)" },
  SEARCH: { key: "/", description: "Focus Search" },
  ARROW_UP: { key: "ArrowUp", description: "Navigate Up" },
  ARROW_DOWN: { key: "ArrowDown", description: "Navigate Down" },
  ENTER: { key: "Enter", description: "Open/Edit Selected" },
  ESCAPE: { key: "Escape", description: "Close Dialog" },
};
