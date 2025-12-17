import { useState, useEffect, useCallback, useMemo } from "react";

interface MobileWidgetState {
  order: string[];
  expandedIds: string[];
}

function getStorageKey(userId: string | undefined, mode: "personal" | "business"): string {
  return `${userId || "anon"}-${mode}-mobile-widgets`;
}

function loadState(key: string): MobileWidgetState {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        order: parsed.order || [],
        expandedIds: parsed.expandedIds || [],
      };
    }
  } catch (e) {
    console.error("Failed to load mobile widget state:", e);
  }
  return {
    order: [],
    expandedIds: [],
  };
}

function saveState(key: string, state: MobileWidgetState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save mobile widget state:", e);
  }
}

function reconcileOrder(storedOrder: string[], availableWidgets: string[]): string[] {
  const validOrder = storedOrder.filter(id => availableWidgets.includes(id));
  const missingWidgets = availableWidgets.filter(id => !storedOrder.includes(id));
  return [...validOrder, ...missingWidgets];
}

function reconcileExpanded(storedExpanded: string[], availableWidgets: string[], defaultExpanded?: string): string[] {
  const valid = storedExpanded.filter(id => availableWidgets.includes(id));
  if (valid.length === 0 && defaultExpanded && availableWidgets.includes(defaultExpanded)) {
    return [defaultExpanded];
  }
  return valid;
}

export function useMobileWidgetState(
  userId: string | undefined, 
  mode: "personal" | "business",
  availableWidgetIds: string[]
) {
  const storageKey = getStorageKey(userId, mode);
  const availableKey = availableWidgetIds.join(",");
  const defaultExpanded = availableWidgetIds[0];
  
  const [rawState, setRawState] = useState<MobileWidgetState>(() => 
    loadState(storageKey)
  );

  useEffect(() => {
    setRawState(loadState(storageKey));
  }, [storageKey]);

  const state = useMemo(() => ({
    order: reconcileOrder(rawState.order, availableWidgetIds),
    expandedIds: reconcileExpanded(rawState.expandedIds, availableWidgetIds, defaultExpanded),
  }), [rawState, availableKey, defaultExpanded]);

  useEffect(() => {
    if (state.order.length > 0) {
      saveState(storageKey, state);
    }
  }, [storageKey, state]);

  const toggleExpanded = useCallback((widgetId: string) => {
    if (!availableWidgetIds.includes(widgetId)) return;
    
    setRawState(prev => {
      const reconciledExpanded = reconcileExpanded(prev.expandedIds, availableWidgetIds, defaultExpanded);
      const isExpanded = reconciledExpanded.includes(widgetId);
      return {
        order: reconcileOrder(prev.order, availableWidgetIds),
        expandedIds: isExpanded
          ? reconciledExpanded.filter(id => id !== widgetId)
          : [...reconciledExpanded, widgetId],
      };
    });
  }, [availableKey, defaultExpanded]);

  const setOrder = useCallback((newOrder: string[]) => {
    const sanitizedOrder = reconcileOrder(newOrder, availableWidgetIds);
    setRawState(prev => ({
      order: sanitizedOrder,
      expandedIds: reconcileExpanded(prev.expandedIds, availableWidgetIds, defaultExpanded),
    }));
  }, [availableKey, defaultExpanded]);

  const collapseAll = useCallback(() => {
    setRawState(prev => ({
      order: reconcileOrder(prev.order, availableWidgetIds),
      expandedIds: [],
    }));
  }, [availableKey]);

  const expandAll = useCallback(() => {
    setRawState(prev => ({
      order: reconcileOrder(prev.order, availableWidgetIds),
      expandedIds: [...availableWidgetIds],
    }));
  }, [availableKey]);

  const isExpanded = useCallback((widgetId: string) => {
    return state.expandedIds.includes(widgetId);
  }, [state.expandedIds]);

  return {
    order: state.order,
    expandedIds: state.expandedIds,
    toggleExpanded,
    setOrder,
    collapseAll,
    expandAll,
    isExpanded,
  };
}
