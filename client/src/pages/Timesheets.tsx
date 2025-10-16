import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Plus, Clock, Filter, Search, Calendar as CalendarIcon, User, Check, X, Send, CalendarRange, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      const res = await apiRequest("POST", `/api/timesheets/${timesheetId}/submit`, {});
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
      const res = await apiRequest("POST", `/api/timesheets/${timesheetId}/approve`, {});
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
      const res = await apiRequest("POST", `/api/timesheets/${timesheetId}/reject`, {});
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

  // Get date range display text
  const getDateRangeText = (): string => {
    const range = getDateRange();
    if (!range) return "";
    return `${format(range.start, "dd MMM yyyy")} - ${format(range.end, "dd MMM yyyy")}`;
  };

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

  // Get status badge variant
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "draft":
        return "secondary";
      case "submitted":
        return "default";
      case "approved":
        return "default";
      case "rejected":
        return "destructive";
      default:
        return "secondary";
    }
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-timesheets">
            {currentProject ? `${currentProject.name} - Timesheets` : "Timesheets"}
          </h1>
          <p className="text-muted-foreground">Track and manage time entries</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={filteredTimesheets.length === 0}
            data-testid="button-export-timesheets"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button
            onClick={() => {
              setSelectedTimesheet(undefined);
              setIsDialogOpen(true);
            }}
            data-testid="button-add-timesheet"
          >
            <Clock className="w-4 h-4 mr-2" />
            Clock In
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            <div className={`grid gap-4 ${projectId ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-2 lg:grid-cols-5'}`}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-timesheets"
                  />
                </div>
              </div>

              {/* Only show project filter when not in project context */}
              {!projectId && (
                <div className="space-y-2">
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger data-testid="select-filter-project">
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
                </div>
              )}

              <div className="space-y-2">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger data-testid="select-filter-user">
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
              </div>

              <div className="space-y-2">
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger data-testid="select-filter-status">
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
              </div>

              <div className="space-y-2">
                <Select value={dateRangeType} onValueChange={(value) => {
                  setDateRangeType(value);
                  if (value !== "custom") {
                    setCustomStartDate(undefined);
                    setCustomEndDate(undefined);
                  }
                }}>
                  <SelectTrigger data-testid="select-filter-date-range">
                    <SelectValue placeholder="All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="this-week">This Week</SelectItem>
                    <SelectItem value="last-week">Last Week</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom Date Range Pickers */}
            {dateRangeType === "custom" && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-muted-foreground" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start" data-testid="button-start-date">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customStartDate ? format(customStartDate, "dd MMM yyyy") : "Start Date"}
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

                  <span className="text-muted-foreground">to</span>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start" data-testid="button-end-date">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customEndDate ? format(customEndDate, "dd MMM yyyy") : "End Date"}
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
              </div>
            )}

            {/* Date Range Display */}
            {dateRangeType !== "all" && dateRangeType !== "custom" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarRange className="w-4 h-4" />
                <span>{getDateRangeText()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timesheets Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Break</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTimesheets ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    Loading timesheets...
                  </TableCell>
                </TableRow>
              ) : filteredTimesheets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    No timesheets found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTimesheets.map((timesheet) => (
                  <TableRow
                    key={timesheet.id}
                    data-testid={`row-timesheet-${timesheet.id}`}
                    className="hover-elevate"
                  >
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {format(new Date(timesheet.date), "dd/MM/yyyy")}
                      </div>
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        {getUserName(timesheet.userId)}
                      </div>
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      {getProjectName(timesheet.projectId)}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      {timesheet.startTime && timesheet.endTime
                        ? `${timesheet.startTime} - ${timesheet.endTime}`
                        : "-"}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      {timesheet.breakDuration ? formatDuration(parseFloat(timesheet.breakDuration)) : "-"}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer font-medium"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      {formatDuration(parseFloat(timesheet.duration))}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      ${timesheet.hourlyRate ? parseFloat(timesheet.hourlyRate).toFixed(2) : "0.00"}/hr
                    </TableCell>
                    <TableCell
                      className="cursor-pointer font-medium"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      ${timesheet.total ? parseFloat(timesheet.total).toFixed(2) : "0.00"}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Badge
                        variant={getStatusBadgeVariant(timesheet.status)}
                        data-testid={`badge-status-${timesheet.status}`}
                        className={
                          timesheet.status === "submitted"
                            ? "bg-blue-500 hover:bg-blue-600"
                            : timesheet.status === "approved"
                            ? "bg-green-500 hover:bg-green-600"
                            : ""
                        }
                      >
                        {timesheet.status.charAt(0).toUpperCase() + timesheet.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="cursor-pointer max-w-xs truncate"
                      onClick={() => {
                        setSelectedTimesheet(timesheet);
                        setIsDialogOpen(true);
                      }}
                    >
                      {timesheet.description || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {timesheet.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              submitMutation.mutate(timesheet.id);
                            }}
                            data-testid={`button-submit-${timesheet.id}`}
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Submit
                          </Button>
                        )}
                        {timesheet.status === "submitted" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                approveMutation.mutate(timesheet.id);
                              }}
                              data-testid={`button-approve-${timesheet.id}`}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                rejectMutation.mutate(timesheet.id);
                              }}
                              data-testid={`button-reject-${timesheet.id}`}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TimesheetDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        timesheet={selectedTimesheet}
      />
    </div>
  );
}
