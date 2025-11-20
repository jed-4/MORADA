import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Search } from "lucide-react";

export function Projects() {
  const projects = [
    { id: 1, name: "Villa Renovation", client: "Smith Family", status: "In Progress", color: "#bba7db" },
    { id: 2, name: "Office Fit-out", client: "TechCorp Ltd", status: "In Progress", color: "#60a5fa" },
    { id: 3, name: "Beach House", client: "Johnson Estate", status: "Planning", color: "#34d399" },
    { id: 4, name: "Retail Store", client: "Fashion Co", status: "On Hold", color: "#fbbf24" },
  ];

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
      
      {/* Search Bar */}
      <div className="bg-card border-b px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects..."
            className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm"
            data-testid="input-search-projects"
          />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-card rounded-xl p-4 border hover-elevate active-elevate-2"
              data-testid={`project-card-${project.id}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: project.color }}
                >
                  {project.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-1">{project.name}</h3>
                  <div className="text-xs text-muted-foreground mb-2">{project.client}</div>
                  <span className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${
                    project.status === "In Progress" ? "bg-primary/10 text-primary" :
                    project.status === "Planning" ? "bg-blue-500/10 text-blue-600" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {project.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
