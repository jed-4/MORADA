import { useQuery } from "@tanstack/react-query";
import { type FieldCategoryWithOptions } from "@shared/schema";

export function useTaskPriorityOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const taskPriorityCategory = fieldCategories.find(cat => cat.key === "task.priority");
  const priorityOptions = taskPriorityCategory?.options || [];
  
  // Create lookup maps for easy access
  const priorityMap = priorityOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof priorityOptions[0]>);
  
  // Fallback priority data for loading/missing states
  const defaultPriorities = {
    "low": { key: "low", name: "Low", color: "#10B981" },
    "medium": { key: "medium", name: "Medium", color: "#F59E0B" },
    "high": { key: "high", name: "High", color: "#EF4444" }
  };
  
  const getPriorityInfo = (priorityKey: string) => {
    return priorityMap[priorityKey] || defaultPriorities[priorityKey as keyof typeof defaultPriorities] || {
      key: priorityKey,
      name: priorityKey.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase()),
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
