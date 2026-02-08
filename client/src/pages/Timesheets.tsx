import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Plus, Clock, Filter, Search, Calendar as CalendarIcon, User, Check, X, CalendarRange, Download, ChevronDown, Settings2, RotateCcw, Table2, Users2, CalendarDays, ChevronLeft, ChevronRight, Zap, Play, Square, ArrowUp, ArrowDown, CircleCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, startOfWeek, endOfWeek, addWeeks, isWithinInterval, parseISO, eachDayOfInterval, isSameDay, addDays, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, getDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimesheetDialog } from "@/components/TimesheetDialog";
import { RapidApprovalModal } from "@/components/RapidApprovalModal";
import { ProjectSelect } from "@/components/ProjectSelect";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Timesheet, Project, User as UserType, CostCode } from "@shared/schema";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";

// Column configuration type
interface TimesheetColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  width: number;
  minWidth: number;
}

const DEFAULT_COLUMNS: TimesheetColumnConfig[] = [
  { id: 'date', label: 'Date', visible: true, width: 70, minWidth: 60 },
  { id: 'user', label: 'User', visible: true, width: 100, minWidth: 80 },
  { id: 'project', label: 'Project', visible: true, width: 120, minWidth: 80 },
  { id: 'costCode', label: 'Cost Code', visible: true, width: 100, minWidth: 70 },
  { id: 'startTime', label: 'Start', visible: true, width: 60, minWidth: 50 },
  { id: 'endTime', label: 'End', visible: true, width: 60, minWidth: 50 },
  { id: 'break', label: 'Break', visible: true, width: 45, minWidth: 40 },
  { id: 'hours', label: 'Hours', visible: true, width: 50, minWidth: 45 },
  { id: 'rate', label: 'Rate', visible: true, width: 50, minWidth: 45 },
  { id: 'total', label: 'Total', visible: true, width: 60, minWidth: 50 },
  { id: 'labels', label: 'Labels', visible: true, width: 100, minWidth: 70 },
  { id: 'status', label: 'Status', visible: true, width: 70, minWidth: 60 },
  { id: 'description', label: 'Description', visible: true, width: 180, minWidth: 100 },
];

const COLUMNS_STORAGE_KEY = 'timesheets-columns-config';

type SortDirection = 'asc' | 'desc' | null;
const SORTABLE_COLUMNS = ['date', 'user', 'project', 'costCode', 'hours', 'status'];

function SortableColumnHeader({ 
  column, 
  children, 
  sortColumn, 
  sortDirection, 
  onSort,
  onResizeStart,
}: { 
  column: TimesheetColumnConfig; 
  children: React.ReactNode;
  sortColumn: string | null;
  sortDirection: SortDirection;
  onSort: (columnId: string) => void;
  onResizeStart: (e: React.PointerEvent, columnId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const wasDragged = useRef(false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: column.width,
    position: 'relative' as const,
  };

  const isSortable = SORTABLE_COLUMNS.includes(column.id);
  const isActive = sortColumn === column.id;

  const combinedOnPointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    wasDragged.current = false;
    if (listeners?.onPointerDown) {
      (listeners as any).onPointerDown(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerStart.current) {
      const dx = Math.abs(e.clientX - pointerStart.current.x);
      const dy = Math.abs(e.clientY - pointerStart.current.y);
      if (dx < 5 && dy < 5 && isSortable) {
        onSort(column.id);
      }
    }
    pointerStart.current = null;
  };

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className={`text-[10px] font-medium text-muted-foreground py-0.5 h-6 px-2 select-none group/resize ${column.id === 'total' ? 'text-right' : ''} ${isSortable ? 'cursor-pointer' : ''}`}
      {...attributes}
      {...listeners}
      onPointerDown={combinedOnPointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className={`inline-flex items-center gap-0.5 ${isActive ? 'text-foreground' : isSortable ? 'hover:text-foreground' : ''}`}>
        <span className="truncate">{children}</span>
        {isSortable && (
          <span className="w-2.5 h-2.5 inline-flex items-center justify-center flex-shrink-0">
            {isActive && sortDirection === 'asc' ? (
              <ArrowUp className="w-2.5 h-2.5" />
            ) : isActive && sortDirection === 'desc' ? (
              <ArrowDown className="w-2.5 h-2.5" />
            ) : null}
          </span>
        )}
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize opacity-0 group-hover/resize:opacity-100 hover:!opacity-100 transition-opacity z-10"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResizeStart(e, column.id);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute right-0 top-1 bottom-1 w-[2px] bg-border hover:bg-primary transition-colors" />
      </div>
    </TableHead>
  );
}

export default function Timesheets() {
  const { toast } = useToast();
  const { user } = useAuth();
  const weekStartDay = useWeekStartDay();
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Permission check for editing timesheets
  const canEditTimesheet = (timesheet: Timesheet): boolean => {
    if (!user) return false;
    // User can edit their own timesheets
    if (timesheet.userId === user.id) return true;
    // Admins, owners, and managers can edit all timesheets
    if (user.role === "owner" || user.role === "admin" || user.role === "manager") return true;
    return false;
  };
  const [selectedTimesheets, setSelectedTimesheets] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [showInvoicedOnly, setShowInvoicedOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRapidApprovalOpen, setIsRapidApprovalOpen] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | undefined>();
  const [dateRangeType, setDateRangeType] = useState<string>("all");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  
  // View state: table, weekly, calendar
  const [activeView, setActiveView] = useState<"table" | "weekly" | "calendar">("table");
  
  // Weekly view state
  const [weeklyViewDate, setWeeklyViewDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  
  // Calendar view state
  const [calendarWeek, setCalendarWeek] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));

  // Clock-in state
  const [isClockInOpen, setIsClockInOpen] = useState(false);
  const [clockInProjectId, setClockInProjectId] = useState<string>("");
  const [clockInCostCodeId, setClockInCostCodeId] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");

  // Sort state
  const [sortColumn, setSortColumn] = useState<string | null>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortColumn(null); setSortDirection(null); }
      else { setSortDirection('asc'); }
    } else {
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  };

  // Column configuration state
  const [columns, setColumns] = useState<TimesheetColumnConfig[]>(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (saved) {
        let parsed = JSON.parse(saved) as TimesheetColumnConfig[];
        const hasOldTimeColumn = parsed.some(c => c.id === 'time');
        const hasNewStartTime = parsed.some(c => c.id === 'startTime');
        if (hasOldTimeColumn && !hasNewStartTime) {
          return DEFAULT_COLUMNS;
        }
        const validIds = new Set(DEFAULT_COLUMNS.map(dc => dc.id));
        parsed = parsed.filter(c => validIds.has(c.id));
        const missingCols = DEFAULT_COLUMNS.filter(dc => !parsed.some(p => p.id === dc.id));
        if (missingCols.length > 0) {
          const projectIdx = parsed.findIndex(c => c.id === 'project');
          const insertAt = projectIdx >= 0 ? projectIdx + 1 : 3;
          parsed = [...parsed.slice(0, insertAt), ...missingCols, ...parsed.slice(insertAt)];
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load column config:', e);
    }
    return DEFAULT_COLUMNS;
  });

  // Save columns to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
    } catch (e) {
      console.error('Failed to save column config:', e);
    }
  }, [columns]);

  // Column resize state
  const resizeRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((e: React.PointerEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const col = columns.find(c => c.id === columnId);
    if (!col) return;
    resizeRef.current = { columnId, startX: e.clientX, startWidth: col.width };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columns]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (!resizeRef.current) return;
      const { columnId, startX, startWidth } = resizeRef.current;
      const delta = e.clientX - startX;
      const col = columns.find(c => c.id === columnId);
      const min = col?.minWidth || 40;
      const newWidth = Math.max(min, Math.min(600, startWidth + delta));
      setColumns(prev => prev.map(c => c.id === columnId ? { ...c, width: newWidth } : c));
    };
    const handleEnd = () => {
      resizeRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
    document.addEventListener('pointercancel', handleEnd);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
      document.removeEventListener('pointercancel', handleEnd);
    };
  }, [isResizing, columns, setColumns]);

  // Toggle column visibility
  const toggleColumnVisibility = (columnId: string) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };

  // Reset columns to default
  const resetColumns = () => {
    setColumns(DEFAULT_COLUMNS);
    toast({
      title: "Columns reset",
      description: "Column settings have been reset to defaults.",
    });
  };

  // Get visible columns
  const visibleColumns = columns.filter(col => col.visible);

  // DnD sensors for column reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((prev) => {
        const oldIndex = prev.findIndex((col) => col.id === active.id);
        const newIndex = prev.findIndex((col) => col.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

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
    onSuccess: async (res: Response, variables) => {
      const result = await res.json();
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
    const matchesInvoiced = !showInvoicedOnly || timesheet.invoiced;

    // Date range filter
    const dateRange = getDateRange();
    const matchesDateRange = !dateRange || isWithinInterval(parseISO(timesheet.date as unknown as string), {
      start: dateRange.start,
      end: dateRange.end,
    });

    return matchesSearch && matchesProject && matchesUser && matchesStatus && matchesPhase && matchesInvoiced && matchesDateRange;
  }).sort((a, b) => {
    if (!sortColumn || !sortDirection) return 0;
    let cmp = 0;
    switch (sortColumn) {
      case 'date':
        cmp = new Date(a.date as unknown as string).getTime() - new Date(b.date as unknown as string).getTime();
        break;
      case 'user':
        cmp = getUserName(a.userId).localeCompare(getUserName(b.userId));
        break;
      case 'project':
        cmp = getProjectName(a.projectId).localeCompare(getProjectName(b.projectId));
        break;
      case 'costCode':
        cmp = getCostCodeName(a.costCodeId).localeCompare(getCostCodeName(b.costCodeId));
        break;
      case 'hours':
        cmp = getNetHours(a) - getNetHours(b);
        break;
      case 'status': {
        cmp = a.status.localeCompare(b.status);
        break;
      }
    }
    return sortDirection === 'desc' ? -cmp : cmp;
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

  return (
    <div className="flex flex-col h-full">
      {/* Header Panel - 2 rows connected to content */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        {/* Row 1: Title + Action Buttons */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
        <h1 className="text-sm font-semibold">
          {currentProject ? `${currentProject.name} - Timesheets` : "All Items - Timesheets"}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={filteredTimesheets.length === 0}
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
            data-testid="button-export-timesheets"
            title="Export to Excel"
          >
            <Download className="w-3 h-3" />
          </button>
          {canApproveTimesheets && pendingTimesheets.length > 0 && (
            <button
              onClick={() => setIsRapidApprovalOpen(true)}
              className="h-6 w-auto px-2 text-xs border rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 active-elevate-2 flex items-center gap-0.5"
              data-testid="button-rapid-approval"
            >
              <Zap className="w-3 h-3" />
              Approve ({pendingTimesheets.length})
            </button>
          )}
          {activeTimesheet ? (
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
          ) : (
            <Popover open={isClockInOpen} onOpenChange={setIsClockInOpen}>
              <PopoverTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md bg-green-600 text-white border-green-600/20 hover:bg-green-700 active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-clock-in"
                >
                  <Play className="w-3 h-3" />
                  Clock In
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Start Timer</h4>
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
                    <label className="text-xs font-medium mb-1 block">
                      Cost Code (Optional)
                    </label>
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
              </PopoverContent>
            </Popover>
          )}
          <button
            onClick={() => {
              setSelectedTimesheet(undefined);
              setIsDialogOpen(true);
            }}
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            data-testid="button-add-timesheet"
          >
            <Plus className="w-3 h-3" />
            Add Entry
          </button>
        </div>
      </div>

        {/* Row 2: Filters */}
        <div className="h-8 flex items-center gap-2 px-3">
        {/* Left: Search + Filter Chips */}
        <div className="flex items-center gap-2 flex-1">
          {/* Search */}
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
          
          <div className="w-px h-4 bg-border" />

          {/* Project Filter (only if not in project context) */}
          {!projectId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className={`h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5 ${
                    selectedProjects.length > 0 
                      ? "bg-[#bba7db]/10 text-[#8b7ab8] border-[#bba7db]/40" 
                      : ""
                  }`}
                  data-testid="button-filter-project"
                >
                  <span>Project</span>
                  {selectedProjects.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-[#bba7db]/20 text-[#8b7ab8]">
                      {selectedProjects.length}
                    </Badge>
                  )}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    className="flex items-center"
                    onSelect={(e) => {
                      e.preventDefault();
                      const newProjects = selectedProjects.includes(project.id)
                        ? selectedProjects.filter(p => p !== project.id)
                        : [...selectedProjects, project.id];
                      setSelectedProjects(newProjects);
                    }}
                  >
                    <Checkbox
                      checked={selectedProjects.includes(project.id)}
                      className="mr-2 pointer-events-none"
                    />
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* User Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={`h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5 ${
                  selectedUsers.length > 0 
                    ? "bg-[#bba7db]/10 text-[#8b7ab8] border-[#bba7db]/40" 
                    : ""
                }`}
                data-testid="button-filter-user"
              >
                <span>User</span>
                {selectedUsers.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-[#bba7db]/20 text-[#8b7ab8]">
                    {selectedUsers.length}
                  </Badge>
                )}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {users.map((user) => (
                <DropdownMenuItem key={user.id} className="flex items-center">
                  <Checkbox
                    checked={selectedUsers.includes(user.id)}
                    onCheckedChange={() => {
                      const newUsers = selectedUsers.includes(user.id)
                        ? selectedUsers.filter(u => u !== user.id)
                        : [...selectedUsers, user.id];
                      setSelectedUsers(newUsers);
                    }}
                    className="mr-2"
                  />
                  {`${user.firstName} ${user.lastName}`.trim() || user.username}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={`h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5 ${
                  selectedStatuses.length > 0 
                    ? "bg-[#bba7db]/10 text-[#8b7ab8] border-[#bba7db]/40" 
                    : ""
                }`}
                data-testid="button-filter-status"
              >
                <span>Status</span>
                {selectedStatuses.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-[#bba7db]/20 text-[#8b7ab8]">
                    {selectedStatuses.length}
                  </Badge>
                )}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {[
                { key: "submitted", name: "Submitted" },
                { key: "approved", name: "Approved" },
                { key: "rejected", name: "Rejected" },
              ].map((status) => (
                <DropdownMenuItem key={status.key} className="flex items-center">
                  <Checkbox
                    checked={selectedStatuses.includes(status.key)}
                    onCheckedChange={() => {
                      const newStatuses = selectedStatuses.includes(status.key)
                        ? selectedStatuses.filter(s => s !== status.key)
                        : [...selectedStatuses, status.key];
                      setSelectedStatuses(newStatuses);
                    }}
                    className="mr-2"
                  />
                  {status.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Phase Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={`h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5 ${
                  selectedPhases.length > 0 
                    ? "bg-[#bba7db]/10 text-[#8b7ab8] border-[#bba7db]/40" 
                    : ""
                }`}
                data-testid="button-filter-phase"
              >
                <span>Phase</span>
                {selectedPhases.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-[#bba7db]/20 text-[#8b7ab8]">
                    {selectedPhases.length}
                  </Badge>
                )}
                <ChevronDown className="w-3 h-3 opacity-50" />
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
                <DropdownMenuItem key={phase.key} className="flex items-center">
                  <Checkbox
                    checked={selectedPhases.includes(phase.key)}
                    onCheckedChange={() => {
                      const newPhases = selectedPhases.includes(phase.key)
                        ? selectedPhases.filter(p => p !== phase.key)
                        : [...selectedPhases, phase.key];
                      setSelectedPhases(newPhases);
                    }}
                    className="mr-2"
                  />
                  {phase.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Date Range Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={`h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5 ${
                  dateRangeType !== "all" 
                    ? "bg-[#bba7db]/10 text-[#8b7ab8] border-[#bba7db]/40" 
                    : ""
                }`}
                data-testid="button-filter-date"
              >
                <CalendarRange className="w-3 h-3" />
                <span>
                  {dateRangeType === "all" ? "All Time" : 
                   dateRangeType === "this-week" ? "This Week" :
                   dateRangeType === "last-week" ? "Last Week" :
                   "Custom"}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => {
                setDateRangeType("all");
                setCustomStartDate(undefined);
                setCustomEndDate(undefined);
              }}>
                All Time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateRangeType("this-week")}>
                This Week
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateRangeType("last-week")}>
                Last Week
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateRangeType("custom")}>
                Custom Range
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Custom Date Range Pickers */}
          {dateRangeType === "custom" && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-start-date">
                    <CalendarIcon className="w-3 h-3" />
                    <span>{customStartDate ? format(customStartDate, "dd MMM") : "Start"}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <span className="text-xs text-muted-foreground">to</span>

              <Popover>
                <PopoverTrigger asChild>
                  <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-end-date">
                    <CalendarIcon className="w-3 h-3" />
                    <span>{customEndDate ? format(customEndDate, "dd MMM") : "End"}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>

        {/* Right: View Tabs + Columns */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setActiveView("table")}
              className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'table' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2 flex items-center gap-0.5`}
              data-testid="button-view-table"
            >
              <Table2 className="w-3 h-3" />
              Table
            </button>
            <button
              onClick={() => setActiveView("weekly")}
              className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'weekly' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2 flex items-center gap-0.5`}
              data-testid="button-view-weekly"
            >
              <Users2 className="w-3 h-3" />
              Weekly
            </button>
            <button
              onClick={() => setActiveView("calendar")}
              className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'calendar' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2 flex items-center gap-0.5`}
              data-testid="button-view-calendar"
            >
              <CalendarDays className="w-3 h-3" />
              Calendar
            </button>
          </div>

          <div className="w-px h-4 bg-border" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="button-column-settings"
              >
                <Settings2 className="w-3 h-3" />
                Columns
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {columns.map((col) => (
                <DropdownMenuItem
                  key={col.id}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleColumnVisibility(col.id);
                  }}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    checked={col.visible}
                    onCheckedChange={() => toggleColumnVisibility(col.id)}
                    className="pointer-events-none"
                  />
                  <span className="text-xs">{col.label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={resetColumns}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="text-xs">Reset to defaults</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
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
                    <TableHead className="text-[10px] font-medium text-muted-foreground w-[140px] px-2">Team Member</TableHead>
                    {weekDays.map((day) => (
                      <TableHead key={day.toISOString()} className="text-[10px] font-medium text-muted-foreground text-center w-[70px] px-1">
                        <div>{format(day, "EEE")}</div>
                        <div className="text-[9px]">{format(day, "dd/MM")}</div>
                      </TableHead>
                    ))}
                    <TableHead className="text-[10px] font-medium text-muted-foreground text-center w-[70px] px-2 bg-muted/50">Total</TableHead>
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
                        <TableCell className="text-[11px] font-medium px-2 py-1 truncate max-w-[140px]">
                          {user.userName}
                        </TableCell>
                        {weekDays.map((day) => {
                          const dayKey = format(day, "yyyy-MM-dd");
                          const hours = user.dailyHours.get(dayKey) || 0;
                          return (
                            <TableCell key={dayKey} className="text-[11px] text-center tabular-nums px-1 py-1">
                              {hours > 0 ? (
                                <span className={hours >= 8 ? "font-medium text-green-600 dark:text-green-400" : ""}>
                                  {formatDuration(hours)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-[11px] font-semibold text-center tabular-nums px-2 py-1 bg-muted/30">
                          {formatDuration(user.totalHours)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Totals Row */}
                  {weeklySummary.length > 0 && (
                    <TableRow className="h-7 bg-muted/20 border-t-2 border-border">
                      <TableCell className="text-[10px] font-semibold px-2 py-1">TOTAL</TableCell>
                      {weekDays.map((day) => {
                        const dayKey = format(day, "yyyy-MM-dd");
                        const dayTotal = weeklySummary.reduce((sum, user) => sum + (user.dailyHours.get(dayKey) || 0), 0);
                        return (
                          <TableCell key={dayKey} className="text-[10px] font-semibold text-center tabular-nums px-1 py-1">
                            {dayTotal > 0 ? formatDuration(dayTotal) : "-"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-[10px] font-bold text-center tabular-nums px-2 py-1 bg-muted/50">
                        {formatDuration(weeklySummary.reduce((sum, user) => sum + user.totalHours, 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : activeView === "calendar" ? (
          /* Calendar Week View - Per User */
          (() => {
            const calendarDays = eachDayOfInterval({
              start: calendarWeek,
              end: addDays(calendarWeek, 6)
            });
            
            // Get timesheets for this calendar week
            const weekEnd = addDays(calendarWeek, 6);
            const calendarTimesheets = filteredTimesheets.filter(ts => {
              const tsDate = new Date(ts.date);
              return tsDate >= calendarWeek && tsDate <= weekEnd;
            });
            
            // Group by user for this week
            const userCalendarMap = new Map<string, { userId: string; userName: string; dailyTimesheets: Map<string, Timesheet[]> }>();
            
            calendarTimesheets.forEach(ts => {
              const userId = ts.userId;
              const userName = getUserName(userId);
              const tsDate = format(new Date(ts.date), "yyyy-MM-dd");
              
              if (!userCalendarMap.has(userId)) {
                userCalendarMap.set(userId, {
                  userId,
                  userName,
                  dailyTimesheets: new Map(),
                });
              }
              
              const user = userCalendarMap.get(userId)!;
              if (!user.dailyTimesheets.has(tsDate)) {
                user.dailyTimesheets.set(tsDate, []);
              }
              user.dailyTimesheets.get(tsDate)!.push(ts);
            });
            
            const calendarUsers = Array.from(userCalendarMap.values()).sort((a, b) => a.userName.localeCompare(b.userName));
            
            return (
              <div className="p-3">
                {/* Week Navigation */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
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
                      {format(calendarWeek, "dd MMM")} - {format(addDays(calendarWeek, 6), "dd MMM yyyy")}
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
                </div>

                {/* Week Calendar Grid - User Rows */}
                <div className="border border-border rounded-md overflow-hidden">
                  {/* Day Headers */}
                  <div className="grid grid-cols-8 bg-muted/30 dark:bg-muted/10 border-b-2 border-border">
                    <div className="text-[10px] font-medium text-muted-foreground px-2 py-2 border-r border-border">
                      Team Member
                    </div>
                    {calendarDays.map((day) => {
                      const isToday = isSameDay(day, new Date());
                      return (
                        <div 
                          key={day.toISOString()} 
                          className={`text-[10px] font-medium text-center py-1.5 border-r border-border last:border-r-0 ${
                            isToday ? "bg-blue-50 dark:bg-blue-900/20" : ""
                          }`}
                        >
                          <div className={isToday ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}>
                            {format(day, "EEE")}
                          </div>
                          <div className={`text-[9px] ${isToday ? "text-blue-600 dark:text-blue-400 font-semibold" : ""}`}>
                            {format(day, "dd/MM")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* User Rows */}
                  {calendarUsers.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No timesheets for this week
                    </div>
                  ) : (
                    calendarUsers.map((user) => (
                      <div key={user.userId} className="grid grid-cols-8 border-b border-border last:border-b-0">
                        <div className="text-[11px] font-medium px-2 py-2 border-r border-border truncate flex items-start">
                          {user.userName}
                        </div>
                        {calendarDays.map((day) => {
                          const dayKey = format(day, "yyyy-MM-dd");
                          const dayTimesheets = user.dailyTimesheets.get(dayKey) || [];
                          const isToday = isSameDay(day, new Date());
                          const dayTotal = dayTimesheets.reduce((sum, ts) => sum + getNetHours(ts), 0);
                          
                          return (
                            <div 
                              key={dayKey} 
                              className={`min-h-[60px] border-r border-border last:border-r-0 p-1 ${
                                isToday ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                              }`}
                            >
                              {dayTimesheets.map((ts) => (
                                <div
                                  key={ts.id}
                                  onClick={() => {
                                    setSelectedTimesheet(ts);
                                    setIsDialogOpen(true);
                                  }}
                                  className={`text-[9px] px-1 py-0.5 mb-0.5 rounded cursor-pointer truncate ${
                                    ts.status === "approved" 
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                      : ts.status === "submitted"
                                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                                      : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                  }`}
                                  title={`${ts.startTime || ""}-${ts.endTime || ""}: ${formatDuration(getNetHours(ts))}`}
                                >
                                  {ts.startTime ? `${ts.startTime}` : ""} {formatDuration(getNetHours(ts))}
                                </div>
                              ))}
                              {dayTotal > 0 && dayTimesheets.length > 0 && (
                                <div className="text-[8px] text-muted-foreground text-right mt-0.5">
                                  {formatDuration(dayTotal)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
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
          <div className="overflow-x-auto" style={{ overscrollBehaviorX: 'contain' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <Table style={{ tableLayout: 'fixed', width: visibleColumns.reduce((sum, c) => sum + c.width, 0) + 40 }}>
                <TableHeader>
                  <TableRow className="h-6 bg-muted/30 dark:bg-muted/10 hover:bg-muted/30 dark:hover:bg-muted/10 border-b border-border">
                    <TableHead className="w-8 px-2 py-0.5 h-6">
                      <Checkbox
                        checked={selectedTimesheets.length > 0 && selectedTimesheets.length === filteredTimesheets.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTimesheets(filteredTimesheets.map(t => t.id));
                          } else {
                            setSelectedTimesheets([]);
                          }
                        }}
                        className="h-3.5 w-3.5"
                      />
                    </TableHead>
                    <SortableContext items={visibleColumns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                      {visibleColumns.map((col) => (
                        <SortableColumnHeader key={col.id} column={col} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} onResizeStart={handleResizeStart}>
                          {col.label}
                        </SortableColumnHeader>
                      ))}
                    </SortableContext>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTimesheets.map((timesheet, index) => (
                    <TableRow 
                      key={timesheet.id}
                      className={`h-6 cursor-pointer hover:bg-muted/20 dark:hover:bg-muted/10 transition-colors ${
                        index !== filteredTimesheets.length - 1 ? "border-b border-border" : ""
                      } ${selectedTimesheets.includes(timesheet.id) ? "bg-muted/30 dark:bg-muted/20" : ""}`}
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                      data-testid={`row-timesheet-${timesheet.id}`}
                    >
                      <TableCell className="w-8 px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedTimesheets.includes(timesheet.id)}
                          onCheckedChange={() => {
                            setSelectedTimesheets(current =>
                              current.includes(timesheet.id)
                                ? current.filter(id => id !== timesheet.id)
                                : [...current, timesheet.id]
                            );
                          }}
                          className="h-3.5 w-3.5"
                        />
                      </TableCell>
                      {visibleColumns.map((col) => {
                        const cellStyle = { width: col.width };
                        switch (col.id) {
                          case 'date':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] font-medium px-2 py-1 truncate">
                                {format(new Date(timesheet.date), "dd MMM")}
                              </TableCell>
                            );
                          case 'user':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] truncate px-2 py-1">
                                {getUserName(timesheet.userId)}
                              </TableCell>
                            );
                          case 'project':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] truncate text-muted-foreground px-2 py-1">
                                {getProjectName(timesheet.projectId)}
                              </TableCell>
                            );
                          case 'costCode':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] truncate text-muted-foreground px-2 py-1">
                                {getCostCodeName(timesheet.costCodeId)}
                              </TableCell>
                            );
                          case 'startTime':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] text-muted-foreground tabular-nums px-2 py-1">
                                {timesheet.startTime || "-"}
                              </TableCell>
                            );
                          case 'endTime':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] text-muted-foreground tabular-nums px-2 py-1">
                                {timesheet.endTime || "-"}
                              </TableCell>
                            );
                          case 'break':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] text-muted-foreground tabular-nums px-2 py-1">
                                {timesheet.breakDuration ? formatDuration(parseFloat(timesheet.breakDuration)) : "-"}
                              </TableCell>
                            );
                          case 'hours':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] font-medium tabular-nums px-2 py-1">
                                {formatDuration(getNetHours(timesheet))}
                              </TableCell>
                            );
                          case 'rate':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] text-muted-foreground tabular-nums px-2 py-1">
                                ${timesheet.hourlyRate ? parseFloat(timesheet.hourlyRate).toFixed(0) : "0"}
                              </TableCell>
                            );
                          case 'total':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] font-semibold text-right tabular-nums px-2 py-1">
                                ${timesheet.total ? parseFloat(timesheet.total).toFixed(2) : "0.00"}
                              </TableCell>
                            );
                          case 'labels':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="px-2 py-1 overflow-hidden">
                                {Array.isArray(timesheet.labels) && (timesheet.labels as string[]).length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {(timesheet.labels as string[]).map((label, i) => (
                                      <Badge key={i} variant="secondary" className="text-[10px] font-medium">
                                        {label}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground/50">&mdash;</span>
                                )}
                              </TableCell>
                            );
                          case 'status':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="px-2 py-1">
                                {timesheet.status === "approved" ? (
                                  <Badge variant="outline" className="text-[10px] font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                                    Approved
                                  </Badge>
                                ) : timesheet.status === "submitted" ? (
                                  <Badge variant="outline" className="text-[10px] font-medium bg-slate-50 dark:bg-slate-900/20 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800">
                                    Submitted
                                  </Badge>
                                ) : timesheet.status === "rejected" ? (
                                  <Badge variant="outline" className="text-[10px] font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
                                    Rejected
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] font-medium">
                                    {timesheet.status}
                                  </Badge>
                                )}
                              </TableCell>
                            );
                          case 'description':
                            return (
                              <TableCell key={col.id} style={cellStyle} className="text-[11px] text-muted-foreground truncate px-2 py-1">
                                {timesheet.description || "-"}
                              </TableCell>
                            );
                          default:
                            return null;
                        }
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DndContext>
          </div>
        )}
      </div>

      {filteredTimesheets.length > 0 && (
        <div className="sticky bottom-0 z-50 border-t border-border bg-card">
          {selectedTimesheets.length > 0 ? (
            <div className="flex items-center justify-between gap-4 px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[11px]">
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
                      <div className="w-2 h-2 rounded-full mr-2 bg-slate-500" />
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkActionMutation.mutate({ ids: selectedTimesheets, action: "delete" })}
                  disabled={bulkActionMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
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
            <div className="flex items-center justify-end gap-4 px-3 py-2">
              {(() => {
                const statusGroups = [
                  { key: "submitted", label: "Submitted", bgClass: "bg-slate-100 dark:bg-slate-800", textClass: "text-slate-700 dark:text-slate-300" },
                  { key: "approved", label: "Approved", bgClass: "bg-green-100 dark:bg-green-900/30", textClass: "text-green-700 dark:text-green-300" },
                  { key: "rejected", label: "Rejected", bgClass: "bg-red-100 dark:bg-red-900/30", textClass: "text-red-700 dark:text-red-300" },
                ];
                return (
                  <>
                    {statusGroups.map(({ key, label, bgClass, textClass }) => {
                      const entries = filteredTimesheets.filter(ts => ts.status === key);
                      const totalHours = entries.reduce((sum, ts) => sum + getNetHours(ts), 0);
                      return (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${bgClass} ${textClass}`}>
                            {label}
                          </span>
                          <span className="text-[11px] font-medium tabular-nums text-foreground">
                            {formatDuration(totalHours)}
                          </span>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
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

      <RapidApprovalModal
        open={isRapidApprovalOpen}
        onOpenChange={setIsRapidApprovalOpen}
        pendingTimesheets={pendingTimesheets}
        projects={projects}
        users={users}
        costCodes={costCodes}
      />
    </div>
  );
}
