import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  FolderOpen, 
  ChevronRight, 
  Search,
  Building2,
  MapPin
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Project } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

const PHASE_COLORS: Record<string, string> = {
  lead: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  pre_construction: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  construction: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  post_construction: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const PHASE_LABELS: Record<string, string> = {
  lead: "Lead",
  pre_construction: "Pre-Con",
  construction: "Construction",
  post_construction: "Post-Con",
};

export default function MyProjectsWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const myProjects = useMemo(() => {
    const currentUserId = userId || (user as any)?.id;
    if (!currentUserId) return [];
    
    return projects
      .filter(p => !p.isArchived)
      .filter(p => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.address?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const phaseOrder = ['construction', 'pre_construction', 'lead', 'post_construction'];
        const aOrder = phaseOrder.indexOf(a.currentSystemPhase || 'construction');
        const bOrder = phaseOrder.indexOf(b.currentSystemPhase || 'construction');
        return aOrder - bOrder;
      });
  }, [projects, userId, user, searchQuery]);

  const handleProjectClick = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  if (isConfiguring) {
    return (
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Label>Widget Title</Label>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            placeholder="My Projects"
            data-testid="input-widget-title"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCloseConfig}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onUpdate?.({ ...widget, title: editingTitle });
              onCloseConfig?.();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="my-projects-widget">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{widget.title || "My Projects"}</span>
          <Badge variant="secondary" className="text-[10px]">
            {myProjects.length}
          </Badge>
        </div>
      </div>

      {myProjects.length > 5 && (
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-7 text-xs"
              data-testid="input-search-projects"
            />
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : myProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2 text-center px-4">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {searchQuery ? "No matching projects found" : "No active projects"}
            </span>
          </div>
        ) : (
          <div className="p-1">
            {myProjects.map((project) => (
              <button
                key={project.id}
                className="w-full group flex items-center gap-2 px-2 py-2 rounded-md hover-elevate text-left"
                onClick={() => handleProjectClick(project.id)}
                data-testid={`project-${project.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{project.name}</span>
                    {project.currentSystemPhase && (
                      <Badge 
                        variant="secondary" 
                        className={`text-[9px] px-1 py-0 ${PHASE_COLORS[project.currentSystemPhase] || ''}`}
                      >
                        {PHASE_LABELS[project.currentSystemPhase] || project.currentSystemPhase}
                      </Badge>
                    )}
                  </div>
                  {project.address && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground truncate">
                        {project.address}
                      </span>
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
