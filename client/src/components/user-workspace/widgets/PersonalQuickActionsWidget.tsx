import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Clock, 
  Plus, 
  FileText, 
  CheckSquare, 
  Calendar,
  Timer,
  Play,
  Square
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet } from "@shared/schema";

export default function PersonalQuickActionsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/user"],
  });

  const { data: activeTimesheet } = useQuery<Timesheet | null>({
    queryKey: ["/api/timesheets/active"],
    queryFn: async () => {
      const response = await fetch('/api/timesheets/active', { credentials: 'include' });
      if (!response.ok) return null;
      const data = await response.json();
      return data || null;
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/timesheets/clock-in', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      toast({ title: "Clocked in successfully" });
    },
    onError: () => {
      toast({ title: "Failed to clock in", variant: "destructive" });
    }
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/timesheets/clock-out', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      toast({ title: "Clocked out successfully" });
    },
    onError: () => {
      toast({ title: "Failed to clock out", variant: "destructive" });
    }
  });

  const isClockedIn = !!activeTimesheet;

  const actions = [
    {
      id: 'clock',
      label: isClockedIn ? 'Clock Out' : 'Clock In',
      icon: isClockedIn ? Square : Play,
      color: isClockedIn ? 'text-red-600' : 'text-green-600',
      bgColor: isClockedIn ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30' : 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30',
      onClick: () => isClockedIn ? clockOutMutation.mutate() : clockInMutation.mutate(),
      loading: clockInMutation.isPending || clockOutMutation.isPending,
    },
    {
      id: 'log-time',
      label: 'Log Time',
      icon: Timer,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30',
      onClick: () => setLocation(`/users/${currentUser?.id}/time`),
    },
    {
      id: 'new-task',
      label: 'New Task',
      icon: CheckSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30',
      onClick: () => setLocation('/tasks?new=true'),
    },
    {
      id: 'new-memo',
      label: 'New Memo',
      icon: FileText,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30',
      onClick: () => setLocation(`/users/${currentUser?.id}/notes`),
    },
    {
      id: 'calendar',
      label: 'My Calendar',
      icon: Calendar,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/30',
      onClick: () => setLocation(`/users/${currentUser?.id}/calendar`),
    },
  ];

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Quick Actions</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
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
    <div className="grid grid-cols-2 gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={action.loading}
            className={`p-2 rounded-md border flex flex-col items-center gap-1 transition-colors ${action.bgColor} ${action.loading ? 'opacity-50' : ''}`}
            data-testid={`quick-action-${action.id}`}
          >
            <Icon className={`h-4 w-4 ${action.color}`} />
            <span className={`text-[10px] font-medium ${action.color}`}>
              {action.loading ? 'Loading...' : action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
