import { useQuery } from "@tanstack/react-query";
import { type FieldCategoryWithOptions } from "@shared/schema";
import { FileEdit, Eye, CheckCircle2, LockKeyhole, LucideIcon } from "lucide-react";

export interface SelectionStatusOption {
  key: string;
  name: string;
  color: string;
  icon: LucideIcon;
  description: string;
  bgClass: string;
  textClass: string;
}

const defaultStatuses: Record<string, SelectionStatusOption> = {
  draft: {
    key: "draft",
    name: "Draft",
    color: "#6B7280",
    icon: FileEdit,
    description: "Selection is being prepared, not visible to clients",
    bgClass: "bg-gray-100 dark:bg-gray-800",
    textClass: "text-gray-600 dark:text-gray-300"
  },
  pending: {
    key: "pending",
    name: "Open",
    color: "#3B82F6",
    icon: Eye,
    description: "Selection is open for client to view and choose",
    bgClass: "bg-blue-100 dark:bg-blue-900/30",
    textClass: "text-blue-600 dark:text-blue-400"
  },
  approved: {
    key: "approved",
    name: "Approved",
    color: "#10B981",
    icon: CheckCircle2,
    description: "Client has approved their selection",
    bgClass: "bg-green-100 dark:bg-green-900/30",
    textClass: "text-green-600 dark:text-green-400"
  },
  completed: {
    key: "completed",
    name: "Completed",
    color: "#8B5CF6",
    icon: LockKeyhole,
    description: "Selection is complete and finalized",
    bgClass: "bg-purple-100 dark:bg-purple-900/30",
    textClass: "text-purple-600 dark:text-purple-400"
  }
};

export function useSelectionStatusOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const statusCategory = fieldCategories.find(cat => cat.key === "selection.status");
  const apiStatusOptions = statusCategory?.options || [];
  
  const statusOptions: SelectionStatusOption[] = Object.keys(defaultStatuses).map(key => {
    const apiOption = apiStatusOptions.find(opt => opt.key === key);
    const defaults = defaultStatuses[key];
    return {
      ...defaults,
      name: apiOption?.name || defaults.name,
      color: apiOption?.color || defaults.color,
    };
  });
  
  const statusMap = statusOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, SelectionStatusOption>);
  
  const getStatusInfo = (statusKey: string): SelectionStatusOption => {
    return statusMap[statusKey] || defaultStatuses.draft;
  };
  
  const getStatusLabel = (statusKey: string): string => {
    return getStatusInfo(statusKey).name;
  };
  
  const getStatusColorClass = (statusKey: string): string => {
    const info = getStatusInfo(statusKey);
    return `${info.bgClass} ${info.textClass}`;
  };
  
  return {
    statusOptions,
    statusMap,
    getStatusInfo,
    getStatusLabel,
    getStatusColorClass,
    isLoading,
    isError,
    defaultStatuses
  };
}
