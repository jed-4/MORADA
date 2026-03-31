import { useMemo } from "react";
import { useLocation } from "wouter";
import { useToolbarVisible } from "@/hooks/useToolbarVisible";
import { Home, FolderOpen, CheckSquare, Calendar as CalendarIcon, CreditCard, Timer, MessageSquare, ClipboardList, Users, FileText, HardDrive, GanttChart, BarChart3 } from "lucide-react";
import BusinessOverview from "@/components/BusinessOverview";
import BusinessProjects from "./BusinessProjects";
import BusinessTasks from "./BusinessTasks";
import BusinessCalendar from "./BusinessCalendar";
import BusinessFiles from "./BusinessFiles";
import Timesheets from "./Timesheets";
import Minutes from "./Minutes";
import TeamManagement from "./TeamManagement";
import Messages from "./Messages";
import Notes from "./Notes";
import BusinessSchedule from "./BusinessSchedule";
import ComingSoonPage from "./ComingSoonPage";
import BusinessMetrics from "./BusinessMetrics";
import { useAuth } from "@/hooks/use-auth";
import BusinessOverheads from "./BusinessOverheads";

const BUSINESS_TABS = [
  { id: "overview", label: "Overview", icon: Home, path: "/business" },
  { id: "projects", label: "Projects", icon: FolderOpen, path: "/business/projects" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, path: "/business/tasks" },
  { id: "calendar", label: "Calendar", icon: CalendarIcon, path: "/business/calendar" },
  { id: "schedule", label: "Schedule", icon: GanttChart, path: "/business/schedule" },
  { id: "files", label: "Files", icon: HardDrive, path: "/business/files" },
  { id: "expenses", label: "Expenses", icon: CreditCard, path: "/business/expenses" },
  { id: "overheads", label: "Overheads", icon: BarChart3, path: "/business/overheads" },
  { id: "timesheets", label: "Timesheets", icon: Timer, path: "/business/timesheets" },
  { id: "messages", label: "Messages", icon: MessageSquare, path: "/business/messages" },
  { id: "minutes", label: "Minutes", icon: ClipboardList, path: "/business/minutes" },
  { id: "notes", label: "Notes", icon: FileText, path: "/business/notes" },
  { id: "leave", label: "Leave", icon: CalendarIcon, path: "/business/leave" },
  { id: "team", label: "Team", icon: Users, path: "/business-team" },
  { id: "metrics", label: "Metrics", icon: BarChart3, path: "/business/metrics" },
] as const;

export default function Business() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const businessLabel = (user as any)?.companyNickname || "Business";

  const { toolbarVisible } = useToolbarVisible();

  const activeTab = useMemo(() => {
    // Sort tabs by path length (longest first) to match most specific path
    const sortedTabs = [...BUSINESS_TABS].sort((a, b) => b.path.length - a.path.length);
    
    const currentTab = sortedTabs.find(tab => {
      if (location === tab.path) return true;
      if (location.startsWith(tab.path + "/")) return true;
      return false;
    });
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
      case "schedule":
        return <BusinessSchedule />;
      case "files":
        return <BusinessFiles />;
      case "expenses":
        return <ComingSoonPage section="business-expenses" />;
      case "overheads":
        return <BusinessOverheads />;
      case "timesheets":
        return <Timesheets />;
      case "messages":
        return <Messages channelTypeFilter="channel" />;
      case "minutes":
        return <Minutes />;
      case "notes":
        return <Notes projectId={null} />;
      case "leave":
        return <ComingSoonPage section="business-leave" />;
      case "team":
        return <TeamManagement />;
      case "metrics":
        return <BusinessMetrics />;
      default:
        return <BusinessOverview />;
    }
  };

  return (
    <div className="flex flex-col h-full gap-1.5" data-testid="business-page">
      {/* Header Panel - Rounded like Workspace */}
      {toolbarVisible ? (
      <div className="surface-panel flex-shrink-0">
        {/* Row 1 - Title */}
        <div className="h-8 flex items-center justify-between px-4 gap-4">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {businessLabel}
          </h2>
        </div>

        {/* Row 2 - Tabs - Underline Style */}
        <div className="h-8 flex items-center px-4 gap-4 border-t border-border/50 overflow-x-auto">
          {BUSINESS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(tab.path);
                }}
                className={`relative h-full px-1 text-xs flex items-center gap-1.5 flex-shrink-0 transition-colors ${
                  isActive
                    ? 'text-[#bba7db] font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`tab-${tab.id}`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db]" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      ) : (
        <div className="flex-shrink-0 px-4 py-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground" data-testid="text-page-title">{businessLabel}</span>
          <span>·</span>
          <span className="font-medium text-foreground/70">{BUSINESS_TABS.find(t => t.id === activeTab)?.label ?? activeTab}</span>
        </div>
      )}

      {/* Content Area */}
      <div className={`flex-1 min-h-0 ${activeTab === 'schedule' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {renderContent()}
      </div>
    </div>
  );
}
