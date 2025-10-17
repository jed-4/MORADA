import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Clock, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet, Project, CostCode } from "@shared/schema";

export function TimeClockWidget() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedCostCodeId, setSelectedCostCodeId] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");

  // Fetch active timesheet
  const { data: activeTimesheet, isLoading: loadingActive } = useQuery<Timesheet | null>({
    queryKey: ["/api/timesheets/active"],
    refetchInterval: (query) => {
      // Only poll if there's an active timesheet
      return query.state.data ? 1000 : false;
    },
  });

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch cost codes
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  // Calculate elapsed time
  useEffect(() => {
    if (activeTimesheet?.clockInTime) {
      const updateElapsed = () => {
        const now = new Date();
        const clockIn = new Date(activeTimesheet.clockInTime!);
        const diffMs = now.getTime() - clockIn.getTime();
        
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        
        setElapsedTime(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      };

      updateElapsed();
      const interval = setInterval(updateElapsed, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime("00:00:00");
    }
  }, [activeTimesheet?.clockInTime]);

  // Clock-in mutation
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) {
        throw new Error("Please select a project");
      }
      return apiRequest("POST", "/api/timesheets/clock-in", {
        projectId: selectedProjectId,
        costCodeId: selectedCostCodeId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      toast({
        title: "Clocked In",
        description: "Timer started successfully",
      });
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clock in",
        variant: "destructive",
      });
    },
  });

  // Clock-out mutation
  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!activeTimesheet) {
        throw new Error("No active timesheet");
      }
      return apiRequest("POST", "/api/timesheets/clock-out", {
        timesheetId: activeTimesheet.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      toast({
        title: "Clocked Out",
        description: "Timer stopped successfully",
      });
      setSelectedProjectId("");
      setSelectedCostCodeId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clock out",
        variant: "destructive",
      });
    },
  });

  const handleClockIn = () => {
    clockInMutation.mutate();
  };

  const handleClockOut = () => {
    clockOutMutation.mutate();
  };

  // Get active project name
  const activeProject = activeTimesheet
    ? projects.find(p => p.id === activeTimesheet.projectId)
    : null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-clock-widget"
        >
          <Clock className="h-5 w-5" />
          {activeTimesheet && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" data-testid="popover-clock-widget">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Time Clock</h3>
            {activeTimesheet && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Active
              </Badge>
            )}
          </div>

          {activeTimesheet ? (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold font-mono" data-testid="text-elapsed-time">
                  {elapsedTime}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {activeProject?.name || "Unknown Project"}
                </div>
              </div>

              <Button
                onClick={handleClockOut}
                disabled={clockOutMutation.isPending}
                className="w-full"
                variant="destructive"
                data-testid="button-clock-out"
              >
                <Square className="h-4 w-4 mr-2" />
                {clockOutMutation.isPending ? "Stopping..." : "Stop"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold font-mono text-muted-foreground">
                  {elapsedTime}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Not clocked in
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Project <span className="text-destructive">*</span>
                  </label>
                  <Select
                    value={selectedProjectId}
                    onValueChange={setSelectedProjectId}
                    disabled={loadingActive}
                  >
                    <SelectTrigger data-testid="select-project">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Cost Code (Optional)
                  </label>
                  <Select
                    value={selectedCostCodeId}
                    onValueChange={setSelectedCostCodeId}
                    disabled={loadingActive}
                  >
                    <SelectTrigger data-testid="select-cost-code">
                      <SelectValue placeholder="Select a cost code" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {costCodes
                        .filter(cc => cc.availableInTimesheets)
                        .map((costCode) => (
                          <SelectItem key={costCode.id} value={costCode.id}>
                            {costCode.code} - {costCode.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleClockIn}
                disabled={!selectedProjectId || clockInMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white"
                data-testid="button-clock-in"
              >
                <Play className="h-4 w-4 mr-2" />
                {clockInMutation.isPending ? "Starting..." : "Start"}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
