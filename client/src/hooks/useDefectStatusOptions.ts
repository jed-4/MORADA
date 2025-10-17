import { useQuery } from "@tanstack/react-query";
import type { FieldCategoryWithOptions } from "@shared/schema";

export function useDefectStatusOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const defectStatusCategory = fieldCategories.find(cat => cat.key === "defect.status");
  const statusOptions = defectStatusCategory?.options || [];
  
  // Create lookup maps for easy access
  const statusMap = statusOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof statusOptions[0]>);
  
  // Fallback status data for loading/missing states
  const defaultStatuses = {
    "open": { key: "open", name: "Open", color: "#EF4444" },
    "in_progress": { key: "in_progress", name: "In Progress", color: "#F59E0B" },
    "resolved": { key: "resolved", name: "Resolved", color: "#10B981" },
    "closed": { key: "closed", name: "Closed", color: "#6B7280" }
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
