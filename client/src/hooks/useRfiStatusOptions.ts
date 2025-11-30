import { useQuery } from "@tanstack/react-query";
import { FieldCategoryWithOptions } from "@shared/schema";

export function useRfiStatusOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const rfiStatusCategory = fieldCategories.find(cat => cat.key === "rfi.status");
  const statusOptions = rfiStatusCategory?.options || [];
  
  const statusMap = statusOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof statusOptions[0]>);
  
  const defaultStatuses = {
    "draft": { key: "draft", name: "Draft", color: "#6B7280" },
    "sent": { key: "sent", name: "Sent", color: "#3B82F6" },
    "pending": { key: "pending", name: "Pending Response", color: "#F59E0B" },
    "answered": { key: "answered", name: "Answered", color: "#10B981" },
    "closed": { key: "closed", name: "Closed", color: "#8B5CF6" }
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
    isLoading,
    isError,
    hasLoadedButNoOptions: !isLoading && !isError && statusOptions.length === 0
  };
}
