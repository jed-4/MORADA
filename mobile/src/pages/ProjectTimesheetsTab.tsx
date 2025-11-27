import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Search, Loader2, Clock, Play, Square, ChevronLeft, ChevronRight, Timer, DollarSign, Coffee, Pencil, Camera, X, Image, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { MobileInput } from "@/components/ui/MobileInput";
import { MobileTextarea } from "@/components/ui/MobileTextarea";
import { MobileButton } from "@/components/ui/MobileButton";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { apiRequest, queryClient, getApiBaseUrl } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { CameraResultType, CameraSource } from "@capacitor/camera";
import { getHaptics, getCamera } from "@/lib/capacitor";
import { format, startOfWeek, endOfWeek, addWeeks, differenceInSeconds } from "date-fns";

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
  attachments: string[] | null;
  costCodeId: string | null;
  labels: string[] | null;
}

interface FieldOption {
  id: string;
  key: string;
  name: string;
  color: string | null;
  isActive: boolean;
}

interface CostCode {
  id: string;
  code: string;
  title: string;
}

// Generate time options starting from 6:30 AM in 15-minute increments
function generateTimeOptions() {
  const times: { value: string; label: string }[] = [];
  
  // Start from 6:30 AM (6.5 hours) and go to 11:45 PM, then wrap to midnight through 6:15 AM
  // This puts work hours first in the list
  for (let i = 0; i < 96; i++) { // 96 = 24 hours * 4 (15-min increments)
    // Start at 6:30 AM (index 26 in a normal 0-based 15-min list)
    const adjustedIndex = (i + 26) % 96;
    const totalMinutes = adjustedIndex * 15;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    const value = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    
    // Format label as 12-hour time
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const label = `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
    
    times.push({ value, label });
  }
  
  return times;
}

export function ProjectTimesheetsTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTimesheetId, setEditingTimesheetId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");

  // Form state for new timesheet
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newStartTime, setNewStartTime] = useState("07:00");
  const [newEndTime, setNewEndTime] = useState("15:30");
  const [newBreakDuration, setNewBreakDuration] = useState("0.5");
  const [newHourlyRate, setNewHourlyRate] = useState("");
  const [newCostCodeId, setNewCostCodeId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [timeEntryMode, setTimeEntryMode] = useState<"time" | "duration">("time");
  const [newDuration, setNewDuration] = useState("");
  
  // Split cost code state
  const [isSplitCostCode, setIsSplitCostCode] = useState(false);
  const [secondCostCodeId, setSecondCostCodeId] = useState("");
  const [firstCostCodeDuration, setFirstCostCodeDuration] = useState("");
  const [secondCostCodeDuration, setSecondCostCodeDuration] = useState("");
  
  // Photos state
  const [photos, setPhotos] = useState<string[]>([]);
  
  // Labels state
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

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
    enabled: !!currentProject?.id,
    retry: false,
  });

  // Fetch cost codes (only those available in timesheets)
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes", { timesheets: true }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/cost-codes?timesheets=true`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  // Fetch timesheet label options
  const { data: labelOptions = [] } = useQuery<FieldOption[]>({
    queryKey: ["/api/field-options", { categoryKey: "timesheet.label" }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/field-options?categoryKey=timesheet.label`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  // Check for active timesheet
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
      date: string;
      startTime?: string;
      endTime?: string;
      duration: string;
      breakDuration: string;
      hourlyRate: string;
      costCodeId: string;
      costCodes?: { costCodeId: string; duration: string }[];
      description: string;
      attachments?: string[];
      labels?: string[];
    }) => {
      const res = await apiRequest(`/api/timesheets`, "POST", {
        projectId: currentProject?.id,
        date: new Date(data.date).toISOString(),
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        duration: data.duration,
        breakDuration: data.breakDuration,
        hourlyRate: data.hourlyRate,
        description: data.description,
        labels: data.labels || [],
        status: "draft",
      });
      const created = await res.json();
      
      if (data.costCodes && data.costCodes.length > 0 && created.id) {
        for (const cc of data.costCodes) {
          await apiRequest(`/api/timesheets/${created.id}/cost-codes`, "POST", {
            costCodeId: cc.costCodeId,
            duration: cc.duration,
            hourlyRate: data.hourlyRate,
            total: (parseFloat(cc.duration) * parseFloat(data.hourlyRate || "0")).toFixed(2),
          });
        }
      }
      
      return created;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      resetForm();
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
    mutationFn: async (timesheetId: string) => {
      return await apiRequest(`/api/timesheets/clock-out`, "POST", {
        timesheetId,
      });
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

  const updateTimesheetMutation = useMutation({
    mutationFn: async (data: { 
      id: string;
      date: string;
      startTime?: string;
      endTime?: string;
      duration: string;
      breakDuration: string;
      hourlyRate: string;
      costCodeId?: string;
      costCodes?: { costCodeId: string; duration: string }[];
      description: string;
      attachments?: string[];
      labels?: string[];
    }) => {
      const res = await apiRequest(`/api/timesheets/${data.id}`, "PATCH", {
        date: new Date(data.date).toISOString(),
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        duration: data.duration,
        breakDuration: data.breakDuration,
        hourlyRate: data.hourlyRate,
        description: data.description,
        labels: data.labels || [],
      });

      const baseUrl = getApiBaseUrl();
      const existingRes = await fetch(`${baseUrl}/api/timesheets/${data.id}/cost-codes`, {
        credentials: "include",
      });
      const existingCostCodes = await existingRes.json();

      for (const existing of (existingCostCodes || [])) {
        await apiRequest(`/api/timesheets/cost-codes/${existing.id}`, "DELETE", {});
      }

      if (data.costCodes && data.costCodes.length > 0) {
        for (const cc of data.costCodes) {
          await apiRequest(`/api/timesheets/${data.id}/cost-codes`, "POST", {
            costCodeId: cc.costCodeId,
            duration: cc.duration,
            hourlyRate: data.hourlyRate,
            total: (parseFloat(cc.duration) * parseFloat(data.hourlyRate || "0")).toFixed(2),
          });
        }
      }

      return res;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      setIsEditMode(false);
      setEditingTimesheetId(null);
      resetForm();
    },
  });

  const resetForm = () => {
    setNewDate(format(new Date(), "yyyy-MM-dd"));
    setNewStartTime("07:00");
    setNewEndTime("15:30");
    setNewBreakDuration("0.5");
    setNewHourlyRate("");
    setNewCostCodeId("");
    setNewDescription("");
    setNewDuration("");
    setTimeEntryMode("time");
    setIsEditMode(false);
    setEditingTimesheetId(null);
    setIsSplitCostCode(false);
    setSecondCostCodeId("");
    setFirstCostCodeDuration("");
    setSecondCostCodeDuration("");
    setPhotos([]);
    setSelectedLabels([]);
  };

  const openEditMode = async (timesheet: Timesheet) => {
    setIsDetailOpen(false);
    setIsEditMode(true);
    setEditingTimesheetId(timesheet.id);
    setNewDate(format(new Date(timesheet.date), "yyyy-MM-dd"));
    setNewStartTime(timesheet.startTime || "07:00");
    setNewEndTime(timesheet.endTime || "15:30");
    setNewBreakDuration(timesheet.breakDuration || "0.5");
    setNewHourlyRate(timesheet.hourlyRate || "");
    setNewDescription(timesheet.description || "");
    setNewDuration(timesheet.duration || "");
    setTimeEntryMode(timesheet.startTime ? "time" : "duration");
    setPhotos(timesheet.attachments || []);
    setSelectedLabels(timesheet.labels || []);
    
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/timesheets/${timesheet.id}/cost-codes`, {
        credentials: "include",
      });
      const existingCostCodes = await res.json();
      if (existingCostCodes && existingCostCodes.length > 1) {
        setIsSplitCostCode(true);
        setNewCostCodeId(existingCostCodes[0].costCodeId);
        setFirstCostCodeDuration(existingCostCodes[0].duration || "");
        setSecondCostCodeId(existingCostCodes[1].costCodeId);
        setSecondCostCodeDuration(existingCostCodes[1].duration || "");
      } else if (existingCostCodes && existingCostCodes.length === 1) {
        setIsSplitCostCode(false);
        setNewCostCodeId(existingCostCodes[0].costCodeId);
        setSecondCostCodeId("");
        setFirstCostCodeDuration("");
        setSecondCostCodeDuration("");
      } else {
        setIsSplitCostCode(false);
        setNewCostCodeId("");
        setSecondCostCodeId("");
        setFirstCostCodeDuration("");
        setSecondCostCodeDuration("");
      }
    } catch {
      setIsSplitCostCode(false);
      setNewCostCodeId("");
      setSecondCostCodeId("");
    }
    
    setIsAddOpen(true);
  };

  // Calculate duration from start/end time
  const calculateDuration = (start: string, end: string, breakDur: string): string => {
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    let minutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (minutes < 0) minutes += 24 * 60; // Handle overnight
    const hours = (minutes / 60) - parseFloat(breakDur || "0");
    return Math.max(0, Math.round(hours * 4) / 4).toString(); // Round to nearest 0.25
  };

  const handleTakePhoto = async () => {
    try {
      const CameraPlugin = await getCamera();
      const image = await CameraPlugin.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });
      
      if (image.base64String) {
        const base64Image = `data:image/${image.format};base64,${image.base64String}`;
        setPhotos(prev => [...prev, base64Image]);
      }
    } catch (err) {
      console.log("Camera cancelled or error:", err);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

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
      case "draft": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      case "submitted": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "approved": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "rejected": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getCostCodeName = (costCodeId: string | null) => {
    if (!costCodeId) return null;
    const costCode = costCodes.find(cc => cc.id === costCodeId);
    return costCode ? `${costCode.code} - ${costCode.title}` : null;
  };

  const getLabelInfo = (labelKey: string) => {
    const option = labelOptions.find(opt => opt.key === labelKey);
    return option || null;
  };

  const handleSubmit = () => {
    if (!newCostCodeId && !isSplitCostCode) return;
    if (isSplitCostCode && (!newCostCodeId || !secondCostCodeId)) return;

    let duration: string;
    if (timeEntryMode === "time") {
      duration = calculateDuration(newStartTime, newEndTime, newBreakDuration);
    } else {
      duration = newDuration;
    }

    const costCodesToSubmit = isSplitCostCode 
      ? [
          { costCodeId: newCostCodeId, duration: firstCostCodeDuration },
          { costCodeId: secondCostCodeId, duration: secondCostCodeDuration },
        ].filter(cc => cc.costCodeId)
      : newCostCodeId 
        ? [{ costCodeId: newCostCodeId, duration }]
        : [];

    if (isEditMode && editingTimesheetId) {
      updateTimesheetMutation.mutate({
        id: editingTimesheetId,
        date: newDate,
        startTime: timeEntryMode === "time" ? newStartTime : undefined,
        endTime: timeEntryMode === "time" ? newEndTime : undefined,
        duration,
        breakDuration: newBreakDuration,
        hourlyRate: newHourlyRate,
        costCodeId: newCostCodeId || undefined,
        costCodes: costCodesToSubmit,
        description: newDescription,
        attachments: photos,
        labels: selectedLabels,
      });
    } else {
      createTimesheetMutation.mutate({
        date: newDate,
        startTime: timeEntryMode === "time" ? newStartTime : undefined,
        endTime: timeEntryMode === "time" ? newEndTime : undefined,
        duration,
        breakDuration: newBreakDuration,
        hourlyRate: newHourlyRate,
        costCodeId: newCostCodeId,
        costCodes: costCodesToSubmit,
        description: newDescription,
        attachments: photos,
        labels: selectedLabels,
      });
    }
  };

  const toggleLabel = (labelKey: string) => {
    setSelectedLabels(prev => 
      prev.includes(labelKey)
        ? prev.filter(k => k !== labelKey)
        : [...prev, labelKey]
    );
  };

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4 space-y-3">
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
                  Started {activeTimesheet.clockInTime ? format(new Date(activeTimesheet.clockInTime), "h:mm a") : ""}
                </span>
              </div>
              
              <div className="text-center py-2">
                <div className="text-4xl font-mono font-bold text-green-600 dark:text-green-400" data-testid="text-elapsed-time">
                  {elapsedTime}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Time elapsed</p>
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
            <button
              onClick={() => clockInMutation.mutate()}
              disabled={clockInMutation.isPending}
              style={{ backgroundColor: currentProject?.color || "#22c55e" }}
              className="w-full h-16 text-white rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors hover:opacity-90"
              data-testid="button-clock-in"
            >
              <Play className="w-7 h-7" />
              {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
            </button>
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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search timesheets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-timesheets"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24" {...pullToRefresh.touchHandlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTimesheets.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No timesheets for this week</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Clock in or add a time entry</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTimesheets.map((timesheet) => (
              <div
                key={timesheet.id}
                onClick={() => {
                  setSelectedTimesheet(timesheet);
                  setIsDetailOpen(true);
                }}
                className={`p-3 bg-card border rounded-lg cursor-pointer active:bg-muted/50 ${timesheet.isActive ? "border-green-500 bg-green-50 dark:bg-green-950" : ""}`}
                data-testid={`timesheet-card-${timesheet.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">
                        {format(new Date(timesheet.date), "EEE, MMM d")}
                      </span>
                      {timesheet.isActive && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {timesheet.startTime || "?"} - {timesheet.endTime || "?"} 
                      <span className="font-medium ml-2">({parseFloat(timesheet.duration || "0").toFixed(1)}h)</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-md font-medium ${getStatusColor(timesheet.status)}`}>
                    {timesheet.status}
                  </span>
                </div>
                
                {timesheet.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                    {timesheet.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setIsAddOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-50"
        data-testid="button-add-timesheet"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Timesheet Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="p-4 max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">{isEditMode ? "Edit Time Entry" : "Add Time Entry"}</h2>
          
          <div className="space-y-0">
            {/* Time Entry Mode Toggle */}
            <div className="py-3 border-b">
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
            </div>

            <div className="py-3 border-b">
              <label className="block text-sm text-muted-foreground mb-2">Date</label>
              <MobileInput
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                data-testid="input-timesheet-date"
              />
            </div>

            {timeEntryMode === "time" ? (
              <>
                <div className="py-3 border-b">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Start Time</label>
                      <select
                        value={newStartTime}
                        onChange={(e) => setNewStartTime(e.target.value)}
                        className="w-full h-11 px-4 bg-background border rounded-lg text-base"
                        data-testid="input-timesheet-start"
                      >
                        {generateTimeOptions().map((time) => (
                          <option key={time.value} value={time.value}>
                            {time.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">End Time</label>
                      <select
                        value={newEndTime}
                        onChange={(e) => setNewEndTime(e.target.value)}
                        className="w-full h-11 px-4 bg-background border rounded-lg text-base"
                        data-testid="input-timesheet-end"
                      >
                        {generateTimeOptions().map((time) => (
                          <option key={time.value} value={time.value}>
                            {time.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="py-3 border-b">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
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
              <div className="py-3 border-b">
                <label className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
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

            <div className="py-3 border-b">
              <label className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
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

            {/* Cost Code Section */}
            <div className="py-3 border-b">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">Cost Code</label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    id="splitCostCode"
                    checked={isSplitCostCode}
                    onChange={(e) => {
                      setIsSplitCostCode(e.target.checked);
                      if (!e.target.checked) {
                        setSecondCostCodeId("");
                        setFirstCostCodeDuration("");
                        setSecondCostCodeDuration("");
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300"
                    data-testid="checkbox-split-cost-code"
                  />
                  Split codes
                </label>
              </div>
              
              {!isSplitCostCode ? (
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
              ) : (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium">Cost Code 1</label>
                    <select
                      value={newCostCodeId}
                      onChange={(e) => setNewCostCodeId(e.target.value)}
                      className="w-full h-11 px-4 bg-background border rounded-lg text-base"
                      data-testid="select-cost-code-1"
                    >
                      <option value="">Select a cost code</option>
                      {costCodes.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} - {cc.title}
                        </option>
                      ))}
                    </select>
                    <MobileInput
                      type="number"
                      step="0.25"
                      min="0"
                      value={firstCostCodeDuration}
                      onChange={(e) => setFirstCostCodeDuration(e.target.value)}
                      placeholder="Hours"
                      data-testid="input-cost-code-1-duration"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium">Cost Code 2</label>
                    <select
                      value={secondCostCodeId}
                      onChange={(e) => setSecondCostCodeId(e.target.value)}
                      className="w-full h-11 px-4 bg-background border rounded-lg text-base"
                      data-testid="select-cost-code-2"
                    >
                      <option value="">Select a cost code</option>
                      {costCodes.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} - {cc.title}
                        </option>
                      ))}
                    </select>
                    <MobileInput
                      type="number"
                      step="0.25"
                      min="0"
                      value={secondCostCodeDuration}
                      onChange={(e) => setSecondCostCodeDuration(e.target.value)}
                      placeholder="Hours"
                      data-testid="input-cost-code-2-duration"
                    />
                  </div>

                  {(firstCostCodeDuration || secondCostCodeDuration) && (
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Total: {(parseFloat(firstCostCodeDuration || "0") + parseFloat(secondCostCodeDuration || "0")).toFixed(2)} hours
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="py-3 border-b">
              <label className="block text-sm text-muted-foreground mb-2">Description</label>
              <MobileTextarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What did you work on?"
                rows={3}
                data-testid="textarea-timesheet-description"
              />
            </div>

            {/* Labels Section */}
            {labelOptions.length > 0 && (
              <div className="py-3 border-b">
                <label className="block text-sm text-muted-foreground mb-2">Labels</label>
                <div className="flex flex-wrap gap-2">
                  {labelOptions.map((option) => {
                    const isSelected = selectedLabels.includes(option.key);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleLabel(option.key)}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                          isSelected ? 'ring-2 ring-offset-1' : 'opacity-60'
                        }`}
                        style={{
                          backgroundColor: option.color ? `${option.color}20` : undefined,
                          color: option.color || undefined,
                          borderColor: option.color || undefined,
                          border: `1px solid ${option.color || '#ccc'}`,
                          ringColor: option.color || undefined,
                        }}
                        data-testid={`button-label-${option.key}`}
                      >
                        {option.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photos Section */}
            <div className="py-3 border-b">
              <label className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Camera className="w-4 h-4" />
                Photos
              </label>
              
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative w-20 h-20">
                      <img
                        src={photo}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                        data-testid={`button-remove-photo-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <MobileButton
                type="button"
                variant="outline"
                onClick={handleTakePhoto}
                className="w-full"
                data-testid="button-add-photo"
              >
                <Camera className="w-4 h-4 mr-2" />
                {photos.length > 0 ? "Add Another Photo" : "Add Photo"}
              </MobileButton>
            </div>

            {/* Calculated Duration Preview */}
            {timeEntryMode === "time" && newStartTime && newEndTime && (
              <div className="py-3 border-b">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Calculated Duration</span>
                  <span className="text-lg font-semibold">
                    {calculateDuration(newStartTime, newEndTime, newBreakDuration)} hours
                  </span>
                </div>
              </div>
            )}

            <div className="py-4 mt-2">
              <div className="flex gap-3">
                <MobileButton
                  variant="outline"
                  onClick={() => {
                    setIsAddOpen(false);
                    resetForm();
                  }}
                  className="flex-1"
                  data-testid="button-cancel-timesheet"
                >
                  Cancel
                </MobileButton>
                <MobileButton
                  onClick={handleSubmit}
                  disabled={
                    (!newCostCodeId && !isSplitCostCode) ||
                    (isSplitCostCode && (!newCostCodeId || !secondCostCodeId)) ||
                    createTimesheetMutation.isPending || 
                    updateTimesheetMutation.isPending
                  }
                  className="flex-1"
                  data-testid="button-save-timesheet"
                >
                  {isEditMode 
                    ? (updateTimesheetMutation.isPending ? "Updating..." : "Update")
                    : (createTimesheetMutation.isPending ? "Adding..." : "Add Entry")
                  }
                </MobileButton>
              </div>
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
              <span className={`text-xs px-2 py-1 rounded-md font-medium ${getStatusColor(selectedTimesheet.status)}`}>
                {selectedTimesheet.status}
              </span>
              {selectedTimesheet.isActive && (
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded-md flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Active
                </span>
              )}
            </div>

            <div className="space-y-0 text-sm">
              <div className="flex justify-between py-3 border-b">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{selectedTimesheet.startTime || "?"} - {selectedTimesheet.endTime || "?"}</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{parseFloat(selectedTimesheet.duration || "0").toFixed(1)} hours</span>
              </div>
              {selectedTimesheet.breakDuration && parseFloat(selectedTimesheet.breakDuration) > 0 && (
                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Break</span>
                  <span className="font-medium">{parseFloat(selectedTimesheet.breakDuration).toFixed(1)} hours</span>
                </div>
              )}
              {selectedTimesheet.hourlyRate && (
                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Hourly Rate</span>
                  <span className="font-medium">${parseFloat(selectedTimesheet.hourlyRate).toFixed(2)}</span>
                </div>
              )}
              {getCostCodeName(selectedTimesheet.costCodeId) && (
                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Cost Code</span>
                  <span className="font-medium text-right max-w-[60%]">{getCostCodeName(selectedTimesheet.costCodeId)}</span>
                </div>
              )}
            </div>

            {selectedTimesheet.labels && selectedTimesheet.labels.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Labels</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTimesheet.labels.map((labelKey, idx) => {
                    const labelInfo = getLabelInfo(labelKey);
                    return (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 rounded-md font-medium"
                        style={{
                          backgroundColor: labelInfo?.color ? `${labelInfo.color}20` : undefined,
                          color: labelInfo?.color || undefined,
                          border: labelInfo?.color ? `1px solid ${labelInfo.color}` : undefined,
                        }}
                      >
                        {labelInfo?.name || labelKey}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedTimesheet.description && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedTimesheet.description}
                </p>
              </div>
            )}

            {selectedTimesheet.attachments && selectedTimesheet.attachments.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Photos ({selectedTimesheet.attachments.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTimesheet.attachments.map((photo, idx) => (
                    <img
                      key={idx}
                      src={photo}
                      alt={`Photo ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border"
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-6">
              <MobileButton
                variant="outline"
                onClick={() => setIsDetailOpen(false)}
                className="flex-1"
                data-testid="button-close-timesheet-detail"
              >
                Close
              </MobileButton>
              {(selectedTimesheet.status === "draft" || !selectedTimesheet.isActive) && (
                <>
                  <MobileButton
                    variant="outline"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this timesheet?")) {
                        deleteTimesheetMutation.mutate(selectedTimesheet.id);
                        setIsDetailOpen(false);
                      }
                    }}
                    className="text-red-500 border-red-500"
                    data-testid="button-delete-timesheet"
                  >
                    <Trash2 className="w-4 h-4" />
                  </MobileButton>
                  <MobileButton
                    onClick={() => openEditMode(selectedTimesheet)}
                    className="flex-1"
                    data-testid="button-edit-timesheet"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </MobileButton>
                </>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
