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
    bgClass: "bg-gray-100",
    textClass: "text-gray-600"
  },
  pending: {
    key: "pending",
    name: "Open",
    color: "#3B82F6",
    icon: Eye,
    description: "Selection is open for client to view and choose",
    bgClass: "bg-blue-100",
    textClass: "text-blue-600"
  },
  approved: {
    key: "approved",
    name: "Approved",
    color: "#10B981",
    icon: CheckCircle2,
    description: "Client has approved their selection",
    bgClass: "bg-green-100",
    textClass: "text-green-600"
  },
  completed: {
    key: "completed",
    name: "Completed",
    color: "#8B5CF6",
    icon: LockKeyhole,
    description: "Selection is complete and finalized",
    bgClass: "bg-purple-100",
    textClass: "text-purple-600"
  }
};

export function useSelectionStatusOptions() {
  const statusOptions: SelectionStatusOption[] = Object.values(defaultStatuses);
  
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
    defaultStatuses
  };
}
