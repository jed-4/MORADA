import { useQuery } from "@tanstack/react-query";
import { type FieldCategoryWithOptions } from "@shared/schema";

export function useAllowanceStatusOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const allowanceStatusCategory = fieldCategories.find(cat => cat.key === "allowance.status");
  const statusOptions = allowanceStatusCategory?.options || [];
  
  // Create lookup maps for easy access
  const statusMap = statusOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof statusOptions[0]>);
  
  // Fallback status data for loading/missing states
  const defaultStatuses = {
    "pending": { key: "pending", name: "Pending", color: "#F59E0B" },
    "in_progress": { key: "in_progress", name: "In Progress", color: "#3B82F6" },
    "finalized": { key: "finalized", name: "Finalized", color: "#10B981" }
  };
  
  const getStatusInfo = (statusKey: string) => {
    return statusMap[statusKey] || defaultStatuses[statusKey as keyof typeof defaultStatuses] || {
      key: statusKey,
      name: statusKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()),
      color: "#6B7280"
    };
  };
  
  // Get color class for badge
  const getStatusColorClass = (statusKey: string) => {
    const info = getStatusInfo(statusKey);
    const color = info.color;
    
    // For light mode, create light background with dark text
    // For dark mode, create dark background with light text
    // Using the hex color from field options
    return `bg-[${color}]/10 text-[${color}] dark:bg-[${color}]/20`;
  };
  
  return {
    statusOptions,
    statusMap,
    getStatusInfo,
    getStatusColorClass,
    isLoading,
    isError,
    hasLoadedButNoOptions: !isLoading && !isError && statusOptions.length === 0
  };
}
