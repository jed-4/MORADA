import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Plus, Clock, Filter, Search, Calendar as CalendarIcon, User, Check, X, Send, CalendarRange, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, startOfWeek, endOfWeek, addWeeks, isWithinInterval, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimesheetDialog } from "@/components/TimesheetDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet, Project, User as UserType, CostCode } from "@shared/schema";

export default function Timesheets() {
  const { toast } = useToast();
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showInvoicedOnly, setShowInvoicedOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | undefined>();
  const [dateRangeType, setDateRangeType] = useState<string>("all");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();

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

  // Status workflow mutations
  const submitMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      const res = await apiRequest(`/api/timesheets/${timesheetId}/submit`, "POST", {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "timesheets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "labour-hours-budget"] });
      }
      toast({
        title: "Timesheet submitted",
        description: "The timesheet has been submitted for approval.",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      const res = await apiRequest(`/api/timesheets/${timesheetId}/approve`, "POST", {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "timesheets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "labour-hours-budget"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); // Refresh labour hours
      toast({
        title: "Timesheet approved",
        description: "The timesheet has been approved.",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      const res = await apiRequest(`/api/timesheets/${timesheetId}/reject`, "POST", {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "timesheets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "labour-hours-budget"] });
      }
      toast({
        title: "Timesheet rejected",
        description: "The timesheet has been rejected.",
      });
    },
  });

  // Get date range based on selection
  const getDateRange = (): { start: Date; end: Date } | null => {
    const now = new Date();
    
    switch (dateRangeType) {
      case "this-week":
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }), // Monday
          end: endOfWeek(now, { weekStartsOn: 1 }), // Sunday
        };
      case "last-week":
        const lastWeek = addWeeks(now, -1);
        return {
          start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
          end: endOfWeek(lastWeek, { weekStartsOn: 1 }),
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

  // Filter timesheets
  const filteredTimesheets = timesheets.filter((timesheet) => {
    const matchesSearch = searchTerm === "" || 
      timesheet.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = !projectId && selectedProjects.length > 0 
      ? selectedProjects.includes(timesheet.projectId) 
      : true;
    const matchesUser = selectedUsers.length > 0 
      ? selectedUsers.includes(timesheet.userId) 
      : true;
    const matchesStatus = selectedStatuses.length > 0 
      ? selectedStatuses.includes(timesheet.status) 
      : true;
    const matchesInvoiced = !showInvoicedOnly || timesheet.invoiced;

    // Date range filter
    const dateRange = getDateRange();
    const matchesDateRange = !dateRange || isWithinInterval(parseISO(timesheet.date as unknown as string), {
      start: dateRange.start,
      end: dateRange.end,
    });

    return matchesSearch && matchesProject && matchesUser && matchesStatus && matchesInvoiced && matchesDateRange;
  });

  // Get project name
  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  // Get user name
  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}`.trim() || user.username : "Unknown User";
  };

  // Format duration (decimal hours to HH:MM)
  const formatDuration = (hours: number | null) => {
    if (!hours) return "0:00";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  // Get current project if in project context
  const currentProject = projectId ? projects.find(p => p.id === projectId) : null;

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

  // Grid template with minimum widths
  const gridTemplate = "minmax(100px, 0.6fr) minmax(140px, 0.8fr) minmax(160px, 1fr) minmax(140px, 0.8fr) minmax(80px, 0.4fr) minmax(100px, 0.5fr) minmax(100px, 0.5fr) minmax(100px, 0.5fr) minmax(100px, 0.5fr) minmax(180px, 1fr) minmax(120px, 0.6fr)";

  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Title */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-border/50">
        <h1 className="text-sm font-semibold">
          {currentProject ? `${currentProject.name} - Timesheets` : "Timesheets"}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredTimesheets.length === 0}
            data-testid="button-export-timesheets"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelectedTimesheet(undefined);
              setIsDialogOpen(true);
            }}
            data-testid="button-add-timesheet"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Clock In
          </Button>
        </div>
      </div>

      {/* Row 2: Filters */}
      <div className="flex items-center gap-1.5 h-9 px-2 border-b border-border flex-shrink-0">
        {/* Left: Search + Filter Chips */}
        <div className="flex items-center gap-1.5 flex-1">
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

          {/* Project Filter (only if not in project context) */}
          {!projectId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-filter-project">
                  <span>Project</span>
                  {selectedProjects.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {selectedProjects.length}
                    </Badge>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {projects.map((project) => (
                  <DropdownMenuItem key={project.id} className="flex items-center">
                    <Checkbox
                      checked={selectedProjects.includes(project.id)}
                      onCheckedChange={() => {
                        const newProjects = selectedProjects.includes(project.id)
                          ? selectedProjects.filter(p => p !== project.id)
                          : [...selectedProjects, project.id];
                        setSelectedProjects(newProjects);
                      }}
                      className="mr-2"
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
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-filter-user">
                <span>User</span>
                {selectedUsers.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {selectedUsers.length}
                  </Badge>
                )}
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
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-filter-status">
                <span>Status</span>
                {selectedStatuses.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {selectedStatuses.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {[
                { key: "draft", name: "Draft" },
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

          {/* Date Range Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-filter-date">
                <CalendarRange className="w-3 h-3" />
                <span>
                  {dateRangeType === "all" ? "All Time" : 
                   dateRangeType === "this-week" ? "This Week" :
                   dateRangeType === "last-week" ? "Last Week" :
                   "Custom"}
                </span>
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
                  <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-start-date">
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
                  <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-end-date">
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
      </div>

      {/* Timesheets Grid */}
      <div className="flex-1 overflow-auto p-3">
        {loadingTimesheets ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">Loading timesheets...</div>
          </Card>
        ) : filteredTimesheets.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">No timesheets found</div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              {/* Header Row */}
              <div 
                className="grid items-center gap-4 px-4 h-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">User</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Project</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Time</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Break</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Rate</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Total</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Actions</div>
              </div>

              {/* Data Rows */}
              {filteredTimesheets.map((timesheet) => (
                <div 
                  key={timesheet.id}
                  className="grid items-center gap-4 px-4 h-10 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
                  style={{ gridTemplateColumns: gridTemplate }}
                  onClick={() => {
                    setSelectedTimesheet(timesheet);
                    setIsDialogOpen(true);
                  }}
                  data-testid={`row-timesheet-${timesheet.id}`}
                >
                  {/* Date */}
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {format(new Date(timesheet.date), "dd/MM/yy")}
                  </div>

                  {/* User */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {getUserName(timesheet.userId)}
                  </div>

                  {/* Project */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {getProjectName(timesheet.projectId)}
                  </div>

                  {/* Time */}
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {timesheet.startTime && timesheet.endTime
                      ? `${timesheet.startTime}-${timesheet.endTime}`
                      : "-"}
                  </div>

                  {/* Break */}
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {timesheet.breakDuration ? formatDuration(parseFloat(timesheet.breakDuration)) : "-"}
                  </div>

                  {/* Duration */}
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatDuration(parseFloat(timesheet.duration))}
                  </div>

                  {/* Rate */}
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    ${timesheet.hourlyRate ? parseFloat(timesheet.hourlyRate).toFixed(2) : "0.00"}/hr
                  </div>

                  {/* Total */}
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    ${timesheet.total ? parseFloat(timesheet.total).toFixed(2) : "0.00"}
                  </div>

                  {/* Status */}
                  <div>
                    {timesheet.status === "approved" ? (
                      <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 h-4 px-2 text-[10px]">
                        Approved
                      </Badge>
                    ) : timesheet.status === "submitted" ? (
                      <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 h-4 px-2 text-[10px]">
                        Submitted
                      </Badge>
                    ) : timesheet.status === "rejected" ? (
                      <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 h-4 px-2 text-[10px]">
                        Rejected
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="h-4 px-2 text-[10px]">
                        Draft
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {timesheet.description || "-"}
                  </div>

                  {/* Actions */}
                  <div onClick={(e) => e.stopPropagation()}>
                    {timesheet.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitMutation.mutate(timesheet.id)}
                        data-testid={`button-submit-${timesheet.id}`}
                        className="text-xs"
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Submit
                      </Button>
                    )}
                    {timesheet.status === "submitted" && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMutation.mutate(timesheet.id)}
                          data-testid={`button-approve-${timesheet.id}`}
                          className="text-xs text-green-600"
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectMutation.mutate(timesheet.id)}
                          data-testid={`button-reject-${timesheet.id}`}
                          className="text-xs text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <TimesheetDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        timesheet={selectedTimesheet}
        defaultProjectId={projectId}
      />
    </div>
  );
}
