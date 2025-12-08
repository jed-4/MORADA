import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Bell, User, Calendar, Settings as SettingsIcon, Mail, CheckCircle2, Clock, Shield } from "lucide-react";

const USER_SETTINGS_CATEGORIES = [
  {
    id: "profile",
    label: "Profile",
    icon: User,
    description: "Your personal information",
    group: "account"
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "Email and in-app notification preferences",
    group: "account"
  },
  {
    id: "preferences",
    label: "Preferences",
    icon: SettingsIcon,
    description: "Display and workflow preferences",
    group: "preferences"
  },
  {
    id: "calendar",
    label: "Calendar & Availability",
    icon: Calendar,
    description: "Working hours and calendar sync",
    group: "preferences"
  },
];

const SETTINGS_GROUPS = [
  { key: "account", label: "Account" },
  { key: "preferences", label: "Preferences" },
];

export default function UserSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState("notifications");
  
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('notificationPreferences');
    return saved ? JSON.parse(saved) : {
      projectCreated: true,
      projectUpdated: true,
      projectCompleted: true,
      taskAssigned: true,
      taskDueDate: true,
      taskCompleted: true,
      taskComments: true,
      teamMemberAdded: true,
      teamMemberRemoved: false,
      siteDiaryCreated: true,
      siteDiaryUpdated: false,
      estimateCreated: true,
      estimateApproved: true,
      invoiceCreated: true,
      invoicePaid: true,
      emailNotifications: true,
      emailDigest: false,
    };
  });

  const handleToggle = (key: string) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    localStorage.setItem('notificationPreferences', JSON.stringify(updated));
    toast({ title: "Preferences saved" });
  };

  const NotificationItem = ({ 
    id, 
    label, 
    description 
  }: { 
    id: string; 
    label: string; 
    description: string; 
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={notifications[id]}
        onCheckedChange={() => handleToggle(id)}
        data-testid={`switch-notification-${id}`}
      />
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "profile":
        return (
          <div className="space-y-6">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input defaultValue={user?.firstName || ""} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input defaultValue={user?.lastName || ""} disabled className="bg-muted" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue={user?.email || ""} disabled className="bg-muted" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Profile information is managed through your account. Visit your profile page to make changes.
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case "notifications":
        return (
          <div className="space-y-6">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  Project Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NotificationItem 
                  id="projectCreated" 
                  label="New Projects" 
                  description="When a new project is created" 
                />
                <NotificationItem 
                  id="projectUpdated" 
                  label="Project Updates" 
                  description="When a project is modified" 
                />
                <NotificationItem 
                  id="projectCompleted" 
                  label="Project Completion" 
                  description="When a project is marked as complete" 
                />
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  Task Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NotificationItem 
                  id="taskAssigned" 
                  label="Task Assigned" 
                  description="When you're assigned to a task" 
                />
                <NotificationItem 
                  id="taskDueDate" 
                  label="Due Date Reminders" 
                  description="When a task is due soon" 
                />
                <NotificationItem 
                  id="taskCompleted" 
                  label="Task Completed" 
                  description="When a task is marked complete" 
                />
                <NotificationItem 
                  id="taskComments" 
                  label="Task Comments" 
                  description="When someone comments on your tasks" 
                />
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email Preferences
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NotificationItem 
                  id="emailNotifications" 
                  label="Email Notifications" 
                  description="Receive notifications via email" 
                />
                <NotificationItem 
                  id="emailDigest" 
                  label="Daily Digest" 
                  description="Receive a daily summary of all notifications" 
                />
              </CardContent>
            </Card>
          </div>
        );

      case "preferences":
        return (
          <div className="space-y-6">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                  Display Preferences
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Display preferences coming soon
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "calendar":
        return (
          <div className="space-y-6">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Working Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Working hours configuration coming soon
                </div>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Calendar Sync
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Visit your profile page to manage Google Calendar connection
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  const activeCategory = USER_SETTINGS_CATEGORIES.find(cat => cat.id === activeSection);

  return (
    <div className="flex h-full">
      {/* Left Sidebar Navigation */}
      <div className="w-56 border-r border-border bg-background flex-shrink-0 p-4">
        {SETTINGS_GROUPS.map((group) => {
          const groupCategories = USER_SETTINGS_CATEGORIES.filter(cat => cat.group === group.key);
          if (groupCategories.length === 0) return null;
          
          return (
            <div key={group.key} className="mb-4">
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {groupCategories.map((category) => {
                  const Icon = category.icon;
                  const isActive = activeSection === category.id;
                  
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveSection(category.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                        isActive 
                          ? "bg-[#bba7db] text-white" 
                          : "text-foreground hover-elevate"
                      }`}
                      data-testid={`user-settings-nav-${category.id}`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
                      <span className="text-sm font-medium">{category.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Control Header */}
        <div className="h-9 bg-background flex items-center justify-between px-4 gap-4 flex-shrink-0 border-b border-border">
          <div className="flex items-center gap-2">
            {activeCategory && (
              <>
                <activeCategory.icon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{activeCategory.label}</h2>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
