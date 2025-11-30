import { useQuery } from "@tanstack/react-query";
import { FieldCategoryWithOptions } from "@shared/schema";

export function useRfqStatusOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const rfqStatusCategory = fieldCategories.find(cat => cat.key === "rfq.status");
  const statusOptions = rfqStatusCategory?.options || [];
  
  const statusMap = statusOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof statusOptions[0]>);
  
  const defaultStatuses = {
    "draft": { key: "draft", name: "Draft", color: "#6B7280" },
    "sent": { key: "sent", name: "Sent", color: "#3B82F6" },
    "received": { key: "received", name: "Quotes Received", color: "#F59E0B" },
    "awarded": { key: "awarded", name: "Awarded", color: "#10B981" },
    "closed": { key: "closed", name: "Closed", color: "#8B5CF6" },
    "cancelled": { key: "cancelled", name: "Cancelled", color: "#EF4444" }
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
