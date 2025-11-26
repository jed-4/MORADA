import { useState, useCallback, useEffect } from "react";

interface UndoAction {
  type: string;
  data: any;
  timestamp: number;
}

export function useUndoStack(maxStackSize: number = 20) {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);

  // Add action to undo stack
  const pushAction = useCallback((type: string, data: any) => {
    const action: UndoAction = {
      type,
      data,
      timestamp: Date.now(),
    };
    
    setUndoStack((prev) => {
      const newStack = [...prev, action];
      // Keep only the last maxStackSize actions
      return newStack.slice(-maxStackSize);
    });
    
    setLastAction(action);
    setShowUndoToast(true);
    
    // Auto-hide toast after 3 seconds
    setTimeout(() => setShowUndoToast(false), 3000);
  }, [maxStackSize]);

  // Pop last action from stack
  const popAction = useCallback((): UndoAction | null => {
    if (undoStack.length === 0) return null;
    
    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setShowUndoToast(false);
    
    return action;
  }, [undoStack]);

  // Clear all actions
  const clearStack = useCallback(() => {
    setUndoStack([]);
    setShowUndoToast(false);
  }, []);

  // Keyboard shortcut for undo (Ctrl+Z / Cmd+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.length > 0) {
          const action = popAction();
          if (action && onUndo) {
            onUndo(action);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, popAction]);

  // Callback to handle undo action
  const [onUndo, setOnUndoState] = useState<((action: UndoAction) => void) | null>(null);
  
  // Stable reference for setOnUndo to prevent infinite loops
  const setOnUndo = useCallback((callback: (action: UndoAction) => void) => {
    setOnUndoState(() => callback);
  }, []);

  return {
    pushAction,
    popAction,
    clearStack,
    undoStack,
    canUndo: undoStack.length > 0,
    showUndoToast,
    lastAction,
    setOnUndo,
  };
}
