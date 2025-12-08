import { 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  FileWarning,
  ShieldAlert,
  Calendar,
  CheckCircle
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface Alert {
  id: string;
  type: "warning" | "error" | "info";
  category: string;
  message: string;
  icon: typeof AlertTriangle;
}

export default function AlertsWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading: metricsLoading, formatCurrency } = useProjectMetrics();

  // Fetch tasks to check for overdue
  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", currentProject?.id, "tasks"],
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/tasks?projectId=${currentProject.id}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentProject,
  });

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view alerts
      </div>
    );
  }

  if (metricsLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-muted rounded"></div>
        ))}
      </div>
    );
  }

  // Generate alerts based on metrics and data
  const alerts: Alert[] = [];

  // Overdue bills alert
  if (metrics.overdueBills > 0) {
    alerts.push({
      id: "overdue-bills",
      type: "error",
      category: "Bills",
      message: `${metrics.overdueBills} overdue bill${metrics.overdueBills > 1 ? 's' : ''} require attention`,
      icon: Clock,
    });
  }

  // Overdue invoices alert
  if (metrics.overdueInvoices > 0) {
    alerts.push({
      id: "overdue-invoices",
      type: "warning",
      category: "Invoices",
      message: `${metrics.overdueInvoices} invoice${metrics.overdueInvoices > 1 ? 's' : ''} past due date`,
      icon: FileWarning,
    });
  }

  // Budget warning (if actual costs exceed 90% of budget)
  const budgetUsedPercent = metrics.totalProjectCosts > 0 
    ? (metrics.actualCosts / metrics.totalProjectCosts) * 100 
    : 0;
  if (budgetUsedPercent > 90) {
    alerts.push({
      id: "budget-warning",
      type: budgetUsedPercent > 100 ? "error" : "warning",
      category: "Budget",
      message: budgetUsedPercent > 100 
        ? `Over budget by ${formatCurrency(metrics.actualCosts - metrics.totalProjectCosts)}`
        : `${budgetUsedPercent.toFixed(0)}% of budget used`,
      icon: DollarSign,
    });
  }

  // WIP alert (underbilling or overbilling)
  if (Math.abs(metrics.wip) > metrics.revisedContractPrice * 0.1) {
    alerts.push({
      id: "wip-alert",
      type: "warning",
      category: "WIP",
      message: metrics.wip > 0 
        ? `Underbilled by ${formatCurrency(metrics.wip)}`
        : `Overbilled by ${formatCurrency(Math.abs(metrics.wip))}`,
      icon: AlertTriangle,
    });
  }

  // Pending variations
  if (metrics.pendingVariations > 0) {
    alerts.push({
      id: "pending-variations",
      type: "info",
      category: "Variations",
      message: `${metrics.pendingVariations} variation${metrics.pendingVariations > 1 ? 's' : ''} awaiting approval`,
      icon: FileWarning,
    });
  }

  // Overdue tasks
  const now = new Date();
  const overdueTasks = tasks.filter((t: any) => {
    if (t.status === 'completed') return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < now;
  });
  if (overdueTasks.length > 0) {
    alerts.push({
      id: "overdue-tasks",
      type: "warning",
      category: "Tasks",
      message: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`,
      icon: Calendar,
    });
  }

  const getAlertStyle = (type: Alert["type"]) => {
    switch (type) {
      case "error":
        return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300";
      case "info":
        return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300";
    }
  };

  const getIconStyle = (type: Alert["type"]) => {
    switch (type) {
      case "error":
        return "text-red-500";
      case "warning":
        return "text-amber-500";
      case "info":
        return "text-blue-500";
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
        <p className="text-sm font-medium text-green-700 dark:text-green-300">All Clear</p>
        <p className="text-xs text-muted-foreground">No alerts at this time</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => (
        <div 
          key={alert.id}
          className={`flex items-start gap-2 p-2.5 rounded-md border ${getAlertStyle(alert.type)}`}
          data-testid={`alert-${alert.id}`}
        >
          <alert.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${getIconStyle(alert.type)}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                {alert.category}
              </Badge>
            </div>
            <p className="text-xs mt-0.5">{alert.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
