import { useQuery } from "@tanstack/react-query";
import { type FieldCategoryWithOptions } from "@shared/schema";

export function useTaskStatusOptions() {
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const taskStatusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];
  
  // Create lookup maps for easy access
  const statusMap = statusOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof statusOptions[0]>);
  
  // Fallback status data for loading/missing states
  const defaultStatuses = {
    "todo": { key: "todo", name: "To Do", color: "#6B7280" },
    "in-progress": { key: "in-progress", name: "In Progress", color: "#F59E0B" },
    "done": { key: "done", name: "Done", color: "#10B981" }
  };
  
  const getStatusInfo = (statusKey: string) => {
    return statusMap[statusKey] || defaultStatuses[statusKey as keyof typeof defaultStatuses] || {
      key: statusKey,
      name: statusKey.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase()),
      color: "#6B7280"
    };
  };
  
  return {
    statusOptions,
    statusMap,
    getStatusInfo,
    isLoading: fieldCategories.length === 0
  };
}