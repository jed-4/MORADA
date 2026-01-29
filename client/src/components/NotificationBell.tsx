import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, isPast } from "date-fns";
import { useLocation } from "wouter";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";
import { 
  Bell, Clock, Check, AlarmClock, AlarmClockOff, 
  CheckSquare, ClipboardList, Timer, Wrench, MoreHorizontal,
  UserPlus, Trash2, CheckCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useNotificationEvents } from "@/lib/socket";
import type { Reminder, Notification } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

const REMINDER_TYPE_ICONS: Record<string, any> = {
  task: CheckSquare,
  site_diary: ClipboardList,
  timesheet: Timer,
  defect: Wrench,
  custom: Bell,
};

const SNOOZE_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
];

const NOTIFICATION_TYPE_ICONS: Record<string, any> = {
  task_assigned: UserPlus,
  task_mentioned: CheckSquare,
  task_completed: Check,
};

export function NotificationBell() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("notifications");
  const { user } = useAuth();
  const { effectiveTimezone } = useTimezone();

  const { data: unreadCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
    enabled: !!user,
  });

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: isOpen && !!user,
  });

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders/upcoming"],
    enabled: isOpen && !!user,
  });

  const handleNewNotification = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
  }, []);

  useNotificationEvents(handleNewNotification);

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) => {
      return apiRequest(`/api/reminders/${id}/snooze`, "POST", { minutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "Reminder snoozed" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/reminders/${id}/dismiss`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "Reminder dismissed" });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/notifications/mark-all-read", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/notifications/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const getReminderTimeStatus = (reminder: Reminder) => {
    if (!reminder.triggerAt) return { label: "No date", isOverdue: false };
    const triggerDate = new Date(reminder.triggerAt);
    
    if (reminder.status === "snoozed" && reminder.snoozedUntil) {
      return { 
        label: `Snoozed until ${formatInTimezone(new Date(reminder.snoozedUntil), effectiveTimezone, { hour: 'numeric', minute: '2-digit', hour12: true })}`, 
        isOverdue: false,
        isSnoozed: true
      };
    }
    
    if (isPast(triggerDate)) {
      return { 
        label: `Overdue`, 
        isOverdue: true 
      };
    }
    
    return { 
      label: formatDistanceToNow(triggerDate, { addSuffix: true }), 
      isOverdue: false 
    };
  };

  const handleViewAll = () => {
    if (user) {
      navigate(`/users/${user.id}/reminders`);
    }
    setIsOpen(false);
  };

  const activeReminders = reminders.filter(r => r.status === "pending" || r.status === "sent" || r.status === "snoozed");
  const unreadNotifications = notifications.filter(n => !n.isRead);
  const hasUnread = unreadCount.count > 0 || activeReminders.length > 0;
  const totalCount = unreadCount.count + activeReminders.length;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markNotificationReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      setIsOpen(false);
      navigate(notification.link);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 relative"
          data-testid="button-notifications"
        >
          <Bell className="h-3.5 w-3.5" />
          {totalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 items-center justify-center text-[9px] font-bold text-white">
                {totalCount > 9 ? "9+" : totalCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <TabsList className="h-7 p-0.5">
              <TabsTrigger value="notifications" className="h-6 text-xs px-2">
                Notifications {unreadCount.count > 0 && `(${unreadCount.count})`}
              </TabsTrigger>
              <TabsTrigger value="reminders" className="h-6 text-xs px-2">
                Reminders {activeReminders.length > 0 && `(${activeReminders.length})`}
              </TabsTrigger>
            </TabsList>
            {activeTab === "notifications" && unreadNotifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => markAllReadMutation.mutate()}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                All read
              </Button>
            )}
          </div>
          
          <TabsContent value="notifications" className="m-0">
            <ScrollArea className="max-h-80">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications</p>
                  <p className="text-xs text-muted-foreground">You're all caught up!</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.slice(0, 10).map((notification) => {
                    const TypeIcon = NOTIFICATION_TYPE_ICONS[notification.type] || Bell;
                    
                    return (
                      <div
                        key={notification.id}
                        className={`flex items-start gap-2 p-2 hover:bg-muted/50 transition-colors cursor-pointer ${
                          !notification.isRead ? "bg-primary/5" : ""
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                        data-testid={`notification-item-${notification.id}`}
                      >
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                          !notification.isRead ? "bg-primary/10" : "bg-muted"
                        }`}>
                          <TypeIcon className={`h-4 w-4 ${!notification.isRead ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className={`text-sm truncate ${!notification.isRead ? "font-medium" : ""}`}>
                              {notification.title}
                            </p>
                            {!notification.isRead && (
                              <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </div>
                          {notification.message && (
                            <p className="text-xs text-muted-foreground truncate">{notification.message}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </p>
                        </div>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotificationMutation.mutate(notification.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="reminders" className="m-0">
            <ScrollArea className="max-h-80">
          {activeReminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No active reminders</p>
              <p className="text-xs text-muted-foreground">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y">
              {activeReminders.slice(0, 5).map((reminder) => {
                const TypeIcon = REMINDER_TYPE_ICONS[reminder.reminderType || "custom"] || Bell;
                const timeStatus = getReminderTimeStatus(reminder);
                
                return (
                  <div
                    key={reminder.id}
                    className="flex items-start gap-2 p-2 hover:bg-muted/50 transition-colors"
                    data-testid={`notification-item-${reminder.id}`}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                      timeStatus.isOverdue ? "bg-destructive/10" : 
                      (timeStatus as any).isSnoozed ? "bg-orange-500/10" : "bg-[#bba7db]/10"
                    }`}>
                      {(timeStatus as any).isSnoozed ? (
                        <AlarmClockOff className="h-4 w-4 text-orange-500" />
                      ) : (
                        <TypeIcon className={`h-4 w-4 ${timeStatus.isOverdue ? "text-destructive" : "text-[#bba7db]"}`} />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{reminder.title}</p>
                      <p className={`text-xs ${timeStatus.isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                        <Clock className="h-3 w-3 inline mr-1" />
                        {reminder.triggerAt && formatInTimezone(new Date(reminder.triggerAt), effectiveTimezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                        <span className="ml-1">({timeStatus.label})</span>
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel className="text-xs">Snooze</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {SNOOZE_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => snoozeMutation.mutate({ id: reminder.id, minutes: option.value })}
                            className="text-xs"
                          >
                            <AlarmClock className="h-3 w-3 mr-2" />
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => dismissMutation.mutate(reminder.id)}
                          className="text-xs"
                        >
                          <AlarmClockOff className="h-3 w-3 mr-2" />
                          Dismiss
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
            </ScrollArea>

            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleViewAll}
                data-testid="button-view-all-reminders"
              >
                View all reminders
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
