import { useLocation } from "wouter";
import { CheckSquare, Calendar, DollarSign, FileText, Users, FolderOpen } from "lucide-react";
import { useProjectRoute } from "@/hooks/useProjectRoute";

const projectTabs = [
  { path: "tasks", label: "Tasks", Icon: CheckSquare },
  { path: "schedule", label: "Schedule", Icon: Calendar },
  { path: "bills", label: "Bills", Icon: DollarSign },
  { path: "budget", label: "Budget", Icon: FileText },
  { path: "team", label: "Team", Icon: Users },
  { path: "files", label: "Files", Icon: FolderOpen },
];

export function ProjectTabs() {
  const [, setLocation] = useLocation();
  const routeParams = useProjectRoute();
  
  const projectId = routeParams?.projectId;
  const currentTab = routeParams?.tab || 'tasks';

  return (
    <div className="bg-card border-b overflow-x-auto scrollbar-hide">
      <div className="flex items-center px-2 min-w-max">
        {projectTabs.map((tab) => {
          const isActive = currentTab === tab.path;
          const Icon = tab.Icon;
          
          return (
            <button
              key={tab.path}
              onClick={() => {
                if (projectId) {
                  setLocation(`/projects/${projectId}/${tab.path}`);
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-3 whitespace-nowrap transition-colors border-b-2 ${
                isActive 
                  ? "text-foreground border-[#bba7db]" 
                  : "text-muted-foreground border-transparent"
              }`}
              data-testid={`tab-${tab.label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
