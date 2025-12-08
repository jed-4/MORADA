import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Bell, Mail, CheckCircle2 } from "lucide-react";

export default function UserSettings() {
  const { toast } = useToast();
  
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
        data-testid={`notification-${id}`}
      />
    </div>
  );

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Notification Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Control which notifications you receive and how
        </p>
      </div>

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
}
