import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Plus, Clock, Filter, Search, Calendar as CalendarIcon, User, Check, X, Send, CalendarRange, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [selectedProject, setSelectedProject] = useState<string>(projectId || "all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
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
    const matchesProject = selectedProject === "all" || timesheet.projectId === selectedProject;
    const matchesUser = selectedUser === "all" || timesheet.userId === selectedUser;
    const matchesStatus = selectedStatus === "all" || timesheet.status === selectedStatus;
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
      <div className="flex items-center gap-2 h-9 px-3 border-b border-border/50">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-timesheets"
            className="h-7 pl-8 text-sm"
          />
        </div>

        {!projectId && (
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger data-testid="select-filter-project" className="h-7 w-[180px] text-sm">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={selectedUser} onValueChange={setSelectedUser}>
          <SelectTrigger data-testid="select-filter-user" className="h-7 w-[160px] text-sm">
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {`${user.firstName} ${user.lastName}`.trim() || user.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger data-testid="select-filter-status" className="h-7 w-[140px] text-sm">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={dateRangeType} onValueChange={(value) => {
          setDateRangeType(value);
          if (value !== "custom") {
            setCustomStartDate(undefined);
            setCustomEndDate(undefined);
          }
        }}>
          <SelectTrigger data-testid="select-filter-date-range" className="h-7 w-[140px] text-sm">
            <SelectValue placeholder="All Time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="last-week">Last Week</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {dateRangeType === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-sm" data-testid="button-start-date">
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {customStartDate ? format(customStartDate, "dd MMM") : "Start"}
                </Button>
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
                <Button variant="outline" size="sm" className="text-sm" data-testid="button-end-date">
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {customEndDate ? format(customEndDate, "dd MMM") : "End"}
                </Button>
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
          </div>
        )}
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
