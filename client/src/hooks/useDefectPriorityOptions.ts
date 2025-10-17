import { useQuery } from "@tanstack/react-query";
import type { FieldCategoryWithOptions } from "@shared/schema";

export function useDefectPriorityOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const defectPriorityCategory = fieldCategories.find(cat => cat.key === "defect.priority");
  const priorityOptions = defectPriorityCategory?.options || [];
  
  // Create lookup maps for easy access
  const priorityMap = priorityOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof priorityOptions[0]>);
  
  // Fallback priority data for loading/missing states
  const defaultPriorities = {
    "critical": { key: "critical", name: "Critical", color: "#DC2626" },
    "high": { key: "high", name: "High", color: "#EF4444" },
    "medium": { key: "medium", name: "Medium", color: "#F59E0B" },
    "low": { key: "low", name: "Low", color: "#10B981" }
  };
  
  const getPriorityInfo = (priorityKey: string) => {
    return priorityMap[priorityKey] || defaultPriorities[priorityKey as keyof typeof defaultPriorities] || {
      key: priorityKey,
      name: priorityKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()),
      color: "#6B7280"
    };
  };
  
  return {
    priorityOptions,
    priorityMap,
    getPriorityInfo,
    isLoading,
    isError,
    hasLoadedButNoOptions: !isLoading && !isError && priorityOptions.length === 0
  };
}
