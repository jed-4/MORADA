import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Search, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { useState } from "react";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";

const PHASE_LABELS: Record<string, string> = {
  lead: "Lead",
  pre_construction: "Pre-Construction",
  construction: "Construction",
  post_construction: "Post-Construction",
  archive: "Archive",
};

export function Projects() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [, setLocation] = useLocation();
  const { setCurrentProject } = useProject();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Get unique phases from projects for filter chips
  const availablePhases = Array.from(new Set(projects.map(p => p.currentSystemPhase).filter(Boolean)));

  const filteredProjects = projects.filter((project) => {
    if (statusFilter !== "all" && project.status !== statusFilter) return false;
    if (phaseFilter !== "all" && project.currentSystemPhase !== phaseFilter) return false;
    if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <MobileHeader 
        title="Projects"
        action={
          <button
            className="p-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-add-project"
          >
            <Plus className="w-5 h-5" />
          </button>
        }
      />
      
      {/* Search and Filter Bar */}
      <div className="bg-card border-b px-4 py-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm"
            data-testid="input-search-projects"
          />
        </div>
        
        {/* Phase Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setPhaseFilter("all")}
            className={`px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap ${
              phaseFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "border hover-elevate"
            }`}
            data-testid="filter-phase-all"
          >
            All Phases
          </button>
          {availablePhases.map((phase) => (
            <button
              key={phase}
              onClick={() => setPhaseFilter(phase || "all")}
              className={`px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap ${
                phaseFilter === phase
                  ? "bg-primary text-primary-foreground"
                  : "border hover-elevate"
              }`}
              data-testid={`filter-phase-${phase}`}
            >
              {PHASE_LABELS[phase || ""] || phase}
            </button>
          ))}
        </div>
        
        {/* Status Filter */}
        <div className="flex gap-2 overflow-x-auto">
          {[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "On Hold", value: "on_hold" },
            { label: "Completed", value: "completed" },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap ${
                statusFilter === filter.value
                  ? "bg-muted-foreground/20 text-foreground"
                  : "border hover-elevate"
              }`}
              data-testid={`filter-status-${filter.value}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  setCurrentProject(project);
                  setLocation(`/projects/${project.id}/overview`);
                }}
                className="w-full bg-card rounded-lg p-3 border hover-elevate active-elevate-2 text-left"
                data-testid={`project-card-${project.id}`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-md flex-shrink-0"
                    style={{ backgroundColor: project.color || "#bba7db" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">{project.name}</h3>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap flex-shrink-0 ${
                        project.status === "active" ? "bg-green-500/10 text-green-600" :
                        project.status === "on_hold" ? "bg-yellow-500/10 text-yellow-600" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {project.status === "active" ? "Active" :
                         project.status === "on_hold" ? "Hold" :
                         project.status === "completed" ? "Done" : project.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {project.clientName || project.address || (project.currentSystemPhase ? PHASE_LABELS[project.currentSystemPhase] : "")}
                    </p>
                  </div>
                </div>
              </button>
            ))}
            
            {filteredProjects.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No projects found</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
