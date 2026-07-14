import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { WidgetProps } from "@/types/widgets";
import type { Project, Task, Estimate } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { ChevronRight } from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { WidgetError } from "@/components/ui/WidgetError";

export default function BusinessProjectsWidget({}: WidgetProps) {
  const [, navigate] = useLocation();

  const projectsQ = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });

  if (projectsQ.isLoading) return <WidgetSkeleton rows={4} />;
  if (projectsQ.isError)
    return <WidgetError onRetry={() => projectsQ.refetch()} message="Couldn't load projects." />;

  const projects = projectsQ.data ?? [];

  const activeProjects = projects.filter(p => p.status === "active");

  const getProjectProgress = (projectId: string) => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) return 0;
    const completedTasks = projectTasks.filter(t => t.status === "done").length;
    return Math.round((completedTasks / projectTasks.length) * 100);
  };

  const getProjectTaskCounts = (projectId: string) => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    const total = projectTasks.length;
    const completed = projectTasks.filter(t => t.status === "done").length;
    const overdue = projectTasks.filter(t => 
      t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date()
    ).length;
    return { total, completed, overdue };
  };

  if (activeProjects.length === 0) return <WidgetEmpty title="No active projects" />;

  return (
    <ScrollArea className="h-[320px]" data-testid="business-projects-widget">
      <div className="space-y-2 pr-4">
        {activeProjects.map((project) => {
          const progress = getProjectProgress(project.id);
          const taskCounts = getProjectTaskCounts(project.id);
          
          return (
            <div 
              key={project.id} 
              className="p-3 rounded-md border hover-elevate cursor-pointer group"
              onClick={() => navigate(`/projects/${project.id}`)}
              data-testid={`project-card-${project.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">{project.name}</h4>
                    <StatusBadge
                      status={project.status}
                      tone={project.status === "completed" ? "info" : undefined}
                    />
                  </div>
                  {project.address && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {project.address}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>{taskCounts.completed}/{taskCounts.total} tasks</span>
                {taskCounts.overdue > 0 && (
                  <Badge variant="destructive" className="text-data px-1 py-0">
                    {taskCounts.overdue} overdue
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                <Progress value={progress} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground w-8 text-right">{progress}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
