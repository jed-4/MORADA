import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, isAfter, isBefore, addDays } from "date-fns";
import type { WidgetProps } from "@/types/widgets";
import type { Task, Bill, Reminder } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, DollarSign, Bell, CheckCircle } from "lucide-react";

export default function BusinessAlertsWidget({ widget }: WidgetProps) {
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders"],
  });

  const now = new Date();
  const upcomingThreshold = addDays(now, 7);

  const overdueTasks = tasks.filter(t => 
    t.status !== "done" && 
    t.dueDate && 
    isBefore(new Date(t.dueDate), now)
  );

  const urgentTasks = tasks.filter(t =>
    t.status !== "done" &&
    t.dueDate &&
    isAfter(new Date(t.dueDate), now) &&
    isBefore(new Date(t.dueDate), upcomingThreshold) &&
    t.priority === "high"
  );

  const pendingBillsCount = bills.filter(b => b.status === "pending").length;

  const upcomingReminders = reminders.filter(r =>
    !r.completed &&
    r.reminderDate &&
    isAfter(new Date(r.reminderDate), now) &&
    isBefore(new Date(r.reminderDate), upcomingThreshold)
  );

  const alerts = [
    ...overdueTasks.map(task => ({
      id: `task-${task.id}`,
      type: "overdue" as const,
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      title: task.title,
      description: `Overdue ${formatDistanceToNow(new Date(task.dueDate!), { addSuffix: false })}`,
    })),
    ...urgentTasks.map(task => ({
      id: `urgent-${task.id}`,
      type: "urgent" as const,
      icon: Clock,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      title: task.title,
      description: `Due ${formatDistanceToNow(new Date(task.dueDate!), { addSuffix: true })}`,
    })),
    ...upcomingReminders.map(reminder => ({
      id: `reminder-${reminder.id}`,
      type: "reminder" as const,
      icon: Bell,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      title: reminder.title,
      description: formatDistanceToNow(new Date(reminder.reminderDate!), { addSuffix: true }),
    })),
  ].slice(0, 10);

  if (alerts.length === 0 && pendingBillsCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm" data-testid="business-alerts-widget">
        <CheckCircle className="h-8 w-8 mb-2 text-green-500 opacity-50" />
        <p>All caught up!</p>
        <p className="text-xs">No alerts or overdue items</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="business-alerts-widget">
      {pendingBillsCount > 0 && (
        <div className="flex items-center gap-3 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <DollarSign className="h-4 w-4 text-yellow-500" />
          <div className="flex-1">
            <p className="text-sm font-medium">{pendingBillsCount} Pending Bills</p>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </div>
          <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-[10px]">
            Action Required
          </Badge>
        </div>
      )}

      <ScrollArea className="h-[200px]">
        <div className="space-y-2 pr-4">
          {alerts.map((alert) => (
            <div key={alert.id} className={`flex items-start gap-2 p-2 rounded-md ${alert.bgColor}`}>
              <alert.icon className={`h-4 w-4 mt-0.5 ${alert.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
