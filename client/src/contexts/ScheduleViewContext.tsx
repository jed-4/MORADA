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
