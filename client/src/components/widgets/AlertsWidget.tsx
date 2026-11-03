import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";

interface Alert {
  id: string;
  type: "warning" | "error" | "info";
  category: string;
  message: string;
  icon: typeof AlertTriangle;
}

export default function AlertsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const [editingTitle, setEditingTitle] = useState(widget.title);
  
  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);
  const { metrics, isLoading: metricsLoading, isError: metricsError, formatCurrency } = useProjectMetrics();

  // Fetch tasks to check for overdue. Keyed under ["/api/tasks"] so the
  // app-wide task-mutation invalidations refresh this widget too.
  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useQuery<any[]>({
    queryKey: ["/api/tasks", currentProject?.id],
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/tasks?projectId=${currentProject.id}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load tasks (${response.status})`);
      return response.json();
    },
    enabled: !!currentProject,
  });

  // POs, for the stale-commitment check. Optional: someone who can't see POs
  // just doesn't get that alert, rather than an error.
  const { data: purchaseOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-orders", { projectId: currentProject?.id }],
    queryFn: async () => {
      const response = await fetch(`/api/purchase-orders?projectId=${currentProject!.id}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentProject,
    retry: false,
  });

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view alerts
      </div>
    );
  }

  // Configuration mode (before loading so the panel can open any time)
  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ ...widget, title: editingTitle });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      onCloseConfig?.();
    };

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="alerts-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-7 px-3 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (metricsLoading || tasksLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-muted rounded"></div>
        ))}
      </div>
    );
  }

  if (metricsError || tasksError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        Couldn't check for alerts
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => refetchTasks()}>
          Retry
        </Button>
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

  // A PO still Sent or Accepted 60+ days on, with no bill against it, is
  // usually a bill that never got matched to it rather than money still to
  // come — and until it's sorted it sits in Committed forever.
  const now = new Date();
  const STALE_PO_DAYS = 60;
  const stalePOs = purchaseOrders.filter((po: any) => {
    if (po.status !== "sent" && po.status !== "accepted") return false;
    const since = po.sentAt || po.poDate || po.createdAt;
    if (!since) return false;
    return now.getTime() - new Date(since).getTime() > STALE_PO_DAYS * 24 * 60 * 60 * 1000;
  });
  if (stalePOs.length > 0) {
    alerts.push({
      id: "stale-pos",
      type: "warning",
      category: "Purchase Orders",
      message:
        stalePOs.length === 1
          ? `${stalePOs[0].poNumber} sent over ${STALE_PO_DAYS} days ago with no bill. Match its bill, or cancel it`
          : `${stalePOs.length} POs sent over ${STALE_PO_DAYS} days ago with no bill. Match their bills, or cancel them`,
      icon: FileWarning,
    });
  }

  // Overdue tasks
  const overdueTasks = tasks.filter((t: any) => {
    // Task statuses are "todo" | "in-progress" | "done"
    if (t.status === 'done' || t.status === 'complete' || t.status === 'completed') return false;
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return due < today;
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

  // Morada wash tones per alert severity
  const alertTone = (type: Alert["type"]): { bg: string; text: string; icon: string } => {
    switch (type) {
      case "error":
        return { bg: "hsl(var(--coral-light))", text: "hsl(11 52% 38%)", icon: "hsl(var(--coral))" };
      case "warning":
        return { bg: "hsl(var(--amber-light))", text: "hsl(42 45% 30%)", icon: "hsl(var(--amber))" };
      case "info":
        return { bg: "hsl(var(--primary-light))", text: "hsl(261 25% 45%)", icon: "hsl(var(--primary))" };
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <CheckCircle className="h-8 w-8 mb-2" style={{ color: "hsl(var(--sage))" }} />
        <p className="text-sm font-medium">All clear</p>
        <p className="text-xs text-muted-foreground">No alerts at this time</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => {
        const tone = alertTone(alert.type);
        return (
          <div
            key={alert.id}
            className="flex items-start gap-2 p-2.5 rounded-md"
            style={{ backgroundColor: tone.bg, color: tone.text }}
            data-testid={`alert-${alert.id}`}
          >
            <alert.icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: tone.icon }} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{alert.category}</p>
              <p className="text-xs mt-0.5">{alert.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
