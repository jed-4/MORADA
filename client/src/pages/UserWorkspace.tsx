import { useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Home, CheckSquare, Calendar as CalendarIcon, Timer, FileText, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@shared/schema";
import ComingSoonPage from "./ComingSoonPage";

// Tab components
import UserOverview from "@/components/user-workspace/UserOverview";
import UserCalendar from "@/components/user-workspace/UserCalendar";
import UserTasks from "@/components/user-workspace/UserTasks";
import UserSchedule from "@/components/user-workspace/UserSchedule";
import UserTime from "@/components/user-workspace/UserTime";
import Memos from "@/components/user-workspace/Memos";
import Messages from "./Messages";

const USER_TABS = [
  { id: "overview", label: "Overview", icon: Home, path: "" },
  { id: "calendar", label: "Calendar", icon: CalendarIcon, path: "calendar" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, path: "tasks" },
  { id: "schedule", label: "Schedule", icon: CalendarIcon, path: "schedule" },
  { id: "time", label: "Time", icon: Timer, path: "time" },
  { id: "messages", label: "Messages", icon: MessageSquare, path: "messages" },
  { id: "notes", label: "Memos", icon: FileText, path: "notes" },
] as const;

export default function UserWorkspace() {
  const { userId } = useParams<{ userId: string }>();
  const [location, navigate] = useLocation();

  // Fetch user data
  const { data: user } = useQuery<User>({
    queryKey: [`/api/users/${userId}`],
    enabled: !!userId,
  });

  // Fetch current user to check if viewing own page
  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const isOwnPage = currentUser?.id === userId;

  // Determine active tab based on URL
  const activeTab = useMemo(() => {
    const baseUserPath = `/users/${userId}`;
    
    if (location === baseUserPath) return "overview";
    
    const sortedTabs = [...USER_TABS].sort((a, b) => b.path.length - a.path.length);
    const currentTab = sortedTabs.find(tab => {
      if (tab.path === "") return false; // Skip overview for this check
      const fullPath = `${baseUserPath}/${tab.path}`;
      if (location === fullPath) return true;
      if (location.startsWith(fullPath + "/")) return true;
      return false;
    });
    
    return currentTab?.id || "overview";
  }, [location, userId]);

  const renderContent = () => {
    if (!user) return null;
    
    switch (activeTab) {
      case "overview":
        return <UserOverview user={user} isOwnPage={isOwnPage} />;
      case "calendar":
        return <UserCalendar user={user} isOwnPage={isOwnPage} />;
      case "tasks":
        return <UserTasks user={user} isOwnPage={isOwnPage} />;
      case "schedule":
        return <UserSchedule user={user} isOwnPage={isOwnPage} />;
      case "time":
        return <UserTime user={user} isOwnPage={isOwnPage} />;
      case "messages":
        return <Messages channelTypeFilter="dm" />;
      case "notes":
        return <Memos user={user} isOwnPage={isOwnPage} />;
      default:
        return <UserOverview user={user} isOwnPage={isOwnPage} />;
    }
  };

  const getInitials = (firstName?: string | null, lastName?: string | null): string => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const getFullName = (firstName?: string | null, lastName?: string | null): string => {
    return [firstName, lastName].filter(Boolean).join(" ") || "Unknown User";
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="user-workspace-page">
      {/* Row 1 - User Info (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-4 flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6" data-testid="avatar-user">
            <AvatarFallback className="text-xs bg-accent">
              {getInitials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-sm font-semibold" data-testid="text-user-name">
            {getFullName(user.firstName, user.lastName)}
          </h2>
        </div>
        {isOwnPage && (
          <button
            type="button"
            onClick={() => navigate("/settings/profile")}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            data-testid="button-settings"
          >
            <SettingsIcon className="w-3 h-3" />
            <span>Settings</span>
          </button>
        )}
      </div>

      {/* Row 2 - Tabs (36px) - Underline Style */}
      <div className="h-9 bg-white flex items-center px-2 gap-4 border-b border-border flex-shrink-0 overflow-x-auto">
        {USER_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const tabPath = tab.path ? `/users/${userId}/${tab.path}` : `/users/${userId}`;
          
          return (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                navigate(tabPath);
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

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
