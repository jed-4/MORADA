import { createContext, useContext } from "react";
import type { Schedule, Contact, ScheduleItem } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";

interface ScheduleFilters {
  status: string;
  assignee: string;
  type: string;
  dateRange: string;
}

interface ScheduleViewContextType {
  schedule: Schedule | undefined;
  activeView: "list" | "gantt" | "calendar";
  setActiveView: (view: "list" | "gantt" | "calendar") => void;
  filters: ScheduleFilters;
  setFilters: (filters: ScheduleFilters) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  contacts: Contact[];
  updateStatusMutation: UseMutationResult<void, Error, "offline" | "online" | "locked", unknown>;
  updateItemStatusMutation: UseMutationResult<ScheduleItem, Error, { itemId: string; status: string }, unknown>;
  setShowItemDialog: (show: boolean) => void;
  setEditingItem: (item: ScheduleItem | null) => void;
  setPendingAutoLink?: (link: { successorId?: string; predecessorId?: string; insertAfterItemId?: string; lag?: number } | null) => void;
  insertAfterItemRef?: React.MutableRefObject<((newItemId: string, afterItemId: string) => void) | null>;
  scrollToTodayRef?: React.MutableRefObject<(() => void) | null>;
}

const ScheduleViewContext = createContext<ScheduleViewContextType | undefined>(undefined);

export function useScheduleView() {
  const context = useContext(ScheduleViewContext);
  if (!context) {
    throw new Error("useScheduleView must be used within ScheduleViewProvider");
  }
  return context;
}

export const ScheduleViewProvider = ScheduleViewContext.Provider;

// Assignee filter values are either "all", a contact id, or "company:<companyId>"
// for the business itself (the same convention ContactSelect uses when assigning).
export const BUSINESS_ASSIGNEE_PREFIX = "company:";

/**
 * Shared by the list and Gantt views so the two can't drift apart again.
 *
 * Business-assigned items are stored with assignedToId = null and assignedToName
 * set to the company nickname — see the `company:` branch of the PATCH handler for
 * /api/schedule-items/:id. Some older rows still carry the raw "company:<uuid>" in
 * assignedToId. Because the cached nickname goes stale when the business is renamed,
 * match on the *shape* of a business assignment rather than on the stored name.
 */
export function matchesAssigneeFilter(
  item: Pick<ScheduleItem, "assignedToId" | "assignedToName">,
  assignee: string,
): boolean {
  if (!assignee || assignee === "all") return true;

  if (assignee.startsWith(BUSINESS_ASSIGNEE_PREFIX)) {
    const noContact = !item.assignedToId || item.assignedToId.startsWith(BUSINESS_ASSIGNEE_PREFIX);
    return noContact && !!item.assignedToName;
  }

  return item.assignedToId === assignee;
}
