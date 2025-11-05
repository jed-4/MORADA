import { useQuery } from "@tanstack/react-query";
import { type FieldCategoryWithOptions } from "@shared/schema";

export function useScheduleItemStatusOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const scheduleItemStatusCategory = fieldCategories.find(cat => cat.key === "schedule_item.status");
  const statusOptions = scheduleItemStatusCategory?.options || [];
  
  // Create lookup maps for easy access
  const statusMap = statusOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof statusOptions[0]>);
  
  // Fallback status data for loading/missing states
  const defaultStatuses = {
    "not_started": { key: "not_started", name: "Not Started", color: "#6B7280" },
    "in_progress": { key: "in_progress", name: "In Progress", color: "#F59E0B" },
    "completed": { key: "completed", name: "Completed", color: "#10B981" },
    "on_hold": { key: "on_hold", name: "On Hold", color: "#EF4444" }
  };
  
  const getStatusInfo = (statusKey: string) => {
    return statusMap[statusKey] || defaultStatuses[statusKey as keyof typeof defaultStatuses] || {
      key: statusKey,
      name: statusKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()),
      color: "#6B7280"
    };
  };
  
  return {
    statusOptions,
    statusMap,
    getStatusInfo,
    isLoading,
    isError,
    hasLoadedButNoOptions: !isLoading && !isError && statusOptions.length === 0
  };
}
