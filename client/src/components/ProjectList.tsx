import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { type Project } from "@shared/schema";
import { useLocation } from "wouter";
import { ProjectIcon } from "./ProjectIcon";

interface ProjectListProps {
  projects: Project[];
  isLoading: boolean;
}

const STATUS_CONFIG = {
  active: { label: "Active", variant: "default" as const, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  on_hold: { label: "On Hold", variant: "secondary" as const, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  completed: { label: "Completed", variant: "outline" as const, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
};

export function ProjectList({ projects, isLoading }: ProjectListProps) {
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No projects found</p>
      </div>
    );
  }

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "$0";
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Project</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead className="text-right">Budget</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const projectStatus = (project.status || "active") as keyof typeof STATUS_CONFIG;
            const statusConfig = STATUS_CONFIG[projectStatus] || STATUS_CONFIG.active;
            return (
              <TableRow
                key={project.id}
                className="hover-elevate cursor-pointer"
                onClick={() => navigate(`/projects/${project.id}`)}
                data-testid={`row-project-${project.id}`}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <ProjectIcon
                      icon={project.icon}
                      color={project.color}
                      className="w-6 h-6 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{project.name}</p>
                      {project.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {project.location || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={statusConfig.variant}
                    className={statusConfig.color}
                    data-testid={`badge-status-${project.id}`}
                  >
                    {statusConfig.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {formatDate(project.startDate)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {formatDate(project.endDate)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(project.budget)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
