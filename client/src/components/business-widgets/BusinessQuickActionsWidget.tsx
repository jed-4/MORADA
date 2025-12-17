import { useLocation } from "wouter";
import type { WidgetProps } from "@/types/widgets";
import { DollarSign, Clock, Calendar, FileText, Users, Building2 } from "lucide-react";

export default function BusinessQuickActionsWidget({ widget }: WidgetProps) {
  const [, navigate] = useLocation();

  const actions = [
    {
      icon: DollarSign,
      label: "Submit Expense",
      path: "/business/expenses",
      color: "text-green-500",
    },
    {
      icon: Clock,
      label: "Log Time",
      path: "/business/timesheets",
      color: "text-blue-500",
    },
    {
      icon: Calendar,
      label: "Request Leave",
      path: "/business/leave",
      color: "text-purple-500",
    },
    {
      icon: FileText,
      label: "View Reports",
      path: "/business/reports",
      color: "text-orange-500",
    },
    {
      icon: Users,
      label: "Team",
      path: "/business/team",
      color: "text-cyan-500",
    },
    {
      icon: Building2,
      label: "Projects",
      path: "/projects",
      color: "text-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2" data-testid="business-quick-actions-widget">
      {actions.map((action, index) => (
        <div
          key={index}
          className="flex flex-col items-center justify-center p-3 rounded-md border hover-elevate cursor-pointer"
          onClick={() => navigate(action.path)}
          data-testid={`quick-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <action.icon className={`h-5 w-5 ${action.color} mb-1.5`} />
          <span className="text-xs text-center">{action.label}</span>
        </div>
      ))}
    </div>
  );
}
