import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectSelect } from "@/components/ProjectSelect";
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

export default function PersonalQuickActionsWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [clockInOpen, setClockInOpen] = useState(false);
  const [clockInProjectId, setClockInProjectId] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  const { data: activeTimesheet } = useQuery<Timesheet | null>({
    queryKey: ["/api/timesheets/active"],
    queryFn: async () => {
      const response = await fetch('/api/timesheets/active', { credentials: 'include' });
      if (!response.ok) return null;
      const data = await response.json();
      return data || null;
    },
  });

  // The signature is apiRequest(url, method, body). Passing { method: "POST" }
  // as the *method* produced "[object Object]", which fetch rejects as an
  // invalid HTTP method — so this button had never once clocked anyone in.
  //
  // It also sent no body. The endpoint treats a missing projectId as a
  // business-level overhead timesheet, so merely fixing the signature would
  // have quietly logged every dashboard clock-in against no job at all.
  const clockInMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest("/api/timesheets/clock-in", "POST", { projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      setClockInOpen(false);
      setClockInProjectId("");
      toast({ title: "Clocked in" });
    },
    onError: () => {
      toast({ title: "Failed to clock in", variant: "destructive" });
    }
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      // clock-out requires the timesheet it is ending; without it the endpoint
      // answers 400. The old call sent no body at all, so this button was
      // broken twice over — wrong signature, and nothing to act on.
      if (!activeTimesheet) throw new Error("No active timesheet");
      return apiRequest("/api/timesheets/clock-out", "POST", {
        timesheetId: activeTimesheet.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      toast({ title: "Clocked out" });
    },
    onError: () => {
      toast({ title: "Failed to clock out", variant: "destructive" });
    }
  });

  const isClockedIn = !!activeTimesheet;

  const actions = [
    {
      id: 'log-time',
      label: 'Log Time',
      icon: Timer,
      color: 'text-status-info',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30',
      onClick: () => userId && setLocation(`/users/${userId}/time`),
      disabled: !userId,
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
      onClick: () => userId && setLocation(`/users/${userId}/notes`),
      disabled: !userId,
    },
    {
      id: 'calendar',
      label: 'My Calendar',
      icon: Calendar,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/30',
      onClick: () => userId && setLocation(`/users/${userId}/calendar`),
      disabled: !userId,
    },
    {
      id: 'clock',
      label: isClockedIn ? 'Clock Out' : 'Clock In',
      icon: isClockedIn ? Square : Play,
      color: isClockedIn ? 'text-status-danger' : 'text-status-success',
      bgColor: isClockedIn ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30' : 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30',
      onClick: () => (isClockedIn ? clockOutMutation.mutate() : setClockInOpen(true)),
      loading: clockInMutation.isPending || clockOutMutation.isPending,
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
        const isDisabled = action.loading || action.disabled;
        const tile = (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={isDisabled}
            className={`p-2 rounded-md border flex flex-col items-center gap-1 transition-colors ${action.bgColor} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid={`quick-action-${action.id}`}
          >
            <Icon className={`h-4 w-4 ${action.color}`} />
            <span className={`text-data font-medium ${action.color}`}>
              {action.loading ? 'Loading...' : action.label}
            </span>
          </button>
        );

        // Clocking in asks which job first — the same rule TimeClockWidget
        // holds to. Hours that land on no project are hours nobody bills.
        if (action.id !== 'clock' || isClockedIn) return tile;

        return (
          <Popover key={action.id} open={clockInOpen} onOpenChange={setClockInOpen}>
            <PopoverTrigger asChild>{tile}</PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3 space-y-2">
              <p className="text-xs font-medium">Clock in to</p>
              {/* allowNone defaults to true, which offers "Business (No Project)"
                  and emits the literal string "none" — the endpoint would take
                  that as a project id. Real projects only. */}
              <ProjectSelect
                value={clockInProjectId}
                onValueChange={setClockInProjectId}
                allowNone={false}
                placeholder="Select a project"
                data-testid="quick-action-clock-project"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setClockInOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!clockInProjectId || clockInMutation.isPending}
                  onClick={() => clockInMutation.mutate(clockInProjectId)}
                  data-testid="quick-action-clock-start"
                >
                  {clockInMutation.isPending ? 'Starting…' : 'Start'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
