import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { FieldCategoryWithOptions } from "@shared/schema";

export interface ColorChipProps {
  type: "status" | "priority" | "role";
  value: string;
  className?: string;
  fieldCategoryKey?: string;
}

const statusColors: Record<string, string> = {
  todo: "casva-chip-status-todo",
  not_started: "casva-chip-status-todo",
  "in progress": "casva-chip-status-in-progress",
  "in-progress": "casva-chip-status-in-progress",
  in_progress: "casva-chip-status-in-progress",
  done: "casva-chip-status-done",
  completed: "casva-chip-status-done",
  blocked: "casva-chip-status-blocked",
  cancelled: "casva-chip-status-blocked",
  "on-hold": "casva-chip-status-blocked",
  on_hold: "casva-chip-status-blocked",
};

const priorityColors: Record<string, string> = {
  low: "casva-chip-priority-low",
  medium: "casva-chip-priority-medium",
  high: "casva-chip-priority-high",
  critical: "casva-chip-priority-critical",
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-indigo-100 text-indigo-700",
  member: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-600",
};

export function ColorChip({ type, value, className, fieldCategoryKey }: ColorChipProps) {
  const normalizedValue = value?.toLowerCase() || "";
  
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  let displayLabel = value;
  let colorClass = "";
  
  if (type === "status") {
    const categoryKey = fieldCategoryKey ?? "task.status";
    const statusCategory = fieldCategories.find(cat => cat.key === categoryKey);
    const statusOption = statusCategory?.options?.find(opt => opt.key === value);
    displayLabel = statusOption?.name || value;
    colorClass = statusColors[normalizedValue] || "casva-chip-status-todo";
  } else if (type === "priority") {
    const taskPriorityCategory = fieldCategories.find(cat => cat.key === "task.priority");
    const priorityOption = taskPriorityCategory?.options?.find(opt => opt.key === value);
    displayLabel = priorityOption?.name || value;
    colorClass = priorityColors[normalizedValue] || "casva-chip-priority-medium";
  } else if (type === "role") {
    colorClass = roleColors[normalizedValue] || "bg-gray-100 text-gray-600";
  }

  return (
    <span className={cn("casva-chip", colorClass, className)} data-testid={`chip-${type}-${normalizedValue}`}>
      {displayLabel}
    </span>
  );
}
