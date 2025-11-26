import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileButton } from "@/components/ui/MobileButton";
import { BottomSheet } from "@/components/BottomSheet";
import { MobileInput } from "@/components/ui/MobileInput";
import { MobileTextarea } from "@/components/ui/MobileTextarea";
import { Plus, Clock, Play, Square, ChevronLeft, ChevronRight, Timer, DollarSign, Coffee, Loader2 } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, differenceInSeconds } from "date-fns";
import { apiRequest, queryClient, getApiBaseUrl } from "@lib/queryClient";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";
import type { Project } from "@shared/schema";

interface Timesheet {
  id: string;
  projectId: string;
  userId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  duration: string;
  breakDuration: string;
  description: string | null;
  hourlyRate: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  isActive: boolean;
  clockInTime: string | null;
  createdAt: string;
}

interface CostCode {
  id: string;
  code: string;
  title: string;
}

export function Timesheets() {
  const [isLogSheetOpen, setIsLogSheetOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");

  // Form state
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newStartTime, setNewStartTime] = useState("07:00");
  const [newEndTime, setNewEndTime] = useState("15:30");
  const [newBreakDuration, setNewBreakDuration] = useState("0.5");
  const [newHourlyRate, setNewHourlyRate] = useState("");
  const [newCostCodeId, setNewCostCodeId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [timeEntryMode, setTimeEntryMode] = useState<"time" | "duration">("time");
  const [newDuration, setNewDuration] = useState("");

  const currentWeekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });

  const { data: timesheets = [], isLoading, refetch } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/timesheets`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch timesheets");
      return res.json();
    },
    retry: false,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/cost-codes`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  const { data: activeTimesheet, refetch: refetchActive } = useQuery<Timesheet | null>({
    queryKey: ["/api/timesheets/active"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/timesheets/active`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data || null;
    },
    retry: false,
  });

  // Update elapsed time every second when clocked in
  useEffect(() => {
    if (!activeTimesheet?.clockInTime) {
      setElapsedTime("00:00:00");
      return;
    }

    const updateElapsed = () => {
      const clockIn = new Date(activeTimesheet.clockInTime!);
      const now = new Date();
      const seconds = differenceInSeconds(now, clockIn);
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      setElapsedTime(
        `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      );
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeTimesheet?.clockInTime]);

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([refetch(), refetchActive()]);
    },
  });

  const createTimesheetMutation = useMutation({
    mutationFn: async (data: {
      projectId: string;
      date: string;
      startTime?: string;
      endTime?: string;
      duration: string;
      breakDuration: string;
      hourlyRate: string;
      costCodeId: string;
      description: string;
    }) => {
      const res = await apiRequest(`/api/timesheets`, "POST", {
        projectId: data.projectId,
        date: new Date(data.date).toISOString(),
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        duration: data.duration,
        breakDuration: data.breakDuration,
        hourlyRate: data.hourlyRate,
        description: data.description,
        status: "draft",
      });
      const created = await res.json();

      if (data.costCodeId && created.id) {
        await apiRequest(`/api/timesheets/${created.id}/cost-codes`, "POST", {
          costCodeId: data.costCodeId,
          duration: data.duration,
          hourlyRate: data.hourlyRate,
          total: (parseFloat(data.duration) * parseFloat(data.hourlyRate || "0")).toFixed(2),
        });
      }

      return created;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsLogSheetOpen(false);
      resetForm();
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return await apiRequest(`/api/timesheets/clock-in`, "POST", {
        projectId,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      return await apiRequest(`/api/timesheets/clock-out`, "POST", {
        timesheetId,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const resetForm = () => {
    setSelectedProjectId("");
    setNewDate(format(new Date(), "yyyy-MM-dd"));
    setNewStartTime("07:00");
    setNewEndTime("15:30");
    setNewBreakDuration("0.5");
    setNewHourlyRate("");
    setNewCostCodeId("");
    setNewDescription("");
    setNewDuration("");
    setTimeEntryMode("time");
  };

  const calculateDuration = (start: string, end: string, breakDur: string): string => {
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    let minutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (minutes < 0) minutes += 24 * 60;
    const hours = (minutes / 60) - parseFloat(breakDur || "0");
    return Math.max(0, Math.round(hours * 4) / 4).toString();
  };

  const handleSubmit = () => {
    if (!selectedProjectId) return;

    let duration: string;
    if (timeEntryMode === "time") {
      duration = calculateDuration(newStartTime, newEndTime, newBreakDuration);
    } else {
      duration = newDuration;
    }

    createTimesheetMutation.mutate({
      projectId: selectedProjectId,
      date: newDate,
      startTime: timeEntryMode === "time" ? newStartTime : undefined,
      endTime: timeEntryMode === "time" ? newEndTime : undefined,
      duration,
      breakDuration: newBreakDuration,
      hourlyRate: newHourlyRate,
      costCodeId: newCostCodeId,
      description: newDescription,
    });
  };

  // Filter timesheets by week
  const filteredTimesheets = timesheets
    .filter((ts) => {
      const tsDate = new Date(ts.date);
      return tsDate >= currentWeekStart && tsDate <= currentWeekEnd;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalHours = filteredTimesheets.reduce((sum, ts) => sum + parseFloat(ts.duration || "0"), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      case "submitted": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "approved": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "rejected": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  return (
    <div className="flex flex-col h-full">
      <MobileHeader
        title="Timesheets"
        action={
          <MobileButton
            size="icon"
            variant="ghost"
            onClick={() => setIsLogSheetOpen(true)}
            data-testid="button-add-timesheet"
          >
            <Plus className="w-5 h-5" />
          </MobileButton>
        }
      />

      <main className="flex-1 overflow-y-auto" {...pullToRefresh.touchHandlers}>
        <PullToRefreshIndicator {...pullToRefresh} />

        <div className="p-4 space-y-4">
          {/* Clock In/Out Section */}
          <div className={`p-4 rounded-xl ${activeTimesheet ? "bg-green-50 dark:bg-green-950 border-2 border-green-500" : "bg-card border"}`}>
            {activeTimesheet ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-medium text-green-700 dark:text-green-300">Clocked In</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {getProjectName(activeTimesheet.projectId)}
                  </span>
                </div>

                <div className="text-center py-2">
                  <div className="text-4xl font-mono font-bold text-green-600 dark:text-green-400" data-testid="text-elapsed-time">
                    {elapsedTime}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Started {activeTimesheet.clockInTime ? format(new Date(activeTimesheet.clockInTime), "h:mm a") : ""}
                  </p>
                </div>

                <button
                  onClick={() => clockOutMutation.mutate(activeTimesheet.id)}
                  disabled={clockOutMutation.isPending}
                  className="w-full h-14 bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors"
                  data-testid="button-clock-out"
                >
                  <Square className="w-6 h-6" />
                  {clockOutMutation.isPending ? "Clocking Out..." : "Clock Out"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Select a project and clock in</span>
                </div>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full h-11 px-4 bg-background border rounded-lg text-base"
                  data-testid="select-project-clock-in"
                >
                  <option value="">Select a project...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => selectedProjectId && clockInMutation.mutate(selectedProjectId)}
                  disabled={!selectedProjectId || clockInMutation.isPending}
                  className={`w-full h-14 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors ${
                    selectedProjectId
                      ? "bg-green-500 hover:bg-green-600 text-white"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                  data-testid="button-clock-in"
                >
                  <Play className="w-7 h-7" />
                  {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
                </button>
              </div>
            )}
          </div>

          {/* Week Navigation */}
          <div className="flex items-center justify-between bg-card border rounded-lg p-3">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="p-2 hover-elevate rounded-md"
              data-testid="button-prev-week"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-sm font-medium">
                {format(currentWeekStart, "MMM d")} - {format(currentWeekEnd, "MMM d, yyyy")}
              </div>
              <div className="text-xs text-muted-foreground">
                {totalHours.toFixed(1)} hours this week
              </div>
            </div>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="p-2 hover-elevate rounded-md"
              data-testid="button-next-week"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Timesheet List */}
        <div className="px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTimesheets.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No timesheets this week</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Clock in or add a time entry
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTimesheets.map((timesheet) => (
                <div
                  key={timesheet.id}
                  className={`p-3 bg-card border rounded-lg ${timesheet.isActive ? "border-green-500 bg-green-50 dark:bg-green-950" : ""}`}
                  data-testid={`timesheet-card-${timesheet.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {format(new Date(timesheet.date), "EEE, MMM d")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getProjectName(timesheet.projectId)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {timesheet.startTime || "?"} - {timesheet.endTime || "?"}
                        <span className="font-medium ml-2">({parseFloat(timesheet.duration || "0").toFixed(1)}h)</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-1 rounded-md font-medium ${getStatusColor(timesheet.status)}`}>
                        {timesheet.status}
                      </span>
                      {timesheet.isActive && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add Timesheet Sheet */}
      <BottomSheet isOpen={isLogSheetOpen} onClose={() => setIsLogSheetOpen(false)}>
        <div className="p-4 max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-6">Add Time Entry</h2>

          <div className="space-y-4">
            {/* Time Entry Mode Toggle */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setTimeEntryMode("time")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  timeEntryMode === "time"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground"
                }`}
                data-testid="button-mode-time"
              >
                Start/End Time
              </button>
              <button
                onClick={() => setTimeEntryMode("duration")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  timeEntryMode === "duration"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground"
                }`}
                data-testid="button-mode-duration"
              >
                Duration Only
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full h-11 px-4 bg-background border rounded-lg text-base"
                data-testid="select-project"
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <MobileInput
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                data-testid="input-timesheet-date"
              />
            </div>

            {timeEntryMode === "time" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Start Time</label>
                    <MobileInput
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      data-testid="input-timesheet-start"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End Time</label>
                    <MobileInput
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      data-testid="input-timesheet-end"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-1">
                    <Coffee className="w-4 h-4" />
                    Break Duration (hours)
                  </label>
                  <MobileInput
                    type="number"
                    step="0.25"
                    min="0"
                    value={newBreakDuration}
                    onChange={(e) => setNewBreakDuration(e.target.value)}
                    placeholder="0.5"
                    data-testid="input-timesheet-break"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-1">
                  <Timer className="w-4 h-4" />
                  Duration (hours)
                </label>
                <MobileInput
                  type="number"
                  step="0.25"
                  min="0"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  placeholder="8"
                  data-testid="input-timesheet-duration"
                />
              </div>
            )}

            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-1">
                <DollarSign className="w-4 h-4" />
                Hourly Rate ($)
              </label>
              <MobileInput
                type="number"
                step="0.01"
                min="0"
                value={newHourlyRate}
                onChange={(e) => setNewHourlyRate(e.target.value)}
                placeholder="50.00"
                data-testid="input-timesheet-rate"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Cost Code</label>
              <select
                value={newCostCodeId}
                onChange={(e) => setNewCostCodeId(e.target.value)}
                className="w-full h-11 px-4 bg-background border rounded-lg text-base"
                data-testid="select-cost-code"
              >
                <option value="">Select a cost code</option>
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} - {cc.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <MobileTextarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What did you work on?"
                rows={3}
                data-testid="textarea-timesheet-description"
              />
            </div>

            {/* Calculated Duration Preview */}
            {timeEntryMode === "time" && newStartTime && newEndTime && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">Calculated Duration:</div>
                <div className="text-lg font-semibold">
                  {calculateDuration(newStartTime, newEndTime, newBreakDuration)} hours
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={() => {
                  setIsLogSheetOpen(false);
                  resetForm();
                }}
                className="flex-1"
                data-testid="button-cancel-timesheet"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={handleSubmit}
                disabled={!selectedProjectId || createTimesheetMutation.isPending}
                className="flex-1"
                data-testid="button-save-timesheet"
              >
                {createTimesheetMutation.isPending ? "Adding..." : "Add Entry"}
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
