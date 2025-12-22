import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, Clock, AlertCircle, Plus, Check, BellOff } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, formatDistanceToNow, isPast, isToday } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Reminder {
  id: string;
  title: string;
  description?: string;
  reminderType: string;
  triggerAt: string;
  status: string;
  priority: string;
}

export default function PersonalRemindersWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const maxReminders = widget.config?.maxReminders || 5;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxReminders, setConfigMaxReminders] = useState(maxReminders);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxReminders(widget.config?.maxReminders || 5);
  }, [widget.title, widget.config]);

  const { data: reminders = [], isLoading } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders"],
    enabled: !!userId,
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/reminders/${id}`, "PATCH", { status: "dismissed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      toast({ title: "Reminder dismissed" });
    },
  });

  const activeReminders = reminders
    .filter(r => r.status === "pending" || r.status === "sent" || r.status === "snoozed")
    .sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime());
  
  const displayReminders = activeReminders.slice(0, maxReminders);

  const getReminderStatus = (reminder: Reminder) => {
    const triggerDate = new Date(reminder.triggerAt);
    if (isPast(triggerDate)) {
      return { 
        color: 'text-red-600 dark:text-red-400', 
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        label: 'Overdue'
      };
    }
    if (isToday(triggerDate)) {
      return { 
        color: 'text-amber-600 dark:text-amber-400', 
        bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        label: 'Today'
      };
    }
    return { color: 'text-muted-foreground', bgColor: '', label: '' };
  };

  const getPriorityBadge = (priority: string) => {
    if (priority === 'high') return <Badge variant="destructive" className="text-[10px] h-4">High</Badge>;
    return null;
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, maxReminders: configMaxReminders }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxReminders(widget.config?.maxReminders || 5);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Reminders</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Reminders</Label>
          <Input 
            type="number"
            min={1}
            max={20}
            value={configMaxReminders}
            onChange={(e) => setConfigMaxReminders(parseInt(e.target.value) || 5)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {activeReminders.length} active
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => userId && setLocation(`/users/${userId}/reminders`)}
          disabled={!userId}
          data-testid="reminders-widget-view-all"
        >
          <Plus className="h-3 w-3 mr-1" />
          New
        </Button>
      </div>
      
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-2 border rounded-md">
                <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                <div className="h-2 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : displayReminders.length === 0 ? (
          <div className="text-center py-3 text-xs text-muted-foreground">
            <Bell className="h-6 w-6 mx-auto mb-1 opacity-30" />
            No active reminders
          </div>
        ) : (
          displayReminders.map((reminder) => {
            const status = getReminderStatus(reminder);
            return (
              <div 
                key={reminder.id}
                className={`p-2 border rounded-md hover-elevate cursor-pointer ${status.bgColor}`}
                onClick={() => userId && setLocation(`/users/${userId}/reminders`)}
                data-testid={`reminder-${reminder.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Bell className={`h-3 w-3 mt-0.5 flex-shrink-0 ${status.color || 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate leading-tight font-medium">{reminder.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] ${status.color || 'text-muted-foreground'}`}>
                          {formatDistanceToNow(new Date(reminder.triggerAt), { addSuffix: true })}
                        </span>
                        {getPriorityBadge(reminder.priority)}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissMutation.mutate(reminder.id);
                    }}
                    data-testid={`dismiss-reminder-${reminder.id}`}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {activeReminders.length > maxReminders && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-xs text-muted-foreground"
          onClick={() => userId && setLocation(`/users/${userId}/reminders`)}
          data-testid="reminders-view-all"
        >
          View all {activeReminders.length} reminders
        </Button>
      )}
    </div>
  );
}
