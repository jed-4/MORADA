import { useQuery } from "@tanstack/react-query";
import { DollarSign, Users, Building2, TrendingUp, Clock, FileText } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import type { Project, User, Bill, Timesheet } from "@shared/schema";
import KPICard from "@/components/KPICard";

export default function BusinessKPIsWidget({ widget }: WidgetProps) {
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const { data: timesheets = [], isLoading: timesheetsLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const isLoading = projectsLoading || usersLoading || billsLoading || timesheetsLoading;

  const activeProjects = projects.filter(p => p.status === "active");
  const activeUsers = users.filter(u => u.status !== "inactive");
  
  const totalBilled = bills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);
  const pendingBills = bills.filter(b => b.status === "pending");
  const pendingAmount = pendingBills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

  const totalHours = timesheets
    .filter(t => t.status === "approved")
    .reduce((sum, t) => sum + (Number(t.hours) || 0), 0);

  const formatCurrency = (value: number) => {
    if (isNaN(value) || value === null || value === undefined) return "$0";
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="business-kpis-widget">
      <KPICard
        title="Active Projects"
        value={activeProjects.length.toString()}
        change={projects.length > 0 ? { value: `${projects.length} total`, direction: "neutral" as const } : undefined}
        icon={<Building2 className="h-4 w-4" />}
      />
      <KPICard
        title="Team Members"
        value={activeUsers.length.toString()}
        icon={<Users className="h-4 w-4" />}
      />
      <KPICard
        title="Total Billed"
        value={formatCurrency(totalBilled)}
        icon={<DollarSign className="h-4 w-4" />}
      />
      <KPICard
        title="Pending Bills"
        value={formatCurrency(pendingAmount)}
        change={{ value: `${pendingBills.length} pending`, direction: "neutral" as const }}
        icon={<FileText className="h-4 w-4" />}
      />
      <KPICard
        title="Hours Logged"
        value={`${totalHours.toFixed(0)}h`}
        icon={<Clock className="h-4 w-4" />}
      />
      <KPICard
        title="Project Health"
        value={activeProjects.length > 0 ? "Good" : "N/A"}
        icon={<TrendingUp className="h-4 w-4" />}
      />
    </div>
  );
}
