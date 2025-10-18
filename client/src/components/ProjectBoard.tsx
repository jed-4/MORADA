import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type Project } from "@shared/schema";
import { useLocation } from "wouter";
import { Calendar, MapPin, DollarSign } from "lucide-react";
import { ProjectIcon } from "./ProjectIcon";

interface ProjectBoardProps {
  projects: Project[];
  isLoading: boolean;
}

const STATUS_COLUMNS = [
  { id: "active", title: "Active", color: "text-green-600" },
  { id: "on_hold", title: "On Hold", color: "text-yellow-600" },
  { id: "completed", title: "Completed", color: "text-blue-600" },
];

export function ProjectBoard({ projects, isLoading }: ProjectBoardProps) {
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  const getProjectsByStatus = (status: string) => {
    return projects.filter(p => (p.status || "active") === status);
  };

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "$0";
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        {STATUS_COLUMNS.map((column) => {
          const columnProjects = getProjectsByStatus(column.id);
          return (
            <div key={column.id} className="flex flex-col">
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{column.title}</h3>
                  <Badge variant="secondary" data-testid={`badge-count-${column.id}`}>
                    {columnProjects.length}
                  </Badge>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-3 overflow-y-auto">
                {columnProjects.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex items-center justify-center py-8">
                      <p className="text-sm text-muted-foreground">
                        No {column.title.toLowerCase()} projects
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  columnProjects.map((project) => (
                    <Card
                      key={project.id}
                      className="hover-elevate cursor-pointer transition-all"
                      onClick={() => navigate(`/projects/${project.id}`)}
                      data-testid={`card-project-${project.id}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <ProjectIcon
                            icon={project.icon}
                            color={project.color}
                            className="w-8 h-8 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">
                              {project.name}
                            </CardTitle>
                            {project.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {project.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {/* Location */}
                        {project.location && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{project.location}</span>
                          </div>
                        )}

                        {/* Dates */}
                        {(project.startDate || project.endDate) && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>
                              {project.startDate
                                ? new Date(project.startDate).toLocaleDateString()
                                : "TBD"}
                              {" - "}
                              {project.endDate
                                ? new Date(project.endDate).toLocaleDateString()
                                : "TBD"}
                            </span>
                          </div>
                        )}

                        {/* Budget */}
                        {project.budget !== null && project.budget > 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{formatCurrency(project.budget)}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
