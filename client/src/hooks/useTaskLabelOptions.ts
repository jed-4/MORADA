import { useQuery } from "@tanstack/react-query";
import { type FieldCategoryWithOptions } from "@shared/schema";

export function useTaskLabelOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const taskLabelCategory = fieldCategories.find(cat => cat.key === "task.labels");
  const labelOptions = taskLabelCategory?.options || [];
  
  // Create lookup maps for easy access
  const labelMap = labelOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof labelOptions[0]>);
  
  // Fallback label data for loading/missing states
  const defaultLabels = {
    "bug": { key: "bug", name: "Bug", color: "#EF4444" },
    "feature": { key: "feature", name: "Feature", color: "#3B82F6" },
    "urgent": { key: "urgent", name: "Urgent", color: "#DC2626" },
    "review": { key: "review", name: "Review", color: "#F59E0B" },
    "documentation": { key: "documentation", name: "Documentation", color: "#8B5CF6" },
    "client-request": { key: "client-request", name: "Client Request", color: "#10B981" }
  };
  
  const getLabelInfo = (labelKey: string) => {
    return labelMap[labelKey] || defaultLabels[labelKey as keyof typeof defaultLabels] || {
      key: labelKey,
      name: labelKey.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase()),
      color: "#6B7280"
    };
  };
  
  return {
    labelOptions,
    labelMap,
    getLabelInfo,
    isLoading,
    isError,
    hasLoadedButNoOptions: !isLoading && !isError && labelOptions.length === 0
  };
}