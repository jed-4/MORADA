import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Home, FolderOpen, CheckSquare, Calendar as CalendarIcon, CreditCard, Timer, MessageSquare, ClipboardList, Users, Settings as SettingsIcon } from "lucide-react";
import BusinessOverview from "@/components/BusinessOverview";
import BusinessProjects from "./BusinessProjects";
import BusinessTasks from "./BusinessTasks";
import BusinessCalendar from "./BusinessCalendar";
import Timesheets from "./Timesheets";
import Minutes from "./Minutes";
import TeamManagement from "./TeamManagement";
import Systems from "./Systems";
import ComingSoonPage from "./ComingSoonPage";

export default function Business() {
  const [location, navigate] = useLocation();

  const tabs = [
    { id: "overview", label: "Overview", icon: Home, path: "/business" },
    { id: "projects", label: "Projects", icon: FolderOpen, path: "/business/projects" },
    { id: "tasks", label: "Tasks", icon: CheckSquare, path: "/business/tasks" },
    { id: "calendar", label: "Calendar", icon: CalendarIcon, path: "/business/calendar" },
    { id: "expenses", label: "Expenses", icon: CreditCard, path: "/business/expenses" },
    { id: "timesheets", label: "Timesheets", icon: Timer, path: "/business/timesheets" },
    { id: "messages", label: "Messages", icon: MessageSquare, path: "/business/messages" },
    { id: "minutes", label: "Minutes", icon: ClipboardList, path: "/business/minutes" },
    { id: "leave", label: "Leave", icon: CalendarIcon, path: "/business/leave" },
    { id: "team", label: "Team", icon: Users, path: "/business-team" },
    { id: "systems", label: "Systems", icon: SettingsIcon, path: "/systems" },
  ];

  const activeTab = useMemo(() => {
    const currentTab = tabs.find(tab => location === tab.path || location.startsWith(tab.path + "/"));
    return currentTab?.id || "overview";
  }, [location]);

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <BusinessOverview />;
      case "projects":
        return <BusinessProjects />;
      case "tasks":
        return <BusinessTasks />;
      case "calendar":
        return <BusinessCalendar />;
      case "expenses":
        return <ComingSoonPage section="business-expenses" />;
      case "timesheets":
        return <Timesheets />;
      case "messages":
        return <ComingSoonPage section="business-messages" />;
      case "minutes":
        return <Minutes />;
      case "leave":
        return <ComingSoonPage section="business-leave" />;
      case "team":
        return <TeamManagement />;
      case "systems":
        return <Systems />;
      default:
        return <BusinessOverview />;
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="business-page">
      {/* Row 1 - Title (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-4 flex-shrink-0 border-b border-border">
        <h2 className="text-sm font-semibold" data-testid="text-page-title">
          Business
        </h2>
      </div>

      {/* Row 2 - Tabs (36px) */}
      <div className="h-9 bg-white flex items-center px-2 gap-0.5 border-b border-border flex-shrink-0 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                  : 'hover-elevate'
              } active-elevate-2`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-3 h-3" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
