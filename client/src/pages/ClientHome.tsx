import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { Home, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { useClientPortal } from "@/hooks/use-client-portal";
import type { Project } from "@shared/schema";

/**
 * Where a client lands after logging in.
 *
 * The team lands on their personal workspace, which is builder tooling — a
 * client should land on the thing they're actually here for: their project.
 * One project goes straight in; several show a chooser.
 *
 * GET /api/projects is already scoped to the projects a user has been granted,
 * so this list only ever contains their own.
 */
export default function ClientHome() {
  const [, navigate] = useLocation();
  const { landingTab } = useClientPortal();
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const tab = landingTab();
  const tabPath = tab && tab !== "overview" ? `/${tab}` : "";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-muted-foreground text-sm">Loading your project…</p>
        </div>
      </div>
    );
  }

  const visibleProjects = projects ?? [];

  if (visibleProjects.length === 0) {
    return (
      <EmptyState
        icon={Home}
        title="No project yet"
        description="Your builder hasn't linked a project to your account yet. Get in touch with them if you were expecting to see one."
        variant="inline"
        className="h-full"
        data-testid="client-home-no-projects"
      />
    );
  }

  if (visibleProjects.length === 1) {
    return <Redirect to={`/projects/${visibleProjects[0].id}${tabPath}`} />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Your projects</h1>
          <p className="text-sm text-muted-foreground">Choose a project to view.</p>
        </div>
        <div className="space-y-2">
          {visibleProjects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover-elevate active-elevate-2"
              onClick={() => navigate(`/projects/${project.id}${tabPath}`)}
              data-testid={`client-project-${project.id}`}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Home className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{project.name}</p>
                  {project.location && (
                    <p className="text-xs text-muted-foreground truncate">{project.location}</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
