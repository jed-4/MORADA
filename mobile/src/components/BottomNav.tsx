import { useLocation } from "wouter";
import { Home, CheckSquare, FolderKanban, Menu } from "lucide-react";

const tabs = [
  { path: "/", label: "Dashboard", Icon: Home },
  { path: "/tasks", label: "Tasks", Icon: CheckSquare },
  { path: "/projects", label: "Projects", Icon: FolderKanban },
  { path: "/more", label: "More", Icon: Menu },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav className="safe-bottom bg-card border-t">
      <div className="flex justify-around items-center h-16">
        {tabs.map((tab) => {
          const isActive = location === tab.path;
          const Icon = tab.Icon;
          
          return (
            <button
              key={tab.path}
              onClick={() => setLocation(tab.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={`tab-${tab.label.toLowerCase()}`}
            >
              <Icon className="w-6 h-6 mb-0.5" />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
