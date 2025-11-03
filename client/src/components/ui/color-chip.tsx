import { cn } from "@/lib/utils";

export interface ColorChipProps {
  type: "status" | "priority" | "role";
  value: string;
  className?: string;
}

const statusColors: Record<string, string> = {
  todo: "casva-chip-status-todo",
  "in progress": "casva-chip-status-in-progress",
  "in-progress": "casva-chip-status-in-progress",
  done: "casva-chip-status-done",
  completed: "casva-chip-status-done",
  blocked: "casva-chip-status-blocked",
  cancelled: "casva-chip-status-blocked",
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

export function ColorChip({ type, value, className }: ColorChipProps) {
  const normalizedValue = value?.toLowerCase() || "";
  
  let colorClass = "";
  if (type === "status") {
    colorClass = statusColors[normalizedValue] || "casva-chip-status-todo";
  } else if (type === "priority") {
    colorClass = priorityColors[normalizedValue] || "casva-chip-priority-medium";
  } else if (type === "role") {
    colorClass = roleColors[normalizedValue] || "bg-gray-100 text-gray-600";
  }

  return (
    <span className={cn("casva-chip", colorClass, className)} data-testid={`chip-${type}-${normalizedValue}`}>
      {value}
    </span>
  );
}
