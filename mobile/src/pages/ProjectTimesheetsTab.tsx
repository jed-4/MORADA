import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Loader2, Clock, Play, Square, Trash2, Calendar } from "lucide-react";
import { SwipeableCard } from "@/components/SwipeableCard";
import { BottomSheet } from "@/components/BottomSheet";
import { MobileInput } from "@/components/ui/MobileInput";
import { MobileTextarea } from "@/components/ui/MobileTextarea";
import { MobileButton } from "@/components/ui/MobileButton";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { apiRequest, queryClient, getApiBaseUrl } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

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
  status: "draft" | "submitted" | "approved" | "rejected";
  isActive: boolean;
  clockInTime: string | null;
  createdAt: string;
}

export function ProjectTimesheetsTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state for new timesheet
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newEndTime, setNewEndTime] = useState("17:00");
  const [newDescription, setNewDescription] = useState("");

  const currentWeekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });

  const { data: timesheets = [], isLoading, refetch } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/timesheets?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch timesheets");
      return res.json();
    },
    enabled: !!currentProject,
    retry: false,
  });

  // Check for active timesheet
  const { data: activeTimesheet } = useQuery<Timesheet | null>({
    queryKey: ["/api/timesheets/active"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/timesheets/active`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refetch().then(() => undefined);
    },
  });

  const createTimesheetMutation = useMutation({
    mutationFn: async (data: { 
      date: string;
      startTime: string;
      endTime: string;
      description: string;
    }) => {
      // Calculate duration
      const [startH, startM] = data.startTime.split(":").map(Number);
      const [endH, endM] = data.endTime.split(":").map(Number);
      const duration = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;

      return await apiRequest(`/api/timesheets`, "POST", {
        projectId: currentProject?.id,
        date: new Date(data.date).toISOString(),
        startTime: data.startTime,
        endTime: data.endTime,
        duration: duration.toString(),
        description: data.description,
        status: "draft",
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      setNewDate(format(new Date(), "yyyy-MM-dd"));
      setNewStartTime("09:00");
      setNewEndTime("17:00");
      setNewDescription("");
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/timesheets/clock-in`, "POST", {
        projectId: currentProject?.id,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/timesheets/clock-out`, "POST", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const deleteTimesheetMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      return await apiRequest(`/api/timesheets/${timesheetId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  // Filter timesheets by week
  const filteredTimesheets = timesheets
    .filter((ts) => {
      const tsDate = new Date(ts.date);
      return tsDate >= currentWeekStart && tsDate <= currentWeekEnd;
    })
    .filter((ts) => 
      !searchQuery || ts.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalHours = filteredTimesheets.reduce((sum, ts) => sum + parseFloat(ts.duration || "0"), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-800";
      case "submitted": return "bg-blue-100 text-blue-800";
      case "approved": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4 space-y-3">
        {/* Clock In/Out Button */}
        <div className="flex gap-2">
          {activeTimesheet ? (
            <button
              onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              className="flex-1 h-12 bg-red-500 text-white rounded-lg flex items-center justify-center gap-2 font-medium"
              data-testid="button-clock-out"
            >
              <Square className="w-5 h-5" />
              {clockOutMutation.isPending ? "Clocking Out..." : "Clock Out"}
            </button>
          ) : (
            <button
              onClick={() => clockInMutation.mutate()}
              disabled={clockInMutation.isPending}
              className="flex-1 h-12 bg-green-500 text-white rounded-lg flex items-center justify-center gap-2 font-medium"
              data-testid="button-clock-in"
            >
              <Play className="w-5 h-5" />
              {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
            </button>
          )}
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between bg-card border rounded-lg p-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 hover-elevate rounded-md"
            data-testid="button-prev-week"
          >
            <Calendar className="w-4 h-4" />
          </button>
          <div className="text-center">
            <div className="text-sm font-medium">
              {format(currentWeekStart, "MMM d")} - {format(currentWeekEnd, "MMM d, yyyy")}
            </div>
            <div className="text-xs text-muted-foreground">
              {totalHours.toFixed(1)} hours
            </div>
          </div>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 hover-elevate rounded-md"
            data-testid="button-next-week"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search timesheets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-timesheets"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.handlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTimesheets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No timesheets for this week</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTimesheets.map((timesheet) => (
              <SwipeableCard
                key={timesheet.id}
                onSwipeLeft={() => deleteTimesheetMutation.mutate(timesheet.id)}
                rightAction={{
                  icon: <Trash2 className="w-5 h-5" />,
                  color: "bg-red-500",
                  label: "Delete",
                }}
              >
                <div
                  onClick={() => {
                    setSelectedTimesheet(timesheet);
                    setIsDetailOpen(true);
                  }}
                  className={`p-3 bg-card border rounded-lg ${timesheet.isActive ? "border-green-500" : ""}`}
                  data-testid={`timesheet-card-${timesheet.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">
                          {format(new Date(timesheet.date), "EEE, MMM d")}
                        </span>
                        {timesheet.isActive && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {timesheet.startTime || "?"} - {timesheet.endTime || "?"} ({parseFloat(timesheet.duration || "0").toFixed(1)}h)
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(timesheet.status)}`}>
                      {timesheet.status}
                    </span>
                  </div>
                  
                  {timesheet.description && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                      {timesheet.description}
                    </p>
                  )}
                </div>
              </SwipeableCard>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setIsAddOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[#bba7db] text-white rounded-full shadow-lg flex items-center justify-center"
        data-testid="button-add-timesheet"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Timesheet Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="p-4">
          <h2 className="text-xl font-bold mb-6">Add Time Entry</h2>
          
          <div className="space-y-4">
            <MobileInput
              label="Date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              data-testid="input-timesheet-date"
            />

            <div className="grid grid-cols-2 gap-3">
              <MobileInput
                label="Start Time"
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                data-testid="input-timesheet-start"
              />
              <MobileInput
                label="End Time"
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                data-testid="input-timesheet-end"
              />
            </div>

            <MobileTextarea
              label="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
              data-testid="textarea-timesheet-description"
            />

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="flex-1"
                data-testid="button-cancel-timesheet"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={() => createTimesheetMutation.mutate({
                  date: newDate,
                  startTime: newStartTime,
                  endTime: newEndTime,
                  description: newDescription,
                })}
                disabled={createTimesheetMutation.isPending}
                className="flex-1"
                data-testid="button-save-timesheet"
              >
                {createTimesheetMutation.isPending ? "Adding..." : "Add Entry"}
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)}>
        {selectedTimesheet && (
          <div className="p-4">
            <h2 className="text-xl font-bold mb-2">
              {format(new Date(selectedTimesheet.date), "EEEE, MMMM d, yyyy")}
            </h2>
            
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedTimesheet.status)}`}>
                {selectedTimesheet.status}
              </span>
              {selectedTimesheet.isActive && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Active
                </span>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time:</span>
                <span>{selectedTimesheet.startTime || "?"} - {selectedTimesheet.endTime || "?"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span>{parseFloat(selectedTimesheet.duration || "0").toFixed(1)} hours</span>
              </div>
              {selectedTimesheet.breakDuration && parseFloat(selectedTimesheet.breakDuration) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Break:</span>
                  <span>{parseFloat(selectedTimesheet.breakDuration).toFixed(1)} hours</span>
                </div>
              )}
            </div>

            {selectedTimesheet.description && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedTimesheet.description}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-6">
              <MobileButton
                onClick={() => setIsDetailOpen(false)}
                className="flex-1"
                data-testid="button-close-timesheet-detail"
              >
                Close
              </MobileButton>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
