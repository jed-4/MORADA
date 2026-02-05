import { useQuery } from "@tanstack/react-query";
import { type FieldCategoryWithOptions } from "@shared/schema";

export function useTimesheetLabelOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const timesheetLabelCategory = fieldCategories.find(cat => cat.key === "timesheet.label");
  const labelOptions = timesheetLabelCategory?.options || [];
  
  const labelMap = labelOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof labelOptions[0]>);
  
  const defaultLabels = {
    "regular": { key: "regular", name: "Regular Hours", color: "#3B82F6" },
    "overtime": { key: "overtime", name: "Overtime", color: "#F59E0B" },
    "travel": { key: "travel", name: "Travel Time", color: "#8B5CF6" },
    "meeting": { key: "meeting", name: "Meeting", color: "#06B6D4" },
    "training": { key: "training", name: "Training", color: "#10B981" },
    "site-visit": { key: "site-visit", name: "Site Visit", color: "#EC4899" },
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
