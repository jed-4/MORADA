import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Plus, Clock, Search, Calendar as CalendarIcon, X, CalendarRange, Download, Upload, ChevronDown, Settings2, Table2, Users2, CalendarDays, ChevronLeft, ChevronRight, Zap, Play, Square, CircleCheck, Trash2, HardHat, MoreHorizontal, Pencil, Copy, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, startOfWeek, endOfWeek, addWeeks, isWithinInterval, parseISO, eachDayOfInterval, isSameDay, addDays, subWeeks, getDay } from "date-fns";
import { useTimesheetDateFormat, formatTimesheetDate } from "@/hooks/useTimesheetDateFormat";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TimesheetDialog } from "@/components/TimesheetDialog";
import { RapidApprovalModal } from "@/components/RapidApprovalModal";
import { SubcontractorPODialog } from "@/components/SubcontractorPODialog";
import { TimesheetImportDialog } from "@/components/TimesheetImportDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectSelect } from "@/components/ProjectSelect";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Timesheet, Project, User as UserType, CostCode, CompanySettings } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnPicker, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";

const TABLE_STORAGE_KEY = "timesheets";
const LEGACY_STORAGE_KEY = "timesheets-column-config-v1";

const PICKER_COLUMNS: { id: string; label: string; pinned?: boolean }[] = [
  { id: "select", label: "Select", pinned: true },
  { id: "date", label: "Date" },
  { id: "user", label: "User" },
  { id: "project", label: "Project" },
  { id: "costCode", label: "Cost Code" },
  { id: "startTime", label: "Start" },
  { id: "endTime", label: "End" },
  { id: "break", label: "Break" },
  { id: "hours", label: "Hours" },
  { id: "rate", label: "Rate" },
  { id: "total", label: "Total" },
  { id: "labels", label: "Labels" },
  { id: "status", label: "Status" },
  { id: "poStatus", label: "PO Status" },
  { id: "description", label: "Description" },
];

export default function Timesheets() {
  const { toast } = useToast();
  const { user } = useAuth();
  const weekStartDay = useWeekStartDay();
  const tsDateFormat = useTimesheetDateFormat();
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Permission check for editing timesheets.
  // The `user` object exposes `roleName` (free-text, e.g. "Office Manager",
  // "General Manager", "Admin") — there is no `role` field. We treat any role
  // whose name contains owner/admin/manager as a manager-like role, and we
  // also let through anyone who has the existing approve-timesheets permission.
  const isManagerLikeRole = (roleName?: string | null): boolean => {
    if (!roleName) return false;
    const n = roleName.toLowerCase();
    return n.includes("owner") || n.includes("admin") || n.includes("manager");
  };
  const canEditTimesheet = (timesheet: Timesheet): boolean => {
    if (!user) return false;
    // User can edit their own timesheets
    if (timesheet.userId === user.id) return true;
    // Anyone allowed to approve timesheets can also edit them
    if (canApproveTimesheets) return true;
    // Manager-style roles can edit all timesheets
    if (isManagerLikeRole(user.roleName)) return true;
    return false;
  };
  const [selectedTimesheets, setSelectedTimesheets] = useState<string[]>([]);
  // Single-row delete confirmation (kept at page level so the dialog isn't
  // unmounted when the row's actions menu closes).
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [selectedCostCodes, setSelectedCostCodes] = useState<string[]>([]);
  const [showInvoicedOnly, setShowInvoicedOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRapidApprovalOpen, setIsRapidApprovalOpen] = useState(false);
  const [isSubPODialogOpen, setIsSubPODialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | undefined>();
  const [dateRangeType, setDateRangeType] = useState<string>("all");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  
  // View state: table, weekly, calendar
  const [activeView, setActiveView] = useState<"table" | "weekly" | "calendar">("table");

  // Ref to the main content scroll container — used to jump to 7 am when calendar opens
  const contentScrollRef = useRef<HTMLDivElement>(null);
  
  // Weekly view state
  const [weeklyViewDate, setWeeklyViewDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  
  // Calendar view state
  const [calendarWeek, setCalendarWeek] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));

  // Clock-in state
  const [isClockInOpen, setIsClockInOpen] = useState(false);
  const [clockInProjectId, setClockInProjectId] = useState<string>("");
  const [clockInCostCodeId, setClockInCostCodeId] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");

  // (Sort, column visibility, ordering, sizing handled by DataTable.)

  // Fetch timesheets - project-specific or all
  const { data: timesheets = [], isLoading: loadingTimesheets } = useQuery<Timesheet[]>({
    queryKey: projectId ? ["/api/projects", projectId, "timesheets"] : ["/api/timesheets"],
    queryFn: async () => {
      const url = projectId ? `/api/projects/${projectId}/timesheets` : "/api/timesheets";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch timesheets");
      return res.json();
    },
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch users for filter
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Fetch cost codes for display
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  // Fetch company settings for brand colour fallback
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const { data: canApproveTimesheets = false } = useQuery<boolean>({
    queryKey: ["/api/user/can-approve-timesheets"],
  });

  // Fetch active timesheet for clock-in/out
  const { data: activeTimesheet } = useQuery<Timesheet | null>({
    queryKey: ["/api/timesheets/active"],
  });

  // Calculate elapsed time for active timesheet
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

  // Scroll the content area to 7 am whenever the calendar view is activated
  useEffect(() => {
    if (activeView === "calendar" && contentScrollRef.current) {
      // CAL_START_HOUR = 5, HOUR_PX = 64  →  7 am offset = (7-5)*64 = 128 px
      contentScrollRef.current.scrollTop = (7 - 5) * 64;
    }
  }, [activeView]);

  // Clock-in mutation
  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!clockInProjectId) {
        throw new Error("Please select a project");
      }
      return apiRequest("/api/timesheets/clock-in", "POST", {
        projectId: clockInProjectId,
        costCodeId: clockInCostCodeId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({
        title: "Clocked In",
        description: "Timer started successfully",
      });
      setIsClockInOpen(false);
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
      return apiRequest("/api/timesheets/clock-out", "POST", {
        timesheetId: activeTimesheet.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "timesheets"] });
      }
      toast({
        title: "Clocked Out",
        description: "Timer stopped successfully",
      });
      setClockInProjectId("");
      setClockInCostCodeId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clock out",
        variant: "destructive",
      });
    },
  });

  // Status workflow mutations
  const bulkActionMutation = useMutation({
    mutationFn: (data: { ids: string[]; action: string; status?: string }) =>
      apiRequest("/api/timesheets/bulk-action", "POST", data),
    onSuccess: (result: { success: number; errors: string[] }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "timesheets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "labour-hours-budget"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedTimesheets([]);
      const actionLabels: Record<string, string> = {
        changeStatus: "updated",
        delete: "deleted",
      };
      toast({
        title: `${result.success} timesheet${result.success !== 1 ? "s" : ""} ${actionLabels[variables.action] || "updated"}`,
        description: result.errors?.length > 0 ? `${result.errors.length} failed` : undefined,
      });
    },
    onError: () => {
      toast({
        title: "Bulk action failed",
        variant: "destructive",
      });
    },
  });

  // Duplicate a single timesheet — copies the source's fields onto today's
  // date as a fresh draft, then opens the dialog on the new entry so the
  // user can adjust before saving.
  const duplicateMutation = useMutation({
    mutationFn: async (source: Timesheet) => {
      const payload = {
        projectId: source.projectId,
        userId: source.userId,
        costCodeId: source.costCodeId,
        date: new Date().toISOString(),
        startTime: source.startTime || "",
        endTime: source.endTime || "",
        duration: source.duration || "0",
        breakDuration: source.breakDuration || "0",
        breakStartTime: source.breakStartTime || "",
        breakEndTime: source.breakEndTime || "",
        hourlyRate: source.hourlyRate || "0",
        // Carry total over so the duplicate has the same hours/$ as the source
        total: source.total || "0",
        description: source.description || "",
        labels: Array.isArray(source.labels) ? (source.labels as string[]) : [],
        status: "draft",
      };
      return apiRequest("/api/timesheets", "POST", payload) as Promise<Timesheet>;
    },
    onSuccess: (newTs) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "timesheets"] });
      }
      toast({
        title: "Timesheet duplicated",
        description: "New draft entry created for today.",
      });
      setSelectedTimesheet(newTs);
      setIsDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to duplicate timesheet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get date range based on selection
  const getDateRange = (): { start: Date; end: Date } | null => {
    const now = new Date();
    
    switch (dateRangeType) {
      case "this-week":
        return {
          start: startOfWeek(now, { weekStartsOn: weekStartDay }),
          end: endOfWeek(now, { weekStartsOn: weekStartDay }),
        };
      case "last-week":
        const lastWeek = addWeeks(now, -1);
        return {
          start: startOfWeek(lastWeek, { weekStartsOn: weekStartDay }),
          end: endOfWeek(lastWeek, { weekStartsOn: weekStartDay }),
        };
      case "custom":
        if (customStartDate && customEndDate) {
          return { start: customStartDate, end: customEndDate };
        }
        return null;
      default:
        return null;
    }
  };

  const getProjectName = (pId: string | null) => {
    if (!pId) return "Business";
    const project = projects.find((p) => p.id === pId);
    return project?.name || "Unknown Project";
  };

  const isValidHex = (hex: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(hex);

  const hexToRgba = (hex: string, alpha: number): string => {
    if (!isValidHex(hex)) return `rgba(100,116,139,${alpha})`;
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const getProjectColor = (pId: string | null): string | null => {
    if (pId) {
      const project = projects.find((p) => p.id === pId);
      if (project?.color && isValidHex(project.color)) return project.color;
    }
    const brand = companySettings?.brandColor;
    if (brand && isValidHex(brand)) return brand;
    return null;
  };

  const getUserName = (userId: string) => {
    const u = users.find((usr) => usr.id === userId);
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.username : "Unknown User";
  };

  const getCostCodeName = (costCodeId: string | null) => {
    if (!costCodeId) return "-";
    const costCode = costCodes.find((c) => c.id === costCodeId);
    return costCode ? costCode.title : "-";
  };

  const formatDuration = (hours: number | null) => {
    if (!hours) return "0:00";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  const getNetHours = (timesheet: Timesheet): number => {
    return parseFloat(timesheet.duration) || 0;
  };

  // Filter timesheets
  const getProjectPhase = (projId: string | null): string => {
    if (!projId) return "business";
    const project = projects.find((p) => p.id === projId);
    return project?.currentSystemPhase || "lead";
  };

  const filteredTimesheets = timesheets.filter((timesheet) => {
    const matchesSearch = searchTerm === "" || 
      timesheet.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = !projectId && selectedProjects.length > 0 
      ? selectedProjects.includes(timesheet.projectId || "business") 
      : true;
    const matchesUser = selectedUsers.length > 0 
      ? selectedUsers.includes(timesheet.userId) 
      : true;
    const matchesStatus = selectedStatuses.length > 0 
      ? selectedStatuses.includes(timesheet.status) 
      : true;
    const matchesPhase = selectedPhases.length > 0 
      ? selectedPhases.includes(getProjectPhase(timesheet.projectId)) 
      : true;
    const matchesCostCode = selectedCostCodes.length > 0 
      ? selectedCostCodes.includes(timesheet.costCodeId || "") 
      : true;
    const matchesInvoiced = !showInvoicedOnly || timesheet.invoiced;

    // Date range filter
    const dateRange = getDateRange();
    const matchesDateRange = !dateRange || isWithinInterval(parseISO(timesheet.date as unknown as string), {
      start: dateRange.start,
      end: dateRange.end,
    });

    return matchesSearch && matchesProject && matchesUser && matchesStatus && matchesPhase && matchesCostCode && matchesInvoiced && matchesDateRange;
  });

  // Get current project if in project context
  const currentProject = projectId ? projects.find(p => p.id === projectId) : null;

  const pendingTimesheets = timesheets.filter(ts => ts.status === "submitted");

  // Weekly view calculations
  const weekDays = eachDayOfInterval({
    start: weeklyViewDate,
    end: addDays(weeklyViewDate, 6)
  });

  // Get weekly summary data grouped by user
  const getWeeklySummary = () => {
    const weekEnd = addDays(weeklyViewDate, 6);
    const weekTimesheets = timesheets.filter(ts => {
      const tsDate = new Date(ts.date);
      return tsDate >= weeklyViewDate && tsDate <= weekEnd;
    });

    // Group by user
    const userMap = new Map<string, { userId: string; userName: string; dailyHours: Map<string, number>; totalHours: number }>();
    
    weekTimesheets.forEach(ts => {
      const userId = ts.userId;
      const userName = getUserName(userId);
      const tsDate = format(new Date(ts.date), "yyyy-MM-dd");
      const duration = parseFloat(ts.duration) || 0;
      const breakDuration = parseFloat(ts.breakDuration || "0") || 0;
      const netHours = Math.max(0, duration - breakDuration);

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          userId,
          userName,
          dailyHours: new Map(),
          totalHours: 0
        });
      }

      const user = userMap.get(userId)!;
      const currentDayHours = user.dailyHours.get(tsDate) || 0;
      user.dailyHours.set(tsDate, currentDayHours + netHours);
      user.totalHours += netHours;
    });

    return Array.from(userMap.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  };

  const weeklySummary = getWeeklySummary();

  // Rolled-up active-filter count + clear-all helper for the Filters popover
  const activeFilterCount =
    selectedProjects.length +
    selectedUsers.length +
    selectedStatuses.length +
    selectedCostCodes.length +
    selectedPhases.length +
    (dateRangeType !== "all" ? 1 : 0);
  const clearAllFilters = () => {
    setSelectedProjects([]);
    setSelectedUsers([]);
    setSelectedStatuses([]);
    setSelectedCostCodes([]);
    setSelectedPhases([]);
    setDateRangeType("all");
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
  };

  // Export timesheets to Excel
  const handleExport = () => {
    const exportData = filteredTimesheets.map((timesheet) => ({
      Date: format(new Date(timesheet.date), "dd/MM/yyyy"),
      User: getUserName(timesheet.userId),
      Project: getProjectName(timesheet.projectId),
      "Start Time": timesheet.startTime || "-",
      "End Time": timesheet.endTime || "-",
      "Break (hrs)": timesheet.breakDuration ? parseFloat(timesheet.breakDuration).toFixed(2) : "0.00",
      "Duration (hrs)": parseFloat(timesheet.duration).toFixed(2),
      "Net Hours": getNetHours(timesheet).toFixed(2),
      "Hourly Rate": `$${parseFloat(timesheet.hourlyRate || "0").toFixed(2)}`,
      Total: `$${parseFloat(timesheet.total || "0").toFixed(2)}`,
      Status: timesheet.status.charAt(0).toUpperCase() + timesheet.status.slice(1),
      Invoiced: timesheet.invoiced ? "Yes" : "No",
      Description: timesheet.description || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Timesheets");

    // Auto-size columns
    const colWidths = [
      { wch: 12 }, // Date
      { wch: 20 }, // User
      { wch: 25 }, // Project
      { wch: 12 }, // Start Time
      { wch: 12 }, // End Time
      { wch: 12 }, // Break
      { wch: 14 }, // Duration
      { wch: 14 }, // Hourly Rate
      { wch: 12 }, // Total
      { wch: 12 }, // Status
      { wch: 10 }, // Invoiced
      { wch: 40 }, // Description
    ];
    worksheet["!cols"] = colWidths;

    const fileName = currentProject
      ? `${currentProject.name}_Timesheets_${format(new Date(), "yyyy-MM-dd")}.xlsx`
      : `Timesheets_${format(new Date(), "yyyy-MM-dd")}.xlsx`;

    XLSX.writeFile(workbook, fileName);

    toast({
      title: "Export successful",
      description: `Exported ${filteredTimesheets.length} timesheets to ${fileName}`,
    });
  };

  // ── DataTable column defs ────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedTimesheets((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const timesheetColumns = useMemo<ColumnDef<Timesheet, unknown>[]>(() => {
    const cols: (ColumnDef<Timesheet, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        meta: { defaultWidth: 16, pinned: true, align: "center" },
        header: () => (
          <div className="flex items-center justify-center w-full">
            <Checkbox
              checked={
                filteredTimesheets.length > 0 &&
                selectedTimesheets.length === filteredTimesheets.length
              }
              onCheckedChange={(checked) => {
                if (checked) setSelectedTimesheets(filteredTimesheets.map((t) => t.id));
                else setSelectedTimesheets([]);
              }}
              className="h-3.5 w-3.5"
              data-testid="checkbox-select-all"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div
            className="flex items-center justify-center w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selectedTimesheets.includes(row.original.id)}
              onCheckedChange={() => toggleSelect(row.original.id)}
              className="h-3.5 w-3.5"
              data-testid={`checkbox-row-${row.original.id}`}
            />
          </div>
        ),
      },
      {
        id: "date",
        accessorFn: (t) => new Date(t.date as unknown as string).getTime(),
        header: "Date",
        meta: { headerLabel: "Date", defaultWidth: 70 },
        cell: ({ row }) => (
          <span className="text-table font-medium truncate">
            {formatTimesheetDate(row.original.date, tsDateFormat)}
          </span>
        ),
      },
      {
        id: "user",
        accessorFn: (t) => getUserName(t.userId),
        header: "User",
        meta: { headerLabel: "User", defaultWidth: 100 },
        cell: ({ row }) => (
          <span className="text-table truncate">{getUserName(row.original.userId)}</span>
        ),
      },
      {
        id: "project",
        accessorFn: (t) => getProjectName(t.projectId),
        header: "Project",
        meta: { headerLabel: "Project", defaultWidth: 120, defaultHidden: true },
        cell: ({ row }) => (
          <span className="text-table truncate text-muted-foreground">
            {getProjectName(row.original.projectId)}
          </span>
        ),
      },
      {
        id: "costCode",
        accessorFn: (t) => getCostCodeName(t.costCodeId),
        header: "Cost Code",
        meta: { headerLabel: "Cost Code", defaultWidth: 100 },
        cell: ({ row }) => (
          <span className="text-table truncate text-muted-foreground">
            {getCostCodeName(row.original.costCodeId)}
          </span>
        ),
      },
      {
        id: "startTime",
        accessorKey: "startTime",
        header: "Start",
        enableSorting: false,
        meta: { headerLabel: "Start", defaultWidth: 60 },
        cell: ({ row }) => (
          <span className="text-table text-muted-foreground tabular-nums">
            {row.original.startTime || "-"}
          </span>
        ),
      },
      {
        id: "endTime",
        accessorKey: "endTime",
        header: "End",
        enableSorting: false,
        meta: { headerLabel: "End", defaultWidth: 60 },
        cell: ({ row }) => (
          <span className="text-table text-muted-foreground tabular-nums">
            {row.original.endTime || "-"}
          </span>
        ),
      },
      {
        id: "break",
        accessorFn: (t) => (t.breakDuration ? parseFloat(t.breakDuration) : 0),
        header: "Break",
        enableSorting: false,
        meta: { headerLabel: "Break", defaultWidth: 45 },
        cell: ({ row }) => {
          const brk = row.original.breakDuration ? parseFloat(row.original.breakDuration) : 0;
          if (brk > 0) {
            return (
              <span className="text-table text-muted-foreground tabular-nums">
                {formatDuration(brk)}
              </span>
            );
          }
          return <span className="text-table text-muted-foreground tabular-nums">&mdash;</span>;
        },
      },
      {
        id: "hours",
        accessorFn: (t) => getNetHours(t),
        header: "Hours",
        meta: { headerLabel: "Hours", defaultWidth: 50 },
        cell: ({ row }) => {
          const hrs = getNetHours(row.original);
          if (hrs > 0) {
            return (
              <span className="font-semibold text-[13px] text-primary tabular-nums">
                {formatDuration(hrs)}
              </span>
            );
          }
          return <span className="text-table text-muted-foreground font-normal tabular-nums">&mdash;</span>;
        },
      },
      {
        id: "rate",
        accessorFn: (t) => (t.hourlyRate ? parseFloat(t.hourlyRate) : 0),
        header: "Rate",
        enableSorting: false,
        meta: { headerLabel: "Rate", defaultWidth: 50 },
        cell: ({ row }) => {
          const rate = row.original.hourlyRate ? parseFloat(row.original.hourlyRate) : 0;
          if (rate > 0) {
            return (
              <span className="text-table text-muted-foreground tabular-nums">
                ${rate.toFixed(0)}
              </span>
            );
          }
          return <span className="text-table text-muted-foreground tabular-nums">&mdash;</span>;
        },
      },
      {
        id: "total",
        accessorFn: (t) => (t.total ? parseFloat(t.total) : 0),
        header: "Total",
        enableSorting: false,
        meta: { headerLabel: "Total", defaultWidth: 60, align: "right" },
        cell: ({ row }) => {
          const hasRate = row.original.hourlyRate && parseFloat(row.original.hourlyRate) > 0;
          if (!hasRate) {
            return <span className="text-table text-muted-foreground tabular-nums">&mdash;</span>;
          }
          const total = row.original.total ? parseFloat(row.original.total) : 0;
          return (
            <span className="text-table font-medium text-foreground tabular-nums">
              ${total.toFixed(2)}
            </span>
          );
        },
      },
      {
        id: "labels",
        accessorFn: (t) => (Array.isArray(t.labels) ? (t.labels as string[]).join(",") : ""),
        header: "Labels",
        enableSorting: false,
        meta: { headerLabel: "Labels", defaultWidth: 100, defaultHidden: true },
        cell: ({ row }) => {
          const labels = row.original.labels;
          if (Array.isArray(labels) && (labels as string[]).length > 0) {
            return (
              <div className="flex items-center gap-1 flex-wrap">
                {(labels as string[]).map((label, i) => (
                  <Badge key={i} variant="secondary" className="text-data font-medium">
                    {label}
                  </Badge>
                ))}
              </div>
            );
          }
          return <span className="text-table text-muted-foreground/50">&mdash;</span>;
        },
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        meta: { headerLabel: "Status", defaultWidth: 70 },
        cell: ({ row }) => {
          const s = row.original.status;
          if (s === "approved") {
            return (
              <Badge variant="outline" className="text-data font-medium bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))] border border-[hsl(var(--sage))]">
                Approved
              </Badge>
            );
          }
          if (s === "submitted") {
            return (
              <Badge variant="outline" className="text-data font-medium bg-primary/10 text-primary border border-primary/20">
                Submitted
              </Badge>
            );
          }
          if (s === "rejected") {
            return (
              <Badge variant="outline" className="text-data font-medium bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))] border border-[hsl(var(--coral))]">
                Rejected
              </Badge>
            );
          }
          return <Badge variant="secondary" className="text-data font-medium">{s}</Badge>;
        },
      },
      {
        id: "poStatus",
        accessorKey: "poStatus",
        header: "PO Status",
        enableSorting: false,
        meta: { headerLabel: "PO Status", defaultWidth: 90, defaultHidden: true },
        cell: ({ row }) => {
          const p = row.original.poStatus;
          if (p === "awaiting_po") return <Badge variant="outline" className="text-data font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">Awaiting PO</Badge>;
          if (p === "on_po") return <Badge variant="outline" className="text-data font-medium bg-blue-50 dark:bg-blue-900/20 text-status-info dark:text-blue-400 border-blue-200 dark:border-blue-800">On PO</Badge>;
          if (p === "paid") return <Badge variant="outline" className="text-data font-medium bg-green-50 dark:bg-green-900/20 text-status-success dark:text-green-400 border-green-200 dark:border-green-800">Paid</Badge>;
          return <span className="text-table text-muted-foreground/50">&mdash;</span>;
        },
      },
      {
        id: "description",
        accessorKey: "description",
        header: "Description",
        enableSorting: false,
        meta: { headerLabel: "Description", defaultWidth: 180 },
        cell: ({ row }) => (
          <span className="text-table text-muted-foreground truncate">
            {row.original.description || "-"}
          </span>
        ),
      },
      {
        // Far-right per-row 3-dot actions menu. Pinned so it can't be
        // hidden, reordered or resized — it should always be the last
        // visible column.
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        meta: { defaultWidth: 32, pinned: true, align: "center", headerLabel: "" },
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const ts = row.original;
          const canEdit = canEditTimesheet(ts);
          return (
            <div
              className="flex items-center justify-center w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    data-testid={`button-row-actions-${ts.id}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedTimesheet(ts);
                      setIsDialogOpen(true);
                    }}
                    data-testid={`menu-edit-${ts.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    {canEdit ? "Edit" : "View"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => duplicateMutation.mutate(ts)}
                    disabled={duplicateMutation.isPending}
                    data-testid={`menu-duplicate-${ts.id}`}
                  >
                    <Copy className="h-3.5 w-3.5 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  {canApproveTimesheets && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-data uppercase tracking-wider text-muted-foreground font-medium">
                        Change status
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => bulkActionMutation.mutate({ ids: [ts.id], action: "changeStatus", status: "submitted" })}
                        data-testid={`menu-status-submitted-${ts.id}`}
                      >
                        <div className="w-2 h-2 rounded-full mr-2 bg-primary" />
                        Submitted
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => bulkActionMutation.mutate({ ids: [ts.id], action: "changeStatus", status: "approved" })}
                        data-testid={`menu-status-approved-${ts.id}`}
                      >
                        <div className="w-2 h-2 rounded-full mr-2 bg-[hsl(var(--sage))]" />
                        Approved
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => bulkActionMutation.mutate({ ids: [ts.id], action: "changeStatus", status: "rejected" })}
                        data-testid={`menu-status-rejected-${ts.id}`}
                      >
                        <div className="w-2 h-2 rounded-full mr-2 bg-[hsl(var(--coral))]" />
                        Rejected
                      </DropdownMenuItem>
                    </>
                  )}
                  {canEdit && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteCandidateId(ts.id)}
                        data-testid={`menu-delete-${ts.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ];
    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTimesheets, selectedTimesheets, projects, users, costCodes, tsDateFormat, canApproveTimesheets, user?.id, user?.roleName, duplicateMutation.isPending]);

  return (
    <div className="flex flex-col h-full">
      {/* Header Panel — single condensed row */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-8 flex items-center gap-2 px-3">
          {/* LEFT: Title + Search + Filters + (Stop pill if running) */}
          <h1 className="text-sm font-semibold whitespace-nowrap">
            {currentProject ? `${currentProject.name} - Timesheets` : "All Items - Timesheets"}
          </h1>

          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-timesheets"
              className="pl-7 pr-2 py-0 h-6 text-xs border"
            />
          </div>

          {/* Filters popover — rolls up Project, User, Status, Cost Code, Phase, Date Range */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 ${
                  activeFilterCount > 0
                    ? "bg-primary/10 text-[#8b7ab8] border-primary/40"
                    : ""
                }`}
                data-testid="button-filters"
              >
                <Filter className="w-3 h-3" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-data bg-primary/20 text-[#8b7ab8]">
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2 px-1 rounded"
                      data-testid="button-filters-clear"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Project (only when not in project context) */}
                {!projectId && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Project</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`w-full h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between ${
                            selectedProjects.length > 0 ? "bg-primary/10 border-primary/40" : ""
                          }`}
                          data-testid="button-filter-project"
                        >
                          <span className="truncate">
                            {selectedProjects.length === 0
                              ? "All projects"
                              : `${selectedProjects.length} selected`}
                          </span>
                          <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="max-h-72 overflow-auto">
                        {projects.map((project) => (
                          <DropdownMenuItem
                            key={project.id}
                            className="flex items-center"
                            onSelect={(e) => {
                              e.preventDefault();
                              const next = selectedProjects.includes(project.id)
                                ? selectedProjects.filter((p) => p !== project.id)
                                : [...selectedProjects, project.id];
                              setSelectedProjects(next);
                            }}
                          >
                            <Checkbox checked={selectedProjects.includes(project.id)} className="mr-2 pointer-events-none" />
                            {project.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                {/* User */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">User</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`w-full h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between ${
                          selectedUsers.length > 0 ? "bg-primary/10 border-primary/40" : ""
                        }`}
                        data-testid="button-filter-user"
                      >
                        <span className="truncate">
                          {selectedUsers.length === 0 ? "All users" : `${selectedUsers.length} selected`}
                        </span>
                        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-72 overflow-auto">
                      {users.map((u: any) => (
                        <DropdownMenuItem
                          key={u.id}
                          className="flex items-center"
                          onSelect={(e) => {
                            e.preventDefault();
                            const next = selectedUsers.includes(u.id)
                              ? selectedUsers.filter((x) => x !== u.id)
                              : [...selectedUsers, u.id];
                            setSelectedUsers(next);
                          }}
                        >
                          <Checkbox checked={selectedUsers.includes(u.id)} className="mr-2 pointer-events-none" />
                          {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.username}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`w-full h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between ${
                          selectedStatuses.length > 0 ? "bg-primary/10 border-primary/40" : ""
                        }`}
                        data-testid="button-filter-status"
                      >
                        <span className="truncate">
                          {selectedStatuses.length === 0 ? "All statuses" : `${selectedStatuses.length} selected`}
                        </span>
                        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {[
                        { key: "submitted", name: "Submitted" },
                        { key: "approved", name: "Approved" },
                        { key: "rejected", name: "Rejected" },
                      ].map((status) => (
                        <DropdownMenuItem
                          key={status.key}
                          className="flex items-center"
                          onSelect={(e) => {
                            e.preventDefault();
                            const next = selectedStatuses.includes(status.key)
                              ? selectedStatuses.filter((s) => s !== status.key)
                              : [...selectedStatuses, status.key];
                            setSelectedStatuses(next);
                          }}
                        >
                          <Checkbox checked={selectedStatuses.includes(status.key)} className="mr-2 pointer-events-none" />
                          {status.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Cost Code */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cost Code</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`w-full h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between ${
                          selectedCostCodes.length > 0 ? "bg-primary/10 border-primary/40" : ""
                        }`}
                        data-testid="button-filter-cost-code"
                      >
                        <span className="truncate">
                          {selectedCostCodes.length === 0 ? "All cost codes" : `${selectedCostCodes.length} selected`}
                        </span>
                        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-72 overflow-auto">
                      {costCodes.map((costCode: any) => (
                        <DropdownMenuItem
                          key={costCode.id}
                          className="flex items-center"
                          onSelect={(e) => {
                            e.preventDefault();
                            const next = selectedCostCodes.includes(costCode.id)
                              ? selectedCostCodes.filter((c) => c !== costCode.id)
                              : [...selectedCostCodes, costCode.id];
                            setSelectedCostCodes(next);
                          }}
                        >
                          <Checkbox checked={selectedCostCodes.includes(costCode.id)} className="mr-2 pointer-events-none" />
                          {costCode.code} - {costCode.name ?? costCode.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Phase */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Phase</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`w-full h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between ${
                          selectedPhases.length > 0 ? "bg-primary/10 border-primary/40" : ""
                        }`}
                        data-testid="button-filter-phase"
                      >
                        <span className="truncate">
                          {selectedPhases.length === 0 ? "All phases" : `${selectedPhases.length} selected`}
                        </span>
                        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {[
                        { key: "lead", name: "Lead" },
                        { key: "pre_construction", name: "Pre-Construction" },
                        { key: "construction", name: "Construction" },
                        { key: "post_construction", name: "Post-Construction" },
                        { key: "archive", name: "Archive" },
                      ].map((phase) => (
                        <DropdownMenuItem
                          key={phase.key}
                          className="flex items-center"
                          onSelect={(e) => {
                            e.preventDefault();
                            const next = selectedPhases.includes(phase.key)
                              ? selectedPhases.filter((p) => p !== phase.key)
                              : [...selectedPhases, phase.key];
                            setSelectedPhases(next);
                          }}
                        >
                          <Checkbox checked={selectedPhases.includes(phase.key)} className="mr-2 pointer-events-none" />
                          {phase.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Date Range */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Date Range</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`w-full h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between ${
                          dateRangeType !== "all" ? "bg-primary/10 border-primary/40" : ""
                        }`}
                        data-testid="button-filter-date"
                      >
                        <span className="truncate flex items-center gap-1">
                          <CalendarRange className="w-3 h-3" />
                          {dateRangeType === "all" ? "All Time" :
                            dateRangeType === "this-week" ? "This Week" :
                            dateRangeType === "last-week" ? "Last Week" :
                            "Custom"}
                        </span>
                        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => {
                        setDateRangeType("all");
                        setCustomStartDate(undefined);
                        setCustomEndDate(undefined);
                      }}>All Time</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDateRangeType("this-week")}>This Week</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDateRangeType("last-week")}>Last Week</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDateRangeType("custom")}>Custom Range</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {dateRangeType === "custom" && (
                    <div className="flex items-center gap-1 pt-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="h-7 flex-1 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1" data-testid="button-start-date">
                            <CalendarIcon className="w-3 h-3" />
                            <span>{customStartDate ? format(customStartDate, "dd MMM") : "Start"}</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={customStartDate} onSelect={setCustomStartDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <span className="text-xs text-muted-foreground">to</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="h-7 flex-1 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1" data-testid="button-end-date">
                            <CalendarIcon className="w-3 h-3" />
                            <span>{customEndDate ? format(customEndDate, "dd MMM") : "End"}</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={customEndDate} onSelect={setCustomEndDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Running-timer Stop pill stays inline as a status indicator */}
          {activeTimesheet && (
            <button
              onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              className="h-6 w-auto px-2 text-xs border rounded-md bg-red-500 text-white border-red-500/20 hover:bg-red-600 active-elevate-2 flex items-center gap-1"
              data-testid="button-clock-out"
            >
              <Square className="w-3 h-3" />
              <span className="font-mono">{elapsedTime}</span>
              <span>Stop</span>
            </button>
          )}

          <div className="flex-1" />

          {/* RIGHT: View · Columns · | · Add Entry · Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-view"
              >
                {activeView === "table" && <Table2 className="w-3 h-3" />}
                {activeView === "weekly" && <Users2 className="w-3 h-3" />}
                {activeView === "calendar" && <CalendarDays className="w-3 h-3" />}
                <span className="capitalize">{activeView}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setActiveView("table")} data-testid="menu-view-table">
                <Table2 className="w-3.5 h-3.5 mr-2" />
                Table
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveView("weekly")} data-testid="menu-view-weekly">
                <Users2 className="w-3.5 h-3.5 mr-2" />
                Weekly
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveView("calendar")} data-testid="menu-view-calendar">
                <CalendarDays className="w-3.5 h-3.5 mr-2" />
                Calendar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {activeView === "table" && (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                      data-testid="button-columns"
                      aria-label="Columns"
                    >
                      <Settings2 className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Columns</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-56 p-0" align="end">
                <DataTableColumnPicker storageKey={TABLE_STORAGE_KEY} columns={PICKER_COLUMNS} />
              </PopoverContent>
            </Popover>
          )}

          <div className="w-px h-4 bg-border" />

          <button
            onClick={() => {
              setSelectedTimesheet(undefined);
              setIsDialogOpen(true);
            }}
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            data-testid="button-add-timesheet"
          >
            <Plus className="w-3 h-3" />
            Add Entry
          </button>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid="button-options"
                    aria-label="Options"
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Options</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              {!activeTimesheet && (
                <DropdownMenuItem
                  onClick={() => setIsClockInOpen(true)}
                  data-testid="menu-clock-in"
                >
                  <Play className="w-3.5 h-3.5 mr-2" />
                  Clock In
                </DropdownMenuItem>
              )}
              {canApproveTimesheets && pendingTimesheets.length > 0 && (
                <DropdownMenuItem
                  onClick={() => setIsRapidApprovalOpen(true)}
                  data-testid="menu-rapid-approval"
                >
                  <Zap className="w-3.5 h-3.5 mr-2" />
                  <span className="flex-1">Approve</span>
                  <Badge variant="secondary" className="h-4 px-1 text-data ml-2">
                    {pendingTimesheets.length}
                  </Badge>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setIsSubPODialogOpen(true)}
                data-testid="menu-sub-po"
              >
                <HardHat className="w-3.5 h-3.5 mr-2" />
                Sub PO
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setIsImportOpen(true)}
                data-testid="menu-import-timesheets"
              >
                <Upload className="w-3.5 h-3.5 mr-2" />
                Import
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExport}
                disabled={filteredTimesheets.length === 0}
                data-testid="menu-export-timesheets"
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                Export
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Clock In dialog — opened from the Options menu */}
      <Dialog open={isClockInOpen} onOpenChange={setIsClockInOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Start Timer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">
                Project <span className="text-destructive">*</span>
              </label>
              <ProjectSelect
                value={clockInProjectId}
                onValueChange={setClockInProjectId}
                placeholder="Select a project"
                allowNone={false}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Cost Code (Optional)</label>
              <CostCodeSelect
                value={clockInCostCodeId}
                onValueChange={setClockInCostCodeId}
                placeholder="Select a cost code"
              />
            </div>
            <Button
              onClick={() => clockInMutation.mutate()}
              disabled={!clockInProjectId || clockInMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
              size="sm"
            >
              <Play className="w-3 h-3 mr-1" />
              {clockInMutation.isPending ? "Starting..." : "Start Timer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content Area */}
      <div ref={contentScrollRef} className="flex-1 overflow-auto min-h-0 border-x border-b border-border rounded-b-lg bg-card">
        {loadingTimesheets ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Loading timesheets...</div>
          </div>
        ) : activeView === "weekly" ? (
          /* Weekly Team Hours View */
          <div className="p-3">
            {/* Week Navigation */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setWeeklyViewDate(subWeeks(weeklyViewDate, 1))}
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium min-w-[180px] text-center">
                  {format(weeklyViewDate, "dd MMM")} - {format(addDays(weeklyViewDate, 6), "dd MMM yyyy")}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setWeeklyViewDate(addWeeks(weeklyViewDate, 1))}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setWeeklyViewDate(startOfWeek(new Date(), { weekStartsOn: weekStartDay }))}
                >
                  Today
                </Button>
              </div>
            </div>

            {/* Weekly Matrix */}
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="h-7 bg-muted/30 dark:bg-muted/10 border-b-2 border-border">
                    <TableHead className="text-data font-medium text-muted-foreground w-[140px] px-2">Team Member</TableHead>
                    {weekDays.map((day) => (
                      <TableHead key={day.toISOString()} className="text-data font-medium text-muted-foreground text-center w-[70px] px-1">
                        <div>{format(day, "EEE")}</div>
                        <div className="text-label">{format(day, "dd/MM")}</div>
                      </TableHead>
                    ))}
                    <TableHead className="text-data font-medium text-muted-foreground text-center w-[70px] px-2 bg-muted/50">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklySummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-20 text-center text-sm text-muted-foreground">
                        No timesheets for this week
                      </TableCell>
                    </TableRow>
                  ) : (
                    weeklySummary.map((user) => (
                      <TableRow key={user.userId} className="h-7 border-b border-border">
                        <TableCell className="text-table font-medium px-2 py-1 truncate max-w-[140px]">
                          {user.userName}
                        </TableCell>
                        {weekDays.map((day) => {
                          const dayKey = format(day, "yyyy-MM-dd");
                          const hours = user.dailyHours.get(dayKey) || 0;
                          return (
                            <TableCell key={dayKey} className="text-table text-center tabular-nums px-1 py-1">
                              {hours > 0 ? (
                                <span className={hours >= 8 ? "font-medium text-status-success dark:text-green-400" : ""}>
                                  {formatDuration(hours)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-table font-semibold text-center tabular-nums px-2 py-1 bg-muted/30">
                          {formatDuration(user.totalHours)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Totals Row */}
                  {weeklySummary.length > 0 && (
                    <TableRow className="h-7 bg-muted/20 border-t-2 border-border">
                      <TableCell className="text-data font-semibold px-2 py-1">TOTAL</TableCell>
                      {weekDays.map((day) => {
                        const dayKey = format(day, "yyyy-MM-dd");
                        const dayTotal = weeklySummary.reduce((sum, user) => sum + (user.dailyHours.get(dayKey) || 0), 0);
                        return (
                          <TableCell key={dayKey} className="text-data font-semibold text-center tabular-nums px-1 py-1">
                            {dayTotal > 0 ? formatDuration(dayTotal) : "-"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-data font-bold text-center tabular-nums px-2 py-1 bg-muted/50">
                        {formatDuration(weeklySummary.reduce((sum, user) => sum + user.totalHours, 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : activeView === "calendar" ? (
          /* Calendar Week View - Time Scale */
          (() => {
            const CAL_START_HOUR = 5;   // 5 am
            const CAL_END_HOUR = 22;    // 10 pm
            const HOUR_PX = 64;         // px per hour
            const GUTTER_W = 52;        // px for time gutter on left
            const totalHours = CAL_END_HOUR - CAL_START_HOUR;

            const parseHHmm = (t: string | null | undefined): number | null => {
              if (!t) return null;
              const [h, m] = t.split(":").map(Number);
              return h + m / 60;
            };

            // Within a set of same-lane entries, compute sub-lane (column) assignments
            // so overlapping entries render side-by-side instead of stacked.
            const computeBlockLanes = (entries: Timesheet[]): Map<string, { subLane: number; totalSubLanes: number }> => {
              const intervals = entries.map(ts => {
                const start = parseHHmm(ts.startTime) ?? CAL_START_HOUR;
                let end = parseHHmm(ts.endTime);
                if (end === null) end = start + getNetHours(ts);
                return { id: ts.id as string, start, end: Math.max(end, start + 0.25) };
              });
              intervals.sort((a, b) => a.start - b.start);
              const result = new Map<string, { subLane: number; totalSubLanes: number }>();
              let i = 0;
              while (i < intervals.length) {
                const cluster: typeof intervals = [intervals[i]];
                let clusterEnd = intervals[i].end;
                let j = i + 1;
                while (j < intervals.length && intervals[j].start < clusterEnd) {
                  clusterEnd = Math.max(clusterEnd, intervals[j].end);
                  cluster.push(intervals[j]);
                  j++;
                }
                const laneTails: number[] = [];
                cluster.forEach(iv => {
                  let lane = -1;
                  for (let l = 0; l < laneTails.length; l++) {
                    if (iv.start >= laneTails[l]) { lane = l; laneTails[l] = iv.end; break; }
                  }
                  if (lane === -1) { lane = laneTails.length; laneTails.push(iv.end); }
                  result.set(iv.id, { subLane: lane, totalSubLanes: 0 });
                });
                const total = laneTails.length;
                cluster.forEach(iv => { const e = result.get(iv.id)!; result.set(iv.id, { subLane: e.subLane, totalSubLanes: total }); });
                i = j;
              }
              return result;
            };

            const calendarDays = eachDayOfInterval({
              start: calendarWeek,
              end: addDays(calendarWeek, 6),
            });

            const weekEnd = addDays(calendarWeek, 6);
            const calendarTimesheets = filteredTimesheets.filter(ts => {
              const tsDateLocal = format(parseISO(ts.date), "yyyy-MM-dd");
              const weekStartKey = format(calendarWeek, "yyyy-MM-dd");
              const weekEndKey = format(weekEnd, "yyyy-MM-dd");
              return tsDateLocal >= weekStartKey && tsDateLocal <= weekEndKey;
            });

            // Split into timed vs untimed
            const timedSheets = calendarTimesheets.filter(ts => ts.startTime);
            const untimedSheets = calendarTimesheets.filter(ts => !ts.startTime);

            // Group untimed by day (timezone-safe)
            const untimedByDay = new Map<string, Timesheet[]>();
            untimedSheets.forEach(ts => {
              const dk = format(parseISO(ts.date), "yyyy-MM-dd");
              if (!untimedByDay.has(dk)) untimedByDay.set(dk, []);
              untimedByDay.get(dk)!.push(ts);
            });

            const hasUntimed = untimedSheets.length > 0;

            const statusDotColor = (status: string): string => {
              if (status === "approved") return "#22c55e";
              if (status === "submitted") return "#f59e0b";
              if (status === "rejected") return "#ef4444";
              return "transparent";
            };

            // Derive sorted unique users from visible timesheets (capped at 5)
            const uniqueUserIds = Array.from(
              new Set(calendarTimesheets.map(ts => ts.userId))
            ).sort((a, b) => getUserName(a).localeCompare(getUserName(b)));
            const laneUsers = uniqueUserIds.slice(0, 5);
            const tooManyUsers = uniqueUserIds.length > 5;
            const useLanes = laneUsers.length >= 2 && !tooManyUsers;

            // Helper: get first name or initials for a userId
            const getUserLabel = (userId: number) => {
              const name = getUserName(userId);
              const parts = name.trim().split(/\s+/);
              if (parts[0] && parts[0].length > 0) return parts[0];
              return name.substring(0, 2).toUpperCase();
            };

            // flex weight per day: Sunday = 0.5, others = 1
            const dayFlex = (day: Date) => getDay(day) === 0 ? 0.5 : 1;

            const statusColors = (status: string) => {
              if (status === "approved")
                return "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300";
              if (status === "submitted")
                return "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300";
              if (status === "rejected")
                return "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300";
              return "bg-muted/60 border-border text-muted-foreground";
            };

            return (
              <div className="flex flex-col">
                {/* Week Navigation — sticks to top of outer scroll container */}
                <div className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCalendarWeek(subWeeks(calendarWeek, 1))}
                    data-testid="button-prev-cal-week"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[180px] text-center">
                    {format(calendarWeek, "dd MMM")} – {format(addDays(calendarWeek, 6), "dd MMM yyyy")}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCalendarWeek(addWeeks(calendarWeek, 1))}
                    data-testid="button-next-cal-week"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCalendarWeek(startOfWeek(new Date(), { weekStartsOn: weekStartDay }))}
                  >
                    Today
                  </Button>
                </div>

                {/* Day headers — sticks just below the nav (nav = py-2 + h-7 = 44px) */}
                <div className="sticky top-[44px] z-20 flex border-b-2 border-border bg-card">
                  <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="border-r border-border" />
                  {calendarDays.map(day => {
                    const isToday = isSameDay(day, new Date());
                    const flex = dayFlex(day);
                    return (
                      <div
                        key={day.toISOString()}
                        style={{ flex }}
                        className={`text-center py-1.5 border-r border-border last:border-r-0 text-table font-medium min-w-0 ${
                          isToday ? "bg-blue-50 dark:bg-blue-900/20" : "bg-muted/30 dark:bg-muted/10"
                        }`}
                      >
                        <div className={isToday ? "text-status-info dark:text-blue-400" : "text-muted-foreground"}>
                          {format(day, "EEE")}
                        </div>
                        <div className={`text-data font-semibold ${isToday ? "text-status-info dark:text-blue-400" : ""}`}>
                          {format(day, "d")}
                        </div>
                        {/* Per-user lane labels (only when 2–5 users) */}
                        {useLanes && (
                          <div className="flex border-t border-border/50 mt-0.5 pt-0.5">
                            {laneUsers.map(uid => (
                              <div
                                key={uid}
                                className="flex-1 text-2xs text-muted-foreground truncate px-0.5 text-center border-r border-border/30 last:border-r-0"
                                title={getUserName(uid)}
                              >
                                {getUserLabel(uid)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Too-many-users notice (supplemental, calendar still renders with overlap) */}
                {tooManyUsers && (
                  <div className="flex items-center justify-center py-1.5 bg-muted/20 border-b border-border text-data text-muted-foreground italic">
                    Filter to 5 or fewer users to enable lanes
                  </div>
                )}

                {/* All-day / untimed row */}
                {hasUntimed && (
                  <div className="flex border-b border-border bg-muted/10">
                    <div
                      style={{ width: GUTTER_W, minWidth: GUTTER_W }}
                      className="text-label text-muted-foreground text-right pr-2 pt-1 leading-tight border-r border-border"
                    >
                      no<br />time
                    </div>
                    {calendarDays.map(day => {
                      const dk = format(day, "yyyy-MM-dd");
                      const dayUntimed = untimedByDay.get(dk) || [];
                      const isToday = isSameDay(day, new Date());
                      const flex = dayFlex(day);
                      return (
                        <div
                          key={dk}
                          style={{ flex }}
                          className={`border-r border-border last:border-r-0 min-h-[28px] min-w-0 flex ${isToday ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}`}
                        >
                          {useLanes ? (
                            laneUsers.map(uid => {
                              const userEntries = dayUntimed.filter(ts => ts.userId === uid);
                              return (
                                <div key={uid} className="flex-1 p-0.5 border-r border-border/30 last:border-r-0 min-w-0">
                                  {userEntries.map(ts => {
                                    const projColor = getProjectColor(ts.projectId);
                                    const dotColor = statusDotColor(ts.status);
                                    return (
                                      <div
                                        key={ts.id}
                                        onClick={() => { setSelectedTimesheet(ts); setIsDialogOpen(true); }}
                                        className={`text-label px-1 py-0.5 mb-0.5 rounded cursor-pointer truncate hover-elevate relative text-foreground${projColor ? "" : " bg-muted/60 border-l-2 border-border"}`}
                                        style={projColor ? { backgroundColor: hexToRgba(projColor, 0.15), borderLeft: `2px solid ${projColor}` } : undefined}
                                        title={`${getUserName(ts.userId)} — ${getProjectName(ts.projectId)} (${formatDuration(getNetHours(ts))})`}
                                      >
                                        {dotColor !== "transparent" && (
                                          <span className="absolute top-0.5 right-0.5 inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
                                        )}
                                        <span className="font-bold">{getProjectName(ts.projectId)}</span>
                                        {getCostCodeName(ts.costCodeId) !== "-" && (
                                          <span className="opacity-70"> · {getCostCodeName(ts.costCodeId)}</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })
                          ) : (
                            <div className="flex-1 p-1">
                              {dayUntimed.map(ts => {
                                const projColor = getProjectColor(ts.projectId);
                                const dotColor = statusDotColor(ts.status);
                                return (
                                  <div
                                    key={ts.id}
                                    onClick={() => { setSelectedTimesheet(ts); setIsDialogOpen(true); }}
                                    className={`text-label px-1 py-0.5 mb-0.5 rounded cursor-pointer truncate hover-elevate relative text-foreground${projColor ? "" : " bg-muted/60 border-l-2 border-border"}`}
                                    style={projColor ? { backgroundColor: hexToRgba(projColor, 0.15), borderLeft: `2px solid ${projColor}` } : undefined}
                                    title={`${getUserName(ts.userId)} — ${getProjectName(ts.projectId)} (${formatDuration(getNetHours(ts))})`}
                                  >
                                    {dotColor !== "transparent" && (
                                      <span className="absolute top-0.5 right-0.5 inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
                                    )}
                                    <span className="font-bold">{getProjectName(ts.projectId)}</span>
                                    {getCostCodeName(ts.costCodeId) !== "-" && (
                                      <span className="opacity-70"> · {getCostCodeName(ts.costCodeId)}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Time grid — natural height, outer container scrolls */}
                <div className="flex" style={{ height: totalHours * HOUR_PX }}>
                  {/* Hour labels */}
                  <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="relative select-none border-r border-border">
                    {Array.from({ length: totalHours }, (_, i) => {
                      const h = CAL_START_HOUR + i;
                      return (
                        <div
                          key={h}
                          className="absolute right-0 pr-2 text-data text-muted-foreground leading-none"
                          style={{ top: i * HOUR_PX - 6 }}
                        >
                          {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
                        </div>
                      );
                    })}
                  </div>

                  {/* Day columns */}
                  {calendarDays.map(day => {
                    const dk = format(day, "yyyy-MM-dd");
                    const isToday = isSameDay(day, new Date());
                    const dayTimed = timedSheets.filter(ts => format(parseISO(ts.date), "yyyy-MM-dd") === dk);
                    const flex = dayFlex(day);

                    return (
                      <div
                        key={dk}
                        style={{ flex }}
                        className={`border-r border-border last:border-r-0 relative min-w-0 ${isToday ? "bg-blue-50/30 dark:bg-blue-900/10" : ""}`}
                      >
                        {/* Hour lines */}
                        {Array.from({ length: totalHours }, (_, i) => (
                          <div
                            key={i}
                            className="absolute left-0 right-0 border-t border-border/50"
                            style={{ top: i * HOUR_PX }}
                          />
                        ))}
                        {/* Half-hour lines */}
                        {Array.from({ length: totalHours }, (_, i) => (
                          <div
                            key={`h${i}`}
                            className="absolute left-0 right-0 border-t border-border/25"
                            style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                          />
                        ))}

                        {/* Lane dividers when in lane mode */}
                        {useLanes && laneUsers.map((uid, laneIdx) => laneIdx > 0 && (
                          <div
                            key={`lane-div-${uid}`}
                            className="absolute top-0 bottom-0 border-l border-border/30 pointer-events-none"
                            style={{ left: `${(laneIdx / laneUsers.length) * 100}%` }}
                          />
                        ))}

                        {/* Timesheet blocks — with collision-aware sub-lane placement */}
                        {(() => {
                          // Compute sub-lanes per user lane (or for the whole column if not using lanes)
                          const blockLanesMap = new Map<string, Map<string, { subLane: number; totalSubLanes: number }>>();
                          if (useLanes) {
                            laneUsers.forEach(uid => {
                              const userEntries = dayTimed.filter(ts => ts.userId === uid);
                              blockLanesMap.set(String(uid), computeBlockLanes(userEntries));
                            });
                          } else {
                            const allLanes = computeBlockLanes(dayTimed);
                            blockLanesMap.set("all", allLanes);
                          }
                          const INSET = 1;
                          return dayTimed.map(ts => {
                            const startDecimal = parseHHmm(ts.startTime);
                            if (startDecimal === null) return null;

                            let endDecimal = parseHHmm(ts.endTime);
                            if (endDecimal === null) {
                              endDecimal = startDecimal + getNetHours(ts);
                            }

                            const clampedStart = Math.max(startDecimal, CAL_START_HOUR);
                            const clampedEnd = Math.min(endDecimal, CAL_END_HOUR);
                            if (clampedEnd <= clampedStart) return null;

                            const top = (clampedStart - CAL_START_HOUR) * HOUR_PX;
                            const height = Math.max((clampedEnd - clampedStart) * HOUR_PX, 18);

                            const projColor = getProjectColor(ts.projectId);
                            const dotColor = statusDotColor(ts.status);

                            // User lane: which horizontal slice this user occupies
                            let userLaneLeftPct = 0;
                            let userLaneWidthPct = 100;
                            if (useLanes) {
                              const laneIdx = laneUsers.indexOf(ts.userId);
                              if (laneIdx !== -1) {
                                userLaneWidthPct = 100 / laneUsers.length;
                                userLaneLeftPct = laneIdx * userLaneWidthPct;
                              }
                            }

                            // Sub-lane: collision detection within the user's lane
                            const laneKey = useLanes ? String(ts.userId) : "all";
                            const subLaneInfo = blockLanesMap.get(laneKey)?.get(ts.id) ?? { subLane: 0, totalSubLanes: 1 };
                            const subWidthPct = userLaneWidthPct / subLaneInfo.totalSubLanes;
                            const leftPct = userLaneLeftPct + subLaneInfo.subLane * subWidthPct;
                            const widthPct = subWidthPct;

                            return (
                              <div
                                key={ts.id}
                                onClick={() => { setSelectedTimesheet(ts); setIsDialogOpen(true); }}
                                className={`absolute rounded text-label px-1 py-0.5 cursor-pointer overflow-hidden hover-elevate text-foreground${projColor ? "" : " bg-muted/60 border-l-2 border-border"}`}
                                style={projColor ? {
                                  top,
                                  height,
                                  left: `calc(${leftPct}% + ${INSET}px)`,
                                  width: `calc(${widthPct}% - ${INSET * 2}px)`,
                                  backgroundColor: hexToRgba(projColor, 0.15),
                                  borderLeft: `3px solid ${projColor}`,
                                } : {
                                  top,
                                  height,
                                  left: `calc(${leftPct}% + ${INSET}px)`,
                                  width: `calc(${widthPct}% - ${INSET * 2}px)`,
                                }}
                                title={`${getUserName(ts.userId)} — ${getProjectName(ts.projectId)}\n${ts.startTime}–${ts.endTime || ""} (${formatDuration(getNetHours(ts))})`}
                              >
                                {dotColor !== "transparent" && (
                                  <span
                                    className="absolute top-0.5 right-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: dotColor }}
                                  />
                                )}
                                <div className="font-bold truncate leading-tight pr-2">
                                  {getProjectName(ts.projectId)}
                                </div>
                                {height > 28 && (
                                  <div className="truncate leading-tight opacity-70">
                                    {getCostCodeName(ts.costCodeId)}
                                  </div>
                                )}
                                {height > 42 && (
                                  <div className="truncate leading-tight opacity-50">
                                    {ts.description}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    );
                  })}

                </div>
              </div>
            );
          })()
        ) : filteredTimesheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Clock className="w-10 h-10 text-muted-foreground/40" />
            <div className="text-sm text-muted-foreground">No timesheets found</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedTimesheet(undefined);
                setIsDialogOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Timesheet
            </Button>
          </div>
        ) : (
          <DataTable
            storageKey={TABLE_STORAGE_KEY}
            legacyConfigKey={LEGACY_STORAGE_KEY}
            data={filteredTimesheets}
            columns={timesheetColumns}
            rowKey={(t) => `timesheet-${t.id}`}
            onRowClick={(t) => {
              setSelectedTimesheet(t);
              setIsDialogOpen(true);
            }}
            rowClassName={(t) =>
              selectedTimesheets.includes(t.id) ? "bg-muted/30 dark:bg-muted/20" : ""
            }
            headerClassName="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
          />
        )}
      </div>

      {filteredTimesheets.length > 0 && (
        <div className="flex-none sticky bottom-0 z-50 border-t border-border bg-muted/30">
          {selectedTimesheets.length > 0 ? (
            <div className="flex items-center justify-between gap-4 px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-table">
                  {selectedTimesheets.length} selected
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <CircleCheck className="h-3.5 w-3.5 mr-1" />
                      Change Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => bulkActionMutation.mutate({ ids: selectedTimesheets, action: "changeStatus", status: "submitted" })}>
                      <div className="w-2 h-2 rounded-full mr-2 bg-muted-foreground" />
                      Submitted
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => bulkActionMutation.mutate({ ids: selectedTimesheets, action: "changeStatus", status: "approved" })}>
                      <div className="w-2 h-2 rounded-full mr-2 bg-green-500" />
                      Approved
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => bulkActionMutation.mutate({ ids: selectedTimesheets, action: "changeStatus", status: "rejected" })}>
                      <div className="w-2 h-2 rounded-full mr-2 bg-red-500" />
                      Rejected
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkActionMutation.isPending}
                      data-testid="button-bulk-delete-timesheets"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete {selectedTimesheets.length} timesheet{selectedTimesheets.length === 1 ? "" : "s"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the selected {selectedTimesheets.length === 1 ? "entry" : "entries"} and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-bulk-delete-cancel">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => bulkActionMutation.mutate({ ids: selectedTimesheets, action: "delete" })}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-bulk-delete-confirm"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedTimesheets([])}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            (() => {
              const submittedEntries = filteredTimesheets.filter(ts => ts.status === "submitted");
              const approvedEntries  = filteredTimesheets.filter(ts => ts.status === "approved");
              const rejectedEntries  = filteredTimesheets.filter(ts => ts.status === "rejected");
              const submittedHrs = submittedEntries.reduce((s, ts) => s + getNetHours(ts), 0);
              const approvedHrs  = approvedEntries.reduce((s, ts) => s + getNetHours(ts), 0);
              const rejectedHrs  = rejectedEntries.reduce((s, ts) => s + getNetHours(ts), 0);
              const totalHrs     = filteredTimesheets.reduce((s, ts) => s + getNetHours(ts), 0);
              const entryCount   = filteredTimesheets.length;
              return (
                <div className="flex items-center justify-between gap-4 h-11 px-4">
                  <span className="text-table text-muted-foreground">
                    {entryCount} {entryCount === 1 ? "entry" : "entries"}
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-data uppercase tracking-wider text-muted-foreground">Submitted</span>
                      <span className="text-table tabular-nums text-primary font-medium">
                        {submittedEntries.length} &middot; {formatDuration(submittedHrs)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-data uppercase tracking-wider text-muted-foreground">Approved</span>
                      <span className="text-table tabular-nums text-[hsl(var(--sage))] font-medium">
                        {approvedEntries.length} &middot; {formatDuration(approvedHrs)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-data uppercase tracking-wider text-muted-foreground">Rejected</span>
                      <span className="text-table tabular-nums text-[hsl(var(--coral))] font-medium">
                        {rejectedEntries.length} &middot; {formatDuration(rejectedHrs)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-data uppercase tracking-wider text-muted-foreground">Total</span>
                      <span className="text-table tabular-nums font-semibold text-foreground">
                        {formatDuration(totalHrs)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      <TimesheetDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        timesheet={selectedTimesheet}
        defaultProjectId={projectId}
        readonly={selectedTimesheet ? !canEditTimesheet(selectedTimesheet) : false}
      />

      <AlertDialog
        open={!!deleteCandidateId}
        onOpenChange={(o) => { if (!o) setDeleteCandidateId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this timesheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the entry and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-row-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteCandidateId) {
                  bulkActionMutation.mutate({ ids: [deleteCandidateId], action: "delete" });
                }
                setDeleteCandidateId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-row-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RapidApprovalModal
        open={isRapidApprovalOpen}
        onOpenChange={setIsRapidApprovalOpen}
        pendingTimesheets={pendingTimesheets}
        projects={projects}
        users={users}
        costCodes={costCodes}
      />

      <SubcontractorPODialog
        open={isSubPODialogOpen}
        onOpenChange={setIsSubPODialogOpen}
      />

      <TimesheetImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        projects={projects}
        users={users}
        costCodes={costCodes}
        defaultProjectId={projectId}
        onImported={() => queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] })}
      />
    </div>
  );
}
